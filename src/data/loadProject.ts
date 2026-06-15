// Adapter: real dbt artifacts -> the app's DbtProject domain model.
//
// dbt emits everything we need into `target/` on every invocation:
//   - manifest.json     the DAG: models + sources, deps, config.meta, …
//   - run_results.json  per-invocation execution timing & status (models)
//   - sources.json      `dbt source freshness` output (when sources arrived)
//
// This file is the one seam between "where the data comes from" and the
// rest of the app, which only ever sees a DbtProject (see src/app/store.tsx).
// The core `loadProject(manifest, history)` is pure and unit-testable;
// `loadProjectFromFixtures()` is the Vite-flavored wrapper that slurps the
// bundled sample artifacts under fixtures/dbt/.

import type {
  DbtModel,
  DbtProject,
  Materialization,
  ModelLayer,
  ModelRun,
  ProjectRun,
  RunStatus,
  Sla,
} from "@/types/dbt";

// ----------------------------------------------------------------------------
// Raw artifact shapes (the subset of dbt's JSON we actually read).
// Everything is intentionally permissive — these mirror parsed JSON, so we
// keep them loose and normalize on the way in.
// ----------------------------------------------------------------------------

interface RawDependsOn {
  nodes?: string[];
  macros?: string[];
}

interface RawConfig {
  materialized?: string;
  meta?: Record<string, unknown> & { sla?: string; owner?: string };
  tags?: string[];
}

export interface RawNode {
  unique_id: string;
  resource_type: string; // "model" | "source" | "seed" | "snapshot" | …
  name: string;
  schema?: string;
  database?: string;
  fqn?: string[];
  path?: string;
  original_file_path?: string;
  tags?: string[];
  description?: string;
  group?: string;
  config?: RawConfig;
  meta?: Record<string, unknown>; // sources carry meta at the top level too
  depends_on?: RawDependsOn;
}

export interface RawManifest {
  metadata?: { project_name?: string };
  nodes?: Record<string, RawNode>;
  sources?: Record<string, RawNode>;
}

interface RawTiming {
  name: string; // "compile" | "execute"
  started_at?: string | null;
  completed_at?: string | null;
}

export interface RawRunResult {
  unique_id: string;
  status: string; // "success" | "error" | "skipped" | "pass" | "fail" | "runtime error" | …
  execution_time?: number;
  adapter_response?: { rows_affected?: number | null } | null;
  timing?: RawTiming[];
  // sources.json freshness rows carry the arrival timestamp here:
  max_loaded_at?: string | null;
}

export interface RawRunResults {
  metadata?: { generated_at?: string; invocation_id?: string };
  results: RawRunResult[];
}

/** One logical day's artifacts: the model run plus (optionally) source freshness. */
export interface DailyArtifacts {
  /** Explicit logical date "YYYY-MM-DD". Falls back to run_results metadata. */
  date?: string;
  runResults: RawRunResults;
  sources?: RawRunResults;
}

// ----------------------------------------------------------------------------
// Small mapping helpers
// ----------------------------------------------------------------------------

/**
 * "05:30" -> minutes after midnight (330). Tolerant of "5:30" and "05:30 UTC";
 * returns NaN for out-of-range times like "09:99" (so typos surface as errors
 * rather than silently becoming a wrong SLA). Hours allow up to 47 for
 * past-midnight landings.
 */
export function hhmmToMinutes(s: string): number {
  const m = /(\d{1,2}):(\d{2})/.exec(s.trim());
  if (!m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (mm > 59 || hh > 47) return NaN;
  return hh * 60 + mm;
}

/** Classify a node into the app's four layers. Prefers explicit tags, then names. */
function layerOf(node: RawNode): ModelLayer {
  if (node.resource_type === "source") return "source";
  const tags = [...(node.tags ?? []), ...(node.config?.tags ?? [])];
  if (tags.includes("staging")) return "staging";
  if (tags.includes("intermediate")) return "intermediate";
  if (tags.includes("marts")) return "marts";
  // Fall back to dbt naming conventions (stg_/int_) on fqn or path.
  const hay = node.fqn?.join("/") ?? node.path ?? node.name;
  if (/(^|[._/-])stg_|\/staging\//.test(hay)) return "staging";
  if (/(^|[._/-])int_|\/intermediate\//.test(hay)) return "intermediate";
  return "marts";
}

const KNOWN_MATERIALIZATIONS: Materialization[] = [
  "view",
  "table",
  "incremental",
  "ephemeral",
  "source",
];

function materializationOf(node: RawNode): Materialization {
  if (node.resource_type === "source") return "source";
  const m = node.config?.materialized;
  return (KNOWN_MATERIALIZATIONS as string[]).includes(m ?? "")
    ? (m as Materialization)
    : "table";
}

function metaOf(node: RawNode): Record<string, unknown> {
  return { ...(node.meta ?? {}), ...(node.config?.meta ?? {}) };
}

function ownerOf(node: RawNode): string {
  const meta = metaOf(node);
  return (meta.owner as string) ?? node.group ?? "—";
}

function normalizeStatus(raw: string): RunStatus {
  const s = raw.toLowerCase();
  if (s === "success" || s === "pass") return "success";
  if (s === "skipped") return "skipped";
  return "error"; // error, fail, "runtime error", etc.
}

/** The execute phase's wall-clock window, if present. */
function executeTiming(r: RawRunResult): { start?: number; end?: number } {
  const exec = r.timing?.find((t) => t.name === "execute");
  const start = exec?.started_at ? Date.parse(exec.started_at) : undefined;
  const end = exec?.completed_at ? Date.parse(exec.completed_at) : undefined;
  return {
    start: Number.isFinite(start) ? start : undefined,
    end: Number.isFinite(end) ? end : undefined,
  };
}

/** 00:00 UTC epoch ms for a "YYYY-MM-DD" string. */
function midnightUtc(dateStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, mo - 1, d);
}

/** Derive the logical run date (its reference midnight) from available signals. */
function runDateOf(day: DailyArtifacts): number {
  if (day.date) return midnightUtc(day.date);
  const gen = day.runResults.metadata?.generated_at;
  const ts = gen ? Date.parse(gen) : NaN;
  const base = Number.isFinite(ts) ? ts : Date.now();
  const d = new Date(base);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ----------------------------------------------------------------------------
// The adapter
// ----------------------------------------------------------------------------

/**
 * Turn parsed dbt artifacts into a DbtProject.
 *
 * @param manifest  parsed manifest.json (nodes + sources)
 * @param history   one entry per invocation, oldest -> newest
 */
export function loadProject(
  manifest: RawManifest,
  history: DailyArtifacts[],
): DbtProject {
  const rawNodes: RawNode[] = [
    ...Object.values(manifest.sources ?? {}),
    ...Object.values(manifest.nodes ?? {}),
  ].filter((n) => n.resource_type === "model" || n.resource_type === "source");

  // --- DAG ---------------------------------------------------------------
  const models: DbtModel[] = rawNodes.map((n) => ({
    uniqueId: n.unique_id,
    name: n.name,
    layer: layerOf(n),
    materialization: materializationOf(n),
    schema: n.schema ?? "",
    owner: ownerOf(n),
    tags: n.tags ?? [],
    description: n.description ?? "",
    dependsOn: n.depends_on?.nodes ?? [],
  }));

  const present = new Set(models.map((m) => m.uniqueId));
  // Drop dangling parents (e.g. tests/macros that aren't in our node set).
  for (const m of models) m.dependsOn = m.dependsOn.filter((p) => present.has(p));

  const modelsById: Record<string, DbtModel> = {};
  const childrenOf: Record<string, string[]> = {};
  for (const m of models) {
    modelsById[m.uniqueId] = m;
    childrenOf[m.uniqueId] = [];
  }
  for (const m of models) {
    for (const p of m.dependsOn) childrenOf[p]?.push(m.uniqueId);
  }

  // --- SLAs (a convention: model.config.meta.sla = "HH:MM") --------------
  const slas: Record<string, Sla> = {};
  for (const n of rawNodes) {
    const sla = metaOf(n).sla as string | undefined;
    if (!sla) continue;
    const targetMinutes = hhmmToMinutes(sla);
    if (!Number.isFinite(targetMinutes)) continue;
    slas[n.unique_id] = {
      uniqueId: n.unique_id,
      targetMinutes,
      label: `${sla.replace(/\s*UTC$/i, "")} UTC`,
    };
  }

  // --- Runs --------------------------------------------------------------
  const runs: ProjectRun[] = history.map((day) => {
    const date = runDateOf(day);
    const results: Record<string, ModelRun> = {};

    const ingest = (r: RawRunResult, isSource: boolean) => {
      const status = normalizeStatus(r.status);
      const { start, end } = executeTiming(r);
      // Sources record their arrival in `max_loaded_at`; prefer it as landing.
      const loaded = r.max_loaded_at ? Date.parse(r.max_loaded_at) : undefined;
      const completedAt =
        (isSource && Number.isFinite(loaded) ? loaded : undefined) ?? end ?? date;
      const execMs = (r.execution_time ?? 0) * 1000;
      const startedAt = start ?? completedAt - execMs;
      results[r.unique_id] = {
        uniqueId: r.unique_id,
        status,
        startedAt,
        completedAt,
        executionSeconds: r.execution_time ?? 0,
        rowsAffected: r.adapter_response?.rows_affected ?? null,
      };
    };

    for (const r of day.sources?.results ?? []) {
      if (modelsById[r.unique_id]?.layer === "source") ingest(r, true);
    }
    for (const r of day.runResults.results) {
      if (modelsById[r.unique_id]) ingest(r, false);
    }

    const starts = Object.values(results).map((r) => r.startedAt);
    const startedAt = starts.length ? Math.min(...starts) : date;
    const runId =
      day.runResults.metadata?.invocation_id ??
      `run-${new Date(date).toISOString().slice(0, 10)}`;

    return { runId, date, startedAt, results };
  });

  runs.sort((a, b) => a.date - b.date);

  return {
    name: manifest.metadata?.project_name ?? "dbt_project",
    models,
    modelsById,
    childrenOf,
    slas,
    runs,
  };
}

// ----------------------------------------------------------------------------
// Vite wrapper: load the bundled sample artifacts under fixtures/dbt/.
// Swap `generate.ts` for this in src/app/store.tsx to run the app on
// adapter-loaded data (see the README).
// ----------------------------------------------------------------------------

const DATE_RE = /\.(\d{4}-\d{2}-\d{2})\.json$/;

function byDate(glob: Record<string, unknown>): Map<string, RawRunResults> {
  const out = new Map<string, RawRunResults>();
  for (const [path, mod] of Object.entries(glob)) {
    const date = DATE_RE.exec(path)?.[1];
    if (!date) continue;
    out.set(date, (mod as { default: RawRunResults }).default);
  }
  return out;
}

export function loadProjectFromFixtures(): DbtProject {
  const manifestGlob = import.meta.glob("../../fixtures/dbt/manifest.json", {
    eager: true,
  });
  const manifest = (Object.values(manifestGlob)[0] as { default: RawManifest })
    .default;

  const runResults = byDate(
    import.meta.glob("../../fixtures/dbt/runs/run_results.*.json", {
      eager: true,
    }),
  );
  const sources = byDate(
    import.meta.glob("../../fixtures/dbt/runs/sources.*.json", { eager: true }),
  );

  const history: DailyArtifacts[] = [...runResults.keys()]
    .sort()
    .map((date) => ({
      date,
      runResults: runResults.get(date)!,
      sources: sources.get(date),
    }));

  return loadProject(manifest, history);
}

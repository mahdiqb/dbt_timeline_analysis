// Generate synthetic dbt artifacts under fixtures/dbt/ for testing the adapter.
//
// Rather than hand-author JSON (or maintain a second scenario), we take the
// existing synthetic project from src/data/generate.ts and *serialize it out*
// into the exact shapes a real `dbt build` + `dbt source freshness` would emit:
//
//   fixtures/dbt/
//     manifest.json                     the DAG (models + sources)
//     runs/run_results.<date>.json      per-day model execution (one per run)
//     runs/sources.<date>.json          per-day source freshness (arrivals)
//
// Because these are a faithful serialization of generate.ts's project,
// loadProject() reading them back should reconstruct an equivalent project
// — which scripts/verify-fixtures.mjs asserts. Run with: npm run fixtures
//
// Zero new deps: esbuild ships with Vite, and we use it to import the TS
// generator (its only import is `import type`, which esbuild elides).

import { transform } from "esbuild";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

/** Transpile a TS module and import it (works for type-only-import files). */
async function importTs(rel) {
  const src = await readFile(path.join(ROOT, rel), "utf8");
  const { code } = await transform(src, {
    loader: "ts",
    format: "esm",
    target: "es2021",
  });
  const url =
    "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  return import(url);
}

const iso = (ms) => new Date(Math.round(ms)).toISOString();
const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);
const pad2 = (n) => String(n).padStart(2, "0");
const hhmm = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

const DATABASE = "analytics";

/** Split a source uniqueId "source.<proj>.<source>.<table>" into parts. */
function sourceParts(uniqueId) {
  const [, , source = "raw", table] = uniqueId.split(".");
  return { source, table };
}

function buildManifest(project) {
  const nodes = {};
  const sources = {};

  for (const m of project.models) {
    const isSource = m.layer === "source";
    const sla = project.slas[m.uniqueId];
    const meta = { owner: m.owner };
    if (sla) meta.sla = hhmm(sla.targetMinutes);

    if (isSource) {
      const { source, table } = sourceParts(m.uniqueId);
      sources[m.uniqueId] = {
        unique_id: m.uniqueId,
        resource_type: "source",
        name: m.name,
        source_name: source,
        schema: m.schema,
        database: DATABASE,
        fqn: [project.name, source, table ?? m.name],
        tags: m.tags,
        description: m.description,
        config: { meta },
        meta,
        depends_on: { macros: [], nodes: [] },
      };
    } else {
      nodes[m.uniqueId] = {
        unique_id: m.uniqueId,
        resource_type: "model",
        name: m.name,
        schema: m.schema,
        database: DATABASE,
        fqn: [project.name, m.layer, m.name],
        path: `${m.layer}/${m.name}.sql`,
        original_file_path: `models/${m.layer}/${m.name}.sql`,
        tags: m.tags,
        description: m.description,
        config: { materialized: m.materialization, meta, tags: m.tags },
        depends_on: { macros: [], nodes: m.dependsOn },
      };
    }
  }

  return {
    metadata: {
      project_name: project.name,
      adapter_type: "snowflake",
      dbt_version: "1.8.7",
    },
    nodes,
    sources,
  };
}

/** Real dbt omits execute timing for skipped nodes, but we include it so the
 *  fixtures round-trip exactly; the adapter also handles the missing case. */
function timing(run) {
  return [
    { name: "compile", started_at: iso(run.startedAt), completed_at: iso(run.startedAt) },
    { name: "execute", started_at: iso(run.startedAt), completed_at: iso(run.completedAt) },
  ];
}

function buildRunResults(project, projectRun) {
  const results = [];
  let generatedAt = projectRun.date;
  for (const m of project.models) {
    if (m.layer === "source") continue;
    const r = projectRun.results[m.uniqueId];
    if (!r) continue;
    generatedAt = Math.max(generatedAt, r.completedAt);
    results.push({
      unique_id: r.uniqueId,
      status: r.status,
      execution_time: r.executionSeconds,
      adapter_response: { rows_affected: r.rowsAffected },
      message: null,
      failures: null,
      timing: timing(r),
    });
  }
  return {
    metadata: {
      generated_at: iso(generatedAt),
      invocation_id: projectRun.runId,
      dbt_version: "1.8.7",
    },
    results,
  };
}

function buildSources(project, projectRun) {
  const results = [];
  let generatedAt = projectRun.date;
  for (const m of project.models) {
    if (m.layer !== "source") continue;
    const r = projectRun.results[m.uniqueId];
    if (!r) continue;
    generatedAt = Math.max(generatedAt, r.completedAt);
    results.push({
      unique_id: r.uniqueId,
      status: "pass",
      max_loaded_at: iso(r.completedAt),
      snapshotted_at: iso(r.completedAt),
      execution_time: r.executionSeconds,
      adapter_response: { rows_affected: r.rowsAffected },
      criteria: { warn_after: null, error_after: null },
      timing: [
        { name: "execute", started_at: iso(r.startedAt), completed_at: iso(r.completedAt) },
      ],
    });
  }
  return {
    metadata: {
      generated_at: iso(generatedAt),
      invocation_id: `${projectRun.runId}-freshness`,
      dbt_version: "1.8.7",
    },
    results,
  };
}

async function main() {
  const { project } = await importTs("src/data/generate.ts");

  const dbtDir = path.join(ROOT, "fixtures/dbt");
  const runsDir = path.join(dbtDir, "runs");
  await rm(dbtDir, { recursive: true, force: true });
  await mkdir(runsDir, { recursive: true });

  const write = (file, obj) =>
    writeFile(path.join(dbtDir, file), JSON.stringify(obj, null, 2) + "\n");

  await write("manifest.json", buildManifest(project));

  for (const run of project.runs) {
    const d = dayStr(run.date);
    await write(`runs/run_results.${d}.json`, buildRunResults(project, run));
    await write(`runs/sources.${d}.json`, buildSources(project, run));
  }

  const days = project.runs.length;
  console.log(
    `Wrote fixtures/dbt/manifest.json + ${days} days ` +
      `(${days} run_results + ${days} sources) under fixtures/dbt/runs/`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

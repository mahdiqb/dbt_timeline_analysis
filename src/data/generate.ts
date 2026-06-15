// Deterministic synthetic data for a realistic marketplace dbt project.
//
// We model an early-morning batch: sources "arrive" from upstream systems,
// then staging -> intermediate -> marts models run as their parents land.
// Landing times, the critical path, and SLA misses all emerge from the
// dependency simulation rather than being hand-authored, which makes the
// visualizations behave like a real project's.

import type {
  DbtModel,
  DbtProject,
  Materialization,
  ModelLayer,
  ModelRun,
  ProjectRun,
  Sla,
} from "@/types/dbt";

const PROJECT = "marketplace";
const NUM_DAYS = 30;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// Anchor the most recent run to a fixed UTC date so visuals are stable.
const MOST_RECENT = Date.UTC(2026, 4, 31); // 2026-05-31 00:00 UTC

// ----------------------------------------------------------------------------
// Seeded RNG (mulberry32) + helpers
// ----------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number, mean: number, sd: number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// ----------------------------------------------------------------------------
// Topology
// ----------------------------------------------------------------------------

interface SourceSpec {
  name: string;
  owner: string;
  description: string;
  /** Arrival time, minutes after 00:00 UTC. */
  arrivalMean: number;
  arrivalSd: number;
  /** Visible ingestion duration (minutes). */
  ingestMean: number;
}

interface ModelSpec {
  name: string;
  layer: Exclude<ModelLayer, "source">;
  materialization: Materialization;
  owner: string;
  description: string;
  deps: string[]; // short names (source or model)
  durMean: number;
  durSd: number;
  slaMinutes?: number;
}

const SOURCES: SourceSpec[] = [
  { name: "events", owner: "Core Data", description: "Raw clickstream events from the web and mobile apps.", arrivalMean: 35, arrivalSd: 8, ingestMean: 5 },
  { name: "bookings", owner: "Payments", description: "Raw booking transactions from the reservations service.", arrivalMean: 60, arrivalSd: 12, ingestMean: 4 },
  { name: "listings", owner: "Marketplace", description: "Raw listing inventory snapshots.", arrivalMean: 50, arrivalSd: 10, ingestMean: 4 },
  { name: "users", owner: "Core Data", description: "Raw user account records.", arrivalMean: 45, arrivalSd: 10, ingestMean: 3 },
  { name: "payments", owner: "Payments", description: "Settlement feed from the external payment processor.", arrivalMean: 175, arrivalSd: 45, ingestMean: 8 },
  { name: "reviews", owner: "Marketplace", description: "Raw guest and host reviews.", arrivalMean: 80, arrivalSd: 18, ingestMean: 5 },
  { name: "messages", owner: "Marketplace", description: "Raw guest-host messaging threads.", arrivalMean: 70, arrivalSd: 15, ingestMean: 4 },
  { name: "search_logs", owner: "Search", description: "Raw search and ranking impression logs.", arrivalMean: 95, arrivalSd: 25, ingestMean: 6 },
];

const MODELS: ModelSpec[] = [
  // staging (1:1 cleaning of sources)
  { name: "stg_events", layer: "staging", materialization: "view", owner: "Core Data", description: "Cleaned, typed clickstream events.", deps: ["events"], durMean: 12, durSd: 3 },
  { name: "stg_bookings", layer: "staging", materialization: "view", owner: "Payments", description: "Cleaned booking transactions.", deps: ["bookings"], durMean: 6, durSd: 1.5 },
  { name: "stg_listings", layer: "staging", materialization: "view", owner: "Marketplace", description: "Cleaned listing inventory.", deps: ["listings"], durMean: 6, durSd: 1.5 },
  { name: "stg_users", layer: "staging", materialization: "view", owner: "Core Data", description: "Cleaned user accounts.", deps: ["users"], durMean: 5, durSd: 1.2 },
  { name: "stg_payments", layer: "staging", materialization: "view", owner: "Payments", description: "Cleaned settlement records.", deps: ["payments"], durMean: 8, durSd: 2 },
  { name: "stg_reviews", layer: "staging", materialization: "view", owner: "Marketplace", description: "Cleaned reviews.", deps: ["reviews"], durMean: 6, durSd: 1.5 },
  { name: "stg_messages", layer: "staging", materialization: "view", owner: "Marketplace", description: "Cleaned messaging threads.", deps: ["messages"], durMean: 5, durSd: 1.2 },
  { name: "stg_search", layer: "staging", materialization: "view", owner: "Search", description: "Cleaned search impression logs.", deps: ["search_logs"], durMean: 9, durSd: 2.5 },

  // intermediate (joins / aggregations)
  { name: "int_booking_events", layer: "intermediate", materialization: "table", owner: "Payments", description: "Bookings joined to the events that drove them.", deps: ["stg_bookings", "stg_events"], durMean: 14, durSd: 3 },
  { name: "int_listing_metrics", layer: "intermediate", materialization: "table", owner: "Marketplace", description: "Per-listing quality and review metrics.", deps: ["stg_listings", "stg_reviews"], durMean: 12, durSd: 3 },
  { name: "int_user_sessions", layer: "intermediate", materialization: "table", owner: "Core Data", description: "Sessionized user activity.", deps: ["stg_events", "stg_users", "stg_search"], durMean: 16, durSd: 4 },
  { name: "int_payments_enriched", layer: "intermediate", materialization: "table", owner: "Payments", description: "Settlements enriched with booking context.", deps: ["stg_payments", "stg_bookings"], durMean: 16, durSd: 4 },
  { name: "int_host_performance", layer: "intermediate", materialization: "table", owner: "Marketplace", description: "Host-level performance roll-up (heavy join).", deps: ["stg_listings", "stg_bookings", "stg_reviews"], durMean: 22, durSd: 5 },
  { name: "int_search_ranking", layer: "intermediate", materialization: "table", owner: "Search", description: "Search ranking features per query.", deps: ["stg_search", "stg_listings", "stg_events"], durMean: 18, durSd: 4 },
  { name: "int_messaging_health", layer: "intermediate", materialization: "table", owner: "Marketplace", description: "Messaging responsiveness metrics.", deps: ["stg_messages", "stg_users"], durMean: 10, durSd: 2.5 },
  { name: "int_funnel", layer: "intermediate", materialization: "table", owner: "Search", description: "Search-to-booking conversion funnel.", deps: ["stg_events", "stg_search", "stg_bookings"], durMean: 20, durSd: 5 },

  // marts (business-facing; most carry SLAs)
  { name: "fct_payments", layer: "marts", materialization: "incremental", owner: "Payments", description: "Payment facts — the daily settlement table.", deps: ["int_payments_enriched"], durMean: 12, durSd: 3, slaMinutes: 240 },
  { name: "fct_bookings", layer: "marts", materialization: "incremental", owner: "Payments", description: "Booking facts at transaction grain.", deps: ["int_booking_events", "int_payments_enriched"], durMean: 18, durSd: 4, slaMinutes: 270 },
  { name: "fct_search", layer: "marts", materialization: "incremental", owner: "Search", description: "Search session facts.", deps: ["int_search_ranking", "int_funnel"], durMean: 14, durSd: 3, slaMinutes: 270 },
  { name: "dim_listings", layer: "marts", materialization: "table", owner: "Marketplace", description: "Listing dimension with quality metrics.", deps: ["int_listing_metrics", "int_host_performance"], durMean: 12, durSd: 3, slaMinutes: 270 },
  { name: "dim_users", layer: "marts", materialization: "table", owner: "Core Data", description: "User dimension with engagement.", deps: ["int_user_sessions", "stg_users"], durMean: 10, durSd: 2.5, slaMinutes: 240 },
  { name: "mart_revenue_daily", layer: "marts", materialization: "table", owner: "Payments", description: "Daily revenue report — the flagship finance dataset.", deps: ["fct_bookings", "fct_payments"], durMean: 14, durSd: 3, slaMinutes: 300 },
  { name: "mart_host_dashboard", layer: "marts", materialization: "table", owner: "Marketplace", description: "Powers the host-facing performance dashboard.", deps: ["dim_listings", "int_host_performance", "fct_bookings"], durMean: 16, durSd: 4, slaMinutes: 300 },
  { name: "mart_marketplace_health", layer: "marts", materialization: "table", owner: "Search", description: "Marketplace health and conversion overview.", deps: ["fct_search", "int_messaging_health", "int_funnel"], durMean: 14, durSd: 3, slaMinutes: 300 },
  { name: "mart_executive_summary", layer: "marts", materialization: "table", owner: "Core Data", description: "Top-level executive KPIs across the business.", deps: ["mart_revenue_daily", "mart_host_dashboard", "dim_users"], durMean: 10, durSd: 2.5, slaMinutes: 330 },
];

const sourceId = (name: string) => `source.${PROJECT}.raw.${name}`;
const modelId = (name: string) => `model.${PROJECT}.${name}`;

// short name -> uniqueId
const NAME_TO_ID: Record<string, string> = {};
for (const s of SOURCES) NAME_TO_ID[s.name] = sourceId(s.name);
for (const m of MODELS) NAME_TO_ID[m.name] = modelId(m.name);

const SCHEMA_BY_LAYER: Record<ModelLayer, string> = {
  source: "raw",
  staging: "staging",
  intermediate: "intermediate",
  marts: "analytics",
};

function fmtClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC`;
}

// ----------------------------------------------------------------------------
// Incidents — scripted events at specific day-ages (0 = most recent run).
// ----------------------------------------------------------------------------

type Incident =
  | { kind: "source_delay"; source: string; addMinutes: number }
  | { kind: "long_runtime"; model: string; factor: number }
  | { kind: "error"; model: string };

const INCIDENTS: Record<number, Incident[]> = {
  2: [{ kind: "source_delay", source: "payments", addMinutes: 175 }],
  9: [{ kind: "long_runtime", model: "int_host_performance", factor: 5 }],
  16: [{ kind: "error", model: "stg_messages" }],
  23: [{ kind: "source_delay", source: "search_logs", addMinutes: 95 }],
};

// ----------------------------------------------------------------------------
// Build the static project (models, edges, SLAs)
// ----------------------------------------------------------------------------

function buildModels(): { models: DbtModel[]; slas: Record<string, Sla> } {
  const models: DbtModel[] = [];
  const slas: Record<string, Sla> = {};

  for (const s of SOURCES) {
    models.push({
      uniqueId: sourceId(s.name),
      name: s.name,
      layer: "source",
      materialization: "source",
      schema: SCHEMA_BY_LAYER.source,
      owner: s.owner,
      tags: ["source"],
      description: s.description,
      dependsOn: [],
    });
  }

  for (const m of MODELS) {
    const uniqueId = modelId(m.name);
    models.push({
      uniqueId,
      name: m.name,
      layer: m.layer,
      materialization: m.materialization,
      schema: SCHEMA_BY_LAYER[m.layer],
      owner: m.owner,
      tags: [m.layer],
      description: m.description,
      dependsOn: m.deps.map((d) => NAME_TO_ID[d]),
    });
    if (m.slaMinutes != null) {
      slas[uniqueId] = {
        uniqueId,
        targetMinutes: m.slaMinutes,
        label: fmtClock(m.slaMinutes),
      };
    }
  }

  return { models, slas };
}

// ----------------------------------------------------------------------------
// Simulate one run for a given day-age.
// ----------------------------------------------------------------------------

function simulateRun(
  rng: () => number,
  date: number,
  age: number,
): ProjectRun {
  const incidents = INCIDENTS[age] ?? [];
  const sourceDelay = (name: string) =>
    incidents
      .filter((i): i is Extract<Incident, { kind: "source_delay" }> => i.kind === "source_delay" && i.source === name)
      .reduce((acc, i) => acc + i.addMinutes, 0);
  const runtimeFactor = (name: string) =>
    incidents
      .filter((i): i is Extract<Incident, { kind: "long_runtime" }> => i.kind === "long_runtime" && i.model === name)
      .reduce((acc, i) => acc * i.factor, 1);
  const isErrored = (name: string) =>
    incidents.some((i) => i.kind === "error" && i.model === name);

  // Day-of-week pacing: Monday backfill is heavier; weekends lighter.
  const dow = new Date(date).getUTCDay(); // 0 Sun .. 6 Sat
  let dayFactor = 1;
  if (dow === 1) dayFactor = 1.2; // Monday
  else if (dow === 0 || dow === 6) dayFactor = 0.85; // weekend
  dayFactor *= clamp(gaussian(rng, 1, 0.05), 0.85, 1.2);

  const results: Record<string, ModelRun> = {};
  let kickoff = Number.POSITIVE_INFINITY;

  // Sources first.
  for (const s of SOURCES) {
    const id = sourceId(s.name);
    const arrival =
      clamp(gaussian(rng, s.arrivalMean, s.arrivalSd), 8, 600) * dayFactor +
      sourceDelay(s.name);
    const ingest = clamp(gaussian(rng, s.ingestMean, s.ingestMean * 0.3), 1, 40);
    const completedAt = date + arrival * MINUTE;
    const startedAt = completedAt - ingest * MINUTE;
    kickoff = Math.min(kickoff, startedAt);
    results[id] = {
      uniqueId: id,
      status: "success",
      startedAt,
      completedAt,
      executionSeconds: Math.round(ingest * 60),
      rowsAffected: Math.round(gaussian(rng, 4_000_000, 800_000) * dayFactor),
    };
  }

  // Models in declared order (topologically sorted by construction).
  for (const m of MODELS) {
    const id = modelId(m.name);
    const parents = m.deps.map((d) => NAME_TO_ID[d]);
    const parentRuns = parents.map((p) => results[p]);

    // Skip if any parent failed or was skipped.
    const blocked = parentRuns.some((p) => p.status !== "success");
    const ready = parentRuns.length
      ? Math.max(...parentRuns.map((p) => p.completedAt))
      : date;

    if (isErrored(m.name) || blocked) {
      results[id] = {
        uniqueId: id,
        status: isErrored(m.name) ? "error" : "skipped",
        startedAt: ready,
        completedAt: ready,
        executionSeconds: 0,
        rowsAffected: null,
      };
      continue;
    }

    const queue = clamp(gaussian(rng, 3, 1.4), 0.4, 12);
    const startedAt = ready + queue * MINUTE;
    const dur =
      clamp(gaussian(rng, m.durMean, m.durSd), 1, 600) *
      dayFactor *
      runtimeFactor(m.name);
    const completedAt = startedAt + dur * MINUTE;
    const rowsBase = m.layer === "staging" ? 3_500_000 : m.layer === "intermediate" ? 1_200_000 : 450_000;
    results[id] = {
      uniqueId: id,
      status: "success",
      startedAt,
      completedAt,
      executionSeconds: Math.round(dur * 60),
      rowsAffected: Math.round(Math.max(0, gaussian(rng, rowsBase, rowsBase * 0.25) * dayFactor)),
    };
  }

  return {
    runId: `run-${new Date(date).toISOString().slice(0, 10)}`,
    date,
    startedAt: Number.isFinite(kickoff) ? kickoff : date,
    results,
  };
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export function generateProject(seed = 20260531): DbtProject {
  const rng = mulberry32(seed);
  const { models, slas } = buildModels();

  const modelsById: Record<string, DbtModel> = {};
  const childrenOf: Record<string, string[]> = {};
  for (const m of models) {
    modelsById[m.uniqueId] = m;
    childrenOf[m.uniqueId] = [];
  }
  for (const m of models) {
    for (const p of m.dependsOn) childrenOf[p]?.push(m.uniqueId);
  }

  const runs: ProjectRun[] = [];
  for (let i = 0; i < NUM_DAYS; i++) {
    const age = NUM_DAYS - 1 - i; // i = 0 is oldest; age counts down to 0 (newest)
    const date = MOST_RECENT - age * DAY;
    runs.push(simulateRun(rng, date, age));
  }

  return {
    name: PROJECT,
    models,
    modelsById,
    childrenOf,
    slas,
    runs,
  };
}

export const project: DbtProject = generateProject();

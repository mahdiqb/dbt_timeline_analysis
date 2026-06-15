// Domain types for a dbt project's structure and run history.
// Shapes intentionally mirror dbt's `manifest.json` (the DAG) and
// `run_results.json` (per-invocation execution metadata) so that a real
// project's artifacts could be adapted into these types later.

export type ModelLayer = "source" | "staging" | "intermediate" | "marts";

export type Materialization =
  | "view"
  | "table"
  | "incremental"
  | "ephemeral"
  | "source";

export type RunStatus = "success" | "error" | "skipped";

/** A node in the dbt DAG (a model, or an external source). */
export interface DbtModel {
  /** dbt's fully-qualified id, e.g. "model.marketplace.stg_orders". */
  uniqueId: string;
  /** Short name, e.g. "stg_orders". */
  name: string;
  layer: ModelLayer;
  materialization: Materialization;
  /** Target schema the relation is built in. */
  schema: string;
  /** Owning team. */
  owner: string;
  tags: string[];
  description: string;
  /** uniqueIds of upstream parents (dbt `depends_on.nodes`). */
  dependsOn: string[];
}

/** A timeliness commitment for a dataset. */
export interface Sla {
  uniqueId: string;
  /** Target landing time, in minutes after the run day's 00:00 UTC. */
  targetMinutes: number;
  /** Human label, e.g. "05:30 UTC". */
  label: string;
}

/** Execution metadata for one model within one project run. */
export interface ModelRun {
  uniqueId: string;
  status: RunStatus;
  /** Absolute epoch ms when the node began executing. */
  startedAt: number;
  /** Absolute epoch ms when the node finished (its "landing time"). */
  completedAt: number;
  /** Wall-clock execution time in seconds. */
  executionSeconds: number;
  /** Rows materialized, when applicable. */
  rowsAffected: number | null;
}

/** One end-to-end invocation of the project, anchored to a logical date. */
export interface ProjectRun {
  runId: string;
  /** Logical run date as 00:00 UTC epoch ms — the batch's reference midnight. */
  date: number;
  /** When the invocation kicked off (epoch ms). */
  startedAt: number;
  /** Per-model results, keyed by uniqueId. */
  results: Record<string, ModelRun>;
}

/** A fully-resolved project: DAG + SLAs + chronological run history. */
export interface DbtProject {
  name: string;
  models: DbtModel[];
  /** Lookup by uniqueId. */
  modelsById: Record<string, DbtModel>;
  /** Forward adjacency: parent uniqueId -> child uniqueIds. */
  childrenOf: Record<string, string[]>;
  /** SLAs by uniqueId (only tracked datasets have one). */
  slas: Record<string, Sla>;
  /** Runs in chronological order; the last entry is the most recent. */
  runs: ProjectRun[];
}

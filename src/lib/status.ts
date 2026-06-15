// Timeliness status for a single model within a single run.

import type { DbtProject, ProjectRun } from "@/types/dbt";
import type { Typical } from "./stats";
import { minutesAfter } from "./time";

export type TimelinessStatus =
  | "on_time" // landed by SLA (or as-usual when no SLA)
  | "behind" // later than typical, but no SLA breach
  | "late" // missed SLA
  | "error" // the model itself failed
  | "skipped"; // an upstream failure prevented it from running

export interface RunEvaluation {
  uniqueId: string;
  status: TimelinessStatus;
  hasSla: boolean;
  /** Landing time in minutes after midnight (null when it never ran). */
  landingMin: number | null;
  startMin: number | null;
  durationMin: number;
  slaMin: number | null;
  /** Landing minus typical p50 landing (minutes); positive = slower than usual. */
  deltaVsTypical: number;
}

/** How much later than usual before we flag "behind" (minutes of slack past p90). */
const BEHIND_SLACK = 4;

export function evaluateRun(
  project: DbtProject,
  uniqueId: string,
  run: ProjectRun,
  typical: Typical,
): RunEvaluation {
  const sla = project.slas[uniqueId] ?? null;
  const hasSla = sla != null;
  const r = run.results[uniqueId];

  if (!r || r.status === "error" || r.status === "skipped") {
    return {
      uniqueId,
      status: r?.status === "skipped" ? "skipped" : r?.status === "error" ? "error" : "skipped",
      hasSla,
      landingMin: null,
      startMin: null,
      durationMin: 0,
      slaMin: sla?.targetMinutes ?? null,
      deltaVsTypical: 0,
    };
  }

  const landingMin = minutesAfter(run.date, r.completedAt);
  const startMin = minutesAfter(run.date, r.startedAt);
  const durationMin = r.executionSeconds / 60;
  const deltaVsTypical = landingMin - typical.landing.p50;

  let status: TimelinessStatus;
  if (sla && landingMin > sla.targetMinutes) {
    status = "late";
  } else if (landingMin > typical.landing.p90 + BEHIND_SLACK) {
    status = "behind";
  } else {
    status = "on_time";
  }

  return {
    uniqueId,
    status,
    hasSla,
    landingMin,
    startMin,
    durationMin,
    slaMin: sla?.targetMinutes ?? null,
    deltaVsTypical,
  };
}

export const STATUS_LABEL: Record<TimelinessStatus, string> = {
  on_time: "On time",
  behind: "Behind",
  late: "Late",
  error: "Failed",
  skipped: "Skipped",
};

/** Severity ordering for sorting/rolling up (higher = worse). */
export const STATUS_SEVERITY: Record<TimelinessStatus, number> = {
  on_time: 0,
  behind: 1,
  skipped: 2,
  late: 3,
  error: 4,
};

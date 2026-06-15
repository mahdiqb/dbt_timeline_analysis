// Aggregate statistics over a project's run history.
//
// "Typical" landing/start/duration come from percentiles across the last N
// successful runs, which is what powers the "current vs typical" overlays.

import type { DbtProject } from "@/types/dbt";
import { minutesAfter } from "./time";

export interface Band {
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
}

export interface Typical {
  /** Landing time (minutes after midnight). */
  landing: Band;
  /** Start time (minutes after midnight). */
  start: Band;
  /** Execution duration (minutes). */
  duration: Band;
  /** Number of successful runs the stats are based on. */
  count: number;
  /** Fraction of runs that missed SLA (only meaningful when an SLA exists). */
  missRate: number;
  /** Number of runs that errored or were skipped. */
  failures: number;
}

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base];
}

function band(values: number[]): Band {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p10: quantileSorted(sorted, 0.1),
    p50: quantileSorted(sorted, 0.5),
    p90: quantileSorted(sorted, 0.9),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

export function computeTypical(project: DbtProject, uniqueId: string): Typical {
  const landings: number[] = [];
  const starts: number[] = [];
  const durations: number[] = [];
  let failures = 0;
  let misses = 0;
  let successes = 0;

  const sla = project.slas[uniqueId];

  for (const run of project.runs) {
    const r = run.results[uniqueId];
    if (!r) continue;
    if (r.status !== "success") {
      failures += 1;
      continue;
    }
    successes += 1;
    const landing = minutesAfter(run.date, r.completedAt);
    landings.push(landing);
    starts.push(minutesAfter(run.date, r.startedAt));
    durations.push(r.executionSeconds / 60);
    if (sla && landing > sla.targetMinutes) misses += 1;
  }

  return {
    landing: band(landings),
    start: band(starts),
    duration: band(durations),
    count: successes,
    missRate: successes > 0 ? misses / successes : 0,
    failures,
  };
}

export function buildTypicals(project: DbtProject): Record<string, Typical> {
  const out: Record<string, Typical> = {};
  for (const m of project.models) out[m.uniqueId] = computeTypical(project, m.uniqueId);
  return out;
}

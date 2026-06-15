// The bottleneck path: the chain of latest-landing ancestors that gated a
// dataset's completion. This is the "needle in the haystack" — for a deep
// lineage it collapses dozens of upstream models down to the handful that
// actually determined when the target could run.

import type { DbtProject, ProjectRun } from "@/types/dbt";

/**
 * Walk from `targetId` back through parents, at each step choosing the parent
 * that finished last (the one that kept this node waiting). Returns the path
 * ordered target-first, ending at a source/root.
 */
export function bottleneckPath(
  project: DbtProject,
  run: ProjectRun,
  targetId: string,
): string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let cur: string | undefined = targetId;

  while (cur && !visited.has(cur)) {
    path.push(cur);
    visited.add(cur);

    const parents = project.modelsById[cur]?.dependsOn ?? [];
    if (parents.length === 0) break;

    let latest: string | undefined;
    let latestTs = -Infinity;
    for (const p of parents) {
      const pr = run.results[p];
      if (!pr) continue;
      if (pr.completedAt > latestTs) {
        latestTs = pr.completedAt;
        latest = p;
      }
    }
    cur = latest;
  }

  return path;
}

/** Convenience: the bottleneck path as a Set for membership checks. */
export function bottleneckSet(
  project: DbtProject,
  run: ProjectRun,
  targetId: string,
): Set<string> {
  return new Set(bottleneckPath(project, run, targetId));
}

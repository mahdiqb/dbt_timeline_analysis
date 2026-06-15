// DAG traversal helpers over a DbtProject.

import type { DbtProject } from "@/types/dbt";

/** All upstream ancestors of `id` (not including `id`). */
export function ancestors(project: DbtProject, id: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...(project.modelsById[id]?.dependsOn ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const p of project.modelsById[cur]?.dependsOn ?? []) stack.push(p);
  }
  return seen;
}

/** All downstream descendants of `id` (not including `id`). */
export function descendants(project: DbtProject, id: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...(project.childrenOf[id] ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const c of project.childrenOf[cur] ?? []) stack.push(c);
  }
  return seen;
}

/** `id` plus all its ancestors — the lineage that feeds a dataset. */
export function lineageOf(project: DbtProject, id: string): string[] {
  const set = ancestors(project, id);
  set.add(id);
  return [...set];
}

/**
 * Topological order (parents before children) restricted to `ids`.
 * Edges to nodes outside the set are ignored.
 */
export function topoOrder(project: DbtProject, ids: string[]): string[] {
  const inSet = new Set(ids);
  const indeg = new Map<string, number>();
  for (const id of ids) {
    const parents = (project.modelsById[id]?.dependsOn ?? []).filter((p) => inSet.has(p));
    indeg.set(id, parents.length);
  }
  // Stable seed: preserve the project's declared model order.
  const order = project.models.map((m) => m.uniqueId).filter((id) => inSet.has(id));
  const ready = order.filter((id) => (indeg.get(id) ?? 0) === 0);
  const result: string[] = [];
  const queue = [...ready];
  const queued = new Set(ready);
  while (queue.length) {
    const cur = queue.shift()!;
    result.push(cur);
    for (const child of project.childrenOf[cur] ?? []) {
      if (!inSet.has(child)) continue;
      const next = (indeg.get(child) ?? 0) - 1;
      indeg.set(child, next);
      if (next === 0 && !queued.has(child)) {
        queued.add(child);
        // Insert respecting declared order for stability.
        queue.push(child);
      }
    }
  }
  // Any leftovers (shouldn't happen in a DAG) appended in declared order.
  for (const id of order) if (!result.includes(id)) result.push(id);
  return result;
}

/** Longest-path depth from any root within `ids` (roots = no in-set parents). */
export function depthMap(project: DbtProject, ids: string[]): Map<string, number> {
  const inSet = new Set(ids);
  const ordered = topoOrder(project, ids);
  const depth = new Map<string, number>();
  for (const id of ordered) {
    const parents = (project.modelsById[id]?.dependsOn ?? []).filter((p) => inSet.has(p));
    const d = parents.length ? Math.max(...parents.map((p) => (depth.get(p) ?? 0) + 1)) : 0;
    depth.set(id, d);
  }
  return depth;
}

/** Parent→child edges with both endpoints inside `ids`. */
export function edgesWithin(
  project: DbtProject,
  ids: string[],
): Array<{ from: string; to: string }> {
  const inSet = new Set(ids);
  const edges: Array<{ from: string; to: string }> = [];
  for (const id of ids) {
    for (const parent of project.modelsById[id]?.dependsOn ?? []) {
      if (inSet.has(parent)) edges.push({ from: parent, to: id });
    }
  }
  return edges;
}

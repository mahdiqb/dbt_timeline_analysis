// Where the app's data comes from.
//
// Default: the bundled synthetic project (great for `npm run dev` & the demo).
// In the Docker container: the server builds a DbtProject from your mounted
// dbt artifacts using the same loadProject() adapter, and injects it as
// `window.__DBT_PROJECT__` before the app boots (see scripts/cli/server.mjs).
// When that's present we use it — so the container shows *your* data with no
// build step.
//
// For a build-time alternative that bakes dbt artifacts straight into the
// bundle instead, swap `syntheticProject` below for `loadProjectFromFixtures()`
// from "./loadProject".

import type { DbtProject } from "@/types/dbt";
import { project as syntheticProject } from "./generate";

function injectedProject(): DbtProject | null {
  if (typeof window === "undefined") return null;
  const p = window.__DBT_PROJECT__;
  if (p && Array.isArray(p.models) && Array.isArray(p.runs) && p.runs.length > 0) {
    return p;
  }
  return null;
}

export const project: DbtProject = injectedProject() ?? syntheticProject;

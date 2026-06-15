import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { project as defaultProject } from "@/data/source";
// `@/data/source` resolves to your dbt artifacts when running in the container
// (the server injects them — see scripts/cli/server.mjs), otherwise the bundled
// synthetic project. See the README's "Use it on your own dbt project".
import { buildTypicals, type Typical } from "@/lib/stats";
import type { DbtModel, DbtProject, ProjectRun } from "@/types/dbt";

export type View = "report" | "timeline" | "historical";

interface AppState {
  project: DbtProject;
  typicals: Record<string, Typical>;
  /** Datasets that carry an SLA, ordered by target then name. */
  tracked: DbtModel[];
  view: View;
  setView: (v: View) => void;
  selectedId: string;
  /** Select a dataset; optionally jump to a view at the same time. */
  selectDataset: (id: string, view?: View) => void;
  runIndex: number;
  setRunIndex: (i: number) => void;
  selectedRun: ProjectRun;
  /** Re-fetch the project from the server to pick up newly-landed runs. */
  refresh: () => void;
  /** State of the last refresh attempt. */
  refreshState: RefreshState;
  /** True when a server backs the app (so refresh can actually fetch). */
  canRefresh: boolean;
}

export type RefreshState = "idle" | "loading" | "error";

const Ctx = createContext<AppState | null>(null);

/** Default focus: the top-level executive summary, else the first tracked/any model. */
function pickDefaultId(project: DbtProject): string {
  const exec = project.models.find((m) => m.name === "mart_executive_summary");
  return exec?.uniqueId ?? Object.keys(project.slas)[0] ?? project.models[0].uniqueId;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<DbtProject>(defaultProject);
  const typicals = useMemo(() => buildTypicals(project), [project]);

  const tracked = useMemo(
    () =>
      project.models
        .filter((m) => project.slas[m.uniqueId])
        .sort(
          (a, b) =>
            project.slas[a.uniqueId].targetMinutes -
              project.slas[b.uniqueId].targetMinutes || a.name.localeCompare(b.name),
        ),
    [project],
  );

  const [view, setView] = useState<View>("report");
  const [selectedId, setSelectedId] = useState(() => pickDefaultId(project));
  const [runIndex, setRunIndex] = useState(project.runs.length - 1);
  const [refreshState, setRefreshState] = useState<RefreshState>("idle");

  // Re-fetch the server-built project (picks up newly-landed runs) and jump to
  // the latest run. The server rebuilds from disk on each /project.json hit.
  const refresh = useCallback(async () => {
    setRefreshState("loading");
    try {
      const res = await fetch("/project.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const next = (await res.json()) as DbtProject;
      if (!next?.models?.length || !next?.runs?.length) {
        throw new Error("malformed project payload");
      }
      setProject(next);
      setRunIndex(next.runs.length - 1);
      setSelectedId((cur) => (next.modelsById[cur] ? cur : pickDefaultId(next)));
      setRefreshState("idle");
    } catch (err) {
      console.error("[dbt-sla] refresh failed:", err);
      setRefreshState("error");
    }
  }, []);

  // A server backs the app only when it injected the project at boot.
  const canRefresh = typeof window !== "undefined" && !!window.__DBT_PROJECT__;

  const value = useMemo<AppState>(
    () => ({
      project,
      typicals,
      tracked,
      view,
      setView,
      selectedId,
      selectDataset: (id, nextView) => {
        setSelectedId(id);
        if (nextView) setView(nextView);
      },
      runIndex,
      setRunIndex,
      selectedRun: project.runs[Math.min(runIndex, project.runs.length - 1)],
      refresh,
      refreshState,
      canRefresh,
    }),
    [project, typicals, tracked, view, selectedId, runIndex, refresh, refreshState, canRefresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

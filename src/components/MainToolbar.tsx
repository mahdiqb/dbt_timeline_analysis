import { useApp, type View } from "@/app/store";
import { Segmented } from "@/components/common/Segmented";
import { ReportIcon, TimelineIcon, HistoryIcon } from "@/components/common/icons";
import { LAYER_COLORS, LAYER_LABEL } from "@/lib/palette";
import "./MainToolbar.css";

const TABS = [
  { value: "report" as const, label: "Report", icon: <ReportIcon size={15} /> },
  { value: "timeline" as const, label: "Timeline", icon: <TimelineIcon size={15} /> },
  { value: "historical" as const, label: "Historical", icon: <HistoryIcon size={15} /> },
];

export function MainToolbar() {
  const { view, setView, selectedId, project } = useApp();
  const model = project.modelsById[selectedId];

  return (
    <div className="toolbar">
      <Segmented<View>
        options={TABS}
        value={view}
        onChange={setView}
        ariaLabel="View"
      />
      {view !== "report" && model && (
        <div className="toolbar__focus">
          <span className="toolbar__focus-label">Focus</span>
          <span
            className="toolbar__focus-layer"
            style={{ color: LAYER_COLORS[model.layer], background: `${LAYER_COLORS[model.layer]}1a` }}
          >
            {LAYER_LABEL[model.layer]}
          </span>
          <span className="toolbar__focus-name mono">{model.name}</span>
        </div>
      )}
    </div>
  );
}

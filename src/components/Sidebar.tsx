import { useMemo, useState } from "react";
import { useApp } from "@/app/store";
import { evaluateRun } from "@/lib/status";
import { STATUS_COLORS } from "@/lib/palette";
import { StatusDot } from "@/components/common/StatusDot";
import { SearchIcon } from "@/components/common/icons";
import { formatClock, formatDeltaMinutes } from "@/lib/time";
import "./Sidebar.css";

export function Sidebar() {
  const { project, typicals, tracked, selectedRun, selectedId, selectDataset } = useApp();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tracked
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.owner.toLowerCase().includes(q),
      )
      .map((m) => ({
        model: m,
        ev: evaluateRun(project, m.uniqueId, selectedRun, typicals[m.uniqueId]),
        sla: project.slas[m.uniqueId],
      }));
  }, [tracked, query, project, typicals, selectedRun]);

  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <div className="sidebar__title">
          Tracked datasets
          <span className="sidebar__count">{tracked.length}</span>
        </div>
        <div className="sidebar__search">
          <SearchIcon size={14} className="sidebar__search-icon" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter datasets or teams"
            spellCheck={false}
          />
        </div>
      </div>

      <nav className="sidebar__list">
        {rows.map(({ model, ev, sla }) => {
          const active = model.uniqueId === selectedId;
          const c = STATUS_COLORS[ev.status];
          return (
            <button
              key={model.uniqueId}
              className={`ds-row${active ? " ds-row--active" : ""}`}
              onClick={() => selectDataset(model.uniqueId, "timeline")}
            >
              <StatusDot status={ev.status} size={9} ring />
              <span className="ds-row__main">
                <span className="ds-row__name mono">{model.name}</span>
                <span className="ds-row__meta">
                  {model.owner} · SLA {sla.label.replace(" UTC", "")}
                </span>
              </span>
              <span className="ds-row__metric">
                {ev.landingMin != null ? (
                  <>
                    <span className="ds-row__time tnum" style={{ color: c.fg }}>
                      {formatClock(ev.landingMin)}
                    </span>
                    <span className="ds-row__delta tnum">
                      {formatDeltaMinutes(ev.deltaVsTypical)}
                    </span>
                  </>
                ) : (
                  <span className="ds-row__time" style={{ color: c.fg }}>
                    {c.label}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        {rows.length === 0 && <div className="sidebar__empty">No datasets match.</div>}
      </nav>
    </aside>
  );
}

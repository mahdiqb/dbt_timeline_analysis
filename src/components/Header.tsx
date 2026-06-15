import { useApp } from "@/app/store";
import { evaluateRun, type TimelinessStatus } from "@/lib/status";
import { STATUS_COLORS } from "@/lib/palette";
import { formatFullDate, formatRunDate, isWeekend } from "@/lib/time";
import { ChevronLeft, ChevronRight, RefreshIcon } from "@/components/common/icons";
import "./Header.css";

const SUMMARY_ORDER: TimelinessStatus[] = ["late", "error", "behind", "skipped", "on_time"];

export function Header() {
  const { project, typicals, tracked, selectedRun, runIndex, setRunIndex, refresh, refreshState, canRefresh } =
    useApp();

  const counts: Record<TimelinessStatus, number> = {
    on_time: 0,
    behind: 0,
    late: 0,
    error: 0,
    skipped: 0,
  };
  for (const m of tracked) {
    const ev = evaluateRun(project, m.uniqueId, selectedRun, typicals[m.uniqueId]);
    counts[ev.status] += 1;
  }
  const healthy = counts.on_time;
  const atRisk = tracked.length - healthy;
  const isLatest = runIndex === project.runs.length - 1;

  return (
    <header className="header">
      <div className="brand">
        <div className="brand__mark" aria-hidden>
          dbt
        </div>
        <div className="brand__text">
          <div className="brand__title">SLA Tracker</div>
          <div className="brand__sub">
            data timeliness · <span className="mono">{project.name}</span>
          </div>
        </div>
      </div>

      <div className="header__spacer" />

      <div className="run-health" title={`${healthy} of ${tracked.length} datasets on time`}>
        <div className="run-health__lead">
          <span className="tnum">{healthy}</span>
          <span className="run-health__of">/ {tracked.length}</span>
          <span className="run-health__label">on time</span>
        </div>
        <div className="run-health__chips">
          {SUMMARY_ORDER.filter((s) => counts[s] > 0 && s !== "on_time").map((s) => (
            <span
              key={s}
              className="run-health__chip"
              style={{ background: STATUS_COLORS[s].bg, color: STATUS_COLORS[s].fg }}
            >
              <span className="run-health__chip-dot" style={{ background: STATUS_COLORS[s].fg }} />
              <span className="tnum">{counts[s]}</span>
              {STATUS_COLORS[s].label}
            </span>
          ))}
          {atRisk === 0 && (
            <span
              className="run-health__chip"
              style={{ background: STATUS_COLORS.on_time.bg, color: STATUS_COLORS.on_time.fg }}
            >
              all on time
            </span>
          )}
        </div>
      </div>

      <div className="date-stepper">
        <button
          className="date-stepper__btn"
          aria-label="Previous run"
          disabled={runIndex === 0}
          onClick={() => setRunIndex(Math.max(0, runIndex - 1))}
        >
          <ChevronLeft />
        </button>
        <div className="date-stepper__label">
          <span className="date-stepper__date">{formatRunDate(selectedRun.date)}</span>
          <span className="date-stepper__year">
            {formatFullDate(selectedRun.date)}
            {isWeekend(selectedRun.date) ? " · weekend" : ""}
          </span>
        </div>
        <button
          className="date-stepper__btn"
          aria-label="Next run"
          disabled={isLatest}
          onClick={() => setRunIndex(Math.min(project.runs.length - 1, runIndex + 1))}
        >
          <ChevronRight />
        </button>
        {!isLatest && (
          <button
            className="date-stepper__latest"
            onClick={() => setRunIndex(project.runs.length - 1)}
          >
            Latest
          </button>
        )}
      </div>

      {canRefresh && (
        <div className="refresh">
          <button
            className={`refresh__btn${refreshState === "loading" ? " is-loading" : ""}${
              refreshState === "error" ? " is-error" : ""
            }`}
            onClick={refresh}
            disabled={refreshState === "loading"}
            aria-label="Refresh data"
            title={
              refreshState === "error"
                ? "Couldn't refresh — is the server reachable? Click to retry."
                : "Refresh — check for newly-landed runs"
            }
          >
            <RefreshIcon />
          </button>
        </div>
      )}
    </header>
  );
}

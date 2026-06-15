import { useMemo } from "react";
import { useApp } from "@/app/store";
import { evaluateRun } from "@/lib/status";
import { LAYER_COLORS, LAYER_LABEL, STATUS_COLORS } from "@/lib/palette";
import { StatusBadge } from "@/components/common/StatusDot";
import { ArrowRight } from "@/components/common/icons";
import { formatClock, formatDeltaMinutes, formatRunDate } from "@/lib/time";
import { LandingStrip } from "./LandingStrip";
import "./ReportView.css";

export function ReportView() {
  const { project, typicals, tracked, selectedRun, selectDataset } = useApp();

  const summary = useMemo(() => {
    let evaluated = 0;
    let onTime = 0;
    let misses = 0;
    let failures = 0;
    for (const m of tracked) {
      for (const run of project.runs) {
        const ev = evaluateRun(project, m.uniqueId, run, typicals[m.uniqueId]);
        if (ev.status === "error" || ev.status === "skipped") {
          failures += 1;
          continue;
        }
        evaluated += 1;
        if (ev.status === "late") misses += 1;
        else onTime += 1;
      }
    }
    const currently = tracked.map((m) =>
      evaluateRun(project, m.uniqueId, selectedRun, typicals[m.uniqueId]),
    );
    const atRiskNow = currently.filter((e) => e.status !== "on_time").length;
    return {
      rate: evaluated ? onTime / evaluated : 1,
      misses,
      failures,
      atRiskNow,
    };
  }, [project, typicals, tracked, selectedRun]);

  const firstDate = project.runs[0].date;
  const lastDate = project.runs[project.runs.length - 1].date;
  const runCount = project.runs.length;
  const runsLabel = `last ${runCount} run${runCount === 1 ? "" : "s"}`;

  return (
    <div className="report">
      <section className="report__hero">
        <div className="report__intro">
          <h1>Data timeliness</h1>
          <p>
            How reliably your dbt marts land against their SLAs — across the{" "}
            {runsLabel}.
          </p>
        </div>
        <div className="kpis">
          <Kpi
            label="On-time rate"
            value={`${(summary.rate * 100).toFixed(1)}%`}
            sub={runsLabel}
            tone={summary.rate >= 0.95 ? "good" : summary.rate >= 0.85 ? "warn" : "bad"}
          />
          <Kpi label="Tracked datasets" value={String(tracked.length)} sub="with an SLA" />
          <Kpi
            label="SLA misses"
            value={String(summary.misses)}
            sub={runsLabel}
            tone={summary.misses === 0 ? "good" : "bad"}
          />
          <Kpi
            label="At risk now"
            value={String(summary.atRiskNow)}
            sub={formatRunDate(selectedRun.date)}
            tone={summary.atRiskNow === 0 ? "good" : "warn"}
          />
        </div>
      </section>

      <section className="report__panel">
        <div className="rt">
          <div className="rt__head">
            <div className="rt__col-dataset">Dataset</div>
            <div className="rt__col-current">
              Current · {formatRunDate(selectedRun.date)}
            </div>
            <div className="rt__col-sla">SLA</div>
            <div className="rt__col-strip">
              <span>Landing times</span>
              <span className="rt__strip-range">
                {formatRunDate(firstDate)} – {formatRunDate(lastDate)}
              </span>
            </div>
            <div className="rt__col-rel">Reliability</div>
            <div className="rt__col-go" />
          </div>

          {tracked.map((m) => {
            const ev = evaluateRun(project, m.uniqueId, selectedRun, typicals[m.uniqueId]);
            const t = typicals[m.uniqueId];
            const c = STATUS_COLORS[ev.status];
            const rel = t.count > 0 ? 1 - t.missRate : 1;
            const missCount = Math.round(t.missRate * t.count);
            return (
              <button
                key={m.uniqueId}
                className="rt__row"
                onClick={() => selectDataset(m.uniqueId, "timeline")}
              >
                <div className="rt__col-dataset">
                  <span
                    className="rt__layer"
                    style={{ background: LAYER_COLORS[m.layer] }}
                    title={LAYER_LABEL[m.layer]}
                  />
                  <span className="rt__ds">
                    <span className="rt__ds-name mono">{m.name}</span>
                    <span className="rt__ds-owner">{m.owner}</span>
                  </span>
                </div>

                <div className="rt__col-current">
                  <StatusBadge status={ev.status} />
                  {ev.landingMin != null && (
                    <span className="rt__current-time">
                      <span className="tnum" style={{ color: c.fg }}>
                        {formatClock(ev.landingMin)}
                      </span>
                      <span className="rt__current-delta tnum">
                        {formatDeltaMinutes(ev.deltaVsTypical)}
                      </span>
                    </span>
                  )}
                </div>

                <div className="rt__col-sla tnum">{project.slas[m.uniqueId].label.replace(" UTC", "")}</div>

                <div className="rt__col-strip" onClick={(e) => e.stopPropagation()}>
                  <LandingStrip uniqueId={m.uniqueId} width={360} height={64} />
                </div>

                <div className="rt__col-rel">
                  <span className="rt__rel-pct tnum">{(rel * 100).toFixed(0)}%</span>
                  <span className="rt__rel-sub">
                    {missCount === 0 ? "no misses" : `${missCount} miss${missCount > 1 ? "es" : ""}`}
                  </span>
                </div>

                <div className="rt__col-go">
                  <ArrowRight size={15} />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="kpi">
      <div className="kpi__label">{label}</div>
      <div className={`kpi__value${tone ? ` kpi__value--${tone}` : ""}`}>{value}</div>
      <div className="kpi__sub">{sub}</div>
    </div>
  );
}

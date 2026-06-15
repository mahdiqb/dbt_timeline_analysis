import { useMemo, useState } from "react";
import { useApp } from "@/app/store";
import { evaluateRun, STATUS_LABEL } from "@/lib/status";
import { STATUS_COLORS, BAR_NEUTRAL, TYPICAL_BAND, SLA_LINE } from "@/lib/palette";
import { formatClock, formatDeltaMinutes, formatRunDate } from "@/lib/time";
import "./LandingStrip.css";

const M = { top: 12, right: 10, bottom: 8, left: 10 };

export function LandingStrip({
  uniqueId,
  width = 360,
  height = 64,
}: {
  uniqueId: string;
  width?: number;
  height?: number;
}) {
  const { project, typicals, runIndex, setRunIndex, selectDataset } = useApp();
  const [hover, setHover] = useState<number | null>(null);

  const innerW = width - M.left - M.right;
  const innerH = height - M.top - M.bottom;

  const data = useMemo(() => {
    const sla = project.slas[uniqueId];
    const days = project.runs.map((run, i) => ({
      i,
      date: run.date,
      ev: evaluateRun(project, uniqueId, run, typicals[uniqueId]),
    }));
    const landings = days
      .map((d) => d.ev.landingMin)
      .filter((v): v is number => v != null);
    const lo = Math.min(...landings, sla?.targetMinutes ?? Infinity);
    const hi = Math.max(...landings, sla?.targetMinutes ?? -Infinity);
    const pad = Math.max((hi - lo) * 0.22, 18);
    const dMin = lo - pad;
    const dMax = hi + pad;
    const y = (v: number) => M.top + innerH - ((v - dMin) / (dMax - dMin)) * innerH;
    return { sla, days, y, typical: typicals[uniqueId] };
  }, [project, typicals, uniqueId, innerH]);

  const n = data.days.length;
  const step = innerW / n;
  const barW = Math.min(step * 0.62, 11);
  const cx = (i: number) => M.left + i * step + step / 2;

  const hoveredDay = hover != null ? data.days[hover] : null;
  const tipX = hover != null ? cx(hover) : 0;
  const tipLeft = Math.max(4, Math.min(width - 150, tipX - 75));

  return (
    <div className="strip" style={{ width }}>
      <svg
        width={width}
        height={height}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="30-day landing times"
      >
        {/* typical landing band (p10–p90) */}
        {data.typical.count > 0 && (
          <rect
            x={M.left}
            width={innerW}
            y={data.y(data.typical.landing.p90)}
            height={Math.max(1, data.y(data.typical.landing.p10) - data.y(data.typical.landing.p90))}
            fill={TYPICAL_BAND}
            rx={2}
          />
        )}

        {/* SLA reference line */}
        {data.sla && (
          <g>
            <line
              x1={M.left}
              x2={M.left + innerW}
              y1={data.y(data.sla.targetMinutes)}
              y2={data.y(data.sla.targetMinutes)}
              stroke={SLA_LINE}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.7}
            />
          </g>
        )}

        {/* per-day bars */}
        {data.days.map((d) => {
          const selected = d.i === runIndex;
          const isHover = d.i === hover;
          if (d.ev.landingMin == null) {
            // skipped / failed — no landing; small marker at baseline
            const c = STATUS_COLORS[d.ev.status];
            return (
              <g key={d.i}>
                <rect
                  x={cx(d.i) - barW / 2}
                  y={M.top + innerH - barW}
                  width={barW}
                  height={barW}
                  rx={2}
                  fill="none"
                  stroke={c.fg}
                  strokeWidth={1.4}
                  opacity={isHover || selected ? 1 : 0.8}
                />
                <line
                  x1={cx(d.i) - barW / 2 + 2}
                  y1={M.top + innerH - barW + 2}
                  x2={cx(d.i) + barW / 2 - 2}
                  y2={M.top + innerH - 2}
                  stroke={c.fg}
                  strokeWidth={1.2}
                />
              </g>
            );
          }
          const yTop = data.y(d.ev.landingMin);
          const fill =
            d.ev.status === "late"
              ? STATUS_COLORS.late.fg
              : d.ev.status === "behind"
                ? STATUS_COLORS.behind.fg
                : BAR_NEUTRAL;
          return (
            <g key={d.i}>
              <rect
                x={cx(d.i) - barW / 2}
                y={yTop}
                width={barW}
                height={Math.max(2, M.top + innerH - yTop)}
                rx={2.5}
                fill={fill}
                opacity={selected || isHover ? 1 : 0.85}
              />
              {selected && (
                <rect
                  x={cx(d.i) - barW / 2 - 1.5}
                  y={yTop - 1.5}
                  width={barW + 3}
                  height={M.top + innerH - yTop + 3}
                  rx={3.5}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1.5}
                />
              )}
            </g>
          );
        })}

        {/* hover hit areas */}
        {data.days.map((d) => (
          <rect
            key={`hit-${d.i}`}
            x={M.left + d.i * step}
            y={0}
            width={step}
            height={height}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(d.i)}
            onClick={() => {
              setRunIndex(d.i);
              selectDataset(uniqueId, "timeline");
            }}
          />
        ))}
      </svg>

      {hoveredDay && (
        <div className="strip__tip" style={{ left: tipLeft }}>
          <div className="strip__tip-date">{formatRunDate(hoveredDay.date)}</div>
          <div className="strip__tip-row">
            <span
              className="strip__tip-dot"
              style={{ background: STATUS_COLORS[hoveredDay.ev.status].fg }}
            />
            {hoveredDay.ev.landingMin != null ? (
              <>
                <span className="tnum strip__tip-time">
                  {formatClock(hoveredDay.ev.landingMin)}
                </span>
                <span className="strip__tip-delta tnum">
                  {formatDeltaMinutes(hoveredDay.ev.deltaVsTypical)}
                </span>
              </>
            ) : (
              <span className="strip__tip-time">{STATUS_LABEL[hoveredDay.ev.status]}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

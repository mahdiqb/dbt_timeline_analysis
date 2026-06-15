import { useMemo, useState } from "react";
import { ParentSize } from "@visx/responsive";
import { useApp } from "@/app/store";
import { evaluateRun, STATUS_LABEL, type TimelinessStatus } from "@/lib/status";
import type { Typical } from "@/lib/stats";
import type { Sla } from "@/types/dbt";
import {
  STATUS_COLORS,
  LAYER_COLORS,
  LAYER_LABEL,
  BAR_NEUTRAL,
  TYPICAL_BAND,
  TYPICAL_LINE,
  SLA_LINE,
  GRID_LINE,
  AXIS_TEXT,
} from "@/lib/palette";
import {
  formatClock,
  formatDuration,
  formatDeltaMinutes,
  formatRunDate,
  formatFullDate,
  formatDayShort,
  isWeekend,
} from "@/lib/time";
import { ArrowRight } from "@/components/common/icons";
import "./HistoricalView.css";

interface DayDatum {
  i: number;
  date: number;
  status: TimelinessStatus;
  startMin: number | null;
  durationMin: number;
  landingMin: number | null;
  deltaVsTypical: number;
  weekend: boolean;
}

type Tone = "good" | "warn" | "bad" | "neutral";

export function HistoricalView() {
  const { project, typicals, selectedId, runIndex, setRunIndex, selectDataset } = useApp();
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  const model = project.modelsById[selectedId];
  const typical = typicals[selectedId];
  const sla = project.slas[selectedId];

  const days = useMemo<DayDatum[]>(
    () =>
      project.runs.map((run, i) => {
        const ev = evaluateRun(project, selectedId, run, typical);
        return {
          i,
          date: run.date,
          status: ev.status,
          startMin: ev.startMin,
          durationMin: ev.durationMin,
          landingMin: ev.landingMin,
          deltaVsTypical: ev.deltaVsTypical,
          weekend: isWeekend(run.date),
        };
      }),
    [project, selectedId, typical],
  );

  const diag = useMemo(() => {
    const ran = days.filter((d) => d.landingMin != null);
    const fails = days.length - ran.length;
    const misses = days.filter((d) => d.status === "late");
    const behind = days.filter((d) => d.status === "behind").length;
    const startedLateDays = ran.filter(
      (d) => d.startMin != null && d.startMin > typical.start.p90,
    ).length;
    const ranLongDays = ran.filter((d) => d.durationMin > typical.duration.p90).length;

    let lateStart = 0;
    let longRun = 0;
    let both = 0;
    let other = 0;
    for (const d of misses) {
      const ls = d.startMin != null && d.startMin > typical.start.p90;
      const lr = d.durationMin > typical.duration.p90;
      if (ls && lr) both += 1;
      else if (ls) lateStart += 1;
      else if (lr) longRun += 1;
      else other += 1;
    }
    const reliability = ran.length ? (ran.length - misses.length) / ran.length : 0;
    return {
      ranCount: ran.length,
      fails,
      misses: misses.length,
      behind,
      startedLateDays,
      ranLongDays,
      lateStart,
      longRun,
      both,
      other,
      reliability,
    };
  }, [days, typical]);

  const { text: diagText, tone: diagTone } = useMemo<{ text: string; tone: Tone }>(() => {
    if (diag.ranCount === 0) {
      return { text: `Never completed across the last ${days.length} runs.`, tone: "bad" };
    }
    if (sla) {
      if (diag.misses === 0) {
        const tail = diag.fails > 0 ? `, though ${diag.fails} didn’t finish` : "";
        return {
          text: `Hit the ${formatClock(sla.targetMinutes)} SLA on every completed run${tail}.`,
          tone: "good",
        };
      }
      const parts: string[] = [];
      if (diag.lateStart) parts.push(`${diag.lateStart} from late starts upstream`);
      if (diag.longRun) parts.push(`${diag.longRun} from long runtimes`);
      if (diag.both) parts.push(`${diag.both} from both at once`);
      if (diag.other) parts.push(`${diag.other} within the usual range`);
      return {
        text: `${diag.misses} SLA miss${diag.misses > 1 ? "es" : ""} in ${days.length} runs — ${joinClauses(parts)}.`,
        tone: diag.misses > 2 ? "bad" : "warn",
      };
    }
    const off = diag.behind + diag.misses;
    return {
      text: `No SLA on this dataset. Usually lands by ${formatClock(typical.landing.p50)}; ran later than usual on ${off} of ${diag.ranCount} runs.`,
      tone: "neutral",
    };
  }, [diag, days.length, sla, typical]);

  const first = project.runs[0].date;
  const last = project.runs[project.runs.length - 1].date;

  return (
    <div className="hist">
      <section className="hist__summary">
        <div className="hist__lead">
          <div className="hist__title">
            <span
              className="hist__layer"
              style={{ color: LAYER_COLORS[model.layer], background: `${LAYER_COLORS[model.layer]}1a` }}
            >
              {LAYER_LABEL[model.layer]}
            </span>
            <h1 className="mono">{model.name}</h1>
            {sla && <span className="hist__sla-chip tnum">SLA {formatClock(sla.targetMinutes)}</span>}
            <button
              className="hist__open"
              onClick={() => selectDataset(selectedId, "timeline")}
            >
              Open in timeline
              <ArrowRight size={14} />
            </button>
          </div>
          <p className="hist__desc">{model.description}</p>
          <p className={`hist__diag hist__diag--${diagTone}`}>{diagText}</p>
        </div>

        <div className="hist__stats">
          <HStat
            label="Reliability"
            value={`${(diag.reliability * 100).toFixed(0)}%`}
            sub={`${diag.ranCount} of ${days.length} ran`}
            tone={diag.reliability >= 0.95 ? "good" : diag.reliability >= 0.85 ? "warn" : "bad"}
          />
          <HStat label="Median landing" value={formatClock(typical.landing.p50)} sub="p50" mono />
          <HStat label="Typical worst" value={formatClock(typical.landing.p90)} sub="p90" mono />
          <HStat
            label="SLA misses"
            value={String(diag.misses)}
            sub={sla ? `in ${days.length} runs` : "no SLA"}
            tone={diag.misses === 0 ? "good" : diag.misses > 2 ? "bad" : "warn"}
          />
          {diag.fails > 0 && (
            <HStat label="Didn’t finish" value={String(diag.fails)} sub="skipped / failed" tone="bad" />
          )}
        </div>
      </section>

      <section className="hist__panel">
        <div className="hist__panel-head">
          <div className="hist__panel-titles">
            <h2>Landing timeline</h2>
            <span className="hist__panel-sub">
              One run per row · {formatRunDate(first)} – {formatRunDate(last)} · newest on top
            </span>
          </div>
          <TimelineLegend hasSla={!!sla} />
        </div>
        <ParentSize debounceTime={0}>
          {({ width }) =>
            width > 0 ? (
              <LandingTimeline
                width={width}
                days={days}
                typical={typical}
                sla={sla}
                selected={runIndex}
                hoverDay={hoverDay}
                setHoverDay={setHoverDay}
                onPick={setRunIndex}
              />
            ) : (
              <div style={{ height: 320 }} />
            )
          }
        </ParentSize>
      </section>

      <section className="hist__breakdown">
        <BreakdownCard
          title="Start time"
          diagnosis={
            diag.startedLateDays === 0
              ? "Always kicked off on schedule"
              : `${diag.startedLateDays} run${diag.startedLateDays > 1 ? "s" : ""} started later than usual`
          }
          tone={diag.startedLateDays === 0 ? "good" : "warn"}
          footer={
            <>
              Bars above the band mean the delay arrived from <strong>upstream</strong> dependencies.
            </>
          }
        >
          {(width) => (
            <MetricChart
              width={width}
              days={days}
              band={typical.start}
              hasTypical={typical.count > 0}
              getValue={(d) => d.startMin}
              format={(v) => formatClock(v)}
              selected={runIndex}
              hoverDay={hoverDay}
              setHoverDay={setHoverDay}
              onPick={setRunIndex}
            />
          )}
        </BreakdownCard>

        <BreakdownCard
          title="Runtime"
          diagnosis={
            diag.ranLongDays === 0
              ? "Always ran in its usual time"
              : `${diag.ranLongDays} run${diag.ranLongDays > 1 ? "s" : ""} ran longer than usual`
          }
          tone={diag.ranLongDays === 0 ? "good" : "warn"}
          footer={
            <>
              Bars above the band mean the model <strong>itself</strong> was the slow step.
            </>
          }
        >
          {(width) => (
            <MetricChart
              width={width}
              days={days}
              band={typical.duration}
              hasTypical={typical.count > 0}
              getValue={(d) => (d.landingMin != null ? d.durationMin : null)}
              format={(v) => formatDuration(v * 60)}
              selected={runIndex}
              hoverDay={hoverDay}
              setHoverDay={setHoverDay}
              onPick={setRunIndex}
            />
          )}
        </BreakdownCard>
      </section>
    </div>
  );
}

/* ---- Hero: per-run start→landing timeline -------------------------------- */

const H_ROW = 20;
const H_BAR = 11;
const H_HEAD = 32;
const H_LABEL = 116;
const H_PADR = 58;

function LandingTimeline({
  width,
  days,
  typical,
  sla,
  selected,
  hoverDay,
  setHoverDay,
  onPick,
}: {
  width: number;
  days: DayDatum[];
  typical: Typical;
  sla: Sla | undefined;
  selected: number;
  hoverDay: number | null;
  setHoverDay: (i: number | null) => void;
  onPick: (i: number) => void;
}) {
  const n = days.length;
  const plotW = Math.max(280, width - H_LABEL - H_PADR);

  const [t0, t1] = useMemo<[number, number]>(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of days) {
      if (d.startMin != null) lo = Math.min(lo, d.startMin);
      if (d.landingMin != null) hi = Math.max(hi, d.landingMin);
    }
    if (typical.count > 0) {
      lo = Math.min(lo, typical.start.p10);
      hi = Math.max(hi, typical.landing.p90);
    }
    if (sla) hi = Math.max(hi, sla.targetMinutes);
    if (!Number.isFinite(lo)) lo = typical.start.p50 || 0;
    if (!Number.isFinite(hi)) hi = sla?.targetMinutes ?? lo + 60;
    lo = Math.floor((lo - 10) / 15) * 15;
    hi = Math.ceil((hi + 12) / 15) * 15;
    return [lo, hi];
  }, [days, typical, sla]);

  const xs = (m: number) => H_LABEL + ((m - t0) / (t1 - t0)) * plotW;
  const height = H_HEAD + n * H_ROW + 14;
  const ordered = useMemo(() => [...days].reverse(), [days]);
  const cyOf = (pos: number) => H_HEAD + pos * H_ROW + H_ROW / 2;
  const labelRight = H_LABEL + plotW + 8;

  const ticks: number[] = [];
  for (let t = Math.ceil(t0 / 30) * 30; t <= t1; t += 30) ticks.push(t);

  const hovered = hoverDay != null ? days[hoverDay] : null;

  return (
    <div className="hist-tl">
      <svg width={width} height={height} onMouseLeave={() => setHoverDay(null)} role="img">
        {/* weekend tint + selected/hover row backgrounds */}
        {ordered.map((d, pos) => {
          const y = H_HEAD + pos * H_ROW;
          const isSel = d.i === selected;
          const isHov = d.i === hoverDay;
          return (
            <g key={`bg-${d.i}`}>
              {d.weekend && (
                <rect x={H_LABEL - 8} y={y} width={plotW + H_PADR} height={H_ROW} fill="var(--panel-inset)" opacity={0.55} />
              )}
              {(isSel || isHov) && (
                <rect x={0} y={y} width={width} height={H_ROW} fill={isSel ? "var(--hover-strong)" : "var(--hover)"} />
              )}
            </g>
          );
        })}

        {/* time-of-day grid + axis */}
        {ticks.map((t) => {
          const x = xs(t);
          const labeled = t % 60 === 0;
          return (
            <g key={t}>
              <line x1={x} x2={x} y1={H_HEAD - 4} y2={height - 8} stroke={GRID_LINE} strokeWidth={1} />
              {labeled && (
                <text x={x} y={H_HEAD - 12} textAnchor="middle" fontSize={11} fontWeight={500} fill={AXIS_TEXT} className="tnum">
                  {formatClock(t)}
                </text>
              )}
            </g>
          );
        })}

        {/* typical landing band + typical start guide */}
        {typical.count > 0 && (
          <>
            <rect
              x={xs(typical.landing.p10)}
              y={H_HEAD - 2}
              width={Math.max(2, xs(typical.landing.p90) - xs(typical.landing.p10))}
              height={height - H_HEAD - 6}
              fill={TYPICAL_BAND}
              opacity={0.75}
            />
            <line
              x1={xs(typical.start.p50)}
              x2={xs(typical.start.p50)}
              y1={H_HEAD - 2}
              y2={height - 8}
              stroke={TYPICAL_LINE}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          </>
        )}

        {/* SLA line + pill */}
        {sla && (
          <g>
            <line
              x1={xs(sla.targetMinutes)}
              x2={xs(sla.targetMinutes)}
              y1={H_HEAD - 4}
              y2={height - 8}
              stroke={SLA_LINE}
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            <g transform={`translate(${xs(sla.targetMinutes)}, ${H_HEAD - 27})`}>
              <rect x={-18} y={0} width={36} height={15} rx={4} fill={SLA_LINE} />
              <text x={0} y={11} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#fff">
                SLA
              </text>
            </g>
          </g>
        )}

        {/* per-run bars */}
        {ordered.map((d, pos) => {
          const cy = cyOf(pos);
          const c = STATUS_COLORS[d.status];
          const isSel = d.i === selected;
          const dim = hoverDay != null && hoverDay !== d.i ? 0.82 : 1;

          if (d.landingMin == null || d.startMin == null) {
            const x = xs(typical.count > 0 ? typical.start.p50 : t0 + 10);
            return (
              <g key={`bar-${d.i}`} opacity={dim}>
                <circle cx={x} cy={cy} r={4.5} fill="none" stroke={c.fg} strokeWidth={1.4} />
                <line x1={x - 2.4} y1={cy - 2.4} x2={x + 2.4} y2={cy + 2.4} stroke={c.fg} strokeWidth={1.3} />
                <text x={labelRight} y={cy + 3.5} fontSize={10.5} fontWeight={600} fill={c.fg}>
                  {STATUS_LABEL[d.status]}
                </text>
              </g>
            );
          }

          const bx1 = xs(d.startMin);
          const bx2 = xs(d.landingMin);
          const w = Math.max(3, bx2 - bx1);
          const fill =
            d.status === "late"
              ? STATUS_COLORS.late.fg
              : d.status === "behind"
                ? STATUS_COLORS.behind.fg
                : BAR_NEUTRAL;
          const labelColor =
            d.status === "late"
              ? STATUS_COLORS.late.fg
              : d.status === "behind"
                ? STATUS_COLORS.behind.fg
                : "var(--ink-2)";
          return (
            <g key={`bar-${d.i}`} opacity={dim}>
              <rect x={bx1} y={cy - H_BAR / 2} width={w} height={H_BAR} rx={3} fill={fill} />
              {isSel && (
                <rect
                  x={bx1 - 1.5}
                  y={cy - H_BAR / 2 - 1.5}
                  width={w + 3}
                  height={H_BAR + 3}
                  rx={4}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1.5}
                />
              )}
              <text x={labelRight} y={cy + 3.5} fontSize={10.5} fontWeight={600} fill={labelColor} className="tnum">
                {formatClock(d.landingMin)}
              </text>
            </g>
          );
        })}

        {/* left gutter mask + day labels */}
        <rect x={0} y={H_HEAD - 6} width={H_LABEL - 8} height={height - H_HEAD} fill="var(--panel)" />
        {ordered.map((d, pos) => {
          const cy = cyOf(pos);
          const isSel = d.i === selected;
          return (
            <text
              key={`lab-${d.i}`}
              x={12}
              y={cy + 3.5}
              fontSize={11}
              fontWeight={isSel ? 700 : d.weekend ? 400 : 500}
              fill={isSel ? "var(--ink)" : d.weekend ? "var(--ink-3)" : "var(--ink-2)"}
              className="tnum"
            >
              {formatDayShort(d.date)}
            </text>
          );
        })}

        {/* hover / click hit rows */}
        {ordered.map((d, pos) => (
          <rect
            key={`hit-${d.i}`}
            x={0}
            y={H_HEAD + pos * H_ROW}
            width={width}
            height={H_ROW}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoverDay(d.i)}
            onClick={() => onPick(d.i)}
          />
        ))}
      </svg>

      {hovered && (
        <TimelineTip
          day={hovered}
          sla={sla}
          x={H_LABEL + plotW * 0.5}
          y={cyOf(n - 1 - hovered.i)}
          width={width}
          height={height}
        />
      )}
    </div>
  );
}

function TimelineTip({
  day,
  sla,
  x,
  y,
  width,
  height,
}: {
  day: DayDatum;
  sla: Sla | undefined;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const c = STATUS_COLORS[day.status];
  const W = 226;
  const left = Math.max(8, Math.min(width - W - 8, x - W / 2));
  const top = Math.max(2, Math.min(height - 118, y - 56));
  const ran = day.landingMin != null && day.startMin != null;
  return (
    <div className="hist-tip" style={{ left, top, width: W }}>
      <div className="hist-tip__head">
        <span className="hist-tip__date">{formatFullDate(day.date)}</span>
        <span className="hist-tip__badge" style={{ background: c.bg, color: c.fg }}>
          {STATUS_LABEL[day.status]}
        </span>
      </div>
      {ran ? (
        <>
          <div className="hist-tip__rows">
            <TipField label="Started" value={formatClock(day.startMin!)} />
            <TipField label="Landed" value={formatClock(day.landingMin!)} accent={c.fg} />
            <TipField label="Runtime" value={formatDuration(day.durationMin * 60)} />
            <TipField label="vs usual" value={formatDeltaMinutes(day.deltaVsTypical)} />
          </div>
          {sla && day.landingMin != null && (
            <div className="hist-tip__sla">
              {day.landingMin > sla.targetMinutes
                ? `Missed ${formatClock(sla.targetMinutes)} SLA by ${Math.round(day.landingMin - sla.targetMinutes)}m`
                : `${Math.round(sla.targetMinutes - day.landingMin)}m before ${formatClock(sla.targetMinutes)} SLA`}
            </div>
          )}
        </>
      ) : (
        <div className="hist-tip__sla">
          {day.status === "error" ? "This model failed on this run." : "Skipped — an upstream model failed."}
        </div>
      )}
    </div>
  );
}

function TipField({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="hist-tip__field">
      <span className="hist-tip__flabel">{label}</span>
      <span className="hist-tip__fvalue tnum" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  );
}

/* ---- Breakdown: start-time and runtime sparkbars ------------------------- */

const CHART_H = 172;

function BreakdownCard({
  title,
  diagnosis,
  tone,
  footer,
  children,
}: {
  title: string;
  diagnosis: string;
  tone: Tone;
  footer: React.ReactNode;
  children: (width: number) => React.ReactNode;
}) {
  return (
    <div className="hist-card">
      <div className="hist-card__head">
        <h3>{title}</h3>
        <span className={`hist-card__diag hist-card__diag--${tone}`}>{diagnosis}</span>
      </div>
      <ParentSize debounceTime={0}>
        {({ width }) => (width > 0 ? children(width) : <div style={{ height: CHART_H }} />)}
      </ParentSize>
      <p className="hist-card__foot">{footer}</p>
    </div>
  );
}

function MetricChart({
  width,
  days,
  band,
  hasTypical,
  getValue,
  format,
  selected,
  hoverDay,
  setHoverDay,
  onPick,
}: {
  width: number;
  days: DayDatum[];
  band: { p10: number; p50: number; p90: number };
  hasTypical: boolean;
  getValue: (d: DayDatum) => number | null;
  format: (v: number) => string;
  selected: number;
  hoverDay: number | null;
  setHoverDay: (i: number | null) => void;
  onPick: (i: number) => void;
}) {
  const M = { top: 16, right: 12, bottom: 14, left: 12 };
  const innerW = width - M.left - M.right;
  const innerH = CHART_H - M.top - M.bottom;

  const values = days.map(getValue).filter((v): v is number => v != null);
  let lo = Math.min(...values, hasTypical ? band.p10 : Infinity);
  let hi = Math.max(...values, hasTypical ? band.p90 : -Infinity);
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi)) hi = lo + 1;
  const pad = Math.max((hi - lo) * 0.18, 4);
  lo = Math.max(0, lo - pad);
  hi = hi + pad;
  const y = (v: number) => M.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH;

  const n = days.length;
  const step = innerW / n;
  const barW = Math.min(step * 0.6, 10);
  const cx = (i: number) => M.left + i * step + step / 2;
  const baseline = M.top + innerH;

  const hovered = hoverDay != null ? days[hoverDay] : null;
  const hoveredVal = hovered ? getValue(hovered) : null;

  return (
    <div className="hist-metric">
      <svg width={width} height={CHART_H} onMouseLeave={() => setHoverDay(null)} role="img">
        {/* typical band + median */}
        {hasTypical && (
          <>
            <rect
              x={M.left}
              width={innerW}
              y={y(band.p90)}
              height={Math.max(1, y(band.p10) - y(band.p90))}
              fill={TYPICAL_BAND}
              rx={2}
            />
            <line
              x1={M.left}
              x2={M.left + innerW}
              y1={y(band.p50)}
              y2={y(band.p50)}
              stroke={TYPICAL_LINE}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text x={M.left} y={11} textAnchor="start" fontSize={10} fontWeight={500} fill={AXIS_TEXT}>
              usual {format(band.p50)}
            </text>
          </>
        )}

        {days.map((d, i) => {
          const v = getValue(d);
          const isSel = d.i === selected;
          const isHov = d.i === hoverDay;
          const isMiss = d.status === "late";

          if (v == null) {
            // skipped / failed — small hollow marker at baseline
            const c = STATUS_COLORS[d.status];
            return (
              <g key={`mk-${d.i}`}>
                <line
                  x1={cx(i) - 3}
                  y1={baseline - 3}
                  x2={cx(i) + 3}
                  y2={baseline + 3}
                  stroke={c.fg}
                  strokeWidth={1.3}
                  opacity={0.8}
                />
                <line
                  x1={cx(i) - 3}
                  y1={baseline + 3}
                  x2={cx(i) + 3}
                  y2={baseline - 3}
                  stroke={c.fg}
                  strokeWidth={1.3}
                  opacity={0.8}
                />
              </g>
            );
          }

          const anomalous = hasTypical && v > band.p90;
          const top = y(v);
          const fill = anomalous ? STATUS_COLORS.behind.fg : BAR_NEUTRAL;
          return (
            <g key={`bar-${d.i}`}>
              <rect
                x={cx(i) - barW / 2}
                y={top}
                width={barW}
                height={Math.max(2, baseline - top)}
                rx={2.5}
                fill={fill}
                opacity={isSel || isHov ? 1 : 0.88}
              />
              {isSel && (
                <rect
                  x={cx(i) - barW / 2 - 1.5}
                  y={top - 1.5}
                  width={barW + 3}
                  height={baseline - top + 3}
                  rx={3.5}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1.5}
                />
              )}
              {isMiss && (
                <circle cx={cx(i)} cy={baseline + 5} r={2.1} fill={STATUS_COLORS.late.fg} />
              )}
            </g>
          );
        })}

        {/* hit areas */}
        {days.map((d, i) => (
          <rect
            key={`hit-${d.i}`}
            x={M.left + i * step}
            y={0}
            width={step}
            height={CHART_H}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoverDay(d.i)}
            onClick={() => onPick(d.i)}
          />
        ))}
      </svg>

      {hovered && hoveredVal != null && (
        <div
          className="hist-metric__tip"
          style={{ left: Math.max(4, Math.min(width - 132, cx(hovered.i) - 64)) }}
        >
          <span className="hist-metric__tip-date">{formatRunDate(hovered.date)}</span>
          <span className="hist-metric__tip-val tnum">{format(hoveredVal)}</span>
          {hasTypical && (
            <span className="hist-metric__tip-delta tnum">
              {formatDeltaMinutes(hoveredVal - band.p50)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- bits ---------------------------------------------------------------- */

function HStat({
  label,
  value,
  sub,
  tone,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  mono?: boolean;
}) {
  return (
    <div className="hist-stat">
      <div className="hist-stat__label">{label}</div>
      <div className={`hist-stat__value${mono ? " mono hist-stat__value--mono" : " tnum"}${tone ? ` hist-stat__value--${tone}` : ""}`}>
        {value}
      </div>
      {sub && <div className="hist-stat__sub">{sub}</div>}
    </div>
  );
}

function TimelineLegend({ hasSla }: { hasSla: boolean }) {
  return (
    <div className="hist-legend">
      <span className="hist-legend__item">
        <span className="hist-legend__bar" style={{ background: BAR_NEUTRAL }} />
        On time
      </span>
      <span className="hist-legend__item">
        <span className="hist-legend__bar" style={{ background: STATUS_COLORS.behind.fg }} />
        Behind
      </span>
      <span className="hist-legend__item">
        <span className="hist-legend__bar" style={{ background: STATUS_COLORS.late.fg }} />
        Late
      </span>
      <span className="hist-legend__sep" />
      <span className="hist-legend__item">
        <span className="hist-legend__band" />
        Typical
      </span>
      {hasSla && (
        <span className="hist-legend__item">
          <span className="hist-legend__sla" />
          SLA
        </span>
      )}
    </div>
  );
}

function joinClauses(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

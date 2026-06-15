import { useMemo, useRef, useState } from "react";
import { STATUS_COLORS, LAYER_COLORS, GRID_LINE, AXIS_TEXT, TYPICAL_BAND, SLA_LINE } from "@/lib/palette";
import { STATUS_LABEL, type TimelinessStatus } from "@/lib/status";
import { formatClock, formatDeltaMinutes, formatDuration, rowsAffectedLabel } from "@/lib/time";

export interface GanttRow {
  id: string;
  name: string;
  owner: string;
  layer: "source" | "staging" | "intermediate" | "marts";
  status: TimelinessStatus;
  startMin: number;
  endMin: number;
  durationMin: number;
  landingMin: number | null;
  deltaVsTypical: number;
  hasSla: boolean;
  slaMin: number | null;
  typical: { count: number; startP10: number; landP50: number; landP90: number };
  isBottleneck: boolean;
  rowsAffected: number | null;
}

const ROW_H = 34;
const HEADER_H = 44;
const LABEL_W = 256;
const PAD_R = 30;
const BAR_H = 15;
const BAND_H = 19;
const BOTTLENECK_ARC = "#3f434b";

const edgeKey = (from: string, to: string) => `${from}|${to}`;

export function Gantt({
  width,
  rows,
  edges,
  pathEdges,
  domain,
  targetSla,
  onSelect,
}: {
  width: number;
  rows: GanttRow[];
  edges: Array<{ from: string; to: string }>;
  pathEdges: Set<string>;
  domain: [number, number];
  targetSla: number | null;
  onSelect: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const plotW = Math.max(360, width - LABEL_W - PAD_R);
  const [t0, t1] = domain;
  const xs = (min: number) => LABEL_W + ((min - t0) / (t1 - t0)) * plotW;
  const height = HEADER_H + rows.length * ROW_H + 16;

  const rowIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.id, i));
    return m;
  }, [rows]);

  const cyOf = (i: number) => HEADER_H + i * ROW_H + ROW_H / 2;

  // axis ticks every 30 min, labels every 60
  const ticks: number[] = [];
  for (let t = Math.ceil(t0 / 30) * 30; t <= t1; t += 30) ticks.push(t);

  function handleMove(e: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = e.clientY - rect.top;
    const i = Math.floor((y - HEADER_H) / ROW_H);
    if (i >= 0 && i < rows.length && y >= HEADER_H) {
      setHoverId(rows[i].id);
      setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setHoverId(null);
      setTip(null);
    }
  }

  const hoverRow = hoverId ? rows[rowIndex.get(hoverId)!] : null;

  return (
    <div className="gantt__wrap" style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={() => {
          setHoverId(null);
          setTip(null);
        }}
        onClick={() => hoverId && onSelect(hoverId)}
        style={{ cursor: hoverId ? "pointer" : "default" }}
      >
        {/* vertical grid + top axis labels */}
        {ticks.map((t) => {
          const x = xs(t);
          const labeled = t % 60 === 0;
          return (
            <g key={t}>
              <line
                x1={x}
                x2={x}
                y1={HEADER_H - 6}
                y2={height - 8}
                stroke={GRID_LINE}
                strokeWidth={1}
              />
              {labeled && (
                <text
                  x={x}
                  y={HEADER_H - 14}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={500}
                  fill={AXIS_TEXT}
                  className="tnum"
                >
                  {formatClock(t)}
                </text>
              )}
            </g>
          );
        })}

        {/* hovered row background */}
        {hoverRow && (
          <rect
            x={0}
            y={HEADER_H + rowIndex.get(hoverRow.id)! * ROW_H}
            width={width}
            height={ROW_H}
            fill="var(--hover)"
          />
        )}

        {/* typical bands */}
        {rows.map((r, i) => {
          if (r.typical.count === 0) return null;
          const x1 = xs(r.typical.startP10);
          const x2 = xs(r.typical.landP90);
          const cy = cyOf(i);
          return (
            <rect
              key={`band-${r.id}`}
              x={x1}
              y={cy - BAND_H / 2}
              width={Math.max(2, x2 - x1)}
              height={BAND_H}
              rx={5}
              fill={TYPICAL_BAND}
              opacity={hoverId && hoverId !== r.id ? 0.5 : 1}
            />
          );
        })}

        {/* dependency arcs */}
        {edges.map(({ from, to }) => {
          const pi = rowIndex.get(from);
          const ci = rowIndex.get(to);
          if (pi == null || ci == null) return null;
          const parent = rows[pi];
          const child = rows[ci];
          const x1 = xs(parent.endMin);
          const y1 = cyOf(pi);
          const x2 = xs(child.startMin);
          const y2 = cyOf(ci);
          const isPath = pathEdges.has(edgeKey(from, to));
          const touchesHover = hoverId === from || hoverId === to;
          const midx = x1 + (x2 - x1) * 0.5;
          const d = `M ${x1} ${y1} C ${midx} ${y1}, ${midx} ${y2}, ${x2} ${y2}`;
          let stroke = GRID_LINE;
          let sw = 1;
          let op = 0.9;
          if (isPath) {
            stroke = BOTTLENECK_ARC;
            sw = 1.75;
          } else {
            stroke = "#d3d7df";
          }
          if (hoverId) {
            if (touchesHover) {
              stroke = isPath ? BOTTLENECK_ARC : "#9aa0ab";
              sw = isPath ? 2 : 1.5;
              op = 1;
            } else {
              op = 0.28;
            }
          }
          return (
            <path
              key={edgeKey(from, to)}
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
              opacity={op}
            />
          );
        })}

        {/* target SLA line (under bars so margins read; bars sit on top) */}
        {targetSla != null && (
          <g>
            <line
              x1={xs(targetSla)}
              x2={xs(targetSla)}
              y1={HEADER_H - 6}
              y2={height - 8}
              stroke={SLA_LINE}
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
            <g transform={`translate(${xs(targetSla)}, ${HEADER_H - 30})`}>
              <rect x={-20} y={0} width={40} height={16} rx={4} fill={SLA_LINE} />
              <text x={0} y={11} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
                SLA
              </text>
            </g>
          </g>
        )}

        {/* bars + markers */}
        {rows.map((r, i) => {
          const cy = cyOf(i);
          const c = STATUS_COLORS[r.status];
          const dim = hoverId && hoverId !== r.id ? 0.4 : 1;
          const ran = r.status !== "skipped" && r.status !== "error";
          if (!ran) {
            // skipped / failed marker at ready point
            const x = xs(r.startMin);
            return (
              <g key={`bar-${r.id}`} opacity={dim}>
                <circle cx={x} cy={cy} r={5.5} fill="none" stroke={c.fg} strokeWidth={1.5} />
                <line x1={x - 3} y1={cy - 3} x2={x + 3} y2={cy + 3} stroke={c.fg} strokeWidth={1.4} />
                <text x={x + 11} y={cy + 4} fontSize={11} fontWeight={600} fill={c.fg}>
                  {STATUS_LABEL[r.status]}
                </text>
              </g>
            );
          }
          const bx1 = xs(r.startMin);
          const bx2 = xs(r.endMin);
          const w = Math.max(3, bx2 - bx1);
          return (
            <g key={`bar-${r.id}`} opacity={dim}>
              <rect
                x={bx1}
                y={cy - BAR_H / 2}
                width={w}
                height={BAR_H}
                rx={4}
                fill={c.fg}
              />
              {/* per-row SLA tick for other tracked datasets */}
              {r.hasSla && r.slaMin != null && (
                <line
                  x1={xs(r.slaMin)}
                  x2={xs(r.slaMin)}
                  y1={cy - BAR_H / 2 - 3}
                  y2={cy + BAR_H / 2 + 3}
                  stroke={SLA_LINE}
                  strokeWidth={1.25}
                  opacity={0.65}
                />
              )}
              {/* landing-time label just past the bar end */}
              {r.landingMin != null && w > 10 && (
                <text
                  x={bx2 + 6}
                  y={cy + 4}
                  fontSize={11}
                  fontWeight={600}
                  fill={r.status === "late" ? c.fg : "var(--ink-3)"}
                  className="tnum"
                >
                  {formatClock(r.landingMin)}
                </text>
              )}
            </g>
          );
        })}

        {/* left gutter mask + labels */}
        <rect x={0} y={HEADER_H - 8} width={LABEL_W - 8} height={height - HEADER_H} fill="var(--panel)" />
        {rows.map((r, i) => {
          const cy = cyOf(i);
          const active = hoverId === r.id;
          return (
            <g key={`lbl-${r.id}`}>
              {r.isBottleneck && (
                <rect x={4} y={cy - 11} width={3} height={22} rx={1.5} fill={BOTTLENECK_ARC} />
              )}
              <circle cx={18} cy={cy} r={4} fill={LAYER_COLORS[r.layer]} />
              <text
                x={30}
                y={cy - 1}
                fontSize={12.5}
                fontWeight={r.isBottleneck ? 600 : 500}
                fill={active ? "var(--ink)" : "var(--ink)"}
                fontFamily="var(--font-mono)"
              >
                {r.name}
              </text>
              <text x={30} y={cy + 11} fontSize={10.5} fill="var(--ink-3)">
                {r.owner}
                {r.hasSla && r.slaMin != null ? ` · SLA ${formatClock(r.slaMin)}` : ""}
              </text>
            </g>
          );
        })}

        {/* axis baseline */}
        <line x1={LABEL_W} x2={width - PAD_R} y1={HEADER_H - 6} y2={HEADER_H - 6} stroke={GRID_LINE} />
      </svg>

      {hoverRow && tip && (
        <GanttTooltip row={hoverRow} x={tip.x} y={tip.y} containerW={width} />
      )}
    </div>
  );
}

function GanttTooltip({
  row,
  x,
  y,
  containerW,
}: {
  row: GanttRow;
  x: number;
  y: number;
  containerW: number;
}) {
  const c = STATUS_COLORS[row.status];
  const W = 248;
  const left = Math.max(8, Math.min(containerW - W - 8, x + 16));
  const ran = row.status !== "skipped" && row.status !== "error";
  return (
    <div className="gantt-tip" style={{ left, top: y + 18, width: W }}>
      <div className="gantt-tip__head">
        <span className="mono gantt-tip__name">{row.name}</span>
        <span className="gantt-tip__badge" style={{ background: c.bg, color: c.fg }}>
          {STATUS_LABEL[row.status]}
        </span>
      </div>
      {ran ? (
        <>
          <div className="gantt-tip__rows">
            <Field label="Started" value={formatClock(row.startMin)} />
            <Field label="Landed" value={formatClock(row.endMin)} accent={c.fg} />
            <Field label="Duration" value={formatDuration(row.durationMin * 60)} />
            <Field label="vs typical" value={formatDeltaMinutes(row.deltaVsTypical)} />
          </div>
          {row.hasSla && row.slaMin != null && (
            <div className="gantt-tip__sla">
              {row.landingMin != null && row.landingMin > row.slaMin
                ? `Missed ${formatClock(row.slaMin)} SLA by ${Math.round(row.landingMin - row.slaMin)}m`
                : `${Math.round(row.slaMin - (row.landingMin ?? 0))}m before ${formatClock(row.slaMin)} SLA`}
            </div>
          )}
          {row.rowsAffected != null && (
            <div className="gantt-tip__meta">{rowsAffectedLabel(row.rowsAffected)} rows</div>
          )}
        </>
      ) : (
        <div className="gantt-tip__sla">
          {row.status === "error"
            ? "This model failed on this run."
            : "Skipped — an upstream model failed."}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="gantt-tip__field">
      <span className="gantt-tip__flabel">{label}</span>
      <span className="gantt-tip__fvalue tnum" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  );
}

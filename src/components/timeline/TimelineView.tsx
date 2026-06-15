import { useMemo, useState } from "react";
import { ParentSize } from "@visx/responsive";
import { useApp } from "@/app/store";
import { lineageOf, depthMap, edgesWithin } from "@/lib/lineage";
import { bottleneckPath } from "@/lib/bottleneck";
import { evaluateRun } from "@/lib/status";
import { minutesAfter, formatClock, formatRunDate } from "@/lib/time";
import { LAYER_COLORS, LAYER_LABEL, STATUS_COLORS, TYPICAL_BAND, SLA_LINE } from "@/lib/palette";
import { StatusBadge } from "@/components/common/StatusDot";
import { Segmented } from "@/components/common/Segmented";
import { Gantt, type GanttRow } from "./Gantt";
import "./TimelineView.css";

type Mode = "full" | "bottleneck";

export function TimelineView() {
  const { project, typicals, selectedRun, selectedId, selectDataset } = useApp();
  const [mode, setMode] = useState<Mode>("full");

  const target = selectedId;
  const model = project.modelsById[target];

  const data = useMemo(() => {
    const run = selectedRun;
    const lineageIds = lineageOf(project, target);
    const depths = depthMap(project, lineageIds);
    const path = bottleneckPath(project, run, target);
    const pathSet = new Set(path);

    const buildRow = (id: string): GanttRow => {
      const m = project.modelsById[id];
      const r = run.results[id];
      const t = typicals[id];
      const ev = evaluateRun(project, id, run, t);
      const startMin = minutesAfter(run.date, r.startedAt);
      const endMin = minutesAfter(run.date, r.completedAt);
      return {
        id,
        name: m.name,
        owner: m.owner,
        layer: m.layer,
        status: ev.status,
        startMin,
        endMin,
        durationMin: r.executionSeconds / 60,
        landingMin: ev.landingMin,
        deltaVsTypical: ev.deltaVsTypical,
        hasSla: ev.hasSla,
        slaMin: ev.slaMin,
        typical: {
          count: t.count,
          startP10: t.start.p10,
          landP50: t.landing.p50,
          landP90: t.landing.p90,
        },
        isBottleneck: pathSet.has(id),
        rowsAffected: r.rowsAffected,
      };
    };

    const displayedIds = mode === "full" ? lineageIds : path;
    const rows = displayedIds
      .map(buildRow)
      .sort(
        (a, b) =>
          (depths.get(b.id) ?? 0) - (depths.get(a.id) ?? 0) || a.startMin - b.startMin,
      );

    // domain
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of rows) {
      lo = Math.min(lo, r.startMin);
      hi = Math.max(hi, r.endMin);
    }
    const targetSla = project.slas[target]?.targetMinutes ?? null;
    if (targetSla != null) hi = Math.max(hi, targetSla);
    lo = Math.floor((lo - 12) / 15) * 15;
    hi = Math.ceil((hi + 18) / 15) * 15;

    const edges = edgesWithin(project, displayedIds);
    const pathEdges = new Set<string>();
    for (let i = 0; i < path.length - 1; i++) {
      // path[i] is the child, path[i+1] the gating parent
      pathEdges.add(`${path[i + 1]}|${path[i]}`);
    }

    const targetEv = evaluateRun(project, target, run, typicals[target]);
    const criticalRoot = path[path.length - 1];

    return {
      rows,
      edges,
      pathEdges,
      domain: [lo, hi] as [number, number],
      targetSla,
      lineageCount: lineageIds.length,
      pathCount: path.length,
      targetEv,
      criticalRoot,
    };
  }, [project, typicals, selectedRun, target, mode]);

  const sla = project.slas[target];
  const ev = data.targetEv;
  const critical = project.modelsById[data.criticalRoot];

  // SLA-margin sentence
  let sentence: { text: string; tone: "good" | "warn" | "bad" | "neutral" };
  if (ev.status === "error" || ev.status === "skipped") {
    sentence = { text: "Did not complete on this run", tone: "bad" };
  } else if (ev.hasSla && ev.slaMin != null && ev.landingMin != null) {
    if (ev.landingMin > ev.slaMin) {
      sentence = {
        text: `Missed the ${formatClock(ev.slaMin)} SLA by ${Math.round(ev.landingMin - ev.slaMin)} min`,
        tone: "bad",
      };
    } else {
      sentence = {
        text: `Landed ${Math.round(ev.slaMin - ev.landingMin)} min ahead of the ${formatClock(ev.slaMin)} SLA`,
        tone: ev.status === "behind" ? "warn" : "good",
      };
    }
  } else {
    sentence = {
      text: ev.landingMin != null ? `Landed at ${formatClock(ev.landingMin)} UTC` : "—",
      tone: "neutral",
    };
  }

  return (
    <div className="timeline">
      <section className="tl-summary">
        <div className="tl-summary__lead">
          <div className="tl-summary__title">
            <span
              className="tl-summary__layer"
              style={{ color: LAYER_COLORS[model.layer], background: `${LAYER_COLORS[model.layer]}1a` }}
            >
              {LAYER_LABEL[model.layer]}
            </span>
            <h1 className="mono">{model.name}</h1>
            <StatusBadge status={ev.status} />
          </div>
          <p className="tl-summary__desc">{model.description}</p>
          <p className={`tl-summary__sentence tl-summary__sentence--${sentence.tone}`}>
            {sentence.text}
            <span className="tl-summary__sentence-day"> · {formatRunDate(selectedRun.date)}</span>
          </p>
        </div>

        <div className="tl-stats">
          <Stat
            label="Landed"
            value={ev.landingMin != null ? formatClock(ev.landingMin) : "—"}
            accent={STATUS_COLORS[ev.status].fg}
          />
          <Stat label="SLA target" value={sla ? formatClock(sla.targetMinutes) : "none"} />
          <Stat
            label="Bottleneck"
            value={`${data.pathCount}`}
            sub={`of ${data.lineageCount} models`}
          />
          <Stat label="Critical input" value={critical?.name ?? "—"} mono sub={critical?.owner} />
        </div>
      </section>

      <section className="tl-controls">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          ariaLabel="Lineage scope"
          options={[
            { value: "full", label: `Full lineage · ${data.lineageCount}` },
            { value: "bottleneck", label: `Bottleneck path · ${data.pathCount}` },
          ]}
        />
        <Legend />
      </section>

      <section className="tl-chart">
        <ParentSize debounceTime={0}>
          {({ width }) =>
            width > 0 ? (
              <Gantt
                width={width}
                rows={data.rows}
                edges={data.edges}
                pathEdges={data.pathEdges}
                domain={data.domain}
                targetSla={data.targetSla}
                onSelect={(id) => selectDataset(id, "timeline")}
              />
            ) : (
              <div style={{ height: 200 }} />
            )
          }
        </ParentSize>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  mono?: boolean;
}) {
  return (
    <div className="tl-stat">
      <div className="tl-stat__label">{label}</div>
      <div
        className={`tl-stat__value${mono ? " mono tl-stat__value--mono" : " tnum"}`}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {sub && <div className="tl-stat__sub">{sub}</div>}
    </div>
  );
}

function Legend() {
  return (
    <div className="tl-legend">
      {(["on_time", "behind", "late"] as const).map((s) => (
        <span key={s} className="tl-legend__item">
          <span className="tl-legend__bar" style={{ background: STATUS_COLORS[s].fg }} />
          {STATUS_COLORS[s].label}
        </span>
      ))}
      <span className="tl-legend__sep" />
      <span className="tl-legend__item">
        <span className="tl-legend__band" style={{ background: TYPICAL_BAND }} />
        Typical
      </span>
      <span className="tl-legend__item">
        <span className="tl-legend__sla" style={{ borderColor: SLA_LINE }} />
        SLA
      </span>
      <span className="tl-legend__item">
        <span className="tl-legend__rail" />
        Bottleneck path
      </span>
    </div>
  );
}

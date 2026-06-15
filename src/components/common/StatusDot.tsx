import { STATUS_COLORS } from "@/lib/palette";
import type { TimelinessStatus } from "@/lib/status";
import "./common.css";

export function StatusDot({
  status,
  size = 8,
  ring = false,
}: {
  status: TimelinessStatus;
  size?: number;
  ring?: boolean;
}) {
  const c = STATUS_COLORS[status];
  return (
    <span
      className="status-dot"
      style={{
        width: size,
        height: size,
        background: c.fg,
        boxShadow: ring ? `0 0 0 ${Math.max(2, size / 3)}px ${c.bg}` : undefined,
      }}
      aria-hidden
    />
  );
}

export function StatusBadge({ status }: { status: TimelinessStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <span className="status-badge" style={{ background: c.bg, color: c.fg }}>
      <span className="status-badge__dot" style={{ background: c.fg }} />
      {c.label}
    </span>
  );
}

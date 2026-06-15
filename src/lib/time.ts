// Time helpers. All formatting is done in UTC so the early-morning batch
// window reads consistently regardless of the viewer's timezone.

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

/** Minutes elapsed since a run's reference midnight. */
export function minutesAfter(runDate: number, ts: number): number {
  return (ts - runDate) / MINUTE_MS;
}

/** "05:30" from minutes-after-midnight. */
export function formatClock(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "05:30" from an absolute epoch ms, in UTC. */
export function formatClockMs(ts: number): string {
  return dayjs.utc(ts).format("HH:mm");
}

/** Compact duration from seconds: "8s", "12m", "1h 04m". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = seconds / 60;
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Signed minutes as "+14m" / "−6m" (note: true minus sign). */
export function formatDeltaMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded === 0) return "on pace";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded)}m`;
}

/** "Sun, May 31". */
export function formatRunDate(runDate: number): string {
  return dayjs.utc(runDate).format("ddd, MMM D");
}

/** "May 31, 2026". */
export function formatFullDate(runDate: number): string {
  return dayjs.utc(runDate).format("MMM D, YYYY");
}

/** Short weekday letter for dense strips: "M", "T"… */
export function weekdayLetter(runDate: number): string {
  return dayjs.utc(runDate).format("dd").charAt(0);
}

/** Compact day label for dense row gutters: "Sun 31". */
export function formatDayShort(runDate: number): string {
  return dayjs.utc(runDate).format("ddd D");
}

export function isWeekend(runDate: number): boolean {
  const d = dayjs.utc(runDate).day();
  return d === 0 || d === 6;
}

export function rowsAffectedLabel(rows: number | null): string {
  if (rows == null) return "—";
  if (rows >= 1_000_000) return `${(rows / 1_000_000).toFixed(1)}M`;
  if (rows >= 1_000) return `${(rows / 1_000).toFixed(0)}K`;
  return String(rows);
}

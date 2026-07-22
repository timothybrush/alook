/**
 * Local-timezone ISO-8601 helpers.
 *
 * The daemon presents time to the agent in its LOCAL timezone (with offset,
 * e.g. `2026-06-25T17:11:05+08:00`) so `pulledAt`, wake-text timestamps, and
 * per-message `.time` fields all agree with what the user sees on their
 * machine. Server-side timestamps arrive as UTC (`...Z`); these helpers do the
 * one-way conversion at the CLI/router boundary — nothing else in the daemon
 * needs to know about timezones.
 */

/**
 * Format a `Date` as local-tz ISO-8601 with milliseconds and offset, e.g.
 * `2026-06-25T17:11:05.482+08:00`. Millisecond precision is deliberate — the
 * agent sees `pulledAt`, wake-text timestamps, and `message.time` at this
 * resolution, and second-only granularity would collapse sub-second stages
 * (message-write / wake-dispatch / prompt-hand-off) into identical strings.
 */
export function localISOString(now: Date): string {
  const tzOffset = -now.getTimezoneOffset();
  const sign = tzOffset >= 0 ? "+" : "-";
  const abs = Math.abs(tzOffset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}${sign}${hh}:${mm}`;
}

/** `new Date()` formatted in local-tz ISO-8601 with milliseconds and offset. */
export function nowLocalISO(): string {
  return localISOString(new Date());
}

/**
 * Convert a UTC ISO-8601 string (server-stamped, ending in `Z`) into local-tz
 * ISO-8601 with milliseconds and offset. Non-parseable input is returned
 * unchanged — the CLI shouldn't drop a real message just because its `.time`
 * didn't round-trip.
 */
export function toLocalISO(iso: string): string {
  if (!iso) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return localISOString(d);
}

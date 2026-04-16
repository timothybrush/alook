export function parseRetryAfterSeconds(headers: Headers): number | null {
  const raw = headers.get("X-Retry-After") ?? headers.get("Retry-After")
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

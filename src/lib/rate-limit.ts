/**
 * Simple in-memory login limiter: 5 failed attempts per 15 minutes
 * per account. Good enough for a single server at this scale.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

function recent(key: string) {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, list);
  return list;
}

export function isLocked(key: string) {
  return recent(key).length >= MAX_FAILURES;
}
export function recordFailure(key: string) {
  recent(key).push(Date.now());
}
export function clearFailures(key: string) {
  failures.delete(key);
}

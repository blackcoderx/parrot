// How long ago a subject was last studied, for the home screen and subject pages.

/** A subject untouched for this many days (or never studied) is flagged as neglected. */
export const STALE_DAYS = 7;

/** Whole local calendar days from `then` to `now` (0 = today). */
function daysAgo(then: number, now: number): number {
  const a = new Date(then);
  const b = new Date(now);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function isStale(lastStudied: number | null, now: number): boolean {
  return lastStudied === null || daysAgo(lastStudied, now) >= STALE_DAYS;
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", or "never". */
export function formatStudied(lastStudied: number | null, now: number): string {
  if (lastStudied === null) return "never";
  const days = daysAgo(lastStudied, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

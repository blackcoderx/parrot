// How long ago a subject was last studied, for the home screen and subject pages, and which
// subject the home screen suggests studying next.

import type { SubjectSummary } from "@/types";

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

/** The compact form for subject tiles: "today", "1d", "12d", "3w", "2mo", or "never". */
export function formatStudiedShort(lastStudied: number | null, now: number): string {
  if (lastStudied === null) return "never";
  const days = daysAgo(lastStudied, now);
  if (days <= 0) return "today";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

/** What the Study next card offers: study its cards, read its last file, or add a file. */
export type StudyNextAction = "study" | "read" | "add";

/**
 * The subject that needs you most: the longest-neglected stale one (more due cards break
 * ties), else the one with the most due cards. Stale subjects with cards or files come
 * before empty ones, which only need a file. Null when nothing is stale or due.
 */
export function pickStudyNext(
  subjects: SubjectSummary[],
  now: number,
): { subject: SubjectSummary; action: StudyNextAction } | null {
  const stale = subjects
    .filter((s) => isStale(s.last_studied, now))
    .sort((a, b) => (a.last_studied ?? 0) - (b.last_studied ?? 0) || b.due - a.due);
  const subject =
    stale.find((s) => s.study_count > 0 || s.last_doc_id) ??
    stale[0] ??
    subjects.filter((s) => s.due > 0).sort((a, b) => b.due - a.due)[0];
  if (!subject) return null;
  const action = subject.study_count > 0 ? "study" : subject.last_doc_id ? "read" : "add";
  return { subject, action };
}

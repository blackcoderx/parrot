import "server-only";

import { focusDayCounts } from "./db";
import type { FocusStats } from "@/types";

/** A local calendar day as the client sends it. */
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function prevDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Streak = consecutive days with at least one finished focus session, counted back from
 * `today` — or from yesterday when nothing is finished yet today, so a streak stays alive
 * until the day is over.
 */
export function focusStats(today: string): FocusStats {
  const counts = focusDayCounts();
  const todayCount = counts.get(today) ?? 0;
  let day = todayCount > 0 ? today : prevDay(today);
  let streak = 0;
  while (counts.has(day)) {
    streak++;
    day = prevDay(day);
  }
  return { streak, today: todayCount };
}

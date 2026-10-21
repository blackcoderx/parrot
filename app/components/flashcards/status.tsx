import type { CardStatus } from "@/types";
import styles from "./StatusBadge.module.css";

export const STATUSES: CardStatus[] = ["new", "learning", "familiar", "confident", "mastered"];

export const STATUS_LABEL: Record<CardStatus, string> = {
  new: "New",
  learning: "Learning",
  familiar: "Familiar",
  confident: "Confident",
  mastered: "Mastered",
};

const STATUS_HELP: Record<CardStatus, string> = {
  new: "Not studied yet",
  learning: "Being learned, or relearned after forgetting it",
  familiar: "Remembered for under a week",
  confident: "Remembered for one to three weeks",
  mastered: "Remembered for three weeks or more",
};

/** A card's status chip; its colour comes from `data-status`. */
export function StatusBadge({ status, className }: { status: CardStatus; className?: string }) {
  return (
    <span
      className={className ? `${styles.badge} ${className}` : styles.badge}
      data-status={status}
      title={STATUS_HELP[status]}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A scheduling gap, compactly: "1m", "10m", "5h", "3d", "2mo", "1.5y". */
export function formatInterval(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Number((days / 365).toFixed(1))}y`;
}

/** When a card is due, relative to `now`: "New", "Due now" or "In 3d". */
export function formatDue(due: number | null, now: number): string {
  if (due === null) return "New";
  if (due <= now) return "Due now";
  return `In ${formatInterval(due - now)}`;
}

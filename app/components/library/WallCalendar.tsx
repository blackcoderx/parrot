"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { getJson, sendJson } from "@/components/api";
import { TrashIcon } from "@/components/TrashIcon";
import type { Deadline } from "@/types";
import { PencilIcon } from "./Subjects";
import libraryStyles from "./Library.module.css";
import styles from "./WallCalendar.module.css";

const DAY_MS = 86_400_000;
// The count the calendar last showed, so the first visit of a new day can turn that page over.
const SEEN_KEY = "parrot:wall-calendar";

/** What's printed on one page of the calendar. */
interface Face {
  id: string;
  title: string;
  due: string;
  days: number;
}

/**
 * The home screen's wall calendar: a tear-off pad hanging from a nail that counts down the days
 * to the nearest upcoming deadline. When the count changes (a new day, or a nearer deadline) the
 * old page flips up over the binding. Clicking it opens every deadline, where they're added,
 * edited and removed.
 */
export function WallCalendar({
  initialDeadlines,
  now,
}: {
  initialDeadlines: Deadline[];
  now: number;
}) {
  const [deadlines, setDeadlines] = useState(initialDeadlines);
  const today = localDay(now);
  const upcoming = deadlines.filter((d) => d.due >= today);
  const next = upcoming[0];
  const face: Face | null = next
    ? { id: next.id, title: next.title, due: next.due, days: daysBetween(today, next.due) }
    : null;

  // When the page's content changes, keep the old page around just long enough to flip it away.
  const faceKey = face ? `${face.id}|${face.title}|${face.days}` : "";
  const [shownKey, setShownKey] = useState(faceKey);
  const [shownFace, setShownFace] = useState(face);
  const [leaving, setLeaving] = useState<{ face: Face | null; n: number } | null>(null);
  if (shownKey !== faceKey) {
    setLeaving({ face: shownFace, n: (leaving?.n ?? 0) + 1 });
    setShownKey(faceKey);
    setShownFace(face);
  }

  // First view of a new day: flip yesterday's page away. Read once per mount (a ref, so Strict
  // Mode's second effect run sees the same value), and remember what's showing now.
  const seen = useRef<{ day: string; id: string; days: number } | null | undefined>(undefined);
  useEffect(() => {
    if (seen.current === undefined) {
      try {
        seen.current = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null");
      } catch {
        seen.current = null;
      }
    }
    const last = seen.current;
    if (!face || !last || last.day === today || last.id !== face.id || last.days === face.days) {
      return;
    }
    const t = setTimeout(() => {
      seen.current = null; // once per mount
      setLeaving((l) => ({ face: { ...face, days: last.days }, n: (l?.n ?? 0) + 1 }));
    }, 450);
    return () => clearTimeout(t);
    // Only on arrival; later changes flip through the render-time comparison above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (face) {
        localStorage.setItem(SEEN_KEY, JSON.stringify({ day: today, id: face.id, days: face.days }));
      }
    } catch {
      // Storage unavailable: the calendar just won't flip on arrival.
    }
  }, [today, face?.id, face?.days]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = upcoming.length - 1;
  const label = face
    ? `${face.title}: ${countLabel(face.days)}. Open deadlines`
    : "No deadlines yet. Add a deadline";

  return (
    <Dialog.Root>
      <div className={styles.wall}>
        <svg className={styles.string} viewBox="0 0 150 40" aria-hidden>
          <path d="M75 6 L31 38 M75 6 L119 38" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <circle cx="75" cy="6" r="4" className={styles.nail} />
          <circle cx="74" cy="5" r="1.3" className={styles.nailShine} />
        </svg>
        <Dialog.Trigger className={styles.calendar} aria-label={label} title="Deadlines">
          <span className={styles.binding}>
            <span className={styles.ring} style={{ left: 28 }} />
            <span className={styles.ring} style={{ right: 28 }} />
            {formatDay(today, "short")}
          </span>
          <span className={styles.pad}>
            <Sheet face={face} />
            {leaving && (
              <Sheet
                key={leaving.n}
                face={leaving.face}
                className={styles.leaving}
                onAnimationEnd={() => setLeaving(null)}
              />
            )}
          </span>
        </Dialog.Trigger>
        {more > 0 && (
          <span className={styles.more}>
            +{more} more deadline{more === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <Dialog.Portal>
        <Dialog.Backdrop className={libraryStyles.allBackdrop} />
        <Deadlines
          deadlines={deadlines}
          setDeadlines={setDeadlines}
          today={today}
          nextId={next?.id ?? null}
        />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** One page of the pad: the deadline's name, the big count, and the day it falls on. */
function Sheet({
  face,
  className,
  onAnimationEnd,
}: {
  face: Face | null;
  className?: string;
  onAnimationEnd?: () => void;
}) {
  const cls = `${styles.sheet} ${className ?? ""}`;
  // A page on its way out is decoration only.
  const hidden = onAnimationEnd ? true : undefined;
  if (!face) {
    return (
      <span className={cls} onAnimationEnd={onAnimationEnd} aria-hidden={hidden}>
        <span className={styles.sheetTitle}>Countdown</span>
        <span className={`${styles.number} ${styles.plus}`}>+</span>
        <span className={styles.caption}>Add a deadline</span>
      </span>
    );
  }
  return (
    <span className={cls} onAnimationEnd={onAnimationEnd} aria-hidden={hidden}>
      <span className={styles.sheetTitle}>{face.title}</span>
      {face.days === 0 ? (
        <span className={`${styles.number} ${styles.today}`}>Today</span>
      ) : (
        <span className={styles.number}>{face.days}</span>
      )}
      <span className={styles.caption}>
        {face.days === 0 ? "it's due" : face.days === 1 ? "day to go" : "days to go"}
      </span>
      <span className={styles.date}>
        {formatDay(face.due, "short")}
      </span>
    </span>
  );
}

/** Every deadline (upcoming, then past), with a form to add one or edit the one being edited. */
function Deadlines({
  deadlines,
  setDeadlines,
  today,
  nextId,
}: {
  deadlines: Deadline[];
  setDeadlines: (d: Deadline[]) => void;
  today: string;
  nextId: string | null;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const upcoming = deadlines.filter((d) => d.due >= today);
  const past = deadlines.filter((d) => d.due < today).reverse(); // most recent first

  function reset() {
    setEditing(null);
    setTitle("");
    setDue("");
    setError(null);
  }

  function edit(d: Deadline) {
    setEditing(d.id);
    setTitle(d.title);
    setDue(d.due);
    setError(null);
    titleRef.current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await (editing
      ? sendJson(`/api/deadlines/${editing}`, "PATCH", { title, due })
      : sendJson("/api/deadlines", "POST", { title, due })
    ).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? "Couldn't save the deadline.");
      return;
    }
    const saved = (await res.json()) as Deadline;
    const rest = deadlines.filter((d) => d.id !== saved.id);
    setDeadlines(sortDeadlines([...rest, saved]));
    reset();
  }

  async function remove(id: string) {
    if (editing === id) reset();
    setDeadlines(deadlines.filter((d) => d.id !== id)); // optimistic
    const res = await fetch(`/api/deadlines/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      getJson<Deadline[]>("/api/deadlines")
        .then(setDeadlines)
        .catch(() => {});
    }
  }

  const row = (d: Deadline) => {
    const days = daysBetween(today, d.due);
    return (
      <li key={d.id} className={styles.row} data-next={d.id === nextId || undefined} data-past={days < 0 || undefined}>
        <span className={styles.tile} aria-hidden>
          <span className={styles.tileMonth}>{MONTHS[new Date(utc(d.due)).getUTCMonth()]}</span>
          <span className={styles.tileDay}>{new Date(utc(d.due)).getUTCDate()}</span>
        </span>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{d.title}</span>
          <span className={styles.rowMeta}>
            {countLabel(days)} · {formatDay(d.due, "long")}
          </span>
        </span>
        {d.id === nextId && <span className={styles.onWall}>On the calendar</span>}
        <button
          className={`${libraryStyles.rowAction} ${libraryStyles.rowEdit}`}
          onClick={() => edit(d)}
          aria-label={`Edit ${d.title}`}
          title="Edit"
        >
          <PencilIcon />
        </button>
        <button
          className={`${libraryStyles.rowAction} ${libraryStyles.rowDelete}`}
          onClick={() => remove(d.id)}
          aria-label={`Remove ${d.title}`}
          title="Remove"
        >
          <TrashIcon />
        </button>
      </li>
    );
  };

  return (
    <Dialog.Popup
      className={`${libraryStyles.allPopup} ${styles.popup}`}
      initialFocus={deadlines.length === 0 ? titleRef : undefined}
    >
      <div className={libraryStyles.allHeader}>
        <Dialog.Title className={libraryStyles.allTitle}>Deadlines</Dialog.Title>
        <span className={libraryStyles.allCount}>{deadlines.length}</span>
        <Dialog.Close className={libraryStyles.allClose} aria-label="Close">
          ×
        </Dialog.Close>
      </div>

      <div className={styles.lists}>
        {deadlines.length === 0 && (
          <p className={libraryStyles.empty}>
            Nothing to count down to yet. Add an exam, an assignment, anything with a date.
          </p>
        )}
        {upcoming.length > 0 && <ul className={styles.list}>{upcoming.map(row)}</ul>}
        {past.length > 0 && (
          <>
            <h3 className={styles.pastHeading}>Past</h3>
            <ul className={styles.list}>{past.map(row)}</ul>
          </>
        )}
      </div>

      <form className={styles.form} onSubmit={submit}>
        <input
          ref={titleRef}
          className={styles.input}
          placeholder="What's due? e.g. Biology exam"
          aria-label="Deadline name"
          value={title}
          maxLength={80}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className={`${styles.input} ${styles.dateInput}`}
          type="date"
          aria-label="Due date"
          value={due}
          min={editing ? undefined : today}
          required
          onChange={(e) => setDue(e.target.value)}
        />
        <button className={styles.submit} type="submit" disabled={saving}>
          {editing ? "Save" : "Add"}
        </button>
        {editing && (
          <button className={styles.cancel} type="button" onClick={reset}>
            Cancel
          </button>
        )}
      </form>
      {error && <p className={libraryStyles.error}>{error}</p>}
    </Dialog.Popup>
  );
}

function sortDeadlines(list: Deadline[]): Deadline[] {
  return list.sort((a, b) => a.due.localeCompare(b.due) || a.created_at - b.created_at);
}

/** The reader's local calendar day, YYYY-MM-DD. */
function localDay(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A YYYY-MM-DD day as UTC midnight, so day differences ignore daylight-saving shifts. */
function utc(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from `today` to `due`; negative once it has passed. */
function daysBetween(today: string, due: string): number {
  return Math.round((utc(due) - utc(today)) / DAY_MS);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 17 Nov" (short) or "Tue 17 Nov 2026" (long). Fixed English rather than the locale's,
 *  so the server render and the browser's hydration agree. */
function formatDay(day: string, style: "short" | "long"): string {
  const d = new Date(utc(day));
  const text = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return style === "long" ? `${text} ${d.getUTCFullYear()}` : text;
}

function countLabel(days: number): string {
  if (days === 0) return "Due today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `${days} days to go`;
  if (days === -1) return "Yesterday";
  return `${-days} days ago`;
}

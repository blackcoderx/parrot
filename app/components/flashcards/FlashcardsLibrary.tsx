"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Select } from "@base-ui-components/react/select";
import { getJson } from "@/components/api";
import { cardSource, formatSource, tagFilters } from "@/components/reader/Flashcards";
import Markdown from "@/components/reader/Markdown";
import { TimerButton } from "@/components/timer/TimerButton";
import { useNow } from "@/components/timer/TimerProvider";
import { TrashIcon } from "@/components/TrashIcon";
import type { CardStatus, StudyCard, StudyToday } from "@/types";
import { STATUSES, STATUS_LABEL, StatusBadge, formatDue, formatInterval } from "./status";
import { StudySession, buildQueue } from "./StudySession";
import styles from "./Study.module.css";

/** New cards introduced per day, so reviews of them don't pile up later. */
const NEW_PER_DAY = 20;

type StatusFilter = "all" | "due" | CardStatus;

interface Filters {
  doc: string; // "all" or a document id
  tag: string; // "all" or a lower-cased tag
  query: string;
}

/** Epoch ms of the reader's last local midnight, which starts "today" for the daily counts. */
function localMidnight(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function matches(card: StudyCard, { doc, tag, query }: Filters): boolean {
  if (doc !== "all" && card.document_id !== doc) return false;
  if (tag !== "all" && !card.tags.some((t) => t.toLowerCase() === tag)) return false;
  const q = query.trim().toLowerCase();
  if (q && ![card.question, card.answer, card.hint ?? ""].some((s) => s.toLowerCase().includes(q))) {
    return false;
  }
  return true;
}

function matchesStatus(card: StudyCard, status: StatusFilter, now: number): boolean {
  if (status === "all") return true;
  if (status === "due") return card.due !== null && card.due <= now;
  return card.status === status;
}

/** The flashcards page: every card from every document, and spaced-repetition study. */
export function FlashcardsLibrary({ initialCards }: { initialCards: StudyCard[] }) {
  const [cards, setCards] = useState(initialCards);
  const [today, setToday] = useState<StudyToday | null>(null);
  const [filters, setFilters] = useState<Filters>({ doc: "all", tag: "all", query: "" });
  const [status, setStatus] = useState<StatusFilter>("all");
  const [session, setSession] = useState<StudyCard[] | null>(null);
  const [starting, setStarting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Due times move on their own; a minute's resolution is plenty for "due now".
  const now = useNow(session === null, 60_000);

  const loadToday = useCallback(() => {
    getJson<StudyToday>(`/api/flashcards/today?since=${localMidnight()}`)
      .then(setToday)
      .catch(() => {});
  }, []);
  useEffect(loadToday, [loadToday]);

  const documents = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of cards) if (!seen.has(c.document_id)) seen.set(c.document_id, c.document_title);
    return [...seen].map(([id, title]) => ({ id, title }));
  }, [cards]);
  const tags = useMemo(() => tagFilters(cards), [cards]);

  // Cards under the document / tag / search filters; the status tiles count within these.
  const scoped = useMemo(() => cards.filter((c) => matches(c, filters)), [cards, filters]);
  const visible = useMemo(
    () => scoped.filter((c) => matchesStatus(c, status, now)),
    [scoped, status, now],
  );
  const counts = useMemo(() => {
    const out: Record<StatusFilter, number> = {
      all: scoped.length,
      due: 0,
      new: 0,
      learning: 0,
      familiar: 0,
      confident: 0,
      mastered: 0,
    };
    for (const c of scoped) {
      out[c.status]++;
      if (c.due !== null && c.due <= now) out.due++;
    }
    return out;
  }, [scoped, now]);

  const newLeft = Math.max(0, NEW_PER_DAY - (today?.introduced ?? 0));
  const studyCount = useMemo(() => buildQueue(visible, now, newLeft).length, [visible, now, newLeft]);
  const nextDue = useMemo(() => {
    let min: number | null = null;
    for (const c of visible) if (c.due !== null && c.due > now && (min === null || c.due < min)) min = c.due;
    return min;
  }, [visible, now]);

  async function startStudy() {
    setStarting(true);
    // Fresh cards, so each grade's interval is worked out from the time you study.
    const fresh = await getJson<StudyCard[]>("/api/flashcards/study").catch(() => null);
    setStarting(false);
    const list = fresh ?? cards;
    if (fresh) setCards(fresh);
    const at = Date.now();
    const queue = buildQueue(
      list.filter((c) => matches(c, filters) && matchesStatus(c, status, at)),
      at,
      newLeft,
    );
    if (queue.length) setSession(queue);
  }

  const onGraded = useCallback((card: StudyCard) => {
    setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
  }, []);

  const endSession = useCallback(() => {
    setSession(null);
    loadToday();
  }, [loadToday]);

  async function remove(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    setConfirmDelete(null);
    await fetch(`/api/flashcards/${id}`, { method: "DELETE" });
  }

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const docItems = useMemo(
    () => ({ all: "All documents", ...Object.fromEntries(documents.map((d) => [d.id, d.title])) }),
    [documents],
  );
  const tagItems = useMemo(
    () => ({ all: "All tags", ...Object.fromEntries(tags.map((t) => [t.value.slice(2), t.label])) }),
    [tags],
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Library
        </Link>
        <h1 className={styles.title}>Flashcards</h1>
        {!session && (
          <p className={styles.subtitle}>
            Cards from every document. Each one comes back just as you&apos;re likely to forget it.
          </p>
        )}
      </header>

      {session ? (
        <StudySession queue={session} onGraded={onGraded} onExit={endSession} />
      ) : cards.length === 0 ? (
        <div className={styles.empty}>
          <p>No flashcards yet.</p>
          <p className={styles.muted}>
            Make them while reading: select some text and choose <strong>Flashcard</strong>, or use the
            cards button in the reader toolbar.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.tiles} role="group" aria-label="Filter by status">
            {(["due", ...STATUSES] as const).map((s) => (
              <button
                key={s}
                className={styles.tile}
                data-status={s}
                aria-pressed={status === s}
                onClick={() => setStatus(status === s ? "all" : s)}
              >
                <span className={styles.tileCount}>{counts[s]}</span>
                <span className={styles.tileLabel}>{s === "due" ? "Due" : STATUS_LABEL[s]}</span>
              </button>
            ))}
          </div>

          <div className={styles.studyRow}>
            <div className={styles.todayText}>
              {today && (
                <>
                  Today: {today.reviewed} review{today.reviewed === 1 ? "" : "s"} ·{" "}
                  {Math.min(today.introduced, NEW_PER_DAY)} of {NEW_PER_DAY} new cards
                </>
              )}
            </div>
            <button
              className={styles.studyBtn}
              onClick={startStudy}
              disabled={studyCount === 0 || starting}
            >
              {studyCount > 0 ? `Study now · ${studyCount}` : "All caught up"}
            </button>
          </div>
          {studyCount === 0 && nextDue !== null && (
            <p className={styles.nextDue}>Next card is due in {formatInterval(nextDue - now)}.</p>
          )}

          <div className={styles.filters}>
            {documents.length > 1 && (
              <Picker
                label="Filter by document"
                value={filters.doc}
                items={docItems}
                onChange={(v) => setFilter("doc", v)}
              />
            )}
            {tags.length > 0 && (
              <Picker
                label="Filter by tag"
                value={filters.tag}
                items={tagItems}
                onChange={(v) => setFilter("tag", v)}
              />
            )}
            <input
              className={styles.search}
              type="search"
              placeholder="Search cards"
              aria-label="Search cards"
              value={filters.query}
              onChange={(e) => setFilter("query", e.target.value)}
            />
          </div>

          {visible.length === 0 ? (
            <p className={styles.muted}>No cards match these filters.</p>
          ) : (
            <ul className={styles.list}>
              {visible.map((card) => {
                const source = cardSource(card);
                const isDue = card.due !== null && card.due <= now;
                return (
                  <li key={card.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <div className={styles.rowQuestion}>
                        <Markdown inline>{card.question}</Markdown>
                      </div>
                      <div className={styles.rowMeta}>
                        <span className={styles.rowDoc}>{card.document_title}</span>
                        {source && (
                          <Link
                            className={styles.rowSource}
                            href={`/read/${card.document_id}?page=${source.page}`}
                            title="Open the PDF where this card came from"
                          >
                            {formatSource(source)}
                          </Link>
                        )}
                        {card.tags.map((t) => (
                          <span key={t} className={styles.rowTag}>
                            # {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className={styles.rowSide}>
                      {confirmDelete === card.id ? (
                        <>
                          <span className={styles.muted}>Delete?</span>
                          <button className={styles.textBtn} onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </button>
                          <button
                            className={`${styles.textBtn} ${styles.danger}`}
                            onClick={() => remove(card.id)}
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={styles.rowDue} data-due={isDue || undefined}>
                            {card.due === null ? "" : formatDue(card.due, now)}
                          </span>
                          <StatusBadge status={card.status} />
                          <button
                            className={styles.rowDelete}
                            onClick={() => setConfirmDelete(card.id)}
                            aria-label="Delete card"
                            title="Delete card"
                          >
                            <TrashIcon />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <div className={styles.corner}>
        <TimerButton className={styles.timerBtn} clockClassName={styles.timerClock} />
      </div>
    </div>
  );
}

/** A compact filter dropdown (Base UI Select). */
function Picker({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <Select.Root items={items} value={value} onValueChange={(v) => onChange(v as string)}>
      <Select.Trigger className={styles.picker} aria-label={label}>
        <Select.Value className={styles.pickerValue} />
        <Select.Icon className={styles.pickerIcon}>▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className={styles.pickerPositioner}
          side="bottom"
          align="start"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <Select.Popup className={styles.pickerPopup}>
            {Object.entries(items).map(([v, text]) => (
              <Select.Item key={v} value={v} className={styles.pickerItem}>
                <Select.ItemText>{text}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

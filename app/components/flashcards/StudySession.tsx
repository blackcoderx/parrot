"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { sendJson } from "@/components/api";
import { CardText, cardSource, formatSource } from "@/components/reader/Flashcards";
import cardStyles from "@/components/reader/Flashcards.module.css";
import buttons from "@/components/reader/buttons.module.css";
import type { Grade, StudyCard } from "@/types";
import { StatusBadge, formatInterval } from "./status";
import styles from "./Study.module.css";

/** A card due again within this long (a learning step) comes back in the same session. */
const LEARN_AHEAD_MS = 20 * 60_000;

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 1, label: "Again" },
  { grade: 2, label: "Hard" },
  { grade: 3, label: "Good" },
  { grade: 4, label: "Easy" },
];

/**
 * The cards to study now: everything due, most overdue first, with up to `newLimit` new cards
 * spread evenly among them (interleaved rather than saved for the end).
 */
export function buildQueue(cards: StudyCard[], now: number, newLimit: number): StudyCard[] {
  const due = cards
    .filter((c) => c.due !== null && c.due <= now)
    .sort((a, b) => a.due! - b.due!);
  const fresh = cards.filter((c) => c.due === null).slice(0, Math.max(0, newLimit));
  const out: StudyCard[] = [];
  let i = 0;
  let j = 0;
  while (i < due.length || j < fresh.length) {
    // Take from whichever list is proportionally further behind.
    if (j >= fresh.length || (i < due.length && i * fresh.length <= j * due.length)) {
      out.push(due[i++]);
    } else {
      out.push(fresh[j++]);
    }
  }
  return out;
}

interface Props {
  queue: StudyCard[];
  /** A card was graded; this is its rescheduled state. */
  onGraded: (card: StudyCard) => void;
  onExit: () => void;
}

/** One sitting: show a card, reveal it, grade it, repeat until nothing is left. */
export function StudySession({ queue: initialQueue, onGraded, onExit }: Props) {
  const [queue, setQueue] = useState(initialQueue.slice(1));
  // Cards on a short learning step, soonest first; they return once due (or early, at the end).
  const [pending, setPending] = useState<StudyCard[]>([]);
  const [current, setCurrent] = useState<StudyCard | null>(initialQueue[0] ?? null);
  const [revealed, setRevealed] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState({ reviewed: 0, forgot: 0 });
  // Guards against a second grade (a repeated key) landing before `saving` re-renders.
  const busy = useRef(false);

  const grade = useCallback(
    async (g: Grade) => {
      if (!current || !revealed || busy.current) return;
      busy.current = true;
      setSaving(true);
      setError(false);
      const res = await sendJson(`/api/flashcards/${current.id}/review`, "POST", { rating: g }).catch(
        () => null,
      );
      busy.current = false;
      setSaving(false);
      if (!res?.ok) {
        setError(true);
        return;
      }
      const card = (await res.json()) as StudyCard;
      onGraded(card);
      setDone((d) => ({ reviewed: d.reviewed + 1, forgot: d.forgot + (g === 1 ? 1 : 0) }));

      const now = Date.now();
      let nextPending = pending;
      if (card.due !== null && card.due - now < LEARN_AHEAD_MS) {
        nextPending = [...pending, card].sort((a, b) => a.due! - b.due!);
      }
      let nextQueue = queue;
      let next: StudyCard | null = null;
      if (nextPending.length && nextPending[0].due! <= now) {
        [next, ...nextPending] = nextPending;
      } else if (nextQueue.length) {
        [next, ...nextQueue] = nextQueue;
      } else if (nextPending.length) {
        // Nothing else left: show learning cards a little early rather than make you wait.
        [next, ...nextPending] = nextPending;
      }
      setPending(nextPending);
      setQueue(nextQueue);
      setCurrent(next);
      setRevealed(false);
      setHintShown(false);
    },
    [current, revealed, pending, queue, onGraded],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      // A focused button or link handles its own Space / Enter.
      if ((e.key === " " || e.key === "Enter") && target.closest("button, a")) return;
      if (e.key === "Escape") {
        onExit();
      } else if (!current) {
        return;
      } else if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        grade(Number(e.key) as Grade);
      } else if (revealed && e.key === " ") {
        // Space on the answer means "Good", the usual grade.
        e.preventDefault();
        grade(3);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, revealed, grade, onExit]);

  const left = (current ? 1 : 0) + queue.length + pending.length;

  if (!current) {
    return (
      <div className={styles.sessionDone}>
        <h2 className={styles.doneTitle}>Session complete</h2>
        <p className={styles.doneText}>
          {done.reviewed === 0
            ? "Nothing to study right now."
            : `You studied ${done.reviewed} card${done.reviewed === 1 ? "" : "s"}` +
              (done.forgot ? `, and will see ${done.forgot === 1 ? "one" : done.forgot} again soon.` : ".")}
        </p>
        <button className={buttons.askSend} onClick={onExit} autoFocus>
          Back to flashcards
        </button>
      </div>
    );
  }

  const source = cardSource(current);

  return (
    <div className={styles.session}>
      <div className={styles.sessionBar}>
        <button className={styles.textBtn} onClick={onExit}>
          ← End session
        </button>
        <span className={styles.sessionLeft}>
          {left} left · {done.reviewed} done
        </span>
      </div>

      <div className={styles.sessionMeta}>
        <span className={styles.docChip}>{current.document_title}</span>
        {source && (
          <Link
            className={cardStyles.flashSource}
            href={`/read/${current.document_id}?page=${source.page}`}
            title="Open the PDF where this card came from"
          >
            {formatSource(source)}
          </Link>
        )}
        <StatusBadge status={current.status} />
        {current.tags.map((t) => (
          <span key={t} className={cardStyles.flashTag}>
            {t}
          </span>
        ))}
      </div>

      <div className={styles.sessionDeck}>
        <div key={`${current.id}:${current.reps}`} className={cardStyles.flashSlide} data-direction="next">
          <div
            className={cardStyles.flashCard}
            data-revealed={revealed || undefined}
            role="button"
            tabIndex={0}
            aria-label={revealed ? "Answer shown" : "Reveal answer"}
            onClick={() => setRevealed(true)}
          >
            <div className={cardStyles.flashFace} aria-hidden={revealed}>
              <span className={cardStyles.flashLabel}>Question</span>
              <CardText text={current.question} />
              {current.hint &&
                (hintShown ? (
                  <CardText text={`Hint: ${current.hint}`} hint />
                ) : (
                  <button
                    className={styles.textBtn}
                    tabIndex={revealed ? -1 : 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setHintShown(true);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    Show hint
                  </button>
                ))}
              <span className={cardStyles.flashCaption}>Click or press Space to reveal</span>
            </div>
            <div className={`${cardStyles.flashFace} ${cardStyles.flashBack}`} aria-hidden={!revealed}>
              <span className={cardStyles.flashLabel}>Answer</span>
              <CardText text={current.answer} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.grades} data-revealed={revealed || undefined}>
        {revealed ? (
          GRADES.map(({ grade: g, label }) => (
            <button
              key={g}
              className={styles.gradeBtn}
              data-grade={g}
              disabled={saving}
              onClick={() => grade(g)}
              title={`${label} (${g})`}
            >
              <span className={styles.gradeLabel}>{label}</span>
              <span className={styles.gradeInterval}>{formatInterval(current.intervals[g - 1])}</span>
            </button>
          ))
        ) : (
          <button className={`${buttons.askSend} ${styles.revealBtn}`} onClick={() => setRevealed(true)}>
            Show answer
          </button>
        )}
      </div>
      <p className={styles.sessionHint}>
        {error
          ? "Couldn't save that grade. Try again."
          : revealed
            ? "How well did you remember it? Keys 1–4 grade it."
            : "Try to recall the answer before you reveal it."}
      </p>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "@base-ui-components/react/popover";
import { getJson, sendJson } from "@/components/api";
import type { Flashcard } from "./types";
import buttons from "./buttons.module.css";
import styles from "./Flashcards.module.css";

/** Gap between the toolbar and the popover (also used to aim the open animation). */
const SIDE_OFFSET = 12;

/** An unsaved card, e.g. one the AI drafted from a selection. */
export interface CardDraft {
  question: string;
  hint: string | null;
  answer: string;
}

/**
 * What the flashcards popover is showing. `generate` drafts a card from selected text (`nonce`
 * re-runs it for the same text); the draft then opens in the form for review.
 */
export type FlashView =
  | { kind: "review" }
  | { kind: "form"; editing: Flashcard | null; draft?: CardDraft }
  | { kind: "generate"; text: string; nonce: number };

interface Props {
  documentId: string;
  open: boolean;
  view: FlashView;
  /** The toolbar: the popover centres above it, and clicks on it don't count as "outside". */
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  onOpenChange: (open: boolean) => void;
  onViewChange: (view: FlashView) => void;
}

export function Flashcards({
  documentId,
  open,
  view,
  toolbarRef,
  onOpenChange,
  onViewChange,
}: Props) {
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [index, setIndex] = useState(0);
  // Which way the last navigation went, so the incoming card slides in from that side.
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const loaded = useRef(false);

  // Make the popover grow out of the toolbar button that opened it, like a macOS window
  // zooming out of its Dock icon. The popup is centred on the toolbar, SIDE_OFFSET above it,
  // so the origin follows from the button's offset — no need to wait for positioning. A
  // callback ref, because the portal attaches the popup after this component's effects run;
  // it fires as the element mounts, before paint, while [data-starting-style] still applies.
  // Re-aimed when the view changes, so closing shrinks back into the matching button.
  const aimPopup = useCallback(
    (popup: HTMLDivElement | null) => {
      const toolbar = toolbarRef.current;
      if (!popup || !toolbar) return;
      const isNew = view.kind === "generate" || (view.kind === "form" && !view.editing);
      const label = isNew ? "New flashcard" : "Flashcards";
      const button = toolbar.querySelector(`[aria-label="${label}"]`);
      if (!button) return;
      const bar = toolbar.getBoundingClientRect();
      const btn = button.getBoundingClientRect();
      const dx = btn.left + btn.width / 2 - (bar.left + bar.width / 2);
      const dy = SIDE_OFFSET + (btn.top + btn.height / 2 - bar.top);
      popup.style.transformOrigin = `calc(50% + ${dx}px) calc(100% + ${dy}px)`;
    },
    [toolbarRef, view],
  );

  // Load this document's cards the first time the popover opens.
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    getJson<Flashcard[]>(`/api/flashcards?documentId=${documentId}`)
      .then(setCards)
      .catch(() => setCards([]));
  }, [open, documentId]);

  const count = cards?.length ?? 0;
  const current = cards && count ? cards[Math.min(index, count - 1)] : null;
  const position = Math.min(index, Math.max(count - 1, 0));

  function go(delta: number) {
    const next = position + delta;
    if (!cards || next < 0 || next >= count) return;
    setDirection(delta > 0 ? "next" : "prev");
    setIndex(next);
    setConfirmDelete(false);
  }

  async function remove(card: Flashcard) {
    setCards((prev) => prev?.filter((c) => c.id !== card.id) ?? prev);
    setIndex((i) => Math.max(0, Math.min(i, count - 2)));
    setConfirmDelete(false);
    await fetch(`/api/flashcards/${card.id}`, { method: "DELETE" });
  }

  function handleSaved(card: Flashcard, isNew: boolean) {
    const list = cards ?? [];
    const next = isNew ? [...list, card] : list.map((c) => (c.id === card.id ? card : c));
    setCards(next);
    setDirection("next");
    setIndex(next.findIndex((c) => c.id === card.id));
    onViewChange({ kind: "review" });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (view.kind !== "review") return;
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea")) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  }

  const title =
    view.kind === "review"
      ? "Flashcards"
      : view.kind === "form" && view.editing
        ? "Edit flashcard"
        : "New flashcard";

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next, details) => {
        // The toolbar's own flashcard buttons toggle/switch the popover themselves.
        if (!next && details.reason === "outside-press") {
          const target = details.event.target as Node | null;
          if (target && toolbarRef.current?.contains(target)) return;
        }
        onOpenChange(next);
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={toolbarRef}
          side="top"
          align="center"
          sideOffset={SIDE_OFFSET}
          collisionPadding={12}
          className={styles.flashPositioner}
        >
          <Popover.Popup ref={aimPopup} className={styles.flashPopup} onKeyDown={onKeyDown}>
            <div className={styles.flashHeader}>
              <span className={styles.flashTitle}>{title}</span>
              {view.kind === "review" && count > 0 && (
                <span className={styles.flashCount}>
                  {position + 1} / {count}
                </span>
              )}
              <span className={styles.flashHeaderActions}>
                {view.kind === "review" && (
                  <button
                    className={styles.flashIconBtn}
                    onClick={() => onViewChange({ kind: "form", editing: null })}
                    aria-label="New flashcard"
                    title="New flashcard"
                  >
                    <PlusIcon />
                  </button>
                )}
                <Popover.Close className={buttons.askClose} aria-label="Close flashcards">
                  ×
                </Popover.Close>
              </span>
            </div>

            {view.kind === "generate" ? (
              <GenerateView
                key={view.nonce}
                documentId={documentId}
                text={view.text}
                onDraft={(draft) => onViewChange({ kind: "form", editing: null, draft })}
                onWriteManually={() => onViewChange({ kind: "form", editing: null })}
              />
            ) : view.kind === "form" ? (
              <CardForm
                key={view.editing?.id ?? (view.draft ? "draft" : "new")}
                documentId={documentId}
                editing={view.editing}
                draft={view.draft}
                onCancel={() => onViewChange({ kind: "review" })}
                onSaved={handleSaved}
              />
            ) : cards === null ? (
              <p className={styles.flashEmpty}>Loading flashcards…</p>
            ) : !current ? (
              <div className={styles.flashEmpty}>
                <p>No flashcards yet for this document.</p>
                <button
                  className={buttons.askSend}
                  onClick={() => onViewChange({ kind: "form", editing: null })}
                >
                  Create a card
                </button>
              </div>
            ) : (
              <>
                <div className={styles.flashStage}>
                  <button
                    className={styles.flashArrow}
                    onClick={() => go(-1)}
                    disabled={position === 0}
                    aria-label="Previous card"
                  >
                    <ChevronIcon flip />
                  </button>

                  <div
                    className={styles.flashDeck}
                    data-stack={Math.min(count - position - 1, 2) || undefined}
                  >
                    <CardView key={current.id} card={current} direction={direction} />
                  </div>

                  <button
                    className={styles.flashArrow}
                    onClick={() => go(1)}
                    disabled={position >= count - 1}
                    aria-label="Next card"
                  >
                    <ChevronIcon />
                  </button>
                </div>

                <div className={styles.flashFooter}>
                  {confirmDelete ? (
                    <>
                      <span className={styles.flashConfirm}>Delete this card?</span>
                      <button className={styles.flashTextBtn} onClick={() => setConfirmDelete(false)}>
                        Cancel
                      </button>
                      <button
                        className={`${styles.flashTextBtn} ${styles.flashDanger}`}
                        onClick={() => remove(current)}
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={styles.flashTextBtn}
                        onClick={() => onViewChange({ kind: "form", editing: current })}
                      >
                        Edit
                      </button>
                      <button className={styles.flashTextBtn} onClick={() => setConfirmDelete(true)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** One card: question (+ optional hint) on the front, answer on the back; click to flip. */
function CardView({ card, direction }: { card: Flashcard; direction: "next" | "prev" }) {
  const [revealed, setRevealed] = useState(false);
  const [hintShown, setHintShown] = useState(false);

  return (
    <div className={styles.flashSlide} data-direction={direction}>
      <div
        className={styles.flashCard}
        data-revealed={revealed || undefined}
        role="button"
        tabIndex={0}
        aria-label={revealed ? "Show question" : "Reveal answer"}
        onClick={() => setRevealed((r) => !r)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setRevealed((r) => !r);
          }
        }}
      >
        <div className={styles.flashFace} aria-hidden={revealed}>
          <span className={styles.flashLabel}>Question</span>
          <p className={styles.flashText}>{card.question}</p>
          {card.hint &&
            (hintShown ? (
              <p className={styles.flashHint}>Hint: {card.hint}</p>
            ) : (
              <button
                className={styles.flashTextBtn}
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
          <span className={styles.flashCaption}>Click to reveal</span>
        </div>
        <div className={`${styles.flashFace} ${styles.flashBack}`} aria-hidden={!revealed}>
          <span className={styles.flashLabel}>Answer</span>
          <p className={styles.flashText}>{card.answer}</p>
          <span className={styles.flashCaption}>Click to see the question</span>
        </div>
      </div>
    </div>
  );
}

/** Ask the AI to draft a card from `text`, then hand the draft on for review. */
function GenerateView({
  documentId,
  text,
  onDraft,
  onWriteManually,
}: {
  documentId: string;
  text: string;
  onDraft: (draft: CardDraft) => void;
  onWriteManually: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Read through a ref so a re-rendered parent doesn't restart the request.
  const onDraftRef = useRef(onDraft);
  useEffect(() => {
    onDraftRef.current = onDraft;
  });

  useEffect(() => {
    // Aborted when the popover closes or another selection replaces this one.
    const controller = new AbortController();
    fetch("/api/flashcards/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, text }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Couldn't write a card from this selection.");
        onDraftRef.current(data as CardDraft);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Couldn't write a card from this selection.");
      });
    return () => controller.abort();
  }, [documentId, text, attempt]);

  if (!error) return <p className={styles.flashEmpty}>Writing a card…</p>;
  return (
    <div className={styles.flashEmpty}>
      <p>{error}</p>
      <div className={styles.flashFormActions}>
        <button className={buttons.askSave} onClick={onWriteManually}>
          Write it myself
        </button>
        <button
          className={buttons.askSend}
          onClick={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

/** Create a new card (optionally starting from `draft`), or edit `editing`. */
function CardForm({
  documentId,
  editing,
  draft,
  onCancel,
  onSaved,
}: {
  documentId: string;
  editing: Flashcard | null;
  draft?: CardDraft;
  onCancel: () => void;
  onSaved: (card: Flashcard, isNew: boolean) => void;
}) {
  const initial = editing ?? draft;
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [hint, setHint] = useState(initial?.hint ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = question.trim() !== "" && answer.trim() !== "" && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const body = { question, hint: hint.trim() ? hint : null, answer };
    const res = await (editing
      ? sendJson(`/api/flashcards/${editing.id}`, "PATCH", body)
      : sendJson("/api/flashcards", "POST", { documentId, ...body })
    ).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError("Couldn't save the card. Try again.");
      return;
    }
    onSaved((await res.json()) as Flashcard, !editing);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  }

  return (
    <div className={styles.flashForm} onKeyDown={onKeyDown}>
      <label className={styles.flashField}>
        <span>Question</span>
        <textarea
          value={question}
          rows={3}
          autoFocus
          placeholder="What do you want to remember?"
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>
      <label className={styles.flashField}>
        <span>
          Hint <em>(optional)</em>
        </span>
        <input value={hint} placeholder="A nudge, not the answer" onChange={(e) => setHint(e.target.value)} />
      </label>
      <label className={styles.flashField}>
        <span>Answer</span>
        <textarea
          value={answer}
          rows={3}
          placeholder="The answer"
          onChange={(e) => setAnswer(e.target.value)}
        />
      </label>
      <div className={styles.flashFormActions}>
        {error && <span className={styles.flashError}>{error}</span>}
        <button className={buttons.askSave} onClick={onCancel}>
          Cancel
        </button>
        <button className={buttons.askSend} onClick={save} disabled={!canSave}>
          {saving ? "Saving…" : "Save card"}
        </button>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ flip }: { flip?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={flip ? { transform: "rotate(180deg)" } : undefined}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

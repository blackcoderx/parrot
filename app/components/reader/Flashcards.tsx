"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Popover } from "@base-ui-components/react/popover";
import { Select } from "@base-ui-components/react/select";
import { getJson, sendJson } from "@/components/api";
import type { OutlineNode } from "./outline";
import type { CardSource, Flashcard } from "./types";
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
 * re-runs it for the same text); the draft then opens in the form for review. `source` is where
 * in the document a new card is being made.
 */
export type FlashView =
  | { kind: "review" }
  | { kind: "form"; editing: Flashcard | null; draft?: CardDraft; source?: CardSource }
  | { kind: "generate"; text: string; source?: CardSource; nonce: number };

/** Review filter: "all", "s:<outline id>" (a section and its subsections) or "t:<tag>". */
type Filter = string;

interface FilterOption {
  value: Filter;
  label: string;
  depth: number;
}

interface Props {
  documentId: string;
  open: boolean;
  view: FlashView;
  /** The PDF outline, for naming and nesting the section filters (null until loaded). */
  outline: OutlineNode[] | null;
  /** The toolbar: the popover centres above it, and clicks on it don't count as "outside". */
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  onOpenChange: (open: boolean) => void;
  onViewChange: (view: FlashView) => void;
  /** Open a blank new-card form, sourced from the page being read. */
  onNewCard: () => void;
  /** Scroll the document to where a card came from. */
  onJump: (page: number, y?: number | null) => void;
}

export function Flashcards({
  documentId,
  open,
  view,
  outline,
  toolbarRef,
  onOpenChange,
  onViewChange,
  onNewCard,
  onJump,
}: Props) {
  const [cards, setCards] = useState<Flashcard[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // Position within the filtered deck.
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

  const sectionOptions = useMemo(() => sectionFilters(cards ?? [], outline), [cards, outline]);
  const tagOptions = useMemo(() => tagFilters(cards ?? []), [cards]);
  const suggestions = useMemo(() => tagOptions.map((o) => o.label.slice(2)), [tagOptions]);
  const filterItems = useMemo(
    () => ({
      all: "All cards",
      ...Object.fromEntries([...sectionOptions, ...tagOptions].map((o) => [o.value, o.label])),
    }),
    [sectionOptions, tagOptions],
  );

  const visible = useMemo(
    () => cards?.filter((c) => matchesFilter(c, filter)) ?? null,
    [cards, filter],
  );
  const count = visible?.length ?? 0;
  const current = visible && count ? visible[Math.min(index, count - 1)] : null;
  const position = Math.min(index, Math.max(count - 1, 0));

  function changeFilter(next: Filter) {
    setFilter(next);
    setIndex(0);
    setDirection("next");
    setConfirmDelete(false);
  }

  function go(delta: number) {
    const next = position + delta;
    if (!visible || next < 0 || next >= count) return;
    setDirection(delta > 0 ? "next" : "prev");
    setIndex(next);
    setConfirmDelete(false);
  }

  async function remove(card: Flashcard) {
    const rest = (cards ?? []).filter((c) => c.id !== card.id);
    setCards(rest);
    setConfirmDelete(false);
    // Deleting the filter's last card drops the filter rather than showing an empty deck.
    if (!rest.some((c) => matchesFilter(c, filter))) changeFilter("all");
    else setIndex((i) => Math.max(0, Math.min(i, count - 2)));
    await fetch(`/api/flashcards/${card.id}`, { method: "DELETE" });
  }

  function handleSaved(card: Flashcard, isNew: boolean) {
    const list = cards ?? [];
    const next = isNew ? [...list, card] : list.map((c) => (c.id === card.id ? card : c));
    // Show the saved card, even if it falls outside the current filter.
    const nextFilter = matchesFilter(card, filter) ? filter : "all";
    setCards(next);
    setFilter(nextFilter);
    setDirection("next");
    setIndex(next.filter((c) => matchesFilter(c, nextFilter)).findIndex((c) => c.id === card.id));
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
              {view.kind === "review" && (sectionOptions.length > 0 || tagOptions.length > 0) && (
                <FilterSelect
                  value={filter}
                  items={filterItems}
                  sections={sectionOptions}
                  tags={tagOptions}
                  onChange={changeFilter}
                />
              )}
              {view.kind === "review" && count > 0 && (
                <span className={styles.flashCount}>
                  {position + 1} / {count}
                </span>
              )}
              <span className={styles.flashHeaderActions}>
                {view.kind === "review" && (
                  <button
                    className={styles.flashIconBtn}
                    onClick={onNewCard}
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
                onDraft={(draft) =>
                  onViewChange({ kind: "form", editing: null, draft, source: view.source })
                }
                onWriteManually={() =>
                  onViewChange({ kind: "form", editing: null, source: view.source })
                }
              />
            ) : view.kind === "form" ? (
              <CardForm
                key={view.editing?.id ?? (view.draft ? "draft" : "new")}
                documentId={documentId}
                editing={view.editing}
                draft={view.draft}
                source={view.source}
                suggestions={suggestions}
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
                  onClick={onNewCard}
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
                    <CardView
                      key={current.id}
                      card={current}
                      direction={direction}
                      onJump={onJump}
                    />
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

/** The review filter: all cards, a section of the outline, or a tag. */
function FilterSelect({
  value,
  items,
  sections,
  tags,
  onChange,
}: {
  value: Filter;
  items: Record<string, string>;
  sections: FilterOption[];
  tags: FilterOption[];
  onChange: (value: Filter) => void;
}) {
  return (
    <Select.Root items={items} value={value} onValueChange={(v) => onChange(v as Filter)}>
      <Select.Trigger className={styles.flashFilter} aria-label="Filter flashcards">
        <Select.Value className={styles.flashFilterValue} />
        <Select.Icon className={styles.flashFilterIcon}>
          <ChevronIcon down />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          className={styles.filterPositioner}
          side="bottom"
          align="start"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <Select.Popup className={styles.filterPopup}>
            <Select.Item value="all" className={styles.filterItem}>
              <Select.ItemText>All cards</Select.ItemText>
            </Select.Item>
            {sections.length > 0 && (
              <Select.Group className={styles.filterGroup}>
                <Select.GroupLabel className={styles.filterGroupLabel}>Sections</Select.GroupLabel>
                {sections.map((o) => (
                  <Select.Item
                    key={o.value}
                    value={o.value}
                    className={styles.filterItem}
                    style={{ paddingLeft: 10 + o.depth * 14 }}
                  >
                    <Select.ItemText>{o.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Group>
            )}
            {tags.length > 0 && (
              <Select.Group className={styles.filterGroup}>
                <Select.GroupLabel className={styles.filterGroupLabel}>Tags</Select.GroupLabel>
                {tags.map((o) => (
                  <Select.Item key={o.value} value={o.value} className={styles.filterItem}>
                    <Select.ItemText>{o.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Group>
            )}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

/** One card: question (+ optional hint) on the front, answer on the back; click to flip. */
function CardView({
  card,
  direction,
  onJump,
}: {
  card: Flashcard;
  direction: "next" | "prev";
  onJump: (page: number, y?: number | null) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const source = cardSource(card);
  const hasMeta = source !== null || card.tags.length > 0;

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
        <div className={styles.flashFace} data-meta={hasMeta || undefined} aria-hidden={revealed}>
          {hasMeta && (
            <div className={styles.flashMeta}>
              {source && (
                <button
                  className={styles.flashSource}
                  tabIndex={revealed ? -1 : 0}
                  title="Go to where this card came from"
                  onClick={(e) => {
                    e.stopPropagation();
                    onJump(source.page, source.y);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {formatSource(source)}
                </button>
              )}
              {card.tags.map((t) => (
                <span key={t} className={styles.flashTag}>
                  {t}
                </span>
              ))}
            </div>
          )}
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

/**
 * Create a new card (optionally starting from `draft`, made at `source`), or edit `editing`.
 * A new card's source can be dropped; an existing card's is fixed.
 */
function CardForm({
  documentId,
  editing,
  draft,
  source: initialSource,
  suggestions,
  onCancel,
  onSaved,
}: {
  documentId: string;
  editing: Flashcard | null;
  draft?: CardDraft;
  source?: CardSource;
  /** Tags already used in this document. */
  suggestions: string[];
  onCancel: () => void;
  onSaved: (card: Flashcard, isNew: boolean) => void;
}) {
  const initial = editing ?? draft;
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [hint, setHint] = useState(initial?.hint ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [tags, setTags] = useState<string[]>(editing?.tags ?? []);
  const [tagText, setTagText] = useState("");
  const [source, setSource] = useState<CardSource | null>(
    editing ? cardSource(editing) : (initialSource ?? null),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = question.trim() !== "" && answer.trim() !== "" && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    // A tag still being typed counts.
    const body = { question, hint: hint.trim() ? hint : null, answer, tags: addTag(tags, tagText) };
    const res = await (editing
      ? sendJson(`/api/flashcards/${editing.id}`, "PATCH", body)
      : sendJson("/api/flashcards", "POST", { documentId, ...body, source })
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
      {source && (
        <div className={styles.flashFormSource}>
          <span>
            From <strong>{formatSource(source)}</strong>
          </span>
          {!editing && (
            <button
              className={styles.flashSourceRemove}
              onClick={() => setSource(null)}
              aria-label="Don't link this card to the document"
              title="Don't link this card to the document"
            >
              ×
            </button>
          )}
        </div>
      )}
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
      {/* Not a <label>: clicking one activates its first button, which would remove a tag. */}
      <div className={styles.flashField}>
        <span>
          Tags <em>(optional)</em>
        </span>
        <TagInput
          tags={tags}
          text={tagText}
          suggestions={suggestions}
          onTagsChange={setTags}
          onTextChange={setTagText}
        />
      </div>
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

/** Tag chips plus a text box: Enter or comma adds a tag, Backspace on an empty box removes one. */
function TagInput({
  tags,
  text,
  suggestions,
  onTagsChange,
  onTextChange,
}: {
  tags: string[];
  text: string;
  suggestions: string[];
  onTagsChange: (tags: string[]) => void;
  onTextChange: (text: string) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const unused = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()));

  function commit() {
    onTagsChange(addTag(tags, text));
    onTextChange("");
  }

  return (
    <div className={styles.tagInput} onClick={() => inputRef.current?.focus()}>
      {tags.map((t) => (
        <span key={t} className={styles.flashTag}>
          {t}
          <button
            className={styles.tagRemove}
            aria-label={`Remove tag ${t}`}
            onClick={(e) => {
              e.stopPropagation();
              onTagsChange(tags.filter((x) => x !== t));
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        list={listId}
        value={text}
        aria-label="Tags"
        placeholder={tags.length ? "" : "e.g. definitions, exam"}
        onChange={(e) => {
          // A pasted "a, b, c" becomes three tags; the part after the last comma keeps typing.
          const parts = e.target.value.split(",");
          if (parts.length > 1) {
            onTagsChange(parts.slice(0, -1).reduce(addTag, tags));
            onTextChange(parts[parts.length - 1].trimStart());
          } else {
            onTextChange(e.target.value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && text.trim()) {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !text && tags.length) {
            onTagsChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (text.trim()) commit();
        }}
      />
      <datalist id={listId}>
        {unused.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

/** `tags` plus `raw` (trimmed), unless it's empty or already there in any letter case. */
function addTag(tags: string[], raw: string): string[] {
  const tag = raw.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}

/** A card's source, or null for cards made without one. */
function cardSource(card: Flashcard): CardSource | null {
  if (card.page === null) return null;
  return { page: card.page, y: card.y, section_id: card.section_id, section: card.section };
}

/** "§ 3.2 Attention · p. 14", or just "p. 14" outside any section. */
function formatSource(source: CardSource): string {
  return source.section ? `§ ${source.section} · p. ${source.page}` : `p. ${source.page}`;
}

function matchesFilter(card: Flashcard, filter: Filter): boolean {
  if (filter.startsWith("s:")) {
    const id = filter.slice(2);
    return card.section_id === id || !!card.section_id?.startsWith(`${id}.`);
  }
  if (filter.startsWith("t:")) {
    const tag = filter.slice(2);
    return card.tags.some((t) => t.toLowerCase() === tag);
  }
  return true;
}

/**
 * Section filters: every outline entry holding cards, directly or in a subsection, in outline
 * order and nested by depth. Sections missing from the outline (or with no outline at all)
 * fall back to the title stored on their cards.
 */
function sectionFilters(cards: Flashcard[], outline: OutlineNode[] | null): FilterOption[] {
  const ids = new Map<string, string>(); // section_id → stored title
  for (const c of cards) {
    if (c.section_id && !ids.has(c.section_id)) ids.set(c.section_id, c.section ?? "Untitled");
  }
  if (!ids.size) return [];

  const options: FilterOption[] = [];
  const seen = new Set<string>();
  const walk = (nodes: OutlineNode[], depth: number) => {
    for (const n of nodes) {
      const holds = [...ids.keys()].some((id) => id === n.id || id.startsWith(`${n.id}.`));
      if (!holds) continue;
      options.push({ value: `s:${n.id}`, label: n.title, depth });
      seen.add(n.id);
      walk(n.children, depth + 1);
    }
  };
  walk(outline ?? [], 0);

  for (const [id, title] of ids) {
    if (!seen.has(id)) options.push({ value: `s:${id}`, label: title, depth: 0 });
  }
  return options;
}

/** Tag filters: every tag in use (first spelling wins), alphabetically. */
function tagFilters(cards: Flashcard[]): FilterOption[] {
  const tags = new Map<string, string>();
  for (const c of cards) {
    for (const t of c.tags) if (!tags.has(t.toLowerCase())) tags.set(t.toLowerCase(), t);
  }
  return [...tags.values()]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((t) => ({ value: `t:${t.toLowerCase()}`, label: `# ${t}`, depth: 0 }));
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ flip, down }: { flip?: boolean; down?: boolean }) {
  const rotate = flip ? 180 : down ? 90 : 0;
  const size = down ? 14 : 18;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
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

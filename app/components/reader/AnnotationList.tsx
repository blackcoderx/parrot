"use client";

import { useState } from "react";
import { matchesFilter } from "@/components/search/filter";
import type { Highlight } from "./types";
import { NoteIcon } from "./NoteIcon";
import Markdown from "./Markdown";
import styles from "./OutlinePanel.module.css";

interface Props {
  highlights: Highlight[];
  /** Scroll to a spot on a page; `y` is 0 (top) .. 1 (bottom). */
  onJump: (page: number, y: number) => void;
}

/**
 * Every highlight, note and saved thread in the document, grouped by page in reading order,
 * with a box to filter them by their text.
 */
export function AnnotationList({ highlights, onJump }: Props) {
  const [filter, setFilter] = useState("");

  if (highlights.length === 0) {
    return <p className={styles.outlineEmpty}>No highlights or notes yet.</p>;
  }

  const sorted = [...highlights]
    .filter((h) => matchesFilter(`${h.note ?? ""} ${h.text}`, filter))
    .sort((a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0));
  const pages: { page: number; items: Highlight[] }[] = [];
  for (const h of sorted) {
    const last = pages[pages.length - 1];
    if (last?.page === h.page) last.items.push(h);
    else pages.push({ page: h.page, items: [h] });
  }

  return (
    <>
      <input
        className={styles.annotationFilter}
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter notes and highlights"
        aria-label="Filter notes and highlights"
      />
      {pages.length === 0 && <p className={styles.outlineEmpty}>Nothing matches.</p>}
      <ul className={styles.outlineList}>
        {pages.map(({ page, items }) => (
          <li key={page}>
            <div className={styles.annotationPage}>Page {page}</div>
            <ul className={styles.outlineList}>
              {items.map((h) => {
                const snippet = h.note || h.text || "Selected region";
                return (
                  <li key={h.id}>
                    <button
                      className={styles.annotationItem}
                      title={snippet}
                      onClick={() => onJump(h.page, h.rects[0]?.y ?? 0)}
                    >
                      <KindMarker highlight={h} />
                      <span className={styles.outlineTitle}>
                        {/* Notes are Markdown + LaTeX; highlight text is plain PDF text. */}
                        {h.note ? <Markdown inline>{h.note}</Markdown> : snippet}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

/** A note glyph, an accent dot for a saved thread, or the highlight's own colour. */
export function KindMarker({ highlight: h }: { highlight: Highlight }) {
  if (h.note !== null) {
    return (
      <span className={styles.annotationMarker} data-kind="note" aria-label="Note">
        <NoteIcon size={13} />
      </span>
    );
  }
  if (h.chat_id !== null) {
    return <span className={styles.annotationDot} data-kind="thread" aria-label="Saved thread" />;
  }
  return (
    <span
      className={styles.annotationDot}
      style={{ background: h.color }}
      aria-label="Highlight"
    />
  );
}

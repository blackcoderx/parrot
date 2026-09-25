"use client";

import type { Highlight } from "./types";
import { NoteIcon } from "./NoteIcon";
import styles from "./OutlinePanel.module.css";

interface Props {
  highlights: Highlight[];
  /** Scroll to a spot on a page; `y` is 0 (top) .. 1 (bottom). */
  onJump: (page: number, y: number) => void;
}

/** Every highlight, note and saved thread in the document, grouped by page in reading order. */
export function AnnotationList({ highlights, onJump }: Props) {
  if (highlights.length === 0) {
    return <p className={styles.outlineEmpty}>No highlights or notes yet.</p>;
  }

  const sorted = [...highlights].sort(
    (a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0),
  );
  const pages: { page: number; items: Highlight[] }[] = [];
  for (const h of sorted) {
    const last = pages[pages.length - 1];
    if (last?.page === h.page) last.items.push(h);
    else pages.push({ page: h.page, items: [h] });
  }

  return (
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
                    <span className={styles.outlineTitle}>{snippet}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** A note glyph, an accent dot for a saved thread, or the highlight's own colour. */
function KindMarker({ highlight: h }: { highlight: Highlight }) {
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

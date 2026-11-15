"use client";

import { memo } from "react";
import type { Highlight } from "./types";
import { NoteIcon } from "./NoteIcon";
import styles from "./Reader.module.css";

interface Props {
  highlights: Highlight[];
  onDelete: (id: string) => void;
  onOpen: (h: Highlight, anchorRect: DOMRect) => void;
  onOpenNote: (h: Highlight, anchorRect: DOMRect) => void;
}

/**
 * Overlay of stored highlights for a single page. Rects are normalized (0..1),
 * so positioning them in percentages keeps them aligned at any zoom level.
 * A highlight is one of: a note (opens the note editor, rendered faint with a
 * corner icon), a saved chat (opens the thread), or plain (removed on click).
 */
export const HighlightLayer = memo(function HighlightLayer({
  highlights,
  onDelete,
  onOpen,
  onOpenNote,
}: Props) {
  // Page notes have no rects: they show as pins stacked down the page's top-right corner.
  const pageNotes = highlights.filter((h) => h.note !== null && h.rects.length === 0);
  return (
    <div className={styles.highlightLayer}>
      {pageNotes.map((h, i) => (
        <button
          key={h.id}
          type="button"
          className={styles.pageNotePin}
          style={{ top: 10 + i * 30 }}
          title="Open page note"
          aria-label="Open page note"
          onClick={(e) => onOpenNote(h, e.currentTarget.getBoundingClientRect())}
        >
          <NoteIcon size={14} />
        </button>
      ))}
      {highlights.map((h) => {
        const hasNote = h.note !== null;
        const hasChat = !hasNote && h.chat_id !== null;
        const className = hasNote
          ? styles.noteHighlight
          : hasChat
            ? styles.chatHighlight
            : styles.highlight;
        return h.rects.map((r, i) => (
          <div
            key={`${h.id}-${i}`}
            className={className}
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
              // Note highlights (CSS) and chat highlights (accent) set their own
              // background; only plain highlights carry an explicit color.
              ...(hasNote || hasChat ? {} : { background: h.color }),
            }}
            title={
              hasNote
                ? "Open note"
                : hasChat
                  ? "Open saved Parrot thread"
                  : "Click to remove highlight"
            }
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              if (hasNote) onOpenNote(h, rect);
              else if (hasChat) onOpen(h, rect);
              else onDelete(h.id);
            }}
          >
            {hasNote && i === 0 && (
              <span className={styles.noteBadge} aria-hidden>
                <NoteIcon size={12} />
              </span>
            )}
          </div>
        ));
      })}
    </div>
  );
});

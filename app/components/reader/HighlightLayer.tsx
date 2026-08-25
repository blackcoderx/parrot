"use client";

import type { Highlight } from "./types";
import styles from "./Reader.module.css";

interface Props {
  highlights: Highlight[];
  onDelete: (id: string) => void;
  onOpen: (h: Highlight, anchorRect: DOMRect) => void;
}

/**
 * Overlay of stored highlights for a single page. Rects are normalized (0..1),
 * so positioning them in percentages keeps them aligned at any zoom level.
 * Highlights with a saved chat open the thread on click; plain ones are removed.
 */
export function HighlightLayer({ highlights, onDelete, onOpen }: Props) {
  return (
    <div className={styles.highlightLayer}>
      {highlights.map((h) => {
        const hasChat = h.chat_id !== null;
        return h.rects.map((r, i) => (
          <div
            key={`${h.id}-${i}`}
            className={hasChat ? styles.chatHighlight : styles.highlight}
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
              // Chat highlights derive their background from the accent (via CSS).
              ...(hasChat ? {} : { background: h.color }),
            }}
            title={hasChat ? "Open saved Parrot thread" : "Click to remove highlight"}
            onClick={(e) =>
              hasChat ? onOpen(h, (e.currentTarget as HTMLElement).getBoundingClientRect()) : onDelete(h.id)
            }
          />
        ));
      })}
    </div>
  );
}

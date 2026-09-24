"use client";

import type { NormRect } from "./types";
import { normalizeBox, useDragBox } from "./useDragBox";
import styles from "./Reader.module.css";

interface Props {
  pageNumber: number;
  onRegion: (page: number, rect: NormRect, anchorRect: DOMRect) => void;
}

/**
 * Active in note-pen mode: drag a rectangle over the page and hand back the
 * region as a normalized rect (a note anchors to the region — no image needed).
 */
export function NotePenLayer({ pageNumber, onRegion }: Props) {
  const { ref, box, handlers } = useDragBox((b, _layer, rect) => {
    const { norm, anchorRect } = normalizeBox(b, rect);
    onRegion(pageNumber, norm, anchorRect);
  });

  return (
    <div ref={ref} className={styles.notePenLayer} {...handlers}>
      {box && (
        <div
          className={styles.notePenBox}
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      )}
    </div>
  );
}

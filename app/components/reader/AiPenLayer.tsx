"use client";

import type { NormRect } from "./types";
import { normalizeBox, useDragBox } from "./useDragBox";
import styles from "./Reader.module.css";

interface Props {
  pageNumber: number;
  onRegion: (page: number, rect: NormRect, image: string, anchorRect: DOMRect) => void;
}

/**
 * Active in AI-pen mode: drag a rectangle over the page, then crop that region
 * from the rendered page canvas and hand it back as a PNG data URL.
 */
export function AiPenLayer({ pageNumber, onRegion }: Props) {
  const { ref, box, handlers } = useDragBox((b, layer, rect) => {
    const canvas = layer.parentElement?.querySelector("canvas");
    if (!canvas) return;

    // Crop the region from the page canvas (canvas covers the page box exactly).
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const tmp = document.createElement("canvas");
    tmp.width = Math.round(b.w * scaleX);
    tmp.height = Math.round(b.h * scaleY);
    const ctx = tmp.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      canvas,
      b.x * scaleX,
      b.y * scaleY,
      b.w * scaleX,
      b.h * scaleY,
      0,
      0,
      tmp.width,
      tmp.height,
    );

    const { norm, anchorRect } = normalizeBox(b, rect);
    onRegion(pageNumber, norm, tmp.toDataURL("image/png"), anchorRect);
  });

  return (
    <div ref={ref} className={styles.aiPenLayer} {...handlers}>
      {box && (
        <div
          className={styles.aiPenBox}
          style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        />
      )}
    </div>
  );
}

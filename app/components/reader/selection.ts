import type { NormRect } from "./types";

export interface SelectionInfo {
  page: number;
  rects: NormRect[];
  text: string;
  /** Bounding rect of the selection in viewport coords, for anchoring the menu. */
  anchorRect: DOMRect;
}

/**
 * Read the current text selection and express it relative to the page wrapper it
 * falls in. Returns null when there's no usable selection.
 */
export function readSelection(): SelectionInfo | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const text = sel.toString().trim();
  if (!text) return null;

  const range = sel.getRangeAt(0);
  const startEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement;
  const pageEl = startEl?.closest<HTMLElement>("[data-page]");
  if (!pageEl) return null;

  const page = Number(pageEl.dataset.page);
  const wrap = pageEl.getBoundingClientRect();

  const rects: NormRect[] = [];
  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 1 || r.height < 1) continue;
    // Keep only rects that fall within this page (ignore spillover to other pages).
    const cy = r.top + r.height / 2;
    if (cy < wrap.top || cy > wrap.bottom) continue;
    rects.push({
      x: (r.left - wrap.left) / wrap.width,
      y: (r.top - wrap.top) / wrap.height,
      w: r.width / wrap.width,
      h: r.height / wrap.height,
    });
  }
  if (rects.length === 0) return null;

  return { page, rects, text, anchorRect: range.getBoundingClientRect() };
}

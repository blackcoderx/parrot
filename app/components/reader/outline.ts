import type { DocumentProps } from "react-pdf";

/** The loaded pdf.js document, as react-pdf hands it to `onLoadSuccess`. */
export type PdfDocument = Parameters<NonNullable<DocumentProps["onLoadSuccess"]>>[0];

export interface OutlineNode {
  id: string;
  title: string;
  /** 1-based target page, or null if the entry has no in-document destination. */
  page: number | null;
  /** Heading position on its page, normalized 0 (top) .. 1 (bottom), when the PDF gives one. */
  y: number | null;
  children: OutlineNode[];
}

type RawItem = Awaited<ReturnType<PdfDocument["getOutline"]>>[number];

/** Read the PDF's embedded outline (bookmarks) and resolve each entry to a page + position. */
export async function loadOutline(pdf: PdfDocument): Promise<OutlineNode[]> {
  const raw = await pdf.getOutline().catch(() => null);
  if (!raw?.length) return [];

  async function resolve(item: RawItem, id: string): Promise<OutlineNode> {
    let page: number | null = null;
    let y: number | null = null;
    try {
      const dest = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
      if (Array.isArray(dest) && dest.length) {
        const target = dest[0];
        const index =
          typeof target === "number" ? target : await pdf.getPageIndex(target);
        page = index + 1;
        // [ref, { name: "XYZ" }, left, top, zoom] — `top` is in PDF space (origin bottom-left).
        if (dest[1]?.name === "XYZ" && typeof dest[3] === "number") {
          const [, y0, , y1] = (await pdf.getPage(page)).view;
          y = Math.min(1, Math.max(0, 1 - (dest[3] - y0) / (y1 - y0)));
        }
      }
    } catch {
      // Unresolvable destination — leave the entry disabled rather than failing the tree.
    }
    const children = await Promise.all(
      (item.items ?? []).map((child: RawItem, i: number) => resolve(child, `${id}.${i}`)),
    );
    return { id, title: item.title.trim() || "Untitled", page, y, children };
  }

  return Promise.all(raw.map((item, i) => resolve(item, String(i))));
}

/** The section the reader is in: the last entry (document order) starting at or before `currentPage`. */
export function activeOutlineId(nodes: OutlineNode[], currentPage: number): string | null {
  let active: string | null = null;
  const walk = (list: OutlineNode[]) => {
    for (const n of list) {
      if (n.page !== null && n.page <= currentPage) active = n.id;
      walk(n.children);
    }
  };
  walk(nodes);
  return active;
}

/** Ids of every ancestor of `id` (ids are dotted paths, e.g. "2.1.0"). */
export function ancestorIds(id: string): string[] {
  const parts = id.split(".");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("."));
}

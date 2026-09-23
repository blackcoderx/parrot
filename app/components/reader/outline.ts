import type { DocumentProps } from "react-pdf";

/** The loaded pdf.js document, as react-pdf hands it to `onLoadSuccess`. */
export type PdfDocument = Parameters<NonNullable<DocumentProps["onLoadSuccess"]>>[0];

export interface OutlineNode {
  id: string;
  title: string;
  /** 1-based target page, or null if the entry has no in-document destination. */
  page: number | null;
  /**
   * The heading's `top` in PDF user space (origin bottom-left), when the destination gives one.
   * Turned into an on-page position only when clicked (see `headingY`), so loading the outline
   * never has to fetch page objects from the pdf.js worker.
   */
  top: number | null;
  children: OutlineNode[];
}

type RawItem = Awaited<ReturnType<PdfDocument["getOutline"]>>[number];
type PageRef = { num: number; gen: number };

/**
 * Read the PDF's embedded outline (bookmarks) and resolve each entry to a page.
 *
 * Every lookup is a round-trip to the pdf.js worker, so all entries resolve in parallel and
 * page refs are memoized — many entries point at the same page.
 */
export async function loadOutline(pdf: PdfDocument): Promise<OutlineNode[]> {
  const raw = await pdf.getOutline().catch(() => null);
  if (!raw?.length) return [];

  const pageIndexByRef = new Map<string, Promise<number>>();
  function pageIndex(ref: PageRef): Promise<number> {
    const key = `${ref.num}R${ref.gen}`;
    let index = pageIndexByRef.get(key);
    if (!index) {
      index = pdf.getPageIndex(ref);
      pageIndexByRef.set(key, index);
    }
    return index;
  }

  async function resolve(item: RawItem): Promise<{ page: number | null; top: number | null }> {
    try {
      const dest = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
      if (!Array.isArray(dest) || !dest.length) return { page: null, top: null };
      const target = dest[0];
      const index = typeof target === "number" ? target : await pageIndex(target);
      // [ref, { name: "XYZ" }, left, top, zoom]
      const top = dest[1]?.name === "XYZ" && typeof dest[3] === "number" ? dest[3] : null;
      return { page: index + 1, top };
    } catch {
      // Unresolvable destination — leave the entry disabled rather than failing the tree.
      return { page: null, top: null };
    }
  }

  function build(items: RawItem[], prefix: string): Promise<OutlineNode[]> {
    return Promise.all(
      items.map(async (item, i) => {
        const id = prefix ? `${prefix}.${i}` : String(i);
        const [target, children] = await Promise.all([
          resolve(item),
          build(item.items ?? [], id),
        ]);
        return { id, title: item.title.trim() || "Untitled", ...target, children };
      }),
    );
  }

  return build(raw, "");
}

/** Where a heading sits on its page, 0 (top) .. 1 (bottom), or null to use the page top. */
export async function headingY(pdf: PdfDocument, node: OutlineNode): Promise<number | null> {
  if (node.page === null || node.top === null) return null;
  try {
    const [, y0, , y1] = (await pdf.getPage(node.page)).view;
    return Math.min(1, Math.max(0, 1 - (node.top - y0) / (y1 - y0)));
  } catch {
    return null;
  }
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

import type { PdfDocument } from "./outline";

/** One pdf.js text item: its text and where it sits on the page, 0 (top) .. 1 (bottom). */
interface TextLine {
  str: string;
  y: number;
}

/** The document's text, indexed by page (index 0 = page 1). */
export type PageText = TextLine[][];

export interface Match {
  page: number;
  y: number;
}

/**
 * Read every page's text. Pages are fetched one at a time so the pdf.js worker can still
 * answer rendering requests in between (the reader keeps working while this runs).
 */
export async function extractText(
  pdf: PdfDocument,
  onProgress: (done: number, total: number) => void,
): Promise<PageText> {
  const pages: PageText = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    try {
      const page = await pdf.getPage(n);
      const [, y0, , y1] = page.view;
      const content = await page.getTextContent();
      const lines: TextLine[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        // transform[5] is the baseline in PDF user space (origin bottom-left) — same
        // conversion as headingY in outline.ts. Nudge up by the height to land on the line.
        const top = item.transform[5] + item.height;
        lines.push({ str: item.str, y: Math.min(1, Math.max(0, 1 - (top - y0) / (y1 - y0))) });
      }
      pages.push(lines);
    } catch {
      pages.push([]); // an unreadable page just has no matches
    }
    onProgress(n, pdf.numPages);
  }
  return pages;
}

/** Case-insensitive search, in document order. */
export function findMatches(pages: PageText, query: string): Match[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches: Match[] = [];
  pages.forEach((lines, i) => {
    for (const line of lines) {
      // Matching is per text item, so a phrase that pdf.js split across two items (e.g.
      // across a line break) isn't found. Fine for words and phrases within a line.
      let from = 0;
      const text = line.str.toLowerCase();
      while ((from = text.indexOf(q, from)) !== -1) {
        matches.push({ page: i + 1, y: line.y });
        from += q.length;
      }
    }
  });
  return matches;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A react-pdf `customTextRenderer` that wraps occurrences of `query` in <mark>. react-pdf
 * parses the returned string as HTML, so everything else is escaped.
 */
export function markMatches(query: string): (item: { str: string }) => string {
  const re = new RegExp(`(${escapeRegExp(query.trim())})`, "gi");
  // split() with a capture group puts the matches at the odd indices.
  return ({ str }) =>
    str
      .split(re)
      .map((part, i) => (i % 2 === 1 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part)))
      .join("");
}

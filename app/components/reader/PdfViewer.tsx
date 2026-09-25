"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { HighlightLayer } from "./HighlightLayer";
import { AiPenLayer } from "./AiPenLayer";
import { NotePenLayer } from "./NotePenLayer";
import type { Highlight, NormRect } from "./types";
import { markMatches } from "./find";
import type { PdfDocument } from "./outline";
import styles from "./Reader.module.css";

type Size = { w: number; h: number };

// Serve the worker from /public (copied from pdfjs-dist) — reliable across bundlers.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const NO_HIGHLIGHTS: Highlight[] = [];

interface Props {
  documentId: string;
  scale: number;
  highlights: Highlight[];
  initialPage: number;
  /** `y` (0..1 down the page) scrolls to a spot within the page instead of its top. */
  scrollToPage: { page: number; y?: number | null; nonce: number } | null;
  /** Current find-in-document query; matches in rendered pages are wrapped in <mark>. */
  findQuery: string;
  aiMode: boolean;
  noteMode: boolean;
  onNumPages: (n: number) => void;
  onDocument: (pdf: PdfDocument) => void;
  onPageChange: (page: number) => void;
  onDeleteHighlight: (id: string) => void;
  onOpenHighlight: (h: Highlight, anchorRect: DOMRect) => void;
  onOpenNote: (h: Highlight, anchorRect: DOMRect) => void;
  onRegion: (page: number, rect: NormRect, image: string, anchorRect: DOMRect) => void;
  onNoteRegion: (page: number, rect: NormRect, anchorRect: DOMRect) => void;
}

export const PdfViewer = memo(function PdfViewer({
  documentId,
  scale,
  highlights,
  initialPage,
  scrollToPage,
  findQuery,
  aiMode,
  noteMode,
  onNumPages,
  onDocument,
  onPageChange,
  onDeleteHighlight,
  onOpenHighlight,
  onOpenNote,
  onRegion,
  onNoteRegion,
}: Props) {
  const [numPages, setNumPages] = useState(0);
  // Page size at scale 1 (CSS px). Page 1's size stands in for pages that haven't loaded
  // yet; each page's real size replaces it once that page is rendered.
  const [baseSize, setBaseSize] = useState<Size | null>(null);
  const [sizes, setSizes] = useState<Record<number, Size>>({});
  // Only pages near the viewport render a canvas + text layer; the rest are sized
  // placeholders. Rendering every page at once froze the tab on long books and kept the
  // pdf.js worker too busy to answer anything else (like outline lookups).
  const [nearPages, setNearPages] = useState<ReadonlySet<number>>(() => new Set());
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const file = `/api/files/${documentId}`;

  // Group once per highlights change rather than filtering the full list for every page.
  const byPage = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const h of highlights) {
      const list = map.get(h.page);
      if (list) list.push(h);
      else map.set(h.page, [h]);
    }
    return map;
  }, [highlights]);

  // Memoized per query: a new renderer makes react-pdf redraw every mounted text layer.
  const textRenderer = useMemo(
    () => (findQuery.trim() ? markMatches(findQuery) : undefined),
    [findQuery],
  );

  // Mount pages within ~1.5 screens of the viewport; unmount (freeing canvases) beyond that.
  useEffect(() => {
    if (!numPages || !baseSize) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setNearPages((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const page = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(page);
            else next.delete(page);
          }
          return next;
        });
      },
      { rootMargin: "150% 0px" },
    );
    pageRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages, baseSize]);

  // Restore scroll to the last-read page as soon as the placeholders are laid out, then
  // mount the pages around it straight away rather than waiting a frame for the observer.
  useLayoutEffect(() => {
    if (!baseSize) return;
    if (initialPage > 1) pageRefs.current[initialPage - 1]?.scrollIntoView({ block: "start" });
    const margin = window.innerHeight * 1.5;
    const near = new Set<number>();
    pageRefs.current.forEach((el, i) => {
      const r = el?.getBoundingClientRect();
      if (r && r.bottom >= -margin && r.top <= window.innerHeight + margin) near.add(i + 1);
    });
    // Measured from layout, so it must run here (before paint), not in render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNearPages(near);
    // Only on first layout — later scrolling belongs to the reader and the observer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSize]);

  // Track the most-visible page and report it upward.
  useEffect(() => {
    if (!numPages || !baseSize) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const page = Number((visible.target as HTMLElement).dataset.page);
          if (page) onPageChange(page);
        }
      },
      { threshold: [0.25, 0.5, 0.75] },
    );
    pageRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages, baseSize, onPageChange]);

  // Jump to a requested page (from the toolbar), reusing the same scroll as restore.
  useEffect(() => {
    if (!scrollToPage || !numPages) return;
    const target = pageRefs.current[scrollToPage.page - 1];
    if (!target) return;
    if (scrollToPage.y == null) {
      target.scrollIntoView({ block: "start" });
      return;
    }
    // Land the spot just below the sticky header, with a little breathing room.
    const header = parseFloat(getComputedStyle(target).getPropertyValue("--reader-header-h")) || 0;
    const top = target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + scrollToPage.y * target.offsetHeight - header - 12 });
  }, [scrollToPage, numPages]);

  function handleLoad(pdf: PdfDocument) {
    setNumPages(pdf.numPages);
    onNumPages(pdf.numPages);
    onDocument(pdf);
    pdf
      .getPage(1)
      .then((page) => {
        const { width, height } = page.getViewport({ scale: 1 });
        setBaseSize({ w: width, h: height });
      })
      .catch(() => setBaseSize({ w: 612, h: 792 })); // US Letter, if page 1 won't load
  }

  function handlePageLoad(pageNumber: number, w: number, h: number) {
    setSizes((prev) =>
      prev[pageNumber]?.w === w && prev[pageNumber]?.h === h
        ? prev
        : { ...prev, [pageNumber]: { w, h } },
    );
  }

  return (
    <Document
      file={file}
      onLoadSuccess={handleLoad}
      loading={<Loading />}
      error={<LoadError />}
      // Internal links: scroll to the target page's top (same mechanism as the
      // toolbar jump / initial-page restore; pdf.js resolves the destination to
      // a 1-based pageNumber for us) and update the page indicator immediately —
      // a programmatic scroll doesn't reliably trigger the tracking observer.
      onItemClick={({ pageNumber }) => {
        pageRefs.current[pageNumber - 1]?.scrollIntoView({ block: "start" });
        onPageChange(pageNumber);
      }}
      // External links open in a new tab (rel defaults to
      // "noopener noreferrer nofollow").
      externalLinkTarget="_blank"
    >
      {baseSize &&
        Array.from({ length: numPages }, (_, i) => {
          const pageNumber = i + 1;
          const size = sizes[pageNumber] ?? baseSize;
          return (
            <div
              key={pageNumber}
              data-page={pageNumber}
              ref={(el) => {
                pageRefs.current[i] = el;
              }}
              className={styles.pageWrap}
              style={{ width: size.w * scale, height: size.h * scale }}
            >
              {nearPages.has(pageNumber) && (
                <>
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    renderTextLayer
                    customTextRenderer={textRenderer}
                    loading=""
                    onLoadSuccess={(page) =>
                      handlePageLoad(pageNumber, page.originalWidth, page.originalHeight)
                    }
                  />
                  <HighlightLayer
                    highlights={byPage.get(pageNumber) ?? NO_HIGHLIGHTS}
                    onDelete={onDeleteHighlight}
                    onOpen={onOpenHighlight}
                    onOpenNote={onOpenNote}
                  />
                  {aiMode && <AiPenLayer pageNumber={pageNumber} onRegion={onRegion} />}
                  {noteMode && <NotePenLayer pageNumber={pageNumber} onRegion={onNoteRegion} />}
                </>
              )}
            </div>
          );
        })}
    </Document>
  );
});

function Loading() {
  return <div className={styles.status}>Loading document…</div>;
}

function LoadError() {
  return <div className={styles.status}>Could not load this PDF.</div>;
}

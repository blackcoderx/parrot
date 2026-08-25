"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { HighlightLayer } from "./HighlightLayer";
import { AiPenLayer } from "./AiPenLayer";
import type { Highlight, NormRect } from "./types";
import styles from "./Reader.module.css";

// Serve the worker from /public (copied from pdfjs-dist) — reliable across bundlers.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface Props {
  documentId: string;
  scale: number;
  highlights: Highlight[];
  initialPage: number;
  aiMode: boolean;
  onNumPages: (n: number) => void;
  onPageChange: (page: number) => void;
  onDeleteHighlight: (id: string) => void;
  onOpenHighlight: (h: Highlight, anchorRect: DOMRect) => void;
  onRegion: (page: number, rect: NormRect, image: string, anchorRect: DOMRect) => void;
}

export function PdfViewer({
  documentId,
  scale,
  highlights,
  initialPage,
  aiMode,
  onNumPages,
  onPageChange,
  onDeleteHighlight,
  onOpenHighlight,
  onRegion,
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const didRestore = useRef(false);

  const file = `/api/files/${documentId}`;

  // Track the most-visible page and report it upward.
  useEffect(() => {
    if (!numPages) return;
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
  }, [numPages, onPageChange]);

  function handleLoad({ numPages: n }: { numPages: number }) {
    setNumPages(n);
    onNumPages(n);
  }

  // Restore scroll to the last-read page once pages exist.
  function handlePageRender() {
    if (didRestore.current || !numPages || initialPage <= 1) return;
    const target = pageRefs.current[initialPage - 1];
    if (target) {
      didRestore.current = true;
      target.scrollIntoView({ block: "start" });
    }
  }

  return (
    <Document file={file} onLoadSuccess={handleLoad} loading={<Loading />} error={<LoadError />}>
      {Array.from({ length: numPages }, (_, i) => {
        const pageNumber = i + 1;
        return (
          <div
            key={pageNumber}
            data-page={pageNumber}
            ref={(el) => {
              pageRefs.current[i] = el;
            }}
            className={styles.pageWrap}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderAnnotationLayer={false}
              renderTextLayer
              onRenderSuccess={handlePageRender}
            />
            <HighlightLayer
              highlights={highlights.filter((h) => h.page === pageNumber)}
              onDelete={onDeleteHighlight}
              onOpen={onOpenHighlight}
            />
            {aiMode && <AiPenLayer pageNumber={pageNumber} onRegion={onRegion} />}
          </div>
        );
      })}
    </Document>
  );
}

function Loading() {
  return <div className={styles.status}>Loading document…</div>;
}

function LoadError() {
  return <div className={styles.status}>Could not load this PDF.</div>;
}

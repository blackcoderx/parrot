"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Toolbar } from "./Toolbar";
import { SelectionMenu } from "./SelectionMenu";
import { AskParrot, type AskAnchor } from "./AskParrot";
import { NoteEditor, type NoteAnchor } from "./NoteEditor";
import { OutlinePanel } from "./OutlinePanel";
import { Flashcards, type FlashView } from "./Flashcards";
import { headingY, loadOutline, type OutlineNode, type PdfDocument } from "./outline";
import { readSelection, type SelectionInfo } from "./selection";
import { HIGHLIGHT_COLORS, type Highlight, type NormRect } from "./types";
import styles from "./Reader.module.css";

// react-pdf (pdf.js) touches browser-only globals at module load, so it must be client-only.
const PdfViewer = dynamic(() => import("./PdfViewer").then((m) => m.PdfViewer), {
  ssr: false,
  loading: () => <div className={styles.status}>Loading viewer…</div>,
});

interface Props {
  documentId: string;
  title: string;
  initialPage: number;
}

interface AskState {
  anchor: AskAnchor;
  anchorRect: DOMRect;
}

interface NoteState {
  anchor: NoteAnchor;
  anchorRect: DOMRect;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.2;
const OUTLINE_KEY = "parrot.outlineOpen";

export function Reader({ documentId, title, initialPage }: Props) {
  const [scale, setScale] = useState(1.2);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [activeColor, setActiveColor] = useState(HIGHLIGHT_COLORS[0]);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [aiMode, setAiMode] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  const [ask, setAsk] = useState<AskState | null>(null);
  const [note, setNote] = useState<NoteState | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [jump, setJump] = useState<{ page: number; y?: number | null; nonce: number } | null>(
    null,
  );
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  const [flashOpen, setFlashOpen] = useState(false);
  const [flashView, setFlashView] = useState<FlashView>({ kind: "review" });
  const toolbarRef = useRef<HTMLDivElement>(null);
  const cachedOutline = useRef<Promise<OutlineNode[] | null> | null>(null);
  const pdfRef = useRef<PdfDocument | null>(null);
  const pageRef = useRef(initialPage);
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadHighlights = useCallback(() => {
    fetch(`/api/highlights?documentId=${documentId}`)
      .then((r) => r.json())
      .then(setHighlights)
      .catch(() => setHighlights([]));
  }, [documentId]);

  useEffect(() => {
    loadHighlights();
  }, [loadHighlights]);

  function toggleOutline() {
    setOutlineOpen((open) => {
      try {
        localStorage.setItem(OUTLINE_KEY, open ? "0" : "1");
      } catch {}
      return !open;
    });
  }

  // The outline is cached server-side after the first open; start fetching it right away
  // so the sidebar can fill before the PDF has even finished loading.
  useEffect(() => {
    const cached = fetch(`/api/documents/${documentId}/outline`)
      .then((r) => (r.ok ? (r.json() as Promise<OutlineNode[] | null>) : null))
      .catch(() => null);
    cachedOutline.current = cached;
    cached.then((nodes) => nodes && setOutline(nodes));
  }, [documentId]);

  // Once the PDF loads: restore whether the contents sidebar was open (a per-browser
  // convenience, read client-side only to keep hydration clean) and, if the outline
  // wasn't cached, read it from the PDF and cache it.
  const handleDocument = useCallback(
    async (pdf: PdfDocument) => {
      pdfRef.current = pdf;
      try {
        if (localStorage.getItem(OUTLINE_KEY) === "1") setOutlineOpen(true);
      } catch {}
      if (await cachedOutline.current) return;
      const nodes = await loadOutline(pdf).catch(() => [] as OutlineNode[]);
      setOutline(nodes);
      fetch(`/api/documents/${documentId}/outline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nodes),
      }).catch(() => {});
    },
    [documentId],
  );

  async function handleOutlineSelect(node: OutlineNode) {
    if (node.page === null) return;
    const page = node.page;
    setCurrentPage(page);
    const y = pdfRef.current ? await headingY(pdfRef.current, node) : null;
    setJump((j) => ({ page, y, nonce: (j?.nonce ?? 0) + 1 }));
  }

  // Detect text selections inside the viewer (ignored while a pen tool is active).
  const onMouseUp = useCallback(() => {
    if (aiMode || noteMode) return;
    setTimeout(() => setSelection(readSelection()), 0);
  }, [aiMode, noteMode]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  async function handleHighlight() {
    if (!selection) return;
    const res = await fetch("/api/highlights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        page: selection.page,
        rects: selection.rects,
        color: activeColor,
        text: selection.text,
      }),
    });
    if (res.ok) {
      const created: Highlight = await res.json();
      setHighlights((prev) => [...prev, created]);
    }
    clearSelection();
  }

  function handleCopy() {
    if (selection) navigator.clipboard?.writeText(selection.text);
    clearSelection();
  }

  // Ask Parrot from a text selection.
  function handleAsk() {
    if (!selection) return;
    setAsk({
      anchor: {
        kind: "selection",
        page: selection.page,
        rects: selection.rects,
        text: selection.text,
      },
      anchorRect: selection.anchorRect,
    });
    setSelection(null); // hide the selection menu (keep the browser selection visible)
  }

  // Ask Parrot from an AI-pen region.
  function handleRegion(page: number, rect: NormRect, image: string, anchorRect: DOMRect) {
    setAiMode(false);
    setAsk({ anchor: { kind: "region", page, rect, image }, anchorRect });
  }

  // Reopen a saved thread from its highlight.
  function handleOpenHighlight(h: Highlight, anchorRect: DOMRect) {
    setAsk({ anchor: { kind: "existing", highlightId: h.id }, anchorRect });
  }

  // Add a note from a text selection.
  function handleNote() {
    if (!selection) return;
    setNote({
      anchor: {
        kind: "selection",
        page: selection.page,
        rects: selection.rects,
        text: selection.text,
      },
      anchorRect: selection.anchorRect,
    });
    clearSelection();
  }

  // Add a note from a note-pen region.
  function handleNoteRegion(page: number, rect: NormRect, anchorRect: DOMRect) {
    setNoteMode(false);
    setNote({ anchor: { kind: "region", page, rect }, anchorRect });
  }

  // Open an existing note from its highlight.
  function handleOpenNote(h: Highlight, anchorRect: DOMRect) {
    setNote({ anchor: { kind: "existing", highlight: h }, anchorRect });
  }

  async function handleDeleteHighlight(id: string) {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    await fetch(`/api/highlights/${id}`, { method: "DELETE" });
  }

  // Persist reading progress (debounced) as the current page changes.
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      if (page === pageRef.current) return;
      pageRef.current = page;
      if (patchTimer.current) clearTimeout(patchTimer.current);
      patchTimer.current = setTimeout(() => {
        fetch(`/api/documents/${documentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ last_page: page }),
        }).catch(() => {});
      }, 800);
    },
    [documentId],
  );

  const handleNumPages = useCallback(
    (n: number) => {
      setNumPages(n);
      fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_count: n }),
      }).catch(() => {});
    },
    [documentId],
  );

  // Jump to a page from the toolbar (clamped), reusing PdfViewer's scroll logic.
  const goToPage = useCallback(
    (n: number) => {
      if (!numPages) return;
      const clamped = Math.min(Math.max(1, Math.round(n)), numPages);
      setCurrentPage(clamped);
      setJump((j) => ({ page: clamped, nonce: (j?.nonce ?? 0) + 1 }));
    },
    [numPages],
  );

  return (
    <div className={styles.reader} data-ai={aiMode || undefined}>
      <header className={styles.header}>
        <Link href="/" className={styles.back} aria-label="Back to library">
          ‹ Library
        </Link>
        <h1 className={styles.docTitle}>{title}</h1>
      </header>

      <div className={styles.body}>
        {outlineOpen && (
          <OutlinePanel
            nodes={outline}
            currentPage={currentPage}
            onSelect={handleOutlineSelect}
            onClose={toggleOutline}
          />
        )}
        <div className={styles.viewer} onMouseUp={onMouseUp}>
          <PdfViewer
            documentId={documentId}
            scale={scale}
            highlights={highlights}
            initialPage={initialPage}
            scrollToPage={jump}
            aiMode={aiMode}
            noteMode={noteMode}
            onNumPages={handleNumPages}
            onDocument={handleDocument}
            onPageChange={handlePageChange}
            onDeleteHighlight={handleDeleteHighlight}
            onOpenHighlight={handleOpenHighlight}
            onOpenNote={handleOpenNote}
            onRegion={handleRegion}
            onNoteRegion={handleNoteRegion}
          />
        </div>
      </div>

      <SelectionMenu
        anchorRect={selection?.anchorRect ?? null}
        onCopy={handleCopy}
        onHighlight={handleHighlight}
        onAsk={handleAsk}
        onNote={handleNote}
        onClose={clearSelection}
      />

      {ask && (
        <AskParrot
          documentId={documentId}
          title={title}
          anchorRect={ask.anchorRect}
          anchor={ask.anchor}
          onClose={() => setAsk(null)}
          onSaved={loadHighlights}
        />
      )}

      {note && (
        <NoteEditor
          documentId={documentId}
          anchorRect={note.anchorRect}
          anchor={note.anchor}
          onClose={() => setNote(null)}
          onSaved={loadHighlights}
        />
      )}

      <Flashcards
        documentId={documentId}
        open={flashOpen}
        view={flashView}
        toolbarRef={toolbarRef}
        onOpenChange={setFlashOpen}
        onViewChange={setFlashView}
      />

      <Toolbar
        toolbarRef={toolbarRef}
        flashOpen={flashOpen && flashView.kind === "review"}
        onToggleFlashcards={() => {
          // Already reviewing → close; otherwise open (or switch) to the review view.
          if (flashOpen && flashView.kind === "review") return setFlashOpen(false);
          setFlashView({ kind: "review" });
          setFlashOpen(true);
        }}
        onNewFlashcard={() => {
          if (flashOpen && flashView.kind === "form" && !flashView.editing) {
            return setFlashOpen(false);
          }
          setFlashView({ kind: "form", editing: null });
          setFlashOpen(true);
        }}
        outlineOpen={outlineOpen}
        onToggleOutline={toggleOutline}
        currentPage={currentPage}
        numPages={numPages}
        onGoToPage={goToPage}
        scale={scale}
        onZoomIn={() => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))}
        onZoomOut={() => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
        activeColor={activeColor}
        onColorChange={setActiveColor}
        aiMode={aiMode}
        onToggleAi={() =>
          setAiMode((v) => {
            if (!v) setNoteMode(false);
            return !v;
          })
        }
        noteMode={noteMode}
        onToggleNote={() =>
          setNoteMode((v) => {
            if (!v) setAiMode(false);
            return !v;
          })
        }
      />
    </div>
  );
}

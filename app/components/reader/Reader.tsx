"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getJson, sendJson } from "@/components/api";
import { Toolbar } from "./Toolbar";
import { SelectionMenu } from "./SelectionMenu";
import { AskParrot, type AskAnchor } from "./AskParrot";
import { NoteEditor, type NoteAnchor } from "./NoteEditor";
import { OutlinePanel } from "./OutlinePanel";
import { Flashcards, type FlashView } from "./Flashcards";
import { headingY, loadOutline, type OutlineNode, type PdfDocument } from "./outline";
import { extractText, type PageText } from "./find";
import { FindBar } from "./FindBar";
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
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findFocusKey, setFindFocusKey] = useState(0);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const cachedOutline = useRef<Promise<OutlineNode[] | null> | null>(null);
  const pdfRef = useRef<PdfDocument | null>(null);
  const pageRef = useRef(initialPage);
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textCache = useRef<Promise<PageText> | null>(null);

  const loadHighlights = useCallback(() => {
    getJson<Highlight[]>(`/api/highlights?documentId=${documentId}`)
      .then(setHighlights)
      .catch(() => setHighlights([]));
  }, [documentId]);

  useEffect(() => {
    loadHighlights();
  }, [loadHighlights]);

  const toggleOutline = useCallback(() => {
    setOutlineOpen((open) => {
      try {
        localStorage.setItem(OUTLINE_KEY, open ? "0" : "1");
      } catch {}
      return !open;
    });
  }, []);

  // Already reviewing → close; otherwise open (or switch) to the review view.
  const toggleFlashcards = useCallback(() => {
    if (flashOpen && flashView.kind === "review") return setFlashOpen(false);
    setFlashView({ kind: "review" });
    setFlashOpen(true);
  }, [flashOpen, flashView]);

  // Already on a blank new-card form → close; otherwise open straight into it.
  const newFlashcard = useCallback(() => {
    if (flashOpen && flashView.kind === "form" && !flashView.editing) return setFlashOpen(false);
    setFlashView({ kind: "form", editing: null });
    setFlashOpen(true);
  }, [flashOpen, flashView]);

  // Find in document. The text is extracted once (on first open) and reused afterwards.
  const openFind = useCallback(() => {
    setFindOpen(true);
    setFindFocusKey((k) => k + 1); // (re)focus the input, also when the bar is already open
  }, []);
  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
  }, []);
  const loadText = useCallback((onProgress: (done: number, total: number) => void) => {
    // Only opened once the PDF has loaded (see the Ctrl/⌘+F shortcut), so pdfRef is set.
    textCache.current ??= extractText(pdfRef.current!, onProgress);
    return textCache.current;
  }, []);

  // Reader shortcuts, all skipped while typing in a field:
  //   Ctrl/⌘+B  contents sidebar ("bold" in text fields, hence the skip)
  //   Ctrl/⌘+F  find in document (the browser's find can't see unrendered pages)
  //   F         flashcards
  //   Shift+F   new flashcard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // The target isn't always an Element (e.g. a key event dispatched on `document`).
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, [contenteditable]:not([contenteditable='false'])")) return;
      const key = e.key.toLowerCase();
      const mod = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
      if (mod && key === "b") {
        e.preventDefault();
        toggleOutline();
      } else if (mod && key === "f") {
        if (!pdfRef.current) return; // not loaded yet — leave the browser's find alone
        e.preventDefault();
        openFind();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && key === "f") {
        e.preventDefault();
        if (e.shiftKey) newFlashcard();
        else toggleFlashcards();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleOutline, toggleFlashcards, newFlashcard, openFind]);

  // The outline is cached server-side after the first open; start fetching it right away
  // so the sidebar can fill before the PDF has even finished loading.
  useEffect(() => {
    const cached = getJson<OutlineNode[] | null>(`/api/documents/${documentId}/outline`).catch(
      () => null,
    );
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
      sendJson(`/api/documents/${documentId}/outline`, "PUT", nodes).catch(() => {});
    },
    [documentId],
  );

  // Scroll to a page (and optionally a spot on it, 0..1 down the page) via PdfViewer.
  const jumpTo = useCallback((page: number, y?: number | null) => {
    setCurrentPage(page);
    setJump((j) => ({ page, y, nonce: (j?.nonce ?? 0) + 1 }));
  }, []);

  async function handleOutlineSelect(node: OutlineNode) {
    if (node.page === null) return;
    setCurrentPage(node.page); // update the indicator before the heading lookup resolves
    jumpTo(node.page, pdfRef.current ? await headingY(pdfRef.current, node) : null);
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
    const res = await sendJson("/api/highlights", "POST", {
      documentId,
      page: selection.page,
      rects: selection.rects,
      color: activeColor,
      text: selection.text,
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

  // The handlers passed to PdfViewer are stable so the memoized viewer can skip
  // re-rendering on unrelated Reader updates (e.g. the page indicator while scrolling).

  // Ask Parrot from an AI-pen region.
  const handleRegion = useCallback(
    (page: number, rect: NormRect, image: string, anchorRect: DOMRect) => {
      setAiMode(false);
      setAsk({ anchor: { kind: "region", page, rect, image }, anchorRect });
    },
    [],
  );

  // Reopen a saved thread from its highlight.
  const handleOpenHighlight = useCallback((h: Highlight, anchorRect: DOMRect) => {
    setAsk({ anchor: { kind: "existing", highlightId: h.id }, anchorRect });
  }, []);

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
  const handleNoteRegion = useCallback((page: number, rect: NormRect, anchorRect: DOMRect) => {
    setNoteMode(false);
    setNote({ anchor: { kind: "region", page, rect }, anchorRect });
  }, []);

  // Open an existing note from its highlight.
  const handleOpenNote = useCallback((h: Highlight, anchorRect: DOMRect) => {
    setNote({ anchor: { kind: "existing", highlight: h }, anchorRect });
  }, []);

  const handleDeleteHighlight = useCallback(async (id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    await fetch(`/api/highlights/${id}`, { method: "DELETE" });
  }, []);

  // The AI and note pens are mutually exclusive: turning one on turns the other off.
  const toggleAi = useCallback(() => {
    const next = !aiMode;
    setAiMode(next);
    if (next) setNoteMode(false);
  }, [aiMode]);

  const toggleNote = useCallback(() => {
    const next = !noteMode;
    setNoteMode(next);
    if (next) setAiMode(false);
  }, [noteMode]);

  // Persist reading progress (debounced) as the current page changes.
  const handlePageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      if (page === pageRef.current) return;
      pageRef.current = page;
      if (patchTimer.current) clearTimeout(patchTimer.current);
      patchTimer.current = setTimeout(() => {
        sendJson(`/api/documents/${documentId}`, "PATCH", { last_page: page }).catch(() => {});
      }, 800);
    },
    [documentId],
  );

  const handleNumPages = useCallback(
    (n: number) => {
      setNumPages(n);
      sendJson(`/api/documents/${documentId}`, "PATCH", { page_count: n }).catch(() => {});
    },
    [documentId],
  );

  // Jump to a page from the toolbar (clamped), reusing PdfViewer's scroll logic.
  const goToPage = useCallback(
    (n: number) => {
      if (!numPages) return;
      jumpTo(Math.min(Math.max(1, Math.round(n)), numPages));
    },
    [numPages, jumpTo],
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
            highlights={highlights}
            currentPage={currentPage}
            onSelect={handleOutlineSelect}
            onJump={jumpTo}
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
            findQuery={findQuery}
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

      {findOpen && (
        <FindBar
          loadText={loadText}
          focusKey={findFocusKey}
          onQueryChange={setFindQuery}
          onJump={jumpTo}
          onClose={closeFind}
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
        onToggleFlashcards={toggleFlashcards}
        onNewFlashcard={newFlashcard}
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
        onToggleAi={toggleAi}
        noteMode={noteMode}
        onToggleNote={toggleNote}
      />
    </div>
  );
}

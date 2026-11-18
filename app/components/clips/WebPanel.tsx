"use client";

import { useEffect, useRef, useState } from "react";
import { getJson, sendJson } from "@/components/api";
import { ChatComposer, ChatMessages } from "@/components/chat/ChatThread";
import { textOf, useParrotChat } from "@/components/chat/useParrotChat";
import { lastSubject, rememberSubject } from "@/components/library/upload";
import Markdown from "@/components/reader/Markdown";
import { ModeToggle } from "@/components/reader/ModeToggle";
import type { Clip, Subject } from "@/types";
import { hostOf, sourceLink } from "./links";
import styles from "./WebPanel.module.css";

/** What the browser extension sends: the page, its selected text, and which tab to open. */
interface WebSelection {
  id: string;
  mode: "note" | "ask";
  url: string;
  title: string;
  text: string;
}

// Only the extension's side panel may hand us a selection (next.config.ts also stops other sites
// from framing this page at all).
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

/** Ask the extension's side panel (our parent frame) to close itself. */
function closePanel() {
  if (window.parent !== window) window.parent.postMessage({ type: "parrot:close" }, "*");
}

function parseSelection(data: unknown): WebSelection | null {
  const d = data as Partial<WebSelection> & { type?: unknown };
  if (!d || d.type !== "parrot:selection") return null;
  if (typeof d.id !== "string" || typeof d.url !== "string" || !/^https?:\/\//.test(d.url)) {
    return null;
  }
  return {
    id: d.id,
    mode: d.mode === "ask" ? "ask" : "note",
    url: d.url,
    title: typeof d.title === "string" ? d.title : "",
    text: typeof d.text === "string" ? d.text : "",
  };
}

/**
 * The page the browser extension shows in its side panel (`/ext`, in an iframe). It waits for
 * the extension to post the current page and selection, then lets the reader save it as a web
 * clip with a note, or ask Parrot about it and save the thread — all through Parrot's own API.
 */
export function WebPanel() {
  const [selection, setSelection] = useState<WebSelection | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!EXTENSION_ORIGIN.test(e.origin)) return;
      const s = parseSelection(e.data);
      if (s) setSelection(s);
    }
    window.addEventListener("message", onMessage);
    // Tell the side panel we're listening; it answers with the pending selection.
    if (window.parent !== window) window.parent.postMessage({ type: "parrot:ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Nothing to lose while waiting, so Esc just closes the panel.
  useEffect(() => {
    if (selection) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection]);

  if (!selection) {
    return (
      <div className={styles.waiting}>
        <CloseButton />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/parrot-logo.png" alt="" className={styles.waitingLogo} />
        <p>
          Select text on a page, then right-click and choose <strong>Save to Parrot</strong> or{" "}
          <strong>Ask Parrot</strong>.
        </p>
      </div>
    );
  }
  // A new selection starts afresh (its own clip and conversation).
  return <ClipEditor key={selection.id} selection={selection} />;
}

function ClipEditor({ selection }: { selection: WebSelection }) {
  const { url, title, text } = selection;
  const [tab, setTab] = useState(selection.mode);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [threadSaved, setThreadSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chat = useParrotChat({ title, text: text || undefined, url });
  const saveRef = useRef<() => void>(() => {});
  const closeRef = useRef<() => void>(() => {});
  // Set by a first Esc with unsaved work; a second Esc then closes without saving.
  const [closeArmed, setCloseArmed] = useState(false);

  useEffect(() => {
    if (!closeArmed) return;
    const t = setTimeout(() => setCloseArmed(false), 4000);
    return () => clearTimeout(t);
  }, [closeArmed]);

  useEffect(() => {
    getJson<Subject[]>("/api/subjects")
      .then((list) => {
        setSubjects(list);
        const last = lastSubject();
        if (last && list.some((s) => s.id === last)) setSubjectId(last);
      })
      .catch(() => setError("Couldn't load your subjects."));
  }, []);

  // Ctrl/Cmd+Enter saves whichever tab is showing; Esc closes the panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        saveRef.current();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Send a request; on success keep the returned clip, on failure show the server's error. */
  async function request(path: string, method: "POST" | "PATCH" | "PUT", body: unknown) {
    setSaving(true);
    setError(null);
    const res = await sendJson(path, method, body).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setError(data?.error ?? "Couldn't reach Parrot. Is it still running?");
      return false;
    }
    setClip((await res.json()) as Clip);
    return true;
  }

  async function saveNote() {
    const body = { note: note.trim() ? note : null };
    const ok = clip
      ? await request(`/api/clips/${clip.id}`, "PATCH", body)
      : await request("/api/clips", "POST", { url, title, quote: text, subjectId, ...body });
    if (ok) setNoteSaved(true);
  }

  async function saveThread() {
    const messages = chat.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: textOf(m) }));
    const ok = clip
      ? await request(`/api/clips/${clip.id}/messages`, "PUT", { messages })
      : await request("/api/clips", "POST", {
          url,
          title,
          quote: text,
          subjectId,
          note: note.trim() ? note : null,
          messages,
        });
    if (ok) setThreadSaved(true);
  }

  async function changeSubject(id: string | null) {
    setSubjectId(id);
    rememberSubject(id);
    if (clip) await request(`/api/clips/${clip.id}`, "PATCH", { subject_id: id });
  }

  const canSaveThread = chat.messages.length > 0 && !chat.busy;
  const save = tab === "note" ? saveNote : saveThread;
  const canSave = !saving && (tab === "note" || canSaveThread);
  // Unsaved: a note typed since the last save, or a conversation since the thread was saved.
  const unsaved =
    (note.trim() !== "" && !noteSaved) || (chat.messages.length > 0 && !threadSaved);
  useEffect(() => {
    saveRef.current = () => {
      if (canSave) save();
    };
    closeRef.current = () => {
      if (unsaved && !closeArmed) setCloseArmed(true);
      else closePanel();
    };
  });

  const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? "Unsorted";
  const saved = tab === "note" ? noteSaved : threadSaved;
  const saveLabel =
    tab === "note"
      ? noteSaved
        ? "Saved"
        : note.trim() || clip
          ? "Save note"
          : "Save clip"
      : threadSaved
        ? "Saved"
        : "Save thread";

  return (
    <div className={styles.panel}>
      <header className={styles.source}>
        <CloseButton onClick={() => closeRef.current()} />
        <a className={styles.pageTitle} href={sourceLink(url, text)} target="_blank" rel="noreferrer">
          {title || hostOf(url)}
        </a>
        <span className={styles.host}>{hostOf(url)}</span>
      </header>

      {text && <blockquote className={styles.quote}>{text}</blockquote>}

      <label className={styles.subject}>
        <span>Subject</span>
        <select
          value={subjectId ?? ""}
          onChange={(e) => changeSubject(e.target.value || null)}
          className={styles.select}
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="">Unsorted</option>
        </select>
      </label>

      <div className={styles.tabs} role="tablist">
        <button
          role="tab"
          aria-selected={tab === "note"}
          className={styles.tab}
          onClick={() => setTab("note")}
        >
          Note
        </button>
        <button
          role="tab"
          aria-selected={tab === "ask"}
          className={styles.tab}
          onClick={() => setTab("ask")}
        >
          Ask Parrot
        </button>
      </div>

      {tab === "note" ? (
        <section className={styles.body}>
          <div className={styles.noteBar}>
            <ModeToggle preview={preview} onChange={setPreview} />
          </div>
          {preview ? (
            <div className={styles.rendered}>
              {note.trim() ? <Markdown>{note}</Markdown> : <p className={styles.muted}>Nothing yet.</p>}
            </div>
          ) : (
            <textarea
              className={styles.textarea}
              value={note}
              placeholder="Your note… Markdown and LaTeX: $x^2$ inline, $$…$$ on its own line"
              autoFocus
              onChange={(e) => {
                setNote(e.target.value);
                setNoteSaved(false);
              }}
            />
          )}
        </section>
      ) : (
        <section className={`${styles.body} ${styles.chat}`}>
          <ChatMessages
            chat={chat}
            emptyText={text ? "Ask about the selected text." : "Ask about this page."}
          />
          <ChatComposer chat={chat} onSent={() => setThreadSaved(false)} />
        </section>
      )}

      <footer className={styles.footer}>
        <span className={styles.status}>
          {closeArmed ? (
            <span className={styles.warning}>Not saved. Press Esc again to close anyway.</span>
          ) : error ? (
            <span className={styles.error}>{error}</span>
          ) : clip ? (
            <>
              Saved to {subjectName} ·{" "}
              <a href="/clips" target="_blank" rel="noreferrer">
                Open in Parrot
              </a>
            </>
          ) : null}
        </span>
        <button
          className={styles.save}
          onClick={save}
          disabled={!canSave}
          data-saved={saved || undefined}
          title="Save (Ctrl+Enter)"
        >
          {saveLabel}
        </button>
      </footer>
    </div>
  );
}

/** × in the panel's top-right corner (Esc does the same). */
function CloseButton({ onClick = closePanel }: { onClick?: () => void }) {
  return (
    <button className={styles.close} onClick={onClick} aria-label="Close" title="Close (Esc)">
      ×
    </button>
  );
}

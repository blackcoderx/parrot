"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@base-ui-components/react/alert-dialog";
import { getJson, sendJson } from "@/components/api";
import { SettingsPopover } from "@/components/settings/SettingsPopover";
import { TrashIcon } from "@/components/TrashIcon";
import type { DocumentRow } from "@/types";
import styles from "./Library.module.css";

export type LibraryDoc = Pick<DocumentRow, "id" | "title" | "last_page" | "page_count">;

/** The home screen: open a new PDF, or reopen/remove a recent one. */
export function Library({ initialDocs }: { initialDocs: LibraryDoc[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<LibraryDoc[]>(initialDocs);
  const [uploading, setUploading] = useState(false);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  async function remove(id: string) {
    setRecent((prev) => prev.filter((d) => d.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    } catch {
      // Failed — resync the list from the server so nothing is silently lost.
      getJson<LibraryDoc[]>("/api/documents")
        .then(setRecent)
        .catch(() => {});
    }
  }

  async function rename(id: string, title: string) {
    const previous = recent.find((d) => d.id === id)?.title;
    const setTitle = (t: string) =>
      setRecent((prev) => prev.map((d) => (d.id === id ? { ...d, title: t } : d)));
    setTitle(title); // optimistic
    const res = await sendJson(`/api/documents/${id}`, "PATCH", { title }).catch(() => null);
    if (!res?.ok && previous !== undefined) setTitle(previous);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const doc: LibraryDoc = await res.json();
      router.push(`/read/${doc.id}`);
    } catch {
      setUploading(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.wordmark}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/parrot-logo.png" alt="" className={styles.logo} />
          Parrot<span className={styles.dot}>.</span>
        </h1>

        <button className={styles.newFile} onClick={openPicker} disabled={uploading}>
          <span>{uploading ? "Opening…" : "New file"}</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={onFile}
        />

        <section className={styles.recent}>
          <h2 className={styles.recentTitle}>Recent files</h2>
          {recent.length === 0 ? (
            <p className={styles.empty}>No documents yet.</p>
          ) : (
            <ul className={styles.list}>
              {recent.map((doc) => (
                <LibraryRow
                  key={doc.id}
                  doc={doc}
                  onOpen={() => router.push(`/read/${doc.id}`)}
                  onRename={(title) => rename(doc.id, title)}
                  onRemove={() => remove(doc.id)}
                />
              ))}
            </ul>
          )}
        </section>
      </main>

      <div className={styles.settings}>
        <SettingsPopover />
      </div>
    </div>
  );
}

interface RowProps {
  doc: LibraryDoc;
  onOpen: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
}

/** One recent document: open it, rename it inline, or remove it (after confirming). */
function LibraryRow({ doc, onOpen, onRename, onRemove }: RowProps) {
  const [editing, setEditing] = useState(false);
  // Enter/Escape end the edit and unmount the input, which may also fire blur — commit once.
  const finished = useRef(false);

  function startEditing() {
    finished.current = false;
    setEditing(true);
  }

  function finish(value: string | null) {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    const title = value?.trim();
    if (title && title !== doc.title) onRename(title);
  }

  return (
    <li className={styles.rowWrap}>
      {editing ? (
        <input
          className={styles.rowInput}
          defaultValue={doc.title}
          maxLength={200}
          aria-label="Document title"
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") finish(e.currentTarget.value);
            else if (e.key === "Escape") finish(null);
          }}
          onBlur={(e) => finish(e.currentTarget.value)}
        />
      ) : (
        <button className={styles.row} onClick={onOpen}>
          <span className={styles.rowTitle}>{doc.title}</span>
        </button>
      )}

      {/* One slot at the right edge: the reading progress, which flips over on hover (or
          keyboard focus) like a card to reveal the rename / remove actions on its back. */}
      {!editing && (
        <div className={styles.rowSide}>
          <div className={styles.flip}>
            <span className={`${styles.face} ${styles.front}`} title="Last page read">
              {doc.page_count !== null && `p. ${doc.last_page} / ${doc.page_count}`}
            </span>

            <div className={`${styles.face} ${styles.back}`}>
              <button
                className={`${styles.rowAction} ${styles.rowEdit}`}
                onClick={startEditing}
                aria-label={`Rename ${doc.title}`}
                title="Rename"
              >
                <PencilIcon />
              </button>

              <AlertDialog.Root>
                <AlertDialog.Trigger
                  className={`${styles.rowAction} ${styles.rowDelete}`}
                  aria-label={`Remove ${doc.title}`}
                  title="Remove"
                >
                  <TrashIcon />
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Backdrop className={styles.dialogBackdrop} />
                  <AlertDialog.Popup className={styles.dialogPopup}>
                    <AlertDialog.Title className={styles.dialogTitle}>
                      Remove “{doc.title}”?
                    </AlertDialog.Title>
                    <AlertDialog.Description className={styles.dialogDesc}>
                      This permanently deletes the file along with its highlights and AI
                      conversations.
                    </AlertDialog.Description>
                    <div className={styles.dialogActions}>
                      <AlertDialog.Close className={styles.dialogCancel}>Cancel</AlertDialog.Close>
                      <AlertDialog.Close className={styles.dialogConfirm} onClick={onRemove}>
                        Remove
                      </AlertDialog.Close>
                    </div>
                  </AlertDialog.Popup>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

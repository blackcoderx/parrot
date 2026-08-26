"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@base-ui-components/react/alert-dialog";
import styles from "./page.module.css";
import { SettingsPopover } from "@/components/settings/SettingsPopover";

interface DocumentRow {
  id: string;
  title: string;
  filename: string;
}

export default function Home() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [recent, setRecent] = useState<DocumentRow[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  async function remove(id: string) {
    setRecent((prev) => prev.filter((d) => d.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    } catch {
      // Failed — resync the list from the server so nothing is silently lost.
      fetch("/api/documents")
        .then((r) => r.json())
        .then(setRecent)
        .catch(() => {});
    }
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
      const doc: DocumentRow = await res.json();
      router.push(`/read/${doc.id}`);
    } catch {
      setUploading(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.wordmark}>
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
                <li key={doc.id} className={styles.rowWrap}>
                  <button
                    className={styles.row}
                    onClick={() => router.push(`/read/${doc.id}`)}
                  >
                    <span className={styles.rowTitle}>{doc.title}</span>
                  </button>

                  <AlertDialog.Root>
                    <AlertDialog.Trigger
                      className={styles.rowDelete}
                      aria-label={`Remove ${doc.title}`}
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
                          <AlertDialog.Close className={styles.dialogCancel}>
                            Cancel
                          </AlertDialog.Close>
                          <AlertDialog.Close
                            className={styles.dialogConfirm}
                            onClick={() => remove(doc.id)}
                          >
                            Remove
                          </AlertDialog.Close>
                        </div>
                      </AlertDialog.Popup>
                    </AlertDialog.Portal>
                  </AlertDialog.Root>
                </li>
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

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v5M14 11v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

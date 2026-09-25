"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@base-ui-components/react/alert-dialog";
import { getJson } from "@/components/api";
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
                <li key={doc.id} className={styles.rowWrap}>
                  <button
                    className={styles.row}
                    onClick={() => router.push(`/read/${doc.id}`)}
                  >
                    <span className={styles.rowTitle}>{doc.title}</span>
                    {doc.page_count !== null && (
                      <span className={styles.rowMeta} title="Last page read">
                        p. {doc.last_page} / {doc.page_count}
                      </span>
                    )}
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

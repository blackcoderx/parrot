"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

  // Ctrl+N / Cmd+N opens the file picker.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        openPicker();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPicker]);

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
          <kbd className={styles.kbd}>Ctrl N</kbd>
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
                <li key={doc.id}>
                  <button
                    className={styles.row}
                    onClick={() => router.push(`/read/${doc.id}`)}
                  >
                    <span className={styles.rowTitle}>{doc.title}</span>
                    <span className={styles.chevron} aria-hidden>
                      ›
                    </span>
                  </button>
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

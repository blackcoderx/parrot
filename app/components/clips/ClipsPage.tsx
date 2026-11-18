"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TimerButton } from "@/components/timer/TimerButton";
import studyStyles from "@/components/flashcards/Study.module.css";
import type { Clip, Subject } from "@/types";
import { ClipList } from "./ClipList";
import styles from "./ClipList.module.css";

type Filter = "all" | "unsorted" | string;

/** The Web clips page: everything saved from the browser extension, filtered by subject. */
export function ClipsPage({
  initialClips,
  subjects,
  focusClipId,
}: {
  initialClips: Clip[];
  subjects: Subject[];
  /** Scroll to and flash this clip on arrival (`?clip=<id>`, from search). */
  focusClipId: string | null;
}) {
  const [clips, setClips] = useState(initialClips);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!focusClipId) return;
    window.history.replaceState(null, "", "/clips"); // a reload shouldn't flash it again
    const card = document.getElementById(`clip-${focusClipId}`);
    if (!card) return;
    card.scrollIntoView({ block: "center" });
    card.dataset.flash = "";
    const t = setTimeout(() => delete card.dataset.flash, 1600);
    return () => clearTimeout(t);
  }, [focusClipId]);

  const count = (id: string | null) => clips.filter((c) => c.subject_id === id).length;
  // Subjects that have clips, plus the one being viewed (so its chip stays after emptying it).
  const shownSubjects = subjects.filter((s) => count(s.id) > 0 || s.id === filter);
  const unsorted = count(null);
  // A filter on a subject that was deleted elsewhere falls back to All.
  const active =
    filter === "all" || filter === "unsorted" || subjects.some((s) => s.id === filter)
      ? filter
      : "all";
  const shown =
    active === "all"
      ? clips
      : clips.filter((c) => c.subject_id === (active === "unsorted" ? null : active));

  const chip = (value: Filter, label: string, n: number) => (
    <button
      key={value}
      className={styles.filter}
      aria-pressed={active === value}
      onClick={() => setFilter(value)}
    >
      {label}
      <span className={styles.filterCount}>{n}</span>
    </button>
  );

  return (
    <div className={studyStyles.page}>
      <header className={studyStyles.header}>
        <Link href="/" className={studyStyles.back}>
          ← Library
        </Link>
        <h1 className={studyStyles.title}>Web clips</h1>
        <p className={studyStyles.subtitle}>
          Passages and notes saved from websites with the Parrot browser extension. Click a title
          to go back to the passage.
        </p>
      </header>

      {clips.length > 0 && (
        <div className={styles.filters}>
          {chip("all", "All", clips.length)}
          {shownSubjects.map((s) => chip(s.id, s.name, count(s.id)))}
          {(unsorted > 0 || active === "unsorted") && chip("unsorted", "Unsorted", unsorted)}
        </div>
      )}

      <ClipList
        clips={shown}
        setClips={setClips}
        subjects={subjects}
        emptyText={
          clips.length === 0 ? (
            <>
              No web clips yet. Load the browser extension from the <code>extension</code> folder,
              select text on a page, and choose <strong>Save to Parrot</strong>.
            </>
          ) : (
            "No clips here."
          )
        }
      />

      <div className={studyStyles.corner}>
        <TimerButton className={studyStyles.timerBtn} clockClassName={studyStyles.timerClock} />
      </div>
    </div>
  );
}

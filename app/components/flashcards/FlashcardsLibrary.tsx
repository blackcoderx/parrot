"use client";

import { useState } from "react";
import Link from "next/link";
import { TimerButton } from "@/components/timer/TimerButton";
import type { StudyCard, Subject } from "@/types";
import { CardDeck } from "./CardDeck";
import styles from "./Study.module.css";

/** The flashcards page: every card from every document, and spaced-repetition study. */
export function FlashcardsLibrary({
  initialCards,
  subjects,
}: {
  initialCards: StudyCard[];
  subjects: Subject[];
}) {
  const [studying, setStudying] = useState(false);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Library
        </Link>
        <h1 className={styles.title}>Flashcards</h1>
        {!studying && (
          <p className={styles.subtitle}>
            Cards from every document. Each one comes back just as you&apos;re likely to forget it.
          </p>
        )}
      </header>

      <CardDeck initialCards={initialCards} subjects={subjects} onStudyingChange={setStudying} />

      <div className={styles.corner}>
        <TimerButton className={styles.timerBtn} clockClassName={styles.timerClock} />
      </div>
    </div>
  );
}

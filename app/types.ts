// Data shapes shared by the server (lib/db.ts, API routes) and the client components.
// Type-only, so unlike lib/* this module is safe to import from client code.

/** A rectangle in page-normalized coordinates (0..1 of the rendered page box). */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DocumentRow {
  id: string;
  title: string;
  filename: string;
  page_count: number | null;
  last_page: number;
  added_at: number;
  opened_at: number;
}

export interface Highlight {
  id: string;
  document_id: string;
  page: number;
  rects: NormRect[];
  color: string;
  text: string;
  /** A reader's note attached to this highlight, or null for plain highlights. */
  note: string | null;
  created_at: number;
  /** Id of an attached saved chat thread, or null. Populated via LEFT JOIN. */
  chat_id: string | null;
}

/** Where in the document a flashcard was made, captured when it's created. */
export interface CardSource {
  page: number;
  /** 0 (top) .. 1 (bottom) down the page, e.g. the top of the selection; null = page top. */
  y: number | null;
  /** Id of the enclosing PDF outline entry (a dotted path, e.g. "2.1"), or null. */
  section_id: string | null;
  /** That entry's title, kept so the card can name its section without the outline. */
  section: string | null;
}

export interface Flashcard {
  id: string;
  document_id: string;
  question: string;
  /** Optional nudge shown on request before the answer is revealed. */
  hint: string | null;
  answer: string;
  /** Source fields (see CardSource); all null for cards made without one. */
  page: number | null;
  y: number | null;
  section_id: string | null;
  section: string | null;
  /** The reader's own labels, for filtering. */
  tags: string[];
  created_at: number;
  updated_at: number;
  /** When the scheduler next wants the card (epoch ms), or null for a card never studied. */
  due: number | null;
  /** How well the card is known, derived from its FSRS memory state (see lib/srs.ts). */
  status: CardStatus;
  /** Times studied, and times forgotten after being learned. */
  reps: number;
  lapses: number;
}

/** A card's place on the way to long-term memory; set by the scheduler, not the reader. */
export type CardStatus = "new" | "learning" | "familiar" | "confident" | "mastered";

/** A study grade: 1 Again (forgot), 2 Hard, 3 Good, 4 Easy. */
export type Grade = 1 | 2 | 3 | 4;

/** A card on the study page: from any document, with what each grade would schedule. */
export interface StudyCard extends Flashcard {
  document_title: string;
  /** Milliseconds until the card is due again after each grade, Again..Easy. */
  intervals: [number, number, number, number];
}

/** Study done since the reader's local midnight. */
export interface StudyToday {
  /** Grades given. */
  reviewed: number;
  /** New cards studied for the first time. */
  introduced: number;
}

export interface Message {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  image: string | null;
  created_at: number;
}

/** Pomodoro lengths, in minutes; a long break replaces every `longEvery`-th short one. */
export interface TimerSettings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  longEvery: number;
}

/** Focus-session streak: consecutive days with a finished session, and today's count. */
export interface FocusStats {
  streak: number;
  today: number;
}

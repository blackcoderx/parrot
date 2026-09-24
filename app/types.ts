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

export interface Flashcard {
  id: string;
  document_id: string;
  question: string;
  /** Optional nudge shown on request before the answer is revealed. */
  hint: string | null;
  answer: string;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  image: string | null;
  created_at: number;
}

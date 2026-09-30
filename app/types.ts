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
}

export interface Message {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  image: string | null;
  created_at: number;
}

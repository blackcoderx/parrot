/** A rectangle in page-normalized coordinates (0..1 of the rendered page box). */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
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
  /** Id of an attached saved chat thread, or null. */
  chat_id: string | null;
}

export type Tool = "select" | "highlight" | "ai";

/** Faint warm-amber wash for note highlights (kept readable over text). */
export const NOTE_COLOR = "rgba(245, 179, 1, 0.16)";

/** Preset highlight colors (semi-transparent so text stays readable). */
export const HIGHLIGHT_COLORS = [
  "rgba(255, 214, 10, 0.4)", // yellow
  "rgba(76, 217, 100, 0.4)", // green
  "rgba(90, 200, 250, 0.4)", // blue
  "rgba(255, 105, 97, 0.4)", // red
];

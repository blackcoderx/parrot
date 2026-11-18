import styles from "./SearchDialog.module.css";

// The server wraps each match in these (see `search` in lib/db.ts).
const OPEN = "\u0001";
const CLOSE = "\u0002";

/** Drop Markdown markup that reads as noise in a one-line snippet (LaTeX is left as written). */
function plain(text: string): string {
  return text
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\n)\s*(#{1,6}|>|[-*+]|\d+\.)\s+/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ");
}

/** A search snippet with its matches highlighted. */
export function Snippet({ text }: { text: string }) {
  // Split into alternating plain / matched runs: "a\u0001b\u0002c" -> a, [b], c.
  const parts: { text: string; match: boolean }[] = [];
  for (const chunk of text.split(OPEN)) {
    const [match, rest] = chunk.includes(CLOSE) ? chunk.split(CLOSE, 2) : [null, chunk];
    if (match !== null) parts.push({ text: plain(match), match: true });
    if (rest) parts.push({ text: plain(rest), match: false });
  }
  return (
    <span className={styles.snippet}>
      {parts.map((p, i) =>
        p.match ? (
          <mark key={i} className={styles.mark}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

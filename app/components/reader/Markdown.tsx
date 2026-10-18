"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// Stable module-scope plugin arrays (avoid re-allocating per render).
const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];

/**
 * Normalize LaTeX delimiters into the forms remark-math understands, without
 * touching code (``` fenced ``` and `inline`):
 *   \( … \)          -> $ … $            (inline)
 *   \[ … \]  /  $$…$$ -> block $$ on their own lines (KaTeX display mode)
 *
 * remark-math only renders `$$…$$` as *display* math when the fences sit on
 * their own lines, so single-line display math (which models emit constantly)
 * is rewritten to the multi-line block form.
 */
function normalizeMath(src: string): string {
  // Split on fenced code blocks and inline code; transform only the gaps.
  const parts = src.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((seg, i) => {
      // Odd indices are the captured code segments — leave them untouched.
      if (i % 2 === 1) return seg;
      return (
        seg
          // \[ … \] -> $$ … $$ (still single-line here; canonicalized below).
          .replace(/\\\[([\s\S]*?)\\\]/g, (_m, body) => `$$${body}$$`)
          // \( … \) -> $ … $ (inline).
          .replace(/\\\(([\s\S]*?)\\\)/g, (_m, body) => `$${body}$`)
          // Any $$ … $$ -> block form on its own lines so it renders as display.
          .replace(
            /\$\$([\s\S]+?)\$\$/g,
            (_m, body) => `\n\n$$\n${body.trim()}\n$$\n\n`,
          )
      );
    })
    .join("");
}

/**
 * Collapse text to a single line for a one-line preview (e.g. the Notes tab), leaving code
 * untouched: every math delimiter becomes inline `$ … $` (so display math renders at text
 * size rather than as a tall block) and the remaining newlines become spaces.
 */
function normalizeInline(src: string): string {
  // A function replacement, so `$` in the output is literal (not a replace pattern).
  const inlineMath = (_m: string, body: string) => `$${body.trim().replace(/\s*\n\s*/g, " ")}$`;
  const parts = src.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((seg, i) =>
      i % 2 === 1
        ? seg
        : seg
            .replace(/\$\$([\s\S]+?)\$\$/g, inlineMath)
            .replace(/\\\[([\s\S]*?)\\\]/g, inlineMath)
            .replace(/\\\(([\s\S]*?)\\\)/g, inlineMath)
            .replace(/\s*\n\s*/g, " "),
    )
    .join("");
}

/** Links open in a new tab safely. */
function Link(props: React.ComponentPropsWithoutRef<"a">) {
  return <a {...props} target="_blank" rel="noreferrer noopener" />;
}

const COMPONENTS = { a: Link };

// One-line previews: block elements render as spans so everything stays on one line (and a
// parent's `text-overflow: ellipsis` can trim it). Links become plain text too — previews sit
// inside clickable rows, and an <a> may not nest in a <button>.
function Span({ children }: { children?: React.ReactNode }) {
  return <span>{children}</span>;
}
const INLINE_COMPONENTS = {
  a: Span,
  p: Span,
  ul: Span,
  ol: Span,
  li: Span,
  h1: Span,
  h2: Span,
  h3: Span,
  h4: Span,
  h5: Span,
  h6: Span,
  blockquote: Span,
  pre: Span,
};

/** Markdown + LaTeX. `inline` renders a single line, for previews. */
function Markdown({ children, inline = false }: { children: string; inline?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={inline ? INLINE_COMPONENTS : COMPONENTS}
    >
      {inline ? normalizeInline(children) : normalizeMath(children)}
    </ReactMarkdown>
  );
}

export default memo(Markdown);

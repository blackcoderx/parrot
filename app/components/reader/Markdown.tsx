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

/** Links open in a new tab safely. */
const COMPONENTS = {
  a: ({ ...props }: React.ComponentPropsWithoutRef<"a">) => (
    <a {...props} target="_blank" rel="noreferrer noopener" />
  ),
};

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={COMPONENTS}
    >
      {normalizeMath(children)}
    </ReactMarkdown>
  );
}

export default memo(Markdown);

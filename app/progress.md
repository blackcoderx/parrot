# Parrot — Progress

A running log of what's built. Parrot is a local-first reader for research-paper PDFs with
highlighting and a multi-provider AI assistant. Runs entirely on your machine; fork and run.

Last updated: 2026-08-25

---

## Status at a glance

| Milestone | Scope | Status |
| --- | --- | --- |
| **M1** | Reader + highlights | ✅ Done & verified |
| **M2** | Multi-provider AI harness | ✅ Done & verified¹ |

¹ Everything verified except the **live token stream**, which needs a real API key (no local
Ollama/LM Studio was available to test a keyless path). Wiring is complete against the
installed `ai@7` / `@ai-sdk/react@4` APIs.

---

## Stack & key decisions

- **Next.js 16** (App Router) + **React 19**, run with **Bun**. App lives in `app/`.
- **Base UI** (`@base-ui-components/react`) headless components, styled with **plain CSS
  Modules — no Tailwind**.
- **better-sqlite3** for local data; **react-pdf** (pdf.js) for rendering, loaded client-only
  via `next/dynamic({ ssr: false })` (pdf.js touches `DOMMatrix` at module load → breaks SSR).
- **Vercel AI SDK** harness, minimal 3-package wiring: `@ai-sdk/anthropic` + `@ai-sdk/openai`
  + `@ai-sdk/openai-compatible` covers all 8 providers.
- **Storage:** OS app-data folder `~/.parrot/` — `parrot.db` (SQLite) + `pdfs/{id}.pdf`.
- **AI keys** come from env vars / `~/.parrot/config.json`, **never** the DB. The `settings`
  table holds only non-secret prefs (active provider, chosen model, base URLs).
- **Brand accent:** `--accent` (from `--blue` in `app/app/globals.css`), currently
  `#71F79F` (mint green). Black `#020100`, porcelain `#FDFFFC`.

---

## Data model (`~/.parrot/parrot.db`)

- `documents` — `id, title, filename, page_count, last_page, added_at, opened_at`
- `highlights` — `id, document_id, page, rects (JSON, 0–1 normalized), color, text, created_at`
- `chats` — `id, document_id, highlight_id, created_at`
- `messages` — `id, chat_id, role, content, image, created_at`
- `settings` — `key, value` (holds the `ai` prefs JSON)

Highlights store **normalized rects** (0–1 of the page box) so they stay aligned at any zoom.

---

## Milestone 1 — Reader + highlights ✅

**Infrastructure**
- `lib/paths.ts` — resolves `~/.parrot/` (+ `pdfs/`), db path.
- `lib/db.ts` — better-sqlite3 singleton, schema migrations, typed query helpers.
- `lib/storage.ts` — save/read/delete PDF files on disk.

**API routes** — `documents` (list + upload), `documents/[id]` (get/patch/delete),
`files/[id]` (streams PDF bytes), `highlights` (list/create), `highlights/[id]` (delete).

**Screens & components**
- **Home** (`app/page.tsx`) — "Parrot." wordmark, **New file** (`Ctrl N`) → OS picker → upload
  → open, **Recent files** list, Settings gear (bottom-left).
- **Reader** (`app/read/[id]/page.tsx` + `components/reader/*`) — continuous-scroll react-pdf,
  bottom pill toolbar (zoom, highlight-color pen, AI pen), text-selection menu, zoom-independent
  highlight overlays, reading-progress restore.

**Verified:** upload → file on disk + DB row; pages render/scroll; zoom; text selection →
Copy/Highlight; highlights persist across reload and stay aligned when zoomed; last-page
restore; `build` + `lint` pass.

---

## Milestone 2 — AI harness ✅¹

**Server**
- `lib/providers.ts` — provider registry (Claude, GPT, xAI, Groq, OpenRouter, Ollama,
  LM Studio, OpenAI-compatible); `getModel()`, `resolveKey()` (env → config file),
  `listModels()` (auto-fetch `/models`, `/api/tags` for Ollama).
- `lib/settings.ts` — get/set non-secret AI prefs in the `settings` table.
- `lib/db.ts` — chat/message helpers + `highlights ⟕ chats` join (highlights carry `chat_id`).

**API routes**
- `chat` — `streamText` → `toUIMessageStreamResponse`; accepts `{ messages, context }`;
  returns a clear 400 when no key/model is configured.
- `chats` — save/upsert a thread (creates the anchor highlight if needed); `GET` reopens by
  `highlightId`.
- `models` — `GET ?provider=` model ids. `settings` — `GET` prefs + key-detected flags, `PUT`.

**Client**
- `SettingsPopover` — provider selector, auto-fetched model picker (free-text fallback), base
  URL for local runtimes, per-provider "key detected" indicator, Save.
- `AskParrot` — floating panel (`useChat`) opened from a text selection, an AI-pen region, or a
  saved chat highlight; **Save** anchors the thread onto a highlight to reopen later.
- `AiPenLayer` — drag a rectangle over a page → crops the page `<canvas>` to a PNG data URL →
  sent as a vision message.
- Enabled the previously-stubbed **Ask Parrot** (selection menu) and **AI pen** (toolbar).
  Chat-anchored highlights render from `--accent` and open their thread on click.

**Verified:** Settings UI (8 providers, model picker, key-detected); chat route error path;
save→reopen persistence (highlight + chat + messages + join); clicking a saved highlight
reopens the thread; AI-pen region crop → image preview in Ask Parrot; `build` + `lint` pass.

**Not yet verified:** live streamed responses (needs a real API key).

---

## Run & configure

```bash
cd app
bun install
bun run dev        # http://localhost:3000
```

Configure a provider (for the AI features):

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY / OPENAI_API_KEY / etc.
```

Then open **Settings** (gear, bottom-left) to pick the active provider + model. Local runtimes
(Ollama, LM Studio) need no key — just a base URL.

---

## Notes / gotchas

- Don't mix `next build` output with `next dev` — it corrupts routing (API routes 404 as
  pages). Fix: `rm -rf app/.next`, then restart dev.
- `convertToModelMessages()` in `ai@7` is **async** — must be awaited.
- The pdf.js worker is vendored at `public/pdf.worker.min.mjs` (copied from `pdfjs-dist`) and
  is ESLint-ignored.

## Possible next steps

- Test live streaming with a real provider key; tune the system prompt.
- Multi-message thread continuation polish; error/empty states.
- Delete affordance for chat highlights; list saved threads for a document.
- Git: nothing committed yet.

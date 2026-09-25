import { generateText, jsonSchema, Output } from "ai";
import { getDocument } from "@/lib/db";
import { invalidJson, readJson } from "@/lib/http";
import { getModel } from "@/lib/providers";
import { getPrefs } from "@/lib/settings";

export const runtime = "nodejs";

/** Longest excerpt sent to the model; longer selections are cut. */
const MAX_TEXT = 8000;

interface Draft {
  question: string;
  hint: string;
  answer: string;
}

// Every field is required (an empty hint means "none") so strict-schema providers accept it.
const draftSchema = jsonSchema<Draft>({
  type: "object",
  properties: {
    question: { type: "string", description: "The question on the front of the card." },
    hint: { type: "string", description: "A short nudge toward the answer, or empty." },
    answer: { type: "string", description: "The answer on the back of the card." },
  },
  required: ["question", "hint", "answer"],
  additionalProperties: false,
});

function buildSystem(title: string): string {
  return [
    "You write study flashcards for someone reading a research paper. From the excerpt they " +
      "selected, write exactly one flashcard that tests its key idea.",
    "The question must make sense on its own, without the excerpt in front of the reader. Test " +
      "understanding (what, why, how) rather than trivia like exact wording.",
    "The answer is concise (one to three sentences) and grounded in the excerpt. Don't invent " +
      "numbers, results, or claims the excerpt doesn't support.",
    "The hint is a short nudge that doesn't give the answer away; leave it empty if the question " +
      "doesn't need one.",
    "Write plain text only: no Markdown and no LaTeX. Write any math in plain notation or Unicode.",
    `The paper is "${title}".`,
  ].join("\n");
}

// POST /api/flashcards/generate — draft one card from a selected excerpt ({ documentId, text }).
// Nothing is saved: the reader reviews the draft and saves it through POST /api/flashcards.
export async function POST(request: Request) {
  const body = await readJson<{ documentId: string; text: string }>(request);
  if (!body) return invalidJson();
  const doc = typeof body.documentId === "string" ? getDocument(body.documentId) : undefined;
  if (!doc) return Response.json({ error: "Unknown document" }, { status: 400 });
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });

  let model;
  try {
    model = getModel(getPrefs());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Provider not configured" },
      { status: 400 },
    );
  }

  try {
    const { output } = await generateText({
      model,
      system: buildSystem(doc.title),
      prompt: `Excerpt:\n"""\n${text}\n"""`,
      output: Output.object({ schema: draftSchema, name: "flashcard" }),
      abortSignal: request.signal, // the reader closed the popover or picked other text
    });
    const question = output.question.trim();
    const answer = output.answer.trim();
    if (!question || !answer) throw new Error("Empty card");
    return Response.json({ question, hint: output.hint.trim() || null, answer });
  } catch {
    return Response.json(
      { error: "Couldn't write a card from this selection." },
      { status: 502 },
    );
  }
}

import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { getModel } from "@/lib/providers";
import { getSearchTools } from "@/lib/search";
import { getPrefs } from "@/lib/settings";

export const runtime = "nodejs";

interface ChatContext {
  title?: string;
  text?: string;
}

function buildSystem(context: ChatContext | undefined, canSearch: boolean): string {
  const lines = [
    "You are Parrot, a reading companion who helps someone understand the paper they're reading. " +
      "They'll give you the title and the passage or figure they've selected — center your answer on that.",
    "Explain clearly and concisely, plain language first, leading with the direct answer. Define " +
      "technical terms, and briefly explain any method or concept the text leans on but doesn't spell " +
      "out (for example a cited technique), so the reader doesn't have to look elsewhere.",
    "Ground your answer in the provided text: separate what the paper actually says from your own " +
      "background knowledge, and if the passage doesn't settle a question, say so rather than guess. " +
      "Don't invent numbers, results, or citations.",
    "Use Markdown, and write math as LaTeX with $…$ or $$…$$.",
  ];
  if (context?.title) lines.push(`The reader is reading: "${context.title}".`);
  if (context?.text) {
    lines.push(`They are asking about this excerpt:\n"""\n${context.text}\n"""`);
  }
  if (canSearch) {
    lines.push(
      "You can call the `web_search` tool to look up current information. Prefer it when the reader " +
        "asks about recent or current things (latest papers, new results, an author's other work) or " +
        "anything past your knowledge cutoff. Mention the source URLs you relied on.",
    );
  }
  return lines.join("\n");
}

// POST /api/chat — stream an answer using the user's configured provider.
export async function POST(request: Request) {
  const { messages, context } = (await request.json()) as {
    messages: UIMessage[];
    context?: ChatContext;
  };

  const prefs = getPrefs();

  let model;
  try {
    model = getModel(prefs);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Provider not configured" },
      { status: 400 },
    );
  }

  const tools = getSearchTools(prefs); // {} unless search is enabled and usable

  const result = streamText({
    model,
    system: buildSystem(context, "web_search" in tools),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}

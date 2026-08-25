import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { getModel } from "@/lib/providers";
import { getPrefs } from "@/lib/settings";

export const runtime = "nodejs";

interface ChatContext {
  title?: string;
  text?: string;
}

function buildSystem(context: ChatContext | undefined): string {
  const lines = [
    "You are Parrot, an assistant that helps a reader understand a research paper.",
    "Answer concisely and accurately. If you are unsure, say so.",
  ];
  if (context?.title) lines.push(`The reader is reading: "${context.title}".`);
  if (context?.text) {
    lines.push(`They are asking about this excerpt:\n"""\n${context.text}\n"""`);
  }
  return lines.join("\n");
}

// POST /api/chat — stream an answer using the user's configured provider.
export async function POST(request: Request) {
  const { messages, context } = (await request.json()) as {
    messages: UIMessage[];
    context?: ChatContext;
  };

  let model;
  try {
    model = getModel(getPrefs());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Provider not configured" },
      { status: 400 },
    );
  }

  const result = streamText({
    model,
    system: buildSystem(context),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}

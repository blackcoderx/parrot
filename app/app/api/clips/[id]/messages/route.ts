import { NextRequest } from "next/server";
import { getClip, listClipMessages, replaceClipMessages } from "@/lib/db";
import { invalidJson, readJson } from "@/lib/http";
import { clipMessages } from "../../fields";

// GET /api/clips/[id]/messages — the clip's saved Ask Parrot thread (ClipMessage[]).
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/clips/[id]/messages">) {
  const { id } = await ctx.params;
  if (!getClip(id)) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(listClipMessages(id));
}

// PUT /api/clips/[id]/messages — { messages } replaces the saved thread; returns the Clip.
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/clips/[id]/messages">) {
  const { id } = await ctx.params;
  const body = await readJson<{ messages: unknown }>(request);
  if (!body) return invalidJson();
  const messages = clipMessages(body.messages);
  if (messages instanceof Response) return messages;
  if (!replaceClipMessages(id, messages)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(getClip(id));
}

import { NextRequest } from "next/server";
import { createClip, listClips } from "@/lib/db";
import { invalidJson, readJson } from "@/lib/http";
import { LIMITS, clipMessages, clipSubject, clipUrl, optionalText } from "./fields";

// GET /api/clips — every web clip, newest first. `?subject=<id>` narrows to one subject and
// `?subject=unsorted` to clips without one.
export async function GET(request: NextRequest) {
  const subject = request.nextUrl.searchParams.get("subject");
  if (subject === null) return Response.json(listClips());
  return Response.json(listClips({ subjectId: subject === "unsorted" ? null : subject }));
}

// POST /api/clips — { url, title, quote?, note?, subjectId?, messages? } → the new Clip.
export async function POST(request: NextRequest) {
  const body = await readJson<{
    url: string;
    title: string;
    quote: string;
    note: string;
    subjectId: string | null;
    messages: unknown;
  }>(request);
  if (!body) return invalidJson();

  const url = clipUrl(body.url);
  if (url instanceof Response) return url;
  const title = optionalText(body.title, "title", LIMITS.MAX_TITLE);
  if (title instanceof Response) return title;
  const quote = optionalText(body.quote, "quote", LIMITS.MAX_QUOTE);
  if (quote instanceof Response) return quote;
  const note = optionalText(body.note, "note", LIMITS.MAX_NOTE);
  if (note instanceof Response) return note;
  const subjectId = clipSubject(body.subjectId);
  if (subjectId instanceof Response) return subjectId;
  let messages;
  if (body.messages !== undefined) {
    messages = clipMessages(body.messages);
    if (messages instanceof Response) return messages;
  }

  const clip = createClip({
    url,
    title: title?.trim() || new URL(url).hostname,
    quote: quote ?? "",
    note,
    subjectId,
    messages,
  });
  return Response.json(clip, { status: 201 });
}

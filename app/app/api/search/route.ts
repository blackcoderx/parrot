import { NextRequest } from "next/server";
import { search } from "@/lib/db";
import type { SearchKind } from "@/types";

const KINDS: SearchKind[] = ["note", "highlight", "clip"];

// GET /api/search?q=words[&kind=note|highlight|clip][&subject=<id>|unsorted] — notes,
// highlights and web clips matching every word (as prefixes), best first (SearchResult[]).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").slice(0, 200);
  const kind = params.get("kind");
  const subject = params.get("subject");
  return Response.json(
    search(q, {
      kind: KINDS.includes(kind as SearchKind) ? (kind as SearchKind) : undefined,
      subject: subject === null ? undefined : subject === "unsorted" ? null : subject,
    }),
  );
}

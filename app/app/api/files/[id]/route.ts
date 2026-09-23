import { NextRequest } from "next/server";
import { getDocument } from "@/lib/db";
import { statPdf, streamPdf } from "@/lib/storage";

// GET /api/files/[id] — the raw PDF bytes, for react-pdf to load.
//
// Supports HTTP Range requests so pdf.js can fetch just the parts it needs and show the
// first pages before a large file has fully arrived. A stored PDF never changes for a given
// id, so the browser may cache it indefinitely (the ETag covers a file replaced on disk).
export async function GET(request: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;

  if (!getDocument(id)) return new Response("Not found", { status: 404 });

  const stat = await statPdf(id);
  if (!stat) return new Response("File missing", { status: 404 });

  const etag = `"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
  const headers = {
    "Content-Type": "application/pdf",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: etag,
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  const range = parseRange(request.headers.get("range"), stat.size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${stat.size}` },
    });
  }
  if (range) {
    const [start, end] = range;
    return new Response(streamPdf(id, start, end), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      },
    });
  }

  return new Response(streamPdf(id, 0, stat.size - 1), {
    headers: { ...headers, "Content-Length": String(stat.size) },
  });
}

/** Parse a single-range `bytes=` header into inclusive [start, end]; null means "whole file". */
function parseRange(header: string | null, size: number): [number, number] | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null; // multi-range or odd syntax: send it all
  let start: number;
  let end: number;
  if (!match[1]) {
    // Suffix range: the last N bytes.
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (start > end || start >= size) return "invalid";
  return [start, end];
}

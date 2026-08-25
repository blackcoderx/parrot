import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { listDocuments, insertDocument } from "@/lib/db";
import { savePdf } from "@/lib/storage";

// GET /api/documents — recent documents, most-recently-opened first.
export async function GET() {
  return Response.json(listDocuments());
}

// POST /api/documents — multipart upload of a single PDF ("file" field).
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return Response.json({ error: "Only PDF files are supported" }, { status: 400 });
  }

  const id = randomUUID();
  const title = file.name.replace(/\.pdf$/i, "") || "Untitled";

  await savePdf(id, await file.arrayBuffer());
  const doc = insertDocument({ id, title, filename: file.name });

  return Response.json(doc, { status: 201 });
}

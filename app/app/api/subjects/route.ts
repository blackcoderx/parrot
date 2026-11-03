import { NextRequest } from "next/server";
import { createSubject, listSubjects } from "@/lib/db";
import { invalidJson, readJson } from "@/lib/http";
import { subjectName } from "./fields";

// GET /api/subjects — every subject with its counts and when it was last studied
// (SubjectSummary[]), least recently studied first.
export async function GET() {
  return Response.json(listSubjects());
}

// POST /api/subjects — { name } → the new Subject.
export async function POST(request: NextRequest) {
  const body = await readJson<{ name: string }>(request);
  if (!body) return invalidJson();
  const name = subjectName(body.name);
  if (name instanceof Response) return name;
  return Response.json(createSubject(name), { status: 201 });
}

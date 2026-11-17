import { NextRequest } from "next/server";
import { createDeadline, listDeadlines } from "@/lib/db";
import { invalidJson, readJson } from "@/lib/http";
import { deadlineFields } from "./fields";

// GET /api/deadlines — every Deadline, soonest first.
export async function GET() {
  return Response.json(listDeadlines());
}

// POST /api/deadlines — { title, due: "YYYY-MM-DD" } → the new Deadline.
export async function POST(request: NextRequest) {
  const body = await readJson<{ title: string; due: string }>(request);
  if (!body) return invalidJson();
  const fields = deadlineFields(body);
  if (fields instanceof Response) return fields;
  return Response.json(createDeadline(fields.title, fields.due), { status: 201 });
}

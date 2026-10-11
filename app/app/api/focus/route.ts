import { NextRequest } from "next/server";
import { getTimerSettings, setTimerSettings } from "@/lib/settings";
import { DAY_RE, focusStats } from "@/lib/focus";
import { invalidJson, readJson } from "@/lib/http";
import type { TimerSettings } from "@/types";

// Allowed range (inclusive) for each length, in minutes / sessions.
const LIMITS: Record<keyof TimerSettings, [number, number]> = {
  focusMin: [1, 180],
  shortMin: [1, 60],
  longMin: [1, 60],
  longEvery: [2, 12],
};

// GET /api/focus?today=YYYY-MM-DD — timer lengths + the streak as of the reader's local day.
export async function GET(request: NextRequest) {
  const today = request.nextUrl.searchParams.get("today") ?? "";
  if (!DAY_RE.test(today)) {
    return Response.json({ error: "today must be YYYY-MM-DD" }, { status: 400 });
  }
  return Response.json({ settings: getTimerSettings(), stats: focusStats(today) });
}

// PUT /api/focus — save timer lengths ({ focusMin, shortMin, longMin, longEvery }).
export async function PUT(request: NextRequest) {
  const body = await readJson<TimerSettings>(request);
  if (!body) return invalidJson();

  const settings = {} as TimerSettings;
  for (const [key, [min, max]] of Object.entries(LIMITS) as [keyof TimerSettings, [number, number]][]) {
    const value = body[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      return Response.json({ error: `${key} must be a whole number from ${min} to ${max}` }, { status: 400 });
    }
    settings[key] = value;
  }
  setTimerSettings(settings);
  return Response.json(settings);
}

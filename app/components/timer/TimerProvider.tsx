"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getJson, sendJson } from "@/components/api";
import type { Pos } from "@/components/useFloatingWindow";
import type { FocusStats, TimerSettings } from "@/types";
import { playChime, primeAudio } from "./chime";
import { TimerWindow } from "./TimerWindow";

export type Phase = "focus" | "short" | "long";

/** Where the current period stands. Times are absolute, so it survives reloads. */
export interface TimerState {
  phase: Phase;
  status: "idle" | "running" | "paused";
  /** Running: when the period ends. */
  endsAt: number | null;
  /** Paused: time left. */
  remainingMs: number | null;
  /** Running/paused: the period's full length, fixed when it started. */
  totalMs: number | null;
  /** Running/paused focus: when it first started (recorded with the session). */
  startedAt: number | null;
  /** Focus sessions finished in the current long-break cycle. */
  done: number;
}

const IDLE_FOCUS: TimerState = {
  phase: "focus",
  status: "idle",
  endsAt: null,
  remainingMs: null,
  totalMs: null,
  startedAt: null,
  done: 0,
};

const STORAGE_KEY = "parrot.timer";

export const PHASE_LABEL: Record<Phase, string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
};

export function phaseMs(phase: Phase, s: TimerSettings): number {
  const min = phase === "focus" ? s.focusMin : phase === "short" ? s.shortMin : s.longMin;
  return min * 60_000;
}

/** Time left in the period at `now`. */
export function remainingAt(state: TimerState, settings: TimerSettings, now: number): number {
  if (state.status === "running") {
    // Clamped: `now` can be a moment stale right after a countdown display starts ticking.
    const left = (state.endsAt ?? now) - now;
    return Math.min(Math.max(0, left), state.totalMs ?? left);
  }
  if (state.status === "paused") return state.remainingMs ?? 0;
  return phaseMs(state.phase, settings);
}

/** The period's full length (for the progress bar). */
export function totalOf(state: TimerState, settings: TimerSettings): number {
  return state.totalMs ?? phaseMs(state.phase, settings);
}

/** mm:ss (or h:mm:ss for very long focus periods). */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** The reader's local calendar day, YYYY-MM-DD (streaks follow their midnight). */
function localDay(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Re-renders every `ms` while `active`, returning the current time. */
export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0); // catch up straight away after being inactive
    const id = setInterval(tick, ms);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, ms]);
  return now;
}

interface TimerContextValue {
  settings: TimerSettings | null;
  stats: FocusStats | null;
  state: TimerState;
  open: boolean;
  pos: Pos | null;
  /** Set when a period has just ended, until the reader acknowledges it. */
  alert: Phase | null;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  toggleOpen: () => void;
  close: () => void;
  setPos: (pos: Pos) => void;
  acknowledge: () => void;
  saveSettings: (s: TimerSettings) => Promise<string | null>;
}

const TimerContext = createContext<TimerContextValue | null>(null);

export function useTimer(): TimerContextValue {
  const value = useContext(TimerContext);
  if (!value) throw new Error("useTimer must be used inside <TimerProvider>");
  return value;
}

/**
 * The app-wide Pomodoro timer. Mounted in the root layout so it keeps running across the
 * library and every document. Its context only changes on transitions (start, pause, a period
 * ending…), never per tick — countdown displays tick on their own via `useNow`.
 */
export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<TimerSettings | null>(null);
  const [stats, setStats] = useState<FocusStats | null>(null);
  const [state, setState] = useState<TimerState>(IDLE_FOCUS);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [alert, setAlert] = useState<Phase | null>(null);
  const [loaded, setLoaded] = useState(false);

  // The open document, recorded with a finished focus session.
  const pathname = usePathname();
  const documentId = pathname.startsWith("/read/") ? decodeURIComponent(pathname.slice(6)) : null;
  const documentIdRef = useRef(documentId);
  useEffect(() => {
    documentIdRef.current = documentId;
  }, [documentId]);

  const loadFocus = useCallback(() => {
    getJson<{ settings: TimerSettings; stats: FocusStats }>(
      `/api/focus?today=${localDay(Date.now())}`,
    )
      .then((d) => {
        setSettings(d.settings);
        setStats(d.stats);
      })
      .catch(() => {});
  }, []);

  // Restore the saved timer (client-side only, keeping hydration clean) and load settings.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as {
        state?: TimerState;
        open?: boolean;
        pos?: Pos | null;
      } | null;
      if (saved?.state?.phase) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState({ ...IDLE_FOCUS, ...saved.state });
        setOpen(!!saved.open);
        setPos(saved.pos ?? null);
      }
    } catch {}
    setLoaded(true);
    loadFocus();
  }, [loadFocus]);

  // Refresh the streak whenever the window opens (it may have crossed midnight).
  useEffect(() => {
    if (open && loaded) loadFocus();
  }, [open, loaded, loadFocus]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, open, pos }));
    } catch {}
  }, [loaded, state, open, pos]);

  // End the running period on time. Arming with a past `endsAt` (the app was closed when it
  // ended) completes it straight away — a missed focus period still counts, on its own day.
  useEffect(() => {
    if (!settings || state.status !== "running" || state.endsAt == null) return;
    const finished = state;
    const id = setTimeout(() => {
      const endedAt = finished.endsAt!;
      let next: TimerState;
      if (finished.phase === "focus") {
        const done = finished.done + 1;
        const minutes = Math.max(1, Math.round((finished.totalMs ?? 0) / 60_000));
        sendJson("/api/focus/sessions", "POST", {
          day: localDay(endedAt),
          today: localDay(Date.now()),
          startedAt: finished.startedAt ?? endedAt - (finished.totalMs ?? 0),
          minutes,
          documentId: documentIdRef.current,
        })
          .then((res) => (res.ok ? (res.json() as Promise<FocusStats>) : null))
          .then((s) => s && setStats(s))
          .catch(() => {});
        next = { ...IDLE_FOCUS, phase: done % settings.longEvery === 0 ? "long" : "short", done };
      } else {
        // A long break closes the cycle.
        next = { ...IDLE_FOCUS, done: finished.phase === "long" ? 0 : finished.done };
      }
      setState(next);
      setAlert(next.phase);
      setOpen(true);
      playChime();
    }, Math.max(0, state.endsAt - Date.now()));
    return () => clearTimeout(id);
  }, [settings, state]);

  const start = useCallback(() => {
    if (!settings) return;
    primeAudio();
    setAlert(null);
    setState((s) => {
      if (s.status === "running") return s;
      const now = Date.now();
      const totalMs = s.totalMs ?? phaseMs(s.phase, settings);
      const remaining = s.status === "paused" ? (s.remainingMs ?? totalMs) : totalMs;
      return {
        ...s,
        status: "running",
        endsAt: now + remaining,
        remainingMs: null,
        totalMs,
        startedAt: s.startedAt ?? (s.phase === "focus" ? now : null),
      };
    });
  }, [settings]);

  const pause = useCallback(() => {
    setState((s) =>
      s.status === "running"
        ? { ...s, status: "paused", remainingMs: Math.max(0, (s.endsAt ?? 0) - Date.now()), endsAt: null }
        : s,
    );
  }, []);

  const reset = useCallback(() => {
    setAlert(null);
    setState((s) => ({ ...IDLE_FOCUS, phase: s.phase, done: s.done }));
  }, []);

  // Skipping never records a session: focus → short break, any break → focus.
  const skip = useCallback(() => {
    setAlert(null);
    setState((s) =>
      s.phase === "focus"
        ? { ...IDLE_FOCUS, phase: "short", done: s.done }
        : { ...IDLE_FOCUS, done: s.phase === "long" ? 0 : s.done },
    );
  }, []);

  const toggleOpen = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  const acknowledge = useCallback(() => setAlert(null), []);

  const saveSettings = useCallback(async (next: TimerSettings) => {
    const res = await sendJson("/api/focus", "PUT", next).catch(() => null);
    if (!res) return "Could not save — is Parrot running?";
    const body = (await res.json().catch(() => null)) as (TimerSettings & { error?: string }) | null;
    if (!res.ok || !body) return body?.error ?? "Could not save";
    setSettings(body);
    return null;
  }, []);

  // Tab-title cue while a period-end alert is pending.
  useEffect(() => {
    if (!alert) return;
    const prefix = alert === "focus" ? "⏰ Focus time · " : "⏰ Break time · ";
    document.title = prefix + document.title;
    return () => {
      document.title = document.title.replace(prefix, "");
    };
  }, [alert]);

  const value: TimerContextValue = {
    settings,
    stats,
    state,
    open,
    pos,
    alert,
    start,
    pause,
    reset,
    skip,
    toggleOpen,
    close,
    setPos,
    acknowledge,
    saveSettings,
  };

  return (
    <TimerContext.Provider value={value}>
      {children}
      {open && <TimerWindow />}
    </TimerContext.Provider>
  );
}

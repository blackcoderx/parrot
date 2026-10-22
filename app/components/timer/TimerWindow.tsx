"use client";

import { useState } from "react";
import { useFloatingWindow } from "@/components/useFloatingWindow";
import buttons from "@/components/reader/buttons.module.css";
import type { TimerSettings } from "@/types";
import { PHASE_LABEL, formatClock, remainingAt, totalOf, useNow, useTimer } from "./TimerProvider";
import { TimerIcon } from "./TimerButton";
import styles from "./Timer.module.css";

/** The floating, draggable Pomodoro window. Closing it only hides it; the timer keeps going. */
export function TimerWindow() {
  const timer = useTimer();
  const { settings, stats, state, alert } = timer;
  const [editing, setEditing] = useState(false);
  const { panelRef, style, headerProps } = useFloatingWindow(null, timer.close, {
    closeOnEscape: false,
    // First open: top-right, just under the reader header (clamped into the viewport).
    initialPos: timer.pos ?? { left: window.innerWidth, top: 56 },
    onMoved: timer.setPos,
  });

  const running = state.status === "running";
  const now = useNow(running);
  const remaining = settings ? remainingAt(state, settings, now) : 0;
  const total = settings ? totalOf(state, settings) : 1;
  const progress = total ? 1 - remaining / total : 0;
  const longEvery = settings?.longEvery ?? 4;

  return (
    <div
      ref={panelRef}
      popover="manual"
      className={styles.panel}
      style={style}
      data-phase={state.phase}
      data-alert={alert ? "" : undefined}
      onPointerDown={alert ? timer.acknowledge : undefined}
    >
      <div className={styles.header} {...headerProps}>
        <span className={styles.titleRow}>
          <TimerIcon size={15} />
          <span className={styles.title}>{editing ? "Timer settings" : PHASE_LABEL[state.phase]}</span>
        </span>
        <span className={styles.headerActions}>
          <button
            className={styles.iconBtn}
            onClick={() => setEditing((e) => !e)}
            aria-label="Timer settings"
            aria-pressed={editing}
            title="Set focus and break lengths"
          >
            <GearIcon />
          </button>
          <button className={buttons.askClose} onClick={timer.close} aria-label="Hide timer">
            ×
          </button>
        </span>
      </div>

      {editing && settings ? (
        <SettingsForm settings={settings} onDone={() => setEditing(false)} />
      ) : (
        <div className={styles.body}>
          <div className={styles.clock} aria-live="off">
            {settings ? formatClock(remaining) : "--:--"}
          </div>
          <div className={styles.progress} aria-hidden>
            <div className={styles.progressFill} style={{ width: `${progress * 100}%` }} />
          </div>
          <div className={styles.dots} title={`${state.done} of ${longEvery} before a long break`}>
            {Array.from({ length: longEvery }, (_, i) => (
              <span key={i} className={styles.dot} data-filled={i < state.done || undefined} />
            ))}
          </div>
          <div className={styles.controls}>
            <button className={styles.ghostBtn} onClick={timer.reset} disabled={state.status === "idle"}>
              Reset
            </button>
            {running ? (
              <button className={`${buttons.askSave} ${styles.mainBtn}`} onClick={timer.pause}>
                Pause
              </button>
            ) : (
              <button className={`${buttons.askSend} ${styles.mainBtn}`} onClick={timer.start} disabled={!settings}>
                {state.status === "paused" ? "Resume" : "Start"}
              </button>
            )}
            <button className={styles.ghostBtn} onClick={timer.skip}>
              Skip
            </button>
          </div>
        </div>
      )}

      <div className={styles.footer}>
        {stats && stats.streak > 0 ? (
          <>
            <span className={styles.streak}>
              🔥 {stats.streak}-day streak
            </span>
            <span>· {stats.today} today</span>
          </>
        ) : (
          <span>Finish a session to start a streak</span>
        )}
      </div>
    </div>
  );
}

const FIELDS: { key: keyof TimerSettings; label: string; min: number; max: number; unit: string }[] = [
  { key: "focusMin", label: "Focus", min: 1, max: 180, unit: "min" },
  { key: "shortMin", label: "Short break", min: 1, max: 60, unit: "min" },
  { key: "longMin", label: "Long break", min: 1, max: 60, unit: "min" },
  { key: "longEvery", label: "Long break every", min: 2, max: 12, unit: "sessions" },
];

function SettingsForm({ settings, onDone }: { settings: TimerSettings; onDone: () => void }) {
  const { saveSettings } = useTimer();
  const [draft, setDraft] = useState<Record<keyof TimerSettings, string>>(() => ({
    focusMin: String(settings.focusMin),
    shortMin: String(settings.shortMin),
    longMin: String(settings.longMin),
    longEvery: String(settings.longEvery),
  }));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const err = await saveSettings({
      focusMin: Number(draft.focusMin),
      shortMin: Number(draft.shortMin),
      longMin: Number(draft.longMin),
      longEvery: Number(draft.longEvery),
    });
    setSaving(false);
    if (err) setError(err);
    else onDone();
  }

  return (
    <form className={styles.form} onSubmit={save}>
      {FIELDS.map((f) => (
        <label key={f.key} className={styles.field}>
          <span>{f.label}</span>
          <span className={styles.fieldInput}>
            <input
              type="number"
              inputMode="numeric"
              min={f.min}
              max={f.max}
              step={1}
              required
              value={draft[f.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            />
            <span className={styles.unit}>{f.unit}</span>
          </span>
        </label>
      ))}
      {error && <p className={styles.error}>{error}</p>}
      <p className={styles.hint}>A period already under way keeps its length.</p>
      <div className={styles.controls}>
        <button type="button" className={styles.ghostBtn} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={`${buttons.askSend} ${styles.mainBtn}`} disabled={saving}>
          {saving ? "…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

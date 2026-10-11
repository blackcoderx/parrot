"use client";

import { formatClock, remainingAt, useNow, useTimer } from "./TimerProvider";

/**
 * Opens/hides the focus timer. While the timer runs with its window hidden, it shows the time
 * left so the reader can still keep track.
 */
export function TimerButton({ className, clockClassName }: { className?: string; clockClassName?: string }) {
  const { state, settings, open, alert, toggleOpen } = useTimer();
  const ticking = state.status === "running" && !open;
  const now = useNow(ticking, 1000);
  const showClock = settings && !open && state.status !== "idle";

  return (
    <button
      className={className}
      data-active={open || undefined}
      data-alert={alert ? "" : undefined}
      onClick={toggleOpen}
      aria-label="Focus timer"
      aria-pressed={open}
      title="Focus timer (Pomodoro)"
    >
      <TimerIcon />
      {showClock && <span className={clockClassName}>{formatClock(remainingAt(state, settings, now))}</span>}
    </button>
  );
}

export function TimerIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="13.5" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 9.5v4l2.5 1.5M9.5 2.5h5M12 2.5V6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

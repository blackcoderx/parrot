"use client";

// A soft two-note chime made with Web Audio — no sound files to ship.

let ctx: AudioContext | null = null;

/**
 * Create/resume the audio context. Call from a user gesture (the Start click): browsers only
 * let a page make sound after the user has interacted with it.
 */
export function primeAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // No Web Audio — the visual cue still shows.
  }
}

export function playChime(): void {
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  // E5 then A5, each a gentle sine with a quick attack and a slow fade.
  [659.25, 880].forEach((freq, i) => {
    const t = now + i * 0.18;
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t);
    osc.stop(t + 0.62);
  });
}

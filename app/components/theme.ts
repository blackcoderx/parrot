// Shared by the root layout (a server component) and ThemeButton, so no "use client" and no
// React imports here.

export type Theme = "light" | "dark";

/** localStorage key for the app theme (per browser, like the reader's `parrot.readingMode`). */
export const THEME_KEY = "parrot.theme";

/**
 * Run inline in <head> before first paint: applies a saved dark theme as `data-theme` on
 * <html>, so a reload doesn't flash light. globals.css holds the dark tokens; the reader
 * opts out of them with its own `data-reading` modes.
 */
export const themeScript = `try{if(localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)})==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

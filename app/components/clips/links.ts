/** The site's host name, without "www.". */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Text-fragment syntax reserves "-", "," and "&", so encode them on top of encodeURIComponent.
const encodeFragment = (s: string) =>
  encodeURIComponent(s).replace(/-/g, "%2D").replace(/,/g, "%2C");

/**
 * Link back to the clipped passage: the page plus a text fragment (`#:~:text=start,end`), which
 * Chrome and Edge scroll to and highlight. Long quotes use their first and last few words.
 */
export function sourceLink(url: string, quote: string): string {
  const words = quote.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return url;
  const base = url.split("#")[0];
  const directive =
    words.length <= 8
      ? encodeFragment(words.join(" "))
      : `${encodeFragment(words.slice(0, 4).join(" "))},${encodeFragment(words.slice(-4).join(" "))}`;
  return `${base}#:~:text=${directive}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "18 Nov 2026". Fixed English, so the server render and hydration agree. */
export function formatDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

import type { Metadata } from "next";
import { WebPanel } from "@/components/clips/WebPanel";

export const metadata: Metadata = { title: "Parrot" };

/**
 * Shown inside the browser extension's side panel (extension/sidepanel.html frames it). Only
 * extension pages may frame it — see the frame-ancestors header in next.config.ts.
 */
export default function Page() {
  return <WebPanel />;
}

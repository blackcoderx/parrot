import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the Windows zip (scripts/package-windows.ps1).
  output: "standalone",
  // The packaging script builds into its own folder so a running `next dev` keeps .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // better-sqlite3 is a native module and must not be bundled by the server compiler.
  serverExternalPackages: ["better-sqlite3"],
  // Free up the bottom-left corner for the Settings button (dev-only badge otherwise collides).
  devIndicators: false,
  // /ext is the browser extension's side panel (extension/). Only extension pages may frame it,
  // so a website can't embed it and hand it a fake selection to save.
  async headers() {
    return [
      {
        source: "/ext",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors chrome-extension:" }],
      },
    ];
  },
};

export default nextConfig;

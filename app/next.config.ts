import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module and must not be bundled by the server compiler.
  serverExternalPackages: ["better-sqlite3"],
  // Free up the bottom-left corner for the Settings button (dev-only badge otherwise collides).
  devIndicators: false,
};

export default nextConfig;

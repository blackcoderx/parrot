// Starts Parrot's server on this computer and opens it in the default browser.
// "Start Parrot.bat" runs this; closing that window stops Parrot.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const here = path.dirname(fileURLToPath(import.meta.url));
// Not 3000, so it doesn't collide with a dev server.
const port = Number(process.env.PARROT_PORT) || 3737;
const url = `http://localhost:${port}`;

async function isUp() {
  try {
    await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

function openBrowser() {
  spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
}

// Already running (started twice): just open another tab.
if (await isUp()) {
  openBrowser();
  process.exit(0);
}

const server = spawn(process.execPath, ["server.js"], {
  cwd: path.join(here, "app"),
  // Bind to loopback only so Parrot isn't reachable from the local network.
  env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1" },
  stdio: "inherit",
});
server.on("exit", (code) => process.exit(code ?? 0));

for (let i = 0; i < 120 && !(await isUp()); i++) await sleep(250);
openBrowser();
console.log(`\nParrot is running at ${url}\nKeep this window open while you use it. Close it to stop Parrot.\n`);

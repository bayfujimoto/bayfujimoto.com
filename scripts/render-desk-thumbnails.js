// Renders the Guide's contact-strip thumbnails — one PNG per frame — by driving
// the harness page at scripts/render-desk-thumbnails/ in a headless browser.
//
//   npm run thumbs:desk
//
// Starts a Vite dev server (so the harness can import three and the site's own
// model-look.js), opens the page with Playwright, waits for the renders, and
// writes public/thumbnails/desk/<frame>.png (key, identity, labor, consumption,
// creation, accumulation). The PNGs are committed with the code: they change
// only when a model or the plate's look changes.
//
// Browser: uses the `playwright-core` devDependency with an installed Google
// Chrome (channel "chrome"). Set PW_EXECUTABLE to point at another Chromium,
// or open the harness by hand in the dev server and use its save buttons.
// Models: loaded from R2 by default; THUMBS_MODEL_BASE=/scripts/.stripped-models/
// (any path the dev server can serve) renders from a local copy instead.
//
// docs/guide-inspection-card-plan.md → "Thumbnail pipeline".

import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { tmpdir } from "os";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const OUT_DIR = resolve(projectRoot, "public/thumbnails/desk");

async function launchBrowser() {
  let pw;
  try {
    pw = await import("playwright-core");
  } catch {
    try { pw = await import("playwright"); } catch {
      throw new Error("playwright-core is not installed — npm i -D playwright-core, or open the harness by hand.");
    }
  }
  const opts = { headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] };
  if (process.env.PW_EXECUTABLE) opts.executablePath = process.env.PW_EXECUTABLE;
  else opts.channel = "chrome";
  return pw.chromium.launch(opts);
}

const server = await createServer({
  root: projectRoot,
  configFile: false,
  logLevel: "warn",
  // Keep the dep-optimizer cache out of the project's node_modules/.vite so
  // this one-off run never fights the dev server's own cache.
  cacheDir: resolve(tmpdir(), "bayfujimoto-thumbs-vite"),
  server: { port: 0, host: "127.0.0.1", strictPort: false },
});
await server.listen();
const port = server.config.server.port || server.httpServer.address().port;
const base = process.env.THUMBS_MODEL_BASE ? `?base=${encodeURIComponent(process.env.THUMBS_MODEL_BASE)}` : "";
const url = `http://127.0.0.1:${port}/scripts/render-desk-thumbnails/index.html${base}`;

let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") console.error("[harness]", m.text()); });
  await page.goto(url, { waitUntil: "load" });
  const data = await page.evaluate(async () => await window.__renderThumbs);
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [key, dataUrl] of Object.entries(data)) {
    const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const buf = Buffer.from(b64, "base64");
    writeFileSync(resolve(OUT_DIR, `${key}.png`), buf);
    console.log(`wrote public/thumbnails/desk/${key}.png (${(buf.length / 1024).toFixed(0)} KB)`);
  }
} finally {
  if (browser) await browser.close();
  await server.close();
}

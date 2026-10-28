import { chromium } from "playwright-core";
import { createServer } from "vite";
import fs from "node:fs";

/**
 * Robust QA renderer: starts an in-process Vite dev server, then captures one
 * screenshot per requested view using Chrome + SwiftShader.
 *
 * Usage:
 *   node tools/render.mjs rear profile hero
 *   node tools/render.mjs rear:everest-white front:tango-red
 *   node tools/render.mjs --size 1600x1000 hero profile
 */

const args = process.argv.slice(2);
let width = 1280;
let height = 800;
const specs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--size" && args[i + 1]) {
    const [w, h] = args[i + 1].split("x").map(Number);
    width = w || width;
    height = h || height;
    i++;
  } else {
    specs.push(args[i]);
  }
}
if (specs.length === 0) specs.push("hero");

fs.mkdirSync("tools/shots", { recursive: true });

const server = await createServer({
  logLevel: "error",
  server: { port: 5199, strictPort: false, host: "127.0.0.1" },
});
await server.listen();
const port = server.httpServer.address().port;
const base = `http://127.0.0.1:${port}`;
console.log(`qa server ${base}`);

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--enable-unsafe-swiftshader",
    "--disable-gpu-watchdog",
    "--disable-dev-shm-usage",
    "--disable-lcd-text",
    "--force-device-scale-factor=1",
  ],
});

const logs = [];

for (const spec of specs) {
  const [view, paint] = spec.split(":");
  const params = new URLSearchParams({ clean: "1", view });
  if (paint) params.set("paint", paint);
  const url = `${base}/?${params.toString()}`;
  const out = `tools/shots/qa-${view}${paint ? `-${paint}` : ""}.png`;

  let saved = false;
  for (let attempt = 1; attempt <= 3 && !saved; attempt++) {
    // A fresh page per view keeps SwiftShader's WebGL context from degrading
    // across a long capture batch.
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(90000);
    page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));
    page.on("requestfailed", (req) =>
      logs.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`)
    );
    try {
      await page.goto(url, { waitUntil: "load", timeout: 90000 });
      await page.waitForFunction(() => window.__XEV_READY__ === true, { timeout: 90000 });
      await page.evaluate(() => {
        // `?clean=1` hides the studio chrome, but the config panel still owns
        // the camera's lateral offset and the Experience dock lives outside
        // that rule. Close the panel and remove every overlay so documentation
        // renders show only the car, centred in frame.
        document.querySelector("#close-config")?.click();
        for (const selector of [
          ".mission-dock",
          ".mission-hud",
          ".drive-hud",
          ".tokyo-hud",
          ".tokyo-poi",
          ".tokyo-drive-hint",
          ".drive-pad",
        ]) {
          document.querySelectorAll(selector).forEach((el) => {
            el.style.display = "none";
          });
        }
        window.__XEV?.freeze?.();
      });
      await page.waitForTimeout(600);
      const lost = await page.evaluate(() =>
        Boolean(window.__XEV?.renderer?.getContext?.()?.isContextLost?.())
      );
      if (lost) throw new Error("WebGL context lost");
      await page.screenshot({ path: out, timeout: 60000 });
      saved = true;
      console.log(`saved ${out}`);
    } catch (error) {
      console.log(`[attempt ${attempt}] ${view}: ${error.message}`);
    } finally {
      await page.close().catch(() => {});
    }
  }
  if (!saved) console.log(`FAILED ${view}`);
}

console.log("--- console ---");
console.log(logs.slice(-40).join("\n") || "(none)");
await browser.close();
await server.close();

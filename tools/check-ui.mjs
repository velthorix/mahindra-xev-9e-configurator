import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({
  logLevel: "error",
  server: { port: 5201, strictPort: false, host: "127.0.0.1" },
});
await server.listen();
const port = server.httpServer.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--enable-unsafe-swiftshader",
    "--disable-gpu-watchdog",
  ],
});

const results = {};
const errors = [];

async function openPage(viewport, mobile = false) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/`, { waitUntil: "load" });
  await page.waitForFunction(() => document.body.classList.contains("is-ready"), {
    timeout: 90000,
  });
  await page.waitForTimeout(1600);
  return { context, page };
}

const desktop = await openPage({ width: 1600, height: 1000 });
const page = desktop.page;
page.setDefaultTimeout(120000);

await page.screenshot({ path: "tools/shots/ui-desktop-hero.png" });
results.desktop = await page.evaluate(() => ({
  title: document.title,
  ready: window.__XEV.ready,
  paint: window.__XEV.state.paint,
  view: window.__XEV.state.view,
  swatches: document.querySelectorAll("[data-paint]").length,
  loaderHidden: document.querySelector("#loader").classList.contains("is-hidden"),
  canvas: [document.querySelector("#scene-canvas").width, document.querySelector("#scene-canvas").height],
  viewOffset: window.__XEV.camera.view?.enabled ?? null,
}));

await page.click('[data-paint="everest-white"]');
await page.waitForTimeout(500);
results.paintSwitch = await page.evaluate(() => ({
  label: document.querySelector("#paint-name").textContent,
  active: document.querySelectorAll("[data-paint].is-active").length,
  state: window.__XEV.state.paint,
  color: window.__XEV.materials.paint.color.getHexString(),
  toast: document.querySelector("#toast").textContent,
}));

await page.click('[data-view="profile"]');
await page.waitForTimeout(1600);
results.viewSwitch = await page.evaluate(() => ({
  view: window.__XEV.state.view,
  active: document.querySelector("[data-view].is-active")?.dataset.view,
}));

// Switching a view closes the desktop sidebar; reopen it before touching the
// controls that live inside it.
if (!(await page.evaluate(() => window.__XEV.state.configOpen))) {
  await page.click("#open-config");
  await page.waitForTimeout(700);
}

await page.click('[data-light="headlights"]');
await page.waitForTimeout(900);
results.lighting = await page.evaluate(() => ({
  body: document.body.dataset.light,
  state: window.__XEV.state.light,
  drl: window.__XEV.materials.drl.emissiveIntensity,
  headlamp: window.__XEV.materials.headlampLED.emissiveIntensity,
  tail: window.__XEV.materials.tailLED.emissiveIntensity,
  active: document.querySelector("[data-light].is-active")?.dataset.light,
}));

await page.click('label.switch-row:has(#tail-toggle)');
await page.click('label.switch-row:has(#ambient-toggle)');
await page.waitForTimeout(700);
results.toggles = await page.evaluate(() => ({
  tail: window.__XEV.state.tail,
  ambient: window.__XEV.state.ambient,
  tailEmissive: window.__XEV.materials.tailLED.emissiveIntensity,
}));

await page.click("#toggle-rotate");
await page.waitForTimeout(200);
results.rotateOn = await page.evaluate(() => ({
  state: window.__XEV.state.autoRotate,
  controls: window.__XEV.controls.autoRotate,
  pressed: document.querySelector("#toggle-rotate").getAttribute("aria-pressed"),
}));
await page.click("#toggle-rotate");
await page.waitForTimeout(200);
results.rotateOff = await page.evaluate(() => window.__XEV.state.autoRotate);

await page.click("#toggle-motion");
await page.waitForTimeout(1400);
results.motion = await page.evaluate(() => ({
  state: window.__XEV.state.motion,
  view: window.__XEV.state.view,
  pressed: document.querySelector("#toggle-motion").getAttribute("aria-pressed"),
}));

const beforeZoom = await page.evaluate(() =>
  window.__XEV.camera.position.distanceTo(window.__XEV.controls.target)
);
await page.click("#zoom-in");
await page.waitForTimeout(400);
const afterZoom = await page.evaluate(() =>
  window.__XEV.camera.position.distanceTo(window.__XEV.controls.target)
);
results.zoom = { beforeZoom, afterZoom, closer: afterZoom < beforeZoom };

await page.click("#reset-view");
await page.waitForTimeout(1500);
results.reset = await page.evaluate(() => ({
  view: window.__XEV.state.view,
  motion: window.__XEV.state.motion,
}));

await page.click("#open-info");
await page.waitForTimeout(700);
results.infoOpen = await page.evaluate(() => ({
  open: window.__XEV.state.infoOpen,
  aria: document.querySelector("#info-modal").getAttribute("aria-hidden"),
  class: document.querySelector("#info-modal").className,
  body: document.body.className,
}));
await page.screenshot({ path: "tools/shots/ui-desktop-info.png" });
await page.click("#close-info");
await page.waitForTimeout(500);
results.infoClosed = await page.evaluate(() => ({
  open: window.__XEV.state.infoOpen,
  aria: document.querySelector("#info-modal").getAttribute("aria-hidden"),
}));

// The real save path renders a full-resolution bloom frame and encodes a PNG;
// SwiftShader can lose its context doing that. Stub the encode and anchor
// activation here so the UI handler, filename link and toast are verifiable.
await page.evaluate(() => {
  window.__saveClicked = false;
  HTMLAnchorElement.prototype.click = function () {
    window.__saveClicked = true;
  };
  HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,";
  if (window.__XEV.composer) window.__XEV.composer.render = () => {};
});
await page.evaluate(() => {
  setTimeout(() => document.querySelector("#save-config")?.click(), 50);
});
await page.waitForFunction(
  () => /saved/i.test(document.querySelector("#toast")?.textContent ?? ""),
  { timeout: 30000 }
).catch(() => {});
results.save = await page.evaluate(() => ({
  toast: document.querySelector("#toast").textContent,
  clicked: window.__saveClicked,
}));

await desktop.context.close();

const mobile = await openPage({ width: 390, height: 844 }, true);
const mp = mobile.page;
await mp.screenshot({ path: "tools/shots/ui-mobile-hero.png" });
results.mobile = await mp.evaluate(() => ({
  width: window.innerWidth,
  ready: window.__XEV.ready,
  configOpen: window.__XEV.state.configOpen,
  panelRect: document.querySelector("#config-panel").getBoundingClientRect().toJSON(),
  fabVisible: getComputedStyle(document.querySelector("#open-config")).display,
}));
await mp.click("#open-config");
await mp.waitForTimeout(700);
results.mobileOpen = await mp.evaluate(() => ({
  configOpen: window.__XEV.state.configOpen,
  body: document.body.className,
  panelRect: document.querySelector("#config-panel").getBoundingClientRect().toJSON(),
  scrimHidden: document.querySelector("#panel-scrim").hidden,
}));
await mp.screenshot({ path: "tools/shots/ui-mobile-config.png" });
await mp.click('[data-paint="nebula-blue"]');
await mp.waitForTimeout(400);
results.mobilePaint = await mp.evaluate(() => ({
  state: window.__XEV.state.paint,
  label: document.querySelector("#paint-name").textContent,
}));
await mp.click("#close-config");
await mp.waitForTimeout(600);
results.mobileClosed = await mp.evaluate(() => ({
  configOpen: window.__XEV.state.configOpen,
  expanded: document.querySelector("#open-config").getAttribute("aria-expanded"),
}));
await mobile.context.close();

results.errors = errors;
console.log(JSON.stringify(results, null, 2));

await browser.close();
await server.close();

// Visual smoke test: captures the key screens into ../../.review/ (gitignored).
// Needs a running app (npm run dev, or npm run build && npx vite preview --port 5178).
// Usage: node scripts/shots.mjs [baseUrl]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:5178";
const out = new URL("../../.review/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const errors = [];
async function page(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  return p;
}
const shot = (p, name, full = false) => p.screenshot({ path: out + name, fullPage: full, timeout: 90000 });
const wait = (p, ms) => p.waitForTimeout(ms);

const pairs = await (await fetch(base + "/data/pairs.json")).json();
const projects = await (await fetch(base + "/data/projects.json")).json();
const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
const demo = pairs.find((p) => byId[p.a].name.includes("Jasper") && byId[p.b].name.toUpperCase().includes("MCINTOSH - PURRYSBURG"));

const d = await page(1440, 900);
await d.goto(base + "/");
await wait(d, 8000);
await shot(d, "01-dashboard.png");
await shot(d, "01b-dashboard-full.png", true);

await d.goto(base + "/#/?pair=" + encodeURIComponent(demo.id));
await d.reload();
await wait(d, 8000);
await shot(d, "02-demo-pair.png");
await d.locator('[aria-label="Selected pair timeline"]').scrollIntoViewIfNeeded();
await wait(d, 800);
await shot(d, "03-selected-cards.png");

await d.getByRole("button", { name: /View source/ }).click();
await wait(d, 1200);
await shot(d, "04-source-drawer.png");
await d.keyboard.press("Escape");
await d.getByRole("button", { name: /How this was calculated/ }).click();
await wait(d, 1200);
await shot(d, "05-method-drawer.png");
await d.keyboard.press("Escape");

await d.evaluate(() => document.querySelector("#root > div")?.scrollTo(0, 0));
await d.locator("select").nth(4).selectOption("projects");
await wait(d, 3000);
await shot(d, "06-all-projects.png");

await d.keyboard.press("Control+k");
await d.keyboard.type("230 kV in Savannah within 8 km built at the same time");
await wait(d, 800);
await shot(d, "07-request.png");
await d.keyboard.press("Escape");

await d.goto(base + "/#/brief/" + encodeURIComponent(demo.id));
await d.reload();
await wait(d, 2500);
await shot(d, "08-brief.png", true);

const m = await page(390, 844);
await m.goto(base + "/");
await wait(m, 8000);
await shot(m, "09-mobile.png", true);

await browser.close();
console.log(errors.length ? errors.join("\n") : "no page errors");

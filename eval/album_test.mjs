// Run with: node eval/album_test.mjs [screenshot-directory]
// Builds a photo album in every theme (with test images and awkward text: empty, very long, emoji, HTML),
// opens it in headless Chrome at phone sizes and pages through it with the keyboard. No AI calls.
// Checks: every page is exactly one screen, nothing spills off the page, paging lands on the right page,
// and the current page's photo and text have finished appearing.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const { buildAlbumHTML, THEMES } = await import(pathToFileURL(path.join(root, "mobile/src/album-template.js")));
const petSource = await readFile(path.join(root, "static/pet.js"), "utf8");
const screenshots = process.argv[2];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// 测试照片：横的、方的、竖的、很宽的
const photo = (w, h, hue) => "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue} 45% 55%)"/>` +
  `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="hsl(${hue + 40} 60% 75%)"/></svg>`);
const PAGES = [
  [photo(1600, 1100, 20), "晨光", "早上的光从窗边斜进来，把桌面切成两半，咖啡还冒着热气。"],
  [photo(1200, 1200, 80), "", ""],
  [photo(900, 1600, 140), "很长很长的一句标题超过十二个字", "这一段故意写得很长很长，".repeat(10)],
  [photo(1600, 900, 200), "猫", "它看了我一眼，又转回去晒太阳。"],
  [photo(1600, 500, 260), "窗外 🌧", "雨停了，路灯一盏一盏亮起来。<b>不是标签</b>"],
  [photo(1100, 1500, 320), "最后一张", "收工。"],
];
const html = (theme, seed) => buildAlbumHTML({
  title: "周末的光", subtitle: "六张小照片", opening: "这是一个慢慢的周末，我们走了很远的路。", closing: "下次再一起出门拍照吧。",
  date: "2026.10.19", species: "crab", petName: "Crabo", theme, seed,
  pages: PAGES.map(([img, line, text], i) => ({ img, line: line.slice(0, 12), text, whisper: "看这里", mood: ["warm", "calm", "lively", "wistful"][i % 4] })),
}, petSource);

const albums = new Map();
const server = createServer((req, res) => {
  const body = albums.get(new URL(req.url, "http://localhost").pathname.slice(1));
  if (!body) return res.writeHead(404).end();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const profile = await mkdtemp(path.join(tmpdir(), "phota-album-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--mute-audio",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
let socket, failures = 0;
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; }
    catch { await pause(100); }
  }
  assert.ok(port, "Chrome started");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(5000) })).json();
  socket = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data), entry = pending.get(msg.id);
    if (entry) { pending.delete(msg.id); msg.error ? entry.reject(msg.error) : entry.resolve(msg.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ": " + r.exceptionDetails.exception?.description);
    return r.result.value;
  };
  await send("Page.enable");
  if (screenshots) await mkdir(screenshots, { recursive: true });

  // 当前页的检查：返回发现的问题（空数组 = 没问题）
  const CHECK = `(() => {
    const t = document.getElementById("track"), book = t.classList.contains("book");
    const pages = [...t.children], probs = [];
    pages.forEach((p, i) => {
      const r = p.getBoundingClientRect();
      if (!book && (Math.abs(r.width - t.clientWidth) > 1 || Math.abs(r.height - t.clientHeight) > 1)) probs.push("page " + i + " is " + Math.round(r.width) + "x" + Math.round(r.height));
    });
    const on = pages.findIndex((p) => p.classList.contains("on"));
    const p = pages[on];
    if (!p) return { on, probs: ["no current page"] };
    const pr = p.getBoundingClientRect();
    if (!book && (Math.abs(pr.left) > 2 || Math.abs(pr.top) > 2)) probs.push("current page not aligned " + Math.round(pr.left) + "," + Math.round(pr.top));
    for (const e of p.querySelectorAll("figure, .words, .vline, h1, .sub, .open, .meta, .close, .brand, .credit")) {
      const r = e.getBoundingClientRect();
      if (!r.height) continue;
      if (r.top < pr.top - 1 || r.bottom > pr.bottom + 1 || r.left < pr.left - 1 || r.right > pr.right + 1)
        probs.push((e.className || e.tagName) + " spills off the page " + [r.left, r.top, r.right, r.bottom].map(Math.round));
    }
    const ph = p.querySelector(".ph");
    if (ph && +getComputedStyle(ph).opacity < 0.95) probs.push("photo still hidden");
    const fig = p.querySelector("figure");
    if (fig && fig.style.transform) probs.push("photo still moved: " + fig.style.transform);
    for (const e of p.querySelectorAll(".reveal")) if (+getComputedStyle(e).opacity < 0.95) probs.push("text still hidden: " + e.className);
    return { on, probs };
  })()`;

  const sizes = [[375, 812], [360, 640], [844, 390]];
  for (const [w, h] of sizes) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: true });
    for (const theme of Object.keys(THEMES)) {
      const name = `${theme}-${w}x${h}`;
      albums.set(name, html(theme, 3));
      await send("Page.navigate", { url: base + name });
      for (let i = 0; i < 100 && (await run("document.readyState")) !== "complete"; i++) await pause(50);
      await pause(2600);
      const n = await run("document.getElementById('track').children.length");
      for (let page = 0; page < n; page++) {
        if (page) {
          await run("dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })), 1");
          await pause(2600);                                           // 翻页 + 照片出场 + 文字浮现都要时间
        }
        const { on, probs } = await run(CHECK);
        if (on !== page) probs.unshift(`expected page ${page}, on page ${on}`);
        if (probs.length) { failures++; console.log(`FAIL ${name} page ${page}: ${probs.join("; ")}`); }
        if (screenshots && (probs.length || page === 3)) {
          const shot = await send("Page.captureScreenshot", { format: "png" });
          await writeFile(path.join(screenshots, `album-${name}-p${page}.png`), Buffer.from(shot.data, "base64"));
        }
      }
      console.log(`${name}: ${n} pages checked`);
    }
  }
  assert.equal(failures, 0, `${failures} album page(s) had problems`);
  console.log("PASS: every theme at 3 screen sizes — pages fit one screen, paging lands on the right page, photos and text appear.");
} finally {
  socket?.close();
  chrome.kill();
  server.close();
  await pause(300);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

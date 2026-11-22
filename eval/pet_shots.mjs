// 宠物动作截图：用无界面 Chrome 打开一个网址（默认 mobile/www/pet-grid.html，各动作并排），等几秒后截图
// Run: node eval/pet_shots.mjs <url> <out.png> [waitMs] [width] [height]
//   需要先有服务器在提供 mobile/www（比如 python -m http.server 5173 --directory mobile/www）
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const [url = "http://localhost:5173/pet-grid.html", out = "pet-shots.png", wait = "4000", width = "1600", height = "1000"] = process.argv.slice(2);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = await mkdtemp(path.join(tmpdir(), "phota-pet-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`, "about:blank",
], { windowsHide: true, stdio: "ignore" });
try {
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; } catch { await pause(100); }
  }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const socket = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => { const m = JSON.parse(data), e = pending.get(m.id); if (e) { pending.delete(m.id); m.error ? e.reject(m.error) : e.resolve(m.result); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  await send("Emulation.setDeviceMetricsOverride", { width: +width, height: +height, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  await pause(+wait);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(out, Buffer.from(shot.data, "base64"));
  console.log("saved", out);
  socket.close();
} finally { chrome.kill(); }

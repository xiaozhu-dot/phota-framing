// Run with: node eval/coach_direction_probe.mjs <folder of *_subjL / *_mid / *_subjR .jpg>
// 用真模型（经本机转发站 eval/model_proxy.py，密钥在 .env 里）检查取景指导的方向：
//   主体在左边的图 → 应该叫你手机往左移（或者直接拍）；主体在右边 → 往右；居中的 → 不该左右乱挪
// 同一份 ai.js / coach-logic.js，和 App 里跑的一模一样
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { coach } = await import("../mobile/src/ai.js");
const { decide } = await import("../mobile/src/coach-logic.js");

const dir = process.argv[2];
const s = { preset: "qianwen", baseUrl: "http://127.0.0.1:8787/v1", apiKey: "proxy", model: "qwen3.8-flash" };
const facts = { 画面亮度_百分比: 50, 曝光: "正常", 你最近说过的话: "这是第一次指导", 上次提示后画面: "—", 用户的长期习惯: "还不了解" };
const ok = { subjL: ["left", "shoot", "closer", "back", "raise", "lower", "wait"], subjR: ["right", "shoot", "closer", "back", "raise", "lower", "wait"], mid: ["shoot", "closer", "back", "raise", "lower", "wait"] };
let good = 0, total = 0, aiWrong = 0;
for (const f of (await readdir(dir)).filter((f) => /_(subjL|mid|subjR)\.jpg$/.test(f)).sort()) {
  const kind = f.match(/_(subjL|mid|subjR)\./)[1];
  const img = "data:image/jpeg;base64," + (await readFile(path.join(dir, f))).toString("base64");
  const t0 = Date.now();
  let r;
  try { r = await coach(s, img, facts); } catch (e) { console.log(`${f}: 出错 ${e.message}`); continue; }
  const d = decide(r);
  const pass = ok[kind].includes(d.move);
  // 模型自己说的方向（旧做法会直接用它）是不是反了
  const flipped = (kind === "subjL" && r.move === "right") || (kind === "subjR" && r.move === "left");
  total++; good += pass; aiWrong += flipped;
  console.log(`${pass ? "✓" : "✗"} ${f.padEnd(18)} 主体在 x=${r.subject_at?.x ?? "?"} → 目标 x=${r.target?.x ?? "?"} fix=${r.fix} 分=${r.score} | 程序：${d.move}「${d.hint}」 | 模型自己说 move=${r.move}「${r.hint}」${flipped ? " ← 说反了" : ""} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
console.log(`\n方向正确 ${good}/${total}；模型自己的 move 说反了 ${aiWrong} 次（程序换算后不受影响）`);

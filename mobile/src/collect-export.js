// 收集版：导出文件 = 一个 html
//   数据只存一份，放在 <script type="application/json" id="phota-data"> 里；
//   页面打开时由一小段脚本把数据画成卡片（图、AI 原话、回答）。电脑端合并脚本也只读这一块
import { QUESTIONS, STEP_MARKS } from "./collect-questions.js";

export const EXPORT_SCHEMA = "phota-collect-v2";
const KNOWN = ["phota-collect-v1", EXPORT_SCHEMA];   // v1：只有出片模式、只评最后一步

const U = (hex) => "\\" + "u" + hex;   // 反斜杠 + u + 四位码：JSON 转义，避免数据里的 < 和换行符号弄坏页面
const LS = new RegExp(String.fromCharCode(0x2028), "g"), PS = new RegExp(String.fromCharCode(0x2029), "g");
const json = (v) => JSON.stringify(v).replace(/</g, U("003c")).replace(LS, U("2028")).replace(PS, U("2029"));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function exportFileName(profile) {
  const nick = String(profile.nickname || "匿名").replace(/[^\p{L}\p{N}_-]/gu, "").slice(0, 12) || "匿名";
  return `phota-数据-${nick}-${String(profile.id).slice(0, 4)}.html`;
}

// 页面里的渲染脚本：只用到数据，不联网
function render() {
  const data = JSON.parse(document.getElementById("phota-data").textContent);
  const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const time = (t) => new Date(t).toLocaleString();
  const STATUS = { done: "已标注", skipped: "跳过（未标注）", pending: "待标注" };
  const main = document.getElementById("rounds");
  document.getElementById("sum").textContent =
    `${data.rater.nickname} · ${data.rounds.length} 个回合（已标注 ${data.rounds.filter((r) => r.status === "done").length}）· 导出于 ${time(data.exportedAt)}`;
  for (const r of [...data.rounds].reverse()) {
    const card = $("section", "card");
    card.append($("h2", "", `${time(r.startedAt)} · ${STATUS[r.status] || r.status} · 拍了 ${r.shotCount ?? r.shots.length} 张`));
    const SCENE = { portrait: "人像", street: "人文街拍", animal: "动物", landscape: "风景 / 其他" };
    const COMPARE = { after: "指导后更好", before: "指导前更好", same: "差不多", unsure: "说不清" };
    if (r.scene) card.append($("p", "muted", `场景：${SCENE[r.scene] || r.scene}${r.sceneFixed ? `（用户改成 ${SCENE[r.sceneFixed]}）` : ""}` +
      (r.compare ? ` · 盲选：${COMPARE[r.compare]}` : "") + (r.metrics?.toShotMs != null ? ` · 指导到快门 ${Math.round(r.metrics.toShotMs / 1000)} 秒` : "")));
    const pics = $("div", "pics");
    const first = r.before || r.steps.find((s) => s.frame)?.frame, best = r.shots.find((s) => s.thumb);
    for (const [src, cap] of [[first, "指导前"], [best?.thumb, "最满意的一张"]]) {
      if (!src) continue;
      const f = $("figure"); const im = $("img"); im.src = src; f.append(im, $("figcaption", "", cap)); pics.append(f);
    }
    if (!pics.children.length) pics.append($("p", "muted", "未附图"));
    card.append(pics);
    const ol = $("ol", "steps");
    r.steps.forEach((s, i) => {
      const mark = r.answers?.steps?.[i];
      ol.append($("li", s.error ? "err" : "", s.error ? `没有回应：${s.error}（${s.ms ?? "?"} ms）` : `${s.hint}（${s.status} · ${s.ms ?? "?"} ms）${mark ? " → " + mark : ""}`));
    });
    card.append($("h3", "", "AI 每一步说的话"), ol);
    if (r.answers) {
      const dl = $("dl");
      for (const q of data.questions) if (r.answers[q.key] != null && typeof r.answers[q.key] !== "object") dl.append($("dt", "", q.title), $("dd", "", r.answers[q.key]));
      card.append($("h3", "", "回答"), dl);
      if (r.comment) card.append($("blockquote", "", r.comment));
    }
    main.append(card);
  }
}

export function buildExportHtml({ profile, rounds, exportedAt = Date.now() }) {
  const data = { schema: EXPORT_SCHEMA, exportedAt, rater: { nickname: profile.nickname, id: profile.id },
                 questions: QUESTIONS.map(({ key, title, options }) => ({ key, title, options })), stepMarks: STEP_MARKS, rounds };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Phota 收集数据 · ${esc(profile.nickname)}</title><style>
body{max-width:760px;margin:auto;padding:16px;font:15px/1.6 system-ui,sans-serif;background:#151412;color:#eee7dc}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:0 0 8px;color:#efb95c}h3{font-size:13px;margin:12px 0 4px;color:#a59c90}
.card{border:1px solid #3d3832;padding:14px;margin:16px 0}.pics{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;display:block}
figcaption,.muted{font-size:12px;color:#a59c90}ol{margin:0;padding-left:20px}.err{color:#f4a391}
dl{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:0}dt{color:#a59c90}dd{margin:0}blockquote{margin:8px 0 0;padding-left:10px;border-left:2px solid #efb95c}
</style></head><body><h1>Phota 收集数据</h1><p class="muted" id="sum">需要允许脚本才能显示内容</p><main id="rounds"></main>
<script type="application/json" id="phota-data">${json(data)}</script>
<script>(${render.toString()})()</script></body></html>`;
}

export function parseExportHtml(html) {
  const m = html.match(/<script type="application\/json" id="phota-data">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("不是 Phota 收集版导出的文件");
  const data = JSON.parse(m[1]);
  if (!KNOWN.includes(data.schema)) throw new Error("导出文件版本不认识：" + data.schema);
  return data;
}

// 合并多个导出文件：同一回合（按编号）只留最后修改的那份
export function mergeExports(files) {
  const byId = new Map(), raters = new Map();
  let duplicates = 0;
  for (const f of files) {
    raters.set(f.rater.id, f.rater);
    for (const r of f.rounds) {
      const old = byId.get(r.id);
      if (old) duplicates++;
      if (!old || (r.updatedAt ?? 0) > (old.updatedAt ?? 0)) byId.set(r.id, r);
    }
  }
  return { schema: EXPORT_SCHEMA, raters: [...raters.values()], duplicates,
           rounds: [...byId.values()].sort((a, b) => a.startedAt - b.startedAt) };
}

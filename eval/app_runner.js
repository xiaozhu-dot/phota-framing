// 在浏览器里驱动真正的手机版 App 跑评估（配合 eval/model_proxy.py）
//
// 用法：用 bench 服务器打开 http://localhost:5174/mobile/www/index.html（设置里接口地址填 http://127.0.0.1:8787/v1），
// 在控制台里：
//   const R = await import("/eval/app_runner.js?t=" + Date.now());
//   R.runAll("app-qwen-deep", { mode: "deep" });            // 跑完自动存到 eval/results/app-qwen-deep.json
//   R.progress()                                            // 看进度
// 然后：python eval/score_app_run.py eval/results/app-qwen-deep.json
let PROXY = "http://127.0.0.1:8787";                        // 可以在 runAll 里换成别的转发站（同时跑两组实验时用）
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = { done: 0, total: 0, finished: false, results: [] };

export const useProxy = (url) => (PROXY = url);          // 单独调用 analyzeOne 前先指定转发站
export const results = () => state.results;             // 跑到一半也能取出已经完成的结果
export const progress = () => ({ done: state.done, total: state.total, finished: state.finished, errors: state.results.filter((r) => r.error).length });

// 分析一张照片（mode：deep 深度 / quick 快速），返回 App 界面上显示的结果
export async function analyzeOne(file, mode = "deep") {
  document.querySelector('.seg button[data-mode="photo"]').click();
  await sleep(800);
  const blob = await (await fetch("/eval/" + file)).blob();
  const dt = new DataTransfer();
  dt.items.add(new File([blob], file.split("/").pop(), { type: "image/jpeg" }));
  const input = $("file");
  input.files = dt.files;
  input.dispatchEvent(new Event("change"));
  await sleep(600);
  document.querySelector(`#modeSeg button[data-a="${mode}"]`).click();
  const u0 = await (await fetch(PROXY + "/usage")).json();
  const t0 = performance.now();
  $("analyzeBtn").click();
  await sleep(500);
  while (document.body.classList.contains("running")) await sleep(500);
  const u1 = await (await fetch(PROXY + "/usage")).json();
  return {
    file, mode, sec: Math.round((performance.now() - t0) / 1000), calls: u1.calls - u0.calls, tokens: u1.tokens - u0.tokens,
    status: $("st-review").textContent,
    log: [...document.querySelectorAll("#log .logrow")].map((r) => ({
      cls: r.className.includes("check") ? "check" : r.className.includes("final") ? "final" : "",
      tool: r.querySelector(".logtool")?.textContent, thought: r.querySelector(".logthought")?.textContent, note: r.querySelector(".lognote")?.textContent,
    })),
    score: document.querySelector("#review .score")?.firstChild?.textContent,
    sub: document.querySelector("#review .subscore")?.textContent || "",
    problems: [...document.querySelectorAll("#review .chip.bad")].map((c) => c.textContent),
    nitpicks: [...document.querySelectorAll("#review .chip.minor")].map((c) => c.textContent),
    summary: document.querySelector("#review .summary")?.textContent || "",
  };
}

// labels：哪本考题（labels.json 是调参用的；labels-holdout.json 是最后才用的新题）
export async function runAll(name, { mode = "deep", labels = "labels.json", proxy } = {}) {
  if (proxy) PROXY = proxy;
  const all = await (await fetch("/eval/" + labels)).json();
  const variants = all.filter((l) => l.defect !== "none");
  const bases = [...new Set(variants.map((v) => v.base))];
  const list = [...variants, ...all.filter((l) => l.defect === "none" && bases.includes(l.base))];
  Object.assign(state, { done: 0, total: list.length, finished: false, results: [] });
  for (const lb of list) {
    try { state.results.push({ ...lb, ...(await analyzeOne(lb.file, mode)) }); }
    catch (e) { state.results.push({ ...lb, error: String(e) }); }
    state.done++;
  }
  await fetch(`${PROXY}/save/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(state.results) });
  state.finished = true;
  return progress();
}

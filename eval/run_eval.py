"""评估：用 28 张标准答案已知的照片，给现在的分析流程打分

运行：python eval/run_eval.py            （在项目根目录运行）
结果：eval/results/<时间>.json（每次调用的原始记录）+ <时间>.md（报告）

测这几件事：
  1. 格式稳定性：AI 有没有按格式返回 JSON
  2. 发现问题：故意拍歪 / 拍暗 / 过曝 / 切掉主体的照片，AI 有没有说出来
  3. 评分合理：原图的分数是否高于它被拍坏的版本
  4. 一致性：同一张原图点评两次，分数差多少
  5. 测量工具：水平仪测出的角度和真实角度差多少（不花 token）
  6. 速度和 token
"""
import json
import re
import statistics
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))                         # 让下面能 import 项目里的模块

import io, contextlib                                        # noqa: E402
with contextlib.redirect_stdout(io.StringIO()):              # 屏蔽导入时的打印
    from m1_analyze import client, MODEL                      # noqa: E402
    import web_agent                                          # noqa: E402
from m3_agent import get_exposure_stats, load_image, measure_horizon_tilt  # noqa: E402

WORKERS = 4                                                   # 同时发几个请求


# 记录每个线程里 AI 调用的 token 和原始回答（不改动 web_agent 本身，只是"偷听"它发出的请求）
_local = threading.local()
_create = client.chat.completions.create


def _spy(*args, **kwargs):
    r = _create(*args, **kwargs)
    _local.calls.append({"tokens": r.usage.total_tokens if r.usage else 0,
                         "finish": r.choices[0].finish_reason,
                         "raw": (r.choices[0].message.content or "")[:300]})
    return r


client.chat.completions.create = _spy


def call(kind, prompt, image_url, facts):
    """直接调用线上用的 web_agent.ask_json（含自动重试），额外记录耗时、token、重试次数"""
    t0 = time.time()
    _local.calls = []
    rec = {"kind": kind}
    try:
        rec["data"] = web_agent.ask_json(prompt, image_url, facts)
        rec["status"] = "ok"
    except web_agent.FormatError as e:
        rec.update(status="format_error", error=str(e)[:120])
    except Exception as e:
        rec.update(status="api_error", error=f"{type(e).__name__}: {e}"[:200])
    rec["seconds"] = round(time.time() - t0, 1)
    rec["tokens"] = sum(c["tokens"] for c in _local.calls)
    rec["attempts"] = len(_local.calls)
    if _local.calls:
        rec["raw"], rec["finish"] = _local.calls[-1]["raw"], _local.calls[-1]["finish"]
    return rec


NEGATION = re.compile(r"(无|没有|没|不|未|并不|并无)[^，。；,;]{0,2}$")


def mentions(text, words):
    """文字里有没有"肯定地"提到这些词（"没有倾斜""不歪"这种否定说法不算）"""
    for w in words:
        for m in re.finditer(re.escape(w), text):
            if not NEGATION.search(text[max(0, m.start() - 4):m.start()]):
                return True
    return False


def to_data_url(path):
    """和 compress_to_data_url 一样的压缩，只是不打印（多线程里屏蔽打印会把别的线程的输出也吞掉）"""
    import base64
    buf = io.BytesIO()
    load_image(str(path)).save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


def evaluate(label):
    path = ROOT / label["file"]
    image_url = to_data_url(path)
    exposure = get_exposure_stats(str(path))
    horizon = measure_horizon_tilt(str(path))
    facts = "程序精确测得的数据：" + json.dumps({"exposure": exposure, "horizon": horizon}, ensure_ascii=False)
    out = {**label, "exposure": exposure, "horizon": horizon,
           "review": call("review", web_agent.REVIEW_PROMPT, image_url, facts),
           "suggest": call("suggest", web_agent.SUGGEST_PROMPT, image_url, facts)}
    if label["defect"] == "none":                               # 原图再点评一次，看分数稳不稳
        out["review2"] = call("review", web_agent.REVIEW_PROMPT, image_url, facts)
    print(f"  {label['file']:42} {out['review']['status']:13} {out['suggest']['status']:13}", flush=True)
    return out


def all_text(r):
    """把点评和建议里的文字拼起来，用来找关键词"""
    parts = []
    d = r["review"].get("data") or {}
    parts += [str(d.get("summary", ""))] + [str(x) for x in d.get("problems", []) or []]
    s = r["suggest"].get("data") or {}
    for t in s.get("suggestions", []) or []:
        if isinstance(t, dict):
            parts += [str(t.get("action", "")), str(t.get("why", ""))]
    return " ".join(parts)


def score_of(rec):
    try:
        return int((rec.get("data") or {}).get("score"))
    except (TypeError, ValueError):
        return None


def pct(a, b):
    return f"{a}/{b}（{a / b:.0%}）" if b else "—"


def report(results, started, elapsed):
    calls = [r[k] for r in results for k in ("review", "suggest", "review2") if k in r]
    ok = sum(c["status"] == "ok" for c in calls)
    fmt = [c for c in calls if c["status"] == "format_error"]
    api = [c for c in calls if c["status"] == "api_error"]
    secs = [c["seconds"] for c in calls if c["status"] != "api_error"]
    toks = [c["tokens"] for c in calls if c.get("tokens")]

    lines = [f"# 评估报告 · {started}", "",
             f"- 模型：`{MODEL}`",
             f"- 照片：{len(results)} 张（{sum(r['defect'] == 'none' for r in results)} 张原图 + "
             f"{sum(r['defect'] != 'none' for r in results)} 张加工图），共调用 AI {len(calls)} 次，总用时 {elapsed:.0f} 秒", ""]

    # 1. 格式
    retried = sum(c.get("attempts", 1) > 1 for c in calls)
    lines += ["## 1. 格式稳定性", "",
              f"- 成功解析：**{pct(ok, len(calls))}**（其中 {retried} 次是自动重试后才成功或失败的）",
              f"- 格式错误：{len(fmt)} 次 · 接口错误：{len(api)} 次"]
    for c in fmt[:5]:
        lines.append(f"  - 格式错误（finish={c.get('finish')}）开头：`{c.get('raw', '')[:60].replace(chr(10), ' ')}`")
    for c in api[:3]:
        lines.append(f"  - 接口错误：{c['error'][:100]}")
    lines.append("")

    # 2. 发现问题
    lines += ["## 2. 能不能说出照片的毛病", "", "| 毛病 | 说中 | 没说中的照片 |", "|---|---|---|"]
    for defect, name in [("tilt", "歪了"), ("dark", "太暗"), ("bright", "过曝"), ("cut", "主体被切/挤边")]:
        group = [r for r in results if r["defect"] == defect and r["review"]["status"] == "ok"]
        hit = [r for r in group if mentions(all_text(r), [k for k in r["keywords"] if k != "水平"])]
        miss = ", ".join(Path(r["file"]).stem for r in group if r not in hit) or "—"
        lines.append(f"| {name} | {pct(len(hit), len(group))} | {miss} |")
    # 原图被误报的情况（比如好好的照片也说歪了）
    originals = [r for r in results if r["defect"] == "none" and r["review"]["status"] == "ok"]
    false_tilt = [Path(r["file"]).stem for r in originals if mentions(all_text(r), ["歪", "倾斜", "不平"])]
    lines += ["", f"- 原图里被说成\"歪了/倾斜\"的：{len(false_tilt)} 张 {('（' + ', '.join(false_tilt) + '）') if false_tilt else ''}", ""]

    # 3. 评分
    by_base = {r["base"]: r for r in results if r["defect"] == "none"}
    pairs = []
    for r in results:
        if r["defect"] != "none" and r["base"] in by_base:
            a, b = score_of(by_base[r["base"]]["review"]), score_of(r["review"])
            if a is not None and b is not None:
                pairs.append((Path(r["file"]).stem, a, b))
    good = sum(a > b for _, a, b in pairs)
    lines += ["## 3. 评分合理性（原图应该比拍坏的版本分高）", "",
              f"- 原图分数更高：**{pct(good, len(pairs))}**",
              f"- 原图平均分：{statistics.mean([a for _, a, _ in pairs]):.1f} · 拍坏版本平均分：{statistics.mean([b for _, _, b in pairs]):.1f}" if pairs else "",
              "", "| 加工图 | 原图分 | 加工图分 |", "|---|---|---|"]
    lines += [f"| {n} | {a} | {b}{' ⚠️' if b >= a else ''} |" for n, a, b in pairs]
    lines.append("")

    # 4. 一致性
    diffs = []
    for r in results:
        if "review2" in r:
            a, b = score_of(r["review"]), score_of(r["review2"])
            if a is not None and b is not None:
                diffs.append(abs(a - b))
    lines += ["## 4. 一致性（同一张原图点评两次）", ""]
    if diffs:
        lines += [f"- 分数完全一样：{pct(sum(d == 0 for d in diffs), len(diffs))}",
                  f"- 平均相差：{statistics.mean(diffs):.2f} 分 · 最大相差：{max(diffs)} 分", ""]

    # 5. 测量工具
    lines += ["## 5. 水平仪工具（不花 token）", "", "| 照片 | 真实倾斜 | 测出来 |", "|---|---|---|"]
    for r in results:
        if r["defect"] == "tilt":
            h = r["horizon"]
            lines.append(f"| {Path(r['file']).stem} | {r['tilt']}° | {str(h.get('倾斜角度')) + '°' if h.get('找到水平线') else '没找到'} |")
    lines.append("")

    # 6. 速度和 token
    lines += ["## 6. 速度和 token", ""]
    if secs:
        lines.append(f"- 每次调用：平均 {statistics.mean(secs):.1f} 秒，最慢 {max(secs):.1f} 秒")
    if toks:
        lines.append(f"- 每次调用：平均 {statistics.mean(toks):.0f} token，本轮合计 {sum(toks)} token")
    return "\n".join(lines) + "\n"


def main():
    # python eval/run_eval.py --report eval/results/xxx.json  →  不调用 AI，只用新的统计方法重新出报告
    if len(sys.argv) == 3 and sys.argv[1] == "--report":
        results = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
        print(report(results, Path(sys.argv[2]).stem + "（重新统计）", 0))
        return
    labels = json.loads((ROOT / "labels.json").read_text(encoding="utf-8"))
    started = datetime.now().strftime("%Y-%m-%d %H:%M")
    print(f"模型 {MODEL} · {len(labels)} 张照片 · 同时 {WORKERS} 个请求\n")
    t0 = time.time()
    with ThreadPoolExecutor(WORKERS) as pool:
        results = list(pool.map(evaluate, labels))
    elapsed = time.time() - t0

    out = ROOT / "results"
    out.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    (out / f"{stamp}.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    text = report(results, started, elapsed)
    (out / f"{stamp}.md").write_text(text, encoding="utf-8")
    print("\n" + text)
    print(f"报告已保存：eval/results/{stamp}.md")


if __name__ == "__main__":
    main()

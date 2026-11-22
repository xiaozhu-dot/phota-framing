"""给"手机版 App 的深度分析"跑出来的结果打分（结果由浏览器里的 App + eval/model_proxy.py 跑出来）

运行：python eval/score_app_run.py eval/results/app-XXXX.json
和 run_eval.py 用同样的判断标准（同样的关键词、同样的否定词处理），这样能和之前几轮对比
多出来的一项：自检（agent 下结论后，程序核对测量数据）触发了几次、触发后有没有改对
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from run_eval import mentions  # noqa: E402

TILT_WORDS = ["歪", "倾斜", "不平"]
# "说中歪斜"的另一些说法：模型常写"左高右低""需要校平"，labels.json 里的关键词没覆盖到
EXTRA = {"tilt": ["左高右低", "右高左低", "校平", "扶正", "右倾", "左倾"], "cut": ["贴边", "贴左", "贴右", "贴着"]}


def main(path):
    rows = json.loads(Path(path).read_text(encoding="utf-8"))
    ok = [r for r in rows if not r.get("error") and r.get("score")]
    out = [f"# 手机版深度分析（agent + 自检）评估 · {Path(path).stem}", "",
           f"- 照片：{len(rows)} 张，成功 {len(ok)} 张，失败 {len(rows) - len(ok)} 张",
           f"- 合计：{sum(r.get('calls', 0) for r in rows)} 次 AI 调用 · {sum(r.get('tokens', 0) for r in rows)} token · "
           f"平均每张 {sum(r.get('tokens', 0) for r in ok) // max(1, len(ok))} token、{sum(r.get('sec', 0) for r in ok) / max(1, len(ok)):.0f} 秒、"
           f"{sum(len(r['log']) for r in ok) / max(1, len(ok)):.1f} 步", ""]

    # 1. 说没说中问题
    # "说中"：总评、明显问题、小瑕疵里任何地方提到都算；"算作明显问题"：写进了 problems（只有这样才会扣分）
    out += ["## 1. 能不能说出照片的毛病", "", "| 毛病 | 说中 | 算作明显问题 | 没说中的照片 |", "|---|---|---|---|"]
    for defect, name in [("tilt", "歪了"), ("dark", "太暗"), ("bright", "过曝"), ("cut", "主体被切/挤边")]:
        items = [{**r, "keywords": r["keywords"] + EXTRA.get(defect, [])} for r in ok if r["defect"] == defect]
        text = lambda r: "；".join(r["problems"] + r.get("nitpicks", [])) + r["summary"]  # noqa: E731
        miss = [Path(r["file"]).stem for r in items if not mentions(text(r), r["keywords"])]
        hard = [r for r in items if mentions("；".join(r["problems"]), r["keywords"])]
        out.append(f"| {name} | {len(items) - len(miss)}/{len(items)} | {len(hard)}/{len(items)} | {'、'.join(miss) or '—'} |")
    false_tilt = [Path(r["file"]).stem for r in ok if r["defect"] == "none" and mentions("；".join(r["problems"]), TILT_WORDS)]
    out += ["", f"- 原图里被说成\"歪了\"的：{len(false_tilt)} 张 {'、'.join(false_tilt)}", ""]

    # 2. 评分区分度
    by = {(r["base"], r["defect"]): r for r in ok}
    pairs = [(by.get((r["base"], "none")), r) for r in ok if r["defect"] != "none"]
    pairs = [(a, b) for a, b in pairs if a]
    win = sum(int(a["score"]) > int(b["score"]) for a, b in pairs)
    out += ["## 2. 评分合理性（原图应该比拍坏的版本分高）", "",
            f"- 原图分数更高：**{win}/{len(pairs)}（{win * 100 // max(1, len(pairs))}%）**",
            f"- 原图平均分：{sum(int(a['score']) for a, _ in pairs) / max(1, len(pairs)):.1f} · "
            f"拍坏版本平均分：{sum(int(b['score']) for _, b in pairs) / max(1, len(pairs)):.1f}", "",
            "| 加工图 | 原图分 | 加工图分 |", "|---|---|---|"]
    for a, b in pairs:
        out.append(f"| {Path(b['file']).stem} | {a['score']} | {b['score']}{' ⚠️' if int(a['score']) <= int(b['score']) else ''} |")

    # 3. 自检
    checked = [r for r in ok if any(s["cls"] == "check" for s in r["log"])]
    out += ["", "## 3. 自检（结论和测量数据对不上时，让它再想一次）", "",
            f"- 触发：{len(checked)}/{len(ok)} 张", ""]
    for r in checked:
        chk = next(s for s in r["log"] if s["cls"] == "check")
        fin = next((s for s in r["log"] if s["cls"] == "final"), {})
        out.append(f"- **{Path(r['file']).stem}**：{chk['note']}\n  → 修正后：{r['score']} 分 · {r['summary']} · {fin.get('note', '')}")

    # 4. 工具使用
    tools = {}
    for r in ok:
        for s in r["log"]:
            tools[s["tool"]] = tools.get(s["tool"], 0) + 1
    out += ["", "## 4. 工具使用次数", "", " · ".join(f"{k} {v}" for k, v in sorted(tools.items(), key=lambda x: -x[1]))]

    report = Path(path).with_suffix(".md")
    report.write_text("\n".join(out) + "\n", encoding="utf-8")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1])

"""只测水平仪工具（不调用 AI，不花 token，可以随便反复跑）

运行：python eval/eval_horizon.py
判定：
  拍歪的图：测出来和真实角度相差 ≤ 1° 算对；说"没把握"算弃权；其他算错
  原图：说"没找到 / 没把握"或者 |角度| ≤ 1° 算对（原图本来就是正的）；否则算误报
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from m3_agent import measure_horizon_tilt  # noqa: E402

labels = json.loads((ROOT / "labels.json").read_text(encoding="utf-8"))
rows, right, wrong, abstain = [], 0, 0, 0
for lb in labels:
    if lb["defect"] not in ("tilt", "none"):
        continue
    h = measure_horizon_tilt(str(ROOT / lb["file"]))
    found = h.get("找到水平线")
    got = h.get("倾斜角度")
    truth = lb.get("tilt", 0)
    if not found:
        verdict = "✅ 没找到" if lb["defect"] == "none" else "➖ 弃权"
    elif abs(got - truth) <= 1:
        verdict = "✅"
    else:
        verdict = "❌"
    right += verdict.startswith("✅")
    wrong += verdict.startswith("❌")
    abstain += verdict.startswith("➖")
    rows.append(f"{Path(lb['file']).stem:22} 真实 {truth:+d}°   测得 {('%+.1f°' % got) if found else '—':>7}   {h.get('依据', ''):24} {verdict}")

print("\n".join(rows))
print(f"\n正确 {right} · 错误 {wrong} · 弃权 {abstain}  （共 {len(rows)} 张）")

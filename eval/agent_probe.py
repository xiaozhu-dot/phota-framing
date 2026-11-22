"""探测：真实模型能不能按 agent 协议一步步走（复现手机版 mobile/src/agent.js 的循环）

运行：python eval/agent_probe.py
看什么：每一步调了什么工具、有没有乱格式、有没有在试过裁剪之后才下结论、用了多少步和 token

提示词和手机版 agent.js 保持一致（这里是一份拷贝，改动时两边一起改）
"""
import base64
import io
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from PIL import Image  # noqa: E402

import web_agent  # noqa: E402
from m1_analyze import MODEL, client  # noqa: E402
from m3_agent import get_exposure_stats, load_image, measure_horizon_tilt  # noqa: E402

HABITS = ["水平", "曝光", "主体位置", "主体大小", "背景杂乱", "裁切", "清晰度", "光线", "构图平衡"]
MAX_STEPS = 6
PROMPT = f"""你是一位摄影指导 agent。你不急着下结论：先用工具仔细检查照片，确认之后再给建议。

每一步只输出一个 JSON 对象，二选一：
① 调用工具：{{"thought": "为什么做这一步，不超过 25 字", "tool": "工具名", "args": {{...}}}}
② 给出结论：{{"thought": "不超过 25 字", "final": {{...}}}}

可用工具：
- measure：精确测量曝光、清晰度、水平倾斜（有陀螺仪数据时用陀螺仪）。args 填 {{}}
- zoom_in：从原图（全分辨率）里取出一块区域放大给你看。用来检查主体是否清晰、边缘有没有杂物、细节怎么样。
  args: {{"left": 0~1, "top": 0~1, "right": 0~1, "bottom": 0~1}}（相对照片宽高的比例）
- try_crop：按你给的范围裁剪，把裁好的图给你看，用来检验裁剪方案。args 同上，再加 "reason"

规则：
- 第一步先 measure。
- 如果打算建议裁剪，必须先用 try_crop 看过效果；不满意就调整范围再试。最终的 crop 必须是你试过并满意的那个。
- measure 的数据是程序测的，比你目测准，可以直接引用。但要注意：
  · 水平"把握：中"说明只找到一种证据，可能被树枝、斜坡骗了，要用 zoom_in 看看那条线是不是真的该水平
  · 水平"没测出来"时，自己看画面判断，看不出明显倾斜就不要说它歪
  · 清晰度"有点糊 / 模糊"时，用 zoom_in 看看主体本身糊不糊（只是背景虚化不算问题）
  · 曝光"过曝"如果是白色背景 / 有意的高调风格，可以不算问题
- 最多 {MAX_STEPS} 步，快到上限时直接给结论。
- 只描述照片里真实存在的东西；用中文；不要输出 JSON 以外的任何文字。

final 的格式：
{{
  "title": "4~8 字的标题",
  "summary": "一句话总评，不超过 30 字",
  "highlights": ["亮点，每条不超过 12 字，2~3 条"],
  "problems": ["问题，每条不超过 12 字，1~3 条；真的没有明显问题可以为空"],
  "score": 1~10 的整数,
  "suggestions": [{{"action": "不超过 10 字的具体动作", "why": "不超过 35 字"}}],
  "crop": {{"left": 0~1, "top": 0~1, "right": 0~1, "bottom": 0~1, "reason": "不超过 25 字"}} 或 null,
  "habits": ["这张照片暴露的问题类别，从 {"、".join(HABITS)} 里选 0~2 个"]
}}
suggestions 正好 3 条。
评分标准：9～10 出色；7～8 不错，只有一两处小问题；5～6 有明显问题（明显歪斜、曝光明显不当、主体被切或挤在边缘）；
3～4 多处明显问题；1～2 基本失败。每个明显问题至少扣 1 分。"""


def data_url(img, side=768):
    img = img.copy()
    img.thumbnail((side, side))
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def user(images, text):
    return {"role": "user", "content": [{"type": "image_url", "image_url": {"url": u}} for u in images] + [{"type": "text", "text": text}]}


def crop(img, a):
    try:
        l, t, r, b = (min(1, max(0, float(a[k]))) for k in ("left", "top", "right", "bottom"))
    except (KeyError, TypeError, ValueError):
        return None
    if r - l < 0.08 or b - t < 0.08:
        return None
    w, h = img.size
    return img.crop((int(l * w), int(t * h), int(r * w), int(b * h)))


def compact(messages):
    idx = [i for i, m in enumerate(messages) if i > 1 and isinstance(m["content"], list) and any(c["type"] == "image_url" for c in m["content"])]
    drop = set(idx[:-2])
    return [{**m, "content": [c for c in m["content"] if c["type"] != "image_url"] + [{"type": "text", "text": "（这一步的图片已省略）"}]} if i in drop else m
            for i, m in enumerate(messages)]


def run(path):
    img = load_image(str(path))
    messages = [{"role": "system", "content": PROMPT}, user([data_url(img)], "请仔细分析这张照片。")]
    tokens, tools_used = 0, []
    for step in range(1, MAX_STEPS + 1):
        if step == MAX_STEPS:
            messages.append({"role": "user", "content": "这是最后一步了，请直接给出 final。"})
        r = client.chat.completions.create(model=MODEL, max_tokens=3000, messages=compact(messages),
                                           response_format={"type": "json_object"})
        tokens += r.usage.total_tokens if r.usage else 0
        data = web_agent.parse_json(r.choices[0].message.content or "")
        messages.append({"role": "assistant", "content": json.dumps(data, ensure_ascii=False)})
        if "final" in data:
            f = data["final"]
            print(f"   {step}. 结论：{f.get('score')} 分 · {f.get('summary')} · crop={f.get('crop')} · habits={f.get('habits')}")
            return {"steps": step, "tokens": tokens, "tools": tools_used, "final": f}
        tool, args = data.get("tool"), data.get("args") or {}
        tools_used.append(tool)
        images, text = [], ""
        if tool == "measure":
            text = json.dumps({"exposure": get_exposure_stats(str(path)), "horizon": measure_horizon_tilt(str(path))}, ensure_ascii=False)
        elif tool in ("zoom_in", "try_crop"):
            c = crop(Image.open(path).convert("RGB") if tool == "zoom_in" else img, args)   # 放大细看用原图
            if c:
                images = [data_url(c, 512)]
                text = "这是放大后的区域。" if tool == "zoom_in" else "这是裁好的样子。它达到你想要的效果了吗？"
            else:
                text = "这个范围不合理，请换一个。"
        else:
            text = f"没有叫 {tool} 的工具。"
        print(f"   {step}. {tool:9} {json.dumps(args, ensure_ascii=False)[:70]:72} | {data.get('thought', '')}")
        messages.append(user(images, f"【工具结果 · {tool}】{text}"))
    return {"steps": MAX_STEPS, "tokens": tokens, "tools": tools_used, "final": None}


if __name__ == "__main__":
    for name in ["variants/cut_animal_1", "variants/tilt_seascape_1", "food_2"]:
        print(f"\n== {name} ==")
        t0 = time.time()
        res = run(ROOT / "photos" / f"{name}.jpg")
        crops = res["tools"].count("try_crop")
        print(f"   → {res['steps']} 步 · {res['tokens']} token · {time.time() - t0:.0f} 秒 · "
              f"试裁剪 {crops} 次 · 最终给了裁剪：{bool(res['final'] and res['final'].get('crop'))}")

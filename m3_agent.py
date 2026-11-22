import base64
import io
import json
import os
import sys

import cv2
import numpy as np
from openai import APIError
from PIL import Image, ImageOps

from m1_analyze import client, MODEL
from m2_crop import draw_result


# ========== 第 0 部分：图片预处理 ==========

def load_image(path: str) -> Image.Image:
    """读取图片，修正方向，缩小到 1000 像素以内（加快计算）"""
    img = ImageOps.exif_transpose(Image.open(path))
    img.thumbnail((1000, 1000))
    return img.convert("RGB")


def compress_to_data_url(path: str) -> str:
    """压缩后再上传：更快、更省钱，而且 AI 看到的方向和我们画框时一致"""
    buf = io.BytesIO()
    load_image(path).save(buf, format="JPEG", quality=85)
    before_kb = os.path.getsize(path) / 1024
    after_kb = buf.tell() / 1024
    print(f"📦 图片压缩：{before_kb:.0f} KB → {after_kb:.0f} KB")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


# ========== 第 1 部分：工具函数（AI 的"测光表"、"水平仪"和"裁剪刀"）==========

def get_exposure_stats(image_path: str) -> dict:
    """统计亮度：整体多亮、多少像素过曝（死白）、多少欠曝（死黑）"""
    gray = np.array(load_image(image_path).convert("L"))   # 转成灰度，每个像素 0~255
    return {
        "平均亮度_百分比": round(float(gray.mean()) / 255 * 100, 1),
        "过曝像素_百分比": round(float((gray >= 250).mean()) * 100, 1),
        "欠曝像素_百分比": round(float((gray <= 5).mean()) * 100, 1),
    }


def measure_horizon_tilt(image_path: str) -> dict:
    """找画面里"长而一致"的横线（地平线、海平面、长屋檐），按长度投票算出倾斜角度。
    没有可靠的长横线时，老实返回"没找到"，而不是硬给一个数（第一轮评估里，硬给的数把 AI 带偏了）"""
    gray = np.array(load_image(image_path).convert("L"))
    h, w = gray.shape
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 40, 120)

    def find_lines(min_len):
        found = cv2.HoughLinesP(edges, 1, np.pi / 720, threshold=60, minLineLength=int(min_len), maxLineGap=int(w * 0.015))
        return [] if found is None else found.reshape(-1, 4)   # reshape 兼容 OpenCV 4 和 5

    # 把每条线换算成"画面倾斜了多少度"：横线看它和水平差多少，竖线看它和垂直差多少
    horiz, vert = [], []
    for x1, y1, x2, y2 in find_lines(w * 0.25):                 # 横线：至少四分之一个画面宽
        a = float(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
        if abs(a) <= 12:
            horiz.append((a, float(np.hypot(x2 - x1, y2 - y1))))
    for x1, y1, x2, y2 in find_lines(h * 0.25):                 # 竖线：至少四分之一个画面高
        if y2 < y1:
            x1, y1, x2, y2 = x2, y2, x1, y1                    # 统一成从上往下
        t = float(np.degrees(np.arctan2(-(x2 - x1), y2 - y1)))
        if abs(t) <= 12 and 0.25 <= (x1 + x2) / 2 / w <= 0.75:  # 竖线只看画面中间，两边透视变形大
            vert.append((t, float(np.hypot(x2 - x1, y2 - y1))))

    h_est = _vote(horiz, w)
    v_est = _vote(vert, h)

    if h_est and v_est:
        if abs(h_est["tilt"] - v_est["tilt"]) > 1.5:
            return {"找到水平线": False, "依据": "横线和竖线给出的角度对不上"}
        tilt = (h_est["tilt"] * h_est["support"] + v_est["tilt"] * v_est["support"]) / (h_est["support"] + v_est["support"])
        basis, sure = f"横线和竖线一致（{h_est['n']}+{v_est['n']} 条）", "高"
    elif h_est or v_est:
        e = h_est or v_est
        tilt = e["tilt"]
        basis = f"{e['n']} 条长{'横' if h_est else '竖'}线，{e['agree']:.0%} 方向一致"
        sure = "高" if e["support"] >= 1.8 and e["agree"] >= 0.7 else "中"
    else:
        return {"找到水平线": False, "依据": "没有可靠的长横线或竖线"}

    return {
        "找到水平线": True,
        "倾斜角度": round(tilt, 1),
        "把握": sure,
        "依据": basis,
        "说明": "正数表示画面向右下倾斜（需逆时针旋转纠正），负数相反",
    }


def _vote(segs, span):
    """按长度投票：0.25° 一格，相邻 ±1° 一起算，找票数最多的角度。
    不可靠（线太短、太少、方向不一致）就返回 None —— 宁可不说，也不说错"""
    if not segs:
        return None
    angles = np.array([a for a, _ in segs])
    lengths = np.array([l for _, l in segs])
    grid = np.arange(-12, 12.01, 0.25)
    votes = np.array([lengths[np.abs(angles - g) <= 1].sum() for g in grid])
    near = np.abs(angles - grid[votes.argmax()]) <= 1
    support = lengths[near].sum() / span                   # 支持这个角度的线，总长相当于几个画面宽（高）
    agree = lengths[near].sum() / lengths.sum()            # 有多少比例的线同意这个角度
    if support < 0.9 or lengths[near].max() / span < 0.35 or agree < 0.5:
        return None
    return {"tilt": float(np.average(angles[near], weights=lengths[near])),
            "support": support, "agree": agree, "n": int(near.sum())}


def propose_crop(image_path: str, left, top, right, bottom, reason: str = "") -> dict:
    """AI 给出裁剪方案，我们检查是否合理，合理就画到 result.jpg 上"""
    left, top, right, bottom = float(left), float(top), float(right), float(bottom)

    # 检查不合理的情况：直接 raise 报错，错误信息会被转告给 AI，让它修正后重试
    for v in (left, top, right, bottom):
        if not 0 <= v <= 1:
            raise ValueError("坐标必须在 0 到 1 之间")
    if left >= right or top >= bottom:
        raise ValueError("left 必须小于 right，top 必须小于 bottom")
    kept = (right - left) * (bottom - top)
    if kept < 0.3:
        raise ValueError(f"裁剪后只保留了 {kept:.0%} 的画面，裁得太多了，请保留至少 30%")

    crop = {"left": left, "top": top, "right": right, "bottom": bottom}
    draw_result(image_path, {"crop": crop}, "result.jpg")
    return {"已保存": "result.jpg", "保留画面": f"{kept:.0%}"}


# ========== 第 2 部分：工具说明书（告诉 AI 有哪些工具可用）==========

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_exposure_stats",
            "description": "精确测量照片的曝光情况，返回平均亮度、过曝和欠曝像素比例。当你怀疑照片太亮、太暗或天空过曝时使用。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "measure_horizon_tilt",
            "description": "测量照片中水平线（如地平线、海平面、路沿）的倾斜角度。当照片中有明显水平线时使用。注意：结果是对画面中所有接近水平线条的统计，可能受阴影、透视影响。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_crop",
            "description": "给出二次裁剪建议，程序会在照片上画出三分线和红色裁剪框，保存为 result.jpg 给用户看。坐标用 0 到 1 的比例表示。",
            "parameters": {
                "type": "object",
                "properties": {
                    "left": {"type": "number", "description": "裁剪框左边，距离图片左边缘的比例（0~1）"},
                    "top": {"type": "number", "description": "裁剪框上边，距离图片上边缘的比例（0~1）"},
                    "right": {"type": "number", "description": "裁剪框右边，距离图片左边缘的比例（0~1）"},
                    "bottom": {"type": "number", "description": "裁剪框下边，距离图片上边缘的比例（0~1）"},
                    "reason": {"type": "string", "description": "为什么这样裁"},
                },
                "required": ["left", "top", "right", "bottom"],
            },
        },
    },
]

# 工具名字 → 真正要执行的 Python 函数
TOOL_FUNCTIONS = {
    "get_exposure_stats": get_exposure_stats,
    "measure_horizon_tilt": measure_horizon_tilt,
    "propose_crop": propose_crop,
}


# ========== 第 3 部分：系统提示词 ==========

SYSTEM_PROMPT = """你是一位专业摄影指导。你可以使用工具来精确测量照片的属性。

工作方式：
1. 先观察照片，判断需要测量什么
2. 需要精确数据时调用工具，不要凭感觉猜测角度和曝光
3. 如果二次裁剪能改善构图，调用 propose_crop 给出裁剪方案
4. 如果工具返回"错误"，根据错误信息修正参数重试，或者不用该工具继续分析
5. 拿到数据后，结合你的审美判断给出分析

所有工具调用完成之后，再写最终回答。最终回答必须完整包括：构图分析、发现的问题（引用工具测得的数据）、3 条可立即执行的拍摄建议。
只描述照片中真实存在的东西。注意画面中的干扰元素（如电线杆、杂物）。用中文回答。"""


# ========== 第 4 部分：Agent 循环（核心！）==========

def run_tool(name: str, arguments: str, image_path: str) -> dict:
    """执行一个工具。出错时不让程序崩溃，而是把错误信息返回给 AI"""
    try:
        func = TOOL_FUNCTIONS.get(name)
        if func is None:
            raise ValueError(f"没有叫 {name} 的工具")
        args = json.loads(arguments or "{}")
        result = func(image_path, **args)
        print(f"   ✅ 结果：{result}")
        return result
    except Exception as e:
        error = {"错误": f"{type(e).__name__}: {e}"}
        print(f"   ❌ 出错：{error['错误']}")
        return error


def run_agent(image_path: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": compress_to_data_url(image_path)}},
                {"type": "text", "text": "请分析这张照片。"},
            ],
        },
    ]
    total_tokens = 0
    texts = []                                              # 收集 AI 每一轮说的话

    for step in range(6):                                   # 最多 6 轮，防止无限循环
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOLS,                                    # 把工具说明书交给 AI
        )
        if response.usage:
            total_tokens += response.usage.total_tokens
        msg = response.choices[0].message
        messages.append(msg.model_dump(exclude_none=True))  # AI 说的话也要记进对话历史

        # 有的模型会在调用工具的同时说话（比如先写好分析再去裁剪），这些文字不能丢
        if msg.content:
            texts.append(msg.content)

        # 情况 A：AI 没有调用工具 → 说明它认为可以给出最终答案了
        if not msg.tool_calls:
            print(f"🧮 本次共消耗 {total_tokens} tokens，调用 AI {step + 1} 次")
            return "\n\n".join(texts)

        # 情况 B：AI 要求调用工具 → 我们来执行
        for call in msg.tool_calls:
            print(f"🔧 第 {step + 1} 轮：AI 调用了工具 {call.function.name} {call.function.arguments or ''}")
            result = run_tool(call.function.name, call.function.arguments, image_path)

            # 把工具结果告诉 AI（tool_call_id 用来对应是哪一次调用）
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": json.dumps(result, ensure_ascii=False),
            })

    return "（已达到最大轮数，停止）"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python m3_agent.py <照片路径>")
        sys.exit(1)
    try:
        print("\n" + run_agent(sys.argv[1]))
    except FileNotFoundError:
        print(f"找不到照片：{sys.argv[1]}")
    except APIError as e:
        print(f"调用 AI 接口出错（检查 .env 里的密钥、地址、模型名，以及网络）：\n{e}")

import json
import sys

from PIL import Image, ImageDraw, ImageOps

# 复用 M1 里写好的东西，不用重复写
from m1_analyze import client, MODEL, image_to_data_url

SYSTEM_PROMPT = """你是一位专业摄影指导。分析用户照片的构图，只输出一个 JSON 对象，不要输出任何其他文字。

格式如下：
{
  "score": 1到10的整数，表示构图评分,
  "subject": "主体是什么",
  "problems": ["问题1", "问题2"],
  "suggestions": ["可立即执行的建议1", "建议2", "建议3"],
  "crop": {"left": 0.0, "top": 0.0, "right": 1.0, "bottom": 1.0}
}

crop 是建议的二次裁剪区域，用 0 到 1 之间的比例表示：
left/right 是距离图片左边的比例，top/bottom 是距离图片上边的比例。
如果不需要裁剪，就填 {"left": 0, "top": 0, "right": 1, "bottom": 1}。
用中文填写文字内容。"""


def ask_ai(image_path: str) -> str:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_to_data_url(image_path)}},
                    {"type": "text", "text": "请分析这张照片。"},
                ],
            },
        ],
    )
    return response.choices[0].message.content


def parse_json(text: str) -> dict:
    """AI 有时会在 JSON 外面包一层 ```json ... ```，先去掉再解析"""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]      # 去掉第一行 ```json
        text = text.rsplit("```", 1)[0]    # 去掉最后的 ```
    return json.loads(text)


def draw_result(image_path: str, result: dict, out_path: str):
    img = Image.open(image_path)
    img = ImageOps.exif_transpose(img)     # 修正手机照片的旋转方向
    img = img.convert("RGB")
    w, h = img.size
    draw = ImageDraw.Draw(img)
    line = max(2, w // 300)                # 线宽随图片大小变化

    # 白色：三分线（九宫格）
    for i in (1, 2):
        draw.line([(w * i / 3, 0), (w * i / 3, h)], fill="white", width=line)
        draw.line([(0, h * i / 3), (w, h * i / 3)], fill="white", width=line)

    # 红色：AI 建议的裁剪框（比例 × 实际尺寸 = 像素位置）
    c = result["crop"]
    box = (c["left"] * w, c["top"] * h, c["right"] * w, c["bottom"] * h)
    draw.rectangle(box, outline="red", width=line * 2)

    img.save(out_path)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python m2_crop.py <照片路径>")
        sys.exit(1)
    path = sys.argv[1]

    raw = ask_ai(path)
    try:
        result = parse_json(raw)
    except json.JSONDecodeError:
        print("AI 返回的不是合法 JSON，原文如下：\n", raw)
        sys.exit(1)

    print(f"评分：{result['score']}/10")
    print(f"主体：{result['subject']}")
    print("问题：")
    for p in result["problems"]:
        print("  -", p)
    print("建议：")
    for s in result["suggestions"]:
        print("  -", s)

    draw_result(path, result, "result.jpg")
    print("\n已生成 result.jpg（白线 = 三分线，红框 = 建议裁剪）")
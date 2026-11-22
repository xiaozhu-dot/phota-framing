"""网页版分析流程：快的结果先返回，慢的放到最后。

和 m3_agent 的区别：
- 曝光、水平这些测量是固定步骤，不需要 AI 决定，所以直接在本地先算好（零点几秒），立刻返回给网页
- 点评和建议拆成两个 AI 请求，同时发出（并行），谁先回来先显示谁
- 裁剪图在内存里画好直接返回，不再写 result.jpg，多人同时使用也不会互相覆盖
"""
import base64
import io
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from openai import BadRequestError
from PIL import Image, ImageDraw

from m1_analyze import client, MODEL
from m3_agent import compress_to_data_url, get_exposure_stats, load_image, measure_horizon_tilt

COMMON_RULES = """
要求：
- 只描述照片中真实存在的东西；用中文。
- 亮度、过曝、欠曝是程序精确测量的，可以直接引用。
- 水平：只有"找到水平线"为 true 时，"倾斜角度"才可信；为 false 表示程序没把握，请你自己看画面判断，
  画面里看不出明显倾斜就不要说它歪。
- 只输出一个 JSON 对象，不要输出任何其他文字，不要用 markdown 代码块。"""

REVIEW_PROMPT = """你是一位专业摄影指导，正在给用户的照片做快速点评。""" + COMMON_RULES + """

评分标准（严格按标准打分，不要习惯性地给 7 分）：
- 9～10：构图、光线、主体都出色，几乎挑不出毛病
- 7～8：整体不错，只有一两处小问题
- 5～6：有明显问题，比如画面明显歪斜、曝光明显过暗或过曝、主体被切掉或挤在边缘
- 3～4：有多处明显问题
- 1～2：基本拍失败了
每有一个明显问题，至少扣 1 分。先想清楚问题，再给分。

JSON 格式（按这个顺序写）：
{
  "title": "给照片起一个 4~8 字的标题",
  "summary": "一句话总评，不超过 30 字",
  "highlights": ["亮点，每条不超过 12 字，共 2~3 条"],
  "problems": ["问题，每条不超过 12 字，共 1~3 条；真的没有明显问题可以写空列表"],
  "score": 1 到 10 的整数，按上面的评分标准
}"""

SUGGEST_PROMPT = """你是一位专业摄影指导，告诉用户下次怎么拍得更好。""" + COMMON_RULES + """

JSON 格式：
{
  "suggestions": [
    {"action": "不超过 10 字的具体动作，例如：向右平移两步", "why": "不超过 35 字，说明这样做的效果"}
  ],
  "crop": {"left": 0.0, "top": 0.0, "right": 1.0, "bottom": 1.0, "reason": "不超过 25 字"}
}
suggestions 正好 3 条，按重要程度排序。
crop 是对这张照片的二次裁剪建议，坐标是相对图片宽高的比例（0~1）：
left/right 从图片左边算起，top/bottom 从图片上边算起。不需要裁剪时 crop 填 null。"""


class FormatError(ValueError):
    """AI 没按格式返回 JSON"""


def parse_json(text: str) -> dict:
    """从 AI 的回答里稳稳地取出 JSON：
    去掉 <think> 思考过程和 ```json 代码块，找第一个括号完整配对的 {...}，容忍末尾多余的逗号"""
    raw = text or ""
    text = re.sub(r"<think>[\s\S]*?</think>", "", raw)
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.I)
    if fence:
        text = fence.group(1)
    start = text.find("{")
    if start == -1:
        raise FormatError(f"AI 没有按格式返回 JSON（开头是：{raw.strip()[:30]!r}）")
    depth, in_str, esc, end = 0, False, False, -1
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end == -1:
        raise FormatError("AI 的 JSON 不完整（可能被截断了）")
    body = text[start:end + 1]
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        try:
            return json.loads(re.sub(r",\s*([}\]])", r"\1", body))
        except json.JSONDecodeError as e:
            raise FormatError(f"AI 的 JSON 有语法错误：{e}") from e


_no_json_mode = False                                       # 服务商不支持强制 JSON 模式时，记下来以后不再用


def ask_json(system_prompt: str, image_url: str, facts: str, max_tokens: int = 3000) -> dict:
    """要一个 JSON：支持的服务商开启强制 JSON 模式；格式不对或被截断时，自动再试一次"""
    global _no_json_mode
    for attempt in range(2):
        extra = "\n\n注意：上一次的回答格式不对。这一次只输出一个完整的 JSON 对象。" if attempt else ""
        kwargs = {} if _no_json_mode else {"response_format": {"type": "json_object"}}
        try:
            response = client.chat.completions.create(
                model=MODEL,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system_prompt + extra},
                    {
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": image_url}},
                            {"type": "text", "text": facts},
                        ],
                    },
                ],
                **kwargs,
            )
        except BadRequestError as e:
            if kwargs and re.search("response_format|json", str(e), re.I):
                _no_json_mode = True                        # 不支持 JSON 模式：去掉这个参数重试
                continue
            raise
        choice = response.choices[0]
        try:
            return parse_json(choice.message.content or "")
        except FormatError:
            if attempt == 1:
                raise
            if choice.finish_reason == "length":
                max_tokens *= 2                             # 被截断了：额度翻倍再试
    raise FormatError("AI 没有按格式返回 JSON")


def to_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


def render_crop(image_path: str, crop: dict) -> dict | None:
    """画两张图：标注图（框外压暗 + 框内三分线）和裁剪后的效果图。方案不合理就返回 None"""
    try:
        values = [min(max(float(crop[k]), 0.0), 1.0) for k in ("left", "top", "right", "bottom")]
    except (KeyError, TypeError, ValueError):
        return None
    left, top, right, bottom = values
    kept = (right - left) * (bottom - top)
    if right - left < 0.2 or bottom - top < 0.2 or kept < 0.3 or kept > 0.98:
        return None                                         # 裁太多、坐标反了、或者几乎没裁

    img = load_image(image_path)
    w, h = img.size
    box = (int(left * w), int(top * h), int(right * w), int(bottom * h))
    cropped = img.crop(box)

    # 标注图：整张压暗，再把裁剪区域原样贴回去，框内画三分线
    annotated = img.point(lambda p: int(p * 0.35))
    annotated.paste(cropped, box[:2])
    draw = ImageDraw.Draw(annotated)
    bw, bh = box[2] - box[0], box[3] - box[1]
    line = max(1, w // 500)
    for i in (1, 2):
        x = box[0] + bw * i / 3
        y = box[1] + bh * i / 3
        draw.line([(x, box[1]), (x, box[3])], fill=(255, 255, 255), width=line)
        draw.line([(box[0], y), (box[2], y)], fill=(255, 255, 255), width=line)
    draw.rectangle(box, outline=(255, 255, 255), width=line * 2)

    return {
        "annotated": to_data_url(annotated),
        "cropped": to_data_url(cropped),
        "kept": round(kept * 100),
        "reason": str(crop.get("reason", "")),
    }


def analyze_stream(image_path: str):
    """生成器：每完成一步就 yield 一个事件，网页收到一个显示一个"""
    t0 = time.time()

    def elapsed() -> float:
        return round(time.time() - t0, 1)

    # 第 1 步：本地测量（不用 AI，几乎瞬间完成）
    try:
        metrics = {
            "exposure": get_exposure_stats(image_path),
            "horizon": measure_horizon_tilt(image_path),
        }
    except Exception as e:
        yield {"type": "error", "stage": "all", "message": f"照片读取失败：{e}"}
        return
    yield {"type": "metrics", "data": metrics, "t": elapsed()}

    try:
        image_url = compress_to_data_url(image_path)
    except Exception as e:
        yield {"type": "error", "stage": "all", "message": f"照片压缩失败：{e}"}
        return

    facts = "程序精确测得的数据：" + json.dumps(metrics, ensure_ascii=False)

    # 第 2、3 步：点评和建议两个 AI 请求同时发出，谁先完成先返回谁
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {
            pool.submit(ask_json, REVIEW_PROMPT, image_url, facts): "review",
            pool.submit(ask_json, SUGGEST_PROMPT, image_url, facts): "suggestions",
        }
        for future in as_completed(futures):
            stage = futures[future]
            try:
                data = future.result()
            except Exception as e:
                yield {"type": "error", "stage": stage, "message": f"{type(e).__name__}: {e}"}
                continue

            if stage == "review":
                yield {"type": "review", "data": data, "t": elapsed()}
            else:
                crop = data.pop("crop", None)
                yield {"type": "suggestions", "data": data, "t": elapsed()}
                # 第 4 步：本地画裁剪图
                result = render_crop(image_path, crop) if isinstance(crop, dict) else None
                yield {"type": "crop", "data": result, "t": elapsed()}

    yield {"type": "done", "t": elapsed()}


if __name__ == "__main__":
    # 命令行测试：python web_agent.py test.jpg
    import sys
    for event in analyze_stream(sys.argv[1]):
        if event["type"] == "crop" and event["data"]:
            event = {**event, "data": {**event["data"], "annotated": "...", "cropped": "..."}}
        print(json.dumps(event, ensure_ascii=False))

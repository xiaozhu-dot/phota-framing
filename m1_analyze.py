import base64
import mimetypes
import os
import sys

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()  # 读取 .env 文件，把里面的值放进环境变量

# .env 里可以存好几组（每组的名字前面加个前缀），用 PROVIDER 选一组：
#   PROVIDER=QIANWEN  →  读 QIANWEN_API_KEY、QIANWEN_BASE_URL、QIANWEN_MODEL
# 没写 PROVIDER（或者那一组缺了某一项）时，就用不带前缀的 API_KEY、BASE_URL、MODEL —— 老的写法照样能用
# 临时换一组不用改文件：PowerShell 里先运行 $env:PROVIDER="DEEPSEEK"，再启动程序（命令行设置的优先于 .env）
PROVIDER = (os.getenv("PROVIDER") or "").strip().upper()


def _setting(name):
    if PROVIDER:
        value = os.getenv(f"{PROVIDER}_{name}")
        if value:
            return value
    return os.getenv(name)


_missing = [name for name in ("API_KEY", "BASE_URL", "MODEL") if not _setting(name)]
if _missing:
    where = f"{PROVIDER}_" if PROVIDER else "（没写 PROVIDER，所以找的是不带前缀的）"
    sys.exit(f".env 里缺少：{'、'.join(where + n if PROVIDER else n for n in _missing)}\n"
             f"如果你按前缀分了几组（比如 QIANWEN_API_KEY），记得在最上面加一行 PROVIDER=QIANWEN 选用哪一组。"
             f"\n写法可以参考 .env.example")

client = OpenAI(
    api_key=_setting("API_KEY"),
    base_url=_setting("BASE_URL"),
)
MODEL = _setting("MODEL")

SYSTEM_PROMPT = """你是一位专业摄影指导。分析用户的照片时，按以下顺序检查：
1. 主体：主体是什么，位置在哪，是否突出
2. 构图法则：三分法、引导线、对称、框架、留白
3. 水平/垂直线：是否歪斜
4. 光线：方向、软硬、曝光是否合适
5. 干扰：背景杂物、切到肢体、边缘多余元素

最后给出 3 条最重要、可立即执行的建议，
要具体到动作，例如"向左平移半步"、"蹲低 30 厘米"。
用中文回答。"""


def image_to_data_url(path: str) -> str:
    """把本地图片转成 data URL：data:image/jpeg;base64,xxxx"""
    mime = mimetypes.guess_type(path)[0] or "image/jpeg"
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime};base64,{b64}"


def analyze(image_path: str) -> str:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                # content 是一个列表，可以同时放图片和文字（多模态）
                "content": [
                    {"type": "image_url", "image_url": {"url": image_to_data_url(image_path)}},
                    {"type": "text", "text": "请分析这张照片的构图并给出拍摄建议。"},
                ],
            },
        ],
    )
    return response.choices[0].message.content


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python m1_analyze.py <照片路径>")
        sys.exit(1)
    print(analyze(sys.argv[1]))
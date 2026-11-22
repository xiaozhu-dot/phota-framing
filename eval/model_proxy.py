"""本机"转发站"：让浏览器里的手机版 App 用 .env 里的真模型，而密钥不用填进网页

运行：.venv/Scripts/python.exe -m uvicorn eval.model_proxy:app --port 8787 --host 127.0.0.1
App 设置里填：接口地址 http://127.0.0.1:8787/v1 ，密钥随便填（比如 proxy），模型随便填
    —— 转发站会换成 .env 里真正的密钥、地址和模型

只监听本机（127.0.0.1），局域网里别的设备连不上
"""
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fastapi import FastAPI, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from openai import APIConnectionError, APIStatusError  # noqa: E402

from m1_analyze import MODEL, client  # noqa: E402

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
                   allow_methods=["GET", "POST"], allow_headers=["*"])
usage = {"calls": 0, "tokens": 0}


# 每次请求最多等 3 分钟、只重试 1 次（默认是 10 分钟 + 重试 2 次：一次卡住就会拖很久）
llm = client.with_options(timeout=180, max_retries=1)


# 用普通函数（不是 async）：FastAPI 会把它放到线程里跑，等模型回答的时候，别的请求（比如查进度）照样能响应
@app.post("/v1/chat/completions")
def chat(body: dict):
    body["model"] = MODEL                                  # 用 .env 里的模型
    body.pop("stream", None)
    # 千问这类"会思考"的模型：做实验时用环境变量 THINKING=on/off 统一开关思考（App 自己传的优先）
    if os.getenv("THINKING") in ("on", "off") and "enable_thinking" not in body:
        body["extra_body"] = {"enable_thinking": os.getenv("THINKING") == "on"}
    elif "enable_thinking" in body:
        body["extra_body"] = {"enable_thinking": body.pop("enable_thinking")}
    try:
        r = llm.chat.completions.create(**body)
    except APIStatusError as e:                            # 原样把错误码交回去（App 遇到 400 会自动换一种请求方式）
        return JSONResponse({"error": {"message": str(e)}}, status_code=e.status_code)
    except APIConnectionError as e:                        # 超时或连不上
        return JSONResponse({"error": {"message": "模型接口超时或连不上：" + str(e)[:120]}}, status_code=504)
    usage["calls"] += 1
    usage["tokens"] += r.usage.total_tokens if r.usage else 0
    return r.model_dump()


@app.get("/usage")
def get_usage():
    return usage


# 浏览器里跑完的评估结果，存到 eval/results/<name>.json（名字只允许字母数字和 -，不能跳出这个文件夹）
@app.post("/save/{name}")
async def save(name: str, request: Request):
    if not re.fullmatch(r"[A-Za-z0-9-]{1,40}", name):
        return JSONResponse({"error": "bad name"}, status_code=400)
    path = Path(__file__).resolve().parent / "results" / f"{name}.json"
    path.write_text(json.dumps(await request.json(), ensure_ascii=False, indent=1), encoding="utf-8")
    return {"saved": str(path)}

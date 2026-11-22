"""电脑网页版（M4）：已冻结，保留作学习记录（M1 单次调用 → M3 agent → M4 网页）。

新功能只做在手机版 mobile/ 里；这里不再同步（2026-10-19 决定）。
static/pet.js 例外：手机版构建时会复制它，宠物改动仍然在那里改。
"""
import json
import os
import shutil
import sys
import tempfile

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from web_agent import analyze_stream

# 有些 Windows 终端默认用 GBK 编码，打印 emoji 会报错，这里统一改成 UTF-8
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")   # static 文件夹里的文件可以直接访问


@app.get("/")
def home():
    """有人打开网站首页时，把网页文件发给他"""
    # no-cache：让浏览器每次都检查网页有没有更新，避免改了代码还看到旧页面
    return FileResponse("static/index.html", headers={"Cache-Control": "no-cache"})


@app.post("/analyze")
def analyze(photo: UploadFile = File(...)):
    """接收上传的照片，分析结果一步一步地"流"回网页（每行一个 JSON 事件）"""
    # 把上传的照片存成临时文件（分析函数需要的是文件路径）
    suffix = os.path.splitext(photo.filename or "")[1] or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(photo.file, tmp)
        path = tmp.name

    def events():
        try:
            for event in analyze_stream(path):
                yield json.dumps(event, ensure_ascii=False) + "\n"
        finally:
            os.remove(path)                                 # 全部发送完（或中途断开）后删掉临时文件

    return StreamingResponse(events(), media_type="application/x-ndjson")

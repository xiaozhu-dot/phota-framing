"""从 Wikimedia Commons 下载评估用的照片（只选"高质量图片"分类里、开放许可的作品）

运行：python eval/fetch_photos.py
结果：eval/photos/*.jpg  +  eval/photos/CREDITS.md（作者、许可、出处）
"""
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia 要求写明是谁在调用
HEADERS = {"User-Agent": "photographer-agent-eval/1.0 (personal learning project)"}
OUT = Path(__file__).parent / "photos"

# 每类拍摄题材找 2 张
TOPICS = {
    "landscape": "mountain lake",
    "seascape": "sea beach horizon",
    "portrait": "portrait woman",
    "street": "street market",
    "architecture": "cathedral facade",
    "interior": "interior room",
    "animal": "bird",
    "food": "food dish",
}
OPEN_LICENSES = ("cc0", "cc by", "cc-by", "public domain", "pd")


def get(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as r:
        return json.load(r)


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def search(topic, query, want=2):
    data = get({
        "action": "query", "generator": "search", "gsrnamespace": 6, "gsrlimit": 30,
        "gsrsearch": f'incategory:"Quality_images" filetype:bitmap {query}',
        "prop": "imageinfo", "iiprop": "url|size|extmetadata|mime", "iiurlwidth": 1600,
    })
    pages = sorted(data.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    picked = []
    for p in pages:
        info = (p.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        license_name = strip_html(meta.get("LicenseShortName", {}).get("value", ""))
        w, h = info.get("width", 0), info.get("height", 0)
        if info.get("mime") != "image/jpeg" or w < 1600 or not (0.5 < w / max(h, 1) < 2.2):
            continue
        if not license_name.lower().startswith(OPEN_LICENSES):
            continue
        picked.append({
            "topic": topic,
            "title": p["title"],
            "thumb": info["thumburl"],
            "page": info["descriptionurl"],
            "author": strip_html(meta.get("Artist", {}).get("value", "未知"))[:80],
            "license": license_name,
        })
        if len(picked) == want:
            break
    return picked


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    credits = ["# 评估照片来源\n", "全部来自 Wikimedia Commons 的 Quality images 分类，按各自许可使用。\n",
               "| 文件 | 题材 | 作者 | 许可 | 出处 |", "|---|---|---|---|---|"]
    for topic, query in TOPICS.items():
        for i, item in enumerate(search(topic, query), 1):
            name = f"{topic}_{i}.jpg"
            req = urllib.request.Request(item["thumb"], headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as r:
                (OUT / name).write_bytes(r.read())
            print(f"✅ {name:18} {item['license']:14} {item['title'][:60]}")
            credits.append(f"| {name} | {topic} | {item['author']} | {item['license']} | [{item['title']}]({item['page']}) |")
    (OUT / "CREDITS.md").write_text("\n".join(credits) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

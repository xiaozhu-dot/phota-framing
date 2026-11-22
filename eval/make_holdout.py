"""留出一批"新考题"：只在最后验证时用，调提示词、调参数的过程中不看它

为什么：如果一直盯着同一批题调，可能只是把这批题"背"下来了，换了照片就不灵。
新题用的是调参时没出现过的原图（教堂立面、白底美食、图书馆长廊、俯拍路口），毛病的程度也和旧题错开。

运行：python eval/make_holdout.py
结果：eval/photos/holdout/*.jpg + eval/labels-holdout.json（格式和 labels.json 一样，可以直接给 app_runner.js 用）
"""
import json
from pathlib import Path

from PIL import Image, ImageOps

from make_variants import KEYWORDS, crop_box, exposure, tilt

ROOT = Path(__file__).parent
SRC = ROOT / "photos"
OUT = SRC / "holdout"

VARIANTS = [
    ("interior_2", "tilt_interior_2", lambda i: tilt(i, 3), {"defect": "tilt", "tilt": 3}),
    ("street_1", "tilt_street_1", lambda i: tilt(i, -4), {"defect": "tilt", "tilt": -4}),
    ("architecture_2", "tilt_architecture_2", lambda i: tilt(i, 3.5), {"defect": "tilt", "tilt": 3.5}),
    ("food_2", "dark_food_2", lambda i: exposure(i, 0.4), {"defect": "dark"}),
    ("street_1", "dark_street_1", lambda i: exposure(i, 0.38), {"defect": "dark"}),
    ("interior_2", "bright_interior_2", lambda i: exposure(i, 1.8), {"defect": "bright"}),
    ("architecture_2", "bright_architecture_2", lambda i: exposure(i, 1.7), {"defect": "bright"}),
    ("food_2", "cut_food_2", lambda i: crop_box(i, 0.45, 0.0, 1.0, 0.62), {"defect": "cut", "what": "盘子和鸡肉被切掉一大块"}),
    ("interior_2", "cut_interior_2", lambda i: crop_box(i, 0.45, 0.0, 1.0, 1.0), {"defect": "cut", "what": "长廊的中心被挤到最左边"}),
    ("architecture_2", "cut_architecture_2", lambda i: crop_box(i, 0.0, 0.38, 1.0, 1.0), {"defect": "cut", "what": "教堂顶部的尖塔被切掉"}),
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    bases = sorted({b for b, *_ in VARIANTS})
    labels = [{"file": f"photos/{b}.jpg", "base": b, "defect": "none"} for b in bases]
    for base, name, fn, truth in VARIANTS:
        img = ImageOps.exif_transpose(Image.open(SRC / f"{base}.jpg")).convert("RGB")
        fn(img).save(OUT / f"{name}.jpg", quality=90)
        labels.append({"file": f"photos/holdout/{name}.jpg", "base": base, **truth, "keywords": KEYWORDS[truth["defect"]]})
        print(f"✅ {name}")
    (ROOT / "labels-holdout.json").write_text(json.dumps(labels, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"共 {len(labels)} 张：{len(bases)} 张原图 + {len(VARIANTS)} 张新题")


if __name__ == "__main__":
    main()

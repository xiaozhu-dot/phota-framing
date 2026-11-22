"""把好照片"故意拍坏"，做成标准答案确切已知的测试题

运行：python eval/make_variants.py
结果：eval/photos/variants/*.jpg  +  eval/labels.json（每张图的标准答案）

为什么要这样做：AI 说"这张歪了"到底对不对，人眼判断会有分歧；
但如果是我们亲手把一张正的照片转了 4°，标准答案就是确定的。
"""
import json
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

ROOT = Path(__file__).parent
SRC = ROOT / "photos"
OUT = SRC / "variants"


def tilt(img, deg):
    """顺时针转 deg 度（画面变成向右下倾斜），再裁掉转出来的黑边"""
    w, h = img.size
    rotated = img.rotate(-deg, resample=Image.BICUBIC, expand=False)
    m = 0.09                                                  # 转 4° 左右，四边各裁 9% 足够去掉黑边
    return rotated.crop((int(w * m), int(h * m), int(w * (1 - m)), int(h * (1 - m))))


def exposure(img, factor):
    return ImageEnhance.Brightness(img).enhance(factor)


def crop_box(img, l, t, r, b):
    w, h = img.size
    return img.crop((int(w * l), int(h * t), int(w * r), int(h * b)))


# (原图, 新文件名, 处理方式, 标准答案)
VARIANTS = [
    ("seascape_1", "tilt_seascape_1", lambda i: tilt(i, 4), {"defect": "tilt", "tilt": 4}),
    ("seascape_2", "tilt_seascape_2", lambda i: tilt(i, -3), {"defect": "tilt", "tilt": -3}),
    ("landscape_2", "tilt_landscape_2", lambda i: tilt(i, 5), {"defect": "tilt", "tilt": 5}),
    ("interior_1", "tilt_interior_1", lambda i: tilt(i, -4), {"defect": "tilt", "tilt": -4}),
    ("landscape_1", "dark_landscape_1", lambda i: exposure(i, 0.35), {"defect": "dark"}),
    ("architecture_1", "dark_architecture_1", lambda i: exposure(i, 0.4), {"defect": "dark"}),
    ("animal_2", "bright_animal_2", lambda i: exposure(i, 1.9), {"defect": "bright"}),
    ("portrait_2", "bright_portrait_2", lambda i: exposure(i, 1.8), {"defect": "bright"}),
    # 把主体挤到边上 / 切掉一部分
    ("animal_1", "cut_animal_1", lambda i: crop_box(i, 0.38, 0.0, 1.0, 0.75), {"defect": "cut", "what": "小鸟被挤到画面左边缘，脚和下半身被切掉"}),
    ("portrait_1", "cut_portrait_1", lambda i: crop_box(i, 0.0, 0.30, 1.0, 1.0), {"defect": "cut", "what": "帽子和头顶被切掉"}),
    ("street_2", "cut_street_2", lambda i: crop_box(i, 0.45, 0.0, 1.0, 1.0), {"defect": "cut", "what": "人物被挤到画面最左边，右边留了一大片背景"}),
    ("food_1", "cut_food_1", lambda i: crop_box(i, 0.0, 0.0, 0.62, 0.62), {"defect": "cut", "what": "主菜被切掉一大块"}),
]

# 判断 AI 有没有"说中"问题时，在它的回答里找这些关键词
KEYWORDS = {
    "tilt": ["歪", "倾斜", "不平", "水平"],
    "dark": ["暗", "欠曝", "曝光不足"],
    "bright": ["过曝", "太亮", "偏亮", "曝光过度", "死白"],
    "cut": ["切", "裁", "边缘", "截断", "不完整", "挤", "太满"],
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    labels = []
    for f in sorted(SRC.glob("*.jpg")):                        # 原图：没有故意加的毛病
        labels.append({"file": f"photos/{f.name}", "base": f.stem, "defect": "none"})
    for base, name, fn, truth in VARIANTS:
        img = ImageOps.exif_transpose(Image.open(SRC / f"{base}.jpg")).convert("RGB")
        fn(img).save(OUT / f"{name}.jpg", quality=90)
        labels.append({"file": f"photos/variants/{name}.jpg", "base": base, **truth, "keywords": KEYWORDS[truth["defect"]]})
        print(f"✅ {name}")
    (ROOT / "labels.json").write_text(json.dumps(labels, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"共 {len(labels)} 张：{sum(l['defect'] == 'none' for l in labels)} 张原图 + {len(VARIANTS)} 张加工图")


if __name__ == "__main__":
    main()

"""画 Phota 的 App 图标：极简光圈（奶油色细环 + 珊瑚色六叶光圈），深墨色底

运行：python mobile/scripts/make_icon.py
输出：
  android/app/src/main/res/mipmap-*/ic_launcher.png、ic_launcher_round.png（老式图标，带底色）
  android/app/src/main/res/mipmap-*/ic_launcher_foreground.png（安卓 8 以后的"自适应图标"前景，底色单独设置）
  android/app/src/main/res/drawable*/splash.png（启动画面：墨色底 + 光圈，安卓 12 以前用）
  www/icon.png（顶栏 logo）、www/mark.png（透明底的光圈：App 打开时的开场动画用）
先按 4 倍大小画，再缩小 —— 边缘更平滑
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android/app/src/main/res"
S = 2048                                       # 画布（对应自适应图标的 108dp）
INK, INK2 = (29, 27, 24), (46, 41, 36)
CREAM, CREAM2 = (241, 233, 220), (214, 201, 182)
CORAL, CORAL2, DEEP = (236, 104, 74), (200, 67, 43), (24, 20, 18)


def lens(scale=1.0):
    """透明背景上的极简光圈：奶油色细环 + 珊瑚色风车光圈 + 一点高光。scale：整体大小（自适应图标要缩进安全区）"""
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = cy = S / 2
    R = 620 * scale                            # 外环半径
    ring = 72 * scale
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=CREAM)
    d.ellipse([cx - R + ring, cy - R + ring, cx + R - ring, cy + R - ring], fill=(0, 0, 0, 0))

    # 光圈：珊瑚色圆（左上亮、右下暗的渐变），中间一个转了角度的六边形开口
    r3 = R * 0.78
    grad = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    gd.ellipse([cx - r3, cy - r3, cx + r3, cy + r3], fill=CORAL2)   # 先铺满整个圆（渐变往左上偏，右下角不然会空出来）
    for k in range(60):
        t = k / 59
        c = tuple(int(CORAL[i] * (1 - t) + CORAL2[i] * t) for i in range(3))
        rr = r3 * (1 - t * 0.999)
        off = (1 - t) * r3 * 0.10
        gd.ellipse([cx - rr - off, cy - rr - off, cx + rr - off, cy + rr - off], fill=c)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).ellipse([cx - r3, cy - r3, cx + r3, cy + r3], fill=255)
    img.paste(grad, (0, 0), mask)

    hole = r3 * 0.42
    rot = math.radians(15)
    hexa = [(cx + hole * math.cos(rot + i * math.pi / 3), cy + hole * math.sin(rot + i * math.pi / 3)) for i in range(6)]
    blades = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(blades)
    for i, (x, y) in enumerate(hexa):           # 叶片的边：把六边形的每条边往外延长到光圈边缘，就是经典的"风车"光圈
        px, py = hexa[i - 1]
        ln = math.hypot(x - px, y - py)
        x2, y2 = x + (x - px) / ln * r3 * 1.2, y + (y - py) / ln * r3 * 1.2
        bd.line([(x, y), (x2, y2)], fill=(150, 46, 30), width=int(18 * scale))
    img.paste(blades, (0, 0), Image.composite(blades.split()[3], Image.new("L", (S, S), 0), mask))   # 只留光圈里面的部分
    d.polygon(hexa, fill=DEEP)
    # 镜片高光：左上一个小亮点
    g = r3 * 0.11
    hx, hy = cx - r3 * 0.34, cy - r3 * 0.34
    d.ellipse([hx - g, hy - g, hx + g, hy + g], fill=(255, 244, 232, 245))
    return img


def background():
    """深墨色底，中间偏上一点暖光"""
    bg = Image.new("RGB", (S, S), INK)
    glow = Image.new("RGB", (S, S), INK)
    ImageDraw.Draw(glow).ellipse([S * 0.18, S * 0.1, S * 0.82, S * 0.74], fill=(70, 52, 40))
    return Image.blend(bg, glow.filter(ImageFilter.GaussianBlur(S * 0.12)), 0.85)


def main():
    full = background()
    art = lens(1.0)
    full.paste(art, (0, 0), art)
    fg = lens(0.78)                            # 自适应图标会被系统裁成圆 / 圆角方，主体要缩进中间的安全区

    sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for dpi, px in sizes.items():
        folder = RES / f"mipmap-{dpi}"
        sq = full.resize((px, px), Image.LANCZOS)
        sq.save(folder / "ic_launcher.png")
        round_mask = Image.new("L", (px * 4, px * 4), 0)
        ImageDraw.Draw(round_mask).ellipse([0, 0, px * 4 - 1, px * 4 - 1], fill=255)
        rnd = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        rnd.paste(sq, (0, 0), round_mask.resize((px, px), Image.LANCZOS))
        rnd.save(folder / "ic_launcher_round.png")
        fg.resize((px * 9 // 4, px * 9 // 4), Image.LANCZOS).save(folder / "ic_launcher_foreground.png")   # 108dp = 48dp × 2.25
    (RES / "values/ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1D1B18</color>\n</resources>\n', encoding="utf-8")
    full.resize((512, 512), Image.LANCZOS).save(ROOT / "www/icon.png")
    mark = lens(1.0).crop((S // 2 - 660, S // 2 - 660, S // 2 + 660, S // 2 + 660))
    mark.resize((400, 400), Image.LANCZOS).save(ROOT / "www/mark.png")

    # 启动画面：沿用每个文件原来的尺寸。光圈占短边的 30%，和 App 里开场动画的起点一样大
    for f in RES.glob("drawable*/splash.png"):
        w, h = Image.open(f).size
        splash = Image.new("RGB", (w, h), INK)
        side = round(min(w, h) * 0.30)
        m = mark.resize((side, side), Image.LANCZOS)
        splash.paste(m, ((w - side) // 2, (h - side) // 2), m)
        splash.save(f)
    print("图标和启动画面已生成")


if __name__ == "__main__":
    main()

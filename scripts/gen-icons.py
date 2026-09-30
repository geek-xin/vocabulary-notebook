#!/usr/bin/env python3
"""生成 PWA / iOS / Android / HarmonyOS 通用图标。

设计沿用应用内的 logo（24x24 viewBox 的三层「词汇卡片」图形），
描边色 #ffd966，底色 #0f1724，与 index.html 的深色主题一致。

用法：python3 scripts/gen-icons.py
产物：icons/icon-192.png, icon-512.png, icon-maskable-512.png,
      icon-foreground-512.png, apple-touch-icon.png, favicon.svg
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")
os.makedirs(OUT, exist_ok=True)

BG = (15, 23, 36)          # #0f1724
GOLD = (255, 217, 102)     # #ffd966
GOLD_DIM = (255, 179, 71)  # #ffb347

# logo 图形（与 index.html 中的 SVG 完全一致，单位是 24x24 视口）
POLYGON = [(12, 2), (2, 7), (12, 12), (22, 7)]
POLYLINES = [
    [(2, 17), (12, 22), (22, 17)],
    [(2, 12), (12, 17), (22, 12)],
]
SS = 4  # 超采样倍数，画完再缩回去，得到抗锯齿边缘


def draw_logo(img, size, scale, center=True):
    """在 img 上画 logo。scale 是 logo 占画布的比例（1.0 = 铺满 24x24）。"""
    d = ImageDraw.Draw(img)
    pad = size * (1 - scale) / 2 if center else 0
    unit = size * scale / 24.0
    width = max(1, round(2 * unit))

    def pt(x, y):
        return (pad + x * unit, pad + y * unit)

    # 半透明金色填充，让顶部菱形有实体感
    d.polygon([pt(x, y) for x, y in POLYGON], fill=GOLD + (46,))
    for poly in [POLYGON] + POLYLINES:
        pts = [pt(x, y) for x, y in poly]
        d.line(pts, fill=GOLD, width=width, joint="curve")
        for p in pts:  # 圆头端点
            r = width / 2.0
            d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=GOLD)
    return img


def rounded_bg(size, radius_ratio=0.22, color=BG):
    img = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = size * SS * radius_ratio
    d.rounded_rectangle([0, 0, size * SS - 1, size * SS - 1], radius=r, fill=color + (255,))
    return img


def save(img, name, size):
    img = img.resize((size, size), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path, "PNG", optimize=True)
    print("  %-28s %dx%d" % (name, size, size))


def main():
    print("生成图标 ->", OUT)

    # PWA / Android 图标：圆角深底 + 满幅 logo
    for size, name in [(192, "icon-192.png"), (512, "icon-512.png")]:
        img = rounded_bg(size)
        draw_logo(img, size * SS, 0.62)
        save(img, name, size)

    # Maskable：Android 会按安全区裁切，logo 必须缩到中间 ~60%
    size = 512
    img = Image.new("RGBA", (size * SS, size * SS), BG + (255,))
    draw_logo(img, size * SS, 0.52)
    save(img, "icon-maskable-512.png", size)

    # Adaptive icon 前景层：透明底 + 居中 logo，配 Android 的 backgroundColor
    size = 432
    img = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    draw_logo(img, size * SS, 0.52)
    save(img, "icon-foreground-512.png", size)

    # iOS 添加到主屏：不支持透明，必须实底方图（系统自己加圆角）
    size = 180
    img = Image.new("RGBA", (size * SS, size * SS), BG + (255,))
    draw_logo(img, size * SS, 0.66)
    save(img, "apple-touch-icon.png", size)

    # favicon：矢量版，浏览器标签页用
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">'
        '<rect width="24" height="24" rx="5" fill="#0f1724"/>'
        '<g fill="none" stroke="#ffd966" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
        '<polygon points="12 4 4 8 12 12 20 8 12 4" fill="rgba(255,217,102,0.18)"/>'
        '<polyline points="4 16 12 20 20 16"/>'
        '<polyline points="4 12 12 16 20 12"/>'
        '</g></svg>'
    )
    with open(os.path.join(OUT, "favicon.svg"), "w", encoding="utf-8") as f:
        f.write(svg)
    print("  %-28s svg" % "favicon.svg")
    print("完成。")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""从根目录 icons/ 生成 Android mipmap 全套图标。

唯一事实来源是 icons/（由 scripts/gen-icons.py 生成），本脚本只做尺寸派生：

  mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png          48/72/96/144/192
  mipmap-*/ic_launcher_round.png      同上，圆形裁切
  mipmap-*/ic_launcher_foreground.png 108/162/216/324/432（adaptive icon 前景，含安全区）

用法：python3 android/tools/gen-android-icons.py
"""
from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ICONS = ROOT / "icons"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

# 密度 -> (传统图标边长 dp=48, adaptive 前景边长 dp=108)
DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}
SS = 4  # 圆形裁切超采样倍数


def load(name: str) -> Image.Image:
    path = ICONS / name
    if not path.exists():
        raise SystemExit(f"缺少图标源文件：{path}")
    return Image.open(path).convert("RGBA")


def circle_mask(size: int) -> Image.Image:
    """抗锯齿的实心圆遮罩。"""
    big = size * SS
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def main() -> None:
    # 传统图标：用 maskable（满幅不透明底）保证任何启动器上都可见
    legacy_src = load("icon-maskable-512.png")
    # adaptive 前景：432x432，已按 108dp / 安全区预缩放过
    fg_src = load("icon-foreground-512.png")

    written = []
    for density, (legacy_px, fg_px) in DENSITIES.items():
        out = RES / f"mipmap-{density}"
        out.mkdir(parents=True, exist_ok=True)

        # ic_launcher.png —— 满幅方形
        legacy = legacy_src.resize((legacy_px, legacy_px), Image.LANCZOS)
        legacy.save(out / "ic_launcher.png", "PNG", optimize=True)
        written.append(out / "ic_launcher.png")

        # ic_launcher_round.png —— 圆形裁切
        rnd = legacy.copy()
        rnd.putalpha(circle_mask(legacy_px))
        rnd.save(out / "ic_launcher_round.png", "PNG", optimize=True)
        written.append(out / "ic_launcher_round.png")

        # ic_launcher_foreground.png —— adaptive 前景（透明底 + 安全区内的图形）
        fg_src.resize((fg_px, fg_px), Image.LANCZOS).save(
            out / "ic_launcher_foreground.png", "PNG", optimize=True
        )
        written.append(out / "ic_launcher_foreground.png")

    for p in written:
        print(f"{p.relative_to(ROOT)}  {Image.open(p).size[0]}px")


if __name__ == "__main__":
    main()

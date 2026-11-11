#!/usr/bin/env python3
"""
把生成的白底角色图转成透明 PNG（保留原图另存），并裁掉四周留白。
用法: python3 tools/white2alpha.py
"""
from PIL import Image
import os

SRC = "img/src"
OUT = "img"
PAD = 8


def whiten_to_alpha(img, thresh=246):
    """白色 → 完全透明；越暗越不透明。带一点羽化避免锯齿。"""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            lum = (r * 299 + g * 587 + b * 114) / 1000
            if lum >= thresh:
                px[x, y] = (r, g, b, 0)
            elif lum >= thresh - 26:
                # thresh-26 ~ thresh 之间线性过渡
                t = (thresh - lum) / 26.0
                px[x, y] = (r, g, b, int(a * t))
    return img


def trim(img, pad=PAD):
    """裁到实际有内容（alpha>8）的包围盒"""
    bbox = img.getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    # 用 alpha 阈值重新算一次，避免残留的一点点噪点撑开边界
    a = img.getchannel("A")
    mask = a.point(lambda v: 255 if v > 8 else 0)
    bb2 = mask.getbbox()
    if bb2:
        x0, y0, x1, y1 = bb2
    return img.crop((max(0, x0 - pad), max(0, y0 - pad),
                     min(img.width, x1 + pad), min(img.height, y1 + pad)))


def main():
    for f in sorted(os.listdir(SRC)):
        if not f.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        im = Image.open(os.path.join(SRC, f))
        im = whiten_to_alpha(im)
        im = trim(im)
        m = max(im.size)
        if m > 1024:
            k = 1024 / m
            im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
        out = os.path.join(OUT, os.path.splitext(f)[0] + ".png")
        im.save(out)
        print(f"{f:16s} -> {os.path.basename(out):16s} {im.size}")


if __name__ == "__main__":
    main()

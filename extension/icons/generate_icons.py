"""
Generate PNG icons for the Word Count Chrome extension.
Simple, premium look: rounded blue square with a white "W" mark.
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.dirname(__file__)
SIZES = [16, 32, 48, 128]
BG = (31, 94, 255, 255)   # brand blue (matches --primary)
FG = (255, 255, 255, 255)


def rounded_rect(draw, box, radius, fill):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def make_icon(size: int):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = max(1, size // 16)
    radius = max(3, size // 5)
    rounded_rect(d, (pad, pad, size - pad, size - pad), radius, BG)

    # Draw a stylized "W" using two triangles / polylines
    inset = size * 0.22
    top = size * 0.34
    bot = size * 0.72
    mid_y = size * 0.52
    stroke = max(2, size // 10)

    # W vertices
    x0 = inset
    x1 = size * 0.36
    x2 = size / 2
    x3 = size * 0.64
    x4 = size - inset

    d.line([(x0, top), (x1, bot)], fill=FG, width=stroke)
    d.line([(x1, bot), (x2, mid_y)], fill=FG, width=stroke)
    d.line([(x2, mid_y), (x3, bot)], fill=FG, width=stroke)
    d.line([(x3, bot), (x4, top)], fill=FG, width=stroke)

    out_path = os.path.join(OUT, f"icon{size}.png")
    img.save(out_path, "PNG")
    print("wrote", out_path)


for s in SIZES:
    make_icon(s)

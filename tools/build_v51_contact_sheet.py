"""Compose the 21 isolated Blender HUD renders into a review contact sheet."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


KINDS = (
    ("juice", "JUICE BAR", (247, 176, 65)),
    ("sundae", "SUNDAE ATELIER", (240, 115, 151)),
    ("wine", "CRYSTAL CELLAR", (103, 167, 225)),
)


def font(size: int, bold=False):
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def rounded_gradient(size, top, bottom, radius):
    width, height = size
    image = Image.new("RGBA", size)
    pixels = image.load()
    for y in range(height):
        mix = y / max(1, height - 1)
        color = tuple(round(top[index] * (1 - mix) + bottom[index] * mix) for index in range(4))
        for x in range(width):
            pixels[x, y] = color
    mask = Image.new("L", size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=255)
    image.putalpha(mask)
    return image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--icons", default="public/icons/v51")
    parser.add_argument("--output", default="outputs/v51-icon-contact-sheet.png")
    args = parser.parse_args()
    icons = Path(args.icons)
    output = Path(args.output)
    width, height = 1600, 770
    canvas = Image.new("RGB", (width, height), (50, 19, 10))
    glow = Image.new("RGBA", canvas.size)
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((-300, -250, 850, 620), fill=(255, 144, 45, 95))
    glow_draw.ellipse((870, 230, 1850, 1040), fill=(82, 114, 255, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(95))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), glow)
    draw = ImageDraw.Draw(canvas)
    draw.text((46, 24), "V5.1  PREMIUM 3D COLLECTION", font=font(31, True), fill=(255, 229, 182, 255))
    draw.text((47, 63), "21 individually rendered cups · no sprite-sheet cropping", font=font(17), fill=(209, 167, 127, 255))
    card_w, card_h = 184, 188
    x_start, gap = 236, 10
    for row, (kind, label, accent) in enumerate(KINDS):
        y = 111 + row * 214
        draw.rounded_rectangle((40, y + 10, 215, y + card_h - 10), radius=24, fill=(255, 242, 218, 23), outline=(*accent, 145), width=2)
        draw.text((55, y + 54), label, font=font(16, True), fill=(*accent, 255))
        draw.text((59, y + 83), "LEVEL 01 — 07", font=font(13), fill=(229, 205, 180, 230))
        for level in range(1, 8):
            x = x_start + (level - 1) * (card_w + gap)
            shadow = Image.new("RGBA", (card_w + 12, card_h + 12))
            ImageDraw.Draw(shadow).rounded_rectangle((6, 6, card_w + 5, card_h + 5), radius=24, fill=(0, 0, 0, 115))
            shadow = shadow.filter(ImageFilter.GaussianBlur(6))
            canvas.alpha_composite(shadow, (x - 6, y - 3))
            card = rounded_gradient((card_w, card_h), (255, 251, 238, 245), (225, 192, 144, 232), 24)
            card_draw = ImageDraw.Draw(card)
            card_draw.rounded_rectangle((1, 1, card_w - 2, card_h - 2), radius=23, outline=(255, 245, 215, 230), width=2)
            icon = Image.open(icons / f"{kind}-{level}.png").convert("RGBA")
            icon.thumbnail((126, 150), Image.Resampling.LANCZOS)
            card.alpha_composite(icon, ((card_w - icon.width) // 2, 7 + (151 - icon.height) // 2))
            label_text = f"{level:02d}"
            label_box = card_draw.textbbox((0, 0), label_text, font=font(16, True))
            label_width = label_box[2] - label_box[0]
            card_draw.rounded_rectangle((card_w // 2 - 24, 156, card_w // 2 + 24, 181), radius=13, fill=(*accent, 245))
            card_draw.text((card_w // 2 - label_width // 2, 159), label_text, font=font(16, True), fill=(64, 29, 15, 255))
            canvas.alpha_composite(card, (x, y))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, quality=95, optimize=True)
    print(f"Wrote {output.resolve()}")


if __name__ == "__main__":
    main()

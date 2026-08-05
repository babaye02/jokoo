#!/usr/bin/env python3
"""
Jokoo App Store screenshot compositor.

Composes 6 iPhone screenshots on a branded canvas:
- Target: 1290 x 2796 px (iPhone 6.9" App Store required size).
- Format: PNG, RGB (no transparency), sRGB.
- Layout:
    - Premium gradient background (Jokoo turquoise → deep teal → indigo).
    - Marketing title (French) in bold at top.
    - iPhone device frame with the app screenshot inside.
    - Jokoo wordmark + secondary tagline at bottom.

Usage:
    python3 compose_screenshots.py
Output:
    /app/store-assets/screenshots/final/jokoo_appstore_XX.png (x6)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---- Design constants -------------------------------------------------------
CANVAS_W, CANVAS_H = 1290, 2796  # iPhone 6.9" App Store
BG_TOP = (24, 198, 163)          # #18C6A3 Jokoo turquoise
BG_MID = (13, 148, 136)          # #0D9488 deep teal
BG_BOTTOM = (26, 24, 76)         # #1A184C indigo night
WHITE = (255, 255, 255)
OFF_WHITE = (240, 253, 250)
JOKOO_ACCENT = (255, 140, 122)   # #FF8C7A coral

# Fonts (Liberation Sans is bundled on Debian slim images)
FONT_DIR = "/usr/share/fonts/truetype/liberation"
FONT_BOLD = f"{FONT_DIR}/LiberationSans-Bold.ttf"
FONT_REG = f"{FONT_DIR}/LiberationSans-Regular.ttf"

SRC_DIR = Path("/root/.emergent/.screenshots")
OUT_DIR = Path("/app/store-assets/screenshots/final")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ---- Marketing content ------------------------------------------------------
# Each tuple: (source_file, title_line1, title_line2, tagline)
SCREENS = [
    ("01_home.jpeg",     "Trouvez le pro",         "qu'il vous faut.",       "Des milliers de prestataires vérifiés à portée de main."),
    ("02_search.jpeg",   "12 univers,",            "un seul geste.",         "Explorez toutes les catégories : beauté, santé, mobilité, famille…"),
    ("05_provider.jpeg", "Prestataires notés",     "& vérifiés.",            "Avis authentiques, badge Vérifié, réservation en un clic."),
    ("03_mobility.jpeg", "Voyagez et livrez",      "malin.",                 "Covoiturage et livraison longue distance à travers le Sénégal."),
    ("04_family.jpeg",   "Baby-sitters",           "de confiance.",          "Étudiants et professeurs vérifiés — pour toute la famille."),
    ("06_profile.jpeg",  "Réservez, suivez,",      "gagnez.",                "Vos réservations, favoris et programme partenaire en un tap."),
]


# ---- Helpers ---------------------------------------------------------------
def make_gradient(w: int, h: int) -> Image.Image:
    """Vertical 3-stop gradient: turquoise → teal → indigo night."""
    base = Image.new("RGB", (w, h), BG_TOP)
    pixels = base.load()
    third1 = int(h * 0.35)
    third2 = int(h * 0.70)
    for y in range(h):
        if y < third1:
            t = y / third1
            r = int(BG_TOP[0] + (BG_MID[0] - BG_TOP[0]) * t)
            g = int(BG_TOP[1] + (BG_MID[1] - BG_TOP[1]) * t)
            b = int(BG_TOP[2] + (BG_MID[2] - BG_TOP[2]) * t)
        elif y < third2:
            t = (y - third1) / (third2 - third1)
            r = int(BG_MID[0] + (BG_BOTTOM[0] - BG_MID[0]) * t)
            g = int(BG_MID[1] + (BG_BOTTOM[1] - BG_MID[1]) * t)
            b = int(BG_MID[2] + (BG_BOTTOM[2] - BG_MID[2]) * t)
        else:
            r, g, b = BG_BOTTOM
        for x in range(w):
            pixels[x, y] = (r, g, b)
    return base


def add_glow(bg: Image.Image) -> Image.Image:
    """Add a subtle radial highlight to give the gradient depth."""
    overlay = Image.new("RGB", bg.size, (0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    # Large soft coral highlight upper-right
    for r in range(600, 100, -40):
        alpha = int(255 * (600 - r) / 500 * 0.10)
        draw.ellipse(
            [CANVAS_W - 700 - r, -300 - r, CANVAS_W + 300 + r, 300 + r],
            fill=(alpha, alpha // 3, alpha // 6),
        )
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=120))
    return Image.blend(bg, Image.eval(overlay, lambda v: min(255, v)), 0.35)


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def draw_multiline_centered(
    draw: ImageDraw.ImageDraw,
    lines: list[str],
    font: ImageFont.FreeTypeFont,
    y: int,
    color: tuple[int, int, int],
    line_spacing: int = 18,
    max_width: Optional[int] = None,
) -> int:
    """Draw multiple lines centered horizontally. Returns final y (bottom)."""
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        x = (CANVAS_W - w) // 2
        # Subtle text shadow for legibility
        draw.text((x + 3, y + 4), line, font=font, fill=(0, 0, 0, 90))
        draw.text((x, y), line, font=font, fill=color)
        y += h + line_spacing
    return y


def wrap_lines(text: str, font: ImageFont.FreeTypeFont, draw: ImageDraw.ImageDraw, max_width: int) -> list[str]:
    """Simple greedy word-wrap by measured pixel width."""
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    line = words[0]
    for w in words[1:]:
        cand = f"{line} {w}"
        bbox = draw.textbbox((0, 0), cand, font=font)
        if bbox[2] - bbox[0] <= max_width:
            line = cand
        else:
            lines.append(line)
            line = w
    lines.append(line)
    return lines


def rounded_rect_mask(size: tuple[int, int], radius: int) -> Image.Image:
    """Return a grayscale mask for a rounded rectangle."""
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def paste_device_frame(canvas: Image.Image, screenshot_path: Path, top_y: int) -> None:
    """Composite the screenshot inside an iPhone-like rounded device frame."""
    ss = Image.open(screenshot_path).convert("RGB")
    # Target device inner width. Sized to fit vertically within the canvas
    # (title block + device + footer must all fit in 2796 px).
    device_w = 780
    scale = device_w / ss.width
    device_inner_h = int(ss.height * scale)
    ss_up = ss.resize((device_w, device_inner_h), Image.LANCZOS)

    # Bezel: draw dark outer rounded rect slightly bigger
    bezel_pad = 20
    frame_w = device_w + bezel_pad * 2
    frame_h = device_inner_h + bezel_pad * 2
    frame = Image.new("RGB", (frame_w, frame_h), (18, 18, 22))
    # Round the frame
    fmask = rounded_rect_mask((frame_w, frame_h), radius=68)
    # Round the screen inside
    smask = rounded_rect_mask((device_w, device_inner_h), radius=46)
    frame.paste(ss_up, (bezel_pad, bezel_pad), smask)

    # Drop shadow behind the frame
    shadow = Image.new("RGB", (frame_w + 120, frame_h + 120), (0, 0, 0))
    shadow_mask = Image.new("L", shadow.size, 0)
    ImageDraw.Draw(shadow_mask).rounded_rectangle(
        [60, 60, frame_w + 60, frame_h + 60], radius=80, fill=110
    )
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(radius=38))
    shadow_x = (CANVAS_W - shadow.size[0]) // 2
    shadow_y = top_y - 60
    canvas.paste(shadow, (shadow_x, shadow_y), shadow_mask)

    frame_x = (CANVAS_W - frame_w) // 2
    canvas.paste(frame, (frame_x, top_y), fmask)


def compose(idx: int, src_name: str, t1: str, t2: str, tagline: str) -> Path:
    canvas = make_gradient(CANVAS_W, CANVAS_H)
    canvas = add_glow(canvas)
    draw = ImageDraw.Draw(canvas)

    # ── Title (2 lines, big bold)
    title_font = load_font(FONT_BOLD, 96)
    title_y = 130
    lines = [t1, t2]
    draw_multiline_centered(draw, lines, title_font, title_y, WHITE, line_spacing=4)

    # ── Tagline
    tag_font = load_font(FONT_REG, 36)
    tag_lines = wrap_lines(tagline, tag_font, draw, max_width=1080)
    tag_y = title_y + 96 * 2 + 34
    draw_multiline_centered(draw, tag_lines, tag_font, tag_y, OFF_WHITE, line_spacing=8)

    # ── Device with screenshot (starts below the title/tagline block)
    device_top = 700
    paste_device_frame(canvas, SRC_DIR / src_name, device_top)

    # ── Footer wordmark
    foot_font = load_font(FONT_BOLD, 68)
    foot_text = "Jokoo"
    bbox = draw.textbbox((0, 0), foot_text, font=foot_font)
    fw = bbox[2] - bbox[0]
    fx = (CANVAS_W - fw) // 2
    fy = CANVAS_H - 190
    # coral accent dot
    dot_r = 12
    draw.ellipse([fx - 34, fy + 30, fx - 34 + dot_r * 2, fy + 30 + dot_r * 2], fill=JOKOO_ACCENT)
    draw.text((fx, fy), foot_text, font=foot_font, fill=WHITE)

    tagline2_font = load_font(FONT_REG, 30)
    sub = "Services · Mobilité · Famille"
    bbox = draw.textbbox((0, 0), sub, font=tagline2_font)
    sw = bbox[2] - bbox[0]
    draw.text(((CANVAS_W - sw) // 2, fy + 82), sub, font=tagline2_font, fill=OFF_WHITE)

    # ── Save (PNG, RGB, no alpha)
    if canvas.mode != "RGB":
        canvas = canvas.convert("RGB")
    out_path = OUT_DIR / f"jokoo_appstore_0{idx}.png"
    canvas.save(out_path, "PNG", optimize=True)
    return out_path


def main() -> None:
    for idx, (src, t1, t2, tag) in enumerate(SCREENS, start=1):
        src_path = SRC_DIR / src
        if not src_path.exists():
            print(f"⚠ Missing source: {src}")
            continue
        out = compose(idx, src, t1, t2, tag)
        size_kb = out.stat().st_size // 1024
        img = Image.open(out)
        print(f"✓ {out.name}  ({img.size[0]}x{img.size[1]}, {img.mode}, {size_kb} KB)")

    print(f"\nAll files saved to: {OUT_DIR}")


if __name__ == "__main__":
    main()

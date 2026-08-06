#!/usr/bin/env python3
"""
Jokoo iPad 13" App Store screenshot compositor.
Same design system as the iPhone compositor but at iPad Pro 13" (M4) resolution.

Target: 2064 x 2752 px — REQUIRED by App Store Connect for iPad 13" builds
built with `supportsTablet: true`. Once a new build is uploaded with
`supportsTablet: false`, this requirement will disappear.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---- Design constants (iPad 13") ----
CANVAS_W, CANVAS_H = 2064, 2752  # App Store Connect required: iPad Pro 13" (M4)
BG_TOP = (24, 198, 163)
BG_MID = (13, 148, 136)
BG_BOTTOM = (26, 24, 76)
WHITE = (255, 255, 255)
OFF_WHITE = (240, 253, 250)
JOKOO_ACCENT = (255, 140, 122)

FONT_DIR = "/usr/share/fonts/truetype/liberation"
FONT_BOLD = f"{FONT_DIR}/LiberationSans-Bold.ttf"
FONT_REG = f"{FONT_DIR}/LiberationSans-Regular.ttf"

SRC_DIR = Path("/root/.emergent/.screenshots")
OUT_DIR = Path("/app/store-assets/screenshots/ipad")
OUT_DIR.mkdir(parents=True, exist_ok=True)

SCREENS = [
    ("01_home.jpeg",       "Trouvez le pro",         "qu'il vous faut.",       "Des milliers de prestataires vérifiés à portée de main."),
    ("02_search.jpeg",     "12 univers,",            "un seul geste.",         "Explorez toutes les catégories : beauté, santé, mobilité, famille…"),
    ("05_provider.jpeg",   "Prestataires notés",     "& vérifiés.",            "Avis authentiques, badge Vérifié, réservation en un clic."),
    ("03_mobility.jpeg",   "Voyagez et livrez",      "malin.",                 "Covoiturage et livraison longue distance à travers le Sénégal."),
    ("04_family.jpeg",     "Baby-sitters",           "de confiance.",          "Étudiants et professeurs vérifiés — pour toute la famille."),
    ("08_chat_1.jpeg",     "Chat sécurisé",          "en temps réel.",         "Négociez, confirmez, planifiez avec chaque prestataire."),
    ("09_booking.jpeg",    "Réservez en",            "4 étapes.",              "Date, heure, adresse, confirmation — un flow épuré."),
    ("10_ambassador.jpeg", "Parrainez,",             "gagnez chaque mois.",    "Programme Jokoo Partners : commissions en XOF."),
]


def make_gradient(w: int, h: int) -> Image.Image:
    base = Image.new("RGB", (w, h), BG_TOP)
    pix = base.load()
    t1 = int(h * 0.35)
    t2 = int(h * 0.70)
    for y in range(h):
        if y < t1:
            t = y / t1
            r = int(BG_TOP[0] + (BG_MID[0] - BG_TOP[0]) * t)
            g = int(BG_TOP[1] + (BG_MID[1] - BG_TOP[1]) * t)
            b = int(BG_TOP[2] + (BG_MID[2] - BG_TOP[2]) * t)
        elif y < t2:
            t = (y - t1) / (t2 - t1)
            r = int(BG_MID[0] + (BG_BOTTOM[0] - BG_MID[0]) * t)
            g = int(BG_MID[1] + (BG_BOTTOM[1] - BG_MID[1]) * t)
            b = int(BG_MID[2] + (BG_BOTTOM[2] - BG_MID[2]) * t)
        else:
            r, g, b = BG_BOTTOM
        for x in range(w):
            pix[x, y] = (r, g, b)
    return base


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def draw_multiline_centered(draw, lines, font, y, color, line_spacing=8):
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        x = (CANVAS_W - w) // 2
        draw.text((x + 4, y + 5), line, font=font, fill=(0, 0, 0))
        draw.text((x, y), line, font=font, fill=color)
        y += h + line_spacing
    return y


def wrap_lines(text, font, draw, max_w):
    words = text.split()
    if not words:
        return []
    lines, line = [], words[0]
    for w in words[1:]:
        cand = f"{line} {w}"
        bbox = draw.textbbox((0, 0), cand, font=font)
        if bbox[2] - bbox[0] <= max_w:
            line = cand
        else:
            lines.append(line)
            line = w
    lines.append(line)
    return lines


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def paste_device(canvas, screenshot_path, top_y):
    ss = Image.open(screenshot_path).convert("RGB")
    # iPad-scaled device — 1080 px wide, generously centered
    device_w = 1080
    scale = device_w / ss.width
    device_h = int(ss.height * scale)
    ss_up = ss.resize((device_w, device_h), Image.LANCZOS)
    bez = 26
    fw = device_w + bez * 2
    fh = device_h + bez * 2
    frame = Image.new("RGB", (fw, fh), (18, 18, 22))
    fmask = rounded_mask((fw, fh), radius=86)
    smask = rounded_mask((device_w, device_h), radius=60)
    frame.paste(ss_up, (bez, bez), smask)
    # shadow
    shadow = Image.new("RGB", (fw + 160, fh + 160), (0, 0, 0))
    shmask = Image.new("L", shadow.size, 0)
    ImageDraw.Draw(shmask).rounded_rectangle([80, 80, fw + 80, fh + 80], radius=100, fill=120)
    shmask = shmask.filter(ImageFilter.GaussianBlur(radius=50))
    shx = (CANVAS_W - shadow.size[0]) // 2
    shy = top_y - 80
    canvas.paste(shadow, (shx, shy), shmask)
    fx = (CANVAS_W - fw) // 2
    canvas.paste(frame, (fx, top_y), fmask)


def compose(idx, src, t1, t2, tagline):
    canvas = make_gradient(CANVAS_W, CANVAS_H)
    d = ImageDraw.Draw(canvas)
    title_font = load_font(FONT_BOLD, 140)
    tag_font = load_font(FONT_REG, 52)
    title_y = 200
    draw_multiline_centered(d, [t1, t2], title_font, title_y, WHITE, 6)
    tag_y = title_y + 140 * 2 + 50
    tag_lines = wrap_lines(tagline, tag_font, d, 1700)
    draw_multiline_centered(d, tag_lines, tag_font, tag_y, OFF_WHITE, 10)
    device_top = 900
    paste_device(canvas, SRC_DIR / src, device_top)
    # footer
    foot_font = load_font(FONT_BOLD, 90)
    foot = "Jokoo"
    bbox = d.textbbox((0, 0), foot, font=foot_font)
    fw_x = bbox[2] - bbox[0]
    fx = (CANVAS_W - fw_x) // 2
    fy = CANVAS_H - 220
    d.ellipse([fx - 48, fy + 42, fx - 48 + 32, fy + 42 + 32], fill=JOKOO_ACCENT)
    d.text((fx, fy), foot, font=foot_font, fill=WHITE)
    sub_font = load_font(FONT_REG, 42)
    sub = "Services · Mobilité · Famille"
    bbox = d.textbbox((0, 0), sub, font=sub_font)
    sw = bbox[2] - bbox[0]
    d.text(((CANVAS_W - sw) // 2, fy + 112), sub, font=sub_font, fill=OFF_WHITE)
    if canvas.mode != "RGB":
        canvas = canvas.convert("RGB")
    out = OUT_DIR / f"jokoo_ipad_{idx:02d}.png"
    canvas.save(out, "PNG", optimize=True)
    return out


def main():
    for idx, (src, t1, t2, tag) in enumerate(SCREENS, start=1):
        src_path = SRC_DIR / src
        if not src_path.exists():
            print(f"⚠ Missing: {src}")
            continue
        out = compose(idx, src, t1, t2, tag)
        img = Image.open(out)
        print(f"✓ {out.name}  ({img.size[0]}x{img.size[1]}, {img.mode}, {out.stat().st_size // 1024} KB)")
    print(f"\nAll iPad files saved to: {OUT_DIR}")


if __name__ == "__main__":
    main()

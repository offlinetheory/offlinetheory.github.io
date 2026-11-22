#!/usr/bin/env python3
"""Render typographic magazine pages for the About page-turn.

Re-paginated Nov 22, 2026: the four About sections each get their own
spread (8 pages total) so body type can be ~1.5x larger than the first
4-page version and still have generous white space. Copy is taken
verbatim from src/data/about.js — nothing is rewritten or invented.

Page geometry: 1572 x 2596 (393 x 649 at SCALE 4). Displayed, a page is
about 26% of the magazine width, so 68pt body here reads ~15px when the
magazine is shown at ~1500px wide, ~13px at the 94vh height limit on a
900px-tall desktop viewport.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
FONTS = Path("/tmp/about-fonts")
OUT = ROOT / "src/assets/about/pages"
OUT.mkdir(parents=True, exist_ok=True)

PAGE = (247, 245, 240, 255)
INK = (8, 8, 8, 255)
INK_SOFT = (8, 8, 8, 220)
RULE = (8, 8, 8, 160)
SCALE = 4
W, H = 393 * SCALE, 649 * SCALE  # 1572 x 2596
MARGIN = int(W * 0.11)           # 173
COL = W - 2 * MARGIN             # 1226


def font(path, size, weight=None):
    f = ImageFont.truetype(str(path), size)
    if weight is not None and hasattr(f, "set_variation_by_axes"):
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    return f


def width_of(fnt, text):
    if not text:
        return 0
    b = fnt.getbbox(text)
    return b[2] - b[0]


def draw_tracked(draw, xy, text, fnt, fill, tracking=0):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += width_of(fnt, ch) + tracking
    return x


def wrap(text, fnt, max_w):
    words = text.split()
    lines, cur = [], ""
    for word in words:
        trial = word if not cur else f"{cur} {word}"
        if width_of(fnt, trial) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def paper():
    img = Image.new("RGBA", (W, H), PAGE)
    noise = Image.effect_noise((W, H), 8).convert("L")
    noise = noise.point(lambda v: 128 + (v - 128) // 6)
    grain = Image.merge("RGBA", (noise, noise, noise, Image.new("L", (W, H), 18)))
    img = Image.alpha_composite(img, grain)
    return img


def folio(draw, number, y):
    fnt = font(FONTS / "inter-var.ttf", 30, weight=500)
    label = "OFFLINE THEORY"
    num = f"{int(number):02d}"
    draw_tracked(draw, (MARGIN, y), label, fnt, INK, tracking=5)
    nw = width_of(fnt, num)
    draw.text((MARGIN + COL - nw, y), num, font=fnt, fill=INK)
    return y + 58


def rule(draw, y, x2=None, w=3):
    draw.rectangle((MARGIN, y, x2 or (MARGIN + COL), y + w), fill=RULE)


def body_block(draw, text, y, size=68, leading=96, fnt_path=None):
    body = font(fnt_path or FONTS / "source-serif-400.ttf", size)
    for ln in wrap(text, body, COL):
        draw.text((MARGIN, y), ln, font=body, fill=INK)
        y += leading
    return y


def save(img, name):
    path = OUT / name
    img.save(path, "WEBP", quality=94, method=6)
    print("wrote", path, path.stat().st_size)


def new_page(number):
    img = paper()
    d = ImageDraw.Draw(img)
    y = int(H * 0.075)
    y = folio(d, number, y)
    rule(d, y)
    return img, d, y + 84


# --- Page 1: introduction — title + dek ---
def page1():
    img, d, y = new_page(1)
    title = font(FONTS / "bodoni-var.ttf", 200, weight=900)
    for line in ("OFFLINE", "THEORY"):
        draw_tracked(d, (MARGIN, y), line, title, INK, tracking=-3)
        y += int(200 * 0.88)
    y += 64
    dek = "Offline Theory is an independent publishing initiative exploring cybersecurity, technology, and the culture of the internet."
    dek_f = font(FONTS / "source-serif-700.ttf", 60)
    for ln in wrap(dek.upper(), dek_f, COL):
        d.text((MARGIN, y), ln, font=dek_f, fill=INK)
        y += 84
    print("page-1 content ends at y", y, "of", H)
    save(img, "page-1.webp")


# --- Page 2: introduction — the two body paragraphs ---
def page2():
    img, d, y = new_page(2)
    paras = [
        "We started from a simple observation: the systems that shape everyday life are discussed either in jargon or in panic. Offline Theory sits in between. We write about security the way a good magazine writes about architecture, with attention to how things are built, who they serve, and what they cost.",
        "The name is a reminder, not a rule. Stepping away from the network, even briefly, is often the clearest way to understand it.",
    ]
    for para in paras:
        y = body_block(d, para, y, size=68, leading=100)
        y += 44
    print("page-2 content ends at y", y, "of", H)
    save(img, "page-2.webp")


# --- Pages 3–4: editorial principles, two per page ---
PRINCIPLES = [
    ("01", "Plain language", "Security writing should be readable by the people it affects. We define our terms and skip the fear."),
    ("02", "Independence", "We do not publish vendor-written copy. When an article includes affiliate links, we say so next to those links. Recommendations are made on the merits, not the commission."),
    ("03", "Verification", "Claims about vulnerabilities and incidents are sourced to advisories, researchers or primary documents."),
    ("04", "Restraint", "We publish less, on purpose. A weekly dispatch, a quarterly journal, and nothing that exists only to fill a feed."),
]


def principles_page(number, items, title_lines=True):
    img, d, y = new_page(number)
    if title_lines:
        title = font(FONTS / "bodoni-var.ttf", 110, weight=900)
        draw_tracked(d, (MARGIN, y), "EDITORIAL", title, INK, tracking=-1)
        y += int(110 * 0.92)
        draw_tracked(d, (MARGIN, y), "PRINCIPLES", title, INK, tracking=-1)
        y += int(110 * 0.95) + 56
    else:
        y += 20
    num_f = font(FONTS / "inter-var.ttf", 30, weight=500)
    for num, name, text in items:
        draw_tracked(d, (MARGIN, y), f"{num}  —  {name.upper()}", num_f, INK, tracking=4)
        y += 58
        y = body_block(d, text, y, size=62, leading=90)
        y += 64
    print(f"page-{number} content ends at y", y, "of", H)
    save(img, f"page-{number}.webp")


def page3():
    principles_page(3, PRINCIPLES[:2], title_lines=True)


def page4():
    principles_page(4, PRINCIPLES[2:], title_lines=False)


# --- Page 5: masthead — name and role ---
def page5():
    img, d, y = new_page(5)
    kicker = font(FONTS / "inter-var.ttf", 30, weight=500)
    draw_tracked(d, (MARGIN, y), "MASTHEAD", kicker, INK, tracking=6)
    y += 62
    draw_tracked(d, (MARGIN, y), "FOUNDER  &  EDITOR", kicker, INK, tracking=5)
    y += 120
    name = font(FONTS / "bodoni-var.ttf", 120, weight=900)
    d.text((MARGIN, y), "Jamiah", font=name, fill=INK)
    y += int(120 * 0.92)
    d.text((MARGIN, y), "McQuiller", font=name, fill=INK)
    y += int(120 * 1.05) + 48
    rule(d, y, x2=MARGIN + int(COL * 0.42))
    print("page-5 content ends at y", y, "of", H)
    save(img, "page-5.webp")


# --- Page 6: masthead — biography ---
def page6():
    img, d, y = new_page(6)
    y += 120  # let the bio sit lower, magazine-style, opposite the name
    bio = "Jamiah is a Security+ certified IT End User Computing Technician (vulnerability and patch management) and an M.S. Cybersecurity student at the University of Michigan – Flint. She is based in Flint, Michigan."
    y = body_block(d, bio, y, size=72, leading=108)
    print("page-6 content ends at y", y, "of", H)
    save(img, "page-6.webp")


# --- Page 7: contact — lead + email ---
def page7():
    img, d, y = new_page(7)
    kicker = font(FONTS / "inter-var.ttf", 30, weight=500)
    title = font(FONTS / "bodoni-var.ttf", 150, weight=900)
    draw_tracked(d, (MARGIN, y), "CONTACT", kicker, INK, tracking=6)
    y += 72
    d.text((MARGIN, y), "Contact", font=title, fill=INK)
    y += 190
    y = body_block(d, "Tips, corrections and letters:", y, size=68, leading=96)
    y += 16
    email = "offlinetheory@proton.me"
    mail_f = font(FONTS / "source-serif-600.ttf", 68)
    d.text((MARGIN, y), email, font=mail_f, fill=INK)
    ew = width_of(mail_f, email)
    d.rectangle((MARGIN, y + 94, MARGIN + ew, y + 97), fill=INK)
    y += 150
    print("page-7 content ends at y", y, "of", H)
    save(img, "page-7.webp")


# --- Page 8: contact — secure drop + disclosure ---
def page8():
    img, d, y = new_page(8)
    y += 40
    drop = "For sensitive tips, we recommend an end-to-end encrypted channel. A secure-drop address will be published here once it exists."
    y = body_block(d, drop, y, size=68, leading=96)
    y += 72
    rule(d, y)
    y += 64
    aff = "OFFLINE THEORY may earn a commission if you buy through links we mark as sponsored. That does not change our recommendations."
    y = body_block(d, aff, y, size=62, leading=88, fnt_path=FONTS / "source-serif-400i.ttf")
    print("page-8 content ends at y", y, "of", H)
    save(img, "page-8.webp")


def opening_right():
    """Kept for reference only: regenerating the first turning sheet needs
    opening-1505.webp / hands-1505.webp, which are not in this repo.
    The existing src/assets/about/pages/opening-right.webp is unchanged."""
    raise RuntimeError("opening-right.webp is not regenerated here; see docstring")


if __name__ == "__main__":
    page1()
    page2()
    page3()
    page4()
    page5()
    page6()
    page7()
    page8()

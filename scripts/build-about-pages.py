#!/usr/bin/env python3
"""Render typographic magazine pages and the opening-right texture for the About page-turn."""
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


def height_of(fnt, text="Hg"):
    b = fnt.getbbox(text)
    return b[3] - b[1]


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
    # faint fiber
    noise = Image.effect_noise((W, H), 8).convert("L")
    noise = noise.point(lambda v: 128 + (v - 128) // 6)
    grain = Image.merge("RGBA", (noise, noise, noise, Image.new("L", (W, H), 18)))
    img = Image.alpha_composite(img, grain)
    return img


def folio(draw, number, y, margin, col):
    fnt = font(FONTS / "inter-var.ttf", 22, weight=500)
    label = "OFFLINE THEORY"
    num = f"{int(number):02d}"
    draw_tracked(draw, (margin, y), label, fnt, INK, tracking=4)
    nw = width_of(fnt, num)
    draw.text((margin + col - nw, y), num, font=fnt, fill=INK)
    return y + 48


def rule(draw, x1, x2, y, w=2):
    draw.rectangle((x1, y, x2, y + w), fill=RULE)


def save(img, name):
    path = OUT / name
    img.save(path, "WEBP", quality=94, method=6)
    print("wrote", path, path.stat().st_size)


# --- Page 1: introduction and philosophy ---
def page1():
    img = paper()
    d = ImageDraw.Draw(img)
    margin = int(W * 0.11)
    col = W - 2 * margin
    y = int(H * 0.075)
    y = folio(d, 1, y, margin, col)
    rule(d, margin, margin + col, y)
    y += 70

    title = font(FONTS / "bodoni-var.ttf", 168, weight=900)
    for line, tracking in (("OFFLINE", -3), ("THEORY", -3)):
        draw_tracked(d, (margin, y), line, title, INK, tracking=tracking)
        y += int(168 * 0.86)
    y += 54

    dek = "Offline Theory is an independent publishing initiative exploring cybersecurity, technology, and the culture of the internet."
    dek_f = font(FONTS / "source-serif-700.ttf", 42)
    for ln in wrap(dek.upper(), dek_f, col):
        d.text((margin, y), ln, font=dek_f, fill=INK)
        y += 56
    y += 48

    body = font(FONTS / "source-serif-400.ttf", 44)
    leading = 66
    paras = [
        "We started from a simple observation: the systems that shape everyday life are discussed either in jargon or in panic. Offline Theory sits in between. We write about security the way a good magazine writes about architecture, with attention to how things are built, who they serve, and what they cost.",
        "The name is a reminder, not a rule. Stepping away from the network, even briefly, is often the clearest way to understand it.",
    ]
    for para in paras:
        for ln in wrap(para, body, col):
            d.text((margin, y), ln, font=body, fill=INK)
            y += leading
        y += 28
    save(img, "page-1.webp")


# --- Page 2: editorial principles ---
def page2():
    img = paper()
    d = ImageDraw.Draw(img)
    margin = int(W * 0.11)
    col = W - 2 * margin
    y = int(H * 0.075)
    y = folio(d, 2, y, margin, col)
    rule(d, margin, margin + col, y)
    y += 64

    title = font(FONTS / "bodoni-var.ttf", 96, weight=900)
    # two-line title so it is not squeezed
    draw_tracked(d, (margin, y), "EDITORIAL", title, INK, tracking=-1)
    y += int(96 * 0.9)
    draw_tracked(d, (margin, y), "PRINCIPLES", title, INK, tracking=-1)
    y += int(96 * 0.95) + 36

    principles = [
        ("01", "Plain language", "Security writing should be readable by the people it affects. We define our terms and skip the fear."),
        ("02", "Independence", "We do not publish vendor-written copy. When an article includes affiliate links, we say so next to those links. Recommendations are made on the merits, not the commission."),
        ("03", "Verification", "Claims about vulnerabilities and incidents are sourced to advisories, researchers or primary documents."),
        ("04", "Restraint", "We publish less, on purpose. A weekly dispatch, a quarterly journal, and nothing that exists only to fill a feed."),
    ]
    num_f = font(FONTS / "inter-var.ttf", 22, weight=500)
    name_f = font(FONTS / "bodoni-var.ttf", 52, weight=700)
    body = font(FONTS / "source-serif-400.ttf", 38)
    for num, name, text in principles:
        label = f"{num}  —  {name.upper()}"
        draw_tracked(d, (margin, y), label, num_f, INK, tracking=3)
        y += 40
        # name is already in the label; body follows
        for ln in wrap(text, body, col):
            d.text((margin, y), ln, font=body, fill=INK)
            y += 54
        y += 36
    save(img, "page-2.webp")


# --- Page 3: masthead and bio ---
def page3():
    img = paper()
    d = ImageDraw.Draw(img)
    margin = int(W * 0.11)
    col = W - 2 * margin
    y = int(H * 0.075)
    y = folio(d, 3, y, margin, col)
    rule(d, margin, margin + col, y)
    y += 80

    kicker = font(FONTS / "inter-var.ttf", 24, weight=500)
    draw_tracked(d, (margin, y), "MASTHEAD", kicker, INK, tracking=5)
    y += 48
    draw_tracked(d, (margin, y), "FOUNDER  &  EDITOR", kicker, INK, tracking=4)
    y += 90

    name = font(FONTS / "bodoni-var.ttf", 110, weight=900)
    # name may wrap
    full = "Jamiah McQuiller"
    if width_of(name, full) <= col:
        d.text((margin, y), full, font=name, fill=INK)
        y += int(110 * 1.05)
    else:
        d.text((margin, y), "Jamiah", font=name, fill=INK)
        y += int(110 * 0.9)
        d.text((margin, y), "McQuiller", font=name, fill=INK)
        y += int(110 * 1.05)
    y += 40
    rule(d, margin, margin + int(col * 0.42), y, w=2)
    y += 56

    bio = "Jamiah is a Security+ certified IT End User Computing Technician (vulnerability and patch management) and an M.S. Cybersecurity student at the University of Michigan – Flint. She is based in Flint, Michigan."
    body = font(FONTS / "source-serif-400.ttf", 44)
    for ln in wrap(bio, body, col):
        d.text((margin, y), ln, font=body, fill=INK)
        y += 66
    save(img, "page-3.webp")


# --- Page 4: contact and disclosure ---
def page4():
    img = paper()
    d = ImageDraw.Draw(img)
    margin = int(W * 0.11)
    col = W - 2 * margin
    y = int(H * 0.075)
    y = folio(d, 4, y, margin, col)
    rule(d, margin, margin + col, y)
    y += 80

    kicker = font(FONTS / "inter-var.ttf", 24, weight=500)
    title = font(FONTS / "bodoni-var.ttf", 120, weight=900)
    body = font(FONTS / "source-serif-400.ttf", 44)
    body_i = font(FONTS / "source-serif-400i.ttf", 40)
    mail_f = font(FONTS / "source-serif-600.ttf", 44)

    draw_tracked(d, (margin, y), "CONTACT", kicker, INK, tracking=5)
    y += 56
    d.text((margin, y), "Contact", font=title, fill=INK)
    y += 150

    lead = "Tips, corrections and letters:"
    for ln in wrap(lead, body, col):
        d.text((margin, y), ln, font=body, fill=INK)
        y += 66
    y += 8
    email = "offlinetheory@proton.me"
    d.text((margin, y), email, font=mail_f, fill=INK)
    ew = width_of(mail_f, email)
    d.rectangle((margin, y + 52, margin + ew, y + 54), fill=INK)
    y += 100

    drop = "For sensitive tips, we recommend an end-to-end encrypted channel. A secure-drop address will be published here once it exists."
    for ln in wrap(drop, body, col):
        d.text((margin, y), ln, font=body, fill=INK)
        y += 66
    y += 56
    rule(d, margin, margin + col, y)
    y += 48
    aff = "OFFLINE THEORY may earn a commission if you buy through links we mark as sponsored. That does not change our recommendations."
    for ln in wrap(aff, body_i, col):
        d.text((margin, y), ln, font=body_i, fill=INK)
        y += 60
    save(img, "page-4.webp")


def opening_right():
    """Crop the cleaned opening photograph's right page and lift the thumb off the texture."""
    opening = Image.open(ROOT / "src/assets/about/opening-1505.webp").convert("RGBA")
    hands = Image.open(ROOT / "src/assets/about/hands-1505.webp").convert("RGBA")
    box = (775, 200, 1168, 849)  # 393 x 649
    crop = opening.crop(box)
    hand = hands.crop(box)
    paper_c = (247, 245, 240, 255)
    # Where the overlay hands sit on the leaf, fill with paper so the thumb
    # stays with the fixed hands layer and does not ride the turning page.
    hx = hand.split()[-1].point(lambda a: 255 if a > 24 else 0)
    # feather the punch
    hx = hx.filter(ImageFilter.GaussianBlur(1.2))
    fill = Image.new("RGBA", crop.size, paper_c)
    crop = Image.composite(fill, crop, hx)
    path = OUT / "opening-right.webp"
    crop.save(path, "WEBP", quality=94, method=6)
    print("wrote", path, path.stat().st_size, crop.size)


if __name__ == "__main__":
    page1()
    page2()
    page3()
    page4()
    opening_right()

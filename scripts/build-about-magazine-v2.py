#!/usr/bin/env python3
"""Build opening magazine assets from about-magazine-v2.png.

Removes leftover NEZ / INTERVIEW / perfumography type, prints an Offline Theory
folio and intro, punches the studio, extracts hands and a swappable portrait.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/workspace/about-source/about-magazine-v2.png")
FONTS = Path("/tmp/about-fonts")
ABOUT = ROOT / "src/assets/about"
PAGES = ABOUT / "pages"
PAGES.mkdir(parents=True, exist_ok=True)

# Measured on the 1904×1328 photograph
W, H = 1904, 1328
SPINE_X = 975
PAGE_TOP = 243
PAGE_BOT = 1069
LEFT_INNER = 450
RIGHT_INNER = 1470
BOOK_LEFT = 399
BOOK_RIGHT = 1509
PORTRAIT = (480, 283, 960, 1033)  # l,t,r,b
FOLIO_BOXES = [
    (1135, 258, 1220, 280),  # INTERVIEW
    (1338, 258, 1445, 280),  # NEZ #10 / 39
]
BODY_BOX = (1168, 470, 1460, 860)  # perfume paragraph, right of ABOUT
RIGHT_LEAF = (SPINE_X, PAGE_TOP, RIGHT_INNER, PAGE_BOT)
LEFT_LEAF = (LEFT_INNER, PAGE_TOP, SPINE_X, PAGE_BOT)

PAPER = (240, 240, 240, 255)
INK = (8, 8, 8, 255)
INTRO = (
    "Offline Theory is an independent publishing initiative exploring "
    "cybersecurity, technology, and the culture of the internet."
)


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


def is_skin(rgb):
    r, g, b = [int(v) for v in rgb[:3]]
    # Dark / medium brown skin in this photo; avoid paper and hair-black
    if r < 25 and g < 25 and b < 25:
        return False
    if r > 230 and g > 230 and b > 230:
        return False
    return r > g + 8 and r > b + 8 and r > 40 and g < 180


def sample_paper(arr, box, avoid_dark=80):
    l, t, r, b = box
    patch = arr[t:b, l:r]
    lum = patch.mean(axis=2)
    m = lum > avoid_dark
    if m.sum() < 50:
        return PAPER
    mean = patch[m][:, :3].mean(axis=0)
    return (int(mean[0]), int(mean[1]), int(mean[2]), 255)


def fill_type(img, box, paper, protect=None):
    """Fill dark typographic pixels in box with paper, optionally protecting a mask."""
    arr = np.array(img)
    l, t, r, b = box
    l = max(0, l); t = max(0, t); r = min(arr.shape[1], r); b = min(arr.shape[0], b)
    region = arr[t:b, l:r]
    lum = region.astype(np.int16).mean(axis=2)
    # Dark ink (and mid anti-aliased gray)
    ink = lum < 200
    # Dilate slightly to catch halos
    from PIL import ImageFilter as F
    m = Image.fromarray((ink * 255).astype(np.uint8), "L")
    m = m.filter(F.MaxFilter(3))
    mask = np.array(m) > 0
    if protect is not None:
        prot = protect[t:b, l:r]
        mask = mask & (~prot)
    # Don't fill skin (thumb)
    skin = np.zeros(mask.shape, dtype=bool)
    for y in range(region.shape[0]):
        for x in range(region.shape[1]):
            if mask[y, x] and is_skin(region[y, x]):
                skin[y, x] = True
    mask = mask & (~skin)
    region[mask] = paper[: region.shape[2]] if region.ndim == 3 else paper
    arr[t:b, l:r] = region
    return Image.fromarray(arr)


def punch_studio(img):
    """Make the near-white studio transparent without eating page paper."""
    arr = np.array(img.convert("RGBA"))
    h, w = arr.shape[:2]
    lum = arr[:, :, :3].mean(axis=2)
    # Barrier: book + hands. Hands are dark; book is the rectangle plus a little pad.
    # Flood from the edges through pixels close to the studio color, stopping at barrier.
    studio = arr[8, 8, :3].astype(np.int16)
    dist = np.sqrt(((arr[:, :, :3].astype(np.int32) - studio.astype(np.int32)) ** 2).sum(axis=2))
    # Pages are ~240 vs studio ~249, dist ~16. Use a tight threshold but
    # also a geometric barrier so we never enter the book interior.
    walkable = dist < 18
    # Force the book + arm silhouettes to be barriers:
    # anything sufficiently darker than studio, or inside the page boxes
    barrier = np.zeros((h, w), dtype=bool)
    barrier[PAGE_TOP - 4 : PAGE_BOT + 8, BOOK_LEFT : BOOK_RIGHT + 6] = True
    # But allow flood in the studio *around* the book — the barrier is only
    # the book block. Hands extend outside that block and must also be barriers.
    # Hands/arms: not walkable (already dist>=14). Good.
    walkable[barrier] = False
    # Also don't walk onto clearly non-studio pixels
    # Flood
    from collections import deque
    vis = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, 1, 2, h - 1, h - 2, h - 3):
            if walkable[y, x]:
                q.append((x, y))
                vis[y, x] = True
    for y in range(h):
        for x in (0, 1, 2, w - 1, w - 2, w - 3):
            if walkable[y, x] and not vis[y, x]:
                q.append((x, y))
                vis[y, x] = True
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not vis[ny, nx] and walkable[ny, nx]:
                vis[ny, nx] = True
                q.append((nx, ny))
    # Soften the punch
    alpha = np.where(vis, 0, 255).astype(np.uint8)
    aimg = Image.fromarray(alpha, "L")
    aimg = aimg.filter(ImageFilter.GaussianBlur(0.8))
    arr[:, :, 3] = np.array(aimg)
    # Force book pages fully opaque
    arr[PAGE_TOP:PAGE_BOT, LEFT_INNER:RIGHT_INNER, 3] = 255
    return Image.fromarray(arr)


def extract_hands(full):
    """Hands + thumbs + book edges over a transparent ground, page interiors cleared."""
    arr = np.array(full.convert("RGBA"))
    h, w = arr.shape[:2]
    # Clear left and right page interiors, but keep thumbs (skin) and a strip
    # along the spine / outer stacks.
    def clear_rect(l, t, r, b, keep_skin=True):
        region = arr[t:b, l:r]
        if keep_skin:
            keep = np.zeros(region.shape[:2], dtype=bool)
            for y in range(region.shape[0]):
                # Only search near left/right edges for thumbs
                for x in range(region.shape[1]):
                    if is_skin(region[y, x]):
                        keep[y, x] = True
            # Dilate skin slightly so anti-aliased edges stay
            k = Image.fromarray((keep * 255).astype(np.uint8), "L")
            k = k.filter(ImageFilter.MaxFilter(5))
            keep = np.array(k) > 0
            region[..., 3] = np.where(keep, region[..., 3], 0)
        else:
            region[..., 3] = 0
        arr[t:b, l:r] = region

    # Inset so book edges / stacks / spine stay in the overlay
    clear_rect(LEFT_INNER + 8, PAGE_TOP + 4, SPINE_X - 6, PAGE_BOT - 4, True)
    clear_rect(SPINE_X + 6, PAGE_TOP + 4, RIGHT_INNER - 4, PAGE_BOT - 4, True)
    return Image.fromarray(arr)


def main():
    src = Image.open(SRC).convert("RGBA")
    assert src.size == (W, H), src.size
    arr = np.array(src)
    paper = sample_paper(arr, (1200, 350, 1350, 470))
    print("sampled paper", paper)

    # Protect ABOUT letters (dark vertical type on the right page, left of the body)
    lum = arr[:, :, :3].mean(axis=2)
    about_mask = np.zeros((H, W), dtype=bool)
    about_mask[300:PAGE_BOT, 1008:1170] = lum[300:PAGE_BOT, 1008:1170] < 60

    def fill_solid(im, box, paper, protect=None):
        arr = np.array(im)
        l, t, r, b = box
        l = max(0, l); t = max(0, t); r = min(arr.shape[1], r); b = min(arr.shape[0], b)
        region = arr[t:b, l:r]
        skin = np.zeros(region.shape[:2], dtype=bool)
        for y in range(region.shape[0]):
            for x in range(region.shape[1]):
                if is_skin(region[y, x]):
                    skin[y, x] = True
        k = Image.fromarray((skin * 255).astype(np.uint8), "L").filter(ImageFilter.MaxFilter(5))
        skin = np.array(k) > 0
        mask = ~skin
        if protect is not None:
            mask = mask & (~protect[t:b, l:r])
        region[mask] = paper[:4]
        arr[t:b, l:r] = region
        return Image.fromarray(arr)

    img = src
    for box in FOLIO_BOXES:
        img = fill_solid(img, box, paper, protect=about_mask)
    img = fill_solid(img, BODY_BOX, paper, protect=about_mask)

    draw = ImageDraw.Draw(img)
    # Folio: small tracked sans, where INTERVIEW sat
    folio_f = font(FONTS / "inter-var.ttf", 9, weight=500)
    draw_tracked(draw, (1143, 266), "OFFLINE THEORY", folio_f, INK, tracking=1)

    # Intro in the body column, matching the original measure
    body_f = font(FONTS / "source-serif-400.ttf", 32)
    col_x, col_y = 1181, 500
    col_w = 1416 - 1181
    leading = 48
    for i, ln in enumerate(wrap(INTRO, body_f, col_w)):
        draw.text((col_x, col_y + i * leading), ln, font=body_f, fill=INK)

    # Portrait well: fill with paper so a CSS-overlaid headshot can blend
    pl, pt, pr, pb = PORTRAIT
    portrait = src.crop((pl, pt, pr, pb)).convert("RGB")
    portrait_path = ABOUT / "portrait.webp"
    portrait.save(portrait_path, "WEBP", quality=92, method=6)
    print("wrote", portrait_path, portrait_path.stat().st_size, portrait.size)

    img.paste(paper, (pl, pt, pr, pb))

    # Punch studio
    punched = punch_studio(img)
    hands = extract_hands(punched)

    def save_scales(im, stem):
        for width in (800, 1200, 1904):
            if width == im.width:
                out_im = im
            else:
                height = int(round(im.height * width / im.width))
                out_im = im.resize((width, height), Image.Resampling.LANCZOS)
            path = ABOUT / f"{stem}-{width}.webp"
            out_im.save(path, "WEBP", quality=90, method=6)
            print("wrote", path, path.stat().st_size, out_im.size)

    save_scales(punched, "opening")
    save_scales(hands, "hands")

    # Right-leaf texture for the first turning sheet, thumb lifted off
    leaf = punched.crop(RIGHT_LEAF)
    hand_leaf = hands.crop(RIGHT_LEAF)
    ha = hand_leaf.split()[-1].point(lambda a: 255 if a > 20 else 0)
    ha = ha.filter(ImageFilter.GaussianBlur(1.0))
    fill = Image.new("RGBA", leaf.size, paper)
    leaf = Image.composite(fill, leaf, ha)
    leaf_path = PAGES / "opening-right.webp"
    leaf.save(leaf_path, "WEBP", quality=94, method=6)
    print("wrote", leaf_path, leaf_path.stat().st_size, leaf.size)

    # QA composites
    qa = Path("/tmp/about-pageturn-keep")
    cream = Image.new("RGBA", punched.size, (247, 245, 240, 255))
    on_cream = Image.alpha_composite(cream, punched)
    on_cream.resize((800, int(800 * H / W)), Image.Resampling.LANCZOS).save(qa / "v2-on-cream.png")
    red = Image.new("RGBA", punched.size, (180, 40, 40, 255))
    Image.alpha_composite(red, punched).resize((800, int(800 * H / W)), Image.Resampling.LANCZOS).save(qa / "v2-on-red.png")
    leaf.resize((320, int(320 * leaf.height / leaf.width)), Image.Resampling.LANCZOS).save(qa / "v2-opening-right.png")
    on_cream.crop((1100, 240, 1480, 900)).save(qa / "v2-right-qa.png")
    print("QA written")


if __name__ == "__main__":
    main()

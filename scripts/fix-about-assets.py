#!/usr/bin/env python3
"""Fix two About-magazine asset edges (Nov 22, 2026).

1. Photo edge: the opening photograph's studio backdrop ended in a
   visible straight horizontal edge just below the hands (y ~1180/1328),
   where its light-gray backdrop met the site cream. Feather the bottom
   edge of the backdrop in the centre of the frame — where there is no
   hand — so the shadow melts into the cream over ~150px instead of
   stopping. Arms at the left/right edges are protected.
   Applied to opening-{800,1200,1904}.webp and hands-{800,1200,1904}.webp.

2. Portrait tint: portrait.webp's studio backdrop is a flat neutral
   ~236 gray; displayed with mix-blend-mode: multiply over the cream
   page it read as a gray tint, worst at the top. Remap near-neutral
   light pixels toward the paper cream (247,245,240) so the blend is
   neutral. Skin (warm, R>>G) and hair (dark) are untouched.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ABOUT = ROOT / "src/assets/about"
CREAM = np.array([247, 245, 240], dtype=np.float32)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def feather_photo_bottom(path):
    im = Image.open(path).convert("RGBA")
    arr = np.array(im).astype(np.float32)
    h, w = arr.shape[:2]
    y0, y1 = h * 1069 / 1328, h * 0.92
    xs = np.arange(w, dtype=np.float32)
    # Centre band only; arms at the frame edges keep full opacity.
    xfade = smoothstep(w * 0.16, w * 0.28, xs) * (1 - smoothstep(w * 0.72, w * 0.84, xs))
    ys = np.arange(h, dtype=np.float32)
    yfade = 1 - smoothstep(y0, y1, ys)
    fade = 1 - (1 - yfade[:, None]) * xfade[None, :]
    arr[:, :, 3] *= fade
    out = Image.fromarray(arr.astype(np.uint8))
    out.save(path, "WEBP", quality=90, method=6)
    print("feathered", path, path.stat().st_size)


def fix_portrait(path):
    im = Image.open(path).convert("RGBA")
    arr = np.array(im).astype(np.float32)
    rgb = arr[:, :, :3]
    lum = rgb.mean(axis=2)
    neutral = (np.abs(rgb[:, :, 0] - rgb[:, :, 1]) < 14) & (np.abs(rgb[:, :, 1] - rgb[:, :, 2]) < 14)
    strength = smoothstep(170, 225, lum) * neutral
    # Soften the mask so no hard edge appears where backdrop meets hair.
    mask = Image.fromarray((strength * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
    strength = np.array(mask, dtype=np.float32) / 255.0
    arr[:, :, :3] = rgb * (1 - strength[:, :, None]) + CREAM[None, None, :] * strength[:, :, None]
    out = Image.fromarray(arr.astype(np.uint8))
    out.save(path, "WEBP", quality=92, method=6)
    print("fixed portrait", path, path.stat().st_size)


if __name__ == "__main__":
    for stem in ("opening", "hands"):
        for width in (800, 1200, 1904):
            feather_photo_bottom(ABOUT / f"{stem}-{width}.webp")
    fix_portrait(ABOUT / "portrait.webp")

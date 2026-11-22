"""Turn the light studio background left around the hands/book shadow into a
transparent black shadow, so the About magazine sits cleanly on any page
background (including browser dark modes). Pixels inside the book are untouched."""
import numpy as np, sys
from scipy import ndimage
from PIL import Image
BOOK = (0.206, 0.176, 0.801, 0.812)  # x0,y0,x1,y1 as fractions of the image
for path in sys.argv[1:]:
    im = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
    h, w = im.shape[:2]
    rgb, a = im[..., :3], im[..., 3] / 255
    L = rgb.mean(-1)
    sat = rgb.max(-1) - rgb.min(-1)
    yy, xx = np.mgrid[0:h, 0:w]
    x0, y0, x1, y1 = BOOK
    outside = ~((xx >= x0 * w) & (xx <= x1 * w) & (yy >= y0 * h) & (yy <= y1 * h))
    bgish = outside & (L > 120) & (sat < 26)
    # keep only background-like regions connected to the image border (no specks on knuckles)
    lab, _ = ndimage.label(bgish | (a < 0.05))
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bgish = bgish & np.isin(lab, border[border > 0])
    shadow = np.clip(1 - L / 238, 0, 1) * a
    out = im.copy()
    out[..., :3][bgish] = 0
    out[..., 3][bgish] = 0
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(path, 'WEBP', quality=90, method=6)
    print('fixed', path)

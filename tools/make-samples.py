#!/usr/bin/env python3
"""Generate the two SYNTHETIC sample photos in samples/ (Iris, opencv-expert).

The network here cannot reach image sites, so the test photos are rendered:
a flat document (receipt / A4 letter) is drawn with real fonts, then
"photographed": perspective-warped onto a textured table, with a soft drop
shadow, uneven lighting, a hand/phone shadow, slight blur, sensor noise and
JPEG compression. Ground-truth page corners go to samples/ground-truth.json so
QA can check that detection finds the real page (not the full-image fallback).

Run from the repo root:  python3 tools/make-samples.py
Deterministic (fixed seeds).
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "samples")
F = "/usr/share/fonts/truetype/"
MONO = F + "dejavu/DejaVuSansMono.ttf"
MONO_B = F + "dejavu/DejaVuSansMono-Bold.ttf"
SERIF = F + "liberation/LiberationSerif-Regular.ttf"
SERIF_B = F + "liberation/LiberationSerif-Bold.ttf"
SANS_B = F + "liberation/LiberationSans-Bold.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


# ---------------------------------------------------------------- documents
def make_receipt():
    W, H = 640, 1500
    rng = np.random.default_rng(7)
    paper = np.full((H, W, 3), (246, 244, 236), np.float32)
    paper += rng.normal(0, 2.0, (H, W, 1))  # thermal paper grain
    img = Image.fromarray(np.clip(paper, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    ink = (38, 36, 40)
    fb, f, fs = font(MONO_B, 40), font(MONO, 26), font(MONO, 22)
    y = 60
    d.text((W // 2, y), "CORNER MARKET", font=fb, fill=ink, anchor="mt"); y += 60
    for line in ["128 Harbor Street", "Springfield, ST 01234", "Tel (555) 010-2290"]:
        d.text((W // 2, y), line, font=fs, fill=ink, anchor="mt"); y += 32
    y += 20
    d.text((40, y), "2026-11-21   14:32   #004817", font=fs, fill=ink); y += 40
    d.line((40, y, W - 40, y), fill=ink, width=2); y += 24
    items = [("Sourdough loaf", "5.49"), ("Free-range eggs x12", "4.29"), ("Whole milk 1L", "1.89"),
             ("Apples (1.2 kg)", "3.58"), ("Coffee beans 500g", "11.99"), ("Dark chocolate", "2.75"),
             ("Tomatoes on vine", "3.20"), ("Greek yogurt", "2.49"), ("Olive oil 750ml", "8.95"),
             ("Paper towels", "4.10"), ("Basil plant", "2.99"), ("Sparkling water", "0.89")]
    for name, price in items:
        d.text((40, y), name, font=f, fill=ink)
        d.text((W - 40, y), price, font=f, fill=ink, anchor="ra"); y += 40
    y += 10
    d.line((40, y, W - 40, y), fill=ink, width=2); y += 24
    for label, val, fnt in [("SUBTOTAL", "52.61", f), ("TAX 6%", "3.16", f), ("TOTAL", "55.77", fb)]:
        d.text((40, y), label, font=fnt, fill=ink)
        d.text((W - 40, y), val, font=fnt, fill=ink, anchor="ra"); y += 52
    y += 10
    d.text((40, y), "VISA ****4421      APPROVED", font=fs, fill=ink); y += 36
    d.text((40, y), "AUTH 08812Z", font=fs, fill=ink); y += 60
    # barcode
    x = 80
    while x < W - 80:
        wbar = int(rng.integers(2, 7))
        if rng.random() > 0.4:
            d.rectangle((x, y, x + wbar, y + 90), fill=ink)
        x += wbar + int(rng.integers(2, 5))
    y += 120
    d.text((W // 2, y), "THANK YOU - PLEASE COME AGAIN", font=fs, fill=ink, anchor="mt")
    # faded thermal print toward the bottom
    arr = np.asarray(img).astype(np.float32)
    fade = np.linspace(1.0, 0.72, H)[:, None, None]
    arr = 246 - (246 - arr) * fade
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


LOREM = ("Thank you for meeting with our team last week to review the plans for the new community "
         "library. As discussed, the reading room will face the courtyard so that it receives soft "
         "morning light, and the children's corner will move next to the garden entrance. We have "
         "attached the revised floor plan and the updated budget for your records. The contractor "
         "expects to begin work in early spring, weather permitting, and to finish before the summer "
         "reading program starts. Please let us know if the board would like any further changes. "
         "We are grateful for your continued support and look forward to opening the doors together.")


def wrap(d, text, fnt, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=fnt) <= width:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines


def make_letter():
    W, H = 1240, 1754  # A4 at 150 dpi
    rng = np.random.default_rng(11)
    paper = np.full((H, W, 3), (250, 249, 245), np.float32) + rng.normal(0, 1.2, (H, W, 1))
    img = Image.fromarray(np.clip(paper, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    ink = (28, 30, 36)
    m = 130
    d.text((m, 120), "Harbor Valley Architects", font=font(SANS_B, 44), fill=(30, 60, 110))
    d.line((m, 185, W - m, 185), fill=(30, 60, 110), width=3)
    fb, f = font(SERIF_B, 32), font(SERIF, 30)
    y = 240
    for line in ["21 November 2026", "", "Dr. A. Reader", "Springfield Library Board", "", "Re: Reading room renovation"]:
        d.text((m, y), line, font=fb if line.startswith("Re:") else f, fill=ink); y += 44
    y += 20
    sent = LOREM.split(". ")
    for para in [LOREM, ". ".join(sent[:3]) + ".", ". ".join(sent[3:6]) + "."]:
        for line in wrap(d, para, f, W - 2 * m):
            d.text((m, y), line, font=f, fill=ink); y += 44
        y += 30
    d.text((m, y + 10), "With kind regards,", font=f, fill=ink)
    d.text((m, y + 110), "J. Okafor, Project Lead", font=fb, fill=ink)
    d.text((W // 2, H - 90), "Page 1 of 1", font=font(SERIF, 24), fill=(90, 90, 90), anchor="mt")
    return img


# ---------------------------------------------------------------- scenes
def smooth_noise(rng, h, w, scale):
    small = rng.random((max(2, h // scale), max(2, w // scale))).astype(np.float32)
    im = Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(im).astype(np.float32) / 255.0


def wood(h, w, seed):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    warp = smooth_noise(rng, h, w, 120) * 40 + smooth_noise(rng, h, w, 30) * 6
    rings = np.sin((yy * 0.9 + xx * 0.12 + warp) * 0.16) * 0.5 + 0.5
    fine = smooth_noise(rng, h, w, 3)
    t = 0.55 * rings + 0.25 * fine + 0.2 * smooth_noise(rng, h, w, 60)
    dark, light = np.array([92, 58, 34], np.float32), np.array([168, 118, 74], np.float32)
    img = dark + (light - dark) * t[..., None]
    # plank seams
    for sy in range(0, h, 420):
        img[max(0, sy - 3):sy + 3] *= 0.55
    return img


def fabric(h, w, seed):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    weave = (np.sin(xx * 1.3) * np.sin(yy * 1.3)) * 0.5 + 0.5
    mott = smooth_noise(rng, h, w, 80)
    t = 0.35 * weave + 0.45 * mott + 0.2 * rng.random((h, w))
    base, hi = np.array([46, 62, 88], np.float32), np.array([86, 104, 134], np.float32)
    return base + (hi - base) * t[..., None]


def persp_coeffs(dst, src):
    """PIL PERSPECTIVE maps output(x,y) -> input; solve for the 8 coefficients."""
    A, b = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(A, np.float64), np.array(b, np.float64)).tolist()


def photograph(doc, bg, corners, seed, light_dir, hand_shadow):
    rng = np.random.default_rng(seed)
    H, W = bg.shape[:2]
    dw, dh = doc.size
    src = [(0, 0), (dw - 1, 0), (dw - 1, dh - 1), (0, dh - 1)]
    coeffs = persp_coeffs(corners, src)
    warped = doc.convert("RGB").transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    mask = Image.new("L", doc.size, 255).transform((W, H), Image.PERSPECTIVE, coeffs, Image.BILINEAR)
    m = np.asarray(mask).astype(np.float32)[..., None] / 255.0
    # drop shadow under the page (offset down-right, soft)
    sh = Image.fromarray((m[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(18))
    sh = np.roll(np.asarray(sh).astype(np.float32) / 255.0, (14, 10), (0, 1))[..., None]
    scene = bg * (1 - 0.45 * sh)
    # slight paper curl: brightness ripple on the page
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    curl = 1 - 0.05 * (np.sin(xx / W * math.pi * 1.5 + 0.3) ** 2)
    page = np.asarray(warped).astype(np.float32) * curl[..., None]
    scene = scene * (1 - m) + page * m
    # uneven lighting: directional gradient + vignette
    lx, ly = light_dir
    grad = 0.78 + 0.32 * ((xx / W) * lx + (yy / H) * ly)
    r = np.hypot((xx - W / 2) / W, (yy - H / 2) / H)
    vig = 1 - 0.38 * r ** 2
    scene *= (grad * vig)[..., None]
    # hand / phone shadow: a big soft ellipse
    cx, cy, rx, ry, k = hand_shadow
    ell = (((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2) < 1
    hs = Image.fromarray((ell * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(70))
    scene *= (1 - k * np.asarray(hs).astype(np.float32)[..., None] / 255.0)
    # warm color cast, optics blur, sensor noise
    scene *= np.array([1.03, 1.0, 0.94], np.float32)
    img = Image.fromarray(np.clip(scene, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))
    arr = np.asarray(img).astype(np.float32)
    arr += rng.normal(0, 3.5, arr.shape) + rng.normal(0, 2.0, arr.shape[:2] + (1,))
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def main():
    os.makedirs(OUT, exist_ok=True)
    truth = {}
    # 1) receipt on a wooden table, portrait 1536x2048
    W, H = 1536, 2048
    c1 = [(500, 330), (1090, 410), (1010, 1820), (370, 1740)]
    p1 = photograph(make_receipt(), wood(H, W, 3), c1, 21, (0.6, 0.5), (1350, 2000, 420, 300, 0.35))
    p1.save(os.path.join(OUT, "receipt.jpg"), "JPEG", quality=88, optimize=True)
    truth["receipt.jpg"] = {"width": W, "height": H, "corners": c1, "note": "TL,TR,BR,BL"}
    # 2) A4 letter on blue fabric, landscape 2304x1728
    W, H = 2304, 1728
    c2 = [(760, 160), (1590, 205), (1690, 1525), (690, 1480)]
    p2 = photograph(make_letter(), fabric(H, W, 5), c2, 33, (-0.5, 0.6), (300, 150, 520, 360, 0.30))
    p2.save(os.path.join(OUT, "letter.jpg"), "JPEG", quality=88, optimize=True)
    truth["letter.jpg"] = {"width": W, "height": H, "corners": c2, "note": "TL,TR,BR,BL"}
    with open(os.path.join(OUT, "ground-truth.json"), "w") as fh:
        json.dump(truth, fh, indent=2)
    for k in truth:
        print(k, os.path.getsize(os.path.join(OUT, k)), "bytes")


if __name__ == "__main__":
    main()

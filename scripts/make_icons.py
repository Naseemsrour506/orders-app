"""יוצר את אייקוני האפליקציה (ריבוע ירוק עם כרטיס הזמנה)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
GREEN = (31, 122, 90)
WHITE = (255, 255, 255)
SOFT = (220, 239, 230)


def draw(size: int, maskable: bool) -> Image.Image:
    img = Image.new("RGB", (size, size), GREEN)
    d = ImageDraw.Draw(img)
    pad = size * (0.26 if maskable else 0.18)
    x0, y0, x1, y1 = pad, pad * 0.95, size - pad, size - pad * 0.95
    r = size * 0.06
    d.rounded_rectangle((x0, y0, x1, y1), radius=r, fill=WHITE)
    w = x1 - x0
    lh = size * 0.045
    for i, frac in enumerate((0.72, 0.55, 0.62)):
        y = y0 + w * 0.2 + i * lh * 2.4
        d.rounded_rectangle((x1 - w * 0.12 - w * frac * 0.76, y, x1 - w * 0.12, y + lh), radius=lh / 2, fill=SOFT if i else GREEN)
    cx, cy, cr = x0 + w * 0.3, y1 - w * 0.28, w * 0.14
    d.ellipse((cx - cr, cy - cr, cx + cr, cy + cr), fill=GREEN)
    d.line((cx - cr * 0.45, cy, cx - cr * 0.05, cy + cr * 0.4, cx + cr * 0.5, cy - cr * 0.35), fill=WHITE, width=max(2, int(size * 0.025)), joint="curve")
    return img


OUT.mkdir(parents=True, exist_ok=True)
draw(192, False).save(OUT / "icon-192.png")
draw(512, False).save(OUT / "icon-512.png")
draw(512, True).save(OUT / "maskable-512.png")
print("icons written to", OUT)

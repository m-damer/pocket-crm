from PIL import Image, ImageDraw
import math

NAVY = (31, 61, 113, 255)      # #1F3D71
BLUE = (0, 155, 222, 255)      # #009BDE
WHITE = (247, 248, 251, 255)   # near-white for contrast

def rounded_square(size, radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=NAVY)
    return img, d

def draw_mark(d, size):
    # Abstract "contact card" mark: a card shape with a small fold,
    # representing a contact/lead record — simple, geometric, on-brand.
    cx, cy = size / 2, size / 2
    card_w, card_h = size * 0.46, size * 0.34
    x0, y0 = cx - card_w / 2, cy - card_h / 2
    x1, y1 = cx + card_w / 2, cy + card_h / 2
    fold = card_h * 0.42

    # main card body in accent blue
    d.rounded_rectangle([x0, y0, x1, y1], radius=size * 0.035, fill=BLUE)

    # folded corner (top-right) in white to suggest a card being turned/opened
    fold_pts = [
        (x1 - fold, y0),
        (x1, y0),
        (x1, y0 + fold),
    ]
    d.polygon(fold_pts, fill=WHITE)

    # a small dot + two lines inside the card to read as "contact info"
    dot_r = card_h * 0.10
    dot_cx, dot_cy = x0 + card_h * 0.28, cy
    d.ellipse([dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r], fill=WHITE)

    line_x0 = dot_cx + dot_r * 2.0
    line_x1 = x1 - card_h * 0.16
    lw = max(2, int(size * 0.012))
    d.line([(line_x0, cy - card_h * 0.10), (line_x1, cy - card_h * 0.10)], fill=WHITE, width=lw)
    d.line([(line_x0, cy + card_h * 0.10), (line_x1 - card_h * 0.10, cy + card_h * 0.10)], fill=WHITE, width=lw)

def make_icon(size, maskable=False, path="icon.png"):
    if maskable:
        # Maskable icons need extra safe-zone padding (~20%) since OS may crop to a shape
        img, d = rounded_square(size, radius_ratio=0.0)  # full-bleed bg for maskable
        d.rectangle([0, 0, size, size], fill=NAVY)
        inner = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        di = ImageDraw.Draw(inner)
        draw_mark(di, int(size * 0.62))
        offset = int(size * 0.19)
        img.alpha_composite(inner, (offset, offset))
    else:
        img, d = rounded_square(size)
        draw_mark(d, size)
    img.save(path)

make_icon(192, path="/home/claude/crm/icons/icon-192.png")
make_icon(512, path="/home/claude/crm/icons/icon-512.png")
make_icon(512, maskable=True, path="/home/claude/crm/icons/icon-512-maskable.png")
print("done")

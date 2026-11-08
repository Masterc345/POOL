"""Generate build/icon.ico, build/icon.png and the NSIS sidebar bitmap (needs Pillow)."""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'build')
os.makedirs(OUT, exist_ok=True)

def font(size, bold=True):
    for name in ('arialbd.ttf', 'DejaVuSans-Bold.ttf', 'LiberationSans-Bold.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()

def icon(size=512, bg=True, radius=0.31):
    s = size
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if bg:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=s // 5, fill=(14, 92, 56, 255))
        d.rounded_rectangle((s * 0.03, s * 0.03, s * 0.97, s * 0.97), radius=s // 6, outline=(94, 60, 30, 255), width=max(2, s // 28))
    r = s * radius
    c = s / 2
    d.ellipse((c - r + s * 0.02, c - r + s * 0.035, c + r + s * 0.02, c + r + s * 0.035), fill=(0, 0, 0, 90))
    d.ellipse((c - r, c - r, c + r, c + r), fill=(12, 12, 14, 255))
    d.ellipse((c - r * 0.55, c - r * 0.78, c - r * 0.05, c - r * 0.38), fill=(70, 70, 76, 255))
    w = r * 0.78
    d.ellipse((c - w / 2, c - w / 2, c + w / 2, c + w / 2), fill=(245, 245, 245, 255))
    f = font(int(w * 0.95))
    bbox = d.textbbox((0, 0), '8', font=f)
    d.text((c - (bbox[2] - bbox[0]) / 2 - bbox[0], c - (bbox[3] - bbox[1]) / 2 - bbox[1]), '8', font=f, fill=(10, 10, 10, 255))
    return img

big = icon(512)
big.save(os.path.join(OUT, 'icon.png'))
big.save(os.path.join(OUT, 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# NSIS sidebar: 164x314, 24-bit BMP
sb = Image.new('RGB', (164, 314), (11, 20, 16))
d = ImageDraw.Draw(sb)
for y in range(314):
    t = y / 313
    d.line((0, y, 164, y), fill=(int(10 + 6 * t), int(70 - 30 * t), int(44 - 18 * t)))
logo = icon(128).convert('RGBA')
sb.paste(logo, (18, 40), logo)
d.text((82, 190), 'PoolMaster3D', font=font(17), fill=(240, 240, 235), anchor='mm')
d.text((82, 214), '3D Eight-Ball Pool', font=font(11), fill=(180, 210, 190), anchor='mm')
sb.save(os.path.join(OUT, 'installerSidebar.bmp'), 'BMP')
print('icons written to', os.path.abspath(OUT))

# ---- PWA / phone icons (web version) ----
PUB = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(PUB, exist_ok=True)
big.resize((192, 192), Image.LANCZOS).save(os.path.join(PUB, 'icon-192.png'))
big.resize((512, 512), Image.LANCZOS).save(os.path.join(PUB, 'icon-512.png'))
big.resize((180, 180), Image.LANCZOS).save(os.path.join(PUB, 'apple-touch-icon.png'))

# maskable icon: full-bleed background, artwork kept inside the central safe zone
mask = Image.new('RGBA', (512, 512), (14, 92, 56, 255))
art = big.resize((360, 360), Image.LANCZOS)
mask.paste(art, (76, 76), art)
mask.save(os.path.join(PUB, 'icon-maskable-512.png'))
print('web icons written to', os.path.abspath(PUB))

# ---- Android launcher icons (copied into the generated Android project by scripts/android-prepare.mjs) ----
AND = os.path.join(os.path.dirname(__file__), '..', 'resources', 'android')
DENS = {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}
for name, (legacy, adaptive) in DENS.items():
    d = os.path.join(AND, f'mipmap-{name}')
    os.makedirs(d, exist_ok=True)
    full = icon(legacy * 4).resize((legacy, legacy), Image.LANCZOS)
    full.save(os.path.join(d, 'ic_launcher.png'))
    # round launcher icon
    sq = Image.new('RGBA', (legacy * 4, legacy * 4), (14, 92, 56, 255))
    art = icon(legacy * 4, bg=False, radius=0.36)
    sq.paste(art, (0, 0), art)
    m = Image.new('L', (legacy * 4, legacy * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, legacy * 4 - 1, legacy * 4 - 1), fill=255)
    rnd = Image.new('RGBA', (legacy * 4, legacy * 4), (0, 0, 0, 0)); rnd.paste(sq, (0, 0), m)
    rnd.resize((legacy, legacy), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_round.png'))
    # adaptive foreground: ball only, inside the 66/108 safe zone
    icon(adaptive * 2, bg=False, radius=0.29).resize((adaptive, adaptive), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_foreground.png'))
print('android icons written to', os.path.abspath(AND))

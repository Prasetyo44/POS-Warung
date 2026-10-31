# Membuat ikon & splash Android dari public/icons (jalankan: python3 scripts/android-icons.py)
from PIL import Image, ImageDraw
import glob

RES = 'android/app/src/main/res'
icon = Image.open('public/icons/icon-512.png').convert('RGBA')
mask_icon = Image.open('public/icons/maskable-512.png').convert('RGBA')
sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}

for d, s in sizes.items():
    icon.resize((s, s), Image.LANCZOS).save(f'{RES}/mipmap-{d}/ic_launcher.png')
    r = mask_icon.resize((s, s), Image.LANCZOS)
    m = Image.new('L', (s, s), 0)
    ImageDraw.Draw(m).ellipse((0, 0, s - 1, s - 1), fill=255)
    r.putalpha(m)
    r.save(f'{RES}/mipmap-{d}/ic_launcher_round.png')
    fg = int(s * 108 / 48)
    mask_icon.resize((fg, fg), Image.LANCZOS).save(f'{RES}/mipmap-{d}/ic_launcher_foreground.png')

for f in glob.glob(f'{RES}/drawable*/splash.png'):
    w, h = Image.open(f).size
    img = Image.new('RGB', (w, h), (15, 118, 110))
    s = int(min(w, h) * 0.32)
    ic = mask_icon.resize((s, s), Image.LANCZOS)
    img.paste(ic, ((w - s) // 2, (h - s) // 2), ic)
    img.save(f)

import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs('assets', exist_ok=True)
source_img = Image.open('Untitled (1000 x 1000 px) (1).png').convert('RGBA')

# 1. Save assets/logo.png (512x512) and WebP
logo_512 = source_img.resize((512, 512), Image.Resampling.LANCZOS)
logo_512.save('assets/logo.png', 'PNG', optimize=True)
logo_512.save('assets/logo.webp', 'WEBP', quality=90)

# 2. Favicons: 32x32, 180x180 (apple touch), favicon.ico
fav_32 = source_img.resize((32, 32), Image.Resampling.LANCZOS)
fav_32.save('assets/favicon-32x32.png', 'PNG')
fav_180 = source_img.resize((180, 180), Image.Resampling.LANCZOS)
fav_180.save('assets/apple-touch-icon.png', 'PNG')

fav_sizes = [(16, 16), (32, 32), (48, 48)]
fav_imgs = [source_img.resize(s, Image.Resampling.LANCZOS) for s in fav_sizes]
fav_imgs[0].save('favicon.ico', format='ICO', sizes=fav_sizes, append_images=fav_imgs[1:])
fav_imgs[0].save('assets/favicon.ico', format='ICO', sizes=fav_sizes, append_images=fav_imgs[1:])

# 3. Create SVG favicon
svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0E6B4D"/>
  <path d="M16 6l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.5-4.4 6.2-.9z" fill="#E0A526"/>
</svg>"""
with open('assets/favicon.svg', 'w', encoding='utf-8') as f:
    f.write(svg_content)
with open('favicon.svg', 'w', encoding='utf-8') as f:
    f.write(svg_content)

# 4. Generate 1200x630 OG Image (assets/og-image.jpg and assets/og-image.png)
og_width, og_height = 1200, 630
og = Image.new('RGBA', (og_width, og_height), color=(246, 244, 239, 255))
draw = ImageDraw.Draw(og)

# Draw decorative border
draw.rectangle([20, 20, og_width - 20, og_height - 20], outline=(14, 107, 77, 255), width=3)
draw.rectangle([28, 28, og_width - 28, og_height - 28], outline=(226, 222, 212, 255), width=1)

# Place logo icon
logo_og = source_img.resize((360, 360), Image.Resampling.LANCZOS)
og.paste(logo_og, (760, 135), mask=logo_og)

try:
    font_bold = ImageFont.truetype('arialbd.ttf', 54)
    font_title = ImageFont.truetype('arialbd.ttf', 36)
    font_sub = ImageFont.truetype('arial.ttf', 23)
    font_pill = ImageFont.truetype('arialbd.ttf', 17)
except Exception:
    font_bold = font_title = font_sub = font_pill = ImageFont.load_default()

# Pill badge
draw.rounded_rectangle([70, 75, 330, 115], radius=6, fill=(14, 107, 77, 30), outline=(14, 107, 77, 100), width=1)
draw.text((85, 87), 'GROWTH & ATTRIBUTION', fill=(14, 107, 77), font=font_pill)

# Headline
draw.text((70, 135), 'EmbedEase', fill=(15, 18, 16), font=font_bold)
draw.text((70, 205), 'AI Chatbot, WhatsApp API &\nLead Attribution for India', fill=(14, 107, 77), font=font_title)

# Description bullet points
bullets = [
    '• Zero-iframe AI Chatbot with Custom Knowledge (RAG)',
    '• Meta & Google Ads Real Cost-Per-Lead Tracking (CPL)',
    '• Official WhatsApp Business Cloud API Automation',
    '• 100% Client Data Ownership & DPDP 2023 Compliant'
]
y_offset = 330
for b in bullets:
    draw.text((70, y_offset), b, fill=(80, 90, 85), font=font_sub)
    y_offset += 38

# Bottom URL branding
draw.rounded_rectangle([70, 510, 350, 558], radius=6, fill=(14, 107, 77), outline=None)
draw.text((90, 522), 'https://embedease.in', fill=(246, 244, 239), font=font_sub)

og_rgb = og.convert('RGB')
og_rgb.save('assets/og-image.jpg', 'JPEG', quality=92, optimize=True)
og.save('assets/og-image.png', 'PNG', optimize=True)
print('Assets generated successfully!')

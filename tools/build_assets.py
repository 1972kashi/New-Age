"""
Simple asset bundler/minifier for development use.
Concatenates and does lightweight minification for specified JS and CSS files.
Run: python tools/build_assets.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'dist'
OUT.mkdir(exist_ok=True)

JS_FILES = [
    'new_age.js'
]
CSS_FILES = [
    'new_age.css'
]

def minify_js(text: str) -> str:
    # remove // comments
    text = re.sub(r'//.*', '', text)
    # remove /* */ comments
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    # collapse whitespace
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def minify_css(text: str) -> str:
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'\s*([{}:,;])\s*', r"\1", text)
    return text.strip()

if __name__ == '__main__':
    # JS
    js_out = OUT / 'new_age.min.js'
    parts = []
    for f in JS_FILES:
        p = ROOT / f
        if p.exists():
            parts.append(p.read_text(encoding='utf-8'))
    if parts:
        js_out.write_text(minify_js('\n'.join(parts)), encoding='utf-8')
        print('Wrote', js_out)

    # CSS
    css_out = OUT / 'new_age.min.css'
    parts = []
    for f in CSS_FILES:
        p = ROOT / f
        if p.exists():
            parts.append(p.read_text(encoding='utf-8'))
    if parts:
        css_out.write_text(minify_css('\n'.join(parts)), encoding='utf-8')
        print('Wrote', css_out)

    # Generate sanitized public feed for GitHub Pages (if db.json exists)
    try:
        from tools import export_public_cars
        try:
            export_public_cars.main()
        except SystemExit:
            # argparse in export_public_cars may call sys.exit(); ignore that when invoked programmatically
            pass
    except Exception:
        # Non-fatal: exporter is optional in environments without db.json
        pass

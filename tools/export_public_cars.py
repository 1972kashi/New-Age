"""
Generate a sanitized public JSON feed of cars suitable for GitHub Pages.

Usage:
    python tools/export_public_cars.py [--out public-cars.json]

Reads `db.json` in the repo root (if present) and writes a JSON file
containing only non-sensitive fields for each car. Do NOT commit `db.json`.
"""
import argparse
import json
from pathlib import Path
from typing import Any, Dict

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / 'db.json'

SENSITIVE_KEYS = ('email', 'phone', 'password', 'owner', 'seller', 'contact', 'vin', 'ssn')

ALLOWED_CAR_KEYS = (
    'id', 'carId', 'title', 'name', 'make', 'model', 'year', 'price', 'mileage',
    'location', 'verified', 'createdAt', 'summary', 'description',
    'condition', 'fuel', 'transmission', 'images', 'photos', 'img', 'image',
    'engine', 'bodyType', 'drive', 'color'
)


def sanitize_car(raw: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k in ALLOWED_CAR_KEYS:
        if k in raw:
            out[k] = raw[k]

    # Normalize images: accept `images`, `photos`, `img`, or `image`
    imgs = []
    for key in ('images', 'photos'):
        values = raw.get(key)
        if isinstance(values, list):
            for p in values:
                if isinstance(p, str) and p and p not in imgs:
                    imgs.append(p)
    for key in ('img', 'image', 'img_main'):
        v = raw.get(key)
        if isinstance(v, str) and v and v not in imgs:
            imgs.append(v)

    if imgs:
        out['images'] = imgs

    # Derive a public title if missing
    title_value = out.get('title') or raw.get('title')
    if not title_value:
        if raw.get('name'):
            title_value = str(raw.get('name'))
        else:
            parts = [raw.get('make'), raw.get('model'), raw.get('year')]
            title_value = ' '.join(str(p) for p in parts if p)
    if title_value:
        out['title'] = title_value

    # Ensure id exists
    if 'id' not in out:
        if raw.get('carId'):
            out['id'] = raw.get('carId')
        else:
            out['id'] = raw.get('id') or raw.get('carId') or None

    # Strip any unexpected sensitive keys that may have slipped in
    for k in list(out.keys()):
        for s in SENSITIVE_KEYS:
            if s in k.lower():
                out.pop(k, None)

    # Map frontend-friendly fields expected by the client
    # `name`, `img`, `miles`, `trans`, `badge`, `link`
    # name: prefer title, then make/model/year
    if 'title' in out and out['title']:
        out['name'] = out['title']
    else:
        name_parts = []
        for f in ('make', 'model', 'year'):
            if raw.get(f):
                name_parts.append(str(raw.get(f)))
        out['name'] = ' '.join(name_parts) if name_parts else raw.get('name') or None

    # img: first image if available
    imgs = out.get('images') or []
    if imgs:
        out['img'] = imgs[0]

    # miles/mileage
    if 'mileage' in out:
        out['miles'] = out['mileage']
    elif raw.get('miles'):
        out['miles'] = raw.get('miles')

    # transmission -> trans
    if 'transmission' in out:
        out['trans'] = out['transmission']
    elif raw.get('trans'):
        out['trans'] = raw.get('trans')

    # verified -> badge (boolean)
    if out.get('verified') is not None:
        out['badge'] = bool(out.get('verified'))
    elif raw.get('verified') is not None:
        out['badge'] = bool(raw.get('verified'))

    # link: keep if present, else link to car-detail with id
    if raw.get('link'):
        out['link'] = raw.get('link')
    else:
        cid = out.get('id') or raw.get('id')
        if cid:
            out['link'] = f"car-detail.html?id={cid}"

    # Ensure price exists as string
    if 'price' in out and out['price'] is not None:
        out['price'] = str(out['price'])

    return out



def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default=str(ROOT / 'public-cars.json'))
    args = parser.parse_args()

    if not DB_PATH.exists():
        print('db.json not found at', DB_PATH)
        return

    try:
        data = json.loads(DB_PATH.read_text(encoding='utf-8'))
    except Exception as exc:
        print('Failed to read db.json:', exc)
        return

    cars = data.get('cars') or []
    public = []
    for c in cars:
        try:
            p = sanitize_car(c)
            if p.get('id') and (p.get('title') or p.get('make')):
                public.append(p)
        except Exception:
            continue

    out_path = Path(args.out)
    export_data = {'cars': public}
    car_details = data.get('carDetails') or []
    if car_details:
        export_data['carDetails'] = [sanitize_car(c) for c in car_details if isinstance(c, dict)]
    out_path.write_text(json.dumps(export_data, indent=2, ensure_ascii=False), encoding='utf-8')
    print('Wrote public feed to', out_path)


if __name__ == '__main__':
    main()

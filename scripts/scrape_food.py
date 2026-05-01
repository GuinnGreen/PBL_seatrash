#!/usr/bin/env python3
"""針對食物包裝補爬：塑膠袋、吸管、餐具。"""
import json, re, sys, time
from pathlib import Path
from io import BytesIO
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "images" / "food"
USER_AGENT = "OceanGuardianPBL/0.1 (educational) requests/2.33"
API = "https://commons.wikimedia.org/w/api.php"

# Curated categories (parent of curated leaves, broad enough to actually have content)
CATEGORIES = [
    ("Category:Plastic bag pollution",        "塑膠提袋"),
    ("Category:Discarded plastic bags",       "塑膠提袋"),
    ("Category:Plastic_bags",                 "塑膠提袋"),
    ("Category:Drinking_straws",              "吸管"),
    ("Category:Drinking straw pollution",     "吸管"),
    ("Category:Disposable food containers",   "便當盒/餐盒"),
    ("Category:Disposable cutlery",           "免洗餐具"),
    ("Category:Polystyrene_food_containers",  "保麗龍餐盒"),
    ("Category:Take-out_food_containers",     "外帶餐盒"),
]

# Filename keywords that strongly indicate marine/beach context (boost relevance)
PREF_TERMS = ("beach", "sea", "ocean", "shore", "litter", "pollution",
              "marine", "debris", "discarded", "trash", "waste")
SKIP_TERMS = ("logo", "diagram", "infographic", "chart",
              "drawing", "sketch", "icon", "map of", "cartoon",
              "monument", "label", "package_design", "advertisement",
              "model_", "portrait", "person", "studio", "isolated",
              "product_photo", "white_background")

OK_LIC = ("CC0", "CC BY", "Public domain", "PDM", "No restrictions")


def s():
    sess = requests.Session()
    sess.headers.update({"User-Agent": USER_AGENT})
    return sess


def fetch_cat(sess, cat, lim=50):
    out, cont = [], None
    while len(out) < lim:
        p = {"action": "query", "list": "categorymembers", "cmtitle": cat,
             "cmtype": "file", "cmlimit": min(50, lim - len(out)),
             "format": "json", "formatversion": 2}
        if cont:
            p["cmcontinue"] = cont
        try:
            r = sess.get(API, params=p, timeout=30); r.raise_for_status()
            d = r.json()
        except Exception as e:
            print(f"  ! {cat}: {e}", file=sys.stderr); break
        out.extend([m["title"] for m in d.get("query", {}).get("categorymembers", [])])
        cont = d.get("continue", {}).get("cmcontinue")
        if not cont:
            break
        time.sleep(0.3)
    return out


def fileinfo(sess, titles):
    out = {}
    for i in range(0, len(titles), 40):
        batch = titles[i:i+40]
        p = {"action": "query", "titles": "|".join(batch),
             "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
             "iiurlwidth": 1200, "format": "json", "formatversion": 2}
        try:
            r = sess.get(API, params=p, timeout=30); r.raise_for_status()
            for page in r.json().get("query", {}).get("pages", []):
                ii = page.get("imageinfo")
                if ii:
                    out[page["title"]] = ii[0]
        except Exception as e:
            print(f"  ! info: {e}", file=sys.stderr)
        time.sleep(0.3)
    return out


def relevant(title):
    t = title.lower()
    if not t.endswith((".jpg", ".jpeg", ".png", ".webp")):
        return False
    if any(b in t for b in SKIP_TERMS):
        return False
    return True


def safe_name(title):
    base = title.split(":", 1)[1] if ":" in title else title
    base = base.lower()
    base = re.sub(r"[^a-z0-9.]+", "_", base)
    base = re.sub(r"_+", "_", base).strip("_.")
    if "." not in base:
        base += ".jpg"
    return re.sub(r"\.(png|webp|jpeg)$", ".jpg", base)


def acceptable(meta):
    em = meta.get("extmetadata") or {}
    short = (em.get("LicenseShortName") or {}).get("value", "")
    if not short:
        return False
    return any(o.lower() in short.lower() for o in OK_LIC)


def license_meta(meta):
    em = meta.get("extmetadata") or {}
    short = (em.get("LicenseShortName") or {}).get("value", "")
    artist = (em.get("Artist") or {}).get("value", "")
    artist = re.sub(r"<[^>]+>", "", artist).strip()
    return short, artist


def download(sess, url, dst, max_w=800):
    try:
        r = sess.get(url, timeout=60); r.raise_for_status()
        img = Image.open(BytesIO(r.content)).convert("RGB")
        if img.width > max_w:
            ratio = max_w / img.width
            img = img.resize((max_w, int(img.height * ratio)), Image.LANCZOS)
        dst.parent.mkdir(parents=True, exist_ok=True)
        img.save(dst, "JPEG", quality=85, optimize=True)
        return True
    except Exception as e:
        print(f"  ! dl {url}: {e}", file=sys.stderr); return False


def has_pref(title):
    return any(p in title.lower() for p in PREF_TERMS)


def main():
    sess = s()
    items = []
    seq = 0
    seen = set()
    TARGET = 8

    for cat, hint in CATEGORIES:
        if seq >= TARGET:
            break
        print(f"\n=== {cat} ({hint}) ===")
        files = [t for t in fetch_cat(sess, cat, 60) if relevant(t) and t not in seen]
        # Sort: marine context first
        files.sort(key=lambda t: (0 if has_pref(t) else 1, t))
        if not files:
            print("  no files"); continue
        # Take up to 6 candidates
        cands = files[:8]
        infos = fileinfo(sess, cands)
        added = 0
        for t in cands:
            if seq >= TARGET or added >= 3:
                break
            m = infos.get(t)
            if not m or not acceptable(m):
                continue
            url = m.get("thumburl") or m.get("url")
            if not url:
                continue
            short, artist = license_meta(m)
            seq += 1
            fname = f"foo2_{seq:02d}_{safe_name(t)}"
            dst = IMG_DIR / fname
            if dst.exists():
                seen.add(t); continue
            if not download(sess, url, dst):
                seq -= 1; continue
            seen.add(t); added += 1
            items.append({
                "id": f"food_x{seq:02d}",
                "filename": f"images/food/{fname}",
                "category": "food",
                "label": hint,
                "icc_item": None,
                "hint": "",
                "source": m.get("descriptionurl", "") or f"https://commons.wikimedia.org/wiki/{t.replace(' ', '_')}",
                "license": short,
                "artist": artist,
                "title": t,
            })
            time.sleep(0.4)
        print(f"  added {added}")

    out = ROOT / "data" / "items.food.json"
    out.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nTotal added: {seq}")
    print(f"Wrote: {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

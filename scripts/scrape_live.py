#!/usr/bin/env python3
"""
為「即時挑戰」爬一批全新 CC 授權海廢照片。
與 data/items.json 既有題庫零重疊:會讀 items.json 的 source/title 做排除。
產出:images/live/*.jpg + data/items.live.draft.json
使用:python3 scripts/scrape_live.py
"""
import json, re, sys, time
from pathlib import Path
from io import BytesIO
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LIVE_DIR = ROOT / "images" / "live"
DATA_DIR = ROOT / "data"
API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "OceanGuardianPBL/0.1 (educational; contact: yu.sheng611@gmail.com) requests/2.33"
OK_LICENSES = ("CC0", "CC BY", "Public domain", "PDM", "No restrictions")
BAD_LICENSES = ("Fair use",)
SKIP_TERMS = ("logo", "diagram", "infographic", "cartoon", "illustration", "map of", "chart")
PER_CATEGORY_TARGET = 8  # 多抓,之後人工挑

# 與 scrape.py 不同的查詢字串,盡量抓到不一樣的照片
QUERIES = {
    "beverage": ["plastic bottle shoreline", "aluminium can litter coast", "bottle cap sand pollution"],
    "food":     ["plastic wrapper beach", "styrofoam food container ocean", "plastic bag tide line"],
    "fishing":  ["fishing rope tangled beach", "trawl net washed ashore", "buoy marine litter"],
    "hazard":   ["cigarette butt sand close up", "disposable mask shoreline", "lighter beach plastic"],
    "other":    ["beach cleanup pile", "assorted plastic debris coast", "shoreline waste survey"],
}

def session():
    s = requests.Session(); s.headers.update({"User-Agent": USER_AGENT}); return s

def existing_titles():
    """讀 items.json,蒐集已用過的來源,避免重複。"""
    used = set()
    p = DATA_DIR / "items.json"
    if p.exists():
        data = json.loads(p.read_text(encoding="utf-8"))
        for it in data.get("items", []):
            for key in ("source", "title", "filename"):
                v = it.get(key)
                if v:
                    used.add(v.strip().lower())
    return used

def search_files(s, query, limit=20):
    params = {"action": "query", "list": "search", "srsearch": query,
              "srnamespace": 6, "srlimit": limit, "format": "json", "formatversion": 2}
    r = s.get(API, params=params, timeout=30); r.raise_for_status()
    return [h["title"] for h in r.json().get("query", {}).get("search", [])]

def file_info(s, titles):
    titles = list(titles)
    if not titles: return {}
    params = {"action": "query", "titles": "|".join(titles[:50]), "prop": "imageinfo",
              "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1200,
              "format": "json", "formatversion": 2}
    r = s.get(API, params=params, timeout=30); r.raise_for_status()
    out = {}
    for page in r.json().get("query", {}).get("pages", []):
        ii = page.get("imageinfo")
        if ii: out[page["title"]] = ii[0]
    return out

def license_of(meta):
    em = meta.get("extmetadata") or {}
    short = (em.get("LicenseShortName") or {}).get("value", "")
    artist = re.sub(r"<[^>]+>", "", (em.get("Artist") or {}).get("value", "")).strip()
    return short, artist

def is_acceptable(meta):
    short, _ = license_of(meta)
    if not short or any(b.lower() in short.lower() for b in BAD_LICENSES): return False
    return any(ok.lower() in short.lower() for ok in OK_LICENSES)

def looks_relevant(title):
    t = title.lower()
    if any(sk in t for sk in SKIP_TERMS): return False
    return t.endswith((".jpg", ".jpeg", ".png", ".webp"))

def safe_filename(title):
    base = title.split(":", 1)[1] if ":" in title else title
    base = re.sub(r"_+", "_", re.sub(r"[^a-z0-9.]+", "_", base.lower())).strip("_.")
    if "." not in base: base += ".jpg"
    return re.sub(r"\.(png|webp|jpeg)$", ".jpg", base)

def download_and_resize(s, url, dst, max_w=800):
    try:
        r = s.get(url, timeout=60); r.raise_for_status()
        img = Image.open(BytesIO(r.content)).convert("RGB")
        if img.width > max_w:
            img = img.resize((max_w, int(img.height * max_w / img.width)), Image.LANCZOS)
        dst.parent.mkdir(parents=True, exist_ok=True)
        img.save(dst, "JPEG", quality=85, optimize=True); return True
    except Exception as exc:
        print(f"  ! failed {url}: {exc}", file=sys.stderr); return False

def main():
    s = session()
    used = existing_titles()
    items, seen = [], set()
    for category, queries in QUERIES.items():
        print(f"\n=== {category} ===")
        cands = []
        for q in queries:
            try: titles = search_files(s, q)
            except Exception as exc: print(f"  ! {exc}", file=sys.stderr); continue
            for t in titles:
                tl = t.strip().lower()
                if t in seen or tl in used or not looks_relevant(t): continue
                cands.append(t); seen.add(t)
            time.sleep(0.5)
        infos = {}
        for i in range(0, len(cands), 40):
            try: infos.update(file_info(s, cands[i:i+40]))
            except Exception as exc: print(f"  ! {exc}", file=sys.stderr)
            time.sleep(0.5)
        seq = 0
        for title in cands:
            if seq >= PER_CATEGORY_TARGET: break
            meta = infos.get(title)
            if not meta or not is_acceptable(meta): continue
            url = meta.get("thumburl") or meta.get("url")
            if not url: continue
            short, artist = license_of(meta)
            seq += 1
            fname = f"live_{category[:3]}_{seq:02d}_{safe_filename(title)}"
            dst = LIVE_DIR / fname
            if not dst.exists() and not download_and_resize(s, url, dst):
                seq -= 1; continue
            items.append({
                "id": f"live_{category}_{seq:02d}",
                "filename": f"images/live/{fname}",
                "category": category, "label": "", "icc_item": None, "hint": "",
                "source": meta.get("descriptionurl", "") or f"https://commons.wikimedia.org/wiki/{title.replace(' ', '_')}",
                "license": short, "artist": artist, "title": title,
            })
            time.sleep(0.4)
        print(f"  kept: {seq}")
    out = DATA_DIR / "items.live.draft.json"
    out.write_text(json.dumps({
        "version": "0.1-draft",
        "categories": {
            "beverage": {"label": "飲料容器", "color": "#3B82F6"},
            "food":     {"label": "食物包裝", "color": "#10B981"},
            "fishing":  {"label": "漁業用具", "color": "#F59E0B"},
            "hazard":   {"label": "個人衛生與危險", "color": "#EF4444"},
            "other":    {"label": "其他/不確定", "color": "#6B7280"},
        },
        "items": items,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDraft written: {out.relative_to(ROOT)}  ({len(items)} items)")
    print("Next: 人工挑圖、填 label 與 icc_item,另存為 data/items.live.json")
    return 0

if __name__ == "__main__":
    sys.exit(main())

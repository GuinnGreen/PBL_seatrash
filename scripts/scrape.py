#!/usr/bin/env python3
"""
從 Wikimedia Commons 抓海廢照片，依五類目標分類下載。
產出：images/{category}/*.jpg + data/items.draft.json

使用：
    python3 scripts/scrape.py
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Iterable

import requests
from PIL import Image
from io import BytesIO

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "images"
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

USER_AGENT = (
    "OceanGuardianPBL/0.1 "
    "(educational; contact: yu.sheng611@gmail.com) "
    "requests/2.33"
)

API = "https://commons.wikimedia.org/w/api.php"

# Acceptable licenses (substring match against extmetadata.LicenseShortName)
OK_LICENSES = ("CC0", "CC BY", "Public domain", "PDM", "No restrictions")
BAD_LICENSES = ("Fair use",)

# Search queries per category. Each query asks for files in namespace 6 (File:).
QUERIES = {
    "beverage": [
        "plastic bottle beach pollution",
        "PET bottle ocean debris",
        "beverage can beach",
        "glass bottle beach litter",
        "bottle cap marine pollution",
    ],
    "food": [
        "plastic bag beach pollution",
        "drinking straw beach",
        "food packaging marine debris",
        "single-use plastic litter",
        "disposable cutlery beach",
    ],
    "fishing": [
        "ghost fishing net debris",
        "fishing buoy beach",
        "rope marine debris",
        "polystyrene float beach",
        "abandoned fishing gear",
    ],
    "hazard": [
        "toothbrush beach plastic",
        "cigarette butts sand",
        "medical waste beach",
        "face mask marine litter",
        "syringe beach pollution",
    ],
    "other": [
        "microplastic beach",
        "marine debris assorted",
        "beach litter pile",
        "ocean trash collection",
        "shoreline cleanup waste",
    ],
}

# Keep the most useful per category (script picks top-N globally per category).
PER_CATEGORY_TARGET = 12  # gather more, human will trim later

# Skip files that have these terms — likely not relevant
SKIP_TERMS = (
    "logo",
    "diagram",
    "infographic",
    "cartoon",
    "illustration",
    "map of",
    "chart",
)


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    return s


def search_files(s: requests.Session, query: str, limit: int = 25) -> list[str]:
    """Return list of File:... titles matching query."""
    params = {
        "action": "query",
        "list": "search",
        "srsearch": query,
        "srnamespace": 6,  # File namespace
        "srlimit": limit,
        "format": "json",
        "formatversion": 2,
    }
    r = s.get(API, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    titles = [hit["title"] for hit in data.get("query", {}).get("search", [])]
    return titles


def file_info(s: requests.Session, titles: Iterable[str]) -> dict:
    """Fetch imageinfo (url, license, size) for a batch of titles."""
    titles = list(titles)
    if not titles:
        return {}
    params = {
        "action": "query",
        "titles": "|".join(titles[:50]),  # API limit ~50 per call
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": 1200,
        "format": "json",
        "formatversion": 2,
    }
    r = s.get(API, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    out = {}
    for page in data.get("query", {}).get("pages", []):
        ii = page.get("imageinfo")
        if not ii:
            continue
        info = ii[0]
        out[page["title"]] = info
    return out


def license_of(meta: dict) -> tuple[str, str]:
    em = meta.get("extmetadata") or {}
    short = (em.get("LicenseShortName") or {}).get("value", "")
    artist = (em.get("Artist") or {}).get("value", "")
    artist = re.sub(r"<[^>]+>", "", artist).strip()  # strip HTML
    return short, artist


def is_acceptable(meta: dict) -> bool:
    short, _ = license_of(meta)
    if not short:
        return False
    if any(b.lower() in short.lower() for b in BAD_LICENSES):
        return False
    return any(ok.lower() in short.lower() for ok in OK_LICENSES)


def looks_relevant(title: str) -> bool:
    t = title.lower()
    for skip in SKIP_TERMS:
        if skip in t:
            return False
    # require an image-y extension
    return t.endswith((".jpg", ".jpeg", ".png", ".webp"))


def safe_filename(title: str) -> str:
    # 'File:My Photo (something).jpg' -> 'my_photo_something.jpg'
    base = title.split(":", 1)[1] if ":" in title else title
    base = base.lower()
    base = re.sub(r"[^a-z0-9.]+", "_", base)
    base = re.sub(r"_+", "_", base).strip("_.")
    if "." not in base:
        base += ".jpg"
    # Force .jpg output (we re-encode)
    base = re.sub(r"\.(png|webp|jpeg)$", ".jpg", base)
    return base


def download_and_resize(s: requests.Session, url: str, dst: Path, max_w: int = 800) -> bool:
    try:
        r = s.get(url, timeout=60)
        r.raise_for_status()
        img = Image.open(BytesIO(r.content)).convert("RGB")
        if img.width > max_w:
            ratio = max_w / img.width
            img = img.resize((max_w, int(img.height * ratio)), Image.LANCZOS)
        dst.parent.mkdir(parents=True, exist_ok=True)
        img.save(dst, "JPEG", quality=85, optimize=True)
        return True
    except Exception as exc:
        print(f"  ! failed {url}: {exc}", file=sys.stderr)
        return False


def main() -> int:
    s = session()
    items = []
    seen_titles: set[str] = set()
    seq_per_cat: dict[str, int] = {k: 0 for k in QUERIES}

    for category, queries in QUERIES.items():
        print(f"\n=== {category} ===")
        candidate_titles: list[str] = []

        # Step 1: collect candidate titles from all queries in this category
        for q in queries:
            print(f"  search: {q}")
            try:
                titles = search_files(s, q, limit=15)
            except Exception as exc:
                print(f"  ! search failed: {exc}", file=sys.stderr)
                continue
            for t in titles:
                if t in seen_titles:
                    continue
                if not looks_relevant(t):
                    continue
                candidate_titles.append(t)
                seen_titles.add(t)
            time.sleep(0.5)

        print(f"  candidates: {len(candidate_titles)}")

        # Step 2: fetch info in batches, filter by license
        infos: dict[str, dict] = {}
        for i in range(0, len(candidate_titles), 40):
            batch = candidate_titles[i : i + 40]
            try:
                infos.update(file_info(s, batch))
            except Exception as exc:
                print(f"  ! fileinfo batch failed: {exc}", file=sys.stderr)
            time.sleep(0.5)

        kept = 0
        for title in candidate_titles:
            if seq_per_cat[category] >= PER_CATEGORY_TARGET:
                break
            meta = infos.get(title)
            if not meta:
                continue
            if not is_acceptable(meta):
                continue
            url = meta.get("thumburl") or meta.get("url")
            if not url:
                continue
            short, artist = license_of(meta)
            seq_per_cat[category] += 1
            seq = seq_per_cat[category]
            fname = f"{category[:3]}_{seq:02d}_{safe_filename(title)}"
            dst = IMG_DIR / category / fname
            if dst.exists():
                kept += 1
                continue
            ok = download_and_resize(s, url, dst, max_w=800)
            if not ok:
                seq_per_cat[category] -= 1
                continue
            kept += 1
            items.append(
                {
                    "id": f"{category}_{seq:02d}",
                    "filename": f"images/{category}/{fname}",
                    "category": category,
                    "label": "",  # human fills this
                    "icc_item": None,
                    "hint": "",
                    "source": meta.get("descriptionurl", "") or f"https://commons.wikimedia.org/wiki/{title.replace(' ', '_')}",
                    "license": short,
                    "artist": artist,
                    "title": title,
                }
            )
            time.sleep(0.4)

        print(f"  kept: {kept}/{seq_per_cat[category]}")

    # Write draft items
    items_path = DATA_DIR / "items.draft.json"
    with items_path.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "version": "0.1-draft",
                "categories": {
                    "beverage": {"label": "飲料容器", "color": "#3B82F6"},
                    "food":     {"label": "食物包裝", "color": "#10B981"},
                    "fishing":  {"label": "漁業用具", "color": "#F59E0B"},
                    "hazard":   {"label": "個人衛生與危險", "color": "#EF4444"},
                    "other":    {"label": "其他/不確定", "color": "#6B7280"},
                },
                "items": items,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print("\n=== summary ===")
    for cat, n in seq_per_cat.items():
        print(f"  {cat:10s} {n}")
    print(f"\nDraft written: {items_path.relative_to(ROOT)}")
    print("Next: human-review images, fill in `label` and `icc_item`, save as data/items.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
從 Wikimedia Commons 「分類（Category）」抓海廢照片。
比 search 精準很多 — 分類已由社群人工策展。

使用：
    python3 scripts/scrape_categories.py
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from io import BytesIO

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / "images"
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

USER_AGENT = (
    "OceanGuardianPBL/0.1 (educational; contact: yu.sheng611@gmail.com) "
    "requests/2.33"
)
API = "https://commons.wikimedia.org/w/api.php"

OK_LICENSES = ("CC0", "CC BY", "Public domain", "PDM", "No restrictions")
BAD_LICENSES = ("Fair use",)

# (category_title, target_our_category, hint_label)
SOURCES = [
    # --- beverage --- bottles, caps, cans
    ("Category:Plastic bottles on beaches",         "beverage", "寶特瓶"),
    ("Category:Discarded plastic bottles",           "beverage", "寶特瓶"),
    ("Category:Drinking glasses on beaches",         "beverage", "玻璃瓶"),
    ("Category:Discarded glass bottles",             "beverage", "玻璃瓶"),
    ("Category:Discarded beverage cans",             "beverage", "鐵鋁罐"),

    # --- food packaging --- bags, cutlery, straws
    ("Category:Plastic bag pollution",               "food",     "塑膠提袋"),
    ("Category:Discarded plastic bags",              "food",     "塑膠提袋"),
    ("Category:Drinking straw pollution",            "food",     "吸管"),
    ("Category:Discarded drinking straws",           "food",     "吸管"),
    ("Category:Disposable food packaging",           "food",     "食品包裝袋"),

    # --- fishing gear ---
    ("Category:Discarded fishing nets",              "fishing",  "漁網"),
    ("Category:Ghost nets",                          "fishing",  "幽靈漁網"),
    ("Category:Marine debris (fishing gear)",        "fishing",  "漁具"),
    ("Category:Buoys on beaches",                    "fishing",  "浮球"),
    ("Category:Polystyrene pollution",               "fishing",  "保麗龍浮具"),
    ("Category:Ropes on beaches",                    "fishing",  "繩索"),

    # --- hazard ---
    ("Category:Cigarette butts",                     "hazard",   "菸蒂"),
    ("Category:Discarded face masks",                "hazard",   "口罩"),
    ("Category:Discarded toothbrushes",              "hazard",   "牙刷"),
    ("Category:Discarded medical equipment",         "hazard",   "醫療廢棄物"),
    ("Category:Syringes",                            "hazard",   "針筒"),

    # --- other ---
    ("Category:Microplastics",                       "other",    "微塑膠"),
    ("Category:Marine debris",                       "other",    "海洋廢棄物"),
    ("Category:Beach litter",                        "other",    "沙灘垃圾"),
    ("Category:Plastic pollution",                   "other",    "塑膠污染"),
]

# Per source, max images to take (to spread variety)
PER_SOURCE = 6
# Per category, total cap
PER_CATEGORY_CAP = 14

SKIP_TERMS = (
    "logo", "diagram", "infographic", "cartoon",
    "illustration", "map of", "chart", "atlas",
    "graph",
)


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    return s


def category_files(s: requests.Session, category: str, limit: int = 50) -> list[str]:
    out: list[str] = []
    cmcontinue = None
    while len(out) < limit:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": category,
            "cmtype": "file",
            "cmlimit": min(50, limit - len(out)),
            "format": "json",
            "formatversion": 2,
        }
        if cmcontinue:
            params["cmcontinue"] = cmcontinue
        try:
            r = s.get(API, params=params, timeout=30)
            r.raise_for_status()
            data = r.json()
        except Exception as exc:
            print(f"  ! cat fetch failed for {category}: {exc}", file=sys.stderr)
            break
        members = data.get("query", {}).get("categorymembers", [])
        out.extend([m["title"] for m in members])
        cmcontinue = data.get("continue", {}).get("cmcontinue")
        if not cmcontinue:
            break
        time.sleep(0.3)
    return out


def file_info(s: requests.Session, titles) -> dict:
    titles = list(titles)
    if not titles:
        return {}
    out = {}
    for i in range(0, len(titles), 40):
        batch = titles[i : i + 40]
        params = {
            "action": "query",
            "titles": "|".join(batch),
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": 1200,
            "format": "json",
            "formatversion": 2,
        }
        try:
            r = s.get(API, params=params, timeout=30)
            r.raise_for_status()
            for page in r.json().get("query", {}).get("pages", []):
                ii = page.get("imageinfo")
                if ii:
                    out[page["title"]] = ii[0]
        except Exception as exc:
            print(f"  ! fileinfo batch failed: {exc}", file=sys.stderr)
        time.sleep(0.3)
    return out


def license_of(meta: dict):
    em = meta.get("extmetadata") or {}
    short = (em.get("LicenseShortName") or {}).get("value", "")
    artist = (em.get("Artist") or {}).get("value", "")
    artist = re.sub(r"<[^>]+>", "", artist).strip()
    return short, artist


def acceptable(meta: dict) -> bool:
    short, _ = license_of(meta)
    if not short:
        return False
    if any(b.lower() in short.lower() for b in BAD_LICENSES):
        return False
    return any(ok.lower() in short.lower() for ok in OK_LICENSES)


def looks_relevant(title: str) -> bool:
    t = title.lower()
    for s in SKIP_TERMS:
        if s in t:
            return False
    if not t.endswith((".jpg", ".jpeg", ".png", ".webp")):
        return False
    # Exclude common non-debris noise (boat photos, vendors, people)
    bad_terms = ("boat", "ship", "vendor", "fisherman", "festival",
                 "model_", "logo", "infographic", "portrait",
                 "ashtray", "monument", "drawing", "sketch")
    return not any(b in t for b in bad_terms)


def safe_filename(title: str) -> str:
    base = title.split(":", 1)[1] if ":" in title else title
    base = base.lower()
    base = re.sub(r"[^a-z0-9.]+", "_", base)
    base = re.sub(r"_+", "_", base).strip("_.")
    if "." not in base:
        base += ".jpg"
    base = re.sub(r"\.(png|webp|jpeg)$", ".jpg", base)
    return base


def download_and_resize(s, url, dst, max_w=800):
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
    items: list[dict] = []
    seen: set[str] = set()
    seq_per_cat: dict[str, int] = {"beverage": 0, "food": 0, "fishing": 0, "hazard": 0, "other": 0}

    # Load existing draft to avoid duplicating
    existing_path = DATA_DIR / "items.draft.json"
    existing_titles: set[str] = set()
    if existing_path.exists():
        with existing_path.open("r", encoding="utf-8") as f:
            for it in json.load(f).get("items", []):
                existing_titles.add(it.get("title", ""))

    for cat_title, my_cat, hint in SOURCES:
        if seq_per_cat[my_cat] >= PER_CATEGORY_CAP:
            continue
        print(f"\n=== {cat_title} → {my_cat} ===")
        try:
            files = category_files(s, cat_title, limit=40)
        except Exception as exc:
            print(f"  ! failed: {exc}")
            continue
        # Filter & limit per source
        files = [t for t in files if t not in seen and t not in existing_titles and looks_relevant(t)]
        files = files[: PER_SOURCE * 2]
        if not files:
            print(f"  no usable files")
            continue
        infos = file_info(s, files)
        added = 0
        for title in files:
            if seq_per_cat[my_cat] >= PER_CATEGORY_CAP:
                break
            if added >= PER_SOURCE:
                break
            meta = infos.get(title)
            if not meta or not acceptable(meta):
                continue
            url = meta.get("thumburl") or meta.get("url")
            if not url:
                continue
            short, artist = license_of(meta)
            seq_per_cat[my_cat] += 1
            seq = seq_per_cat[my_cat]
            prefix_map = {"beverage": "bev2", "food": "foo2", "fishing": "fis2", "hazard": "haz2", "other": "oth2"}
            fname = f"{prefix_map[my_cat]}_{seq:02d}_{safe_filename(title)}"
            dst = IMG_DIR / my_cat / fname
            if dst.exists():
                seen.add(title)
                continue
            if not download_and_resize(s, url, dst, max_w=800):
                seq_per_cat[my_cat] -= 1
                continue
            seen.add(title)
            added += 1
            items.append(
                {
                    "id": f"{my_cat}_x{seq:02d}",
                    "filename": f"images/{my_cat}/{fname}",
                    "category": my_cat,
                    "label": hint,  # pre-fill from category hint, human can refine
                    "icc_item": None,
                    "hint": "",
                    "source": meta.get("descriptionurl", "") or f"https://commons.wikimedia.org/wiki/{title.replace(' ', '_')}",
                    "license": short,
                    "artist": artist,
                    "title": title,
                }
            )
            time.sleep(0.4)
        print(f"  added {added}")

    out_path = DATA_DIR / "items.cat.json"
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "version": "0.2-cat-draft",
                "items": items,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print("\n=== summary ===")
    for cat, n in seq_per_cat.items():
        print(f"  {cat:10s} {n}")
    print(f"\nWrote: {out_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

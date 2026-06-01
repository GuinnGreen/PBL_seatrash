# 即時挑戰(Live Quiz)模組 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在現有靜態網站新增 `/live/` 模組,老師大螢幕開房間、學生平板輸入加入碼即時搶答 ICC 分類,即時排行榜,支援個人/小組計分切換,使用與前後測完全不重疊的圖片題庫。

**Architecture:** 純前端(vanilla JS,GitHub Pages)+ Firebase Firestore 即時監聽(`onSnapshot`)。三個畫面:老師主控台(`live/host.html`)、學生端(`live/index.html`)、共用即時後端。純邏輯(計分、加入碼、抽樣)抽成可用 Node 單元測試的 ES module;Firebase/UI 用瀏覽器手動驗證。正解只存在主控端與 Firestore 規則保護下,出題時不下發給學生,防止背答案。

**Tech Stack:** HTML/CSS/vanilla ES modules、Firebase 10.12.0(Firestore + 既有匿名 Auth)、Python(Wikimedia 爬圖)、Node(純邏輯單元測試)。

**測試策略說明:** 本專案無 JS 測試框架(無 package.json、純靜態站)。本計畫對**純邏輯模組**採 TDD,用 `node:assert` 寫測試並以 `node` 執行;對 **Firebase 即時同步與 UI**採瀏覽器手動驗證(老師+學生兩個分頁)。這是依專案現實對 TDD 的調整。

---

## 檔案結構

**新增:**
- `package.json` — 僅 `{"type":"module","private":true}`,讓 Node 把 `.js` 當 ES module 跑測試(不影響瀏覽器,瀏覽器看 `<script>` 的 type 屬性)
- `js/live/scoring.js` — 純計分邏輯(答對+速度加分、小組加總)
- `js/live/scoring.test.js` — Node 測試
- `js/live/pin.js` — 加入碼產生/驗證
- `js/live/pin.test.js` — Node 測試
- `js/live/sampling.js` — 分層抽樣(沿用 game.js pickPool 精神)
- `js/live/sampling.test.js` — Node 測試
- `js/live/firebase-live.js` — Firestore 即時封裝(房間/玩家/作答/計分)
- `js/live/host.js` — 老師主控台控制器(狀態機 + UI)
- `js/live/player.js` — 學生端控制器
- `live/host.html` — 老師主控台頁面
- `live/index.html` — 學生端頁面
- `css/live.css` — 即時模組樣式
- `scripts/scrape_live.py` — 爬一批全新 CC 海廢照片(改自 scrape.py)
- `data/items.live.json` — 新題庫(與 items.json 零重疊)
- `images/live/*.jpg` — 新題庫圖片

**修改:**
- `js/firebase-config.js` — 末端加 `export { db, auth, readyPromise as ready };`
- `firestore.rules` — 新增 `live_rooms` 規則
- `index.html` — 首頁加入「即時挑戰」入口連結

---

## Task 0: 加入 package.json 讓 Node 能跑 ESM 測試

**Files:**
- Create: `package.json`

- [ ] **Step 1: 建立 package.json**

```json
{
  "name": "pbl-ocean-detective",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 2: 驗證不影響現有網站(瀏覽器以 `<script>` 標籤 type 決定模組性,與此檔無關)**

Run: `node -e "console.log(require('fs').existsSync('package.json') && 'ok')" 2>/dev/null || node -e "import('fs').then(()=>console.log('esm-ok'))"`
Expected: 印出 `esm-ok`(代表 Node 已用 ESM 模式)

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add package.json (type:module) for node-run unit tests"
```

---

## Task 1: 計分邏輯 scoring.js(TDD)

**Files:**
- Create: `js/live/scoring.js`
- Test: `js/live/scoring.test.js`

- [ ] **Step 1: 寫失敗測試**

```js
// js/live/scoring.test.js
import assert from 'node:assert/strict';
import { scoreAnswer, aggregateGroups } from './scoring.js';

// 答錯 → 0 分
assert.equal(scoreAnswer({ correct: false, timeMs: 100, timeLimitMs: 20000 }), 0);
// 答對 + 瞬間作答 → 滿分 base
assert.equal(scoreAnswer({ correct: true, timeMs: 0, timeLimitMs: 20000, base: 1000 }), 1000);
// 答對 + 用滿時間 → base/2
assert.equal(scoreAnswer({ correct: true, timeMs: 20000, timeLimitMs: 20000, base: 1000 }), 500);
// 答對 + 用一半時間 → base*0.75
assert.equal(scoreAnswer({ correct: true, timeMs: 10000, timeLimitMs: 20000, base: 1000 }), 750);
// 超時仍 clamp 到 base/2
assert.equal(scoreAnswer({ correct: true, timeMs: 99999, timeLimitMs: 20000, base: 1000 }), 500);

// 小組加總:依 group 欄位加總,忽略無組別者
const groups = aggregateGroups([
  { group: '1', score: 750 }, { group: '1', score: 500 },
  { group: '2', score: 1000 }, { group: '', score: 999 },
]);
assert.deepEqual(groups, { '1': 1250, '2': 1000 });

console.log('scoring.js: all tests passed');
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node js/live/scoring.test.js`
Expected: FAIL — `Cannot find module ... scoring.js`

- [ ] **Step 3: 寫最小實作**

```js
// js/live/scoring.js
// 即時搶答計分。答對給「基礎分 + 速度加分」,答錯 0 分。
// Kahoot 式:答對最少拿 base/2,越快越接近 base。
export function scoreAnswer({ correct, timeMs, timeLimitMs, base = 1000 }) {
  if (!correct) return 0;
  const frac = Math.max(0, Math.min(1, timeMs / timeLimitMs));
  return Math.round(base * (1 - frac / 2));
}

// 小組模式:把每位玩家的分數依組別加總。
// players: [{ group, score }] → { [group]: totalScore }
export function aggregateGroups(players) {
  const totals = {};
  for (const p of players) {
    const g = p.group;
    if (g == null || g === '') continue;
    totals[g] = (totals[g] || 0) + (p.score || 0);
  }
  return totals;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node js/live/scoring.test.js`
Expected: PASS — 印出 `scoring.js: all tests passed`

- [ ] **Step 5: Commit**

```bash
git add js/live/scoring.js js/live/scoring.test.js
git commit -m "feat(live): add scoring logic with speed bonus + group aggregation"
```

---

## Task 2: 加入碼 pin.js(TDD)

**Files:**
- Create: `js/live/pin.js`
- Test: `js/live/pin.test.js`

- [ ] **Step 1: 寫失敗測試**

```js
// js/live/pin.test.js
import assert from 'node:assert/strict';
import { generatePin, isValidPin } from './pin.js';

// 格式:固定 4 位數字字串(含前導 0)
for (let i = 0; i < 1000; i++) {
  const p = generatePin();
  assert.ok(isValidPin(p), `bad pin: ${p}`);
}
// 邊界:rand=0 → "0000";rand≈0.9999 → "9999"
assert.equal(generatePin(() => 0), '0000');
assert.equal(generatePin(() => 0.99999), '9999');
// isValidPin 拒絕非法值
assert.equal(isValidPin('12'), false);
assert.equal(isValidPin('12345'), false);
assert.equal(isValidPin('abcd'), false);
assert.equal(isValidPin(1234), false);

console.log('pin.js: all tests passed');
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node js/live/pin.test.js`
Expected: FAIL — `Cannot find module ... pin.js`

- [ ] **Step 3: 寫最小實作**

```js
// js/live/pin.js
// 4 位數加入碼(字串,保留前導 0,例如 "0427")。rand 可注入以利測試。
export function generatePin(rand = Math.random) {
  const n = Math.floor(rand() * 10000); // 0..9999
  return String(n).padStart(4, '0');
}

export function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node js/live/pin.test.js`
Expected: PASS — `pin.js: all tests passed`

- [ ] **Step 5: Commit**

```bash
git add js/live/pin.js js/live/pin.test.js
git commit -m "feat(live): add 4-digit room PIN generation + validation"
```

---

## Task 3: 分層抽樣 sampling.js(TDD)

**Files:**
- Create: `js/live/sampling.js`
- Test: `js/live/sampling.test.js`

- [ ] **Step 1: 寫失敗測試**

```js
// js/live/sampling.test.js
import assert from 'node:assert/strict';
import { pickLivePool } from './sampling.js';

const cats = ['beverage', 'food', 'fishing', 'hazard', 'other'];
// 造 10 題/類,共 50 題
const items = [];
for (const c of cats) for (let i = 0; i < 10; i++) items.push({ category: c, label: `${c}${i}` });

// 抽 20 題 → 每類應 4 題
const pool = pickLivePool(items, cats, 20);
assert.equal(pool.length, 20);
const counts = {};
for (const it of pool) counts[it.category] = (counts[it.category] || 0) + 1;
for (const c of cats) assert.equal(counts[c], 4, `${c} 應 4 題,實得 ${counts[c]}`);

// 沒有 label 的題目要被排除(與 game.js 一致)
const sparse = [{ category: 'beverage', label: '' }, { category: 'food', label: 'x' }];
const pool2 = pickLivePool(sparse, cats, 5);
assert.ok(pool2.every((it) => it.label), '不應含無 label 題目');

console.log('sampling.js: all tests passed');
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node js/live/sampling.test.js`
Expected: FAIL — `Cannot find module ... sampling.js`

- [ ] **Step 3: 寫最小實作(沿用 game.js pickPool 精神)**

```js
// js/live/sampling.js
// 分層抽樣:每類抽相同題數,不足再從剩餘補,最後打散讓分類交錯。
// 與 js/game.js 的 pickPool() 同精神,但參數化、亂數可注入以利測試。
export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// items: [{ category, label, ... }];categories: 類別 key 陣列;total: 想要的總題數。
// 回傳已打散、各類均衡的題目陣列。需有 category 且有 label 才納入(與 game.js 一致)。
export function pickLivePool(items, categories, total, rand = Math.random) {
  const per = Math.floor(total / categories.length);
  const byCat = {};
  for (const c of categories) byCat[c] = [];
  for (const it of items) {
    if (!it.category || !it.label) continue;
    if (byCat[it.category]) byCat[it.category].push(it);
  }
  const picked = [];
  const leftover = [];
  for (const c of categories) {
    const sh = shuffle(byCat[c], rand);
    picked.push(...sh.slice(0, per));
    leftover.push(...sh.slice(per));
  }
  if (picked.length < total) {
    picked.push(...shuffle(leftover, rand).slice(0, total - picked.length));
  }
  return shuffle(picked, rand).slice(0, total);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node js/live/sampling.test.js`
Expected: PASS — `sampling.js: all tests passed`

- [ ] **Step 5: Commit**

```bash
git add js/live/sampling.js js/live/sampling.test.js
git commit -m "feat(live): add stratified sampling for balanced live question pool"
```

---

## Task 4: 爬圖腳本 scrape_live.py

**Files:**
- Create: `scripts/scrape_live.py`

- [ ] **Step 1: 建立腳本(改自 scripts/scrape.py,輸出到 images/live/ 與 data/items.live.draft.json,並排除 items.json 已用過的標題)**

```python
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
```

- [ ] **Step 2: 試跑腳本**

Run: `python3 scripts/scrape_live.py`
Expected: `images/live/` 出現一批 .jpg,且印出 `Draft written: data/items.live.draft.json (N items)`,N 約 20–40。若 `requests`/`PIL` 缺套件,先 `pip install requests pillow`。

- [ ] **Step 3: Commit 腳本(先不 commit 圖與 draft,下一個 Task 人工整理後再 commit)**

```bash
git add scripts/scrape_live.py
git commit -m "feat(live): add scrape_live.py for fresh CC images disjoint from items.json"
```

---

## Task 5: 人工整理 → data/items.live.json(與前後測零重疊)

**Files:**
- Create: `data/items.live.json`
- Create: `images/live/*.jpg`(挑選後保留)

- [ ] **Step 1: 人工挑圖**

打開 `images/live/` 逐張看,刪掉不相關/看不出分類的。目標每類至少 4 張可用、總數 ≥ 20。

- [ ] **Step 2: 由 draft 產生正式題庫**

把 `data/items.live.draft.json` 複製為 `data/items.live.json`,逐項:
- 填 `label`(中文短描述,例:「海灘寶特瓶」)
- 填 `icc_item`(ICC 1–20 的編號,參考 `data/icc-images.json`)
- 刪掉對應圖片已刪除的項目
- `version` 改為 `"1.0"`

- [ ] **Step 3: 驗證與 items.json 零重疊**

Run:
```bash
node -e '
const a=JSON.parse(require("fs").readFileSync("data/items.json","utf8")).items.map(i=>i.filename);
const b=JSON.parse(require("fs").readFileSync("data/items.live.json","utf8")).items;
const aset=new Set(a);
const dup=b.filter(i=>aset.has(i.filename));
const noLabel=b.filter(i=>!i.label||i.icc_item==null);
console.log("live items:",b.length,"| 與前後測重疊:",dup.length,"| 缺 label/icc:",noLabel.length);
if(dup.length||noLabel.length) process.exit(1);
console.log("OK: 零重疊、欄位齊全");
'
```
Expected: `OK: 零重疊、欄位齊全`(重疊與缺欄位皆為 0)

- [ ] **Step 4: Commit**

```bash
git add data/items.live.json images/live
git commit -m "feat(live): add curated live question pool (disjoint from pre/post test)"
```

---

## Task 6: firebase-config.js 匯出 db/auth/ready

**Files:**
- Modify: `js/firebase-config.js`(檔尾)

- [ ] **Step 1: 在檔案最後加上 ES 匯出(保留既有 window.OG 不動)**

在 `js/firebase-config.js` 結尾、最後一行之後新增:

```js
// 供 live 模組以 ES module 方式重用同一個 app 的 db/auth/匿名登入狀態
export { db, auth, readyPromise as ready };
```

- [ ] **Step 2: 語法檢查**

Run: `node --check js/firebase-config.js`
Expected: 無輸出(語法正確)。註:此檔含 `https://` import,Node 不會實際執行,只檢查語法。

- [ ] **Step 3: Commit**

```bash
git add js/firebase-config.js
git commit -m "refactor(live): export db/auth/ready from firebase-config for reuse"
```

---

## Task 7: Firestore 即時封裝 firebase-live.js

**Files:**
- Create: `js/live/firebase-live.js`

- [ ] **Step 1: 建立模組**

```js
// js/live/firebase-live.js
// 即時挑戰的 Firestore 封裝。重用 firebase-config.js 既有的 app/匿名 auth。
// 正解不寫進玩家可讀的欄位;出題只下發 image,公布時才寫 correct。
import {
  doc, getDoc, setDoc, updateDoc, collection, onSnapshot,
  query, where, serverTimestamp, increment, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { db, auth, ready } from '../firebase-config.js';
import { generatePin } from './pin.js';

const roomRef    = (pin) => doc(db, 'live_rooms', pin);
const playersCol = (pin) => collection(db, 'live_rooms', pin, 'players');
const answersCol = (pin) => collection(db, 'live_rooms', pin, 'answers');

// 主持端:建立房間。categories = [{key,label,color}](不含任何題目正解)。
export async function createRoom({ mode, categories }) {
  await ready;
  for (let attempt = 0; attempt < 6; attempt++) {
    const pin = generatePin();
    const snap = await getDoc(roomRef(pin));
    if (snap.exists()) continue;
    await setDoc(roomRef(pin), {
      pin,
      hostId: auth.currentUser.uid,
      mode,                 // 'individual' | 'group'
      state: 'lobby',       // lobby | question | reveal | ended
      currentIndex: -1,
      currentQuestion: null,
      categories,
      createdAt: serverTimestamp(),
    });
    return { pin };
  }
  throw new Error('無法產生未使用的加入碼,請重試');
}

// 學生端:加入房間(doc id = 自己的匿名 uid)
export async function joinRoom(pin, { name, group }) {
  await ready;
  const uid = auth.currentUser.uid;
  await setDoc(doc(db, 'live_rooms', pin, 'players', uid), {
    name: name || '', group: group || '', score: 0, joinedAt: serverTimestamp(),
  });
  return uid;
}

export function watchRoom(pin, cb) {
  return onSnapshot(roomRef(pin), (s) => cb(s.exists() ? s.data() : null));
}
export function watchPlayers(pin, cb) {
  return onSnapshot(playersCol(pin), (s) =>
    cb(s.docs.map((d) => ({ uid: d.id, ...d.data() }))));
}

// 主持端:推一題(只送 image,不含正解),狀態轉 question
export async function pushQuestion(pin, index, image) {
  await updateDoc(roomRef(pin), {
    state: 'question', currentIndex: index, currentQuestion: { index, image, correct: null },
  });
}
// 主持端:結束作答(停止計時,尚未公布正解)
export async function lockAnswers(pin) {
  await updateDoc(roomRef(pin), { state: 'locked' });
}
// 主持端:公布正解(寫入 correct,讓學生看到對錯)
export async function revealQuestion(pin, index, image, correct) {
  await updateDoc(roomRef(pin), {
    state: 'reveal', currentQuestion: { index, image, correct },
  });
}
export async function endGame(pin) {
  await updateDoc(roomRef(pin), { state: 'ended' });
}

// 學生端:送出作答(只有 choice + 花費時間)
export async function submitAnswer(pin, index, { choice, timeMs }) {
  await ready;
  const uid = auth.currentUser.uid;
  await setDoc(doc(db, 'live_rooms', pin, 'answers', `${index}_${uid}`), {
    uid, qIndex: index, choice, timeMs, points: null, createdAt: serverTimestamp(),
  });
}
// 主持端:監看某題所有作答(供計分與分布圖)
export function watchAnswers(pin, index, cb) {
  const q = query(answersCol(pin), where('qIndex', '==', index));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
// 學生端:監看自己這題的作答(取得公布後的 points)
export function watchMyAnswer(pin, index, cb) {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  return onSnapshot(doc(db, 'live_rooms', pin, 'answers', `${index}_${uid}`),
    (s) => cb(s.exists() ? s.data() : null));
}

// 主持端:批次寫回每人得分並累加到 player.score。scored = [{ id, uid, points }]
export async function applyScores(pin, scored) {
  const batch = writeBatch(db);
  for (const s of scored) {
    batch.update(doc(db, 'live_rooms', pin, 'answers', s.id), { points: s.points });
    batch.update(doc(db, 'live_rooms', pin, 'players', s.uid), { score: increment(s.points) });
  }
  await batch.commit();
}

export const auth_ = auth; // 方便頁面取得 currentUser
```

- [ ] **Step 2: 語法檢查**

Run: `node --check js/live/firebase-live.js`
Expected: 無輸出(語法正確)

- [ ] **Step 3: Commit**

```bash
git add js/live/firebase-live.js
git commit -m "feat(live): add Firestore realtime wrapper for rooms/players/answers"
```

---

## Task 8: Firestore 安全規則(live_rooms)

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: 在 `match /databases/{database}/documents {` 內、game_records 區塊之後新增 live_rooms 規則**

```
    match /live_rooms/{pin} {
      function isHost() {
        return request.auth != null
          && get(/databases/$(database)/documents/live_rooms/$(pin)).data.hostId == request.auth.uid;
      }

      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.resource.data.hostId == request.auth.uid
        && request.resource.data.mode in ['individual', 'group']
        && request.resource.data.state == 'lobby';
      allow update: if request.auth != null
        && resource.data.hostId == request.auth.uid;
      allow delete: if false;

      match /players/{uid} {
        allow read: if request.auth != null;
        allow create: if request.auth != null
          && request.auth.uid == uid
          && request.resource.data.score == 0;
        // 本人可改 name/group(但不可改自己分數);主持人可改 score
        allow update: if request.auth != null && (
          (request.auth.uid == uid
            && request.resource.data.score == resource.data.score)
          || isHost()
        );
        allow delete: if false;
      }

      match /answers/{answerId} {
        // 主持人可讀全部(計分);學生只能讀自己的(看公布後得分)
        allow read: if isHost()
          || (request.auth != null && resource.data.uid == request.auth.uid);
        allow create: if request.auth != null
          && request.resource.data.uid == request.auth.uid
          && request.resource.data.choice is string;
        allow update: if isHost();   // 主持人回寫 points
        allow delete: if false;
      }
    }
```

- [ ] **Step 2: 本機驗證規則語法**

Run: `firebase deploy --only firestore:rules --dry-run 2>/dev/null || npx -y firebase-tools firestore:rules:canary --help >/dev/null 2>&1 || echo "改用 Step 3 直接部署驗證"`
Expected: 若 firebase CLI 可用會通過編譯;否則進 Step 3。

- [ ] **Step 3: 部署規則**

Run: `firebase deploy --only firestore:rules`
Expected: `✔ Deploy complete!`。若需登入,提示使用者在對話框輸入 `! firebase login`。

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(live): add Firestore security rules for live_rooms (host-gated writes)"
```

---

## Task 9: 學生端 live/index.html + player.js + live.css

**Files:**
- Create: `live/index.html`
- Create: `js/live/player.js`
- Create: `css/live.css`

- [ ] **Step 1: 建立 css/live.css(沿用 base.css 設計 token)**

```css
/* css/live.css — 即時挑戰共用樣式 */
.live-wrap { max-width: 720px; margin: 0 auto; padding: 24px 16px; text-align: center; }
.live-pin-input { font-size: 2rem; letter-spacing: 0.3em; text-align: center; width: 8ch;
  padding: 12px; border: 2px solid var(--color-border, #cbd5e1); border-radius: 12px; }
.live-cat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
.live-cat-btn { padding: 20px; font-size: 1.1rem; color: #fff; border: none; border-radius: 14px;
  cursor: pointer; min-height: 84px; }
.live-cat-btn:disabled { opacity: 0.45; cursor: default; }
.live-cat-btn.is-correct { outline: 4px solid #16a34a; }
.live-cat-btn.is-wrong { outline: 4px solid #dc2626; }
.live-q-img { max-width: 100%; max-height: 50vh; border-radius: 14px; }
.live-big { font-size: 3rem; font-weight: 800; letter-spacing: 0.15em; }
.live-grid-screen { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(120px,1fr)); }
.live-bar { height: 24px; background: var(--color-primary, #2563eb); border-radius: 6px; }
.live-hidden { display: none !important; }
```

- [ ] **Step 2: 建立 live/index.html**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>即時挑戰 · 海洋偵查員</title>
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/live.css">
</head>
<body>
  <div class="live-wrap">
    <!-- 1. 輸入加入碼 -->
    <section id="join-pin">
      <h1>即時挑戰</h1>
      <p>輸入老師螢幕上的 4 位數加入碼</p>
      <input id="pin" class="live-pin-input" inputmode="numeric" maxlength="4" placeholder="0000">
      <div><button id="pin-go" class="live-cat-btn" style="background:var(--color-primary,#2563eb);max-width:200px;margin-top:16px">加入</button></div>
      <p id="pin-err" style="color:#dc2626"></p>
    </section>

    <!-- 2. 取名 / 選組 -->
    <section id="join-id" class="live-hidden">
      <h2 id="id-prompt">你的暱稱</h2>
      <input id="name" class="live-pin-input" style="width:12ch;letter-spacing:normal" maxlength="12">
      <div id="group-grid" class="live-cat-grid live-hidden"></div>
      <div><button id="id-go" class="live-cat-btn" style="background:var(--color-primary,#2563eb);max-width:200px;margin-top:16px">準備好了</button></div>
    </section>

    <!-- 3. 等待 / 作答 / 公布 -->
    <section id="play" class="live-hidden">
      <div id="waiting"><h2>等待老師出題…</h2></div>
      <div id="question" class="live-hidden">
        <img id="q-img" class="live-q-img" alt="這是什麼垃圾?">
        <div id="cat-grid" class="live-cat-grid"></div>
      </div>
      <div id="result" class="live-hidden"></div>
    </section>
  </div>

  <script type="module" src="../js/live/player.js"></script>
</body>
</html>
```

- [ ] **Step 3: 建立 js/live/player.js**

```js
// js/live/player.js — 學生端控制器
import {
  joinRoom, watchRoom, submitAnswer, watchMyAnswer,
} from './firebase-live.js';
import { isValidPin } from './pin.js';

const $ = (id) => document.getElementById(id);
const TIME_LIMIT_MS = 20000;

let pin = null, room = null, mode = null, categories = [];
let answeredIndex = -1, qStart = 0, myAnswerUnsub = null;

// 1. 加入碼
$('pin-go').onclick = async () => {
  const v = $('pin').value.trim();
  if (!isValidPin(v)) { $('pin-err').textContent = '請輸入 4 位數字'; return; }
  pin = v;
  // 先監看房間,確認存在並取得 mode/categories
  watchRoom(pin, onRoom);
};

function onRoom(data) {
  if (!data) { $('pin-err').textContent = '找不到這個房間'; return; }
  room = data; mode = data.mode; categories = data.categories || [];
  if ($('join-pin').classList.contains('live-hidden')) { renderState(); return; }
  // 進入取名/選組畫面
  $('join-pin').classList.add('live-hidden');
  $('join-id').classList.remove('live-hidden');
  if (mode === 'group') {
    $('id-prompt').textContent = '選擇你的組別';
    $('name').classList.add('live-hidden');
    const grid = $('group-grid'); grid.classList.remove('live-hidden');
    grid.innerHTML = '';
    for (let g = 1; g <= 6; g++) {
      const b = document.createElement('button');
      b.className = 'live-cat-btn'; b.style.background = 'var(--color-primary,#2563eb)';
      b.textContent = `第 ${g} 組`; b.dataset.group = g;
      b.onclick = () => { grid.querySelectorAll('button').forEach(x=>x.style.outline=''); b.style.outline='4px solid #16a34a'; b.dataset.sel='1'; };
      grid.appendChild(b);
    }
  }
}

// 2. 取名 / 選組 → 加入
$('id-go').onclick = async () => {
  let name = '', group = '';
  if (mode === 'group') {
    const sel = $('group-grid').querySelector('button[data-sel="1"]');
    if (!sel) { alert('請先選組別'); return; }
    group = sel.dataset.group;
  } else {
    name = $('name').value.trim() || '匿名偵查員';
  }
  await joinRoom(pin, { name, group });
  $('join-id').classList.add('live-hidden');
  $('play').classList.remove('live-hidden');
  renderState();
};

// 3. 依房間狀態渲染
function renderState() {
  if (!room) return;
  const st = room.state, q = room.currentQuestion;
  if (st === 'question' && q) {
    if (answeredIndex !== q.index) showQuestion(q);
  } else if (st === 'reveal' && q) {
    showReveal(q);
  } else { // lobby / locked / ended
    $('waiting').classList.remove('live-hidden');
    $('question').classList.add('live-hidden');
    $('result').classList.add('live-hidden');
    $('waiting').querySelector('h2').textContent =
      st === 'ended' ? '挑戰結束,看大螢幕排行榜!' :
      st === 'locked' ? '時間到,等待公布…' : '等待老師出題…';
  }
}

function showQuestion(q) {
  $('waiting').classList.add('live-hidden');
  $('result').classList.add('live-hidden');
  $('question').classList.remove('live-hidden');
  $('q-img').src = `../${q.image}`;
  qStart = performance.now();
  const grid = $('cat-grid'); grid.innerHTML = '';
  for (const c of categories) {
    const b = document.createElement('button');
    b.className = 'live-cat-btn'; b.style.background = c.color;
    b.textContent = c.label;
    b.onclick = () => choose(q.index, c.key, b);
    grid.appendChild(b);
  }
}

async function choose(index, key, btn) {
  if (answeredIndex === index) return;
  answeredIndex = index;
  const timeMs = Math.min(TIME_LIMIT_MS, performance.now() - qStart);
  $('cat-grid').querySelectorAll('button').forEach((x) => { x.disabled = true; });
  btn.style.outline = '4px solid #fff';
  await submitAnswer(pin, index, { choice: key, timeMs });
}

function showReveal(q) {
  $('question').classList.add('live-hidden');
  $('waiting').classList.add('live-hidden');
  const r = $('result'); r.classList.remove('live-hidden');
  const correctCat = categories.find((c) => c.key === q.correct);
  r.innerHTML = `<h2>正解:${correctCat ? correctCat.label : ''}</h2><p id="my-pts">計分中…</p>`;
  if (myAnswerUnsub) myAnswerUnsub();
  myAnswerUnsub = watchMyAnswer(pin, q.index, (a) => {
    if (!a) { $('my-pts').textContent = '這題你沒有作答'; return; }
    const ok = a.choice === q.correct;
    $('my-pts').textContent = a.points == null ? '計分中…'
      : (ok ? `答對!+${a.points} 分` : '答錯了,下一題加油');
  });
}
```

- [ ] **Step 4: 瀏覽器啟動本機伺服器**

Run: `python3 -m http.server 5500`(在專案根目錄;背景執行)
Expected: 伺服器啟動於 `http://localhost:5500`

- [ ] **Step 5: 手動驗證(學生端單頁)**

開 `http://localhost:5500/live/`:
- 輸入不存在的碼 `0000` → 顯示「找不到這個房間」(尚無房間時正常)
- 開瀏覽器 console 應無紅色錯誤(模組載入、firebase 匿名登入成功)

> 完整搶答流程在 Task 10 與主控台一起端到端驗證。

- [ ] **Step 6: Commit**

```bash
git add live/index.html js/live/player.js css/live.css
git commit -m "feat(live): add student player page (join, answer, reveal)"
```

---

## Task 10: 老師主控台 live/host.html + host.js

**Files:**
- Create: `live/host.html`
- Create: `js/live/host.js`

- [ ] **Step 1: 建立 live/host.html**

```html
<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>即時挑戰 主控台 · 海洋偵查員</title>
  <link rel="stylesheet" href="../css/base.css">
  <link rel="stylesheet" href="../css/live.css">
</head>
<body>
  <div class="live-wrap" style="max-width:960px">
    <!-- 設定 -->
    <section id="setup">
      <h1>即時挑戰 · 主控台</h1>
      <p>選擇計分模式</p>
      <button id="mode-individual" class="live-cat-btn" style="background:#2563eb;max-width:240px">個人對戰</button>
      <button id="mode-group" class="live-cat-btn" style="background:#7c3aed;max-width:240px">小組對戰</button>
    </section>

    <!-- 等待室 -->
    <section id="lobby" class="live-hidden">
      <h2>加入碼</h2>
      <div id="pin-display" class="live-big"></div>
      <p>學生開 <strong id="join-url"></strong> 輸入加入碼</p>
      <h3>已加入(<span id="player-count">0</span>)</h3>
      <div id="player-list" class="live-grid-screen"></div>
      <button id="start" class="live-cat-btn" style="background:#16a34a;max-width:240px;margin-top:16px">開始挑戰</button>
    </section>

    <!-- 出題中 -->
    <section id="stage" class="live-hidden">
      <div id="q-progress"></div>
      <img id="s-img" class="live-q-img" alt="題目">
      <h2 id="answered-count">已作答 0</h2>
      <div id="dist" class="live-hidden"></div>
      <div style="margin-top:16px">
        <button id="lock" class="live-cat-btn" style="background:#f59e0b;max-width:200px">結束作答</button>
        <button id="reveal" class="live-cat-btn live-hidden" style="background:#2563eb;max-width:200px">公布正解</button>
        <button id="next" class="live-cat-btn live-hidden" style="background:#16a34a;max-width:200px">下一題</button>
      </div>
    </section>

    <!-- 排行榜 -->
    <section id="board" class="live-hidden">
      <h2 id="board-title">排行榜</h2>
      <div id="board-list" class="live-grid-screen"></div>
    </section>
  </div>

  <script type="module" src="../js/firebase-config.js"></script>
  <script type="module" src="../js/live/host.js"></script>
</body>
</html>
```

- [ ] **Step 2: 建立 js/live/host.js**

```js
// js/live/host.js — 老師主控台控制器
import {
  createRoom, watchPlayers, pushQuestion, lockAnswers,
  revealQuestion, endGame, watchAnswers, applyScores,
} from './firebase-live.js';
import { pickLivePool } from './sampling.js';
import { scoreAnswer, aggregateGroups } from './scoring.js';

const $ = (id) => document.getElementById(id);
const TIME_LIMIT_MS = 20000;
const QUESTIONS = 10;

let pin = null, mode = null, categories = [], questionSet = [], index = -1;
let players = [], curAnswers = [], answersUnsub = null;

async function loadPool() {
  const res = await fetch('../data/items.live.json');
  const data = await res.json();
  categories = Object.entries(data.categories).map(([key, v]) => ({ key, label: v.label, color: v.color }));
  const catKeys = categories.map((c) => c.key);
  questionSet = pickLivePool(data.items, catKeys, QUESTIONS);
}

async function start(selMode) {
  mode = selMode;
  await loadPool();
  const { pin: p } = await createRoom({ mode, categories });
  pin = p;
  $('setup').classList.add('live-hidden');
  $('lobby').classList.remove('live-hidden');
  $('pin-display').textContent = pin;
  $('join-url').textContent = location.origin + location.pathname.replace('host.html', '');
  watchPlayers(pin, (list) => {
    players = list;
    $('player-count').textContent = list.length;
    $('player-list').innerHTML = list
      .map((p) => `<div class="live-cat-btn" style="background:#475569">${mode === 'group' ? '第' + p.group + '組' : (p.name || '匿名')}</div>`)
      .join('');
  });
}

$('mode-individual').onclick = () => start('individual');
$('mode-group').onclick = () => start('group');

$('start').onclick = () => { $('lobby').classList.add('live-hidden'); $('stage').classList.remove('live-hidden'); nextQuestion(); };

async function nextQuestion() {
  index += 1;
  if (index >= questionSet.length) return showBoard(true);
  const q = questionSet[index];
  curAnswers = [];
  $('q-progress').textContent = `第 ${index + 1} / ${questionSet.length} 題`;
  $('s-img').src = `../${q.filename}`;
  $('answered-count').textContent = '已作答 0';
  $('dist').classList.add('live-hidden');
  $('lock').classList.remove('live-hidden');
  $('reveal').classList.add('live-hidden');
  $('next').classList.add('live-hidden');
  await pushQuestion(pin, index, q.filename);
  if (answersUnsub) answersUnsub();
  answersUnsub = watchAnswers(pin, index, (list) => {
    curAnswers = list;
    $('answered-count').textContent = `已作答 ${list.length}`;
  });
}

$('lock').onclick = async () => {
  await lockAnswers(pin);
  $('lock').classList.add('live-hidden');
  $('reveal').classList.remove('live-hidden');
};

$('reveal').onclick = async () => {
  const q = questionSet[index];
  const correct = q.category;
  // 計分後回寫
  const scored = curAnswers.map((a) => ({
    id: a.id, uid: a.uid,
    points: scoreAnswer({ correct: a.choice === correct, timeMs: a.timeMs, timeLimitMs: TIME_LIMIT_MS }),
  }));
  if (scored.length) await applyScores(pin, scored);
  await revealQuestion(pin, index, q.filename, correct);
  // 分布圖
  const counts = {};
  for (const c of categories) counts[c.key] = 0;
  for (const a of curAnswers) counts[a.choice] = (counts[a.choice] || 0) + 1;
  const max = Math.max(1, ...Object.values(counts));
  $('dist').innerHTML = categories.map((c) => {
    const n = counts[c.key] || 0;
    const mark = c.key === correct ? ' ✅' : '';
    return `<div style="margin:6px 0;text-align:left">${c.label}${mark}
      <div class="live-bar" style="width:${(n / max) * 100}%;background:${c.color}"></div> ${n}</div>`;
  }).join('');
  $('dist').classList.remove('live-hidden');
  $('reveal').classList.add('live-hidden');
  $('next').classList.remove('live-hidden');
  showBoard(false);
};

$('next').onclick = () => { $('board').classList.add('live-hidden'); nextQuestion(); };

function showBoard(final) {
  let rows;
  if (mode === 'group') {
    const totals = aggregateGroups(players);
    rows = Object.entries(totals).sort((a, b) => b[1] - a[1])
      .map(([g, s], i) => ({ name: `第 ${g} 組`, score: s, rank: i + 1 }));
  } else {
    rows = players.slice().sort((a, b) => (b.score || 0) - (a.score || 0))
      .map((p, i) => ({ name: p.name || '匿名', score: p.score || 0, rank: i + 1 }));
  }
  $('board-title').textContent = final ? '🏆 最終排行榜' : '目前排行榜';
  $('board-list').innerHTML = rows.slice(0, 12)
    .map((r) => `<div class="live-cat-btn" style="background:${r.rank === 1 ? '#f59e0b' : '#475569'}">${r.rank}. ${r.name}<br>${r.score}</div>`)
    .join('');
  $('board').classList.remove('live-hidden');
  if (final) { $('stage').classList.add('live-hidden'); endGame(pin); }
}
```

- [ ] **Step 3: 端到端驗證(主控台 + 兩個學生)**

確保 Task 9 的 `python3 -m http.server 5500` 仍在跑。開三個分頁:
1. 分頁 A:`http://localhost:5500/live/host.html` → 點「個人對戰」→ 記下加入碼,等待室出現
2. 分頁 B、C(各用無痕視窗,確保不同匿名 uid):`http://localhost:5500/live/` → 輸入加入碼 → 取名 → 加入。分頁 A 等待室人數應變 2,出現兩個名字
3. 分頁 A 點「開始挑戰」→ 出現第 1 題圖片。B、C 看到題目與 5 個分類按鈕
4. B、C 各點一個分類(一對一錯)→ A 的「已作答」變 2
5. A 點「結束作答」→「公布正解」→ A 出現分布圖 + 排行榜;B 看到「答對 +N 分」、C 看到「答錯」
6. A 點「下一題」→ 重複。跑完 10 題出現「🏆 最終排行榜」

Expected: 全程 console 無紅色錯誤;分數會累加;排行榜排序正確。

> 若 reveal 後排行榜分數未更新,檢查 firestore.rules 是否已部署(Task 8 Step 3)、`applyScores` 的 player 路徑 uid 是否正確。

- [ ] **Step 4: 驗證小組模式**

重開分頁 A → 「小組對戰」→ B 選「第 1 組」、C 選「第 2 組」→ 跑一題 → 排行榜應以「第 N 組」為單位、分數為組內加總。

- [ ] **Step 5: Commit**

```bash
git add live/host.html js/live/host.js
git commit -m "feat(live): add teacher host console (lobby, question flow, scoring, leaderboard)"
```

---

## Task 11: 首頁加入入口

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 在首頁「還有更多故事與行動」區塊找一個合適位置,加入即時挑戰入口卡片**

在 `index.html` 中 `action/` 與 `next/` 卡片附近,新增(緊接其中一張 `story-card` 之後):

```html
        <a class="story-card" href="live/host.html">
          <span class="story-card__kicker">課堂活動</span>
          <span class="story-card__title">即時挑戰(老師)</span>
          <span class="story-card__desc">大螢幕開房間,全班平板搶答 ICC 分類</span>
        </a>
```

> 學生端 `live/` 不放首頁(避免學生自行進入);學生只透過老師螢幕的加入碼進場。

- [ ] **Step 2: 瀏覽器驗證**

開 `http://localhost:5500/`,確認新卡片出現且點擊進入主控台。

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(live): add live challenge entry card on homepage"
```

---

## Task 12: 最終整合檢查與部署

- [ ] **Step 1: 跑全部純邏輯測試**

Run: `node js/live/scoring.test.js && node js/live/pin.test.js && node js/live/sampling.test.js`
Expected: 三行 `... all tests passed`

- [ ] **Step 2: 完整課堂彩排**

依 Task 10 Step 3 跑一次完整 10 題個人賽 + 一次小組賽,確認:加入碼、等待室、出題、計分、分布、排行榜、最終榜全部正常。

- [ ] **Step 3: 推送部署(GitHub Pages)**

```bash
git push origin main
```
Expected: 數分鐘後線上站 `/live/host.html` 可開房;規則已於 Task 8 部署。

- [ ] **Step 4: 線上煙霧測試**

用手機/平板開線上 `/live/`,老師裝置開線上 `/live/host.html`,跑 1 題確認跨裝置即時同步正常。

---

## 自我檢查紀錄(規格涵蓋)

- 三畫面(主控台/學生端/共用後端)→ Task 7/9/10 ✅
- 加入碼 + QR/URL 加入 → Task 2/9/10(URL 已顯示;QR 為可選增強,未列入以守 YAGNI)✅
- 個人/小組可切換 → Task 10 Step 1/4、scoring.aggregateGroups ✅
- 答對+速度加分計分 → Task 1 ✅
- 即時分布 + 排行榜 → Task 10 ✅
- 圖片與前後測零重疊 → Task 4/5(腳本排除 + Step 3 驗證)✅
- 資料與 game_records 分離 → Task 7(live_rooms collection)✅
- 正解不下發給學生(防背答案)→ Task 7(pushQuestion 只送 image)/Task 8(answers 規則)✅
- 安全規則:房主控寫、學生限自己 → Task 8 ✅

**未納入(YAGNI / 後續可選):** QR code 產生、ICC 細項題型、live 場次寫入 live_records 供回顧 —— 與 spec「後續可選擴充」一致。

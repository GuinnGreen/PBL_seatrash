# 海洋偵查員 第 2 節：認識海廢分類

臺南市安平區億載國民小學 五年級 PBL 課程「海洋守護者 2.0」模組一第 2 節（40 分鐘）的教學網站，內含拖拉式海廢分類遊戲。

## 課程定位
- 主課程：[https://m72900024.github.io/pbl-ocean-guardian/](https://m72900024.github.io/pbl-ocean-guardian/)
- 本節在十節中的位置：第 1-2 節「認識海廢」之第 2 節
- 後續銜接：第 3-4 節 ICC 三層概念 → 第 5-6 節 漁光島月牙灣淨灘 → 第 7-8 節 NotebookLM AI 辨識 + 糾錯

## 網站結構（一節 40 分鐘走完）
- `/`           首頁（0–3 分鐘）
- `/categories/` 5 大類介紹（3–18 分鐘，5 子分頁）
- `/game/`     拖拉分類遊戲 30 題（18–33 分鐘）
- `/icc/`      ICC 20 項對照（33–37 分鐘）
- `/next/`     下節預告（37–40 分鐘）
- `/teacher/`  教師資源（不在學生流程中）

## 5 類簡化版 ↔ ICC 20 項
1. 🔵 飲料容器 → ICC 1, 2, 8, 10, 11, 12
2. 🟢 食物包裝 → ICC 3, 5, 6, 7, 9
3. 🟡 漁業用具 → ICC 13–17（**安平蚵棚特色**）
4. 🔴 個人衛生與危險 → ICC 18, 19, 20 + 危險海廢
5. ⚪ 其他/不確定 → ICC「當地關心的廢棄物」

## 本機執行（老師備課/試玩）
```bash
cd /Users/guin/Code/PBL
python3 -m http.server 8765
# 開 Safari → http://localhost:8765
# 模擬 iPad：Safari → 開發 → 進入回應式設計模式 → 選 iPad
```

## 部署到 GitHub Pages

**重要**：若部署到 sub-path（如 `m72900024.github.io/pbl-ocean-debris-sorter/`），需在每個 HTML 的 `<head>` 開頭加：

```html
<base href="/pbl-ocean-debris-sorter/">
```

或建議**直接放到主課程網站 repo 的子目錄**（例如 `pbl-ocean-guardian/sorter/`）。

**最簡單**：建獨立 repo 部署到 user.github.io 根（custom domain），則無需 base 調整。

## 圖片資料庫

- 共 **31 題**（beverage 10、food 2、fishing 5、hazard 6、other 8）
- 全部來自 Wikimedia Commons + CC / 政府開放授權
- 每張的詳細出處與授權記錄於 `data/items.json`

**已知缺口**：food（食物包裝）類目前只有 2 張，建議：
- 上課前老師加入 3-4 張本地拍的食物包裝照片（便當盒、奶茶杯、塑膠袋等）
- 加進 `images/food/` 並更新 `data/items.json`
- 或重跑 `scripts/scrape_food.py`（避開 Wikimedia 速率限制）

## 教師資源
見 `docs/`：
- [`lesson-plan.md`](docs/lesson-plan.md) 40 分鐘逐分鐘教案
- [`teacher-script.md`](docs/teacher-script.md) 教師話術提示
- [`edge-cases.md`](docs/edge-cases.md) 邊界物品分類規則（奶茶杯、便當盒、保麗龍碗）

## 技術
- 純前端 HTML + CSS + 原生 JS（無 framework、無 build）
- 拖拉用 PointerEvents（iPad Safari 13+ 支援）
- 分數存 `localStorage`（不收集個資，符合軸 D 倫理）
- 圖片預壓到 max 800px 寬，總體積 < 5 MB

## 檔案結構
```
/Users/guin/Code/PBL/
├── index.html
├── categories/{index,beverage,food,fishing,hazard,other}.html
├── game/index.html
├── icc/index.html
├── next/index.html
├── teacher/index.html
├── css/{base,game}.css
├── js/{nav,category,game}.js
├── data/items.json           # 題庫
├── images/{beverage,food,fishing,hazard,other}/
├── docs/                     # 教師資源
└── scripts/                  # 爬蟲（build-time，不上線）
```

## 授權
- 程式碼：MIT
- 圖片：見 `data/items.json` 中每張的 `source` 與 `license`
- 主要來源：Wikimedia Commons (CC-BY / CC-BY-SA / CC0 / Public Domain)

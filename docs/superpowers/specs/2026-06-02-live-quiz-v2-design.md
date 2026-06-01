# 設計:即時挑戰 v2(ICC 進階 + 重來 + 可設題數 + 美觀)

- 日期:2026-06-02
- 狀態:設計已通過,待寫實作計畫
- 基礎:延伸 2026-06-01 的即時挑戰模組(`live/`, `js/live/`, `firestore.rules` 的 `live_rooms`)

## 目標

在現有即時挑戰上加四項功能:(1) ICC 細項四選一進階題型;(2) 結束後可「再玩一次/回主選單」;(3) 開房時可選題數;(4) 視覺貼齊全站「海洋雜誌風」。

## 1. ICC 進階模式(四選一)

- **開房流程改成三步**:選**難度** → 選**題數** → 選**模式**,再建立房間。房間文件新增 `difficulty`('basic' | 'icc')。
- **難度**:
  - `basic`(簡單):維持現狀,看圖選 5 大類。
  - `icc`(進階):看圖選 ICC 細項,四選一。
- 新增 `data/icc-items.json`:20 項 ICC,每項 `{ id, name, emoji, cat }`,取自現有 `js/icc.js` 的權威清單(id 1–20、中文 name、emoji、所屬 5 大類 cat)。
- 新增純模組 `js/live/icc.js`,匯出 `buildIccOptions(correctId, iccItems, rand = Math.random)`:回傳 4 個洗牌後的選項 `[{ id, name, emoji }]` —— 1 個正解 + 3 個不重複的隨機誤答(從 20 項中抽)。純函式、可單元測試。
- **每題流程(icc)**:主機對該題的 `icc_item` 產生 4 選項 → 用 `pushQuestion` 把 `options`(只有 id/name/emoji,**不標正解**)寫進房間 → 學生平板渲染 4 顆 ICC 按鈕(中文名+emoji)→ 學生送出 `choice = 選到的 id` → 公布時主機比對 `choice === 題目.icc_item` 判對錯;分布圖顯示這 4 個選項的票數。
- **防背答案**:正解永不在公布前下發(`pushQuestion` 的 `options` 不含正解旗標;`currentQuestion.correct` 維持 null 直到 reveal)。學生端不抓 `items.live.json`。
- `basic` 模式維持原本 5 大類渲染(從 `room.categories` 來),不受影響。

## 2. 重來一次

- 結束畫面(最終排行榜)新增兩顆按鈕:
  - **再玩一次**:學生留在房間;所有玩家分數歸零;主機重新抽一批題;`round` +1;直接開始下一輪第 1 題。
  - **回主選單**:結束目前房間(`endGame`),主機 UI 回到「選難度」設定畫面。學生需用新房 PIN 重新加入。
- **關鍵技術點 — round 計數器**:房間文件新增 `round`(初始 0,「再玩一次」時 +1)。作答文件 id 改為 `${round}_${index}_${uid}`,作答文件加 `round` 欄位。否則第二輪題號與第一輪相同 → 撞 doc id → 變成 update → 被安全規則擋下(學生無法作答)。
  - `submitAnswer`、`watchAnswers`、`getAnswersOnce` 都帶 `round`。
  - `currentQuestion` 加 `round`,學生作答時回填。
  - `firestore.rules` 的 answers `create` answer-window 條件加上 `round` 比對(房間 `round` == 作答 `round`)。
- 新增 firebase-live helper:`resetScores(pin, uids)`(批次把每位玩家 score 設 0)、`bumpRound(pin)`/在 pushQuestion 帶 round。主機重玩流程:`resetScores` → `round++` → 重抽 `questionSet` → 從 index -1 進入 `nextQuestion`。

## 3. 可設定題數

- 開房設定畫面加「題數」選擇:**5 / 10 / 15 / 20**(預設 10)。`QUESTIONS` 不再寫死,改為開房時選定並存於主機狀態(必要時也存房間文件供顯示)。
- **均衡限制**:分層抽樣 `per = floor(題數 / 5)`。題庫最少分類為 fishing(5 題),故 ≤20 題時每類 ≤4,仍在均衡範圍;超過 25 題會開始用 leftover 補、不再均衡 —— 因此只提供 5/10/15/20 四個安全選項,不開放任意數字(守 YAGNI 並避免不均衡)。
- `pickLivePool(items, categories, total)` 已支援任意 total,無需改動;只需把 `QUESTIONS` 換成所選值傳入。

## 4. 美觀升級

- 改寫 `css/live.css` 貼齊 `css/base.css` 的設計系統:
  - 用真實 token:`--bg`(暖紙底)、`--surface`、`--ink`/`--ink-soft`、`--border`、`--accent`、分類色 `--c-beverage/-food/-fishing/-hazard/-other`、`--radius`、`--shadow-md`、`--font-sans/-serif`。修掉目前誤用的不存在 token(`--color-primary`、`--color-border`)。
  - 主機大螢幕:大號 PIN、品牌標題(serif)、乾淨留白。
  - 學生端:分類/選項按鈕用官方分類色票、按壓動畫、作答後狀態清楚。
  - 公布與排行榜:加入過場/長條圖動畫,第一名高亮。
  - 維持兒童友善、好點擊(大按鈕、足夠對比)。
- 兩個即時頁面維持**全螢幕、無導覽列**(投影/平板無干擾);站內入口已有(首頁卡片 + 頂端選單「加入房間」連到學生頁)。

## 動到的檔案

- 新增:`data/icc-items.json`、`js/live/icc.js`、`js/live/icc.test.js`
- 修改:`js/live/firebase-live.js`(round、options、resetScores)、`js/live/host.js`(三步設定 UI、icc 模式、題數、重玩、分布)、`js/live/player.js`(icc 選項渲染、round)、`css/live.css`(改版)、`firestore.rules`(answer-window 加 round)→ 需重新部署規則並推送上線。

## 測試策略

- 純邏輯(`icc.js` 的 `buildIccOptions`)用 Node `node:assert` 做 TDD。
- Firebase/UI 用瀏覽器手動 + 一次自動化端到端冒煙(主機+學生),涵蓋 basic 與 icc 兩種難度、重玩一輪、不同題數。

## 不做(YAGNI)

- 任意自訂題數(只給 4 個預設)。
- ICC 兩階段鑽選、20 項全列(已選四選一)。
- 即時頁面套完整站台導覽列/頁首頁尾(刻意保持全螢幕)。

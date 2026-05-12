// Google Form 雲同步設定
// 學生玩完遊戲後，會把成績 POST 到下面這個 Google Form。
// Google Form 自動把每筆紀錄寫進連結的 Google Sheet，老師打開 Sheet 就能看到全班。
//
// ==================================================================
// 一次性設定步驟（老師只需做一次）
// ==================================================================
// 1. 開新 Google Form：https://forms.google.com/
// 2. 新增以下「11 個欄位」，題型選「簡答」或「下拉式選單」皆可，
//    順序、文字可微調，但欄位數要相符：
//       (1) 班級          —— 簡答
//       (2) 座號          —— 簡答（或下拉 1-40）
//       (3) 模式          —— 下拉式：pretest / posttest
//       (4) 分數          —— 簡答
//       (5) 總題數        —— 簡答
//       (6) 飲料容器(對/問)
//       (7) 食物包裝(對/問)
//       (8) 漁業用具(對/問)
//       (9) 個人衛生(對/問)
//       (10) 其他(對/問)
//       (11) 完成時間      —— 簡答（ISO 字串）
// 3. 表單右上 ⋮ →「取得預先填寫的連結」
// 4. 在每個欄位填一個示範值（例如 班級 = TEST），按底部「取得連結」
// 5. 取得網址形如：
//      https://docs.google.com/forms/d/e/<FORM_ID>/viewform?usp=pp_url&entry.123456=TEST&entry.234567=...
//    - 把 <FORM_ID> 複製到下面 FORM_ID
//    - 每個 entry.XXXXX 對應上面的欄位順序，把數字填進下面 ENTRY 物件
// 6. 表單右上「回應」→ 點 Sheet 圖示，連結一份新的 Google Sheet 接資料
// 7. 把 Google Sheet 連結貼到 teacher/index.html 的 SHEET_URL（在頁面有對話框）
//
// 完成後，學生玩完遊戲，紀錄會自動進到 Google Sheet。
//
// 沒設定也可以——失敗會顯示「⚠ 未上傳」提示，但遊戲本身一切正常。
//
// ==================================================================

window.OG = window.OG || {};
window.OG.sheetsConfig = {
  FORM_ID: '1FAIpQLSdyhAlKUSRNcWUDs0SaEQqSgWiBCi1XrsEFAY-jXBb_4CFE0g',

  // 各欄位 entry ID（從 prefilled link 抓）
  ENTRY: {
    cls:        '1530235133',  // 班級
    seat:       '438875948',   // 座號
    mode:       '262579545',   // 模式（pretest/posttest）
    score:      '1347754387',  // 分數
    total:      '1002633977',  // 總題數
    beverage:   '356937919',   // 飲料容器(對/問)
    food:       '1311936719',  // 食物包裝(對/問)
    fishing:    '1214894332',  // 漁業用具(對/問)
    hazard:     '1496269586',  // 個人衛生(對/問)
    other:      '1807946849',  // 其他(對/問)
    timestamp:  '452627668',   // 完成時間
  },
};

// 把 record 物件 POST 到 Google Form
// 回傳 Promise<{ok: boolean, reason?: string}>
window.OG.syncRecord = async function (record) {
  const cfg = window.OG.sheetsConfig;
  if (!cfg.FORM_ID) {
    return { ok: false, reason: 'not-configured' };
  }
  const e = cfg.ENTRY;
  const cat = (k) => {
    const s = record.perCatStats?.[k] || { correct: 0, asked: 0 };
    return `${s.correct}/${s.asked}`;
  };
  const body = new URLSearchParams();
  if (e.cls)       body.set(e.cls, record.cls);
  if (e.seat)      body.set(e.seat, String(record.seat));
  if (e.mode)      body.set(e.mode, record.mode);
  if (e.score)     body.set(e.score, String(record.score));
  if (e.total)     body.set(e.total, String(record.total || 30));
  if (e.beverage)  body.set(e.beverage, cat('beverage'));
  if (e.food)      body.set(e.food, cat('food'));
  if (e.fishing)   body.set(e.fishing, cat('fishing'));
  if (e.hazard)    body.set(e.hazard, cat('hazard'));
  if (e.other)     body.set(e.other, cat('other'));
  if (e.timestamp) body.set(e.timestamp, record.timestamp);

  try {
    await fetch(
      `https://docs.google.com/forms/d/e/${cfg.FORM_ID}/formResponse`,
      {
        method: 'POST',
        mode: 'no-cors',  // Google Form 接受 cross-origin 但不回 CORS header
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message || 'network-error' };
  }
};

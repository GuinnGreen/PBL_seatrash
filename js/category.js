// Renders a category detail page. Each /categories/{cat}.html sets data-cat
// and calls renderCategoryPage().

(function () {
  // categories/ is always one level deep
  const ROOT = '../';

  const META = {
    beverage: {
      cls: 'bg-beverage',
      label: '飲料容器',
      emoji: '🔵',
      icc: 'ICC 1, 2, 8, 10, 11, 12',
      tagline: '寶特瓶、瓶蓋、玻璃瓶、罐、飲料杯',
      description: '裝飲料的容器是台灣海廢前 5 名。手搖飲、礦泉水、啤酒罐都是。',
      extra: '',
      next: 'food.html',
      nextLabel: '下一類：食物包裝 →',
    },
    food: {
      cls: 'bg-food',
      label: '食物包裝',
      emoji: '🟢',
      icc: 'ICC 3, 5, 6, 7, 9',
      tagline: '塑膠袋、吸管、餐具、零食包裝',
      description: '吃完外帶、零食留下來的包裝。<strong>吸管和塑膠袋</strong>會在海裡漂很久。',
      extra: '',
      next: 'fishing.html',
      nextLabel: '下一類：漁業用具 →',
    },
    fishing: {
      cls: 'bg-fishing',
      label: '漁業用具',
      emoji: '🟡',
      icc: 'ICC 13–17',
      tagline: '漁網、繩、浮球、保麗龍浮具',
      description: '從漁船或養殖蚵棚掉下來的東西。',
      extra: `
        <div class="callout callout--note">
          <h4>★ 安平特色</h4>
          <p>我們要去的<strong>漁光島月牙灣</strong>旁邊就是<strong>蚵棚</strong>養殖區。
          蚵棚會用很多<strong>保麗龍浮具</strong>和<strong>竹棚繩索</strong>，破掉之後就漂上岸——
          這是安平海岸的特色海廢。下次淨灘要特別注意。</p>
        </div>`,
      next: 'hazard.html',
      nextLabel: '下一類：個人衛生與危險 →',
    },
    hazard: {
      cls: 'bg-hazard',
      label: '個人衛生與危險',
      emoji: '🔴',
      icc: 'ICC 18, 19, 20 + 危險海廢',
      tagline: '菸蒂、口罩、牙刷、針筒',
      description: '個人用過、丟掉的東西。<strong>有些有危險</strong>，看到要小心。',
      extra: `
        <div class="callout callout--warn">
          <h4>⚠️ 安全提醒</h4>
          <p>下次淨灘看到<strong>針筒、針頭、破玻璃、魚鉤</strong>，<strong>絕對不能徒手撿</strong>，
          要立刻叫老師處理。我們會準備<strong>厚手套</strong>，但這幾樣東西連手套都不行。</p>
        </div>`,
      next: 'other.html',
      nextLabel: '下一類：其他 →',
    },
    other: {
      cls: 'bg-other',
      label: '其他/不確定',
      emoji: '⚪',
      icc: 'ICC「當地關心的廢棄物」',
      tagline: '微塑膠、碎片、不明物',
      description: '你看不出是什麼，或是<strong>已經碎成小片</strong>的，先放這裡。下次淨灘現場再請老師判斷。',
      extra: `
        <div class="callout">
          <h4>什麼是微塑膠？</h4>
          <p>大塊塑膠在海裡被太陽和波浪打碎，變成<strong>比沙子還小</strong>的塑膠粒。
          肉眼幾乎看不到，但魚會吃進去，最後可能也跑進我們嘴裡。</p>
        </div>`,
      next: `${ROOT}game/`,
      nextLabel: '進入分類遊戲 →',
    },
  };

  async function renderCategoryPage() {
    const main = document.querySelector('main');
    const cat = main.dataset.cat;
    const meta = META[cat];
    if (!meta) {
      main.innerHTML = '<p>找不到這個分類。</p>';
      return;
    }

    main.innerHTML = `
      <div class="cat-banner ${meta.cls}">
        <div style="font-size:48px; line-height:1;">${meta.emoji}</div>
        <div>
          <h1>${meta.label}</h1>
          <p>${meta.tagline}</p>
          <span class="badge">${meta.icc}</span>
        </div>
      </div>
      <p style="font-size:18px; margin-bottom:16px;">${meta.description}</p>
      ${meta.extra}
      <div class="photo-grid" id="photos">
        <p style="color:var(--ink-soft);">圖片載入中…</p>
      </div>
      <div class="page-nav">
        <a class="btn btn-ghost" href="index.html">← 5 大類總覽</a>
        <a class="btn btn-primary" href="${meta.next}">${meta.nextLabel}</a>
      </div>
    `;

    let data;
    try {
      const r = await fetch(`${ROOT}data/items.json`, { cache: 'no-store' });
      data = await r.json();
    } catch (err) {
      document.getElementById('photos').innerHTML =
        '<p style="color:var(--c-hazard);">圖片資料尚未生成 (data/items.json)。</p>';
      return;
    }

    const items = (data.items || []).filter(it => it.category === cat);
    const photoGrid = document.getElementById('photos');
    if (items.length === 0) {
      photoGrid.innerHTML = '<p style="color:var(--ink-soft);">這類目前還沒有照片。</p>';
      return;
    }
    photoGrid.innerHTML = items.slice(0, 8).map(it => `
      <figure class="photo-card">
        <img src="${ROOT}${it.filename}" alt="${it.label || cat}" loading="lazy">
        <figcaption class="photo-card__caption">
          <strong>${it.label || '海廢'}</strong>
          ${it.icc_item ? `<span>ICC 第 ${it.icc_item} 項</span>` : ''}
        </figcaption>
      </figure>
    `).join('');
  }

  window.OG = window.OG || {};
  window.OG.renderCategoryPage = renderCategoryPage;
})();

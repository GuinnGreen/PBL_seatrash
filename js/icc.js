// ICC page interactivity — 20-item card explorer + 5-category bucket view.

(function () {
  // Each item gets a photo (relative to icc/index.html) AND an emoji as fallback.
  // The image is tried first; on error the card swaps to emoji rendering.
  const ICC_ITEMS = [
    { id: 1,  emoji: '🍶', img: '01_pet_bottle.jpg',   name: '寶特瓶',         cat: 'beverage', stars: 5, hint: '台灣海廢第 2 名。瓶身 + 瓶蓋常分開漂。' },
    { id: 2,  emoji: '🔘', img: '02_bottle_cap.jpg',   name: '塑膠瓶蓋',       cat: 'beverage', stars: 5, hint: '台灣 + 全球海廢第 1 名。比瓶身更難回收。' },
    { id: 3,  emoji: '🥡', img: '03_food_container.jpg', name: '其他飲料/食物容器', cat: 'food', stars: 4, hint: '便當盒、外帶餐盒——常見到不行。' },
    { id: 4,  emoji: '🧴', img: '04_non_food_bottle.jpg', name: '非食物的瓶罐', cat: 'other', stars: 2, hint: '洗髮精、清潔劑、化學品的瓶子。' },
    { id: 5,  emoji: '🛍️', img: '05_plastic_bag.jpg',  name: '塑膠提袋',       cat: 'food',     stars: 5, hint: '台灣每人每年用掉 800 個。' },
    { id: 6,  emoji: '🍪', img: '06_food_wrapper.jpg', name: '食品包裝袋',     cat: 'food',     stars: 4, hint: '零食袋、糖果紙、餅乾包裝。' },
    { id: 7,  emoji: '🥤', img: '07_straw.jpg',        name: '吸管',           cat: 'food',     stars: 5, hint: '改變一個國家政策的那種——案件 02。' },
    { id: 8,  emoji: '☕', img: '08_takeaway_cup.jpg', name: '外帶飲料杯',     cat: 'beverage', stars: 4, hint: '手搖飲杯。台灣每年用 50 億個。' },
    { id: 9,  emoji: '🍴', img: '09_disposable_cutlery.jpg', name: '免洗餐具', cat: 'food',     stars: 4, hint: '筷子、叉子、湯匙——一次性的。' },
    { id: 10, emoji: '🍾', img: '10_glass_bottle.jpg', name: '玻璃瓶',         cat: 'beverage', stars: 3, hint: '會碎裂——但要 100 萬年才會分解。' },
    { id: 11, emoji: '🥫', img: '11_aluminum_can.jpg', name: '鐵鋁罐',         cat: 'beverage', stars: 3, hint: '可樂罐、啤酒罐。回收率比塑膠高。' },
    { id: 12, emoji: '🧃', img: '12_tetra_pak.jpg',    name: '鋁箔包/利樂包',  cat: 'beverage', stars: 3, hint: '蘋果汁、豆漿那種——多層材料超難回收。' },
    { id: 13, emoji: '🎣', img: '13_fishing_tackle.jpg', name: '釣魚用具',     cat: 'fishing',  stars: 2, hint: '魚線、魚鉤、鉛塊——最危險。' },
    { id: 14, emoji: '🟠', img: '14_fishing_buoy.jpg', name: '漁業浮球',       cat: 'fishing',  stars: 4, hint: '蚵棚的橘色浮球。西部海岸超多。' },
    { id: 15, emoji: '⬜', img: '15_styrofoam.jpg',    name: '保麗龍浮筒',     cat: 'fishing',  stars: 4, hint: '碎成沙子大小——白色污染主犯。' },
    { id: 16, emoji: '🛟', img: '16_boat_fender.jpg',  name: '漁船防碰墊',     cat: 'fishing',  stars: 1, hint: '漁港邊常見，不太會跑到海邊。' },
    { id: 17, emoji: '🕸️', img: '17_fishing_net.jpg',  name: '漁網與繩子',     cat: 'fishing',  stars: 4, hint: '幽靈漁網——案件 03。' },
    { id: 18, emoji: '🚬', img: '18_cigarette_butt.jpg', name: '菸蒂',         cat: 'hazard',   stars: 5, hint: '全球海廢第 1 名！每年 4.5 兆根。' },
    { id: 19, emoji: '🪥', img: '19_toothbrush.jpg',   name: '牙刷',           cat: 'hazard',   stars: 2, hint: '為什麼會在海邊？想想看。' },
    { id: 20, emoji: '😷', img: '20_face_mask.jpg',    name: '口罩',           cat: 'hazard',   stars: 3, hint: '2022 新增的第 20 項——疫情後變多。' }
  ];

  const CAT_META = {
    all:      { label: '全部 20 項', color: '#111827', emoji: '📋' },
    beverage: { label: '飲料容器',    color: '#1E40AF', emoji: '🔵' },
    food:     { label: '食物包裝',    color: '#047857', emoji: '🟢' },
    fishing:  { label: '漁業用具',    color: '#B45309', emoji: '🟡' },
    hazard:   { label: '個人衛生與危險', color: '#B91C1C', emoji: '🔴' },
    other:    { label: '其他/不確定',  color: '#4B5563', emoji: '⚪' }
  };

  let activeFilter = 'all';

  function star(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function renderFilterBar(root) {
    const order = ['all', 'beverage', 'food', 'fishing', 'hazard', 'other'];
    root.innerHTML = order.map(k => {
      const m = CAT_META[k];
      const count = k === 'all' ? ICC_ITEMS.length : ICC_ITEMS.filter(i => i.cat === k).length;
      return `
        <button class="icc-filter-pill"
                data-filter="${k}"
                aria-pressed="${k === activeFilter}"
                style="--pill-color:${m.color}">
          <span class="icc-filter-pill__icon">${m.emoji}</span>
          <span class="icc-filter-pill__label">${m.label}</span>
          <span class="icc-filter-pill__count">${count}</span>
        </button>
      `;
    }).join('');
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('.icc-filter-pill');
      if (!btn) return;
      activeFilter = btn.dataset.filter;
      root.querySelectorAll('.icc-filter-pill').forEach(b =>
        b.setAttribute('aria-pressed', b.dataset.filter === activeFilter)
      );
      applyFilter();
      updateCounter();
    });
  }

  function renderCards(root) {
    root.innerHTML = ICC_ITEMS.map(it => {
      const m = CAT_META[it.cat];
      // Photo if available; emoji as the visible fallback if the <img> errors out.
      const visual = it.img
        ? `<span class="icc-card__photo">
             <img src="../images/icc/${it.img}" alt="${it.name}" loading="lazy"
                  onerror="this.parentElement.classList.add('icc-card__photo--missing')">
             <span class="icc-card__emoji-fallback">${it.emoji}</span>
           </span>`
        : `<span class="icc-card__emoji">${it.emoji}</span>`;
      return `
        <button class="icc-card"
                data-cat="${it.cat}"
                aria-label="ICC 第 ${it.id} 項：${it.name}（屬於 ${m.label}）"
                style="--cat-color:${m.color}">
          <span class="icc-card__inner">
            <span class="icc-card__face icc-card__front">
              <span class="icc-card__num">${it.id}</span>
              ${visual}
              <span class="icc-card__name">${it.name}</span>
              <span class="icc-card__cat-badge">${m.emoji} ${m.label}</span>
            </span>
            <span class="icc-card__face icc-card__back">
              <span class="icc-card__back-num">第 ${it.id} 項</span>
              <span class="icc-card__back-name">${it.name}</span>
              <span class="icc-card__stars" title="台灣海邊出現頻率">${star(it.stars)}</span>
              <span class="icc-card__hint">${it.hint}</span>
              <span class="icc-card__back-cat">${m.emoji} ${m.label}</span>
            </span>
          </span>
        </button>
      `;
    }).join('');

    // Click → flip
    root.addEventListener('click', (e) => {
      const card = e.target.closest('.icc-card');
      if (!card) return;
      card.classList.toggle('flipped');
    });
  }

  function applyFilter() {
    document.querySelectorAll('.icc-card').forEach(c => {
      if (activeFilter === 'all' || c.dataset.cat === activeFilter) {
        c.classList.remove('icc-card--dim');
        c.classList.add('icc-card--match');
      } else {
        c.classList.add('icc-card--dim');
        c.classList.remove('icc-card--match');
      }
    });
  }

  function updateCounter() {
    const counter = document.getElementById('icc-counter');
    if (!counter) return;
    const total = ICC_ITEMS.length;
    if (activeFilter === 'all') {
      counter.textContent = `顯示全部 ${total} 項`;
    } else {
      const n = ICC_ITEMS.filter(i => i.cat === activeFilter).length;
      counter.textContent = `${CAT_META[activeFilter].label}：共 ${n} 項（淡掉的 ${total - n} 項屬於其他類）`;
    }
  }

  function renderBuckets(root) {
    const order = ['beverage', 'food', 'fishing', 'hazard', 'other'];
    root.innerHTML = order.map(cat => {
      const m = CAT_META[cat];
      const items = ICC_ITEMS.filter(i => i.cat === cat);
      const chips = items.map(i =>
        `<span class="icc-bucket__chip" title="ICC 第 ${i.id} 項">
           <span class="icc-bucket__chip-num">${i.id}</span>
           <span class="icc-bucket__chip-emoji">${i.emoji}</span>
           <span class="icc-bucket__chip-name">${i.name}</span>
         </span>`
      ).join('');
      return `
        <div class="icc-bucket" data-cat="${cat}" style="--bucket-color:${m.color}">
          <div class="icc-bucket__head">
            <span class="icc-bucket__icon">${m.emoji}</span>
            <h3 class="icc-bucket__title">${m.label}</h3>
            <span class="icc-bucket__count">${items.length} 項</span>
          </div>
          <div class="icc-bucket__chips">${chips}</div>
          <button class="icc-bucket__highlight" data-cat="${cat}">
            ↑ 在上面亮起這 ${items.length} 項
          </button>
        </div>
      `;
    }).join('');

    // Bucket "highlight above" button → set filter and scroll up
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('.icc-bucket__highlight');
      if (!btn) return;
      activeFilter = btn.dataset.cat;
      const bar = document.getElementById('icc-filter-bar');
      if (bar) {
        bar.querySelectorAll('.icc-filter-pill').forEach(b =>
          b.setAttribute('aria-pressed', b.dataset.filter === activeFilter)
        );
      }
      applyFilter();
      updateCounter();
      const explorer = document.getElementById('icc-explorer');
      if (explorer) explorer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function init() {
    const bar = document.getElementById('icc-filter-bar');
    const cards = document.getElementById('icc-cards');
    const buckets = document.getElementById('icc-buckets');
    if (bar) renderFilterBar(bar);
    if (cards) renderCards(cards);
    if (buckets) renderBuckets(buckets);
    applyFilter();
    updateCounter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

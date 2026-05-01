// Loads items.json and populates the #photos grid on a category page.
// Each /categories/{cat}.html provides static rich content + a #photos placeholder.

(function () {
  const ROOT = '../';

  async function fillPhotos() {
    const grid = document.getElementById('photos');
    if (!grid) return;
    const cat = grid.dataset.cat;
    if (!cat) return;

    let data;
    try {
      const r = await fetch(`${ROOT}data/items.json`, { cache: 'no-store' });
      data = await r.json();
    } catch (err) {
      grid.innerHTML = '<p style="color:var(--c-hazard);">圖片資料尚未生成 (data/items.json)。</p>';
      return;
    }

    const items = (data.items || []).filter(it => it.category === cat);
    if (items.length === 0) {
      grid.innerHTML = '<p style="color:var(--ink-soft);">這類目前還沒有照片。</p>';
      return;
    }
    grid.innerHTML = items.slice(0, 8).map(it => `
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
  window.OG.fillPhotos = fillPhotos;
})();

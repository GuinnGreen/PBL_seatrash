// Shared site header / nav. Each page calls renderNav(key).
// Uses relative paths so the site works at any GitHub Pages sub-path.

(function () {
  const NAV_ITEMS = [
    { key: 'home',       label: '首頁',       slug: '' },
    { key: 'items',      label: '認識垃圾',   slug: 'items/' },
    { key: 'categories', label: '5 大類',     slug: 'categories/' },
    { key: 'game',       label: '遊戲',       slug: 'game/' },
    { key: 'stories',    label: '故事',       slug: 'stories/' },
    { key: 'data-viz',   label: '數據',       slug: 'data-viz/' },
    { key: 'action',     label: '行動',       slug: 'action/' },
    { key: 'icc',        label: 'ICC',       slug: 'icc/' },
  ];

  // True if the current page is one directory below the site root.
  function isSubPage() {
    return /\/(items|categories|game|icc|next|teacher|stories|data-viz|action)(\/|\/[^/]*\.html)?$/.test(
      window.location.pathname
    );
  }

  // Returns "" for root pages, "../" for sub-pages.
  function rootPrefix() {
    return isSubPage() ? '../' : '';
  }

  function renderNav(activeKey) {
    const prefix = rootPrefix();
    const header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = `
      <div class="site-header__inner">
        <h1 class="site-title">
          <a href="${prefix || './'}" style="color:inherit">海洋偵查員</a>
          <small>第 2 節 · 認識海廢分類</small>
        </h1>
        <nav>
          <ul class="nav-list">
            ${NAV_ITEMS.map(item => `
              <li><a href="${prefix}${item.slug}"
                     class="${item.key === activeKey ? 'active' : ''}">
                ${item.label}
              </a></li>
            `).join('')}
          </ul>
        </nav>
      </div>
    `;
    document.body.insertBefore(header, document.body.firstChild);
  }

  function renderFooter() {
    const prefix = rootPrefix();
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = `
      臺南市安平區億載國民小學 · PBL 海洋守護者 2.0 · 模組一 海洋偵查員
      &nbsp;|&nbsp; <a href="${prefix}teacher/">教師資源</a>
    `;
    document.body.appendChild(footer);
  }

  // Click-to-enlarge for photo grids
  function enableLightbox() {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `
      <button class="lightbox-close" aria-label="關閉">×</button>
      <img alt="">
      <div class="lightbox-caption"></div>
    `;
    document.body.appendChild(lb);
    const lbImg = lb.querySelector('img');
    const lbCap = lb.querySelector('.lightbox-caption');
    const close = () => lb.classList.remove('show');
    lb.addEventListener('click', (e) => {
      if (e.target === lb || e.target.classList.contains('lightbox-close')) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    document.addEventListener('click', (e) => {
      const img = e.target.closest('.photo-card img');
      if (!img) return;
      lbImg.src = img.src;
      lbImg.alt = img.alt;
      const card = img.closest('.photo-card');
      const caption = card?.querySelector('.photo-card__caption');
      lbCap.textContent = caption?.innerText.replace(/\s+/g, ' ').trim() || img.alt || '';
      lb.classList.add('show');
    });
  }

  window.OG = window.OG || {};
  window.OG.renderNav = renderNav;
  window.OG.renderFooter = renderFooter;
  window.OG.rootPrefix = rootPrefix;

  document.addEventListener('DOMContentLoaded', enableLightbox);
})();

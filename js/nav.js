// Shared site header / nav. Each page calls renderNav(key).
// Uses relative paths so the site works at any GitHub Pages sub-path.

(function () {
  // Main nav follows the lesson teaching flow.
  const PRIMARY_NAV = [
    { key: 'items',      label: '認識垃圾', slug: 'items/' },
    { key: 'icc',        label: 'ICC 分類', slug: 'icc/' },
    { key: 'categories', label: '5 大類',   slug: 'categories/' },
    { key: 'stories',    label: '故事',     slug: 'stories/' },
    { key: 'game',       label: '遊戲',     slug: 'game/' },
  ];

  // Secondary pages live inside the "更多 ▾" dropdown.
  const MORE_NAV = [
    { key: 'data-viz', label: '數據',     slug: 'data-viz/' },
    { key: 'action',   label: '行動',     slug: 'action/' },
    { key: 'teacher',  label: '教師',     slug: 'teacher/' },
    { key: 'next',     label: '下節預告', slug: 'next/' },
  ];

  function isSubPage() {
    return /\/(items|categories|game|icc|next|teacher|stories|data-viz|action)(\/|\/[^/]*\.html)?$/.test(
      window.location.pathname
    );
  }

  function rootPrefix() {
    return isSubPage() ? '../' : '';
  }

  function renderNav(activeKey) {
    const prefix = rootPrefix();
    const moreActive = MORE_NAV.some(item => item.key === activeKey);

    const primaryHTML = PRIMARY_NAV.map(item => `
      <li><a href="${prefix}${item.slug}"
             class="${item.key === activeKey ? 'active' : ''}">
        ${item.label}
      </a></li>
    `).join('');

    const moreHTML = MORE_NAV.map(item => `
      <li><a href="${prefix}${item.slug}"
             class="${item.key === activeKey ? 'active' : ''}">
        ${item.label}
      </a></li>
    `).join('');

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
            ${primaryHTML}
            <li class="nav-more${moreActive ? ' active' : ''}">
              <details>
                <summary>更多 <span aria-hidden="true">▾</span></summary>
                <ul class="nav-dropdown">
                  ${moreHTML}
                </ul>
              </details>
            </li>
          </ul>
        </nav>
      </div>
    `;
    document.body.insertBefore(header, document.body.firstChild);

    // Close the dropdown when clicking outside it.
    const detailsEl = header.querySelector('.nav-more details');
    if (detailsEl) {
      document.addEventListener('click', (e) => {
        if (!detailsEl.contains(e.target)) detailsEl.removeAttribute('open');
      });
    }
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

// Shared site header / nav. Each page calls renderNav(key).
// Uses relative paths so the site works at any GitHub Pages sub-path.

(function () {
  const NAV_ITEMS = [
    { key: 'home',       label: '首頁',       slug: '' },
    { key: 'categories', label: '認識 5 大類', slug: 'categories/' },
    { key: 'game',       label: '分類遊戲',   slug: 'game/' },
    { key: 'icc',        label: 'ICC 對照',  slug: 'icc/' },
    { key: 'next',       label: '下節預告',   slug: 'next/' },
  ];

  // True if the current page is one directory below the site root.
  function isSubPage() {
    return /\/(categories|game|icc|next|teacher)(\/|\/[^/]*\.html)?$/.test(
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

  window.OG = window.OG || {};
  window.OG.renderNav = renderNav;
  window.OG.renderFooter = renderFooter;
  window.OG.rootPrefix = rootPrefix;
})();

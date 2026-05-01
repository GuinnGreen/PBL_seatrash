// Shared site header / nav. Each page calls renderNav() with its current key.
// Keys: home | categories | game | icc | next | teacher

(function () {
  const NAV_ITEMS = [
    { key: 'home',       label: '首頁',       href: '/' },
    { key: 'categories', label: '認識 5 大類', href: '/categories/' },
    { key: 'game',       label: '分類遊戲',   href: '/game/' },
    { key: 'icc',        label: 'ICC 對照',  href: '/icc/' },
    { key: 'next',       label: '下節預告',   href: '/next/' },
  ];

  function pathPrefix() {
    // Allows the site to live under a sub-path on GitHub Pages
    // (e.g. m72900024.github.io/pbl-ocean-debris-sorter/).
    // Detect by reading <base> tag if present, otherwise root '/'.
    const base = document.querySelector('base');
    if (base && base.getAttribute('href')) {
      return base.getAttribute('href').replace(/\/$/, '');
    }
    return '';
  }

  function renderNav(activeKey) {
    const prefix = pathPrefix();
    const header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = `
      <div class="site-header__inner">
        <h1 class="site-title">
          <a href="${prefix || '/'}" style="color:inherit">海洋偵查員</a>
          <small>第 2 節 · 認識海廢分類</small>
        </h1>
        <nav>
          <ul class="nav-list">
            ${NAV_ITEMS.map(item => `
              <li><a href="${prefix}${item.href}"
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
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = `
      臺南市安平區億載國民小學 · PBL 海洋守護者 2.0 · 模組一 海洋偵查員
      &nbsp;|&nbsp; <a href="${pathPrefix()}/teacher/">教師資源</a>
    `;
    document.body.appendChild(footer);
  }

  window.OG = window.OG || {};
  window.OG.renderNav = renderNav;
  window.OG.renderFooter = renderFooter;
  window.OG.pathPrefix = pathPrefix;
})();

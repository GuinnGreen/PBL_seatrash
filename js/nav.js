// Shared site header / nav. Each page calls renderNav(key).
// Uses relative paths so the site works at any GitHub Pages sub-path.

(function () {
  // Nav follows the actual lesson flow:
  // 全台灣→前測→認識實物→安平→五大類→ICC→後測，後接補充頁。
  const PRIMARY_NAV = [
    { key: 'data-viz',   label: '台灣海廢',   slug: 'data-viz/' },
    { key: 'game',       label: '分類遊戲',   slug: 'game/' },
    { key: 'items',      label: '認識實物',   slug: 'items/' },
    { key: 'anping',     label: '安平蚵棚',   slug: 'stories/anping.html' },
    { key: 'categories', label: '5 大類',     slug: 'categories/' },
    { key: 'icc',        label: 'ICC 20 項',  slug: 'icc/' },
    { key: 'live',       label: '加入房間',   slug: 'live/' },
    { key: 'stories',    label: '案件故事',   slug: 'stories/' },
    { key: 'action',     label: '行動',       slug: 'action/' },
    { key: 'teacher',    label: '教師',       slug: 'teacher/' },
    { key: 'next',       label: '下節預告',   slug: 'next/' },
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

    const primaryHTML = PRIMARY_NAV.map(item => `
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
          </ul>
        </nav>
      </div>
    `;
    document.body.insertBefore(header, document.body.firstChild);

    // On mobile single-row nav, scroll the active item into view.
    const activeLink = header.querySelector('.nav-list a.active');
    if (activeLink && activeLink.scrollIntoView) {
      try {
        activeLink.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
      } catch (_) { /* old browsers */ }
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

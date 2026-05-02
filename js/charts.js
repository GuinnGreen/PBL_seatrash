// Chart.js wiring for the data-viz page.
// Loads aggregate data from data/data-viz.json and per-region data from data/regions.json.

(function () {
  if (typeof Chart === 'undefined') {
    console.warn('[charts] Chart.js not loaded — falling back to text only.');
    return;
  }

  // Site-wide chart defaults
  Chart.defaults.font.family =
    '-apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", "Helvetica Neue", Arial, sans-serif';
  Chart.defaults.font.size = 13;
  Chart.defaults.color = '#1F2937';
  Chart.defaults.plugins.legend.labels.padding = 14;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };

  const REGION_ORDER = ['north', 'west', 'south', 'east'];
  const REGION_DISPLAY = { north: '北部', west: '中西部', south: '南部', east: '東部' };
  const CAT_KEYS = ['beverage', 'food', 'fishing', 'hazard', 'other'];
  const CAT_LABEL = {
    beverage: '飲料容器',
    food: '食物包裝',
    fishing: '漁業用具',
    hazard: '個人衛生與危險',
    other: '其他/不確定'
  };
  const CAT_COLOR = {
    beverage: '#1E40AF',
    food: '#047857',
    fishing: '#B45309',
    hazard: '#B91C1C',
    other: '#4B5563'
  };

  async function loadJSON(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to load ' + path);
    return res.json();
  }

  function renderPieCategories(data) {
    const ctx = document.getElementById('chart-cat-pie');
    if (!ctx) return;
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.categories_5.labels,
        datasets: [{
          data: data.categories_5.values,
          backgroundColor: data.categories_5.colors,
          borderColor: '#FBF7F0',
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '52%',
        plugins: {
          legend: { position: 'right' },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.label}：約 ${c.parsed}%`
            }
          }
        }
      }
    });
  }

  function renderPieMaterial(data) {
    const ctx = document.getElementById('chart-material-pie');
    if (!ctx) return;
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.material.labels,
        datasets: [{
          data: data.material.values,
          backgroundColor: data.material.colors,
          borderColor: '#FBF7F0',
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.label}：${c.parsed}%`
            }
          }
        }
      }
    });
  }

  function renderTop10(data) {
    const ctx = document.getElementById('chart-top10');
    if (!ctx) return;
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.top10_items.labels,
        datasets: [{
          label: '出現次數佔比 (%)',
          data: data.top10_items.values,
          backgroundColor: data.top10_items.colors,
          borderRadius: 3,
          borderSkipped: false
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` 約 ${c.parsed.x}%` } }
        },
        scales: {
          x: { ticks: { callback: v => v + '%' }, grid: { color: '#E5E7EB' } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  function renderTrendLine(data) {
    const ctx = document.getElementById('chart-trend-line');
    if (!ctx) return;
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.trend_20y.years,
        datasets: data.trend_20y.series.map(s => ({
          label: s.label,
          data: s.data,
          borderColor: s.color,
          backgroundColor: s.color + '20',
          borderWidth: 2.5,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: false
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}：${c.parsed.y} 件/月` } }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: '月平均拾獲數量（件）' },
            grid: { color: '#E5E7EB' }
          },
          x: {
            title: { display: true, text: '年份' },
            grid: { display: false }
          }
        }
      }
    });
  }

  function renderRegionsStacked(regions) {
    const ctx = document.getElementById('chart-regions-stacked');
    if (!ctx) return;
    const labels = REGION_ORDER.map(k => REGION_DISPLAY[k]);
    const datasets = CAT_KEYS.map(cat => ({
      label: CAT_LABEL[cat],
      data: REGION_ORDER.map(r => regions[r].data_distribution[cat]),
      backgroundColor: CAT_COLOR[cat],
      borderColor: '#FBF7F0',
      borderWidth: 1
    }));
    new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}：${c.parsed.x}%` } }
        },
        scales: {
          x: { stacked: true, max: 100, ticks: { callback: v => v + '%' } },
          y: { stacked: true, grid: { display: false } }
        }
      }
    });
  }

  function renderRegionCards(regions) {
    const root = document.getElementById('region-cards');
    if (!root) return;
    const SHARE = { north: 47, west: 37, south: 11, east: 5 };
    const html = REGION_ORDER.map(key => {
      const r = regions[key];
      const sig = (r.signature_items || []).slice(0, 3).join('、');
      return `
        <div class="region-card region-${key}">
          <h3>${r.label}</h3>
          <p class="region-areas">${r.areas}</p>
          <p class="region-pct">${SHARE[key]}<small>% 全台海廢佔比</small></p>
          <p class="region-desc">${r.characteristics_short}</p>
          <p class="region-signature"><strong>代表物：</strong>${sig}</p>
        </div>
      `;
    }).join('');
    root.innerHTML = html;
  }

  async function init() {
    try {
      const [agg, regions] = await Promise.all([
        loadJSON('../data/data-viz.json'),
        loadJSON('../data/regions.json')
      ]);
      renderPieCategories(agg);
      renderPieMaterial(agg);
      renderTop10(agg);
      renderTrendLine(agg);
      renderRegionsStacked(regions.regions);
      renderRegionCards(regions.regions);
    } catch (err) {
      console.error('[charts] init failed:', err);
      const fb = document.getElementById('chart-fallback');
      if (fb) fb.style.display = 'block';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

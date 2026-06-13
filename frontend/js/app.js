const API = 'http://localhost:3000/api';
let currentCategory = 'ALL';
let currentSort = 'time_desc';
let pollTimer = null;
let dbSearchTimer = null;
let currentSearch = '';

// ==================== Toast 提示 ====================
function showToast(msg, type = 'info') {
  let toast = document.getElementById('toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast toast-${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ==================== 搜索记录 ====================
const HISTORY_KEY = 'crawl_history';
let searchHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');

function saveHistory(keyword, category, count) {
  searchHistory.unshift({
    keyword, category, count,
    time: new Date().toLocaleString('zh-CN'),
  });
  if (searchHistory.length > 20) searchHistory = searchHistory.slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory));
  renderHistory();
}

function clearHistory() {
  if (confirm('确定清空所有搜索记录？')) {
    searchHistory = [];
    localStorage.setItem(HISTORY_KEY, '[]');
    renderHistory();
  }
}

function replaySearch(keyword, category) {
  document.getElementById('keyword').value = keyword;
  document.getElementById('category').value = category;
  startCrawl();
}

function renderHistory() {
  const el = document.getElementById('history-list');
  if (searchHistory.length === 0) {
    el.innerHTML = '<div class="history-empty">暂无搜索记录</div>';
    return;
  }
  el.innerHTML = searchHistory.slice(0, 8).map((h, i) => `
    <div class="history-item" data-idx="${i}" title="点击重新搜索">
      <span class="hist-kw">${escapeHtml(h.keyword)}</span>
      <span class="hist-cat">${escapeHtml(h.category)}</span>
      <span class="hist-cnt">${h.count}条</span>
      <span class="hist-time">${escapeHtml(h.time)}</span>
    </div>
  `).join('');
}

// 事件委托：历史记录点击
document.addEventListener('click', (e) => {
  const item = e.target.closest('.history-item');
  if (item) {
    const idx = parseInt(item.dataset.idx);
    const h = searchHistory[idx];
    if (h) replaySearch(h.keyword, h.category);
  }
});

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ==================== 产品和爬取 ====================
async function fetchJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function loadProducts(category, search) {
  currentCategory = category;
  let url = `${API}/products`;
  const params = [];
  if (category && category !== 'ALL') params.push(`category=${encodeURIComponent(category)}`);
  if (search && search.trim()) params.push(`search=${encodeURIComponent(search.trim())}`);
  if (currentSort && currentSort !== 'time_desc') params.push(`sort=${currentSort}`);
  if (params.length > 0) url += '?' + params.join('&');
  try {
    const data = await fetchJSON(url);

    // 统计
    const catCount = {};
    data.forEach(p => { catCount[p.category] = (catCount[p.category] || 0) + 1; });
    const statsHtml = Object.entries(catCount)
      .map(([cat, n]) => `<span class="stat-badge">${escapeHtml(cat)}: ${n}个</span>`)
      .join(' ');
    document.getElementById('stats-bar').innerHTML = data.length
      ? `<strong>共 ${data.length} 个产品</strong> ${statsHtml}`
      : '暂无数据 — 请在上方输入关键词并点击"开始爬取"';

    // 表格
    const tbody = document.querySelector('#product-table tbody');
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:40px;color:#999">暂无数据，请先爬取</td></tr>';
    } else {
      tbody.innerHTML = data.map(p => `
        <tr data-id="${p.id}" data-name="${escapeHtml(p.name)}">
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.category)}</td>
          <td style="color:#0984e3;font-weight:bold">¥${Number(p.latest_price).toLocaleString()}</td>
          <td>${p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '-'}</td>
        </tr>
      `).join('');
    }
  } catch (e) {
    document.getElementById('stats-bar').innerHTML = '<span style="color:#d63031">无法连接服务器，请确认后端已启动</span>';
  }
}

// 事件委托：表格行点击加载图表
document.addEventListener('click', (e) => {
  const tr = e.target.closest('#product-table tbody tr[data-id]');
  if (tr) {
    // 高亮选中行
    document.querySelectorAll('#product-table tbody tr').forEach(r => r.classList.remove('selected'));
    tr.classList.add('selected');
    loadChart(tr.dataset.id, tr.dataset.name);
  }
});

function filterCategory(cat) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.cat-btn[data-cat="${cat}"]`);
  if (btn) btn.classList.add('active');
  loadProducts(cat, currentSearch);
}

function onSortChange() {
  currentSort = document.getElementById('sort-select').value;
  loadProducts(currentCategory, currentSearch);
}

// 事件委托：分类筛选按钮
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.cat-btn[data-cat]');
  if (btn) filterCategory(btn.dataset.cat);
});

async function startCrawl() {
  const keyword = document.getElementById('keyword').value.trim();
  const category = document.getElementById('category').value;
  if (!keyword) {
    showToast('请输入硬件关键词', 'warn');
    document.getElementById('keyword').focus();
    return;
  }

  const statusEl = document.getElementById('crawl-status');
  const btn = document.getElementById('btn-crawl');
  statusEl.textContent = '正在爬取中关村在线...';
  statusEl.className = 'status loading';
  btn.disabled = true;

  // 清除上一次轮询
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

  try {
    const count = parseInt(document.getElementById('crawl-count').value) || 10;

    const resp = await fetch(`${API}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, category, count })
    });
    const { taskId } = await resp.json();

    let elapsed = 0;
    const MAX_WAIT = 60; // 最多等60秒

    pollTimer = setInterval(async () => {
      elapsed++;
      if (elapsed > MAX_WAIT) {
        clearInterval(pollTimer);
        pollTimer = null;
        statusEl.textContent = '爬取超时，请重试';
        statusEl.className = 'status error';
        btn.disabled = false;
        return;
      }
      try {
        const task = await fetchJSON(`${API}/crawl/status/${taskId}`);
        if (task && (task.status === 'completed' || task.status === 'failed')) {
          clearInterval(pollTimer);
          pollTimer = null;
          btn.disabled = false;

          if (task.status === 'completed') {
            const cnt = task.result?.count || 0;
            statusEl.textContent = `爬取完成！获取到 ${cnt} 条数据 (来源: ${task.result?.source || '中关村在线'}) — 请在预览中选择保存`;
            statusEl.className = 'status success';
            saveHistory(keyword, category, cnt);
            // 弹出预览面板，不自动写入数据库
            showPreview(task.result?.products || [], category);
          } else {
            statusEl.textContent = `爬取失败: ${task.result?.error || '未知错误'}`;
            statusEl.className = 'status error';
          }
        }
      } catch (e) {
        // 网络波动，继续轮询
      }
    }, 1000);
  } catch (e) {
    statusEl.textContent = `请求失败: ${e.message}`;
    statusEl.className = 'status error';
    btn.disabled = false;
  }
}

function loadChart(productId, name) {
  const chartDom = document.getElementById('price-chart');
  chartDom.innerHTML = '<div class="chart-loading">加载中...</div>';

  fetchJSON(`${API}/products/${productId}/price-history?days=90`)
    .then(data => {
      if (!data || data.length === 0) {
        chartDom.innerHTML = '<div class="chart-empty">暂无价格历史数据<br><small>多次爬取同一产品后将展示价格趋势</small></div>';
        return;
      }
      drawChart(name, data);
    })
    .catch(() => {
      chartDom.innerHTML = '<div class="chart-empty">加载价格数据失败</div>';
    });
}

// ==================== 数据库搜索 ====================
function onDbSearch() {
  const input = document.getElementById('db-search');
  const val = input.value;
  currentSearch = val;
  const clearBtn = document.querySelector('.clear-search-btn');
  if (clearBtn) clearBtn.style.display = val ? 'inline-block' : 'none';

  clearTimeout(dbSearchTimer);
  dbSearchTimer = setTimeout(() => {
    loadProducts(currentCategory, val);
  }, 300); // 300ms 防抖
}

function clearDbSearch() {
  const input = document.getElementById('db-search');
  input.value = '';
  currentSearch = '';
  const clearBtn = document.querySelector('.clear-search-btn');
  if (clearBtn) clearBtn.style.display = 'none';
  loadProducts(currentCategory);
}

// ==================== 预览面板 ====================
let previewData = [];
let previewCategory = '';

function showPreview(products, category) {
  previewData = products;
  previewCategory = category;
  const panel = document.getElementById('preview-panel');
  const list = document.getElementById('preview-list');
  const count = document.getElementById('preview-count');
  const selectAll = document.getElementById('select-all');
  const title = document.getElementById('preview-title');

  title.textContent = `爬取结果预览 — ${category}`;
  count.textContent = `共 ${products.length} 个产品`;
  selectAll.checked = true;

  list.innerHTML = products.map((p, i) => `
    <div class="preview-item">
      <input type="checkbox" data-idx="${i}" checked onchange="updateSelectAllState()">
      <span class="pi-name">${escapeHtml(p.name)}</span>
      <span class="pi-price">¥${Number(p.price).toLocaleString()}</span>
    </div>
  `).join('');

  panel.style.display = 'flex';
}

function toggleSelectAll() {
  const checked = document.getElementById('select-all').checked;
  document.querySelectorAll('#preview-list input[type="checkbox"]').forEach(cb => {
    cb.checked = checked;
  });
}

function updateSelectAllState() {
  const all = document.querySelectorAll('#preview-list input[type="checkbox"]');
  const checked = document.querySelectorAll('#preview-list input[type="checkbox"]:checked');
  document.getElementById('select-all').checked = all.length === checked.length;
}

function getSelected() {
  const checkboxes = document.querySelectorAll('#preview-list input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => previewData[parseInt(cb.dataset.idx)]);
}

async function confirmSave() {
  const selected = getSelected();
  if (selected.length === 0) {
    showToast('请至少选择一个产品', 'warn');
    return;
  }
  await doSave(selected);
}

async function confirmSaveAll() {
  if (!previewData || previewData.length === 0) {
    showToast('没有可保存的产品数据', 'warn');
    return;
  }
  await doSave(previewData);
}

async function doSave(products) {
  const saveBtn = document.querySelector('.save-btn');
  const saveAllBtn = document.querySelector('.save-all-btn');
  // 保存中禁用按钮
  if (saveBtn) saveBtn.disabled = true;
  if (saveAllBtn) saveAllBtn.disabled = true;

  try {
    const resp = await fetch(`${API}/crawl/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: previewCategory, products })
    });
    const result = await resp.json();
    if (result.success) {
      showToast(`成功存入 ${result.count} 个产品到数据库`, 'success');
      closePreview();
      loadProducts(currentCategory, currentSearch);
    } else {
      showToast('存入失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (e) {
    console.error('doSave error:', e);
    showToast('请求失败: ' + e.message, 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (saveAllBtn) saveAllBtn.disabled = false;
  }
}

function closePreview() {
  document.getElementById('preview-panel').style.display = 'none';
  previewData = [];
}

// ==================== 拖拽调整表格/图表分界线 ====================
(function initResizer() {
  const panel = document.getElementById('data-panel');
  const resizer = document.getElementById('resizer');
  const left = document.getElementById('table-wrap');
  if (!panel || !resizer || !left) return;

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = left.offsetWidth;
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const newWidth = Math.max(240, startWidth + delta); // min 240px
    left.style.flex = `0 0 ${newWidth}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();

// ==================== 初始加载 ====================
loadProducts('ALL');
renderHistory();

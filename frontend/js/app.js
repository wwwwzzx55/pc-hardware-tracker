const API = 'http://localhost:3000/api';
let currentCategory = 'ALL';

async function fetchJSON(url) {
  const resp = await fetch(url);
  return resp.json();
}

async function loadProducts(category) {
  currentCategory = category;
  const url = category === 'ALL' ? `${API}/products` : `${API}/products?category=${category}`;
  const data = await fetchJSON(url);

  // 更新统计栏
  const catCount = {};
  data.forEach(p => { catCount[p.category] = (catCount[p.category] || 0) + 1; });
  const statsHtml = Object.entries(catCount)
    .map(([cat, n]) => `<span class="stat-badge">${cat}: ${n}个</span>`)
    .join(' ');
  document.getElementById('stats-bar').innerHTML = data.length
    ? `<strong>共 ${data.length} 个产品</strong> ${statsHtml}`
    : '暂无数据，请先爬取';

  // 更新表格
  const tbody = document.querySelector('#product-table tbody');
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:40px;color:#999">暂无数据，请在上方输入型号后点击"开始爬取"</td></tr>';
  } else {
    tbody.innerHTML = data.map(p => `
      <tr onclick="loadChart(${p.id}, '${p.name.replace(/'/g, "\\'")}')">
        <td>${p.name}</td>
        <td>${p.category}</td>
        <td style="color:#0984e3;font-weight:bold">¥${Number(p.latest_price).toLocaleString()}</td>
        <td>${p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '-'}</td>
      </tr>
    `).join('');
  }
}

function filterCategory(cat) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.cat-btn[onclick="filterCategory('${cat}')"]`);
  if (btn) btn.classList.add('active');
  loadProducts(cat);
}

async function startCrawl() {
  const keyword = document.getElementById('keyword').value.trim();
  const category = document.getElementById('category').value;
  if (!keyword) return alert('请输入硬件型号');

  const statusEl = document.getElementById('crawl-status');
  const btn = document.getElementById('btn-crawl');
  statusEl.textContent = '正在爬取中关村在线...';
  statusEl.className = 'status loading';
  btn.disabled = true;

  try {
    const resp = await fetch(`${API}/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, category })
    });
    const { taskId } = await resp.json();

    const poll = setInterval(async () => {
      const task = await fetchJSON(`${API}/crawl/status/${taskId}`);
      if (task && (task.status === 'completed' || task.status === 'failed')) {
        clearInterval(poll);
        btn.disabled = false;
        if (task.status === 'completed') {
          const count = task.result?.count || 0;
          statusEl.textContent = `爬取完成！获取到 ${count} 条真实数据 (来源: ${task.result?.source || '中关村在线'})`;
          statusEl.className = 'status success';
          // 刷新列表，展示刚爬到的数据
          await loadProducts('ALL');
          // 如果有数据，自动展示第一个产品的价格趋势
          if (task.result?.products?.length > 0) {
            const first = task.result.products[0];
            loadChart(first.product_id, first.name);
          }
        } else {
          statusEl.textContent = `爬取失败: ${task.result?.error || '未知错误'}`;
          statusEl.className = 'status error';
        }
      }
    }, 1000);
  } catch (e) {
    statusEl.textContent = `请求失败: ${e.message}`;
    statusEl.className = 'status error';
    btn.disabled = false;
  }
}

function loadChart(productId, name) {
  const dom = document.getElementById('price-chart');
  dom.style.display = 'block';
  fetchJSON(`${API}/products/${productId}/price-history?days=90`).then(data => {
    drawChart(name, data);
  });
}

// 页面加载
loadProducts('ALL');

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
  const tbody = document.querySelector('#product-table tbody');
  tbody.innerHTML = data.map(p => `
    <tr onclick="loadChart(${p.id}, '${p.name}')">
      <td>${p.name}</td><td>${p.category}</td>
      <td>¥${p.latest_price || '-'}</td>
      <td>${p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '-'}</td>
    </tr>
  `).join('');
}

function filterCategory(cat) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.cat-btn[onclick="filterCategory('${cat}')"]`).classList.add('active');
  loadProducts(cat);
}

async function startCrawl() {
  const keyword = document.getElementById('keyword').value.trim();
  const category = document.getElementById('category').value;
  if (!keyword) return alert('请输入硬件型号');

  const statusEl = document.getElementById('crawl-status');
  statusEl.textContent = '⏳ 爬取中...';
  statusEl.className = 'status loading';

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
      statusEl.textContent = task.status === 'completed'
        ? `完成！爬取到 ${task.result?.count || 0} 条数据`
        : `失败: ${task.result?.error || '未知错误'}`;
      statusEl.className = 'status';
      loadProducts(currentCategory);
    }
  }, 1000);
}

function loadChart(productId, name) {
  fetchJSON(`${API}/products/${productId}/price-history?days=90`).then(data => {
    drawChart(name, data);
  });
}

loadProducts('ALL');

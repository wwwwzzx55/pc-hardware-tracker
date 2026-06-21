let chartInstance = null;
let currentChartTab = 'trend';         // 当前选中的图表标签
let cachedStatsData = null;            // 缓存的统计数据
let cachedProducts = [];               // 缓存的产品列表
let cachedTrendData = null;            // 缓存的趋势数据 { name, data }

// ==================== 图表标签切换 ====================
function switchChartTab(tab) {
  currentChartTab = tab;
  // 更新标签激活样式
  document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.chart-tab[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');

  // 清空旧图表
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
  const dom = document.getElementById('price-chart');
  dom.innerHTML = '';

  // 根据标签加载对应图表
  switch (tab) {
    case 'trend':
      if (cachedTrendData) {
        drawChart(cachedTrendData.name, cachedTrendData.data);
      } else {
        dom.innerHTML = '<div class="chart-empty">点击左侧产品查看价格趋势</div>';
      }
      break;
    case 'category':
      if (cachedStatsData) {
        drawCategoryComparison(cachedStatsData);
      } else {
        dom.innerHTML = '<div class="chart-empty">暂无品类统计数据</div>';
      }
      break;
    case 'distribution':
      if (cachedProducts.length > 0) {
        drawPriceDistribution(cachedProducts);
      } else {
        dom.innerHTML = '<div class="chart-empty">暂无产品数据</div>';
      }
      break;
  }
}

// ==================== 1. 价格趋势图（增强版） ====================
function drawChart(name, data) {
  // 缓存趋势数据，切换标签回来时恢复
  cachedTrendData = { name, data };

  const dom = document.getElementById('price-chart');
  if (chartInstance) { chartInstance.dispose(); chartInstance = null; }
  chartInstance = echarts.init(dom);

  const dates = data.map(d => d.recorded_at?.slice(0, 10) || '');
  const prices = data.map(d => d.price);

  // 单数据点：仅标记点，不画线
  const isSingle = prices.length <= 1;

  // 计算7日移动平均线
  const ma7 = [];
  for (let i = 0; i < prices.length; i++) {
    const start = Math.max(0, i - 6);
    const slice = prices.slice(start, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    ma7.push(Number(avg.toFixed(2)));
  }

  // 计算涨跌信息
  const firstPrice = prices[0];
  const lastPrice = prices[prices.length - 1];
  const change = lastPrice - firstPrice;
  const changePercent = firstPrice > 0 ? ((change / firstPrice) * 100).toFixed(1) : '0.0';
  const changeStr = change >= 0 ? `+¥${Number(change).toLocaleString()}` : `-¥${Number(Math.abs(change)).toLocaleString()}`;
  const trendColor = change >= 0 ? '#d63031' : '#00b894';

  // 最低/最高价格标记
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minDate = dates[prices.indexOf(minPrice)];
  const maxDate = dates[prices.indexOf(maxPrice)];

  chartInstance.setOption({
    title: {
      text: name + ' 价格趋势',
      subtext: isSingle
        ? `仅 1 条记录 (${dates[0]}) — 多次爬取后将展示完整趋势`
        : `${dates[0]} ~ ${dates[dates.length - 1]} | 累计变动 ${changeStr} (${changePercent}%)`,
      left: 'center',
      textStyle: { fontSize: 14 },
      subtextStyle: { fontSize: 11, color: isSingle ? '#b2bec3' : trendColor },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        let html = `<b>${params[0].axisValue}</b><br/>`;
        params.forEach(p => {
          if (p.seriesName === 'MA7') return;
          const idx = p.dataIndex;
          const diff = idx > 0 ? p.value - prices[idx - 1] : 0;
          const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
          const color = diff > 0 ? '#d63031' : diff < 0 ? '#00b894' : '#636e72';
          html += `${p.marker} 价格: <b>¥${Number(p.value).toLocaleString()}</b>`;
          if (idx > 0) {
            html += ` <span style="color:${color}">${arrow}¥${Number(Math.abs(diff)).toLocaleString()}</span>`;
          }
          html += '<br/>';
        });
        // 显示MA7（多数据点时）
        if (!isSingle) {
          const maVal = ma7[params[0].dataIndex];
          html += `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#e17055;margin-right:4px;"></span> 7日均线: <b>¥${Number(maVal).toLocaleString()}</b>`;
        }
        return html;
      }
    },
    legend: isSingle ? undefined : {
      data: ['价格', '7日均线'],
      bottom: 0,
      textStyle: { fontSize: 11 },
    },
    grid: { left: 70, right: 25, top: 60, bottom: isSingle ? 10 : 35 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { fontSize: 10, rotate: dates.length > 15 ? 45 : 0 },
    },
    yAxis: {
      type: 'value',
      name: '价格 (¥)',
      axisLabel: { formatter: v => '¥' + Number(v).toLocaleString() },
      // 标记最低/最高价格虚线
      min: Math.floor(minPrice * 0.9),
      max: Math.ceil(maxPrice * 1.1),
    },
    series: [
      {
        name: '价格',
        data: prices,
        type: 'line',
        smooth: !isSingle,
        symbol: 'circle',
        symbolSize: isSingle ? 14 : 5,
        lineStyle: { color: '#0984e3', width: isSingle ? 0 : 2.5 },
        itemStyle: { color: '#0984e3' },
        areaStyle: isSingle ? undefined : { color: 'rgba(9,132,227,0.06)' },
        markPoints: isSingle ? undefined : {
          data: [
            { name: '最低', coord: [minDate, minPrice], value: '¥' + Number(minPrice).toLocaleString(),
              symbol: 'pin', symbolSize: 35, itemStyle: { color: '#00b894' },
              label: { fontSize: 10, color: '#fff' } },
            { name: '最高', coord: [maxDate, maxPrice], value: '¥' + Number(maxPrice).toLocaleString(),
              symbol: 'pin', symbolSize: 35, itemStyle: { color: '#d63031' },
              label: { fontSize: 10, color: '#fff' } },
          ],
        },
        label: isSingle ? { show: true, fontSize: 13, fontWeight: 'bold',
          formatter: p => '¥' + Number(p.value).toLocaleString(),
          position: 'top', distance: 10 } : undefined,
      },
      isSingle ? null : {
        name: 'MA7',
        data: ma7,
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#e17055', width: 1.5, type: 'dashed' },
        itemStyle: { color: '#e17055' },
      },
    ].filter(Boolean),
  });
}

// ==================== 2. 品类对比图（独立柱状图，每根柱子分开站位） ====================
function drawCategoryComparison(statsData) {
  cachedStatsData = statsData;

  const dom = document.getElementById('price-chart');
  if (chartInstance) { chartInstance.dispose(); chartInstance = null; }
  chartInstance = echarts.init(dom);

  const categories = statsData.categories || [];

  // 每根柱子独立站位：拼接品类名 + 指标名作为 X 轴标签
  const xLabels = [];
  const barData = [];      // [{ value, name, color }]
  const catPositions = []; // 记录每个品类柱子的起止位置，用于绘制分隔背景

  categories.forEach((c, ci) => {
    const startIdx = xLabels.length;  // 当前品类起始索引
    xLabels.push('均价', '最低', '最高');
    barData.push(
      { value: Number(c.avg_price), name: '均价',  cat: c.category, color: '#0984e3', count: c.product_count },
      { value: Number(c.min_price), name: '最低价', cat: c.category, color: '#00b894', count: c.product_count },
      { value: Number(c.max_price), name: '最高价', cat: c.category, color: '#e17055', count: c.product_count },
    );
    catPositions.push({ name: c.category, start: startIdx, end: xLabels.length - 1 });
  });

  // 为 X 轴标签加上品类名前缀，便于区分
  const displayLabels = barData.map(d => d.cat + '\n' + d.name);

  chartInstance.setOption({
    title: {
      text: '各品类价格对比',
      left: 'center',
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const d = barData[params[0].dataIndex];
        const catName = { CPU: 'CPU', GPU: '显卡', RAM: '内存', MB: '主板', SSD: '固态硬盘' }[d.cat] || d.cat;
        return `<b>${catName}</b> (${d.count}个产品)<br/>
          ${d.name}: <b>¥${Number(d.value).toLocaleString()}</b>`;
      },
    },
    grid: { left: 60, right: 25, top: 50, bottom: 45 },
    xAxis: {
      type: 'category',
      data: displayLabels,
      axisLabel: { fontSize: 10, interval: 0 },
      axisTick: { alignWithLabel: true },
      // 在品类之间画分隔竖线
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: '价格 (¥)',
      axisLabel: { formatter: v => '¥' + Number(v).toLocaleString() },
    },
    series: [{
      name: '价格',
      type: 'bar',
      barWidth: '30%',          // 柱子宽度仅占 30%
      barCategoryGap: '70%',    // 柱子之间间距占 70%，确保绝无重叠
      data: barData.map(d => ({
        value: d.value,
        itemStyle: { color: d.color, borderRadius: [4, 4, 0, 0] },
      })),
      label: {
        show: true,
        position: 'top',
        fontSize: 9,
        formatter: p => '¥' + Number(p.value).toLocaleString(),
      },
      // 品类分隔线：用 markLine 在品类边界画虚线
      markLine: (() => {
        const lines = [];
        for (let i = 1; i < catPositions.length; i++) {
          // 在两个品类之间画分隔线（前一个品类的最后一根柱子和后一个品类的第一根柱子之间）
          lines.push({
            silent: true,
            xAxis: catPositions[i].start - 0.5,
            lineStyle: { color: '#dfe6e9', type: 'dashed', width: 1.5 },
            label: { show: false },
          });
        }
        return lines.length > 0 ? { silent: true, symbol: 'none', data: lines } : undefined;
      })(),
    }],
  });
}

// ==================== 3. 价格分布图（直方图） ====================
function drawPriceDistribution(products) {
  cachedProducts = products;

  const dom = document.getElementById('price-chart');
  if (chartInstance) { chartInstance.dispose(); chartInstance = null; }
  chartInstance = echarts.init(dom);

  // 定义价格区间
  const ranges = [
    { label: '0-500', min: 0, max: 500 },
    { label: '500-1K', min: 500, max: 1000 },
    { label: '1K-2K', min: 1000, max: 2000 },
    { label: '2K-3K', min: 2000, max: 3000 },
    { label: '3K-5K', min: 3000, max: 5000 },
    { label: '5K-10K', min: 5000, max: 10000 },
    { label: '10K+', min: 10000, max: Infinity },
  ];

  const rangeLabels = ranges.map(r => r.label);
  const rangeColors = ['#74b9ff', '#0984e3', '#00b894', '#fdcb6e', '#e17055', '#d63031', '#6c5ce7'];

  // 统计每个区间的产品数量
  const counts = ranges.map(r => {
    return products.filter(p => {
      const price = Number(p.latest_price);
      return price >= r.min && price < r.max;
    }).length;
  });

  // 计算占比
  const total = counts.reduce((a, b) => a + b, 0);

  chartInstance.setOption({
    title: {
      text: '产品价格分布',
      left: 'center',
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const p = params[0];
        const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : '0.0';
        return `<b>${p.axisValue}元</b><br/>产品数: <b>${p.value}</b> 个<br/>占比: <b>${pct}%</b>`;
      },
    },
    grid: { left: 55, right: 25, top: 50, bottom: 30 },
    xAxis: {
      type: 'category',
      data: rangeLabels,
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      name: '产品数',
      minInterval: 1,
    },
    series: [
      {
        name: '产品数量',
        data: counts.map((count, i) => ({
          value: count,
          itemStyle: { color: rangeColors[i] },
        })),
        type: 'bar',
        barWidth: '55%',
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        label: {
          show: true,
          position: 'top',
          fontSize: 11,
          fontWeight: 'bold',
          formatter: p => p.value > 0 ? p.value : '',
        },
      },
    ],
  });
}

// ==================== 容器尺寸监听 ====================
const chartDom = document.getElementById('price-chart');
if (chartDom) {
  new ResizeObserver(() => chartInstance?.resize()).observe(chartDom);
}

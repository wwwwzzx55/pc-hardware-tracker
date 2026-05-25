let chartInstance = null;

function drawChart(name, data) {
  const dom = document.getElementById('price-chart');
  if (!chartInstance) {
    chartInstance = echarts.init(dom);
  }

  const dates = data.map(d => d.recorded_at?.slice(0, 10) || '');
  const prices = data.map(d => d.price);

  chartInstance.setOption({
    title: { text: name + ' 价格趋势', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: dates },
    yAxis: { type: 'value', name: '价格 (¥)' },
    series: [{
      data: prices,
      type: 'line',
      smooth: true,
      lineStyle: { color: '#0984e3', width: 2 },
      areaStyle: { color: 'rgba(9,132,227,0.1)' },
    }]
  });
}

window.addEventListener('resize', () => chartInstance?.resize());

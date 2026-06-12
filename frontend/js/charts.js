let chartInstance = null;

function drawChart(name, data) {
  const dom = document.getElementById('price-chart');
  // 每次绘制前销毁旧实例，避免 innerHTML 被清空后 canvas 无法恢复
  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }
  chartInstance = echarts.init(dom);

  const dates = data.map(d => d.recorded_at?.slice(0, 10) || '');
  const prices = data.map(d => d.price);

  chartInstance.setOption({
    title: { text: name + ' 价格趋势', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const p = params[0];
        return `${p.axisValue}<br/>价格: <b>¥${Number(p.value).toLocaleString()}</b>`;
      }
    },
    grid: { left: 60, right: 20, top: 50, bottom: 30 },
    xAxis: { type: 'category', data: dates, axisLabel: { fontSize: 11 } },
    yAxis: {
      type: 'value',
      name: '价格 (¥)',
      axisLabel: { formatter: v => '¥' + Number(v).toLocaleString() }
    },
    series: [{
      data: prices,
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { color: '#0984e3', width: 2 },
      itemStyle: { color: '#0984e3' },
      areaStyle: { color: 'rgba(9,132,227,0.08)' },
    }]
  });
}

window.addEventListener('resize', () => chartInstance?.resize());

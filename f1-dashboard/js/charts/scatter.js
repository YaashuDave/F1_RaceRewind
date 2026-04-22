import { on } from '../brushing.js';
import { showTooltip, hideTooltip, unique } from '../utils/helpers.js';

function leastSquares(data) {
  const n = data.length;
  if (n === 0) return { slope: 1, intercept: 0 };
  const sumX = d3.sum(data, (d) => d.grid);
  const sumY = d3.sum(data, (d) => d.finish);
  const sumXY = d3.sum(data, (d) => d.grid * d.finish);
  const sumXX = d3.sum(data, (d) => d.grid * d.grid);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function rSquared(data, slope, intercept) {
  if (!data.length) return 0;
  const yMean = d3.mean(data, (d) => d.finish);
  const ssTot = d3.sum(data, (d) => Math.pow(d.finish - yMean, 2));
  const ssRes = d3.sum(data, (d) => Math.pow(d.finish - (slope * d.grid + intercept), 2));
  return ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
}

export function createScatterPlot(selector, source, context) {
  const container = d3.select(selector);
  container.html('');
  const header = container.append('div').style('display', 'flex').style('justify-content', 'flex-end').style('padding', '6px 10px 0 10px');
  const regressionToggle = header.append('button').attr('type', 'button')
    .style('border', '1px solid #2f2f2f').style('background', '#101010').style('color', '#f0f0f0')
    .style('border-radius', '999px').style('padding', '4px 10px').text('Regression: On');
  let regressionVisible = true;
  regressionToggle.on('click', () => {
    regressionVisible = !regressionVisible;
    regressionToggle.text(`Regression: ${regressionVisible ? 'On' : 'Off'}`);
    render(context.state);
  });

  const width = container.node().clientWidth;
  const height = container.node().clientHeight - 28;
  const margin = { top: 16, right: 16, bottom: 40, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const svg = container.append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio', 'xMidYMid meet');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const x = d3.scaleLinear().domain([1, 20]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([20, 1]).range([0, innerHeight]);

  // Axis labels
  g.append('text')
    .attr('x', innerWidth / 2).attr('y', innerHeight + 34)
    .attr('text-anchor', 'middle').attr('fill', '#a6a6a6').attr('font-size', 11)
    .text('Grid Position');
  g.append('text')
    .attr('transform', 'rotate(-90)').attr('x', -innerHeight / 2).attr('y', -28)
    .attr('text-anchor', 'middle').attr('fill', '#a6a6a6').attr('font-size', 11)
    .text('Finish Position');

  const xAxis = g.append('g').attr('transform', `translate(0,${innerHeight})`);
  const yAxis = g.append('g');
  const pointsLayer = g.append('g');
  const regressionLayer = g.append('g');
  const brushLayer = g.append('g');

  // Fix: filtered is declared in outer scope so the brush end handler can access it
  let filtered = [];

  const brush = d3.brush()
    .extent([[0, 0], [innerWidth, innerHeight]])
    .on('end', (event) => {
      if (!event.selection) return;
      const [[x0, y0], [x1, y1]] = event.selection;
      const selected = filtered.filter((entry) => x(entry.grid) >= x0 && x(entry.grid) <= x1 && y(entry.finish) >= y0 && y(entry.finish) <= y1);
      context.emit('driversSelected', { selectedDrivers: unique(selected.map((entry) => entry.driver)) });
    });
  brushLayer.call(brush);

  function render(currentState) {
    filtered = source.data.filter((entry) => {
      const inYearRange = entry.year >= currentState.yearRange[0] && entry.year <= currentState.yearRange[1];
      const constructorMatch = !currentState.selectedConstructors.length || currentState.selectedConstructors.includes(entry.constructor);
      const driverMatch = !currentState.selectedDrivers.length || currentState.selectedDrivers.includes(entry.driver);
      const circuitMatch = !currentState.selectedCircuit || entry.circuit_key === currentState.selectedCircuit;
      return inYearRange && constructorMatch && driverMatch && circuitMatch;
    });
    pointsLayer.selectAll('*').remove();
    regressionLayer.selectAll('*').remove();
    if (!filtered.length) return;
    const regression = leastSquares(filtered);
    const selectedDrivers = new Set(currentState.selectedDrivers);

    pointsLayer.selectAll('circle').data(filtered).join('circle')
      .attr('cx', (d) => x(d.grid))
      .attr('cy', (d) => y(d.finish))
      .attr('r', 4)
      .attr('fill', (d) => d.color)
      .attr('opacity', (d) => {
        if (selectedDrivers.size) return selectedDrivers.has(d.driver) ? 1 : 0.12;
        if (currentState.selectedConstructors.length) return currentState.selectedConstructors.includes(d.constructor) ? 0.8 : 0.15;
        return 0.6;
      })
      .on('mousemove', (event, d) => {
        const gain = d.grid - d.finish;
        const gainHtml = gain > 0
          ? `<span style="color:#4caf50">+${gain} pos gained</span>`
          : gain < 0
            ? `<span style="color:#e8002d">${gain} pos lost</span>`
            : '<span style="color:#a6a6a6">No change</span>';
        showTooltip(
          context.tooltip,
          `<strong>${d.driver}</strong><br>${d.constructor}<br>${d.race} (${d.year})<br>Grid ${d.grid} → Finish ${d.finish}<br>${gainHtml}`,
          event.clientX,
          event.clientY,
        );
      })
      .on('mouseleave', () => hideTooltip(context.tooltip));

    if (regressionVisible) {
      const x1v = 1, x2v = 20;
      const y1v = regression.slope * x1v + regression.intercept;
      const y2v = regression.slope * x2v + regression.intercept;
      regressionLayer.append('path')
        .attr('d', d3.line()([[x(x1v), y(y1v)], [x(x2v), y(y2v)]]))
        .attr('fill', 'none').attr('stroke', '#e8002d').attr('stroke-width', 2).attr('stroke-dasharray', '6 3');

      // R² annotation placed near the regression line
      const r2 = rSquared(filtered, regression.slope, regression.intercept);
      regressionLayer.append('text')
        .attr('x', x(14)).attr('y', y(regression.slope * 14 + regression.intercept) - 8)
        .attr('fill', '#e8002d').attr('font-size', 10).attr('text-anchor', 'middle')
        .text(`R² = ${r2.toFixed(2)}`);
    }

    g.selectAll('.reference-line').data([null]).join('line')
      .attr('class', 'reference-line')
      .attr('x1', x(1)).attr('y1', y(1))
      .attr('x2', x(20)).attr('y2', y(20))
      .attr('stroke', '#6b6b6b').attr('stroke-dasharray', '5 4');

    xAxis.call(d3.axisBottom(x).ticks(10));
    yAxis.call(d3.axisLeft(y).ticks(10));
  }

  on('*', render);
  render(context.state);
  return { update: render };
}

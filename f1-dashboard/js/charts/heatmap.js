import { on } from '../brushing.js';
import { constructorColor } from '../utils/colors.js';
import { showTooltip, hideTooltip, unique } from '../utils/helpers.js';

export function createHeatmap(selector, dominance, context) {
  const container = d3.select(selector);
  container.html('');

  const width  = container.node().clientWidth;
  const height = container.node().clientHeight;

  // Build top-15 constructors dynamically from all-time points — no hardcoding
  const allTimeTotals = new Map();
  (dominance.by_season || []).forEach((row) => {
    allTimeTotals.set(row.constructor, (allTimeTotals.get(row.constructor) || 0) + Number(row.total_points || 0));
  });
  const TOP_CONSTRUCTORS = [...allTimeTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name]) => name);

  // Reserve bottom strip for dominance-index sparkline
  const sparkHeight = 28;
  const margin = { top: 22, right: 10, bottom: sparkHeight + 28, left: 88 };
  const innerWidth  = width  - margin.left - margin.right;
  const innerHeight = height - margin.top  - margin.bottom;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');

  // Subtitle
  svg.append('text')
    .attr('x', margin.left).attr('y', 12)
    .attr('fill', '#555').attr('font-size', 8.5)
    .text('Cell color intensity = share of all championship points scored that year  ·  Click cell to filter');

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Pre-compute shares from by_season data
  const yearTotals = new Map();
  (dominance.by_season || []).forEach((row) => {
    yearTotals.set(row.year, (yearTotals.get(row.year) || 0) + Number(row.total_points || 0));
  });

  // share lookup: shareMap[year][constructor] = fraction 0-1
  const shareMap = new Map();
  // dominance index: max share per year
  const domIndex = new Map();
  // wins lookup
  const winsMap = new Map();

  (dominance.by_season || []).forEach((row) => {
    const total = yearTotals.get(row.year) || 1;
    const share = Number(row.total_points || 0) / total;
    if (!shareMap.has(row.year)) shareMap.set(row.year, new Map());
    shareMap.get(row.year).set(row.constructor, share);
    if (!winsMap.has(row.year)) winsMap.set(row.year, new Map());
    winsMap.get(row.year).set(row.constructor, Number(row.wins || 0));
    const cur = domIndex.get(row.year) || 0;
    if (share > cur) domIndex.set(row.year, share);
  });

  // Scales
  const allYears = unique((dominance.by_season || []).map((d) => d.year)).sort((a, b) => a - b);
  const x = d3.scaleBand().domain(allYears).range([0, innerWidth]).padding(0.04);
  const y = d3.scaleBand().domain(TOP_CONSTRUCTORS).range([0, innerHeight]).padding(0.1);

  // Sparkline scale below heatmap
  const sparkY = d3.scaleLinear().domain([0, 0.7]).range([sparkHeight, 0]);
  const sparkG = svg.append('g').attr('transform',
    `translate(${margin.left},${margin.top + innerHeight + 14})`);

  // Sparkline label
  sparkG.append('text')
    .attr('x', -4).attr('y', sparkHeight / 2 + 3)
    .attr('text-anchor', 'end').attr('fill', '#555').attr('font-size', 7.5)
    .text('Dom. Index');

  // Y axis (constructor names) — clicking a label selects that constructor
  const yAxisG = g.append('g').call(d3.axisLeft(y).tickSize(0).tickPadding(5));
  yAxisG.selectAll('text')
    .attr('fill', (d) => constructorColor(d))
    .attr('font-size', 9)
    .attr('font-weight', 600)
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      event.stopPropagation();
      context.emit('constructorSelected', { selectedConstructors: [d] });
    });
  yAxisG.select('.domain').remove();

  const cellLayer    = g.append('g');
  const xAxisLayer   = g.append('g').attr('transform', `translate(0,${innerHeight})`);
  const sparkLine    = sparkG.append('path');
  const sparkArea    = sparkG.append('path');
  const sparkXAxis   = sparkG.append('g').attr('transform', `translate(0,${sparkHeight})`);
  const hoverCol     = g.append('rect').attr('class', 'hover-col').attr('pointer-events', 'none')
    .attr('fill', 'rgba(255,255,255,0.06)').attr('width', 0).attr('y', 0).attr('height', innerHeight);

  function render(currentState) {
    const yearRange = currentState.yearRange;
    const filteredYears = allYears.filter((y) => y >= yearRange[0] && y <= yearRange[1]);
    const selectedConstructors = currentState.selectedConstructors;

    x.domain(filteredYears);
    xAxisLayer.call(
      d3.axisBottom(x)
        .tickValues(filteredYears.filter((y) => y % 10 === 0))
        .tickFormat(d3.format('d'))
        .tickSize(3),
    ).selectAll('text').attr('font-size', 9);
    xAxisLayer.select('.domain').attr('stroke', '#333');

    // Cells
    const cells = [];
    filteredYears.forEach((yr) => {
      TOP_CONSTRUCTORS.forEach((con) => {
        const share = shareMap.get(yr)?.get(con) || 0;
        cells.push({ year: yr, constructor: con, share, wins: winsMap.get(yr)?.get(con) || 0 });
      });
    });

    cellLayer.selectAll('rect.cell').data(cells, (d) => `${d.year}-${d.constructor}`)
      .join('rect')
      .attr('class', 'cell')
      .attr('x', (d) => x(d.year))
      .attr('y', (d) => y(d.constructor))
      .attr('width', Math.max(1, x.bandwidth()))
      .attr('height', Math.max(1, y.bandwidth()))
      .attr('rx', 1)
      .attr('fill', (d) => constructorColor(d.constructor))
      // Opacity encodes share — min opacity 0.04 so empty cells are visible as ghost
      .attr('opacity', (d) => {
        const base = 0.04 + d.share * 0.96;
        if (selectedConstructors.length) {
          return selectedConstructors.includes(d.constructor) ? base : base * 0.25;
        }
        return base;
      })
      .on('mousemove', (event, d) => {
        // Highlight entire column
        hoverCol.attr('x', x(d.year)).attr('width', x.bandwidth());
        showTooltip(
          context.tooltip,
          `<strong>${d.constructor}</strong> — ${d.year}<br>` +
          `Points share: <strong>${(d.share * 100).toFixed(1)}%</strong><br>` +
          `Wins: ${d.wins}`,
          event.clientX, event.clientY,
        );
      })
      .on('mouseleave', () => {
        hoverCol.attr('width', 0);
        hideTooltip(context.tooltip);
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        context.emit('constructorSelected', { selectedConstructors: [d.constructor] });
      });

    // Dominance index sparkline (max share per year)
    const sparkData = filteredYears.map((yr) => ({
      year: yr,
      dom: domIndex.get(yr) || 0,
    }));

    const sxBand = x; // same x scale
    const sxMid  = (yr) => (sxBand(yr) || 0) + sxBand.bandwidth() / 2;

    const lineGen = d3.line()
      .x((d) => sxMid(d.year))
      .y((d) => sparkY(d.dom))
      .curve(d3.curveBasis);

    const areaGen = d3.area()
      .x((d) => sxMid(d.year))
      .y0(sparkHeight)
      .y1((d) => sparkY(d.dom))
      .curve(d3.curveBasis);

    sparkArea.datum(sparkData)
      .attr('d', areaGen)
      .attr('fill', 'rgba(232,0,45,0.18)');

    sparkLine.datum(sparkData)
      .attr('d', lineGen)
      .attr('fill', 'none')
      .attr('stroke', '#e8002d')
      .attr('stroke-width', 1.5);

    // Sparkline axis: just a few ticks
    sparkXAxis.call(
      d3.axisBottom(d3.scaleLinear().domain([0, filteredYears.length - 1]).range([0, innerWidth]))
        .tickSize(0).ticks(0),
    );
    sparkG.select('.domain').attr('stroke', '#333');

    // 50% reference line on sparkline (majority dominance)
    sparkG.selectAll('.dom-ref').remove();
    sparkG.append('line').attr('class', 'dom-ref')
      .attr('x1', 0).attr('x2', innerWidth)
      .attr('y1', sparkY(0.5)).attr('y2', sparkY(0.5))
      .attr('stroke', '#444').attr('stroke-dasharray', '3 3').attr('stroke-width', 1);
    sparkG.append('text').attr('class', 'dom-ref')
      .attr('x', innerWidth + 3).attr('y', sparkY(0.5) + 3)
      .attr('fill', '#555').attr('font-size', 7)
      .text('50%');
  }

  on('*', render);
  render(context.state);
  return { update: render };
}

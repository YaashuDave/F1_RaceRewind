import { on } from '../brushing.js';
import { constructorColor } from '../utils/colors.js';
import { showTooltip, hideTooltip, unique } from '../utils/helpers.js';

const regulationYears = [
  { year: 1966, label: '3.0L Era' },
  { year: 1983, label: 'Ground Effect Ban' },
  { year: 2009, label: 'KERS / New Aero' },
  { year: 2014, label: 'Hybrid V6 Era' },
  { year: 2022, label: 'Ground Effect Returns' },
];

export function createStreamGraph(selector, dominance, context) {
  const container = d3.select(selector);
  container.html('');
  const width = container.node().clientWidth;
  const height = container.node().clientHeight;
  const margin = { top: 28, right: 18, bottom: 34, left: 36 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const svg = container.append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio', 'xMidYMid meet');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  // Subtitle explaining the chart
  svg.append('text')
    .attr('x', margin.left).attr('y', 11)
    .attr('fill', '#666').attr('font-size', 9)
    .text('Each band = share of total championship points scored that year  ·  Brush to filter year range');

  // Y axis label
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(margin.top + innerHeight / 2))
    .attr('y', 10)
    .attr('text-anchor', 'middle').attr('fill', '#a6a6a6').attr('font-size', 9)
    .text('Points share');

  const yearBrushLayer = g.append('g');
  const streamLayer = g.append('g');
  const regulationLayer = g.append('g');
  const axisLayer = g.append('g').attr('transform', `translate(0,${innerHeight})`);
  const yAxisLayer = g.append('g');
  const labelLayer = g.append('g');
  const yearData = dominance.by_season || [];
  const constructors = unique(yearData.map((entry) => entry.constructor));

  // Fix: build color map from data — constructors are strings, not objects,
  // so constructors.map(e => e.color) was always undefined → gray streams
  const colorMap = new Map(yearData.map((entry) => [entry.constructor, entry.color || constructorColor(entry.constructor)]));
  const getStreamColor = (name) => colorMap.get(name) || constructorColor(name);

  // stackOffsetExpand normalises each year to sum=1, giving a true market-share view
  // (0–100% Y axis). Much easier to read than wiggle which has no interpretable Y axis.
  const x = d3.scaleLinear().domain(d3.extent(yearData, (d) => d.year)).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
  const stack = d3.stack().keys(constructors).offset(d3.stackOffsetExpand);
  const area = d3.area().x((d) => x(d.data.year)).y0((d) => y(d[0])).y1((d) => y(d[1])).curve(d3.curveBasis);

  const brush = d3.brushX()
    .extent([[0, 0], [innerWidth, innerHeight]])
    .on('end', (event) => {
      if (!event.selection) return;
      const [x0, x1] = event.selection.map(x.invert);
      context.emit('yearRangeChanged', { yearRange: [Math.round(x0), Math.round(x1)] });
    });

  yearBrushLayer.append('g').attr('class', 'x-brush').call(brush);

  function render(currentState) {
    const filteredYears = yearData.filter((entry) => entry.year >= currentState.yearRange[0] && entry.year <= currentState.yearRange[1]);
    const stackInput = [...new Set(filteredYears.map((item) => item.year))].sort((a, b) => a - b).map((year) => {
      const row = { year };
      constructors.forEach((name) => {
        const match = filteredYears.find((e) => e.year === year && e.constructor === name);
        row[name] = match ? Number(match.total_points || 0) : 0;
      });
      return row;
    });
    if (!stackInput.length) return;
    const stacked = stack(stackInput);
    // stackOffsetExpand always produces [0,1] — domain is fixed, Y axis = market share %

    streamLayer.selectAll('*').remove();
    regulationLayer.selectAll('*').remove();
    const selected = currentState.selectedConstructors;
    const highlighted = currentState.highlightedConstructor;

    streamLayer.selectAll('path').data(stacked, (d) => d.key)
      .join('path')
      .attr('d', area)
      .attr('fill', (d) => getStreamColor(d.key))
      .attr('opacity', (d) => {
        if (selected.length) return selected.includes(d.key) ? 1 : 0.12;
        if (highlighted) return highlighted === d.key ? 1 : 0.2;
        return 0.92;
      })
      .attr('stroke', 'none')
      .on('mousemove', (event, d) => {
        const year = Math.round(x.invert(d3.pointer(event, g.node())[0]));
        const entry = filteredYears.find((item) => item.year === year && item.constructor === d.key);
        if (entry) {
          // Compute share: this constructor's points / total points that year
          const yearTotal = filteredYears
            .filter((item) => item.year === year)
            .reduce((sum, item) => sum + Number(item.total_points || 0), 0);
          const share = yearTotal > 0 ? (Number(entry.total_points) / yearTotal * 100).toFixed(1) : '—';
          showTooltip(
            context.tooltip,
            `<strong>${d.key}</strong><br>${entry.year}<br>` +
            `${entry.total_points} pts &bull; ${share}% share<br>` +
            `${entry.wins} win${entry.wins !== 1 ? 's' : ''}`,
            event.clientX,
            event.clientY,
          );
        }
      })
      .on('mouseleave', () => hideTooltip(context.tooltip))
      .on('click', (event, d) => {
        event.stopPropagation();
        context.emit('constructorSelected', { selectedConstructors: [d.key] });
      });

    labelLayer.selectAll('*').remove();
    const topSeries = stacked.slice(0, Math.min(10, stacked.length));
    topSeries.forEach((series) => {
      const maxPoint = series.reduce(
        (best, point) => ((point[1] - point[0]) > ((best?.[1] ?? 0) - (best?.[0] ?? 0)) ? point : best),
        null,
      );
      if (maxPoint) {
        const bandHeight = maxPoint[1] - maxPoint[0];
        if (bandHeight > 18) {
          labelLayer.append('text')
            .attr('class', 'inline-label')
            .attr('x', x(maxPoint.data.year))
            .attr('y', y((maxPoint[0] + maxPoint[1]) / 2))
            .text(series.key);
        }
      }
    });

    axisLayer.selectAll('*').remove();
    axisLayer.call(d3.axisBottom(x).tickValues(x.ticks(8).filter((v) => v % 10 === 0)).tickFormat(d3.format('d')));
    yAxisLayer.call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0%')));

    regulationYears.forEach(({ year, label }) => {
      if (year < currentState.yearRange[0] || year > currentState.yearRange[1]) return;
      const xPos = x(year);
      regulationLayer.append('line')
        .attr('class', 'regulation-line')
        .attr('x1', xPos).attr('x2', xPos)
        .attr('y1', 0).attr('y2', innerHeight);
      regulationLayer.append('text')
        .attr('class', 'inline-label')
        .attr('x', xPos + 4)
        .attr('y', 12)
        .style('font-size', '9px')
        .text(`${year}: ${label}`);
    });
  }

  on('*', render);
  render(context.state);
  return { update: render };
}

import { on } from '../brushing.js';
import { showTooltip, hideTooltip } from '../utils/helpers.js';

// Outcome stack order and colors — bottom to top
const OUTCOMES = [
  { key: 'finished',   label: 'Finished',    color: '#4caf50' },
  { key: 'lapped',     label: 'Lapped',      color: '#64b5f6' },
  { key: 'mechanical', label: 'Mechanical',  color: '#ff9800' },
  { key: 'accident',   label: 'Accident',    color: '#e8002d' },
  { key: 'other',      label: 'Other/DSQ',   color: '#555555' },
];

export function createReliabilityChart(selector, source, context) {
  const container = d3.select(selector);
  container.html('');

  // Toggle: field-wide era view vs constructor comparison view
  const header = container.append('div')
    .style('display', 'flex').style('align-items', 'center')
    .style('justify-content', 'space-between').style('padding', '6px 10px 0 10px');
  header.append('span').style('font-size', '0.7rem').style('color', '#a6a6a6').text('All cars · 1950–2024');
  const modeBtn = header.append('button').attr('type', 'button')
    .style('border', '1px solid #2f2f2f').style('background', '#101010').style('color', '#f0f0f0')
    .style('border-radius', '999px').style('padding', '4px 10px').style('font-size', '0.7rem')
    .text('Mode: Era Trend');
  let mode = 'era'; // 'era' | 'constructor'
  modeBtn.on('click', () => {
    mode = mode === 'era' ? 'constructor' : 'era';
    modeBtn.text(`Mode: ${mode === 'era' ? 'Era Trend' : 'By Constructor'}`);
    render(context.state);
  });

  const width  = container.node().clientWidth;
  const height = container.node().clientHeight - 30;
  const margin = { top: 14, right: 110, bottom: 36, left: 40 };
  const innerWidth  = width  - margin.left - margin.right;
  const innerHeight = height - margin.top  - margin.bottom;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const xAxis  = g.append('g').attr('transform', `translate(0,${innerHeight})`);
  const yAxis  = g.append('g');
  const barLayer = g.append('g');

  // Y axis label
  g.append('text')
    .attr('transform', 'rotate(-90)').attr('x', -innerHeight / 2).attr('y', -30)
    .attr('text-anchor', 'middle').attr('fill', '#a6a6a6').attr('font-size', 10)
    .text('Share of Race Entries');

  // Legend (right side)
  const legend = svg.append('g').attr('transform', `translate(${margin.left + innerWidth + 8},${margin.top + 4})`);
  OUTCOMES.forEach((o, i) => {
    const row = legend.append('g').attr('transform', `translate(0,${i * 16})`);
    row.append('rect').attr('width', 10).attr('height', 10).attr('fill', o.color).attr('rx', 2);
    row.append('text').attr('x', 14).attr('y', 9)
      .attr('fill', '#a6a6a6').attr('font-size', 9).text(o.label);
  });

  const x    = d3.scaleBand().padding(0.12).range([0, innerWidth]);
  const y    = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
  const stack = d3.stack().keys(OUTCOMES.map(o => o.key)).offset(d3.stackOffsetNone);

  function render(currentState) {
    barLayer.selectAll('*').remove();

    if (mode === 'era') {
      // Show all-field finish rates by year, respecting year range
      const rows = source.by_year.filter(
        d => d.year >= currentState.yearRange[0] && d.year <= currentState.yearRange[1],
      );
      if (!rows.length) return;

      // If range > 20 years, bucket into 5-year groups for readability
      const span = currentState.yearRange[1] - currentState.yearRange[0];
      let plotData;
      if (span > 20) {
        const bucket = span > 50 ? 10 : 5;
        const groups = d3.rollups(rows, vals => {
          const total = d3.sum(vals, v => v.total);
          const out = { year: Math.floor(vals[0].year / bucket) * bucket };
          OUTCOMES.forEach(o => {
            out[o.key] = d3.sum(vals, v => v[o.key] * v.total) / total;
          });
          out._label = `${out.year}s`;
          return out;
        }, d => Math.floor(d.year / bucket) * bucket)
          .map(([, v]) => v)
          .sort((a, b) => a.year - b.year);
        plotData = groups;
      } else {
        plotData = rows.map(d => ({ ...d, _label: String(d.year) }));
      }

      x.domain(plotData.map(d => d._label));
      const stacked = stack(plotData);

      const colorMap = Object.fromEntries(OUTCOMES.map(o => [o.key, o.color]));
      const selected = new Set(currentState.selectedConstructors);

      stacked.forEach(series => {
        barLayer.selectAll(`.bar-${series.key}`)
          .data(series)
          .join('rect')
          .attr('class', `bar-${series.key}`)
          .attr('x', d => x(d.data._label))
          .attr('y', d => y(d[1]))
          .attr('height', d => Math.max(0, y(d[0]) - y(d[1])))
          .attr('width', x.bandwidth())
          .attr('fill', colorMap[series.key])
          .attr('opacity', 0.88)
          .on('mousemove', (event, d) => {
            const pct = (d[1] - d[0]) * 100;
            const label = OUTCOMES.find(o => o.key === series.key)?.label || series.key;
            showTooltip(
              context.tooltip,
              `<strong>${d.data._label}</strong><br>${label}: ${pct.toFixed(1)}%<br>` +
              `Finished: ${(d.data.finished * 100).toFixed(1)}%<br>` +
              `Mechanical DNF: ${(d.data.mechanical * 100).toFixed(1)}%<br>` +
              `Accident: ${(d.data.accident * 100).toFixed(1)}%`,
              event.clientX, event.clientY,
            );
          })
          .on('mouseleave', () => hideTooltip(context.tooltip));
      });

      xAxis.call(d3.axisBottom(x).tickValues(
        span > 20
          ? x.domain()
          : x.domain().filter((_, i) => i % Math.ceil(plotData.length / 12) === 0),
      ));

    } else {
      // Constructor mode: show per-constructor finish rate for selected year range
      // One bar per constructor, colored by constructor color, height = finish rate
      const rows = source.by_constructor.filter(
        d => d.year >= currentState.yearRange[0] && d.year <= currentState.yearRange[1],
      );
      const selected = currentState.selectedConstructors;

      // Aggregate per constructor across years
      const byConstructor = d3.rollups(rows, vals => {
        const total = d3.sum(vals, v => v.total);
        if (total < 20) return null; // skip too-small samples
        const out = { constructor: vals[0].constructor, color: vals[0].color, total };
        OUTCOMES.forEach(o => {
          out[o.key] = d3.sum(vals, v => v[o.key] * v.total) / total;
        });
        return out;
      }, d => d.constructor)
        .map(([, v]) => v)
        .filter(Boolean)
        .sort((a, b) => b.finished - a.finished); // fastest-first = most reliable first

      const top = byConstructor.slice(0, 14);
      if (!top.length) return;

      x.domain(top.map(d => d.constructor));
      const stacked = stack(top);

      const colorMap = Object.fromEntries(OUTCOMES.map(o => [o.key, o.color]));

      stacked.forEach(series => {
        barLayer.selectAll(`.cbar-${series.key}`)
          .data(series)
          .join('rect')
          .attr('class', `cbar-${series.key}`)
          .attr('x', d => x(d.data.constructor))
          .attr('y', d => y(d[1]))
          .attr('height', d => Math.max(0, y(d[0]) - y(d[1])))
          .attr('width', x.bandwidth())
          .attr('fill', colorMap[series.key])
          .attr('opacity', d =>
            selected.length && !selected.includes(d.data.constructor) ? 0.15 : 0.88,
          )
          .on('mousemove', (event, d) => {
            showTooltip(
              context.tooltip,
              `<strong>${d.data.constructor}</strong><br>` +
              `Finished: ${(d.data.finished * 100).toFixed(1)}%<br>` +
              `Lapped: ${(d.data.lapped * 100).toFixed(1)}%<br>` +
              `Mechanical: ${(d.data.mechanical * 100).toFixed(1)}%<br>` +
              `Accident: ${(d.data.accident * 100).toFixed(1)}%<br>` +
              `Total entries: ${d.data.total}`,
              event.clientX, event.clientY,
            );
          })
          .on('mouseleave', () => hideTooltip(context.tooltip))
          .on('click', (event, d) => {
            event.stopPropagation();
            context.emit('constructorSelected', { selectedConstructors: [d.data.constructor] });
          });
      });

      xAxis.call(d3.axisBottom(x))
        .selectAll('text').attr('transform', 'rotate(-30)').style('text-anchor', 'end').attr('font-size', 9);
    }

    y.domain([0, 1]);
    yAxis.call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0%')));
  }

  on('*', render);
  render(context.state);
  return { update: render };
}

import { on } from '../brushing.js';
import { showTooltip, hideTooltip } from '../utils/helpers.js';

export function createChampBattles(selector, source, context) {
  const container = d3.select(selector);
  container.html('');

  const width  = container.node().clientWidth;
  const height = container.node().clientHeight;
  // Left margin wider to fit year labels, right for champion name
  const margin = { top: 14, right: 110, bottom: 36, left: 42 };
  const innerWidth  = width  - margin.left - margin.right;
  const innerHeight = height - margin.top  - margin.bottom;

  const svg = container.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // X axis: gap_pct 0–55%
  const x = d3.scaleLinear().domain([0, 55]).range([0, innerWidth]);
  // Y axis: one band per year — rendered as continuous scroll within the panel
  const y = d3.scaleBand().padding(0.18).range([0, innerHeight]);

  const xAxisG = g.append('g').attr('transform', `translate(0,${innerHeight})`);
  const yAxisG = g.append('g');
  const barsG  = g.append('g');

  // Axis labels
  g.append('text')
    .attr('x', innerWidth / 2).attr('y', innerHeight + 32)
    .attr('text-anchor', 'middle').attr('fill', '#a6a6a6').attr('font-size', 11)
    .text('Points Gap (% of champion\'s total)');

  // Threshold lines: "tight battle" (< 5%) and "dominant season" (> 30%)
  const thresholdLayer = g.append('g');

  function render(currentState) {
    const rows = source.data.filter(
      (d) => d.year >= currentState.yearRange[0] && d.year <= currentState.yearRange[1],
    );
    if (!rows.length) return;

    // Limit displayed rows for readability: if > 25 years, show every other year
    let display = rows;
    if (rows.length > 40) {
      display = rows.filter((_, i) => i % 3 === 0 || rows[i].gap_pct < 5 || rows[i].gap_pct > 40);
    } else if (rows.length > 20) {
      display = rows.filter((_, i) => i % 2 === 0 || rows[i].gap_pct < 5 || rows[i].gap_pct > 40);
    }

    y.domain(display.map((d) => String(d.year)));

    barsG.selectAll('*').remove();
    thresholdLayer.selectAll('*').remove();

    // Threshold reference lines
    const thresholds = [
      { pct: 5,  label: 'Tight (<5%)',   color: '#4caf50' },
      { pct: 30, label: 'Dominant (>30%)', color: '#e8002d' },
    ];
    thresholds.forEach(({ pct, label, color }) => {
      const xv = x(pct);
      thresholdLayer.append('line')
        .attr('x1', xv).attr('x2', xv).attr('y1', 0).attr('y2', innerHeight)
        .attr('stroke', color).attr('stroke-width', 1).attr('stroke-dasharray', '4 3').attr('opacity', 0.4);
      thresholdLayer.append('text')
        .attr('x', xv + 3).attr('y', -4)
        .attr('fill', color).attr('font-size', 8).attr('opacity', 0.7)
        .text(label);
    });

    const selectedConstructors = currentState.selectedConstructors;

    // Bars
    barsG.selectAll('rect').data(display, (d) => d.year).join('rect')
      .attr('x', 0)
      .attr('y', (d) => y(String(d.year)))
      .attr('width', (d) => x(d.gap_pct))
      .attr('height', y.bandwidth())
      .attr('fill', (d) => d.color)
      .attr('rx', 3)
      .attr('opacity', (d) =>
        selectedConstructors.length && !selectedConstructors.includes(d.champion_constructor) ? 0.15 : 0.88,
      )
      .on('mousemove', (event, d) => {
        showTooltip(
          context.tooltip,
          `<strong>${d.year} Championship</strong><br>` +
          `🏆 ${d.champion} (${d.champion_constructor})<br>` +
          `${d.champion_pts} pts<br>` +
          `2nd: ${d.runner_up} — ${d.runner_pts} pts<br>` +
          `Gap: ${d.gap} pts (${d.gap_pct}%)`,
          event.clientX, event.clientY,
        );
      })
      .on('mouseleave', () => hideTooltip(context.tooltip))
      .on('click', (event, d) => {
        event.stopPropagation();
        context.emit('constructorSelected', { selectedConstructors: [d.champion_constructor] });
      });

    // Champion name label to the right of bar
    barsG.selectAll('text.champ-label').data(display, (d) => d.year).join('text')
      .attr('class', 'champ-label')
      .attr('x', (d) => x(d.gap_pct) + 5)
      .attr('y', (d) => y(String(d.year)) + y.bandwidth() / 2 + 3.5)
      .attr('fill', (d) => d.color)
      .attr('font-size', Math.min(9, y.bandwidth() - 2))
      .attr('opacity', (d) =>
        selectedConstructors.length && !selectedConstructors.includes(d.champion_constructor) ? 0.2 : 0.9,
      )
      .text((d) => {
        const parts = d.champion.split(' ');
        return parts[parts.length - 1]; // surname only to save space
      });

    xAxisG.call(d3.axisBottom(x).ticks(6).tickFormat((v) => `${v}%`));
    yAxisG.call(d3.axisLeft(y).tickSize(0).tickPadding(4));
    yAxisG.selectAll('text').attr('font-size', Math.min(9, y.bandwidth()));
  }

  on('*', render);
  render(context.state);
  return { update: render };
}

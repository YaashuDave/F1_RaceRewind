import { on } from '../brushing.js';
import { showTooltip, hideTooltip, unique } from '../utils/helpers.js';

export function createBumpChart(selector, dominance, context) {
  const container = d3.select(selector);
  container.html('');
  const years = unique((dominance.by_round || []).map((entry) => entry.year)).sort((a, b) => a - b);
  const defaultSeason = years[years.length - 1] || context.state.selectedSeason;
  const selectorWrap = container.append('div').style('display', 'flex').style('justify-content', 'flex-end').style('padding', '6px 10px 0 10px');
  selectorWrap.append('label').style('font-size', '0.72rem').style('color', '#a6a6a6').text('Season ');
  const seasonSelect = selectorWrap.append('select')
    .style('background', '#111').style('color', '#f0f0f0')
    .style('border', '1px solid #2f2f2f').style('border-radius', '8px').style('margin-left', '6px');
  years.forEach((year) => seasonSelect.append('option').attr('value', year).text(year));
  seasonSelect.property('value', defaultSeason);
  seasonSelect.on('change', () => context.emit('seasonSelected', { selectedSeason: Number(seasonSelect.property('value')) }));

  const width = container.node().clientWidth;
  const height = container.node().clientHeight - 30;
  const margin = { top: 10, right: 80, bottom: 24, left: 30 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const svg = container.append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio', 'xMidYMid meet');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Fix: domain [1,10] with range [0,innerHeight] → P1 maps to y=0 (top), P10 to y=innerHeight (bottom)
  const x = d3.scaleLinear().range([0, innerWidth]);
  const y = d3.scaleLinear().domain([1, 10]).range([0, innerHeight]);

  // Podium zone shading (P1–P3) drawn before lines so lines render on top
  const podiumZone = g.append('g');
  podiumZone.append('rect')
    .attr('x', 0).attr('y', 0)
    .attr('width', innerWidth).attr('height', y(3.5))
    .attr('fill', 'rgba(232, 0, 45, 0.05)').attr('rx', 3);
  podiumZone.append('text')
    .attr('x', innerWidth - 4).attr('y', y(3.5) - 3)
    .attr('text-anchor', 'end').attr('fill', 'rgba(232,0,45,0.35)').attr('font-size', 9)
    .text('PODIUM');

  const xAxis = g.append('g').attr('transform', `translate(0,${innerHeight})`);
  const yAxis = g.append('g');
  const lineLayer = g.append('g');

  // Axis labels
  g.append('text')
    .attr('x', innerWidth / 2).attr('y', innerHeight + 20)
    .attr('text-anchor', 'middle').attr('fill', '#a6a6a6').attr('font-size', 10)
    .text('Race Round');
  g.append('text')
    .attr('transform', 'rotate(-90)').attr('x', -innerHeight / 2).attr('y', -22)
    .attr('text-anchor', 'middle').attr('fill', '#a6a6a6').attr('font-size', 10)
    .text('Position');

  function render(currentState) {
    const season = currentState.selectedSeason || defaultSeason;
    const rows = (dominance.by_round || []).filter((entry) => Number(entry.year) === Number(season));
    if (!rows.length) return;
    seasonSelect.property('value', season);
    const latestRound = d3.max(rows, (d) => d.round) || 1;
    const topConstructors = unique(
      rows.filter((entry) => entry.round === latestRound)
        .sort((a, b) => a.position - b.position)
        .slice(0, 10)
        .map((entry) => entry.constructor),
    );
    const filtered = rows.filter((entry) => topConstructors.includes(entry.constructor));
    x.domain([1, d3.max(filtered, (d) => d.round) || 1]);

    const line = d3.line()
      .x((d) => x(d.round))
      .y((d) => y(d.position))
      .curve(d3.curveCatmullRom.alpha(0.5));

    const grouped = d3.groups(filtered, (d) => d.constructor);
    lineLayer.selectAll('*').remove();
    grouped.forEach(([constructorName, values]) => {
      const sorted = values.sort((a, b) => a.round - b.round);
      const seriesColor = sorted[0].color || '#888888';
      const row = lineLayer.append('g').attr('class', 'bump-series');
      row.append('path')
        .datum(sorted)
        .attr('d', line)
        .attr('fill', 'none')
        .attr('stroke', seriesColor)
        .attr('stroke-width', 2)
        .attr('opacity', currentState.selectedConstructors.length && !currentState.selectedConstructors.includes(constructorName) ? 0.15 : 0.95)
        .on('mousemove', (event) => {
          // Show data for round closest to mouse cursor, not always the last round
          const mouseX = d3.pointer(event, g.node())[0];
          const hoveredRound = Math.round(x.invert(mouseX));
          const matchRow = sorted.reduce((best, r) =>
            Math.abs(r.round - hoveredRound) < Math.abs(best.round - hoveredRound) ? r : best, sorted[0]);
          showTooltip(
            context.tooltip,
            `<strong>${constructorName}</strong><br>Round ${matchRow.round} &bull; P${matchRow.position}<br>${matchRow.points} pts`,
            event.clientX,
            event.clientY,
          );
          context.emit('highlighted', { highlightedConstructor: constructorName });
        })
        .on('mouseleave', () => {
          hideTooltip(context.tooltip);
          context.emit('highlighted', { highlightedConstructor: null });
        })
        .on('click', (event) => {
          event.stopPropagation();
          context.emit('constructorSelected', { selectedConstructors: [constructorName] });
        });

      row.selectAll('circle').data(sorted).join('circle')
        .attr('cx', (d) => x(d.round))
        .attr('cy', (d) => y(d.position))
        .attr('r', 2.5)
        .attr('fill', seriesColor);

      const last = sorted[sorted.length - 1];
      row.append('text')
        .attr('x', x(last.round) + 6)
        .attr('y', y(last.position) + 3)
        .attr('fill', seriesColor)
        .attr('font-size', 10)
        .attr('font-weight', 600)
        .text(constructorName);
    });

    xAxis.call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('d')));
    yAxis.call(d3.axisLeft(y).tickValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  }

  on('*', render);
  render(context.state);
  return { update: render };
}

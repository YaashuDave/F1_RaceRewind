import { on } from '../brushing.js';
import { showTooltip, hideTooltip } from '../utils/helpers.js';


export function createBarChart(selector, source, context) {
  const container = d3.select(selector);
  container.html('');
  const width = container.node().clientWidth;
  const height = container.node().clientHeight;
  const margin = { top: 22, right: 42, bottom: 36, left: 84 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const svg = container.append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio', 'xMidYMid meet');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Data note
  svg.append('text')
    .attr('x', margin.left).attr('y', 13)
    .attr('fill', '#555').attr('font-size', 9)
    .text('2011+ only · sorted fastest avg stop');

  // Y axis label
  g.append('text')
    .attr('transform', 'rotate(-90)').attr('x', -innerHeight / 2).attr('y', -68)
    .attr('text-anchor', 'middle').attr('fill', '#a6a6a6').attr('font-size', 10)
    .text('Avg Stop Duration (s)');

  // Secondary Y axis label (stops/race dot series)
  g.append('text')
    .attr('transform', `translate(${innerWidth + 36},${innerHeight / 2}) rotate(90)`)
    .attr('text-anchor', 'middle').attr('fill', '#a6a6a6').attr('font-size', 10)
    .text('Avg Stops / Race');

  const x = d3.scaleBand().padding(0.22).range([0, innerWidth]);
  const y = d3.scaleLinear().range([innerHeight, 0]);
  const ySecondary = d3.scaleLinear().range([innerHeight, 0]);
  const xAxis = g.append('g').attr('transform', `translate(0,${innerHeight})`);
  const yAxis = g.append('g');
  const secondaryAxis = g.append('g').attr('transform', `translate(${innerWidth},0)`);
  const barsLayer = g.append('g');
  const dotsLayer = g.append('g');

  function render(currentState) {
    const filtered = source.data.filter((entry) => entry.year >= currentState.yearRange[0] && entry.year <= currentState.yearRange[1]);
    const selectedCircuit = currentState.selectedCircuit;
    const seasonal = selectedCircuit ? filtered.filter((entry) => entry.circuit_id === selectedCircuit) : filtered;
    const summary = d3.rollups(
      seasonal,
      (values) => ({
        constructor: values[0].constructor,
        color: values[0].color,
        avg_duration_sec: d3.mean(values, (v) => Number(v.avg_duration_sec)),
        total_stops: d3.sum(values, (v) => Number(v.total_stops)),
        avg_stops_per_race: d3.mean(values, (v) => Number(v.avg_stops_per_race)),
      }),
      (d) => d.constructor,
    )
      .map(([, value]) => value)
      // Require at least 10 stops for reliable average, then sort fastest-first
      .filter((entry) => entry.avg_duration_sec != null && !isNaN(entry.avg_duration_sec) && entry.total_stops >= 10)
      .sort((a, b) => a.avg_duration_sec - b.avg_duration_sec)
      .slice(0, 10);

    if (!summary.length) return;

    x.domain(summary.map((entry) => entry.constructor));
    y.domain([0, (d3.max(summary, (entry) => entry.avg_duration_sec) || 1) * 1.1]).nice();
    ySecondary.domain([0, (d3.max(summary, (entry) => entry.avg_stops_per_race) || 1) * 1.2]).nice();

    barsLayer.selectAll('*').remove();
    dotsLayer.selectAll('*').remove();

    barsLayer.selectAll('rect').data(summary, (d) => d.constructor).join('rect')
      .attr('x', (d) => x(d.constructor))
      .attr('y', (d) => y(d.avg_duration_sec))
      .attr('width', x.bandwidth())
      .attr('height', (d) => innerHeight - y(d.avg_duration_sec))
      .attr('fill', (d) => d.color)
      .attr('opacity', (d) => (currentState.selectedConstructors.length && !currentState.selectedConstructors.includes(d.constructor) ? 0.15 : 0.88))
      .on('mousemove', (event, d) => {
        showTooltip(
          context.tooltip,
          `<strong>${d.constructor}</strong><br>Avg stop: ${Number(d.avg_duration_sec).toFixed(2)}s<br>Total stops: ${Number(d.total_stops).toFixed(0)}<br>Stops/race: ${Number(d.avg_stops_per_race).toFixed(2)}`,
          event.clientX,
          event.clientY,
        );
      })
      .on('mouseleave', () => hideTooltip(context.tooltip))
      .on('click', (event, d) => {
        event.stopPropagation();
        context.emit('constructorSelected', { selectedConstructors: [d.constructor] });
      });

    dotsLayer.selectAll('circle').data(summary, (d) => d.constructor).join('circle')
      .attr('cx', (d) => x(d.constructor) + x.bandwidth() / 2)
      .attr('cy', (d) => ySecondary(d.avg_stops_per_race))
      .attr('r', 4)
      .attr('fill', '#f0f0f0')
      .attr('opacity', 0.85);

    // Value labels above bars
    barsLayer.selectAll('text').data(summary, (d) => d.constructor).join('text')
      .attr('x', (d) => x(d.constructor) + x.bandwidth() / 2)
      .attr('y', (d) => y(d.avg_duration_sec) - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', 'white')
      .attr('font-size', 10)
      .text((d) => Number(d.avg_duration_sec).toFixed(2));

    xAxis.call(d3.axisBottom(x)).selectAll('text').attr('transform', 'rotate(-25)').style('text-anchor', 'end');
    yAxis.call(d3.axisLeft(y).ticks(4).tickFormat((v) => `${v.toFixed(1)}s`));
    secondaryAxis.call(d3.axisRight(ySecondary).ticks(4));
  }

  on('*', render);
  render(context.state);
  return { update: render };
}

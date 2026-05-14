import { on } from '../brushing.js';
import { showTooltip, hideTooltip, unique } from '../utils/helpers.js';

// Axes chosen for maximum data coverage and analytical clarity:
// - points_per_race, podium_rate, win_rate, dnf_rate come from results.csv (complete 1950-2024)
// - avg_grid_pos comes from results.grid (99% coverage post-1980)
// Replaced avg_lap_delta_sec (null pre-1996) and quali_gap_sec (null pre-2006)
const dimensions = [
  { key: 'points_per_race_norm', label: 'Points / Race' },
  { key: 'podium_rate_norm',     label: 'Podium Rate' },
  { key: 'win_rate_norm',        label: 'Win Rate' },
  { key: 'dnf_rate_norm',        label: 'DNF Rate' },
  { key: 'avg_grid_pos_norm',    label: 'Avg Grid Pos' },
];

export function createParallelCoords(selector, source, context) {
  const container = d3.select(selector);
  container.html('');
  const width = container.node().clientWidth;
  const height = container.node().clientHeight;
  const margin = { top: 20, right: 16, bottom: 14, left: 16 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const svg = container.append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio', 'xMidYMid meet');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  let order = dimensions.map((dimension) => dimension.key);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);
  const x = d3.scalePoint().domain(order).range([0, innerWidth]).padding(0.5);
  const axisGroups = g.append('g');
  const lineLayer = g.append('g');
  const brushSelections = new Map();

  function pathFor(entry) {
    const points = order.map((key) => [x(key), y(Number.isFinite(entry[key]) ? entry[key] : 0.5)]);
    return d3.line().curve(d3.curveMonotoneX)(points) || '';
  }

  function filteredRows(currentState) {
    return source.data.filter((entry) => {
      const inRange = entry.year >= currentState.yearRange[0] && entry.year <= currentState.yearRange[1];
      const constructorMatch = !currentState.selectedConstructors.length || currentState.selectedConstructors.includes(entry.constructor);
      const driverMatch = !currentState.selectedDrivers.length || currentState.selectedDrivers.includes(entry.driver);
      if (!inRange || !constructorMatch || !driverMatch) return false;
      for (const [key, selection] of brushSelections.entries()) {
        if (!selection) continue;
        const value = entry[key];
        if (value < selection[0] || value > selection[1]) return false;
      }
      return true;
    });
  }

  function render(currentState) {
    x.domain(order);
    const rows = filteredRows(currentState);
    lineLayer.selectAll('*').remove();
    axisGroups.selectAll('*').remove();

    const lines = lineLayer.selectAll('path').data(rows, (d) => `${d.driver}-${d.year}`);
    lines.join('path')
      .attr('d', pathFor)
      .attr('fill', 'none')
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 1.4)
      .attr('opacity', (d) => {
        if (currentState.selectedConstructors.length) return currentState.selectedConstructors.includes(d.constructor) ? 0.95 : 0.05;
        return 0.5;
      })
      .on('mousemove', (event, d) => {
        showTooltip(
          context.tooltip,
          `<strong>${d.driver}</strong><br>${d.constructor} (${d.year})<br>` +
          `Points/race: ${Number(d.points_per_race).toFixed(2)}<br>` +
          `Podium rate: ${(Number(d.podium_rate) * 100).toFixed(1)}%<br>` +
          `Win rate: ${(Number(d.win_rate) * 100).toFixed(1)}%<br>` +
          `DNF rate: ${(Number(d.dnf_rate) * 100).toFixed(1)}%<br>` +
          `Avg grid pos: ${Number(d.avg_grid_pos).toFixed(1)}`,
          event.clientX, event.clientY,
        );
      })
      .on('mouseleave', () => hideTooltip(context.tooltip));

    order.forEach((key) => {
      const axis = axisGroups.append('g').attr('transform', `translate(${x(key)},0)`);
      axis.append('g').attr('class', 'axis').call(d3.axisLeft(y).ticks(4));
      const dim = dimensions.find((dimension) => dimension.key === key);
      const label = axis.append('text')
        .attr('y', -6)
        .attr('text-anchor', 'middle')
        .attr('fill', 'white')
        .attr('font-size', 10)
        .attr('font-weight', 600)
        .style('cursor', 'grab')
        .style('user-select', 'none')
        .text(dim?.label || key);
      const brush = d3.brushY().extent([[-12, 0], [12, innerHeight]]).on('brush end', (event) => {
        brushSelections.set(key, event.selection ? event.selection.map(y.invert).sort((a, b) => a - b) : null);
        const selectedDrivers = unique(filteredRows(currentState).map((row) => row.driver));
        context.emit('driversSelected', { selectedDrivers });
      });
      axis.append('g').call(brush);
      label.call(d3.drag()
        .on('start', function () { d3.select(this).style('cursor', 'grabbing'); })
        .on('drag', (event) => {
          const [pointerX] = d3.pointer(event.sourceEvent, axisGroups.node());
          let nearest = key;
          let minDist = Math.abs(pointerX - x(key));
          order.forEach((dimension) => {
            const distance = Math.abs(pointerX - x(dimension));
            if (distance < minDist) { minDist = distance; nearest = dimension; }
          });
          if (nearest !== key) {
            order = order.filter((dimension) => dimension !== key);
            order.splice(order.indexOf(nearest), 0, key);
            x.domain(order);
            render(currentState);
          }
        })
        .on('end', function () { d3.select(this).style('cursor', 'grab'); }));
    });
  }

  on('*', render);
  render(context.state);
  return { update: render };
}

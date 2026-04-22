import { on } from '../brushing.js';
import { showTooltip, hideTooltip } from '../utils/helpers.js';

export async function createGeoMap(selector, data, context) {
  const container = d3.select(selector);
  container.html('');
  const width = container.node().clientWidth;
  const height = container.node().clientHeight;
  const margin = { top: 12, right: 12, bottom: 12, left: 12 };
  const svg = container.append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio', 'xMidYMid meet');
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  const mapWidth = width - margin.left - margin.right;
  const mapHeight = height - margin.top - margin.bottom;
  const projection = d3.geoNaturalEarth1().fitSize([mapWidth, mapHeight], { type: 'Sphere' });
  const path = d3.geoPath(projection);
  const world = await d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
  const countries = topojson.feature(world, world.objects.countries).features;
  const circuitData = data.circuits || [];

  const worldGroup = g.append('g');
  worldGroup.append('rect').attr('class', 'map-bg').attr('width', mapWidth).attr('height', mapHeight).attr('fill', '#0a0a14').attr('rx', 12).on('click', () => context.emit('circuitSelected', { selectedCircuit: null, selectedRace: null }));
  const countryGroup = worldGroup.append('g');
  countryGroup.selectAll('path').data(countries).join('path')
    .attr('d', path)
    .attr('fill', '#1a1a2e')
    .attr('stroke', '#2a2a3e')
    .attr('stroke-width', 0.5);

  const markerGroup = worldGroup.append('g');
  const zoom = d3.zoom().scaleExtent([0.8, 6]).on('zoom', (event) => {
    worldGroup.attr('transform', event.transform);
  });
  svg.call(zoom).on('click', (event) => {
    if (event.target === svg.node()) {
      context.emit('circuitSelected', { selectedCircuit: null, selectedRace: null });
    }
  });

  function render(currentState) {
    const highlighted = currentState.selectedCircuit;
    const selectedConstructors = currentState.selectedConstructors;
    const filtered = circuitData.filter((circuit) => circuit.total_races > 0);
    const markers = markerGroup.selectAll('circle').data(filtered, (d) => d.id);

    markers.join(
      (enter) => enter.append('circle')
        .attr('cx', (d) => projection([d.lng, d.lat])[0])
        .attr('cy', (d) => projection([d.lng, d.lat])[1])
        .attr('r', 5)
        .attr('fill', '#e8002d')
        .attr('stroke', 'white')
        .attr('stroke-width', 0.5)
        .on('mousemove', (event, d) => {
          showTooltip(context.tooltip, `<strong>${d.name}</strong><br>${d.country}<br>Total races: ${d.total_races}<br>${d.first_year} - ${d.last_year}`, event.clientX, event.clientY);
        })
        .on('mouseleave', () => hideTooltip(context.tooltip))
        .on('click', (event, d) => {
          event.stopPropagation();
          context.emit('circuitSelected', { selectedCircuit: d.id, selectedRace: null });
        }),
      (update) => update,
      (exit) => exit.remove(),
    )
      .attr('cx', (d) => projection([d.lng, d.lat])[0])
      .attr('cy', (d) => projection([d.lng, d.lat])[1])
      .attr('fill', (d) => (highlighted && highlighted !== d.id ? 'rgba(232,0,45,0.24)' : '#e8002d'))
      .attr('opacity', (d) => {
        if (highlighted) return highlighted === d.id ? 1 : 0.3;
        if (selectedConstructors.length) {
          const leaders = d.win_leaders.map((entry) => entry.constructor);
          return leaders.some((leader) => selectedConstructors.includes(leader)) ? 1 : 0.35;
        }
        return 1;
      })
      .attr('r', (d) => (highlighted === d.id ? 9 : 5));
  }

  on('*', render);
  render(context.state);
  return { update: render };
}

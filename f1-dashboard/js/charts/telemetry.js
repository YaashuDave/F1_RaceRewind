export function renderTelemetryPlaceholder(selector) {
  const container = d3.select(selector);
  container.html('');
  const width = container.node().clientWidth;
  const height = container.node().clientHeight;
  const svg = container.append('svg').attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio', 'xMidYMid meet');
  const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);
  g.append('rect').attr('class', 'coming-soon-box').attr('x', -120).attr('y', -80).attr('width', 240).attr('height', 160).attr('rx', 16);
  g.append('text').attr('class', 'coming-soon-text').attr('text-anchor', 'middle').attr('y', -40).attr('font-size', 18).attr('font-weight', 800).text('Telemetry Overlay');
  g.append('text').attr('class', 'coming-soon-text').attr('text-anchor', 'middle').attr('y', 18).attr('font-size', 12).attr('font-style', 'italic').text('Select a race and two drivers to compare traces');
  g.append('text').attr('class', 'coming-soon-text').attr('text-anchor', 'middle').attr('y', 48).attr('font-size', 12).text('Powered by FastF1');
}

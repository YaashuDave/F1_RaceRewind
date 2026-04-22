import { emit, on } from './brushing.js';
import { state } from './state.js';
import { constructorColor } from './utils/colors.js'; // used by updateConstructorList
import { unique } from './utils/helpers.js';
import { createGeoMap } from './charts/geomap.js';
import { createHeatmap } from './charts/heatmap.js';
import { createBumpChart } from './charts/bumpchart.js';
import { createParallelCoords } from './charts/parallelcoords.js';
import { createReliabilityChart } from './charts/reliability.js';
import { createChampBattles } from './charts/champbattles.js';

const tooltip = document.getElementById('tooltip');
const loadingOverlay = document.getElementById('loadingOverlay');
const telemetryPanel = document.getElementById('telemetryPanel');
const insightTitle = document.getElementById('insightTitle');
const insightBody = document.getElementById('insightBody');
const insightModal = document.getElementById('insightModal');
const insightModalTitle = document.getElementById('insightModalTitle');
const insightModalBody = document.getElementById('insightModalBody');

function openInsightModal() {
  insightModalTitle.textContent = insightTitle.textContent;
  insightModalBody.innerHTML = insightBody.innerHTML;
  insightModal.classList.remove('hidden');
}
function closeInsightModal() {
  insightModal.classList.add('hidden');
}
document.querySelector('.insight-card').addEventListener('click', openInsightModal);
document.getElementById('insightModalClose').addEventListener('click', closeInsightModal);
document.querySelector('.insight-modal-backdrop').addEventListener('click', closeInsightModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeInsightModal(); });

function fetchJson(path) {
  return fetch(path).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`);
    }
    return response.json();
  });
}

function setSeasonReadout() {
  document.getElementById('seasonRangeLabel').textContent = `${state.yearRange[0]} to ${state.yearRange[1]}`;
  document.getElementById('minSeasonLabel').textContent = String(state.yearRange[0]);
  document.getElementById('maxSeasonLabel').textContent = String(state.yearRange[1]);
  document.getElementById('yearMin').value = String(state.yearRange[0]);
  document.getElementById('yearMax').value = String(state.yearRange[1]);
}

function renderInsights(circuits, dominance, qualiVsFinish, pitStops, driverMetrics) {
  const seasonFilteredConstructors = dominance.by_season.filter(
    (entry) => entry.year >= state.yearRange[0] && entry.year <= state.yearRange[1],
  );
  const activeConstructors = state.selectedConstructors.length
    ? state.selectedConstructors
    : unique(seasonFilteredConstructors.map((entry) => entry.constructor));
  const constructorSummary = new Map();
  seasonFilteredConstructors.forEach((entry) => {
    if (!activeConstructors.includes(entry.constructor)) return;
    const current = constructorSummary.get(entry.constructor) || { points: 0, wins: 0 };
    current.points += Number(entry.total_points || 0);
    current.wins += Number(entry.wins || 0);
    constructorSummary.set(entry.constructor, current);
  });
  const topConstructor = [...constructorSummary.entries()].sort((a, b) => b[1].points - a[1].points)[0];

  const driverRows = driverMetrics.data.filter(
    (entry) =>
      entry.year >= state.yearRange[0] &&
      entry.year <= state.yearRange[1] &&
      (!state.selectedConstructors.length || state.selectedConstructors.includes(entry.constructor)) &&
      (!state.selectedDrivers.length || state.selectedDrivers.includes(entry.driver)),
  );
  const bestDriver = [...driverRows].sort((a, b) => (Number(b.points_per_race) || 0) - (Number(a.points_per_race) || 0))[0];

  const qualiRows = qualiVsFinish.data.filter(
    (entry) =>
      entry.year >= state.yearRange[0] &&
      entry.year <= state.yearRange[1] &&
      (!state.selectedConstructors.length || state.selectedConstructors.includes(entry.constructor)) &&
      (!state.selectedDrivers.length || state.selectedDrivers.includes(entry.driver)) &&
      (!state.selectedCircuit || entry.circuit_key === state.selectedCircuit),
  );
  const avgGain = qualiRows.length ? d3.mean(qualiRows, (d) => Number(d.grid) - Number(d.finish)) : null;
  const bestMover = [...qualiRows].reduce((best, row) => {
    const gain = Number(row.grid) - Number(row.finish);
    if (!Number.isFinite(gain)) return best;
    if (!best || gain > best.gain) return { row, gain };
    return best;
  }, null);

  const pitRows = pitStops.data.filter(
    (entry) =>
      entry.year >= state.yearRange[0] &&
      entry.year <= state.yearRange[1] &&
      entry.avg_duration_sec != null &&
      !isNaN(entry.avg_duration_sec) &&
      (!state.selectedCircuit || entry.circuit_id === state.selectedCircuit),
  );
  const sortedPit = d3.rollups(
    pitRows,
    (vals) => ({ constructor: vals[0].constructor, avg: d3.mean(vals, (v) => Number(v.avg_duration_sec)) }),
    (d) => d.constructor,
  )
    .map(([, v]) => v)
    .sort((a, b) => a.avg - b.avg);
  const pitLeader = sortedPit[0];
  const pitSecond = sortedPit[1];

  const totalRacesInRange = new Set(qualiRows.map((d) => `${d.year}-${d.round}`)).size;
  const winPctText = topConstructor && totalRacesInRange > 0
    ? ` (${((topConstructor[1].wins / totalRacesInRange) * 100).toFixed(0)}% of ${totalRacesInRange} races)`
    : '';

  insightTitle.textContent = state.selectedCircuit ? 'Circuit focus' : 'Range summary';
  insightBody.innerHTML = [
    topConstructor
      ? `<div><strong>${topConstructor[0]}</strong> leads — ${Math.round(topConstructor[1].points).toLocaleString()} pts, ${topConstructor[1].wins} win${topConstructor[1].wins !== 1 ? 's' : ''}${winPctText}.</div>`
      : '<div>No constructor data in range.</div>',
    bestDriver
      ? `<div><strong>${bestDriver.driver}</strong> (${bestDriver.constructor}): ${Number(bestDriver.points_per_race).toFixed(2)} pts/race, ${(Number(bestDriver.win_rate) * 100).toFixed(1)}% win rate.</div>`
      : '<div>No driver metrics for selection.</div>',
    avgGain != null
      ? `<div>Avg field gain: <strong>${avgGain >= 0 ? '+' : ''}${avgGain.toFixed(2)} pos/race</strong>${bestMover ? ` — best: ${bestMover.row.driver} +${bestMover.gain} at ${bestMover.row.race}` : ''}.</div>`
      : '<div>No qualifying-to-finish data.</div>',
    pitLeader
      ? `<div>Fastest pit crew: <strong>${pitLeader.constructor}</strong> ${pitLeader.avg.toFixed(2)}s${pitSecond ? ` · 2nd: ${pitSecond.constructor} ${pitSecond.avg.toFixed(2)}s` : ''}.</div>`
      : '<div>No pit stop data for selection.</div>',
  ].join('');

  // Keep modal in sync if it's open
  if (insightModal && !insightModal.classList.contains('hidden')) {
    insightModalTitle.textContent = insightTitle.textContent;
    insightModalBody.innerHTML = insightBody.innerHTML;
  }
}

function updateConstructorList(constructors) {
  const list = document.getElementById('constructorList');
  list.innerHTML = '';
  constructors.forEach((constructor) => {
    const chip = document.createElement('label');
    chip.className = 'constructor-chip';
    chip.dataset.constructor = constructor;
    chip.innerHTML = `<span class="dot" style="background:${constructorColor(constructor)}"></span><span>${constructor}</span>`;
    chip.addEventListener('click', () => {
      const next = new Set(state.selectedConstructors);
      if (next.has(constructor)) {
        next.delete(constructor);
      } else {
        next.add(constructor);
      }
      emit('constructorSelected', { selectedConstructors: [...next] });
    });
    list.appendChild(chip);
  });
}

function updateConstructorHighlights() {
  document.querySelectorAll('.constructor-chip').forEach((chip) => {
    chip.classList.toggle('active', state.selectedConstructors.length === 0 || state.selectedConstructors.includes(chip.dataset.constructor));
  });
}

function updateSelectedDriversView(allDrivers) {
  const selected = document.getElementById('selectedDrivers');
  const suggestions = document.getElementById('driverSuggestions');
  selected.innerHTML = '';
  state.selectedDrivers.forEach((driver) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `<span>${driver}</span><button type="button" aria-label="Remove ${driver}">×</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      emit('driversSelected', { selectedDrivers: state.selectedDrivers.filter((value) => value !== driver) });
    });
    selected.appendChild(chip);
  });

  const query = document.getElementById('driverSearch').value.trim().toLowerCase();
  const matches = allDrivers.filter((driver) => driver.toLowerCase().includes(query)).slice(0, 12);
  suggestions.innerHTML = '';
  matches.forEach((driver) => {
    const button = document.createElement('button');
    button.className = 'suggestion';
    button.type = 'button';
    button.textContent = driver;
    button.addEventListener('click', () => {
      if (!state.selectedDrivers.includes(driver)) {
        emit('driversSelected', { selectedDrivers: [...state.selectedDrivers, driver] });
      }
    });
    suggestions.appendChild(button);
  });
}

function wireControls(allConstructors, allDrivers) {
  const yearMin = document.getElementById('yearMin');
  const yearMax = document.getElementById('yearMax');
  const driverSearch = document.getElementById('driverSearch');

  yearMin.addEventListener('input', () => {
    const minYear = Math.min(Number(yearMin.value), Number(yearMax.value));
    emit('yearRangeChanged', { yearRange: [minYear, Number(yearMax.value)] });
  });

  yearMax.addEventListener('input', () => {
    const maxYear = Math.max(Number(yearMin.value), Number(yearMax.value));
    emit('yearRangeChanged', { yearRange: [Number(yearMin.value), maxYear] });
  });

  driverSearch.addEventListener('input', () => updateSelectedDriversView(allDrivers));

  document.getElementById('resetFilters').addEventListener('click', () => {
    emit('reset', {
      yearRange: [1950, 2025],
      selectedConstructors: [],
      selectedDrivers: [],
      selectedCircuit: null,
      selectedRace: null,
      highlightedConstructor: null,
      selectedSeason: state.selectedSeason,
    });
    updateSelectedDriversView(allDrivers);
  });

  document.getElementById('telemetryBtn').addEventListener('click', () => {
    emit('telemetryToggle', { telemetryOpen: true });
    telemetryPanel.classList.remove('hidden');
  });

  document.getElementById('telemetryClose').addEventListener('click', () => {
    emit('telemetryToggle', { telemetryOpen: false });
    telemetryPanel.classList.add('hidden');
  });

  setSeasonReadout();
  updateConstructorList(allConstructors);
  updateSelectedDriversView(allDrivers);
}

async function main() {
  const [circuits, dominance, qualiVsFinish, pitStops, driverMetrics, reliability, champBattles] = await Promise.all([
    fetchJson('./data/processed/circuits.json'),
    fetchJson('./data/processed/constructor_dominance.json'),
    fetchJson('./data/processed/quali_vs_finish.json'),
    fetchJson('./data/processed/pit_stops.json'),
    fetchJson('./data/processed/driver_metrics.json'),
    fetchJson('./data/processed/reliability.json'),
    fetchJson('./data/processed/championship_battles.json'),
  ]);

  const constructorTotals = new Map();
  dominance.by_season.forEach((entry) => {
    constructorTotals.set(entry.constructor, (constructorTotals.get(entry.constructor) || 0) + Number(entry.total_points || 0));
  });
  const constructors = unique(dominance.by_season.map((entry) => entry.constructor))
    .sort((left, right) => (constructorTotals.get(right) || 0) - (constructorTotals.get(left) || 0) || left.localeCompare(right));
  const drivers = unique(driverMetrics.data.map((entry) => entry.driver)).sort();
  const seasons = unique(dominance.by_season.map((entry) => Number(entry.year))).sort((a, b) => a - b);
  const minYear = seasons[0] ?? 1950;
  const maxYear = seasons[seasons.length - 1] ?? 2025;
  state.yearRange = [minYear, maxYear];
  state.selectedSeason = maxYear;
  setSeasonReadout();
  wireControls(constructors, drivers);

  const chartContext = { tooltip, emit, state };
  await createGeoMap('#geomap', circuits, chartContext);
  createHeatmap('#streamgraph', dominance, chartContext);
  createBumpChart('#bumpchart', dominance, chartContext);
  createChampBattles('#scatterplot', champBattles, chartContext);
  createParallelCoords('#parallelcoords', driverMetrics, chartContext);
  createReliabilityChart('#barchart', reliability, chartContext);

  on('*', () => {
    setSeasonReadout();
    updateConstructorHighlights();
    updateSelectedDriversView(drivers);
    renderInsights(circuits, dominance, qualiVsFinish, pitStops, driverMetrics);
  });

  updateConstructorHighlights();
  renderInsights(circuits, dominance, qualiVsFinish, pitStops, driverMetrics);
  loadingOverlay.classList.add('hidden');
}

main().catch((error) => {
  loadingOverlay.innerHTML = `<div class="loading-card"><div class="loading-title">Failed to load dashboard</div><div class="loading-subtitle">${error.message}</div></div>`;
  console.error(error);
});

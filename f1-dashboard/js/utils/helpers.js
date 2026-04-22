import { constructorColor } from './colors.js';

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function formatSeconds(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return `${Number(value).toFixed(digits)}s`;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
}

export function getColor(name) {
  return constructorColor(name);
}

export function minMaxNormalize(values) {
  const numeric = values.filter((value) => Number.isFinite(value));
  if (!numeric.length) return values.map(() => 0.5);
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const span = max - min || 1;
  return values.map((value) => (Number.isFinite(value) ? (value - min) / span : 0.5));
}

export function parseSeconds(timeString) {
  if (!timeString || timeString === '\\N') return null;
  const parts = String(timeString).split(':');
  if (parts.length === 2) {
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  return Number(timeString);
}

export function showTooltip(tooltip, html, x, y) {
  tooltip.innerHTML = html;
  tooltip.classList.remove('hidden');
  const rect = tooltip.getBoundingClientRect();
  const padding = 14;
  const left = clamp(x + 14, padding, window.innerWidth - rect.width - padding);
  const top = clamp(y + 14, padding, window.innerHeight - rect.height - padding);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function hideTooltip(tooltip) {
  tooltip.classList.add('hidden');
}

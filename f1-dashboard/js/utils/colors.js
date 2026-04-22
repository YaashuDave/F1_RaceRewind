export const constructorColors = {
  'mercedes': '#00d2be',
  'ferrari': '#dc0000',
  'red bull': '#1e41ff',
  'mclaren': '#ff8700',
  'alpine': '#0090ff',
  'alpine f1 team': '#0090ff',
  'aston martin': '#006f62',
  'aston martin aramco cognizant f1 team': '#006f62',
  'williams': '#005aff',
  'haas f1 team': '#b6babd',
  'haas': '#b6babd',
  'rb': '#6692ff',
  'racing bulls': '#6692ff',
  'alphatauri': '#2b4562',
  'alpha tauri': '#2b4562',
  'alpharomeo': '#900000',
  'alfa romeo': '#900000',
  'kick sauber': '#52e252',
  'sauber': '#52e252',
  'lotus': '#000000',
  'renault': '#fff500',
  'force india': '#f596c8',
  'racing point': '#f596c8',
  'brawn gp': '#d6c799',
  'toyota': '#d4001a',
  'bmw sauber': '#0066cc',
  'honda': '#a8acb0',
  'jordan': '#006f3c',
  'benetton': '#006f62',
  'toro rosso': '#469bff',
  'red bull racing': '#1e41ff',
  'mini': '#888888',
};

export function constructorColor(name) {
  if (!name) return '#888888';
  const key = String(name).toLowerCase().replace(/\s+/g, ' ').trim();
  return constructorColors[key] || '#888888';
}

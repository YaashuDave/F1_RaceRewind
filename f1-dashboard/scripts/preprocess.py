from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
RAW_CANDIDATES = [ROOT / 'data' / 'raw', ROOT.parent / 'Data']
OUTPUT_DIR = ROOT / 'data' / 'processed'


def pick_raw_dir() -> Path:
    for candidate in RAW_CANDIDATES:
        if candidate.exists() and any(candidate.glob('*.csv')):
            return candidate
    raise FileNotFoundError('Could not find input CSVs in data/raw or ../Data')


def read_csv(raw_dir: Path, name: str, parse_dates: list[str] | None = None) -> pd.DataFrame:
    path = raw_dir / name
    return pd.read_csv(path, na_values=['\\N'], parse_dates=parse_dates, low_memory=False)


def slugify(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', str(value).lower()).strip('-')


def to_float(value):
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    try:
        return float(value)
    except Exception:
        return None


def parse_time_to_seconds(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    text = str(value)
    if text in {'', 'nan', 'NaT'}:
        return None
    if ':' in text:
        parts = text.split(':')
        if len(parts) == 2:
            return float(parts[0]) * 60 + float(parts[1])
        if len(parts) == 3:
            return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    try:
        return float(text)
    except Exception:
        return None


def best_lap_time(row) -> float | None:
    candidates = [row.get('q3'), row.get('q2'), row.get('q1')]
    for candidate in candidates:
        seconds = parse_time_to_seconds(candidate)
        if seconds is not None:
            return seconds
    return None


def min_max_normalize(values: list[float | None]) -> list[float | None]:
    numeric = [value for value in values if value is not None and math.isfinite(value)]
    if not numeric:
        return [None for _ in values]
    minimum = min(numeric)
    maximum = max(numeric)
    span = maximum - minimum if maximum != minimum else 1.0
    return [0.5 if value is None or not math.isfinite(value) else (value - minimum) / span for value in values]


CONSTRUCTOR_COLORS = {
    'Mercedes': '#00D2BE',
    'Ferrari': '#DC0000',
    'Red Bull': '#1E41FF',
    'McLaren': '#FF8700',
    'Alpine': '#0090FF',
    'Alpine F1 Team': '#0090FF',
    'Aston Martin': '#006F62',
    'Aston Martin Aramco Cognizant F1 Team': '#006F62',
    'Williams': '#005AFF',
    'Haas F1 Team': '#B6BABD',
    'RB': '#6692FF',
    'Racing Bulls': '#6692FF',
    'AlphaTauri': '#2B4562',
    'Alfa Romeo': '#900000',
    'Kick Sauber': '#52E252',
    'Sauber': '#52E252',
    'Lotus': '#000000',
    'Renault': '#FFF500',
    'Force India': '#F596C8',
    'Racing Point': '#F596C8',
    'Brawn GP': '#D6C799',
    'Toyota': '#D4001A',
    'BMW Sauber': '#0066CC',
    'Honda': '#A8ACB0',
    'Toro Rosso': '#469BFF',
    'Jordan': '#006F3C',
    'Benetton': '#006F62',
    'Jaguar': '#005C9E',
    'BAR': '#7C3F98',
    'Minardi': '#F3C300',
    'Stewart': '#005B94',
    'Ligier': '#2D6CC0',
    'Prost': '#0099C5',
    'Tyrrell': '#0A5E8E',
    'Maserati': '#009CFF',
    'Lotus F1': '#F4F000',
}


def constructor_color(name: str | None) -> str:
    if not name:
        return '#888888'
    return CONSTRUCTOR_COLORS.get(name, '#888888')


def ensure_output_dir() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def write_json(name: str, payload: dict) -> None:
    path = OUTPUT_DIR / name
    def sanitize(value):
        if isinstance(value, dict):
            return {key: sanitize(item) for key, item in value.items()}
        if isinstance(value, list):
            return [sanitize(item) for item in value]
        if isinstance(value, tuple):
            return [sanitize(item) for item in value]
        if isinstance(value, pd.Timestamp):
            return value.isoformat()
        if hasattr(value, 'item'):
            try:
                value = value.item()
            except Exception:
                pass
        try:
            if pd.isna(value):
                return None
        except Exception:
            pass
        return value

    path.write_text(json.dumps(sanitize(payload), indent=2, ensure_ascii=False, allow_nan=False), encoding='utf-8')


def build_circuits(races: pd.DataFrame, circuits: pd.DataFrame, results: pd.DataFrame, constructors: pd.DataFrame) -> dict:
    constructor_map = constructors[['constructorId', 'name']].copy()
    circuit_names = circuits[['circuitId', 'circuitRef', 'name', 'location', 'country', 'lat', 'lng']].copy()
    circuit_names = circuit_names.rename(columns={'name': 'circuit_name'})
    merged = races.merge(circuit_names, on='circuitId', how='left')
    wins = results.merge(races[['raceId', 'circuitId', 'year']], on='raceId', how='left')
    wins = wins[wins['positionOrder'].eq(1)].merge(constructor_map, on='constructorId', how='left')

    win_map = defaultdict(Counter)
    for _, row in wins.iterrows():
        if pd.notna(row.get('circuitId')) and pd.notna(row.get('name')):
            win_map[int(row['circuitId'])][row['name']] += 1

    circuits_payload = []
    for circuit_id, group in merged.groupby('circuitId'):
        circuit_row = group.iloc[0]
        records = wins.loc[wins['circuitId'].eq(circuit_id)]
        total_races = int(group['raceId'].nunique())
        first_year = int(group['year'].min()) if not group['year'].dropna().empty else None
        last_year = int(group['year'].max()) if not group['year'].dropna().empty else None
        leaders = [
            {'constructor': constructor, 'wins': int(count)}
            for constructor, count in win_map.get(int(circuit_id), Counter()).most_common(5)
        ]
        circuits_payload.append(
            {
                'id': slugify(circuit_row['circuit_name']) if pd.notna(circuit_row['circuit_name']) else str(circuit_id),
                'name': circuit_row['circuit_name'],
                'country': circuit_row['country'],
                'lat': to_float(circuit_row['lat']),
                'lng': to_float(circuit_row['lng']),
                'locality': circuit_row['location'],
                'total_races': total_races,
                'first_year': first_year,
                'last_year': last_year,
                'win_leaders': leaders,
            }
        )
    return {'circuits': circuits_payload}


def build_championship_battles(races: pd.DataFrame, driver_standings: pd.DataFrame, drivers: pd.DataFrame, results: pd.DataFrame, constructors: pd.DataFrame) -> dict:
    """Per-season championship battle: champion vs runner-up points gap."""
    standings = driver_standings.merge(races[['raceId', 'year', 'round']], on='raceId', how='left')
    standings['year'] = pd.to_numeric(standings['year'], errors='coerce')
    standings['round'] = pd.to_numeric(standings['round'], errors='coerce')
    standings['position'] = pd.to_numeric(standings['position'], errors='coerce')
    standings['points'] = pd.to_numeric(standings['points'], errors='coerce')

    last_rounds = standings.groupby('year')['round'].max().reset_index(name='last_round')
    final = standings.merge(last_rounds, on='year').query('round == last_round').copy()
    final = final.merge(drivers[['driverId', 'forename', 'surname']], on='driverId', how='left')
    final['driver_name'] = (final['forename'].fillna('') + ' ' + final['surname'].fillna('')).str.strip()

    # Most common constructor per driver-season for color
    dc = results.merge(races[['raceId', 'year']], on='raceId', how='left')
    dc['year'] = pd.to_numeric(dc['year'], errors='coerce')
    dc_mode = (dc.groupby(['year', 'driverId'])['constructorId']
               .agg(lambda s: s.mode().iloc[0] if len(s) > 0 else None)
               .reset_index()
               .merge(constructors[['constructorId', 'name']].rename(columns={'name': 'constructor'}), on='constructorId', how='left'))
    final = final.merge(dc_mode[['year', 'driverId', 'constructor']], on=['year', 'driverId'], how='left')

    payload = []
    for year, group in final.groupby('year'):
        p1 = group[group['position'] == 1]
        p2 = group[group['position'] == 2]
        if p1.empty:
            continue
        r1 = p1.iloc[0]
        champ_pts = float(r1['points']) if pd.notna(r1['points']) else 0.0
        champ_name = r1['driver_name']
        champ_con = r1['constructor'] if pd.notna(r1.get('constructor')) else ''
        runner_pts = float(p2.iloc[0]['points']) if not p2.empty and pd.notna(p2.iloc[0]['points']) else 0.0
        runner_name = p2.iloc[0]['driver_name'] if not p2.empty else ''
        gap = champ_pts - runner_pts
        gap_pct = round(gap / champ_pts * 100, 1) if champ_pts > 0 else 0.0
        payload.append({
            'year': int(year),
            'champion': champ_name,
            'champion_constructor': champ_con,
            'champion_pts': round(champ_pts, 1),
            'runner_up': runner_name,
            'runner_pts': round(runner_pts, 1),
            'gap': round(gap, 1),
            'gap_pct': gap_pct,
            'color': constructor_color(champ_con),
        })
    return {'data': sorted(payload, key=lambda r: r['year'])}


def build_constructor_dominance(races: pd.DataFrame, results: pd.DataFrame, constructors: pd.DataFrame, constructor_standings: pd.DataFrame) -> dict:
    results_named = results.merge(races[['raceId', 'year', 'round']], on='raceId', how='left').merge(constructors[['constructorId', 'name']], on='constructorId', how='left')
    results_named['points'] = pd.to_numeric(results_named['points'], errors='coerce').fillna(0)
    by_season = (
        results_named.groupby(['year', 'constructorId', 'name'], dropna=False)
        .agg(total_points=('points', 'sum'), wins=('positionOrder', lambda s: int((s == 1).sum())))
        .reset_index()
        .rename(columns={'name': 'constructor'})
    )
    by_season['color'] = by_season['constructor'].map(constructor_color)
    by_season = by_season.sort_values(['year', 'total_points'], ascending=[True, False])

    standings = constructor_standings.merge(races[['raceId', 'year', 'round']], on='raceId', how='left').merge(constructors[['constructorId', 'name']], on='constructorId', how='left')
    standings['points'] = pd.to_numeric(standings['points'], errors='coerce').fillna(0)
    standings['position'] = pd.to_numeric(standings['position'], errors='coerce')
    by_round = standings[['year', 'round', 'constructorId', 'name', 'points', 'position']].rename(columns={'name': 'constructor'}).copy()
    by_round['color'] = by_round['constructor'].map(constructor_color)
    by_round = by_round.sort_values(['year', 'round', 'position', 'constructor'])

    return {
        'by_season': by_season.to_dict(orient='records'),
        'by_round': by_round.to_dict(orient='records'),
    }


def build_quali_vs_finish(races: pd.DataFrame, qualifying: pd.DataFrame, results: pd.DataFrame, drivers: pd.DataFrame, constructors: pd.DataFrame) -> dict:
    constructors = constructors.rename(columns={'name': 'constructor'})
    races = races.rename(columns={'name': 'race'})
    circuit_names = read_csv(pick_raw_dir(), 'circuits.csv')[['circuitId', 'name']].rename(columns={'name': 'circuit'})
    merged = qualifying.merge(results, on=['raceId', 'driverId', 'constructorId'], how='inner', suffixes=('_quali', '_result'))
    merged = merged.merge(races[['raceId', 'year', 'round', 'race']], on='raceId', how='left')
    merged = merged.merge(read_csv(pick_raw_dir(), 'races.csv')[['raceId', 'circuitId']], on='raceId', how='left')
    merged = merged.merge(circuit_names, on='circuitId', how='left')
    merged = merged.merge(drivers[['driverId', 'driverRef', 'code', 'forename', 'surname']], on='driverId', how='left')
    merged = merged.merge(constructors[['constructorId', 'constructor']], on='constructorId', how='left')
    merged['grid'] = pd.to_numeric(merged['position_quali'], errors='coerce')
    merged['finish'] = pd.to_numeric(merged['positionOrder'], errors='coerce')
    merged['points'] = pd.to_numeric(merged['points'], errors='coerce').fillna(0)
    merged = merged[merged['grid'].notna() & merged['finish'].notna()].copy()
    merged['driver'] = merged['forename'].fillna('') + ' ' + merged['surname'].fillna('')
    merged['driver_code'] = merged['code'].fillna(merged['driverRef']).fillna('')
    merged['color'] = merged['constructor'].map(constructor_color)
    payload = []
    for _, row in merged.iterrows():
        payload.append(
            {
                'year': int(row['year']) if pd.notna(row['year']) else None,
                'round': int(row['round']) if pd.notna(row['round']) else None,
                'race': row['race'],
                'driver': row['driver'].strip(),
                'driver_code': row['driver_code'],
                'constructor': row['constructor'],
                'circuit_id': int(row['circuitId']) if pd.notna(row['circuitId']) else None,
                'circuit': row['circuit'],
                'circuit_key': slugify(row['circuit']) if pd.notna(row['circuit']) else None,
                'color': row['color'],
                'grid': int(row['grid']),
                'finish': int(row['finish']),
                'points': float(row['points']),
            }
        )
    return {'data': payload}


def build_pit_stops(races: pd.DataFrame, pit_stops: pd.DataFrame, results: pd.DataFrame, constructors: pd.DataFrame) -> dict:
    merged = pit_stops.merge(races[['raceId', 'year']], on='raceId', how='left')
    merged = merged.merge(results[['raceId', 'driverId', 'constructorId']], on=['raceId', 'driverId'], how='left')
    merged = merged.merge(constructors[['constructorId', 'name']].rename(columns={'name': 'constructor'}), on='constructorId', how='left')
    circuit_names = read_csv(pick_raw_dir(), 'circuits.csv')[['circuitId', 'name']].rename(columns={'name': 'circuit'})
    merged = merged.merge(read_csv(pick_raw_dir(), 'races.csv')[['raceId', 'circuitId']], on='raceId', how='left')
    merged = merged.merge(circuit_names, on='circuitId', how='left')
    merged = merged[pd.to_numeric(merged['year'], errors='coerce') >= 2011].copy()
    merged['milliseconds'] = pd.to_numeric(merged['milliseconds'], errors='coerce')
    race_counts = merged.groupby(['year', 'constructorId', 'constructor'])['raceId'].nunique().rename('race_count')
    summary = merged.groupby(['year', 'constructorId', 'constructor'], dropna=False).agg(avg_duration_sec=('milliseconds', lambda s: float(s.mean() / 1000.0) if len(s.dropna()) else None), total_stops=('milliseconds', 'count')).reset_index()
    summary = summary.merge(race_counts.reset_index(), on=['year', 'constructorId', 'constructor'], how='left')
    summary['avg_stops_per_race'] = summary['total_stops'] / summary['race_count'].replace(0, pd.NA)
    summary['color'] = summary['constructor'].map(constructor_color)
    circuit_lookup = merged.groupby(['year', 'constructorId', 'constructor']).agg(circuitId=('circuitId', 'first'), circuit=('circuit', 'first')).reset_index()
    summary = summary.merge(circuit_lookup, on=['year', 'constructorId', 'constructor'], how='left')
    summary['circuit_id'] = summary['circuit'].apply(lambda value: slugify(value) if pd.notna(value) else None)
    return {'data': summary.to_dict(orient='records')}


def best_qualifying_time(row: pd.Series) -> float | None:
    for column in ('q3', 'q2', 'q1'):
        seconds = parse_time_to_seconds(row.get(column))
        if seconds is not None:
            return seconds
    return None


def build_driver_metrics(races: pd.DataFrame, results: pd.DataFrame, drivers: pd.DataFrame, constructors: pd.DataFrame) -> dict:
    race_results = results.merge(races[['raceId', 'year']], on='raceId', how='left').merge(drivers[['driverId', 'driverRef', 'code', 'forename', 'surname']], on='driverId', how='left').merge(constructors[['constructorId', 'name']], on='constructorId', how='left')
    race_results['points'] = pd.to_numeric(race_results['points'], errors='coerce').fillna(0)
    race_results['positionOrder'] = pd.to_numeric(race_results['positionOrder'], errors='coerce')
    race_results['finished'] = race_results['statusId'].notna() & race_results['positionOrder'].notna() & (race_results['positionOrder'] > 0)
    race_results['driver'] = race_results['forename'].fillna('') + ' ' + race_results['surname'].fillna('')
    race_results['driver_code'] = race_results['code'].fillna(race_results['driverRef']).fillna('')
    race_results['constructor'] = race_results['name']

    rows = []
    for (year, driver_id), group in race_results.groupby(['year', 'driverId']):
        races_entered = group['raceId'].nunique()
        points = float(group['points'].sum())
        wins = int((group['positionOrder'] == 1).sum())
        dnf_rate = float((~group['finished']).sum() / races_entered) if races_entered else None
        driver_name = group['driver'].iloc[0]
        driver_code = group['driver_code'].iloc[0]
        constructor_name = group['constructor'].mode().iat[0] if not group['constructor'].mode().empty else group['constructor'].iloc[0]
        podiums = int((group['positionOrder'] <= 3).sum())
        grid_vals = pd.to_numeric(group['grid'], errors='coerce').dropna()
        avg_grid = float(grid_vals.mean()) if not grid_vals.empty else None
        rows.append(
            {
                'year': int(year) if pd.notna(year) else None,
                'driver': driver_name.strip(),
                'driver_code': driver_code,
                'constructor': constructor_name,
                'color': constructor_color(constructor_name),
                'points_per_race': points / races_entered if races_entered else None,
                'podium_rate': podiums / races_entered if races_entered else None,
                'win_rate': wins / races_entered if races_entered else None,
                'dnf_rate': dnf_rate,
                'avg_grid_pos': avg_grid,
            }
        )

    metrics = pd.DataFrame(rows)
    for column in ['points_per_race', 'podium_rate', 'win_rate', 'dnf_rate', 'avg_grid_pos']:
        metrics[f'{column}_norm'] = None
    for year, group in metrics.groupby('year'):
        for column in ['points_per_race', 'podium_rate', 'win_rate', 'dnf_rate', 'avg_grid_pos']:
            normalized = min_max_normalize(group[column].tolist())
            metrics.loc[group.index, f'{column}_norm'] = normalized
    return {'data': metrics.to_dict(orient='records')}


def classify_status(status_text: str) -> str:
    s = str(status_text).lower()
    if s == 'finished':
        return 'finished'
    if '+' in s and 'lap' in s:
        return 'lapped'
    if any(x in s for x in ['engine', 'gearbox', 'hydraulic', 'electrical', 'mechanical',
                              'alternator', 'fuel', 'oil', 'turbo', 'throttle', 'exhaust',
                              'power unit', 'hybrid', 'mguk', 'mguh', 'battery', 'clutch',
                              'overheating', 'cooling', 'water', 'fire', 'driveshaft',
                              'transmission', 'brakes', 'wheel', 'tyre', 'steering',
                              'suspension', 'differential', 'radiator', 'electronics',
                              'pneumatic', 'spark plug']):
        return 'mechanical'
    if any(x in s for x in ['accident', 'collision', 'crash', 'spun off', 'damage',
                              'puncture', 'contact', 'retired', 'debris']):
        return 'accident'
    if any(x in s for x in ['disqualified', 'dnq', 'withdrew', 'excluded', 'not classified']):
        return 'dsq'
    return 'other'


def build_reliability(races: pd.DataFrame, results: pd.DataFrame, constructors: pd.DataFrame, status: pd.DataFrame) -> dict:
    """Per-year and per-decade reliability breakdown (finish/lapped/mechanical/accident)."""
    merged = (
        results
        .merge(races[['raceId', 'year']], on='raceId', how='left')
        .merge(constructors[['constructorId', 'name']].rename(columns={'name': 'constructor'}), on='constructorId', how='left')
        .merge(status[['statusId', 'status']], on='statusId', how='left')
    )
    merged['outcome'] = merged['status'].map(classify_status)
    merged['year'] = pd.to_numeric(merged['year'], errors='coerce')
    merged = merged[merged['year'].notna()].copy()
    merged['year'] = merged['year'].astype(int)

    # by_year: aggregate per year (all constructors combined) for the era trend chart
    year_groups = merged.groupby('year')
    by_year = []
    for year, group in year_groups:
        total = len(group)
        if total == 0:
            continue
        counts = group['outcome'].value_counts()
        by_year.append({
            'year': int(year),
            'total': int(total),
            'finished': round(float(counts.get('finished', 0)) / total, 4),
            'lapped':   round(float(counts.get('lapped', 0))   / total, 4),
            'mechanical': round(float(counts.get('mechanical', 0)) / total, 4),
            'accident': round(float(counts.get('accident', 0)) / total, 4),
            'other':    round(float(counts.get('other', 0) + counts.get('dsq', 0)) / total, 4),
        })

    # by_constructor: aggregate per constructor across all years — for constructor filter
    # Include year so the frontend can filter by year range
    con_year_groups = merged.groupby(['constructor', 'year'])
    by_constructor = []
    for (constructor_name, year), group in con_year_groups:
        total = len(group)
        if total < 5:  # skip tiny samples
            continue
        counts = group['outcome'].value_counts()
        by_constructor.append({
            'constructor': constructor_name,
            'year': int(year),
            'color': constructor_color(constructor_name),
            'total': int(total),
            'finished':   round(float(counts.get('finished', 0))   / total, 4),
            'lapped':     round(float(counts.get('lapped', 0))     / total, 4),
            'mechanical': round(float(counts.get('mechanical', 0)) / total, 4),
            'accident':   round(float(counts.get('accident', 0))   / total, 4),
            'other':      round(float(counts.get('other', 0) + counts.get('dsq', 0)) / total, 4),
        })

    return {'by_year': by_year, 'by_constructor': by_constructor}


def main() -> None:
    raw_dir = pick_raw_dir()
    ensure_output_dir()

    races = read_csv(raw_dir, 'races.csv', parse_dates=['date'])
    circuits = read_csv(raw_dir, 'circuits.csv')
    constructors = read_csv(raw_dir, 'constructors.csv')
    drivers = read_csv(raw_dir, 'drivers.csv', parse_dates=['dob'])
    results = read_csv(raw_dir, 'results.csv')
    constructor_results = read_csv(raw_dir, 'constructor_results.csv')
    constructor_standings = read_csv(raw_dir, 'constructor_standings.csv')
    driver_standings = read_csv(raw_dir, 'driver_standings.csv')
    pit_stops = read_csv(raw_dir, 'pit_stops.csv')
    qualifying = read_csv(raw_dir, 'qualifying.csv')
    lap_times = read_csv(raw_dir, 'lap_times.csv')
    status = read_csv(raw_dir, 'status.csv')

    write_json('circuits.json', build_circuits(races, circuits, results, constructors))
    write_json('constructor_dominance.json', build_constructor_dominance(races, results, constructors, constructor_standings))
    write_json('quali_vs_finish.json', build_quali_vs_finish(races, qualifying, results, drivers, constructors))
    write_json('pit_stops.json', build_pit_stops(races, pit_stops, results, constructors))
    write_json('driver_metrics.json', build_driver_metrics(races, results, drivers, constructors))
    write_json('reliability.json', build_reliability(races, results, constructors, status))
    write_json('championship_battles.json', build_championship_battles(races, driver_standings, drivers, results, constructors))
    print(f'Wrote processed files to {OUTPUT_DIR}')


if __name__ == '__main__':
    main()

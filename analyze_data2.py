import pandas as pd
NA = ['\N']

results = pd.read_csv('Data/results.csv', na_values=NA)
races   = pd.read_csv('Data/races.csv',   na_values=NA)
qualifying = pd.read_csv('Data/qualifying.csv', na_values=NA)
lap_times  = pd.read_csv('Data/lap_times.csv', na_values=NA)

print('=== QUALIFYING COVERAGE ===')
q_merged = qualifying.merge(races[['raceId','year']], on='raceId')
print(f"Q1: {qualifying['q1'].notna().mean():.1%}")
print(f"Q2: {qualifying['q2'].notna().mean():.1%}")
print(f"Q3: {qualifying['q3'].notna().mean():.1%}")
print()

print('=== GRID POSITION IN RESULTS (reliability) ===')
r_merged = results.merge(races[['raceId','year']], on='raceId')
r_merged['grid_valid'] = pd.to_numeric(r_merged['grid'], errors='coerce').fillna(0) > 0
r_merged['decade'] = (r_merged['year'] // 10) * 10
print(r_merged.groupby('decade')['grid_valid'].mean().round(3).to_string())
print()

print('=== LAP TIMES COVERAGE ===')
lt_merged = lap_times.merge(races[['raceId','year']], on='raceId')
lt_merged['decade'] = (lt_merged['year'] // 10) * 10
print(f"Total rows: {len(lt_merged):,}")
print(f"Year range: {int(lt_merged['year'].min())} - {int(lt_merged['year'].max())}")
print("Records per decade:")
print(lt_merged.groupby('decade').size().to_string())
print()

print('=== RACES PER SEASON (modern era) ===')
modern = races[races['year'] >= 2010]['year'].value_counts().sort_index()
print(modern.to_string())

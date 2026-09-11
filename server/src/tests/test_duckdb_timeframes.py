import duckdb
import time

path = r'C:\Users\ekare\Documents\XAUUSD_Tick_Parquet.parquet'.replace('\\', '/')
con = duckdb.connect()

print('=== TESTING DUCKDB PREDICATE PUSHDOWN & TIMEFRAME AGGREGATIONS ===')

timeframes = [
    ('M1', "INTERVAL '1 minute'"),
    ('M5', "INTERVAL '5 minute'"),
    ('M15', "INTERVAL '15 minute'"),
    ('H1', "INTERVAL '1 hour'"),
    ('H4', "INTERVAL '4 hour'"),
    ('D1', "INTERVAL '1 day'"),
]

# Test window: 1 month of ticks (Aug 2026)
start_dt = '20260801 00:00:00'
end_dt = '20260831 23:59:59'

for tf_name, interval_sql in timeframes:
    t0 = time.time()
    query = f"""
        SELECT 
            time_bucket({interval_sql}, strptime(DateTime, '%Y%m%d %H:%M:%S.%g')) as candle_time,
            FIRST(Bid) as open,
            MAX(Bid) as high,
            MIN(Bid) as low,
            LAST(Bid) as close,
            COUNT(*) as tick_volume
        FROM '{path}'
        WHERE DateTime >= '{start_dt}' AND DateTime <= '{end_dt}'
        GROUP BY candle_time
        ORDER BY candle_time ASC
    """
    res = con.execute(query).fetchall()
    elapsed = (time.time() - t0) * 1000
    print(f'{tf_name:4s}: generated {len(res):5d} candles in {elapsed:6.1f} ms')

print('\n=== TESTING LIMIT AND REVERSE WINDOW (LATEST 1500 M1) ===')
t0 = time.time()
# e.g., fetching 1500 M1 candles before 2026-08-25 12:00:00
cutoff = '20260825 12:00:00'
# To get 1500 candles before cutoff fast without scanning whole history:
# Since average 1 M1 candle is ~1.5 minutes accounting for weekend:
# 1500 M1 candles is ~2-3 days of data.
query_window = f"""
    WITH filtered_ticks AS (
        SELECT DateTime, Bid
        FROM '{path}'
        WHERE DateTime >= '20260820 00:00:00' AND DateTime <= '{cutoff}'
    )
    SELECT 
        time_bucket(INTERVAL '1 minute', strptime(DateTime, '%Y%m%d %H:%M:%S.%g')) as candle_time,
        FIRST(Bid) as open,
        MAX(Bid) as high,
        MIN(Bid) as low,
        LAST(Bid) as close,
        COUNT(*) as tick_volume
    FROM filtered_ticks
    GROUP BY candle_time
    ORDER BY candle_time DESC
    LIMIT 1500
"""
res = con.execute(query_window).fetchall()
elapsed = (time.time() - t0) * 1000
print(f'1500 latest M1 candles before cutoff generated {len(res)} candles in {elapsed:.1f} ms')

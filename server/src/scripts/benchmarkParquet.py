import duckdb
import time
import os
import datetime

try:
    import psutil
    def get_process_memory_mb():
        process = psutil.Process(os.getpid())
        return process.memory_info().rss / (1024 * 1024)
except ImportError:
    def get_process_memory_mb():
        return 0.0

path = r'C:\Users\ekare\Documents\XAUUSD_Tick_Parquet.parquet'.replace('\\', '/')
con = duckdb.connect()

TIMEFRAME_CONFIG = {
    'M1': ("INTERVAL '1 minute'", datetime.timedelta(days=7)),
    'M5': ("INTERVAL '5 minute'", datetime.timedelta(days=21)),
    'M15': ("INTERVAL '15 minute'", datetime.timedelta(days=45)),
    'M30': ("INTERVAL '30 minute'", datetime.timedelta(days=75)),
    'H1': ("INTERVAL '1 hour'", datetime.timedelta(days=150)),
    'H4': ("INTERVAL '4 hour'", datetime.timedelta(days=365)),
    'D1': ("INTERVAL '1 day'", datetime.timedelta(days=1200)),
}

def query_candles(timeframe='M1', limit=1500, before_time=None, after_time=None, from_time=None, to_time=None):
    interval_sql, default_lookback = TIMEFRAME_CONFIG.get(timeframe, ("INTERVAL '1 minute'", datetime.timedelta(days=7)))
    
    where_clauses = []
    
    # 1. Bounded range
    if from_time and to_time:
        f_str = from_time.strftime('%Y%m%d %H:%M:%S')
        t_str = to_time.strftime('%Y%m%d %H:%M:%S')
        where_clauses.append(f"DateTime >= '{f_str}' AND DateTime <= '{t_str}'")
        order_dir = 'ASC'
    elif after_time:
        # Forward streaming from after_time
        a_str = after_time.strftime('%Y%m%d %H:%M:%S')
        # Bounded lookahead to prevent full scan
        end_date = after_time + default_lookback
        e_str = end_date.strftime('%Y%m%d %H:%M:%S')
        where_clauses.append(f"DateTime > '{a_str}' AND DateTime <= '{e_str}'")
        order_dir = 'ASC'
    elif before_time:
        # Backward window ending at before_time
        b_str = before_time.strftime('%Y%m%d %H:%M:%S')
        start_date = before_time - default_lookback
        s_str = start_date.strftime('%Y%m%d %H:%M:%S')
        where_clauses.append(f"DateTime >= '{s_str}' AND DateTime <= '{b_str}'")
        order_dir = 'DESC'
    else:
        # Latest window (newest candles in dataset)
        latest_dt = '20260901 23:59:59'
        start_date = datetime.datetime(2026, 9, 1, 23, 59, 59) - default_lookback
        s_str = start_date.strftime('%Y%m%d %H:%M:%S')
        where_clauses.append(f"DateTime >= '{s_str}' AND DateTime <= '{latest_dt}'")
        order_dir = 'DESC'

    where_sql = " AND ".join(where_clauses)
    
    query = f"""
        WITH filtered AS (
            SELECT DateTime, Bid, Volume
            FROM '{path}'
            WHERE {where_sql}
        )
        SELECT 
            time_bucket({interval_sql}, strptime(DateTime, '%Y%m%d %H:%M:%S.%g')) as candle_time,
            FIRST(Bid) as open,
            MAX(Bid) as high,
            MIN(Bid) as low,
            LAST(Bid) as close,
            COUNT(*) as tick_volume
        FROM filtered
        GROUP BY candle_time
        ORDER BY candle_time {order_dir}
        LIMIT {limit}
    """
    
    t0 = time.perf_counter()
    rows = con.execute(query).fetchall()
    latency_ms = (time.perf_counter() - t0) * 1000
    
    # If ordered DESC for backward window, reverse to chronological ASC for client/chart
    if order_dir == 'DESC':
        rows.reverse()
        
    return rows, latency_ms

print('=' * 80)
print('BENCHMARK: PARQUET TICK SOURCE OF TRUTH CANDLE AGGREGATION')
print('Dataset: 725,596,648 ticks (~8.19 GB)')
print('=' * 80)

scenarios = [
    ('1. 1,000 M1 Candles (Recent Window)', 'M1', 1000, datetime.datetime(2026, 8, 20, 12, 0)),
    ('2. 2,000 M1 Candles (Recent Window)', 'M1', 2000, datetime.datetime(2026, 8, 20, 12, 0)),
    ('3. 5,000 M1 Candles (Stress Window)', 'M1', 5000, datetime.datetime(2026, 8, 20, 12, 0)),
    ('4. H1 Window (1,000 H1 Candles ~ 2 months)', 'H1', 1000, datetime.datetime(2026, 8, 20, 12, 0)),
    ('5. Random Historical Window (Year 2015)', 'M1', 1500, datetime.datetime(2015, 6, 15, 14, 30)),
    ('6. Newest Window (August 31, 2026)', 'M1', 1500, datetime.datetime(2026, 8, 31, 23, 59)),
    ('7. Oldest Window (May 2003)', 'M1', 1500, datetime.datetime(2003, 5, 12, 12, 0)),
]

results = []

for name, tf, limit, cutoff in scenarios:
    mem_before = get_process_memory_mb()
    candles, latency = query_candles(timeframe=tf, limit=limit, before_time=cutoff)
    mem_after = get_process_memory_mb()
    
    # Validation checks
    count = len(candles)
    first_time = candles[0][0] if count > 0 else None
    last_time = candles[-1][0] if count > 0 else None
    
    ohlc_valid = True
    for c in candles:
        t, o, h, l, cl, vol = c
        if not (h >= l and h >= o and h >= cl and l <= o and l <= cl):
            ohlc_valid = False
            break
            
    is_chronological = True
    for i in range(1, count):
        if candles[i][0] <= candles[i - 1][0]:
            is_chronological = False
            break
            
    results.append({
        'name': name,
        'timeframe': tf,
        'limit': limit,
        'count': count,
        'latency_ms': latency,
        'rss_mb': mem_after,
        'first_time': str(first_time),
        'last_time': str(last_time),
        'ohlc_valid': ohlc_valid,
        'chronological': is_chronological,
    })
    
    print(f"\n[{name}]")
    print(f"  Count: {count} candles | Latency: {latency:.2f} ms | RSS Mem: {mem_after:.1f} MB")
    print(f"  Range: {first_time} -> {last_time}")
    print(f"  OHLC Correctness: {'PASS' if ohlc_valid else 'FAIL'} | Chronological: {'PASS' if is_chronological else 'FAIL'}")

print('\n' + '=' * 80)
print('SUMMARY TABLE:')
print(f"{'Scenario':<42} | {'Count':<6} | {'Latency (ms)':<12} | {'RSS (MB)':<9} | {'OHLC':<6}")
print('-' * 80)
for r in results:
    print(f"{r['name']:<42} | {r['count']:<6} | {r['latency_ms']:<12.1f} | {r['rss_mb']:<9.1f} | {'PASS' if r['ohlc_valid'] else 'FAIL'}")
print('=' * 80)

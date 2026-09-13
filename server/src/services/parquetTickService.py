import sys
import os
import json
import time
import datetime
import math
import duckdb

def resolve_parquet_file():
    raw = os.environ.get('PARQUET_TICK_PATH')
    script_dir = os.path.dirname(os.path.abspath(__file__))
    server_root = os.path.abspath(os.path.join(script_dir, '..', '..'))
    project_root = os.path.abspath(os.path.join(server_root, '..'))

    candidates = []
    if raw:
        clean = raw.strip().strip('"').strip("'").replace('\\', '/')
        candidates.extend([
            clean,
            os.path.abspath(clean),
            os.path.join(server_root, clean),
            os.path.join(project_root, clean),
            os.path.join(server_root, clean.replace('server/', '', 1)) if clean.startswith('server/') else None,
            os.path.join(project_root, 'server', clean),
        ])

    # Auto-detect default directories
    market_dirs = [
        os.path.join(server_root, 'data', 'market-data'),
        os.path.join(project_root, 'server', 'data', 'market-data'),
        os.path.join(project_root, 'data', 'market-data'),
    ]

    for mdir in market_dirs:
        if os.path.isdir(mdir):
            candidates.append(os.path.join(mdir, 'XAUUSD_Tick_Parquet.parquet'))
            candidates.append(os.path.join(mdir, 'xauusd_tick_parquet.parquet'))
            try:
                for fname in os.listdir(mdir):
                    if fname.lower().endswith('.parquet'):
                        candidates.append(os.path.join(mdir, fname))
            except Exception:
                pass

    for c in candidates:
        if c and os.path.isfile(c):
            resolved = os.path.abspath(c).replace('\\', '/')
            sys.stderr.write(f"[parquetTickService] Using parquet file: {resolved}\n")
            sys.stderr.flush()
            return resolved

    fallback = (raw or r'C:\Users\ekare\Documents\XAUUSD_Tick_Parquet.parquet').replace('\\', '/')
    sys.stderr.write(f"[parquetTickService] Parquet file not found in candidates, falling back to: {fallback}\n")
    sys.stderr.flush()
    return fallback

PARQUET_FILE = resolve_parquet_file()

con = duckdb.connect()

TIMEFRAME_CONFIG = {
    'M1': ("INTERVAL '1 minute'", datetime.timedelta(days=7)),
    'M5': ("INTERVAL '5 minute'", datetime.timedelta(days=21)),
    'M15': ("INTERVAL '15 minute'", datetime.timedelta(days=45)),
    'M30': ("INTERVAL '30 minute'", datetime.timedelta(days=75)),
    'H1': ("INTERVAL '1 hour'", datetime.timedelta(days=120)),
    'H4': ("INTERVAL '4 hour'", datetime.timedelta(days=365)),
    'D1': ("INTERVAL '1 day'", datetime.timedelta(days=1200)),
}

TIMEFRAME_SECONDS = {
    'M1': 60,
    'M5': 300,
    'M15': 900,
    'M30': 1800,
    'H1': 3600,
    'H4': 14400,
    'D1': 86400,
}

TIMEFRAME_DEFAULT_LIMITS = {
    'M1': 1200,
    'M5': 1200,
    'M15': 800,
    'M30': 800,
    'H1': 600,
    'H4': 600,
    'D1': 700,
}

def get_adaptive_lookback(tf, limit=None):
    tf_upper = tf.upper()
    if limit is None or limit <= 0:
        limit = TIMEFRAME_DEFAULT_LIMITS.get(tf_upper, 1200)
    tf_hours = {
        'M1': 1/60,
        'M5': 5/60,
        'M15': 15/60,
        'M30': 30/60,
        'H1': 1,
        'H4': 4,
        'D1': 24,
    }
    h = tf_hours.get(tf_upper, 1/60)
    needed_hours = limit * h * 1.5
    needed_days = max(3, math.ceil(needed_hours / 24))
    max_days = {'M1': 14, 'M5': 30, 'M15': 60, 'M30': 90, 'H1': 180, 'H4': 400, 'D1': 1500}
    final_days = min(needed_days, max_days.get(tf_upper, 30))
    return datetime.timedelta(days=final_days)

def parse_iso(dt_str):
    if not dt_str:
        return None
    try:
        clean = dt_str.replace('Z', '+00:00')
        d = datetime.datetime.fromisoformat(clean)
        if d.tzinfo:
            d = d.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        return d
    except Exception:
        try:
            return datetime.datetime.strptime(dt_str[:19], '%Y-%m-%dT%H:%M:%S')
        except Exception:
            return None

def format_db_dt(d):
    return d.strftime('%Y%m%d %H:%M:%S')

def get_timeline_bounds():
    return {
        'dateFrom': '2003-05-05T00:01:03.421Z',
        'dateTo': '2026-09-01T23:59:59.995Z',
        'provider': 'PARQUET',
        'symbol': 'XAUUSD',
        'totalTicks': 725596648,
    }

def get_time_bucket_expr(tf):
    if tf.upper() == 'D1':
        # Clean 5-day week: naturally merge Sunday evening ticks into Monday without shifting weekday hours!
        return """CASE 
            WHEN strftime(dt, '%w') = '0' THEN time_bucket(INTERVAL '1 day', dt + INTERVAL '1 day')
            ELSE time_bucket(INTERVAL '1 day', dt)
        END"""
    interval_sql = TIMEFRAME_CONFIG.get(tf.upper(), ("INTERVAL '1 minute'", None))[0]
    return f"time_bucket({interval_sql}, dt)"

def get_next_bucket_start(dt, tf):
    sec = TIMEFRAME_SECONDS.get(tf.upper(), 60)
    ts = dt.replace(tzinfo=datetime.timezone.utc).timestamp()
    current_bucket_start_ts = math.floor(ts / sec) * sec
    next_bucket_start_ts = current_bucket_start_ts + sec
    return datetime.datetime.fromtimestamp(next_bucket_start_ts, tz=datetime.timezone.utc).replace(tzinfo=None)

def query_candles(symbol='XAUUSD', timeframe='M1', limit=None, before_time=None, after_time=None, from_time=None, to_time=None, replay_time=None):
    tf = timeframe.upper()
    default_limit = TIMEFRAME_DEFAULT_LIMITS.get(tf, 1200)
    try:
        limit_val = int(limit) if limit is not None else default_limit
        if limit_val <= 0:
            limit_val = default_limit
    except (ValueError, TypeError):
        limit_val = default_limit
    limit_val = min(limit_val, default_limit)

    bucket_expr = get_time_bucket_expr(tf)
    default_lookback = get_adaptive_lookback(tf, limit_val)
    
    where_clauses = ["Bid > 0", "Volume > 0"]
    having_clauses = ["count(*) > 0 AND max(Bid) > 0 AND min(Bid) > 0"]
    
    f_dt = parse_iso(from_time) if isinstance(from_time, str) else from_time
    t_dt = parse_iso(to_time) if isinstance(to_time, str) else to_time
    b_dt = parse_iso(before_time) if isinstance(before_time, str) else before_time
    a_dt = parse_iso(after_time) if isinstance(after_time, str) else after_time
    r_dt = parse_iso(replay_time) if isinstance(replay_time, str) else replay_time

    # Authoritative Replay Cutoff: NEVER read after replay_time
    if r_dt:
        where_clauses.append(f"DateTime <= '{format_db_dt(r_dt)}'")
        having_clauses.append(f"candle_time <= TIMESTAMP '{r_dt.strftime('%Y-%m-%d %H:%M:%S')}'")
        # If before_time is not set, the client is asking for history ending at replay_time!
        if not b_dt and not a_dt and not (f_dt and t_dt):
            b_dt = r_dt

    order_dir = 'DESC'
    
    if f_dt and t_dt:
        where_clauses.append(f"DateTime >= '{format_db_dt(f_dt)}' AND DateTime <= '{format_db_dt(t_dt)}'")
        having_clauses.append(f"candle_time >= TIMESTAMP '{f_dt.strftime('%Y-%m-%d %H:%M:%S')}'")
        having_clauses.append(f"candle_time <= TIMESTAMP '{t_dt.strftime('%Y-%m-%d %H:%M:%S')}'")
        order_dir = 'ASC'
    elif a_dt:
        # Forward streaming: strictly START from the NEXT bucket after a_dt!
        next_dt = get_next_bucket_start(a_dt, tf)
        end_date = next_dt + default_lookback
        where_clauses.append(f"DateTime >= '{format_db_dt(next_dt)}' AND DateTime <= '{format_db_dt(end_date)}'")
        having_clauses.append(f"candle_time >= TIMESTAMP '{next_dt.strftime('%Y-%m-%d %H:%M:%S')}'")
        order_dir = 'ASC'
    elif b_dt:
        # Backward window up to b_dt
        start_date = b_dt - default_lookback
        where_clauses.append(f"DateTime >= '{format_db_dt(start_date)}' AND DateTime <= '{format_db_dt(b_dt + datetime.timedelta(days=1))}'")
        having_clauses.append(f"candle_time <= TIMESTAMP '{b_dt.strftime('%Y-%m-%d %H:%M:%S')}'")
        order_dir = 'DESC'
    else:
        # Latest window in dataset
        latest_date = datetime.datetime(2026, 9, 1, 23, 59, 59)
        start_date = latest_date - default_lookback
        where_clauses.append(f"DateTime >= '{format_db_dt(start_date)}' AND DateTime <= '{format_db_dt(latest_date)}'")
        order_dir = 'DESC'

    where_sql = " AND ".join(where_clauses)
    having_sql = f"HAVING {' AND '.join(having_clauses)}" if having_clauses else ""
    
    query = f"""
        WITH filtered AS (
            SELECT 
                strptime(DateTime, '%Y%m%d %H:%M:%S.%g') as dt,
                DateTime,
                Bid,
                Volume
            FROM '{PARQUET_FILE}'
            WHERE {where_sql}
        )
        SELECT 
            {bucket_expr} as candle_time,
            ARG_MIN(Bid, dt) as open,
            MAX(Bid) as high,
            MIN(Bid) as low,
            ARG_MAX(Bid, dt) as close,
            COUNT(*) as tick_volume
        FROM filtered
        WHERE Bid > 0 AND Volume > 0
        GROUP BY candle_time
        {having_sql}
        ORDER BY candle_time {order_dir}
        LIMIT {int(limit_val)}
    """
    
    t0 = time.perf_counter()
    rows = con.execute(query).fetchall()
    latency_ms = (time.perf_counter() - t0) * 1000
    
    if order_dir == 'DESC':
        rows.reverse()
        
    candles = []
    for r in rows:
        candles.append({
            'time': r[0].isoformat() + 'Z',
            'open': round(float(r[1]), 3),
            'high': round(float(r[2]), 3),
            'low': round(float(r[3]), 3),
            'close': round(float(r[4]), 3),
            'tickVolume': int(r[5]),
        })
        
    return {
        'ok': True,
        'symbol': symbol.upper(),
        'timeframe': tf,
        'provider': 'PARQUET',
        'count': len(candles),
        'candles': candles,
        'latencyMs': round(latency_ms, 2),
    }

def query_next_candle(symbol='XAUUSD', timeframe='M1', after_time=None, replay_time=None):
    if not after_time:
        return {'ok': False, 'error': 'afterTime is required'}
        
    tf = timeframe.upper()
    bucket_expr = get_time_bucket_expr(tf)
    _, lookahead = TIMEFRAME_CONFIG.get(tf, ("INTERVAL '1 minute'", datetime.timedelta(days=7)))
    
    a_dt = parse_iso(after_time) if isinstance(after_time, str) else after_time
    if not a_dt:
        return {'ok': False, 'error': 'Invalid afterTime format'}
        
    # Strictly compute next bucket start to avoid any duplicates!
    next_dt = get_next_bucket_start(a_dt, tf)
    where_clauses = [f"DateTime >= '{format_db_dt(next_dt - datetime.timedelta(hours=3))}'"]
    having_clauses = [f"candle_time >= TIMESTAMP '{next_dt.strftime('%Y-%m-%d %H:%M:%S')}'"]
    
    # Strict replay cutoff
    if replay_time:
        r_dt = parse_iso(replay_time) if isinstance(replay_time, str) else replay_time
        if r_dt:
            where_clauses.append(f"DateTime <= '{format_db_dt(r_dt)}'")
            having_clauses.append(f"candle_time <= TIMESTAMP '{r_dt.strftime('%Y-%m-%d %H:%M:%S')}'")
            
    # Bounded lookahead for next candle (e.g. across weekend/market closure: 7 days)
    end_date = next_dt + lookahead
    where_clauses.append(f"DateTime <= '{format_db_dt(end_date)}'")
    
    where_sql = " AND ".join(where_clauses)
    having_sql = f"HAVING {' AND '.join(having_clauses)}"
    
    query = f"""
        WITH filtered AS (
            SELECT 
                strptime(DateTime, '%Y%m%d %H:%M:%S.%g') as dt,
                DateTime,
                Bid,
                Volume
            FROM '{PARQUET_FILE}'
            WHERE {where_sql}
        )
        SELECT 
            {bucket_expr} as candle_time,
            ARG_MIN(Bid, dt) as open,
            MAX(Bid) as high,
            MIN(Bid) as low,
            ARG_MAX(Bid, dt) as close,
            COUNT(*) as tick_volume
        FROM filtered
        GROUP BY candle_time
        {having_sql}
        ORDER BY candle_time ASC
        LIMIT 1
    """
    
    rows = con.execute(query).fetchall()
    if not rows:
        return {'ok': True, 'candle': None}
        
    r = rows[0]
    candle = {
        'time': r[0].isoformat() + 'Z',
        'open': round(float(r[1]), 3),
        'high': round(float(r[2]), 3),
        'low': round(float(r[3]), 3),
        'close': round(float(r[4]), 3),
        'tickVolume': int(r[5]),
    }
    return {'ok': True, 'candle': candle}

def query_ticks(symbol='XAUUSD', from_time=None, to_time=None, limit=100000):
    if not from_time or not to_time:
        return {'ok': False, 'error': 'fromTime and toTime are required'}
        
    f_dt = parse_iso(from_time) if isinstance(from_time, str) else from_time
    t_dt = parse_iso(to_time) if isinstance(to_time, str) else to_time
    
    if not f_dt or not t_dt:
        return {'ok': False, 'error': 'Invalid fromTime or toTime format'}
        
    if t_dt < f_dt:
        return {'ok': True, 'ticks': [], 'count': 0, 'dataStart': None, 'dataEnd': None}
        
    f_str = f_dt.strftime('%Y%m%d %H:%M:%S') + (f'.{f_dt.microsecond // 1000:03d}' if f_dt.microsecond > 0 else '')
    t_str = t_dt.strftime('%Y%m%d %H:%M:%S') + (f'.{t_dt.microsecond // 1000:03d}' if t_dt.microsecond > 0 else '.999')
    
    query = f"""
        SELECT DateTime, Bid, Volume
        FROM '{PARQUET_FILE}'
        WHERE DateTime >= '{f_str}' AND DateTime <= '{t_str}'
        ORDER BY DateTime ASC
        LIMIT {int(limit)}
    """
    
    t0 = time.perf_counter()
    rows = con.execute(query).fetchall()
    latency_ms = (time.perf_counter() - t0) * 1000
    
    ticks = []
    for r in rows:
        ticks.append({
            'time': r[0],
            'bid': round(float(r[1]), 3),
            'ask': round(float(r[1]), 3),
            'volume': int(r[2]),
        })
        
    data_start = rows[0][0] if rows else None
    data_end = rows[-1][0] if rows else None
    
    return {
        'ok': True,
        'symbol': symbol.upper(),
        'count': len(ticks),
        'dataStart': data_start,
        'dataEnd': data_end,
        'ticks': ticks,
        'latencyMs': round(latency_ms, 2),
    }

def run_daemon():
    """Persistent stdio JSON-RPC daemon for Node.js child process"""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            req_id = req.get('id')
            action = req.get('action', 'candles')
            
            if action == 'bounds':
                data = get_timeline_bounds()
                resp = {'id': req_id, 'ok': True, 'data': data}
            elif action == 'next-candle':
                res = query_next_candle(
                    symbol=req.get('symbol', 'XAUUSD'),
                    timeframe=req.get('timeframe', 'M1'),
                    after_time=req.get('afterTime') or req.get('after_time'),
                    replay_time=req.get('replayTime') or req.get('replay_time'),
                )
                resp = {'id': req_id, **res}
            elif action == 'candles':
                res = query_candles(
                    symbol=req.get('symbol', 'XAUUSD'),
                    timeframe=req.get('timeframe', 'M1'),
                    limit=req.get('limit', 1500),
                    before_time=req.get('beforeTime') or req.get('before_time'),
                    after_time=req.get('afterTime') or req.get('after_time'),
                    from_time=req.get('fromTime') or req.get('from_time'),
                    to_time=req.get('toTime') or req.get('to_time'),
                    replay_time=req.get('replayTime') or req.get('replay_time'),
                )
                resp = {'id': req_id, **res}
            elif action == 'ticks':
                res = query_ticks(
                    symbol=req.get('symbol', 'XAUUSD'),
                    from_time=req.get('fromTime') or req.get('from_time'),
                    to_time=req.get('toTime') or req.get('to_time'),
                    limit=req.get('limit', 100000),
                )
                resp = {'id': req_id, **res}
            elif action == 'ping':
                resp = {'id': req_id, 'ok': True, 'pong': time.time()}
            else:
                resp = {'id': req_id, 'ok': False, 'error': f'Unknown action: {action}'}
                
            sys.stdout.write(json.dumps(resp) + '\n')
            sys.stdout.flush()
        except Exception as e:
            err_resp = {'id': req.get('id') if 'req' in locals() else None, 'ok': False, 'error': str(e)}
            sys.stdout.write(json.dumps(err_resp) + '\n')
            sys.stdout.flush()

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--daemon':
        run_daemon()
    else:
        # CLI test
        res = query_candles(timeframe='M1', limit=10)
        print(json.dumps(res, indent=2))

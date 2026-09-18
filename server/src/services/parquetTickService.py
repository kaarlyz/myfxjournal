import os
import sys
import time
import math
import json
import datetime
import duckdb

def resolve_parquet_file(timeframe='M1'):
    server_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    data_dir = os.path.join(server_dir, 'data', 'market-data')
    tf = timeframe.upper() if timeframe else 'M1'
    
    # 1. Dedicated pre-aggregated Parquet if available (0ms lookup)
    tf_specific = os.path.join(data_dir, f'XAUUSD_{tf}.parquet')
    if os.path.exists(tf_specific):
        return tf_specific
        
    # 2. Base M1 Parquet if available
    m1_file = os.path.join(data_dir, 'XAUUSD_M1.parquet')
    if os.path.exists(m1_file):
        return m1_file
        
    # 3. Fallback to raw Tick Parquet
    tick_file = os.path.join(data_dir, 'XAUUSD_Tick_Parquet.parquet')
    return tick_file
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

TIMEFRAME_DEFAULT_LIMITS = {
    'M1': 1200,
    'M5': 1200,
    'M15': 800,
    'M30': 800,
    'H1': 600,
    'H4': 600,
    'D1': 700,
}

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

def get_timeline_bounds():
    # Pre-indexed exact bounds for instant metadata lookup (<1ms)
    return {
        'dateFrom': '2003-05-05T00:01:03.421Z',
        'dateTo': '2026-09-16T23:59:59.809Z',
        'provider': 'PARQUET',
        'symbol': 'XAUUSD',
        'totalTicks': 725596648,
    }

MAX_DATA_TIMESTAMP_MS = 1789603199809

def get_time_bucket_expr(tf):
    if tf.upper() == 'D1':
        return """CASE 
            WHEN strftime(dt, '%w') = '0' THEN time_bucket(INTERVAL '1 day', dt + INTERVAL '1 day')
            ELSE time_bucket(INTERVAL '1 day', dt)
        END"""
    interval_sql = TIMEFRAME_CONFIG.get(tf.upper(), ("INTERVAL '1 minute'", None))[0]
    return f"time_bucket({interval_sql}, dt)"

def query_candles(symbol='XAUUSD', timeframe='M1', limit=None, before_time=None, after_time=None, from_time=None, to_time=None, replay_time=None):
    tf = timeframe.upper()
    pq_file = resolve_parquet_file(tf)
    is_pre_aggregated = not pq_file.endswith('XAUUSD_Tick_Parquet.parquet')

    default_limit = TIMEFRAME_DEFAULT_LIMITS.get(tf, 1200)
    try:
        limit_val = int(limit) if limit is not None else default_limit
        if limit_val <= 0:
            limit_val = default_limit
    except Exception:
        limit_val = default_limit

    where_clauses = []
    if is_pre_aggregated:
        where_clauses.append("open > 0")
    else:
        where_clauses.extend(["bid > 0", "ask > 0"])

    f_dt = parse_iso(from_time) if isinstance(from_time, str) else from_time
    t_dt = parse_iso(to_time) if isinstance(to_time, str) else to_time
    b_dt = parse_iso(before_time) if isinstance(before_time, str) else before_time
    a_dt = parse_iso(after_time) if isinstance(after_time, str) else after_time
    r_dt = parse_iso(replay_time) if isinstance(replay_time, str) else replay_time

    if r_dt:
        r_ms = int(r_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
        where_clauses.append(f"timestamp_ms <= {r_ms}")
        if not b_dt and not a_dt and not (f_dt and t_dt):
            b_dt = r_dt

    order_dir = 'DESC'
    if f_dt and t_dt:
        f_ms = int(f_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
        t_ms = int(t_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
        where_clauses.append(f"timestamp_ms >= {f_ms} AND timestamp_ms <= {t_ms}")
        order_dir = 'ASC'
    elif a_dt:
        a_ms = int(a_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
        where_clauses.append(f"timestamp_ms > {a_ms}")
        order_dir = 'ASC'
    elif b_dt:
        b_ms = int(b_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
        where_clauses.append(f"timestamp_ms <= {b_ms}")
        order_dir = 'DESC'
    else:
        order_dir = 'DESC'

    where_sql = " AND ".join(where_clauses)

    if is_pre_aggregated:
        # Pre-aggregated file (M5, M15, M30, H1, H4, D1, M1) -> Pure instantaneous column read (<15ms)!
        query = f"""
            SELECT 
                time as candle_time,
                open,
                high,
                low,
                close,
                tick_volume
            FROM '{pq_file}'
            WHERE {where_sql}
            ORDER BY time {order_dir}
            LIMIT {int(limit_val)}
        """
    else:
        # Fallback dynamic resampling from raw tick parquet
        bucket_expr = get_time_bucket_expr(tf)
        query = f"""
            WITH filtered AS (
                SELECT 
                    to_timestamp(timestamp_ms / 1000.0) as dt,
                    bid,
                    ask
                FROM '{pq_file}'
                WHERE {where_sql}
            )
            SELECT 
                {bucket_expr} as candle_time,
                ARG_MIN(bid, dt) as open,
                MAX(bid) as high,
                MIN(bid) as low,
                ARG_MAX(bid, dt) as close,
                COUNT(*) as tick_volume
            FROM filtered
            GROUP BY candle_time
            ORDER BY candle_time {order_dir}
            LIMIT {int(limit_val)}
        """

    t0 = time.perf_counter()
    try:
        rows = con.execute(query).fetchall()
    except Exception as e:
        sys.stderr.write(f"Query error: {e}\n")
        return {'ok': False, 'error': str(e), 'candles': []}

    latency_ms = (time.perf_counter() - t0) * 1000
    if order_dir == 'DESC':
        rows.reverse()

    candles = []
    for r in rows:
        candles.append({
            'time': r[0].isoformat() if hasattr(r[0], 'isoformat') else str(r[0]),
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

def get_next_candle(symbol='XAUUSD', timeframe='M1', after_time=None):
    if not after_time:
        return {'ok': False, 'error': 'after_time is required'}
    tf = timeframe.upper()
    pq_file = resolve_parquet_file(tf)
    is_pre_aggregated = not pq_file.endswith('XAUUSD_Tick_Parquet.parquet')

    a_dt = parse_iso(after_time) if isinstance(after_time, str) else after_time
    if not a_dt:
        return {'ok': False, 'error': 'invalid after_time'}
    
    a_ms = int(a_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
    
    if is_pre_aggregated:
        query = f"""
            SELECT 
                time as candle_time,
                open,
                high,
                low,
                close,
                tick_volume
            FROM '{pq_file}'
            WHERE timestamp_ms > {a_ms} AND open > 0
            ORDER BY time ASC
            LIMIT 1
        """
    else:
        bucket_expr = get_time_bucket_expr(tf)
        max_ms = a_ms + 4 * 86400 * 1000
        query = f"""
            WITH filtered AS (
                SELECT 
                    to_timestamp(timestamp_ms / 1000.0) as dt,
                    bid
                FROM '{pq_file}'
                WHERE timestamp_ms > {a_ms} AND timestamp_ms <= {max_ms} AND bid > 0
            )
            SELECT 
                {bucket_expr} as candle_time,
                ARG_MIN(bid, dt) as open,
                MAX(bid) as high,
                MIN(bid) as low,
                ARG_MAX(bid, dt) as close,
                COUNT(*) as tick_volume
            FROM filtered
            GROUP BY candle_time
            ORDER BY candle_time ASC
            LIMIT 1
        """
    try:
        r = con.execute(query).fetchone()
        if r:
            candle = {
                'time': r[0].isoformat() if hasattr(r[0], 'isoformat') else str(r[0]),
                'open': round(float(r[1]), 3),
                'high': round(float(r[2]), 3),
                'low': round(float(r[3]), 3),
                'close': round(float(r[4]), 3),
                'tickVolume': int(r[5]),
            }
            return {'ok': True, 'candle': candle}
    except Exception as e:
        sys.stderr.write(f"get_next_candle error: {e}\n")
    return {'ok': True, 'candle': None}

def run_daemon():
    sys.stderr.write("[parquetTickService] DuckDB JSON-RPC daemon ready on stdin/stdout\n")
    sys.stderr.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            req_id = req.get('id')
            method = req.get('method') or req.get('action')
            params = req.get('params') or req

            # normalize params (camelCase to snake_case)
            n_params = {}
            for k, v in params.items():
                if k in ('id', 'action', 'method'):
                    continue
                snake_k = ''.join(['_' + c.lower() if c.isupper() else c for c in k]).lstrip('_')
                n_params[snake_k] = v

            if method in ('getTimelineBounds', 'bounds'):
                res = get_timeline_bounds()
                print(json.dumps({'id': req_id, 'ok': True, 'result': res, 'data': res}), flush=True)
            elif method in ('getCandles', 'candles'):
                res = query_candles(**n_params)
                print(json.dumps({'id': req_id, 'ok': res.get('ok', True), 'result': res, 'candles': res.get('candles', [])}), flush=True)
            elif method in ('getNextCandle', 'next-candle', 'nextCandle'):
                res = get_next_candle(**n_params)
                print(json.dumps({'id': req_id, 'ok': res.get('ok', True), 'result': res, 'candle': res.get('candle')}), flush=True)
            elif method == 'ping':
                print(json.dumps({'id': req_id, 'ok': True, 'result': {'status': 'pong'}}), flush=True)
            else:
                print(json.dumps({'id': req_id, 'ok': False, 'error': f"Unknown method: {method}"}), flush=True)
        except Exception as e:
            sys.stderr.write(f"RPC Error: {e}\n")
            sys.stderr.flush()

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--daemon':
        run_daemon()
    else:
        print(json.dumps(query_candles(limit=10)))

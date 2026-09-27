import os
import sys
import time
import json
import datetime
import duckdb

_bounds_cache = {}

def _get_price_decimals(sym):
    """Auto-detect decimal places based on instrument type."""
    s = sym.upper()
    if 'XAU' in s or 'XAG' in s:
        return 3
    if s.endswith('JPY') or 'JPY' in s:
        return 3
    if any(x in s for x in ('BTC', 'ETH', 'SOL', 'BNB')):
        return 2
    if any(x in s for x in ('NAS', 'SPX', 'US30', 'US500', 'DAX', 'USTEC', 'US100')):
        return 2
    if any(x in s for x in ('WTI', 'BRENT', 'OIL', 'USOIL')):
        return 3
    return 5  # forex pairs default

def resolve_parquet_file(symbol='XAUUSD', timeframe='M1'):
    server_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    data_dir = os.path.join(server_dir, 'data', 'market-data')
    
    tf_names = {'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN', 'TICK', 'TICKS'}
    if symbol and symbol.upper() in tf_names and timeframe == 'M1':
        tf = symbol.upper()
        sym = 'XAUUSD'
    else:
        sym = (symbol or 'XAUUSD').upper()
        tf = (timeframe or 'M1').upper()
    
    # 1. Exact timeframe match: {SYMBOL}_{TIMEFRAME}.parquet
    tf_specific = os.path.join(data_dir, f'{sym}_{tf}.parquet')
    if os.path.exists(tf_specific):
        return tf_specific

    # 2. Tick timeframe
    if tf in ('TICK', 'TICKS'):
        tick_file = os.path.join(data_dir, f'{sym}_Tick.parquet')
        if os.path.exists(tick_file):
            return tick_file
        legacy_tick = os.path.join(data_dir, f'{sym}_Tick_Parquet.parquet')
        if os.path.exists(legacy_tick):
            return legacy_tick
        return None
        
    # 3. Fallback chain: {SYMBOL}_M1.parquet -> {SYMBOL}_Tick.parquet -> legacy {SYMBOL}_Tick_Parquet.parquet
    m1_file = os.path.join(data_dir, f'{sym}_M1.parquet')
    if os.path.exists(m1_file):
        return m1_file
        
    tick_file = os.path.join(data_dir, f'{sym}_Tick.parquet')
    if os.path.exists(tick_file):
        return tick_file

    legacy_tick = os.path.join(data_dir, f'{sym}_Tick_Parquet.parquet')
    if os.path.exists(legacy_tick):
        return legacy_tick

    return None

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

def list_available_symbols():
    server_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    data_dir = os.path.join(server_dir, 'data', 'market-data')
    if not os.path.exists(data_dir):
        return []
    
    symbols = set()
    for filename in os.listdir(data_dir):
        if not filename.endswith('.parquet'):
            continue
        stem = filename[:-8]
        if stem.endswith('_Tick_Parquet'):
            sym = stem[:-13]
        elif '_' in stem:
            sym = stem.rsplit('_', 1)[0]
        else:
            sym = stem
        if sym:
            symbols.add(sym.upper())
            
    return sorted(list(symbols))

def validate_parquet_schema(filepath):
    if not filepath:
        return {'valid': False, 'columns': [], 'issues': ["No filepath provided."]}
    
    target_path = filepath
    if not os.path.exists(target_path):
        server_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        data_dir = os.path.join(server_dir, 'data', 'market-data')
        alt_path = os.path.join(data_dir, os.path.basename(filepath))
        if os.path.exists(alt_path):
            target_path = alt_path
        else:
            return {'valid': False, 'columns': [], 'issues': [f"File not found: {filepath}"]}
    
    try:
        cols_info = con.execute(f"DESCRIBE SELECT * FROM '{target_path}' LIMIT 1").fetchall()
        cols = [c[0] for c in cols_info]
        cols_lower = [c.lower() for c in cols]
        
        issues = []
        is_tick = 'tick' in os.path.basename(target_path).lower() or ('bid' in cols_lower and 'open' not in cols_lower)
        
        has_time = any(c in cols_lower for c in ('timestamp_ms', 'time', 'dt', 'datetime', 'timestamp', 'date'))
        if not has_time:
            issues.append("Missing timestamp column (expected timestamp_ms, time, dt, datetime, or timestamp)")
            
        if is_tick:
            has_bid = any(c in cols_lower for c in ('bid', 'bidprice', 'price'))
            has_ask = any(c in cols_lower for c in ('ask', 'askprice', 'price'))
            if not has_bid:
                issues.append("Tick file missing 'bid' column")
            if not has_ask:
                issues.append("Tick file missing 'ask' column")
        else:
            for ohlc in ('open', 'high', 'low', 'close'):
                if ohlc not in cols_lower:
                    issues.append(f"OHLC file missing '{ohlc}' column")
                    
        return {'valid': len(issues) == 0, 'columns': cols, 'issues': issues}
    except Exception as e:
        return {'valid': False, 'columns': [], 'issues': [f"Parquet inspection failed: {e}"]}

def get_timeline_bounds(symbol='XAUUSD'):
    sym = (symbol or 'XAUUSD').upper()
    if sym in _bounds_cache:
        return _bounds_cache[sym]

    pq_file = resolve_parquet_file(sym, 'Tick') or resolve_parquet_file(sym, 'M1')
    if not pq_file:
        for tf in ('M5', 'M15', 'M30', 'H1', 'H4', 'D1'):
            pq_file = resolve_parquet_file(sym, tf)
            if pq_file:
                break

    if not pq_file:
        server_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        data_dir = os.path.join(server_dir, 'data', 'market-data')
        if os.path.exists(data_dir):
            for f in os.listdir(data_dir):
                if f.upper().startswith(f"{sym}_") and f.endswith(".parquet"):
                    pq_file = os.path.join(data_dir, f)
                    break

    if not pq_file:
        return {
            'dateFrom': None,
            'dateTo': None,
            'provider': 'PARQUET',
            'symbol': sym,
            'totalTicks': 0,
        }

    try:
        cols_info = con.execute(f"DESCRIBE SELECT * FROM '{pq_file}' LIMIT 1").fetchall()
        cols_lower = [c[0].lower() for c in cols_info]
        
        time_col = None
        for cand in ('timestamp_ms', 'time', 'dt', 'datetime', 'timestamp', 'date'):
            if cand in cols_lower:
                time_col = cand
                break

        if time_col == 'timestamp_ms':
            row = con.execute(f"SELECT epoch_ms(MIN(timestamp_ms)), epoch_ms(MAX(timestamp_ms)), COUNT(*) FROM '{pq_file}'").fetchone()
        elif time_col:
            row = con.execute(f"SELECT MIN({time_col}), MAX({time_col}), COUNT(*) FROM '{pq_file}'").fetchone()
        else:
            row = None

        if row and row[0] and row[1]:
            d_from = row[0].isoformat() if hasattr(row[0], 'isoformat') else str(row[0])
            d_to = row[1].isoformat() if hasattr(row[1], 'isoformat') else str(row[1])
            if not d_from.endswith('Z'):
                d_from += 'Z'
            if not d_to.endswith('Z'):
                d_to += 'Z'
            bounds = {
                'dateFrom': d_from,
                'dateTo': d_to,
                'provider': 'PARQUET',
                'symbol': sym,
                'totalTicks': int(row[2]),
            }
            _bounds_cache[sym] = bounds
            return bounds
    except Exception as e:
        sys.stderr.write(f"get_timeline_bounds error for {sym}: {e}\n")

    return {
        'dateFrom': None,
        'dateTo': None,
        'provider': 'PARQUET',
        'symbol': sym,
        'totalTicks': 0,
    }

def get_time_bucket_expr(tf):
    if tf.upper() == 'D1':
        return """CASE 
            WHEN strftime(dt, '%w') = '0' THEN time_bucket(INTERVAL '1 day', dt + INTERVAL '1 day')
            ELSE time_bucket(INTERVAL '1 day', dt)
        END"""
    interval_sql = TIMEFRAME_CONFIG.get(tf.upper(), ("INTERVAL '1 minute'", None))[0]
    return f"time_bucket({interval_sql}, dt)"

def query_candles(symbol='XAUUSD', timeframe='M1', limit=None, before_time=None, after_time=None, from_time=None, to_time=None, replay_time=None):
    sym = (symbol or 'XAUUSD').upper()
    tf = timeframe.upper()
    pq_file = resolve_parquet_file(sym, tf)
    if not pq_file:
        return {'ok': True, 'symbol': sym, 'timeframe': tf, 'provider': 'PARQUET', 'count': 0, 'candles': [], 'latencyMs': 0}

    is_pre_aggregated = not (pq_file.endswith('_Tick.parquet') or pq_file.endswith('Tick_Parquet.parquet'))

    default_limit = TIMEFRAME_DEFAULT_LIMITS.get(tf, 1200)
    try:
        limit_val = int(limit) if limit is not None else default_limit
        if limit_val <= 0:
            limit_val = default_limit
    except Exception:
        limit_val = default_limit

    cols_info = con.execute(f"DESCRIBE SELECT * FROM '{pq_file}' LIMIT 1").fetchall()
    cols_lower = [c[0].lower() for c in cols_info]

    time_col = None
    for cand in ('time', 'dt', 'datetime', 'timestamp', 'date'):
        if cand in cols_lower:
            time_col = cand
            break
    if not time_col:
        time_col = 'epoch_ms(timestamp_ms)'

    vol_col = None
    for cand in ('tick_volume', 'tickvolume', 'volume', 'vol'):
        if cand in cols_lower:
            vol_col = cand
            break
    if not vol_col:
        vol_col = '1'

    has_ts_ms = 'timestamp_ms' in cols_lower

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
        if has_ts_ms:
            r_ms = int(r_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
            where_clauses.append(f"timestamp_ms <= {r_ms}")
        else:
            where_clauses.append(f"{time_col} <= TIMESTAMP '{r_dt.isoformat()}'")
        if not b_dt and not a_dt and not (f_dt and t_dt):
            b_dt = r_dt

    order_dir = 'DESC'
    if f_dt and t_dt:
        if has_ts_ms:
            f_ms = int(f_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
            t_ms = int(t_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
            where_clauses.append(f"timestamp_ms >= {f_ms} AND timestamp_ms <= {t_ms}")
        else:
            where_clauses.append(f"{time_col} >= TIMESTAMP '{f_dt.isoformat()}' AND {time_col} <= TIMESTAMP '{t_dt.isoformat()}'")
        order_dir = 'ASC'
    elif a_dt:
        if has_ts_ms:
            a_ms = int(a_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
            where_clauses.append(f"timestamp_ms > {a_ms}")
        else:
            where_clauses.append(f"{time_col} > TIMESTAMP '{a_dt.isoformat()}'")
        order_dir = 'ASC'
    elif b_dt:
        if has_ts_ms:
            b_ms = int(b_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
            where_clauses.append(f"timestamp_ms <= {b_ms}")
        else:
            where_clauses.append(f"{time_col} <= TIMESTAMP '{b_dt.isoformat()}'")
        order_dir = 'DESC'
    else:
        order_dir = 'DESC'

    where_sql = " AND ".join(where_clauses)

    exact_tf_match = pq_file.upper().endswith(f'_{tf}.PARQUET')
    if is_pre_aggregated and exact_tf_match:
        query = f"""
            SELECT 
                {time_col} as candle_time,
                open,
                high,
                low,
                close,
                {vol_col} as tick_volume
            FROM '{pq_file}'
            WHERE {where_sql}
            ORDER BY {time_col} {order_dir}
            LIMIT {int(limit_val)}
        """
    elif is_pre_aggregated and not exact_tf_match:
        bucket_expr = get_time_bucket_expr(tf)
        query = f"""
            WITH filtered AS (
                SELECT 
                    {time_col} as dt,
                    open,
                    high,
                    low,
                    close,
                    {vol_col} as tick_volume
                FROM '{pq_file}'
                WHERE {where_sql}
            )
            SELECT 
                {bucket_expr} as candle_time,
                ARG_MIN(open, dt) as open,
                MAX(high) as high,
                MIN(low) as low,
                ARG_MAX(close, dt) as close,
                SUM(tick_volume) as tick_volume
            FROM filtered
            GROUP BY candle_time
            ORDER BY candle_time {order_dir}
            LIMIT {int(limit_val)}
        """
    else:
        bucket_expr = get_time_bucket_expr(tf)
        ts_expr = "to_timestamp(timestamp_ms / 1000.0)" if has_ts_ms else time_col
        query = f"""
            WITH filtered AS (
                SELECT 
                    {ts_expr} as dt,
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

    price_decimals = _get_price_decimals(sym)
    candles = []
    for r in rows:
        candles.append({
            'time': r[0].isoformat() if hasattr(r[0], 'isoformat') else str(r[0]),
            'open': round(float(r[1]), price_decimals),
            'high': round(float(r[2]), price_decimals),
            'low': round(float(r[3]), price_decimals),
            'close': round(float(r[4]), price_decimals),
            'tickVolume': int(r[5]),
        })

    return {
        'ok': True,
        'symbol': sym,
        'timeframe': tf,
        'provider': 'PARQUET',
        'count': len(candles),
        'candles': candles,
        'latencyMs': round(latency_ms, 2),
    }

def get_next_candle(symbol='XAUUSD', timeframe='M1', after_time=None):
    if not after_time:
        return {'ok': False, 'error': 'after_time is required'}
    sym = (symbol or 'XAUUSD').upper()
    tf = timeframe.upper()
    pq_file = resolve_parquet_file(sym, tf)
    if not pq_file:
        return {'ok': True, 'candle': None}

    is_pre_aggregated = not (pq_file.endswith('_Tick.parquet') or pq_file.endswith('Tick_Parquet.parquet'))

    a_dt = parse_iso(after_time) if isinstance(after_time, str) else after_time
    if not a_dt:
        return {'ok': False, 'error': 'invalid after_time'}
    
    a_ms = int(a_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)

    cols_info = con.execute(f"DESCRIBE SELECT * FROM '{pq_file}' LIMIT 1").fetchall()
    cols_lower = [c[0].lower() for c in cols_info]

    time_col = None
    for cand in ('time', 'dt', 'datetime', 'timestamp', 'date'):
        if cand in cols_lower:
            time_col = cand
            break
    if not time_col:
        time_col = 'epoch_ms(timestamp_ms)'

    vol_col = None
    for cand in ('tick_volume', 'tickvolume', 'volume', 'vol'):
        if cand in cols_lower:
            vol_col = cand
            break
    if not vol_col:
        vol_col = '1'

    has_ts_ms = 'timestamp_ms' in cols_lower
    time_filter = f"timestamp_ms > {a_ms}" if has_ts_ms else f"{time_col} > TIMESTAMP '{a_dt.isoformat()}'"

    exact_tf_match = pq_file.upper().endswith(f'_{tf}.PARQUET')
    if is_pre_aggregated and exact_tf_match:
        query = f"""
            SELECT 
                {time_col} as candle_time,
                open,
                high,
                low,
                close,
                {vol_col} as tick_volume
            FROM '{pq_file}'
            WHERE {time_filter} AND open > 0
            ORDER BY {time_col} ASC
            LIMIT 1
        """
    elif is_pre_aggregated and not exact_tf_match:
        bucket_expr = get_time_bucket_expr(tf)
        query = f"""
            WITH filtered AS (
                SELECT 
                    {time_col} as dt,
                    open,
                    high,
                    low,
                    close,
                    {vol_col} as tick_volume
                FROM '{pq_file}'
                WHERE open > 0
            )
            SELECT 
                {bucket_expr} as candle_time,
                ARG_MIN(open, dt) as open,
                MAX(high) as high,
                MIN(low) as low,
                ARG_MAX(close, dt) as close,
                SUM(tick_volume) as tick_volume
            FROM filtered
            GROUP BY candle_time
            HAVING candle_time > TIMESTAMP '{a_dt.isoformat()}'
            ORDER BY candle_time ASC
            LIMIT 1
        """
    else:
        bucket_expr = get_time_bucket_expr(tf)
        max_ms = a_ms + 4 * 86400 * 1000
        ts_expr = "to_timestamp(timestamp_ms / 1000.0)" if has_ts_ms else time_col
        tick_time_filt = f"timestamp_ms > {a_ms} AND timestamp_ms <= {max_ms}" if has_ts_ms else f"{time_col} > TIMESTAMP '{a_dt.isoformat()}'"
        query = f"""
            WITH filtered AS (
                SELECT 
                    {ts_expr} as dt,
                    bid
                FROM '{pq_file}'
                WHERE {tick_time_filt} AND bid > 0
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
            price_decimals = _get_price_decimals(sym)
            candle = {
                'time': r[0].isoformat() if hasattr(r[0], 'isoformat') else str(r[0]),
                'open': round(float(r[1]), price_decimals),
                'high': round(float(r[2]), price_decimals),
                'low': round(float(r[3]), price_decimals),
                'close': round(float(r[4]), price_decimals),
                'tickVolume': int(r[5]),
            }
            return {'ok': True, 'candle': candle}
    except Exception as e:
        sys.stderr.write(f"get_next_candle error: {e}\n")
    return {'ok': True, 'candle': None}

def get_ticks(symbol='XAUUSD', from_time=None, to_time=None, limit=100000):
    sym = (symbol or 'XAUUSD').upper()
    pq_file = resolve_parquet_file(sym, 'Tick') or resolve_parquet_file(sym, 'M1')
    if not pq_file:
        return {'ok': True, 'symbol': sym, 'count': 0, 'dataStart': None, 'dataEnd': None, 'ticks': [], 'latencyMs': 0}

    f_dt = parse_iso(from_time) if isinstance(from_time, str) else from_time
    t_dt = parse_iso(to_time) if isinstance(to_time, str) else to_time

    if not f_dt or not t_dt:
        return {'ok': False, 'error': 'from_time and to_time are required for get_ticks'}

    f_ms = int(f_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
    t_ms = int(t_dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
    if t_ms <= f_ms:
        t_ms = f_ms + 1000
    limit_val = int(limit) if limit else 100000

    cols_info = con.execute(f"DESCRIBE SELECT * FROM '{pq_file}' LIMIT 1").fetchall()
    cols_lower = [c[0].lower() for c in cols_info]
    
    time_col = None
    for cand in ('timestamp_ms', 'time', 'dt', 'datetime', 'timestamp', 'date'):
        if cand in cols_lower:
            time_col = cand
            break
            
    is_real_tick = 'bid' in cols_lower or 'ask' in cols_lower
    
    bid_col = 'bid' if 'bid' in cols_lower else ('price' if 'price' in cols_lower else ('open' if 'open' in cols_lower else cols_lower[1]))
    ask_col = 'ask' if 'ask' in cols_lower else ('price' if 'price' in cols_lower else ('close' if 'close' in cols_lower else bid_col))
    
    if time_col == 'timestamp_ms':
        time_select = "epoch_ms(timestamp_ms)"
        where_sql = f"timestamp_ms >= {f_ms} AND timestamp_ms <= {t_ms}"
        order_sql = "timestamp_ms ASC"
    elif time_col:
        f_iso = f_dt.isoformat()
        t_iso = t_dt.isoformat()
        time_select = time_col
        where_sql = f"{time_col} >= TIMESTAMP '{f_iso}' AND {time_col} <= TIMESTAMP '{t_iso}'"
        order_sql = f"{time_col} ASC"
    else:
        time_select = "dt"
        where_sql = "1=1"
        order_sql = "dt ASC"

    query = f"""
        SELECT 
            {time_select} as time,
            {bid_col} as bid,
            {ask_col} as ask
        FROM '{pq_file}'
        WHERE {where_sql}
        ORDER BY {order_sql}
        LIMIT {limit_val}
    """

    t0 = time.perf_counter()
    try:
        rows = con.execute(query).fetchall()
    except Exception as e:
        sys.stderr.write(f"get_ticks error: {e}\n")
        return {'ok': False, 'error': str(e), 'ticks': []}

    latency_ms = (time.perf_counter() - t0) * 1000
    price_decimals = _get_price_decimals(sym)
    ticks = []
    for r in rows:
        t_iso = r[0].isoformat() if hasattr(r[0], 'isoformat') else str(r[0])
        ticks.append({
            'time': t_iso,
            'bid': round(float(r[1]), price_decimals),
            'ask': round(float(r[2]), price_decimals),
            'volume': 1,
        })

    return {
        'ok': True,
        'symbol': sym,
        'count': len(ticks),
        'dataStart': ticks[0]['time'] if ticks else None,
        'dataEnd': ticks[-1]['time'] if ticks else None,
        'ticks': ticks,
        'tickSource': 'TICK' if is_real_tick else 'CANDLE_ESTIMATE',
        'latencyMs': round(latency_ms, 2),
    }

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

            n_params = {}
            for k, v in params.items():
                if k in ('id', 'action', 'method'):
                    continue
                snake_k = ''.join(['_' + c.lower() if c.isupper() else c for c in k]).lstrip('_')
                n_params[snake_k] = v

            if method in ('getTimelineBounds', 'bounds'):
                symbol_arg = n_params.get('symbol', 'XAUUSD')
                res = get_timeline_bounds(symbol=symbol_arg)
                print(json.dumps({'id': req_id, 'ok': True, 'result': res, 'data': res}), flush=True)
            elif method in ('getCandles', 'candles'):
                res = query_candles(**n_params)
                print(json.dumps({'id': req_id, 'ok': res.get('ok', True), 'result': res, 'candles': res.get('candles', [])}), flush=True)
            elif method in ('getNextCandle', 'next-candle', 'nextCandle'):
                res = get_next_candle(**n_params)
                print(json.dumps({'id': req_id, 'ok': res.get('ok', True), 'result': res, 'candle': res.get('candle')}), flush=True)
            elif method in ('getTicks', 'ticks'):
                res = get_ticks(**n_params)
                print(json.dumps({'id': req_id, 'ok': res.get('ok', True), 'result': res, 'ticks': res.get('ticks', []), 'dataStart': res.get('dataStart'), 'dataEnd': res.get('dataEnd'), 'count': res.get('count', 0)}), flush=True)
            elif method in ('symbols', 'listAvailableSymbols'):
                syms = list_available_symbols()
                print(json.dumps({'id': req_id, 'ok': True, 'symbols': syms, 'result': {'symbols': syms}}), flush=True)
            elif method in ('validate', 'validateParquetSchema'):
                fp = n_params.get('filepath') or n_params.get('file_path')
                res = validate_parquet_schema(fp)
                print(json.dumps({'id': req_id, 'ok': True, 'result': res, 'data': res}), flush=True)
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

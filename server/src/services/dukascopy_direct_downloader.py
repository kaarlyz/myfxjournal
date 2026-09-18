#!/usr/bin/env python3
"""
Direct High-Speed Dukascopy Tick Downloader & Parquet Builder for ReplayFX.
Directly queries Dukascopy Cloud CDN (.bi5) with DoH / IP fallback to bypass ISP DNS block.
Streams tick chunks in parallel and writes sorted PyArrow Parquet files with metadata.
"""

import sys
import os
import ssl
import time
import struct
import lzma
import socket
import datetime
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
import pyarrow as pa
import pyarrow.parquet as pq

# Resolve Dukascopy CDN directly to bypass local ISP DNS hijacking (e.g. InternetBaik)
ORIG_GETADDRINFO = socket.getaddrinfo
def patched_getaddrinfo(host, port, *args, **kwargs):
    if host == 'datafeed.dukascopy.com':
        return ORIG_GETADDRINFO('16.62.187.25', port, *args, **kwargs)
    return ORIG_GETADDRINFO(host, port, *args, **kwargs)

socket.getaddrinfo = patched_getaddrinfo

TICK_RECORD_STRUCT = struct.Struct('>IIIff')

def fetch_hour_ticks(symbol, year, month_0indexed, day, hour):
    """
    Fetch and decompress one hour of ticks (.bi5) from Dukascopy CDN.
    Returns list of tuples: (timestamp_ms, bid, ask, spread, volume)
    """
    url = f"https://datafeed.dukascopy.com/datafeed/{symbol}/{year}/{month_0indexed:02d}/{day:02d}/{hour:02d}h_ticks.bi5"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    
    try:
        with urllib.request.urlopen(req, timeout=12) as res:
            raw = res.read()
            if not raw or len(raw) == 0:
                return []
            
            try:
                decompressed = lzma.decompress(raw)
            except Exception:
                return []
            
            num_records = len(decompressed) // 20
            if num_records == 0:
                return []
            
            base_dt = datetime.datetime(year, month_0indexed + 1, day, hour, 0, 0, tzinfo=datetime.timezone.utc)
            base_ms = int(base_dt.timestamp() * 1000)
            
            divisor = 1000.0 if 'XAU' in symbol or 'JPY' in symbol else 100000.0
            
            records = []
            for i in range(num_records):
                chunk = decompressed[i*20:(i+1)*20]
                time_ms, ask_raw, bid_raw, ask_vol, bid_vol = TICK_RECORD_STRUCT.unpack(chunk)
                
                ask = round(ask_raw / divisor, 3 if 'XAU' in symbol else 5)
                bid = round(bid_raw / divisor, 3 if 'XAU' in symbol else 5)
                spread = round(ask - bid, 4)
                vol = round(ask_vol + bid_vol, 4)
                ts = base_ms + time_ms
                
                records.append((ts, bid, ask, spread, vol))
                
            return records
    except urllib.error.HTTPError as e:
        return []
    except Exception:
        return []

def download_and_build_parquet(symbol="XAUUSD", start_year=2020, end_year=2026, output_path=None, max_workers=24):
    if output_path is None:
        out_dir = os.path.expanduser("~/Documents/myfxjournal/server/data/market-data")
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, f"{symbol}_Tick_Parquet.parquet")
    
    print(f"=== Starting Parquet generation for {symbol} ({start_year} - {end_year}) ===")
    print(f"Target Output: {output_path}")
    
    # Parquet schema matching parquetTickService.py expectation
    schema = pa.schema([
        ('timestamp', pa.int64()),
        ('bid', pa.float64()),
        ('ask', pa.float64()),
        ('spread', pa.float64()),
        ('volume', pa.float64())
    ])
    
    temp_output = output_path + ".tmp"
    writer = pq.ParquetWriter(temp_output, schema, compression='snappy')
    
    total_ticks = 0
    start_time = time.time()
    
    # Iterate year by year
    for year in range(start_year, end_year + 1):
        print(f"\n>> Processing Year {year}...")
        year_tasks = []
        
        # Build date list
        start_date = datetime.date(year, 1, 1)
        end_date = datetime.date(year, 12, 31)
        
        # Cap current year to today
        today = datetime.date.today()
        if end_date > today:
            end_date = today
            
        cur = start_date
        while cur <= end_date:
            # Skip Saturday completely (Forex closed)
            if cur.weekday() != 5:
                # Dukascopy uses 0-indexed month
                m_0idx = cur.month - 1
                for hour in range(24):
                    year_tasks.append((symbol, year, m_0idx, cur.day, hour))
            cur += datetime.timedelta(days=1)
            
        print(f"   Downloading {len(year_tasks)} hourly chunks with {max_workers} parallel workers...")
        
        year_records = []
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_task = {
                executor.submit(fetch_hour_ticks, *task): task for task in year_tasks
            }
            completed = 0
            for future in as_completed(future_to_task):
                completed += 1
                if completed % 1000 == 0 or completed == len(year_tasks):
                    print(f"   Progress: {completed}/{len(year_tasks)} chunks ({completed/len(year_tasks)*100:.1f}%)")
                res = future.result()
                if res:
                    year_records.extend(res)
                    
        if not year_records:
            print(f"   No data found for {year}.")
            continue
            
        # Sort chronologically by timestamp
        print(f"   Sorting {len(year_records):,} ticks for {year}...")
        year_records.sort(key=lambda r: r[0])
        
        # Deduplicate identical timestamp ticks if needed
        # Convert to pyarrow table
        timestamps = [r[0] for r in year_records]
        bids = [r[1] for r in year_records]
        asks = [r[2] for r in year_records]
        spreads = [r[3] for r in year_records]
        volumes = [r[4] for r in year_records]
        
        table = pa.Table.from_arrays([
            pa.array(timestamps, type=pa.int64()),
            pa.array(bids, type=pa.float64()),
            pa.array(asks, type=pa.float64()),
            pa.array(spreads, type=pa.float64()),
            pa.array(volumes, type=pa.float64())
        ], schema=schema)
        
        writer.write_table(table)
        total_ticks += len(year_records)
        print(f"   Written {len(year_records):,} ticks to Parquet. (Running total: {total_ticks:,})")
        
    writer.close()
    if os.path.exists(output_path):
        os.remove(output_path)
    os.rename(temp_output, output_path)
    
    elapsed = time.time() - start_time
    print(f"\n=== COMPLETED {symbol} ===")
    print(f"Total Ticks: {total_ticks:,}")
    print(f"Time Taken: {elapsed/60:.2f} minutes")
    print(f"Saved to: {output_path}")

if __name__ == '__main__':
    start_yr = int(sys.argv[1]) if len(sys.argv) > 1 else 2020
    end_yr = int(sys.argv[2]) if len(sys.argv) > 2 else 2026
    sym = sys.argv[3] if len(sys.argv) > 3 else "XAUUSD"
    download_and_build_parquet(symbol=sym, start_year=start_yr, end_year=end_yr)

import sys
import os
import sqlite3
import uuid
import time
from datetime import datetime, timezone

def import_csv(csv_path, symbol="NSXUSD", provider="DUKASCOPY", timeframe="M1"):
    db_path = "/home/vallencia/Documents/myfxjournal/server/prisma/dev.db"
    
    if not os.path.exists(csv_path):
        print(f"Error: CSV file not found at {csv_path}")
        sys.exit(1)
        
    print(f"=== Starting Fast Import for {symbol} ({provider}) ===")
    print(f"Source file: {csv_path}")
    print(f"Database: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    cur.execute("PRAGMA journal_mode = WAL")
    cur.execute("PRAGMA synchronous = NORMAL")
    cur.execute("PRAGMA cache_size = -64000") # 64MB cache
    
    start_time = time.time()
    batch_size = 50000
    batch = []
    total_read = 0
    total_inserted = 0
    min_time = None
    max_time = None
    
    insert_sql = """
    INSERT OR IGNORE INTO Mt5CandleData (
        id, terminalId, provider, symbol, timeframe, time, 
        open, high, low, close, tickVolume, realVolume, spread, createdAt
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 10, ?)
    """
    
    file_size_bytes = os.path.getsize(csv_path)
    
    with open(csv_path, "r", encoding="utf-8") as f:
        # Header line
        header = f.readline()
        
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(",")
            if len(parts) < 6:
                continue
                
            total_read += 1
            d_str = parts[0].strip()
            t_str = parts[1].strip()
            
            # Fast parsing YYYYMMDD and HH:MM:SS
            try:
                y = int(d_str[0:4])
                m = int(d_str[4:6])
                d = int(d_str[6:8])
                hh = int(t_str[0:2])
                mm = int(t_str[3:5])
                ss = int(t_str[6:8]) if len(t_str) >= 8 else 0
                
                dt = datetime(y, m, d, hh, mm, ss, tzinfo=timezone.utc)
                epoch_ms = int(dt.timestamp() * 1000)
            except Exception:
                continue
                
            if min_time is None or epoch_ms < min_time:
                min_time = epoch_ms
            if max_time is None or epoch_ms > max_time:
                max_time = epoch_ms
                
            o = float(parts[2])
            h = float(parts[3])
            l = float(parts[4])
            c = float(parts[5])
            v = float(parts[6]) if len(parts) > 6 and parts[6] else 0.0
            
            row_id = str(uuid.uuid4())
            now_ms = int(time.time() * 1000)
            
            batch.append((row_id, provider, symbol, timeframe, epoch_ms, o, h, l, c, v, v, now_ms))
            
            if len(batch) >= batch_size:
                cur.executemany(insert_sql, batch)
                conn.commit()
                total_inserted += len(batch)
                batch = []
                elapsed = time.time() - start_time
                rate = total_inserted / elapsed if elapsed > 0 else 0
                print(f"[Importing] {total_inserted:,} candles inserted ({rate:,.0f} rows/s)...")
                
    if batch:
        cur.executemany(insert_sql, batch)
        conn.commit()
        total_inserted += len(batch)
        
    elapsed = time.time() - start_time
    print(f"\n=== IMPORT SUCCESSFUL ===")
    print(f"Total lines processed: {total_read:,}")
    print(f"Total candles in DB: {total_inserted:,}")
    print(f"Time taken: {elapsed:.2f} seconds ({total_inserted / elapsed:,.0f} rows/sec)")
    
    if min_time and max_time:
        min_dt = datetime.fromtimestamp(min_time / 1000, tz=timezone.utc)
        max_dt = datetime.fromtimestamp(max_time / 1000, tz=timezone.utc)
        print(f"Date range: {min_dt.isoformat()} to {max_dt.isoformat()}")
        
        # Also update or insert MarketDataCatalog entry
        cat_id = str(uuid.uuid4())
        now_ms = int(time.time() * 1000)
        cur.execute("""
        INSERT OR REPLACE INTO MarketDataCatalog (
            id, provider, symbol, dataType, timeframe, dateFrom, dateTo, tickCount, candleCount, 
            fileSizeBytes, lastSyncedAt, downloadStatus, createdAt, updatedAt
        ) VALUES (
            ?, ?, ?, 'CANDLE', ?, ?, ?, 0, ?, ?, ?, 'COMPLETE', ?, ?
        )
        """, (cat_id, provider, symbol, timeframe, min_time, max_time, total_inserted, file_size_bytes, now_ms, now_ms, now_ms))
        conn.commit()
        print(f"Updated MarketDataCatalog for {symbol} ({provider})")
        
    conn.close()

if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "/home/vallencia/Downloads/nasdaq_m1/FX-1-Minute-Data/nsxusd_qdm_ready.csv"
    sym = sys.argv[2] if len(sys.argv) > 2 else "NSXUSD"
    import_csv(csv_file, sym)

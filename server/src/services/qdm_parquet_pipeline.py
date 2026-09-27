import os
import sys
import time
import subprocess
import struct
import urllib.request
import pyarrow as pa
import pyarrow.parquet as pq

JAVA_BIN = "/home/vallencia/Downloads/QDM/QDM_Installer/j64/bin/java"
CLASSPATH = "/home/vallencia/Downloads/QDM/QDM_Installer/internal/libs/*:/tmp"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
OUTPUT_DIR = os.environ.get("OUTPUT_DIR") or os.path.join(SERVER_ROOT, "data", "market-data")
TEMP_DOWNLOAD_DIR = "/tmp/qdm_downloads"

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DOWNLOAD_DIR, exist_ok=True)

schema = pa.schema([
    ("timestamp_ms", pa.int64()),
    ("ask", pa.float64()),
    ("bid", pa.float64())
])

def download_file(url, target_path):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(target_path, "wb") as out:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            downloaded += len(chunk)
            if total > 0:
                pct = (downloaded / total) * 100
                print(f"\r   Downloading {os.path.basename(target_path)}: {pct:.1f}% ({downloaded//1048576}MB/{total//1048576}MB)", end="", flush=True)
    print()

def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("-h", "--help"):
        print("Usage: python qdm_parquet_pipeline.py [SYMBOL]")
        print("Downloads and processes tick data for any symbol (default: XAUUSD).")
        print("If your data is CSV, use: python data_converter.py input.csv SYMBOL")
        sys.exit(0)

    symbol = sys.argv[1].upper() if len(sys.argv) > 1 else "XAUUSD"
    output_parquet = os.path.join(OUTPUT_DIR, f"{symbol}_Tick.parquet")

    print("=" * 60)
    print(f"{symbol} Full Historical Tick Pipeline (2003 - 2026)")
    print(f"Target Parquet: {output_parquet}")
    print("=" * 60)

    years = list(range(2003, 2027))
    writer = pq.ParquetWriter(output_parquet, schema, compression="snappy")
    
    total_all_ticks = 0
    start_time = time.time()

    for year in years:
        url = f"https://cdn.strategyquantcdn.com/data/dukascopy/tick/{symbol}/{year}.zip"
        zip_path = os.path.join(TEMP_DOWNLOAD_DIR, f"{symbol}_{year}.zip")
        
        print(f"\n>> Processing Year {year}...")
        try:
            if not os.path.exists(zip_path):
                download_file(url, zip_path)
            else:
                print(f"   Using cached {os.path.basename(zip_path)}")
        except Exception as e:
            print(f"   [SKIP] Could not download {url}: {e}")
            continue

        proc = subprocess.Popen(
            [JAVA_BIN, "-cp", CLASSPATH, "com.strategyquant.datalib.data.io.newDataFormat.QdmYearStreamer", zip_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=1048576
        )

        batch_t = []
        batch_ask = []
        batch_bid = []
        year_ticks = 0
        BATCH_SIZE = 500_000

        while True:
            raw = proc.stdout.read(24 * 10000)
            if not raw:
                break
            
            num_records = len(raw) // 24
            for i in range(num_records):
                chunk = raw[i*24:(i+1)*24]
                t, ask, bid = struct.unpack(">qdd", chunk)
                batch_t.append(int(t))
                batch_ask.append(float(ask))
                batch_bid.append(float(bid))

            if len(batch_t) >= BATCH_SIZE:
                table = pa.Table.from_arrays([
                    pa.array(batch_t, type=pa.int64()),
                    pa.array(batch_ask, type=pa.float64()),
                    pa.array(batch_bid, type=pa.float64())
                ], schema=schema)
                writer.write_table(table)
                year_ticks += len(batch_t)
                total_all_ticks += len(batch_t)
                batch_t.clear()
                batch_ask.clear()
                batch_bid.clear()
                print(f"\r   Streaming Year {year}: {year_ticks:,} ticks written...", end="", flush=True)

        if batch_t:
            table = pa.Table.from_arrays([
                pa.array(batch_t, type=pa.int64()),
                pa.array(batch_ask, type=pa.float64()),
                pa.array(batch_bid, type=pa.float64())
            ], schema=schema)
            writer.write_table(table)
            year_ticks += len(batch_t)
            total_all_ticks += len(batch_t)

        proc.wait()
        _, err = proc.communicate()
        print(f"\n   [DONE] Year {year}: {year_ticks:,} ticks written to Parquet.")
        
        if os.path.exists(zip_path):
            os.remove(zip_path)

    writer.close()
    elapsed = time.time() - start_time
    file_size_gb = os.path.getsize(output_parquet) / (1024 ** 3) if os.path.exists(output_parquet) else 0
    print("\n" + "=" * 60)
    print(f"PIPELINE COMPLETED in {elapsed/60:.2f} minutes!")
    print(f"Total Ticks: {total_all_ticks:,}")
    print(f"Parquet File: {output_parquet} ({file_size_gb:.2f} GB)")
    print("If your data is CSV, use: python data_converter.py input.csv SYMBOL")
    print("=" * 60)

if __name__ == "__main__":
    main()

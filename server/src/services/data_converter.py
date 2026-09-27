#!/usr/bin/env python3
"""
Universal Market Data Converter and Ingestion Tool for ReplayFX / MyFxJournal.

Converts CSV or Parquet files of any format/schema into standardized ReplayFX Parquet datasets.
Supports both Tick data and OHLC candle data.

Standardized Output Schemas:
- Tick: (timestamp_ms: int64, ask: float64, bid: float64)
- OHLC: (dt: timestamp[us], timestamp_ms: int64, open: float64, high: float64, low: float64, close: float64, tickVolume: int64)

Usage:
    python data_converter.py <input_file> <symbol> [--timeframe M1] [--output /path/to/output.parquet]
"""

import os
import sys
import csv
import re
import math
import argparse
import datetime
import pyarrow as pa
import pyarrow.parquet as pq

# Standard schemas
TICK_SCHEMA = pa.schema([
    ("timestamp_ms", pa.int64()),
    ("ask", pa.float64()),
    ("bid", pa.float64()),
])

OHLC_SCHEMA = pa.schema([
    ("dt", pa.timestamp("us")),
    ("timestamp_ms", pa.int64()),
    ("open", pa.float64()),
    ("high", pa.float64()),
    ("low", pa.float64()),
    ("close", pa.float64()),
    ("tickVolume", pa.int64()),
])

# Common datetime format patterns for fast parsing
COMMON_DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S.%f",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%dT%H:%M:%S",
    "%Y.%m.%d %H:%M:%S.%f",
    "%Y.%m.%d %H:%M:%S",
    "%Y.%m.%d %H:%M",
    "%Y/%m/%d %H:%M:%S.%f",
    "%Y/%m/%d %H:%M:%S",
    "%Y/%m/%d %H:%M",
    "%d/%m/%Y %H:%M:%S.%f",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%d.%m.%Y %H:%M:%S.%f",
    "%d.%m.%Y %H:%M:%S",
    "%d.%m.%Y %H:%M",
    "%m/%d/%Y %H:%M:%S.%f",
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M",
    "%Y%m%d %H:%M:%S",
    "%Y%m%d %H%M%S",
]


class TimestampParser:
    """Fast, adaptive timestamp parser with format caching and UTC normalization."""

    def __init__(self):
        self.cached_format = None
        self.is_epoch = None
        self.epoch_unit = None  # 'ms' or 's'

    def parse(self, val_str):
        if val_str is None:
            return None, None

        if isinstance(val_str, (int, float)):
            v = float(val_str)
            if v > 1e11:  # ms
                ms = int(v)
            else:  # seconds
                ms = int(v * 1000)
            dt = datetime.datetime.fromtimestamp(ms / 1000.0, tz=datetime.timezone.utc).replace(tzinfo=None)
            return dt, ms

        s = str(val_str).strip()
        if not s:
            return None, None

        # Check for numeric timestamp in string
        if self.is_epoch is not False:
            try:
                num = float(s)
                if num > 1e11:
                    ms = int(num)
                else:
                    ms = int(num * 1000)
                dt = datetime.datetime.fromtimestamp(ms / 1000.0, tz=datetime.timezone.utc).replace(tzinfo=None)
                self.is_epoch = True
                return dt, ms
            except ValueError:
                if self.is_epoch is True:
                    pass  # Failed numeric parsing after expecting numeric
                self.is_epoch = False

        # Handle ISO strings with timezone offsets like +02:00 or Z
        if "T" in s or "+" in s or (s.endswith("Z") and len(s) > 10):
            try:
                clean_iso = s.replace("Z", "+00:00")
                dt_obj = datetime.datetime.fromisoformat(clean_iso)
                if dt_obj.tzinfo is not None:
                    dt_obj = dt_obj.astimezone(datetime.timezone.utc).replace(tzinfo=None)
                ms = int(dt_obj.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
                return dt_obj, ms
            except Exception:
                pass

        # Try cached format first
        if self.cached_format:
            try:
                dt_obj = datetime.datetime.strptime(s, self.cached_format)
                ms = int(dt_obj.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
                return dt_obj, ms
            except ValueError:
                self.cached_format = None

        # Try common formats
        for fmt in COMMON_DATE_FORMATS:
            try:
                dt_obj = datetime.datetime.strptime(s, fmt)
                self.cached_format = fmt
                ms = int(dt_obj.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
                return dt_obj, ms
            except ValueError:
                continue

        return None, None


def clean_col_name(c):
    """Normalize column header to lowercase alphanumeric."""
    if c is None:
        return ""
    # Strip BOM, brackets, angle brackets, quotes, whitespace
    cleaned = re.sub(r"[<>\[\]\"\'\s_]+", "", str(c).strip().lower())
    return cleaned


def detect_csv_dialect(filepath):
    """Sniff CSV delimiter and header row using Python stdlib."""
    with open(filepath, "r", encoding="utf-8-sig", errors="replace") as f:
        sample = ""
        for _ in range(30):
            line = f.readline()
            if not line:
                break
            sample += line

    # Try standard sniffer
    delimiter = ","
    try:
        sniffed = csv.Sniffer().sniff(sample, delimiters=",;\t| ")
        delimiter = sniffed.delimiter
    except Exception:
        # Fallback heuristic: count common delimiters in the first line
        first_line = sample.splitlines()[0] if sample else ""
        counts = {
            ",": first_line.count(","),
            ";": first_line.count(";"),
            "\t": first_line.count("\t"),
            "|": first_line.count("|"),
        }
        best = max(counts, key=counts.get)
        if counts[best] > 0:
            delimiter = best

    return delimiter


def map_columns(headers):
    """
    Intelligently map input column names to required tick or OHLC fields.
    Returns: (is_tick: bool, mapping: dict)
    """
    cleaned_headers = [clean_col_name(h) for h in headers]
    raw_to_idx = {cleaned_headers[i]: i for i in range(len(headers))}

    mapping = {}

    # 1. Date / Time / Timestamp column(s)
    date_col = None
    time_col = None
    datetime_col = None

    for h, idx in raw_to_idx.items():
        if h in ("timestamp", "timestampms", "datetime", "date_time", "gmt", "timeutc", "utctime"):
            datetime_col = idx
            break

    if datetime_col is None:
        # Check if Date and Time are in separate columns
        for h, idx in raw_to_idx.items():
            if h in ("date", "d", "day") and date_col is None:
                date_col = idx
            elif h in ("time", "t", "timebar") and time_col is None:
                time_col = idx

        if date_col is not None and time_col is not None:
            mapping["date_idx"] = date_col
            mapping["time_idx"] = time_col
        elif date_col is not None:
            datetime_col = date_col
        elif time_col is not None:
            datetime_col = time_col

    if datetime_col is not None:
        mapping["datetime_idx"] = datetime_col

    # 2. Check for OHLC columns
    open_idx = None
    high_idx = None
    low_idx = None
    close_idx = None

    for h, idx in raw_to_idx.items():
        if h in ("open", "o", "openprice"):
            open_idx = idx
        elif h in ("high", "h", "highprice"):
            high_idx = idx
        elif h in ("low", "l", "lowprice"):
            low_idx = idx
        elif h in ("close", "c", "closeprice"):
            close_idx = idx

    is_ohlc = open_idx is not None and close_idx is not None

    if is_ohlc:
        mapping["open_idx"] = open_idx
        mapping["high_idx"] = high_idx if high_idx is not None else open_idx
        mapping["low_idx"] = low_idx if low_idx is not None else close_idx
        mapping["close_idx"] = close_idx

        # Volume
        for h, idx in raw_to_idx.items():
            if h in ("volume", "vol", "tickvolume", "tickvol", "totalvolume", "v"):
                mapping["vol_idx"] = idx
                break

        return False, mapping

    # 3. Check for Tick columns
    bid_idx = None
    ask_idx = None
    price_idx = None

    for h, idx in raw_to_idx.items():
        if h in ("bid", "bidprice", "b"):
            bid_idx = idx
        elif h in ("ask", "askprice", "a"):
            ask_idx = idx
        elif h in ("price", "p", "last", "lastprice"):
            price_idx = idx

    is_tick = (bid_idx is not None or ask_idx is not None or price_idx is not None)

    if is_tick:
        if bid_idx is not None:
            mapping["bid_idx"] = bid_idx
            mapping["ask_idx"] = ask_idx if ask_idx is not None else bid_idx
        elif ask_idx is not None:
            mapping["ask_idx"] = ask_idx
            mapping["bid_idx"] = ask_idx
        elif price_idx is not None:
            mapping["bid_idx"] = price_idx
            mapping["ask_idx"] = price_idx

        for h, idx in raw_to_idx.items():
            if h in ("volume", "vol", "tickvolume", "tickvol", "v", "size", "qty", "quantity"):
                mapping["vol_idx"] = idx
                break

        return True, mapping

    # If neither clearly matched, raise descriptive error
    raise ValueError(
        f"Unable to recognize columns for Tick or OHLC data.\n"
        f"Found columns: {headers}\n"
        f"Expected either (timestamp + bid/ask) or (timestamp + open/high/low/close)."
    )


def convert_csv_to_parquet(input_file, symbol, timeframe, output_file, chunk_size=250_000):
    """
    Stream and convert CSV file to standardized Parquet file in chunks.
    Ensures sorting, deduplication, price validation, and summary reporting.
    """
    delimiter = detect_csv_dialect(input_file)
    print(f"[*] Detected CSV delimiter: {repr(delimiter)}")

    ts_parser = TimestampParser()
    issues = []
    total_raw_rows = 0
    valid_rows = 0
    skipped_rows = 0
    date_from = None
    date_to = None

    # Determine schema & column indices
    with open(input_file, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.reader(f, delimiter=delimiter)
        header = None
        for row in reader:
            if row and any(c.strip() for c in row):
                header = row
                break

        if not header:
            raise ValueError(f"CSV file {input_file} is empty.")

        is_tick, mapping = map_columns(header)

    print(f"[*] Detected data format: {'TICK' if is_tick else 'OHLC'}")
    target_schema = TICK_SCHEMA if is_tick else OHLC_SCHEMA

    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    writer = pq.ParquetWriter(output_file, target_schema, compression="snappy")

    batch_t_dt = []
    batch_ts_ms = []
    batch_open = []
    batch_high = []
    batch_low = []
    batch_close = []
    batch_vol = []
    batch_bid = []
    batch_ask = []

    last_ts_ms = None
    unsorted_count = 0
    duplicate_count = 0

    def flush_batch():
        nonlocal batch_t_dt, batch_ts_ms, batch_open, batch_high, batch_low, batch_close, batch_vol
        nonlocal batch_bid, batch_ask, writer

        if not batch_ts_ms:
            return

        if is_tick:
            table = pa.Table.from_arrays([
                pa.array(batch_ts_ms, type=pa.int64()),
                pa.array(batch_ask, type=pa.float64()),
                pa.array(batch_bid, type=pa.float64()),
            ], schema=TICK_SCHEMA)
            batch_ts_ms.clear()
            batch_ask.clear()
            batch_bid.clear()
        else:
            table = pa.Table.from_arrays([
                pa.array(batch_t_dt, type=pa.timestamp("us")),
                pa.array(batch_ts_ms, type=pa.int64()),
                pa.array(batch_open, type=pa.float64()),
                pa.array(batch_high, type=pa.float64()),
                pa.array(batch_low, type=pa.float64()),
                pa.array(batch_close, type=pa.float64()),
                pa.array(batch_vol, type=pa.int64()),
            ], schema=OHLC_SCHEMA)
            batch_t_dt.clear()
            batch_ts_ms.clear()
            batch_open.clear()
            batch_high.clear()
            batch_low.clear()
            batch_close.clear()
            batch_vol.clear()

        writer.write_table(table)

    # In-memory buffer for small/medium files to allow complete sorting & deduplication
    file_size_bytes = os.path.getsize(input_file)
    is_small_file = file_size_bytes < 200 * 1024 * 1024  # < 200 MB

    all_records = [] if is_small_file else None

    with open(input_file, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.reader(f, delimiter=delimiter)
        # Skip header
        _ = next(reader, None)

        for row in reader:
            if not row or not any(c.strip() for c in row):
                continue
            total_raw_rows += 1

            # Extract timestamp
            dt_obj = None
            ts_ms = None

            if "date_idx" in mapping and "time_idx" in mapping:
                if len(row) > max(mapping["date_idx"], mapping["time_idx"]):
                    date_part = row[mapping["date_idx"]].strip()
                    time_part = row[mapping["time_idx"]].strip()
                    dt_obj, ts_ms = ts_parser.parse(f"{date_part} {time_part}")
            elif "datetime_idx" in mapping:
                if len(row) > mapping["datetime_idx"]:
                    dt_obj, ts_ms = ts_parser.parse(row[mapping["datetime_idx"]])

            if dt_obj is None or ts_ms is None:
                skipped_rows += 1
                continue

            try:
                if is_tick:
                    bid_val = float(row[mapping["bid_idx"]])
                    ask_val = float(row[mapping["ask_idx"]])
                    if math.isnan(bid_val) or math.isnan(ask_val) or bid_val <= 0 or ask_val <= 0:
                        skipped_rows += 1
                        continue

                    if is_small_file:
                        all_records.append((ts_ms, ask_val, bid_val))
                    else:
                        # Stream check
                        if last_ts_ms is not None:
                            if ts_ms < last_ts_ms:
                                unsorted_count += 1
                            elif ts_ms == last_ts_ms:
                                duplicate_count += 1
                                if batch_ts_ms:
                                    batch_ask[-1] = ask_val
                                    batch_bid[-1] = bid_val
                                continue

                        batch_ts_ms.append(ts_ms)
                        batch_ask.append(ask_val)
                        batch_bid.append(bid_val)
                        last_ts_ms = ts_ms
                        valid_rows += 1

                        if date_from is None or dt_obj < date_from:
                            date_from = dt_obj
                        if date_to is None or dt_obj > date_to:
                            date_to = dt_obj

                        if len(batch_ts_ms) >= chunk_size:
                            flush_batch()
                            print(f"\r   Processed {valid_rows:,} rows...", end="", flush=True)

                else:
                    o = float(row[mapping["open_idx"]])
                    h = float(row[mapping["high_idx"]])
                    l = float(row[mapping["low_idx"]])
                    c = float(row[mapping["close_idx"]])
                    if any(math.isnan(p) or p <= 0 for p in (o, h, l, c)):
                        skipped_rows += 1
                        continue

                    v = 0
                    if "vol_idx" in mapping and len(row) > mapping["vol_idx"]:
                        try:
                            v = int(float(row[mapping["vol_idx"]]))
                        except (ValueError, TypeError):
                            v = 0

                    if is_small_file:
                        all_records.append((dt_obj, ts_ms, o, h, l, c, v))
                    else:
                        if last_ts_ms is not None:
                            if ts_ms < last_ts_ms:
                                unsorted_count += 1
                            elif ts_ms == last_ts_ms:
                                duplicate_count += 1
                                if batch_ts_ms:
                                    batch_open[-1] = o
                                    batch_high[-1] = max(batch_high[-1], h)
                                    batch_low[-1] = min(batch_low[-1], l)
                                    batch_close[-1] = c
                                    batch_vol[-1] += v
                                continue

                        batch_t_dt.append(dt_obj)
                        batch_ts_ms.append(ts_ms)
                        batch_open.append(o)
                        batch_high.append(h)
                        batch_low.append(l)
                        batch_close.append(c)
                        batch_vol.append(v)
                        last_ts_ms = ts_ms
                        valid_rows += 1

                        if date_from is None or dt_obj < date_from:
                            date_from = dt_obj
                        if date_to is None or dt_obj > date_to:
                            date_to = dt_obj

                        if len(batch_ts_ms) >= chunk_size:
                            flush_batch()
                            print(f"\r   Processed {valid_rows:,} rows...", end="", flush=True)

            except (ValueError, IndexError):
                skipped_rows += 1
                continue

    # If small file, sort and deduplicate in memory before writing
    if is_small_file and all_records:
        # Sort by timestamp_ms (index 0 for tick, index 1 for ohlc)
        sort_key_idx = 0 if is_tick else 1
        all_records.sort(key=lambda r: r[sort_key_idx])

        # Deduplicate keeping last
        deduped = []
        for r in all_records:
            t = r[sort_key_idx]
            if deduped and deduped[-1][sort_key_idx] == t:
                duplicate_count += 1
                deduped[-1] = r  # keep last
            else:
                deduped.append(r)

        valid_rows = len(deduped)
        if deduped:
            if is_tick:
                date_from = datetime.datetime.fromtimestamp(deduped[0][0] / 1000.0, tz=datetime.timezone.utc).replace(tzinfo=None)
                date_to = datetime.datetime.fromtimestamp(deduped[-1][0] / 1000.0, tz=datetime.timezone.utc).replace(tzinfo=None)
                for rec in deduped:
                    batch_ts_ms.append(rec[0])
                    batch_ask.append(rec[1])
                    batch_bid.append(rec[2])
                    if len(batch_ts_ms) >= chunk_size:
                        flush_batch()
            else:
                date_from = deduped[0][0]
                date_to = deduped[-1][0]
                for rec in deduped:
                    batch_t_dt.append(rec[0])
                    batch_ts_ms.append(rec[1])
                    batch_open.append(rec[2])
                    batch_high.append(rec[3])
                    batch_low.append(rec[4])
                    batch_close.append(rec[5])
                    batch_vol.append(rec[6])
                    if len(batch_ts_ms) >= chunk_size:
                        flush_batch()

    flush_batch()
    writer.close()

    print()
    if unsorted_count > 0:
        issues.append(f"Detected {unsorted_count:,} out-of-order timestamps in input file.")
    if duplicate_count > 0:
        issues.append(f"Deduplicated {duplicate_count:,} records with duplicate timestamps (kept last).")
    if skipped_rows > 0:
        issues.append(f"Skipped {skipped_rows:,} rows due to unparseable timestamps or invalid/null prices.")

    file_size_mb = os.path.getsize(output_file) / (1024 * 1024) if os.path.exists(output_file) else 0

    print("=" * 60)
    print("CONVERSION SUMMARY:")
    print(f"  Symbol:       {symbol.upper()}")
    print(f"  Type:         {'TICK' if is_tick else 'OHLC (' + timeframe.upper() + ')'}")
    print(f"  Total Rows:   {valid_rows:,} valid (from {total_raw_rows:,} raw)")
    print(f"  Date Range:   {date_from.isoformat() if date_from else 'None'} -> {date_to.isoformat() if date_to else 'None'}")
    print(f"  Output File:  {output_file} ({file_size_mb:.2f} MB)")
    if issues:
        print("  Notes / Issues:")
        for iss in issues:
            print(f"    - {iss}")
    else:
        print("  Status:       Clean conversion with zero issues.")
    print("=" * 60)

    return {
        "ok": True,
        "symbol": symbol.upper(),
        "is_tick": is_tick,
        "rows": valid_rows,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "output_file": output_file,
        "issues": issues,
    }


def convert_parquet_to_standard(input_file, symbol, timeframe, output_file):
    """
    Read an existing Parquet file with arbitrary schema and re-standardize it.
    """
    pf = pq.ParquetFile(input_file)
    schema = pf.schema_arrow
    col_names = schema.names
    print(f"[*] Input Parquet columns: {col_names}")

    is_tick, mapping = map_columns(col_names)
    print(f"[*] Detected format: {'TICK' if is_tick else 'OHLC'}")

    target_schema = TICK_SCHEMA if is_tick else OHLC_SCHEMA
    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    writer = pq.ParquetWriter(output_file, target_schema, compression="snappy")

    ts_parser = TimestampParser()
    valid_rows = 0
    date_from = None
    date_to = None

    for i in range(pf.num_row_groups):
        table = pf.read_row_group(i)
        pydict = table.to_pydict()
        num_rows = table.num_rows

        batch_t_dt = []
        batch_ts_ms = []
        batch_open = []
        batch_high = []
        batch_low = []
        batch_close = []
        batch_vol = []
        batch_bid = []
        batch_ask = []

        # Find raw column names
        dt_col = col_names[mapping.get("datetime_idx", 0)]
        dt_vals = pydict[dt_col]

        if is_tick:
            bid_col = col_names[mapping["bid_idx"]]
            ask_col = col_names[mapping["ask_idx"]]
            bid_vals = pydict[bid_col]
            ask_vals = pydict[ask_col]

            for idx in range(num_rows):
                dt_obj, ts_ms = ts_parser.parse(dt_vals[idx])
                b = float(bid_vals[idx])
                a = float(ask_vals[idx])
                if dt_obj and ts_ms and b > 0 and a > 0:
                    batch_ts_ms.append(ts_ms)
                    batch_ask.append(a)
                    batch_bid.append(b)
                    if date_from is None or dt_obj < date_from:
                        date_from = dt_obj
                    if date_to is None or dt_obj > date_to:
                        date_to = dt_obj

            out_tbl = pa.Table.from_arrays([
                pa.array(batch_ts_ms, type=pa.int64()),
                pa.array(batch_ask, type=pa.float64()),
                pa.array(batch_bid, type=pa.float64()),
            ], schema=TICK_SCHEMA)
            writer.write_table(out_tbl)
            valid_rows += len(batch_ts_ms)

        else:
            o_vals = pydict[col_names[mapping["open_idx"]]]
            h_vals = pydict[col_names[mapping["high_idx"]]]
            l_vals = pydict[col_names[mapping["low_idx"]]]
            c_vals = pydict[col_names[mapping["close_idx"]]]
            v_vals = pydict[col_names[mapping["vol_idx"]]] if "vol_idx" in mapping else [1] * num_rows

            for idx in range(num_rows):
                dt_obj, ts_ms = ts_parser.parse(dt_vals[idx])
                o = float(o_vals[idx])
                h = float(h_vals[idx])
                l = float(l_vals[idx])
                c = float(c_vals[idx])
                v = int(v_vals[idx]) if v_vals[idx] is not None else 0
                if dt_obj and ts_ms and all(p > 0 for p in (o, h, l, c)):
                    batch_t_dt.append(dt_obj)
                    batch_ts_ms.append(ts_ms)
                    batch_open.append(o)
                    batch_high.append(h)
                    batch_low.append(l)
                    batch_close.append(c)
                    batch_vol.append(v)
                    if date_from is None or dt_obj < date_from:
                        date_from = dt_obj
                    if date_to is None or dt_obj > date_to:
                        date_to = dt_obj

            out_tbl = pa.Table.from_arrays([
                pa.array(batch_t_dt, type=pa.timestamp("us")),
                pa.array(batch_ts_ms, type=pa.int64()),
                pa.array(batch_open, type=pa.float64()),
                pa.array(batch_high, type=pa.float64()),
                pa.array(batch_low, type=pa.float64()),
                pa.array(batch_close, type=pa.float64()),
                pa.array(batch_vol, type=pa.int64()),
            ], schema=OHLC_SCHEMA)
            writer.write_table(out_tbl)
            valid_rows += len(batch_ts_ms)

    writer.close()
    file_size_mb = os.path.getsize(output_file) / (1024 * 1024) if os.path.exists(output_file) else 0

    print("=" * 60)
    print("CONVERSION SUMMARY:")
    print(f"  Symbol:       {symbol.upper()}")
    print(f"  Total Rows:   {valid_rows:,}")
    print(f"  Date Range:   {date_from.isoformat() if date_from else 'None'} -> {date_to.isoformat() if date_to else 'None'}")
    print(f"  Output File:  {output_file} ({file_size_mb:.2f} MB)")
    print("=" * 60)

    return {
        "ok": True,
        "symbol": symbol.upper(),
        "is_tick": is_tick,
        "rows": valid_rows,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "output_file": output_file,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Universal Market Data Converter (CSV/Parquet to Standardized ReplayFX Parquet)"
    )
    parser.add_argument("input_file", help="Path to input CSV or Parquet file")
    parser.add_argument("symbol", help="Trading symbol (e.g. EURUSD, NAS100, BTCUSD)")
    parser.add_argument(
        "--timeframe", "-t",
        default="M1",
        help="Timeframe for OHLC data (e.g. M1, M5, H1, D1) or Tick for tick data. Default: M1"
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Explicit output path. Default: server/data/market-data/{SYMBOL}_{TIMEFRAME}.parquet"
    )

    args = parser.parse_args()

    input_file = os.path.abspath(args.input_file)
    if not os.path.exists(input_file):
        print(f"[!] Error: Input file '{input_file}' does not exist.", file=sys.stderr)
        sys.exit(1)

    sym = args.symbol.strip().upper()
    tf = args.timeframe.strip().upper()

    server_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    data_dir = os.path.join(server_dir, "data", "market-data")

    if args.output:
        output_file = os.path.abspath(args.output)
    else:
        # Default filename based on timeframe
        if tf in ("TICK", "TICKS"):
            output_file = os.path.join(data_dir, f"{sym}_Tick.parquet")
        else:
            output_file = os.path.join(data_dir, f"{sym}_{tf}.parquet")

    print(f"[*] Starting conversion for {sym}...")
    print(f"    Input:  {input_file}")
    print(f"    Output: {output_file}")

    # Detect file type
    is_pq = input_file.endswith(".parquet") or input_file.endswith(".pq")

    if is_pq:
        convert_parquet_to_standard(input_file, sym, tf, output_file)
    else:
        convert_csv_to_parquet(input_file, sym, tf, output_file)


if __name__ == "__main__":
    main()

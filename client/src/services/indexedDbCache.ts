/**
 * Lightweight IndexedDB Client Cache for Candle Data
 * Zero-dependency native IndexedDB implementation
 */

const DB_NAME = 'KAFX_MarketData_Cache';
const DB_VERSION = 1;
const STORE_NAME = 'candles_cache';

interface CachedCandlesPayload {
  key: string; // e.g. "XAUUSD_M1" or "XAUUSD_D1"
  symbol: string;
  timeframe: string;
  timestamp: number;
  candles: any[];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedCandles(symbol: string, timeframe: string): Promise<any[] | null> {
  try {
    const db = await openDB();
    const key = `${symbol.toUpperCase()}_${timeframe.toUpperCase()}`;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        const result = req.result as CachedCandlesPayload | undefined;
        if (result && Array.isArray(result.candles) && result.candles.length > 0) {
          // Cache valid if within 24 hours
          const isFresh = Date.now() - result.timestamp < 24 * 60 * 60 * 1000;
          if (isFresh) {
            return resolve(result.candles);
          }
        }
        resolve(null);
      };

      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedCandles(symbol: string, timeframe: string, candles: any[]): Promise<void> {
  if (!candles || candles.length === 0) return;
  try {
    const db = await openDB();
    const key = `${symbol.toUpperCase()}_${timeframe.toUpperCase()}`;
    const payload: CachedCandlesPayload = {
      key,
      symbol: symbol.toUpperCase(),
      timeframe: timeframe.toUpperCase(),
      timestamp: Date.now(),
      candles,
    };

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(payload);
  } catch {
    // Fail silently without disrupting UI
  }
}

export const toSafeNumber = (value: any, fallback = 0): number => {
  if (value === null || value === undefined || Number.isNaN(Number(value)) || !isFinite(Number(value))) {
    return fallback;
  }
  return Number(value);
};

export const formatNumber = (value: any, decimals = 2, fallback = "0.00"): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value)) || !isFinite(Number(value))) {
    return fallback;
  }
  return Number(value).toFixed(decimals);
};

export const formatCurrency = (value: any, currency = "USD", decimals = 2): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value)) || !isFinite(Number(value))) {
    return currency === 'USD' ? '$0.00' : `0.00`;
  }
  const formatted = Number(value).toFixed(decimals);
  if (currency === 'USD') return `$${formatted}`;
  return `${formatted} ${currency}`;
};

export const formatPercent = (value: any, decimals = 1): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value)) || !isFinite(Number(value))) {
    return "0.0%";
  }
  return `${Number(value).toFixed(decimals)}%`;
};

export const formatLot = (value: any): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value)) || !isFinite(Number(value))) {
    return "0.00";
  }
  return Number(value).toFixed(2);
};

export const formatPnL = (value: any, currency = "USD"): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value)) || !isFinite(Number(value))) {
    return currency === 'USD' ? '$0.00' : '0.00';
  }
  const num = Number(value);
  const sign = num > 0 ? '+' : '';
  const formatted = Math.abs(num).toFixed(2);
  if (currency === 'USD') return `${sign}$${formatted}`;
  return `${sign}${formatted} ${currency}`;
};

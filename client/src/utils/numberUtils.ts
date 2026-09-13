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

export const formatCompactPnL = (value: any, currency = "USD"): string => {
  if (value === null || value === undefined || Number.isNaN(Number(value)) || !isFinite(Number(value))) {
    return currency === 'USD' ? '$0' : '0';
  }
  const num = Number(value);
  if (num === 0) {
    return currency === 'USD' ? '$0' : '0';
  }
  const sign = num > 0 ? '+' : '-';
  const abs = Math.abs(num);
  let str = '';
  if (abs >= 1000000) {
    str = (abs / 1000000).toFixed(abs % 1000000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'M';
  } else if (abs >= 1000) {
    str = (abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'k';
  } else if (abs >= 100) {
    str = Math.round(abs).toString();
  } else if (abs % 1 === 0) {
    str = abs.toString();
  } else {
    str = abs.toFixed(2).replace(/\.?0+$/, '');
  }

  if (currency === 'USD') return `${sign}$${str}`;
  return `${sign}${str} ${currency}`;
};


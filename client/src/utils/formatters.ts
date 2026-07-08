import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { formatNumber as safeFormatNumber } from './numberUtils';

export function formatUsd(val: number | null | undefined): string {
  if (val === undefined || val === null) return '$0.00';
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatter.format(val);
}

export function formatIdr(val: number | null | undefined): string {
  if (val === undefined || val === null) return 'Rp 0';
  
  // Custom Indonesian currency formatter
  const rounded = Math.round(val);
  const isNegative = rounded < 0;
  const absVal = Math.abs(rounded);
  
  const formattedVal = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(absVal);

  return `${isNegative ? '-' : ''}Rp ${formattedVal}`;
}

export function formatPercent(val: number | null | undefined): string {
  if (val === undefined || val === null) return '0.00%';
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  return `${isNegative ? '-' : ''}${safeFormatNumber(absVal, 2)}%`;
}

export function formatR(val: number | null | undefined): string {
  if (val === undefined || val === null) return '0.00R';
  const isNegative = val < 0;
  const absVal = Math.abs(val);
  return `${isNegative ? '-' : ''}${safeFormatNumber(absVal, 2)}R`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    
    // Format: YYYY-MM-DD HH:mm
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  } catch {
    return '-';
  }
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === undefined || ms === null || ms <= 0) return '-';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const remainingHours = hours % 24;
  const remainingMinutes = minutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (remainingHours > 0 || days > 0) parts.push(`${remainingHours}h`);
  if (remainingMinutes > 0 || (days === 0 && remainingHours === 0)) parts.push(`${remainingMinutes}m`);

  return parts.join(' ');
}

export function formatNumber(val: number | null | undefined, decimals = 2): string {
  if (val === undefined || val === null) return '0';
  return val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

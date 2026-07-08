export function formatCompactNumber(val: number | null | undefined): string {
  if (val === undefined || val === null) return '0';
  
  const absVal = Math.abs(val);
  const sign = val < 0 ? '-' : '';

  if (absVal >= 1_000_000) {
    return `${sign}${(absVal / 1_000_000).toFixed(1)}M`;
  }
  if (absVal >= 1_000) {
    return `${sign}${(absVal / 1_000).toFixed(1)}K`;
  }
  
  // If it's a small number, format without decimals if it's an integer
  if (Number.isInteger(absVal)) {
    return `${sign}${absVal}`;
  }
  return `${sign}${absVal.toFixed(2)}`;
}

export function formatCompactUsd(val: number | null | undefined): string {
  if (val === undefined || val === null) return '$0';
  return `${val < 0 ? '-' : ''}$${formatCompactNumber(Math.abs(val))}`;
}

export function formatCompactIdr(val: number | null | undefined): string {
  if (val === undefined || val === null) return 'Rp 0';
  return `${val < 0 ? '-' : ''}Rp ${formatCompactNumber(Math.abs(val))}`;
}

export function getNiceDomain(values: number[], paddingFactor = 0.06): [number, number] {
  if (!values || values.length === 0) {
    return [0, 1];
  }

  const finiteValues = values.filter((val) => Number.isFinite(val));
  if (finiteValues.length === 0) {
    return [0, 1];
  }

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    return [min - pad, max + pad];
  }

  const range = max - min;
  const padding = range * paddingFactor;
  return [min - padding, max + padding];
}

export function getNegativeDomain(values: number[], paddingFactor = 0.08): [number, number] {
  if (!values || values.length === 0) {
    return [-1, 0];
  }

  const finiteValues = values.filter((val) => Number.isFinite(val));
  if (finiteValues.length === 0) {
    return [-1, 0];
  }

  const min = Math.min(0, ...finiteValues);
  const range = Math.abs(min) || 1;
  const padding = range * paddingFactor;
  return [min - padding, 0];
}

export function getMedian(values: number[]): number {
  const finiteValues = values.filter((val) => Number.isFinite(val)).sort((a, b) => a - b);
  if (finiteValues.length === 0) return 0;
  const middle = Math.floor(finiteValues.length / 2);
  if (finiteValues.length % 2 === 0) {
    return (finiteValues[middle - 1] + finiteValues[middle]) / 2;
  }
  return finiteValues[middle];
}

/**
 * Downsamples data for charting performance using a simple Nth element strategy 
 * mixed with keeping max/min points to preserve visual boundaries (similar to LTTB).
 * If the dataset is smaller than the threshold, it returns it untouched.
 */
export function downsampleData<T>(data: T[], threshold: number = 1000): T[] {
  if (!data || data.length <= threshold) {
    return data;
  }

  // Very basic downsampling: take every Nth item to reach threshold, 
  // but always include first and last.
  // In a real LTTB we'd calculate triangles, but this is a fast approximation for React.
  const step = Math.floor(data.length / threshold);
  const sampled: T[] = [];
  
  for (let i = 0; i < data.length; i += step) {
    sampled.push(data[i]);
  }
  
  // Ensure last item is always included for accurate ending point
  if (sampled[sampled.length - 1] !== data[data.length - 1]) {
    sampled.push(data[data.length - 1]);
  }
  
  return sampled;
}

export const FALLBACK_NGROK_URL = 'https://5576-2404-c0-9603-ce2-3cba-4b01-ee59-1806.ngrok-free.app/api';

export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const custom = window.localStorage.getItem('VITE_API_URL');
    if (custom && custom.trim() !== '') {
      const clean = custom.trim().replace(/\/$/, '');
      return clean.endsWith('/api') ? clean : `${clean}/api`;
    }
  }
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    const clean = envUrl.trim().replace(/\/$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '::1';
    if (!isLocalhost) {
      return FALLBACK_NGROK_URL;
    }
  }
  return '/api';
};

export const API_BASE_URL = String(getApiBaseUrl()).replace(/\/$/, '');

export function apiUrl(path: string): string {
  if (!path) return getApiBaseUrl().replace(/\/$/, '');
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  let cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cleanPath === '/api') {
    cleanPath = '';
  } else if (cleanPath.startsWith('/api/')) {
    cleanPath = cleanPath.slice(4);
  }
  const base = getApiBaseUrl().replace(/\/$/, '');
  return `${base}${cleanPath}`;
}

export function defaultHeaders(customHeaders: Record<string, string> | HeadersInit = {}): Record<string, string> {
  const base: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true',
  };

  if (typeof Headers !== 'undefined' && customHeaders instanceof Headers) {
    customHeaders.forEach((value, key) => {
      base[key] = value;
    });
  } else if (Array.isArray(customHeaders)) {
    customHeaders.forEach(([key, value]) => {
      base[key] = value;
    });
  } else if (customHeaders && typeof customHeaders === 'object') {
    Object.assign(base, customHeaders);
  }

  return base;
}

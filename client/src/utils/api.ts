export const FALLBACK_NGROK_URL = 'https://college-actors-collectables-grants.trycloudflare.com/api';

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
    const hostname = window.location.hostname;
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1';
    // If accessed via cloudflare tunnel or same host proxy, relative /api works seamlessly
    if (hostname.includes('trycloudflare.com')) {
      return '/api';
    }
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

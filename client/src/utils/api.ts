const getApiBaseUrl = () => {
  const custom = window.localStorage.getItem('VITE_API_URL');
  if (custom) {
    const clean = custom.replace(/\/$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }
  return (import.meta as any).env.VITE_API_URL || '/api';
};
const rawApiBaseUrl = getApiBaseUrl();

export const API_BASE_URL = String(rawApiBaseUrl).replace(/\/$/, '');

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

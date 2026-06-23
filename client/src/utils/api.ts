const rawApiBaseUrl = (import.meta as any).env.VITE_API_URL || '/api';

export const API_BASE_URL = String(rawApiBaseUrl).replace(/\/$/, '');

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

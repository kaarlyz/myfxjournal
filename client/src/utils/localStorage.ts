const ONBOARDING_COMPLETED_KEY = 'onboardingCompleted';
const USER_NAME_KEY = 'userName';

export function getOnboardingCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(ONBOARDING_COMPLETED_KEY) === 'true';
}

export function saveOnboardingCompleted(value: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, String(value));
}

export function getUserName(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(USER_NAME_KEY) || '';
}

export function saveUserName(value: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USER_NAME_KEY, value);
}

export function resetOnboarding(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
  window.localStorage.removeItem(USER_NAME_KEY);
}

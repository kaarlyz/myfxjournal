import { useEffect, useMemo, useState } from 'react';
import { getOnboardingCompleted, getUserName, saveOnboardingCompleted, saveUserName } from '../utils/localStorage';

export function useOnboarding() {
  const [completed, setCompleted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return getOnboardingCompleted();
  });
  const [name, setName] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return getUserName();
  });
  const [isReady, setIsReady] = useState(true);

  useEffect(() => {
    const onboardingCompleted = getOnboardingCompleted();
    const storedName = getUserName();
    setCompleted(onboardingCompleted);
    setName(storedName);
    setIsReady(true);
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return `Good Morning${name ? `, ${name}` : ''}`;
    if (hour < 18) return `Good Afternoon${name ? `, ${name}` : ''}`;
    return `Good Evening${name ? `, ${name}` : ''}`;
  }, [name]);

  const completeOnboarding = (userName: string) => {
    saveUserName(userName);
    saveOnboardingCompleted(true);
    setName(userName);
    setCompleted(true);
  };

  return { completed, name, greeting, isReady, completeOnboarding };
}

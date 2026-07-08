import React, { useMemo, useState } from 'react';
import WelcomeScreen from './WelcomeScreen';
import NameStep from './NameStep';
import GreetingStep from './GreetingStep';

interface OnboardingFlowProps {
  onComplete: (name: string) => void;
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<'welcome' | 'name' | 'greeting'>('welcome');
  const [name, setName] = useState('');

  const currentStep = useMemo(() => {
    if (step === 'welcome') return 0;
    if (step === 'name') return 1;
    return 2;
  }, [step]);

  if (step === 'welcome') {
    return <WelcomeScreen onStart={() => setStep('name')} />;
  }

  if (step === 'name') {
    return <NameStep onNext={(value) => {
      setName(value);
      setStep('greeting');
    }} />;
  }

  return <GreetingStep name={name} onFinish={() => onComplete(name)} />;
}

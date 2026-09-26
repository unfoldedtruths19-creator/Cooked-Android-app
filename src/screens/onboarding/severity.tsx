import { useRouter } from 'expo-router';
import { useState } from 'react';

import { HeatScale } from './heat-scale';
import { OnboardingLayout } from './layout';
import { type LevelKey } from './plan-data';

export function SeverityScreen() {
  const router = useRouter();
  const [level, setLevel] = useState<LevelKey | null>(null);

  return (
    <OnboardingLayout
      step={1}
      title="How cooked are you?"
      highlight="cooked"
      subtitle="Rough guess is fine. Cooked measures the real number from tomorrow."
      canContinue={Boolean(level)}
      onContinue={() =>
        router.push({ pathname: '/onboarding/goals', params: { level: level ?? '' } })
      }
    >
      <HeatScale selected={level} onSelect={setLevel} />
    </OnboardingLayout>
  );
}

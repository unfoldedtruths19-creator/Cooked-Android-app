import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { GoalLedger } from './goal-ledger';
import { OnboardingLayout } from './layout';
import { goalsFor, levelFor } from './plan-data';

export function GoalsScreen() {
  const router = useRouter();
  const { level } = useLocalSearchParams<{ level?: string }>();
  const [selected, setSelected] = useState<string[]>([]);

  const heat = levelFor(level);
  const goals = goalsFor(level);

  function toggle(key: string) {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  return (
    <OnboardingLayout
      step={2}
      title="What do you want back?"
      highlight="back"
      subtitle="Pick as many as apply. Every line is time the phone is taking now."
      note={`Estimated for a ${heat.title.toLowerCase()} week. Cooked replaces these with your real numbers after day one.`}
      canContinue={selected.length > 0}
      onContinue={() =>
        router.push({
          pathname: '/onboarding/apps',
          params: { level: level ?? '', goals: selected.join(',') },
        })
      }
    >
      <GoalLedger goals={goals} selected={selected} onToggle={toggle} />
    </OnboardingLayout>
  );
}

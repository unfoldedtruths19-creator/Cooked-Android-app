import { useLocalSearchParams, useRouter } from 'expo-router';

import { OnboardingLayout } from './layout';
import { PlanCard } from './plan-card';
import { weeklyReclaim } from './plan-data';
import type { BrandKey } from '@/components/app/brand-icon';
import { markOnboardingComplete } from '@/lib/onboarding';

function list(value?: string) {
  return (value ?? '').split(',').filter(Boolean);
}

export function ReadyScreen() {
  const router = useRouter();
  const { level, goals, apps } = useLocalSearchParams<{
    level?: string;
    goals?: string;
    apps?: string;
  }>();

  const goalKeys = list(goals);
  const appKeys = list(apps) as BrandKey[];

  async function handleContinue() {
    await markOnboardingComplete();
    router.replace('/(tabs)/today');
  }

  return (
    <OnboardingLayout
      step={4}
      title="Here is the plan"
      highlight="plan"
      subtitle="Nothing to configure. Start the first session and Cooked takes it from there."
      continueLabel="Start day one"
      canContinue
      onContinue={handleContinue}
    >
      <PlanCard
        level={level}
        goalKeys={goalKeys}
        appKeys={appKeys}
        reclaimMinutes={weeklyReclaim(level, goalKeys)}
      />
    </OnboardingLayout>
  );
}

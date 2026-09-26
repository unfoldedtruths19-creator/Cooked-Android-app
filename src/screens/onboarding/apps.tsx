import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { BlockList } from './block-list';
import { OnboardingLayout } from './layout';
import { useBlockedAppsStore } from '@/state/useBlockedAppsStore';

export function AppsScreen() {
  const router = useRouter();
  const { level, goals, edit } = useLocalSearchParams<{ level?: string; goals?: string; edit?: string }>();
  const { blockedApps, setBlockedApps, loadBlockedApps } = useBlockedAppsStore();
  const isEditMode = edit === '1';
  // Seed from whatever's already saved (e.g. opened from Profile to edit)
  // rather than always resetting to the Instagram/YouTube onboarding
  // defaults — previously this screen ignored the store entirely.
  const [selected, setSelected] = useState<string[]>(
    blockedApps.length > 0 ? blockedApps : ['instagram', 'youtube'],
  );

  useEffect(() => {
    if (isEditMode) loadBlockedApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(key: string) {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  async function handleContinue() {
    // Persist selection so focus screen picks it up
    await setBlockedApps(selected);
    if (isEditMode) {
      router.back();
    } else {
      router.push({
        pathname: '/onboarding/ready',
        params: { level: level ?? '', goals: goals ?? '', apps: selected.join(',') },
      });
    }
  }

  return (
    <OnboardingLayout
      step={3}
      title="Which apps get blocked?"
      highlight="blocked"
      subtitle="Pick the ones you open without deciding to. The bar is what each takes today."
      note="Blocked apps stay shut during focus sessions. Nothing leaves your phone."
      continueLabel={isEditMode ? 'Save' : undefined}
      canContinue={selected.length > 0}
      onContinue={handleContinue}
    >
      <BlockList selected={selected} onToggle={toggle} />
    </OnboardingLayout>
  );
}

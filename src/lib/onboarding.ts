import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'cooked_onboarding_complete';

/**
 * The severity/goals/apps onboarding screens (src/screens/onboarding/*)
 * were previously fully built but never linked from anywhere in the app —
 * no navigation call anywhere pointed at /onboarding. This flag is what
 * lets sync-loading and AuthProvider decide whether a user still needs to
 * go through it.
 */
export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return true; // fail open — never trap a user in onboarding on storage errors
  }
}

export async function markOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch { /* ignore */ }
}

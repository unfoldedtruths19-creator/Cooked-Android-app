import { requireNativeModule } from 'expo-modules-core';

// CookedScreenTimeModule.kt registers itself as "CookedScreenTime"
// This will be undefined in Expo Go — callers in screenTimeNative.ts
// check isModuleAvailable() before calling any method.
let CookedScreenTime: Record<string, (...args: unknown[]) => Promise<unknown>>;

try {
  CookedScreenTime = requireNativeModule('CookedScreenTime');
} catch {
  // Running in Expo Go or a build that hasn't linked the module yet.
  // Return a no-op object so imports don't crash at module load time.
  CookedScreenTime = {} as typeof CookedScreenTime;
}

export default CookedScreenTime;

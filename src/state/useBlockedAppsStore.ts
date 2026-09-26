import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'cooked_blocked_apps';

interface BlockedAppsState {
  blockedApps: string[];
  setBlockedApps: (apps: string[]) => Promise<void>;
  loadBlockedApps: () => Promise<void>;
}

export const useBlockedAppsStore = create<BlockedAppsState>((set) => ({
  blockedApps: ['instagram', 'youtube'],

  setBlockedApps: async (apps: string[]) => {
    set({ blockedApps: apps });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  },

  loadBlockedApps: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) set({ blockedApps: JSON.parse(stored) });
    } catch {}
  },
}));

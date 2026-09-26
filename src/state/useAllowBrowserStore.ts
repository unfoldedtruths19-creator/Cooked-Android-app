import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'cooked_allow_browser';

interface AllowBrowserState {
  allowBrowser: boolean;
  setAllowBrowser: (value: boolean) => Promise<void>;
  loadAllowBrowser: () => Promise<void>;
}

/**
 * Previously every browser was unconditionally blocked whenever any app was
 * blocked, with no way to opt out — so a "Study session" task couldn't use
 * a browser at all. This lets the user explicitly allow it per their own
 * judgment, off by default to keep the original anti-loophole behavior.
 */
export const useAllowBrowserStore = create<AllowBrowserState>((set) => ({
  allowBrowser: false,

  setAllowBrowser: async (value: boolean) => {
    set({ allowBrowser: value });
    await AsyncStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  },

  loadAllowBrowser: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) set({ allowBrowser: stored === '1' });
    } catch {}
  },
}));

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'cooked_session_minutes';

export const SESSION_DURATION_OPTIONS = [25, 50, 90] as const;

interface FocusDurationState {
  minutes: number;
  setMinutes: (minutes: number) => Promise<void>;
  loadMinutes: () => Promise<void>;
}

export const useFocusDurationStore = create<FocusDurationState>((set) => ({
  minutes: 50, // previous fixed default, kept as the fallback

  setMinutes: async (minutes: number) => {
    set({ minutes });
    await AsyncStorage.setItem(STORAGE_KEY, String(minutes));
  },

  loadMinutes: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) set({ minutes: Number(stored) });
    } catch {}
  },
}));

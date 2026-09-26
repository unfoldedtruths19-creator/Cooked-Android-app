import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'cooked_focus_task';

interface FocusTaskState {
  task: string;
  setTask: (task: string) => void;
  loadTask: () => Promise<void>;
  clearTask: () => void;
}

export const useFocusTaskStore = create<FocusTaskState>((set) => ({
  task: '',

  setTask: (task: string) => {
    set({ task });
    AsyncStorage.setItem(STORAGE_KEY, task).catch(() => {});
  },

  loadTask: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) set({ task: stored });
    } catch {}
  },

  clearTask: () => {
    set({ task: '' });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },
}));

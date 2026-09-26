import { create } from "zustand";
import { track, AnalyticsEvents } from "@/lib/analytics";

export type SyncStatus = "idle" | "syncing" | "success" | "error";

interface SyncState {
  status: SyncStatus;
  errorMessage: string | null;
  setStatus: (status: SyncStatus, errorMessage?: string) => void;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: "idle",
  errorMessage: null,

  setStatus: (status, errorMessage) => {
    const prev = get().status;
    set({ status, errorMessage: errorMessage ?? null });
    if (prev === status) return;

    switch (status) {
      case "syncing":
        track(AnalyticsEvents.SYNC_STARTED, { from: prev });
        break;
      case "success":
        track(AnalyticsEvents.SYNC_SUCCESS, { from: prev });
        break;
      case "error":
        track(AnalyticsEvents.SYNC_ERROR, { from: prev, error: errorMessage });
        break;
    }
  },
}));

import { create } from "zustand";
import { track, AnalyticsEvents } from "@/lib/analytics";

export type PermissionStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "fallback";

interface PermissionState {
  status: PermissionStatus;
  /** Number of times the user has requested/re-checked. Useful for funnel drop-off analysis. */
  attemptCount: number;
  setStatus: (status: PermissionStatus) => void;
}

/**
 * Every transition fires the matching PostHog event so the team can see
 * exactly where users drop off in the permission funnel:
 *   idle -> requesting -> granted
 *                      \-> denied -> fallback -> granted (recheck)
 */
export const usePermissionStore = create<PermissionState>((set, get) => ({
  status: "idle",
  attemptCount: 0,

  setStatus: (status) => {
    const prev = get().status;
    if (prev === status) return;

    set({
      status,
      attemptCount: status === "requesting" ? get().attemptCount + 1 : get().attemptCount,
    });

    switch (status) {
      case "requesting":
        track(AnalyticsEvents.PERMISSION_REQUESTED, { from: prev });
        break;
      case "granted":
        track(AnalyticsEvents.PERMISSION_GRANTED, { from: prev });
        break;
      case "denied":
        track(AnalyticsEvents.PERMISSION_DENIED, { from: prev });
        break;
      case "fallback":
        track(AnalyticsEvents.PERMISSION_FALLBACK_VIEWED, { from: prev });
        break;
    }
  },
}));

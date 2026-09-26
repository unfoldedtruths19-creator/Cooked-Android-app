/**
 * Analytics shim — wire up PostHog or any other provider here.
 * Currently logs to console so no events are lost during development.
 */

export function track(event: string, properties?: Record<string, unknown>): void {
  console.log(`[analytics] ${event}`, properties ?? {});
}

export const AnalyticsEvents = {
  // Permission funnel
  PERMISSION_SCREEN_VIEWED: 'permission_screen_viewed',
  PERMISSION_CTA_TAPPED: 'permission_cta_tapped',
  PERMISSION_REQUESTED: 'permission_requested',
  PERMISSION_GRANTED: 'permission_granted',
  PERMISSION_DENIED: 'permission_denied',
  PERMISSION_FALLBACK_VIEWED: 'permission_fallback_viewed',
  PERMISSION_FALLBACK_SETTINGS_OPENED: 'permission_fallback_settings_opened',
  PERMISSION_FALLBACK_RECHECK_TAPPED: 'permission_fallback_recheck_tapped',

  // Sync funnel
  SYNC_STARTED: 'sync_started',
  SYNC_SUCCESS: 'sync_success',
  SYNC_ERROR: 'sync_error',
  SYNC_RETRY_TAPPED: 'sync_retry_tapped',
} as const;

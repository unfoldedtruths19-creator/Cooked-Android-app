import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/functions-js';
import { supabase } from '@/lib/supabase';
import type { RawUsageSession } from './screenTimeNative';

export interface IngestResult {
  inserted: number;
  skipped: number;
  capped: number;
}

/**
 * Posts a batch of raw usage sessions to the `ingest-screen-time` Edge Function.
 *
 * How supabase.functions.invoke works under the hood:
 *  - On non-2xx it throws FunctionsHttpError(response) internally, then catches it
 *    and returns { data: null, error: FunctionsHttpError, response: Response }
 *  - The Response body is ALREADY READ by the time we get the error object —
 *    calling error.context.json() again throws "body already used"
 *  - The correct approach: read the body from result.response (separate field)
 *    BEFORE inspecting error, because result.response is the raw unconsumed Response
 *    only when the error is NOT an HttpError. For HttpError, the body was consumed
 *    to detect the status, so we must read the status from error.context.status
 *    and fall back to error.message for the detail.
 *
 * Error types:
 *  FunctionsHttpError  → non-2xx from edge function (status in error.context.status)
 *  FunctionsRelayError → Supabase relay couldn't reach the function
 *  FunctionsFetchError → network failure before request reached the server
 */
export async function ingestScreenTime(sessions: RawUsageSession[]): Promise<IngestResult> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error("You're not signed in. Please log in again.");
  }

  // ── Invoke ────────────────────────────────────────────────────────────────
  const { data, error } = await supabase.functions.invoke<IngestResult>('ingest-screen-time', {
    body: { sessions },
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
  });

  // ── Error handling ────────────────────────────────────────────────────────

  if (error instanceof FunctionsHttpError) {
    // error.context is the Response object. Body is already consumed internally
    // by supabase-js to detect non-2xx, so we cannot call .json() on it again.
    // Instead read the HTTP status and produce a meaningful message.
    const status = (error.context as Response)?.status ?? 'unknown';

    // Map common statuses to user-facing messages matching the edge function's error responses
    if (status === 401) throw new Error("Session expired — please log in again.");
    if (status === 400) throw new Error("Sync data was rejected by the server. Try again.");
    if (status === 500) throw new Error("Server error — the team has been notified. Try again later.");

    throw new Error(`Sync failed (HTTP ${status}). Please try again.`);
  }

  if (error instanceof FunctionsRelayError) {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }

  if (error instanceof FunctionsFetchError) {
    throw new Error("Network error — make sure you're connected and try again.");
  }

  // Generic error fallback (auth errors, unexpected throws, etc.)
  if (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(msg || "Couldn't sync your screen time. Try again.");
  }

  if (!data) {
    throw new Error('Sync completed but returned no data — please retry.');
  }

  return data;
}

// supabase/functions/ingest-screen-time/index.ts
//
// Receives a batch of raw usage sessions from the device, validates +
// normalizes them, writes them to screen_time_logs (RLS enforced via the
// caller's own JWT), and logs anything that fails to ingest_errors.
//
// Deploy:  supabase functions deploy ingest-screen-time
// Invoke:  POST {SUPABASE_URL}/functions/v1/ingest-screen-time
//          Authorization: Bearer <user_access_token>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// Config / constants
// ---------------------------------------------------------------------------

const SUPABASE_URL             = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY        = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Sessions longer than 4 h are device-clock anomalies — cap them.
const MAX_SESSION_SECONDS = 4 * 60 * 60;

const APP_NAME_MAP: Record<string, string> = {
  "com.instagram.android":          "Instagram",
  "com.zhiliaoapp.musically":       "TikTok",
  "com.google.android.youtube":     "YouTube",
  "com.whatsapp":                   "WhatsApp",
  "com.twitter.android":            "X",
  "com.facebook.katana":            "Facebook",
  "com.snapchat.android":           "Snapchat",
  "com.reddit.frontpage":           "Reddit",
  "com.google.android.apps.maps":   "Google Maps",
  "com.spotify.music":              "Spotify",
  "com.apple.mobilesafari":         "Safari",
  "com.apple.MobileSMS":            "Messages",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawSession {
  package_name:  string;
  platform:      "android" | "ios";
  session_start: string;   // ISO 8601
  session_end:   string;   // ISO 8601
  duration_ms:   number;
  device_id?:    string;
  local_date?:   string;   // 'YYYY-MM-DD' in the device's own timezone
}

interface IngestPayload {
  sessions: RawSession[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanizePackageName(pkg: string): string {
  const known = APP_NAME_MAP[pkg];
  if (known) return known;
  const lastSegment = pkg.split(".").filter(Boolean).pop() ?? pkg;
  const cleaned = lastSegment.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return pkg;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function isValidLocalDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function validateSession(s: unknown): s is RawSession {
  if (typeof s !== "object" || s === null) return false;
  const r = s as Record<string, unknown>;
  return (
    typeof r.package_name === "string" && r.package_name.length > 0 &&
    (r.platform === "android" || r.platform === "ios") &&
    typeof r.session_start === "string" && !isNaN(Date.parse(r.session_start)) &&
    typeof r.session_end   === "string" && !isNaN(Date.parse(r.session_end)) &&
    typeof r.duration_ms === "number"   && r.duration_ms >= 0 &&
    (r.local_date === undefined || isValidLocalDate(r.local_date))
  );
}

// ingest_errors columns on the remote: error_reason (NOT NULL), error_detail,
// error_stage (CHECK: auth|validation|write|normalization), raw_payload (nullable).
// The previous version wrote a non-existent `error_message` column and never
// looked at the result, so every failure was lost silently. supabase-js does not
// throw on DB errors: the { error } value MUST be checked.
async function logIngestError(
  serviceClient: ReturnType<typeof createClient>,
  userId: string | null,
  stage: string,
  message: string,
  rawPayload: unknown,   // null is fine, column is nullable
) {
  try {
    const { error } = await serviceClient.from("ingest_errors").insert({
      user_id:      userId,
      error_reason: stage,                 // NOT NULL
      error_stage:  stage,
      error_detail: message.slice(0, 2000),
      raw_payload:  rawPayload ?? null,
    });
    if (error) console.error("ingest_errors insert failed:", error.message, "| original:", message);
  } catch (e) {
    console.error("Failed to write ingest_errors row:", e, message);
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Service-role client — bypasses RLS, used only for ingest_errors writes.
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");

  if (!accessToken) {
    await logIngestError(serviceClient, null, "auth", "Missing Authorization header", null);
    return jsonResponse({ error: "Missing or invalid Authorization header" }, 401);
  }

  // FIX: Use serviceClient.auth.getUser(token) — this is the correct server-side
  // pattern in supabase-js v2. Calling userClient.auth.getUser(token) with the
  // anon key does NOT work and always returns an auth error (non-2xx root cause).
  const { data: userData, error: authError } = await serviceClient.auth.getUser(accessToken);
  if (authError || !userData?.user) {
    await logIngestError(
      serviceClient, null, "auth",
      authError?.message ?? "Invalid or expired token",
      null,
    );
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const userId = userData.user.id;

  // User-scoped client — all DB writes are RLS-enforced as this user.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  // ── 2. Parse + validate body ───────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    await logIngestError(serviceClient, userId, "validation", "Body is not valid JSON", null);
    return jsonResponse({ error: "Body must be valid JSON" }, 400);
  }

  const body = rawBody as Partial<IngestPayload>;
  if (!body || !Array.isArray(body.sessions) || body.sessions.length === 0) {
    await logIngestError(
      serviceClient, userId, "validation",
      "Missing or empty `sessions` array",
      rawBody,
    );
    return jsonResponse({ error: "`sessions` must be a non-empty array" }, 400);
  }

  const validSessions:   RawSession[] = [];
  const invalidSessions: unknown[]    = [];

  for (const s of body.sessions) {
    if (validateSession(s)) {
      validSessions.push(s);
    } else {
      invalidSessions.push(s);
    }
  }

  if (invalidSessions.length > 0) {
    await logIngestError(
      serviceClient, userId, "validation",
      `${invalidSessions.length} of ${body.sessions.length} sessions failed schema validation`,
      invalidSessions,
    );
  }

  if (validSessions.length === 0) {
    return jsonResponse({ error: "No valid sessions in payload", inserted: 0 }, 400);
  }

  // ── 3. Normalize ───────────────────────────────────────────────────────────
  const rowsToInsert = validSessions.map((s) => {
    const rawSeconds      = Math.round(s.duration_ms / 1000);
    const wasCapped       = rawSeconds > MAX_SESSION_SECONDS;
    const durationSeconds = wasCapped ? MAX_SESSION_SECONDS : rawSeconds;
    // Fall back to the UTC date of session_start when the client didn't send
    // one (e.g. iOS, which doesn't populate local_date yet) — imperfect near
    // midnight, but correct for the vast majority of sessions.
    const localDate = s.local_date ?? s.session_start.slice(0, 10);
    return {
      user_id:          userId,
      package_name:     s.package_name,
      app_name:         humanizePackageName(s.package_name),
      platform:         s.platform,
      session_start:    s.session_start,
      session_end:      s.session_end,
      duration_seconds: durationSeconds,
      was_capped:       wasCapped,
      raw_duration_ms:  s.duration_ms,
      device_id:        s.device_id ?? null,
      local_date:       localDate,
    };
  });

  // ── 4. Write — deduplicated via the unique index on (user_id, package_name, session_start) ────────
  // ON CONFLICT DO NOTHING: if the device re-syncs sessions already in the DB
  // (e.g. after a failed upload), we skip silently rather than returning 409.
  const { data: inserted, error: insertError } = await userClient
    .from("screen_time_logs")
    .upsert(rowsToInsert, {
      onConflict:        "user_id,package_name,session_start",
      ignoreDuplicates:  true,
    })
    .select("id");

  if (insertError) {
    await logIngestError(serviceClient, userId, "write", insertError.message, rowsToInsert);
    return jsonResponse({ error: "Failed to write screen time logs" }, 500);
  }

  return jsonResponse({
    inserted: inserted?.length ?? 0,
    skipped:  invalidSessions.length,
    capped:   rowsToInsert.filter((r) => r.was_capped).length,
  });
});

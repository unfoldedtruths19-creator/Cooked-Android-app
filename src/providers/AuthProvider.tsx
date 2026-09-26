import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useRouter, useSegments } from 'expo-router';
import { hasScreenTimePermission } from '@/services/screenTimeNative';
import { hasCompletedOnboarding } from '@/lib/onboarding';
import { useBlockedAppsStore } from '@/state/useBlockedAppsStore';
import { useFocusTaskStore } from '@/state/useFocusTaskStore';
import { useFocusDurationStore } from '@/state/useFocusDurationStore';
import { useAllowBrowserStore } from '@/state/useAllowBrowserStore';
import { runIncrementalSync } from '@/lib/sync';
import { getActiveFocusSession } from '@/lib/focus';

// AuthApiError names/statuses that mean the token itself is invalid — as
// opposed to a network/timeout error, which getUser() also surfaces as
// `error` but which says nothing about whether the session is still good.
// Treating every getUser() error as "sign out" logged users out whenever
// they opened the app offline or with a flaky connection.
function isInvalidSessionError(error: { status?: number; name?: string } | null): boolean {
  if (!error) return false;
  return error.status === 401 || error.status === 403 || error.name === 'AuthSessionMissingError';
}

type AuthContextType = {
  session: Session | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType>({ session: null, isLoading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession]   = useState<Session | null>(null);
  const [isLoading, setLoading] = useState(true);
  const router   = useRouter();
  const segments = useSegments();
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

  // Load persisted local settings once at app start so Focus-setup and the
  // Focus tab don't fall back to defaults on a cold start.
  useEffect(() => {
    useBlockedAppsStore.getState().loadBlockedApps();
    useFocusTaskStore.getState().loadTask();
    useFocusDurationStore.getState().loadMinutes();
    useAllowBrowserStore.getState().loadAllowBrowser();
  }, []);

  // Whether we've already routed once for the current session — avoids
  // re-navigating the user away from a screen they've since moved to,
  // every time onAuthStateChange happens to re-fire with the same session.
  const routedForUserId = useRef<string | null>(null);

  async function routeIntoApp() {
    // Returning user who already granted permission → skip straight to app.
    let alreadyGranted = false;
    try { alreadyGranted = await hasScreenTimePermission(); } catch { /* dev/Expo Go */ }

    if (!alreadyGranted) {
      routerRef.current.replace('/permission');
      return;
    }
    if (!(await hasCompletedOnboarding().catch(() => true))) {
      routerRef.current.replace('/onboarding');
      return;
    }

    // Startup recovery (spec item 8): ask the DB — not any local/cached
    // flag — whether a focus session is actually still open. This does NOT
    // by itself verify the Android native blocking service is still running
    // for that session: FocusScreen re-issues the native start call on
    // mount, but whether the native module handles that safely for an
    // already-active session is unverified on-device (see focus.tsx). A
    // failed lookup (offline, etc.) must never be read as "a session is
    // active" — it falls through to Home like any other user.
    const { session } = await getActiveFocusSession().catch(() => ({ session: null }));
    if (session) {
      routerRef.current.replace({ pathname: '/(tabs)/focus', params: { ready: '1', sessionId: session.id } });
    } else {
      routerRef.current.replace('/(tabs)/today');
    }

    // Refresh screen-time data in the background — doesn't block navigation,
    // and keeps returning users' stats current instead of stuck at first sync.
    runIncrementalSync().catch(() => {});
  }

  // ── Session bootstrap + auth-state listener ─────────────────────────────
  useEffect(() => {
    async function verifyInitialSession() {
      // 1. Get cached session from local storage
      const { data: { session: cachedSession } } = await supabase.auth.getSession();
      
      if (!cachedSession) {
        setSession(null);
        setLoading(false);
        routerRef.current.replace('/');
        return;
      }

      // 2. Verify cached session against the server
      const { data: userData, error } = await supabase.auth.getUser();

      if (error && !isInvalidSessionError(error) && !userData?.user) {
        // getUser() failed, but NOT because the token is actually invalid —
        // most likely offline or a flaky connection. The previous version
        // treated this the same as an invalid session and signed the user
        // out, so opening the app with no signal logged everyone out.
        // Trust the cached session for now; it gets re-verified next launch
        // (or the moment a real 401/403 comes back from any other call).
        setSession(cachedSession);
        setLoading(false);
        if (routedForUserId.current !== cachedSession.user.id) {
          routedForUserId.current = cachedSession.user.id;
          await routeIntoApp();
        }
      } else if (error || !userData?.user) {
        // Genuinely invalid session (token revoked, user deleted, ...).
        // scope: 'local' only clears this device — signing in on a phone
        // should not silently sign the user out of a tablet or the web app.
        setSession(null);
        setLoading(false);
        await supabase.auth.signOut({ scope: 'local' });
        routerRef.current.replace('/');
      } else {
        // Valid session
        setSession(cachedSession);
        setLoading(false);
        if (routedForUserId.current !== cachedSession.user.id) {
          routedForUserId.current = cachedSession.user.id;
          await routeIntoApp();
        }
      }
    }

    verifyInitialSession();

    // Listen for subsequent auth state changes (e.g. login, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      // Ignore INITIAL_SESSION here since we handle it explicitly above with verification.
      // Calling auth methods inside INITIAL_SESSION can cause infinite recursion loops.
      if (event === 'INITIAL_SESSION') return;

      setSession(s);
      
      if (event === 'SIGNED_IN' && s) {
        setLoading(false);
        if (routedForUserId.current !== s.user.id) {
          routedForUserId.current = s.user.id;
          await routeIntoApp();
        }
      } else if (event === 'SIGNED_OUT') {
        setLoading(false);
        routedForUserId.current = null;
        routerRef.current.replace('/');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Route guard after session resolves ────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;

    const inApp =
      segments[0] === '(tabs)' ||
      segments[0] === 'permission' ||
      segments[0] === 'sync-loading' ||
      segments[0] === 'permission-fallback' ||
      segments[0] === 'onboarding' ||
      segments[0] === 'circles' ||
      segments[0] === 'focus-setup' ||
      segments[0] === 'focus' ||
      segments[0] === 'roast';

    if (!session && inApp) {
      router.replace('/');
    }
  }, [session, isLoading, segments, router]);

  return (
    <AuthContext.Provider value={{ session, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

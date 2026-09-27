import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
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

    const { data: { user } } = await supabase.auth.getUser();
    if (user && !user.user_metadata?.name) {
      routerRef.current.replace('/setup-name');
      return;
    }

    if (!(await hasCompletedOnboarding().catch(() => true))) {
      routerRef.current.replace('/onboarding');
      return;
    }

    // Startup recovery: ask the DB whether a focus session is actually still
    // open. A failed lookup falls through to the dashboard like any other user.
    const { session } = await getActiveFocusSession().catch(() => ({ session: null }));
    if (session) {
      routerRef.current.replace({ pathname: '/(tabs)/focus', params: { ready: '1', sessionId: session.id } });
    } else {
      // Always land on the dashboard — never auto-launch onboarding or focus
      routerRef.current.replace('/(tabs)/today');
    }

    // Refresh screen-time data in the background
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
        // getUser() failed, but NOT because the token is actually invalid.
        // Trust the cached session for now.
        setSession(cachedSession);
        setLoading(false);
        if (routedForUserId.current !== cachedSession.user.id) {
          routedForUserId.current = cachedSession.user.id;
          await routeIntoApp();
        }
      } else if (error || !userData?.user) {
        // Genuinely invalid session (token revoked, user deleted, ...).
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
      segments[0] === 'roast' ||
      segments[0] === 'setup-name';

    const onAuth = segments[0] === undefined || segments[0] === 'login' || segments[0] === 'verify';

    if (!session && inApp) {
      // Not logged in but on an app screen → kick to auth
      router.replace('/');
    } else if (session && onAuth) {
      // Logged in but somehow on an auth screen (e.g. Android Back) →
      // push them back into the app without re-running the full route flow.
      // This prevents the "stuck after Back + re-login" bug.
      router.replace('/(tabs)/today');
    }
  }, [session, isLoading, segments, router]);

  // ── Prevent Android Back from escaping the authenticated app ──────────────
  // When the user is on the dashboard (tabs), pressing Back should exit the
  // app, NOT navigate back to the auth stack. Without this, Back from the
  // dashboard popped the stack to the signup screen, creating a broken state
  // where re-login couldn't route back to the dashboard because
  // routedForUserId was still set.
  useEffect(() => {
    if (isLoading || !session) return;

    const isOnTabs = segments[0] === '(tabs)';
    if (!isOnTabs) return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Let the OS handle the back press (minimize the app)
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, [isLoading, session, segments]);

  return (
    <AuthContext.Provider value={{ session, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

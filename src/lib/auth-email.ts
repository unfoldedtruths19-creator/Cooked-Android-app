import { supabase } from './supabase';

// ── Email / password helpers ─────────────────────────────────────
// This module has ZERO Google OAuth or WebBrowser dependencies.
// It is the sole source of truth for email/password authentication.

export async function signUpWithEmail(email: string, password: string) {
  return await supabase.auth.signUp({ email, password });
}

export async function signInWithEmail(email: string, password: string) {
  return await supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return await supabase.auth.signOut();
}

export async function getCurrentSession() {
  return await supabase.auth.getSession();
}

export async function getCurrentUser() {
  return await supabase.auth.getUser();
}

export async function resendSignupConfirmation(email: string) {
  return await supabase.auth.resend({ type: 'signup', email });
}

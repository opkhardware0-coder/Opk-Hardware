// Auth helpers around Supabase Auth. All real authentication; no hardcoded credentials.
import { supabase, isConfigured } from './supabase.js';

export const LOGIN_PAGE = '/login';

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/** Redirects to login when there is no valid session. Returns the session otherwise. */
export async function requireAuth() {
  if (!isConfigured) return { session: null, notConfigured: true };
  const session = await getSession();
  if (!session) {
    const next = encodeURIComponent(location.pathname);
    location.replace(`${LOGIN_PAGE}?next=${next}`);
    return { session: null, redirecting: true };
  }
  // Verify the token with the server, not just local storage.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    await supabase.auth.signOut();
    location.replace(LOGIN_PAGE);
    return { session: null, redirecting: true };
  }
  return { session, user: data.user };
}

export async function signIn(email, password, remember) {
  // Supabase persists sessions in localStorage. When "remember me" is off we sign out on tab close.
  if (!remember) sessionStorage.setItem('opk_session_only', '1');
  else sessionStorage.removeItem('opk_session_only');
  localStorage.setItem('opk_remember', remember ? '1' : '0');
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  await supabase?.auth.signOut();
  localStorage.removeItem('opk_remember');
  location.replace(LOGIN_PAGE);
}

export function sendPasswordReset(email) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/login` });
}

/** If remember-me was off and this is a brand-new browser session, end the stale session. */
export async function enforceSessionOnly() {
  if (!supabase) return;
  if (localStorage.getItem('opk_remember') === '0' && !sessionStorage.getItem('opk_session_only')) {
    await supabase.auth.signOut();
    localStorage.removeItem('opk_remember');
  }
}

/** Reads role/profile once the Phase 2 schema exists; degrades gracefully before then. */
export async function loadProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('full_name, role').eq('id', userId).maybeSingle();
  if (error) return { profile: null, schemaMissing: true };
  return { profile: data };
}

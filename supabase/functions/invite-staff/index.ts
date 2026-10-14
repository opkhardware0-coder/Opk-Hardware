import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const appUrlValue = Deno.env.get('OPK_APP_URL') ?? '';
const additionalOrigins = (Deno.env.get('OPK_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function jsonResponse(body: unknown, status: number, origin = '') {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  const requestOrigin = request.headers.get('origin') ?? '';
  let appUrl: URL;
  try {
    appUrl = new URL(appUrlValue);
  } catch {
    return jsonResponse({ error: 'Staff invitations are not configured. Set OPK_APP_URL for this function.' }, 500);
  }
  if (appUrl.protocol !== 'https:' && !(appUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(appUrl.hostname))) {
    return jsonResponse({ error: 'OPK_APP_URL must use HTTPS, except for local development.' }, 500);
  }

  const allowedOrigins = new Set([appUrl.origin, ...additionalOrigins]);
  const originAllowed = !requestOrigin || allowedOrigins.has(requestOrigin);
  const responseOrigin = originAllowed ? requestOrigin || appUrl.origin : '';

  if (request.method === 'OPTIONS') {
    return originAllowed
      ? new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': responseOrigin,
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Vary': 'Origin',
      } })
      : jsonResponse({ error: 'This application origin is not allowed.' }, 403);
  }
  if (!originAllowed) return jsonResponse({ error: 'This application origin is not allowed.' }, 403);
  if (request.method !== 'POST') return jsonResponse({ error: 'Use POST to invite staff.' }, 405, responseOrigin);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('invite-staff is missing a required Supabase environment variable.');
    return jsonResponse({ error: 'Staff invitations are not configured on the server.' }, 500, responseOrigin);
  }

  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return jsonResponse({ error: 'Sign in again before inviting staff.' }, 401, responseOrigin);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400, responseOrigin);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Request body must be a JSON object.' }, 400, responseOrigin);
  }
  const payload = body as Record<string, unknown>;
  const fullName = typeof payload.full_name === 'string' ? payload.full_name.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!fullName || fullName.length > 100 || /[\u0000-\u001f\u007f]/.test(fullName)) {
    return jsonResponse({ error: 'Enter a staff name of 1 to 100 characters.' }, 400, responseOrigin);
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'Enter a valid staff email address.' }, 400, responseOrigin);
  }

  try {
    const caller = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await caller.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Your sign-in has expired. Sign in again before inviting staff.' }, 401, responseOrigin);
    }
    const { data: actor, error: profileError } = await caller
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profileError) {
      console.error('invite-staff could not read the caller profile:', profileError.message);
      return jsonResponse({ error: 'Could not verify your staff permissions.' }, 403, responseOrigin);
    }
    if (!actor || !['admin', 'manager'].includes(actor.role)) {
      return jsonResponse({ error: 'Admin or manager access is required to invite staff.' }, 403, responseOrigin);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const redirectTo = new URL('/login', appUrl).toString();
    const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo,
    });
    if (inviteError) {
      console.error('invite-staff could not send an invitation:', inviteError.message);
      return jsonResponse({ error: inviteError.message }, 400, responseOrigin);
    }
    if (!invitation.user) {
      console.error('invite-staff returned no user after an invitation request.');
      return jsonResponse({ error: 'The invitation was requested, but no account details were returned.' }, 502, responseOrigin);
    }

    return jsonResponse({
      user: { id: invitation.user.id, email: invitation.user.email },
    }, 200, responseOrigin);
  } catch (error) {
    console.error('invite-staff failed:', error);
    return jsonResponse({ error: 'The staff invitation could not be completed. Check the Edge Function logs.' }, 500, responseOrigin);
  }
});

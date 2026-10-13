import { supabase, isConfigured } from './supabase.js';
import { getSession, signIn, sendPasswordReset, enforceSessionOnly } from './auth.js';

const $ = (id) => document.getElementById(id);
const notice = $('notice');
$('yr').textContent = new Date().getFullYear();

function showNotice(msg, type = 'error') {
  notice.className = `alert alert-${type}`;
  notice.textContent = msg;
  notice.hidden = false;
}
function clearNotice() { notice.hidden = true; }
function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.innerHTML = loading ? '<span class="spinner" aria-hidden="true"></span> Please wait…' : label;
}
function fieldError(inputId, errId, msg) {
  $(errId).textContent = msg || '';
  $(inputId).setAttribute('aria-invalid', msg ? 'true' : 'false');
}
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function show(which) {
  clearNotice();
  $('login-form').hidden = which !== 'login';
  $('reset-form').hidden = which !== 'reset';
  $('newpw-form').hidden = which !== 'newpw';
  $('form-title').textContent = { login: 'Welcome back', reset: 'Reset your password', newpw: 'Choose a new password' }[which];
  $('form-sub').textContent = {
    login: 'Sign in to your business workspace.',
    reset: "Enter your email and we'll send you a reset link.",
    newpw: 'Use at least 8 characters.',
  }[which];
}

function safeNext() {
  const n = new URLSearchParams(location.search).get('next') || '';
  // Only same-site absolute paths; never allow open redirects.
  return /^\/[A-Za-z0-9\-_/]*$/.test(n) && !n.startsWith('//') && n !== '/login' ? n : '/dashboard';
}

function isRecoveryCallback() {
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  return query.has('code') || query.get('type') === 'recovery' || hash.get('type') === 'recovery';
}

async function init() {
  if (!isConfigured) {
    showNotice('Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY (see README) and rebuild.', 'info');
    $('submit').disabled = true;
    return;
  }

  const resetRequested = new URLSearchParams(location.search).get('reset') === '1';
  if (resetRequested) show('reset');

  let recoveryFlow = isRecoveryCallback();
  if (recoveryFlow) show('newpw');

  // Password recovery can arrive as a query-string code (PKCE) or URL hash.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      recoveryFlow = true;
      show('newpw');
    }
  });

  await enforceSessionOnly();
  const session = await getSession();
  if (session && !recoveryFlow && !resetRequested) location.replace(safeNext());
}

$('toggle-pw').addEventListener('click', () => {
  const pw = $('password');
  const show = pw.type === 'password';
  pw.type = show ? 'text' : 'password';
  $('toggle-pw').textContent = show ? 'Hide' : 'Show';
  $('toggle-pw').setAttribute('aria-pressed', String(show));
});
$('show-reset').addEventListener('click', () => { $('reset-email').value = $('email').value; show('reset'); });
$('back-login').addEventListener('click', () => show('login'));

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearNotice();
  const email = $('email').value.trim();
  const password = $('password').value;
  fieldError('email', 'email-err', emailOk(email) ? '' : 'Enter a valid email address.');
  fieldError('password', 'password-err', password ? '' : 'Enter your password.');
  if (!emailOk(email) || !password) return;

  const btn = $('submit');
  setLoading(btn, true);
  const { error } = await signIn(email, password, $('remember').checked);
  if (error) {
    setLoading(btn, false, 'Sign in');
    showNotice(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message);
    return;
  }
  location.replace(safeNext());
});

$('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('reset-email').value.trim();
  fieldError('reset-email', 'reset-err', emailOk(email) ? '' : 'Enter a valid email address.');
  if (!emailOk(email)) return;
  const btn = $('reset-submit');
  setLoading(btn, true);
  const { error } = await sendPasswordReset(email);
  setLoading(btn, false, 'Send reset link');
  if (error) showNotice(error.message);
  else showNotice('If that email belongs to a staff account, a reset link is on its way.', 'success');
});

$('newpw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('new-password').value;
  fieldError('new-password', 'newpw-err', pw.length >= 8 ? '' : 'Password must be at least 8 characters.');
  if (pw.length < 8) return;
  const btn = $('newpw-submit');
  setLoading(btn, true);
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) { setLoading(btn, false, 'Update password'); showNotice(error.message); return; }
  location.replace('/dashboard');
});

init();

// App shell: auth guard, collapsible sidebar, top bar, user chip. Every protected page calls mountShell().
import { requireAuth, signOut, loadProfile } from './auth.js';
import { escapeHtml } from './ui.js';

const I = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const NAV = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: I('<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>') },
  { id: 'products', label: 'Products & Categories', href: '/products', icon: I('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/>'), phase: 3 },
  { id: 'inventory', label: 'Inventory', href: '/inventory', icon: I('<path d="M3 7h18M5 7v13h14V7M9 11h6"/><path d="M4 3h16l1 4H3z"/>'), phase: 5 },
  { id: 'sales', label: 'Sales History', href: '/sales', icon: I('<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>'), phase: 4 },
  { id: 'reports', label: 'Reports', href: '/reports', icon: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'), phase: 5 },
  { id: 'settings', label: 'Settings', href: '/settings', icon: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900l2.100 2.100M17 17l2.100 2.100M4.900 19.100L7 17M17 7l2.100-2.100"/>'), phase: 5 },
];

const MODULE_PAGES = new Set(['dashboard', 'products', 'inventory', 'sales', 'reports', 'settings']);
const PAGE_TITLES = new Map(NAV.map(({ id, label }) => [id, label]));
const APPEARANCE_KEY = 'opk_appearance';
const APPEARANCE_OPTIONS = ['light', 'dark', 'system'];
const systemColorScheme = window.matchMedia('(prefers-color-scheme: dark)');

function applyAppearance(preference = localStorage.getItem(APPEARANCE_KEY) || 'system') {
  const selected = APPEARANCE_OPTIONS.includes(preference) ? preference : 'system';
  const resolved = selected === 'system' ? (systemColorScheme.matches ? 'dark' : 'light') : selected;
  document.documentElement.dataset.theme = resolved;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = resolved === 'dark' ? '#101722' : '#0B2345';
  const button = document.getElementById('appearance-toggle');
  if (button) {
    button.setAttribute('aria-label', `Appearance: ${selected}`);
    button.title = `Appearance: ${selected}`;
    button.innerHTML = resolved === 'dark'
      ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5z"/></svg>'
      : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
  }
  document.querySelectorAll('[data-appearance-choice]').forEach((choice) => {
    choice.setAttribute('aria-pressed', String(choice.dataset.appearanceChoice === selected));
  });
}

applyAppearance();
systemColorScheme.addEventListener('change', () => {
  if ((localStorage.getItem(APPEARANCE_KEY) || 'system') === 'system') applyAppearance('system');
});

function modulePageFromUrl(url) {
  const page = url.pathname.replace(/\/+$/, '').split('/').pop() || 'dashboard';
  return page === 'pos' ? 'products' : MODULE_PAGES.has(page) ? page : null;
}

export async function mountShell({ page, title, live = NAV.map((n) => n.id) }) {
  const root = document.getElementById('app');
  const authStart = performance.now();
  let auth;
  try {
    auth = await requireAuth();
  } catch (error) {
    root.removeAttribute('aria-busy');
    root.innerHTML = `<div class="content"><div class="alert alert-error" role="alert">Could not verify your sign-in. ${escapeHtml(error.message || 'Please try again.')}</div><p><a href="/login">Return to sign in</a></p></div>`;
    return null;
  }
  if (auth.redirecting) return null;
  if (auth.notConfigured) {
    root.removeAttribute('aria-busy');
    root.innerHTML = `<div class="content"><div class="alert alert-info">Supabase is not configured. Set <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> (see README), then rebuild.</div><p><a href="/login">Go to sign in</a></p></div>`;
    return null;
  }

  const { profile } = await loadProfile(auth.user.id);
  const name = profile?.full_name || auth.user.email;
  const role = profile?.role || 'unassigned';
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
  const collapsed = localStorage.getItem('opk_sidebar') === 'collapsed';

  root.innerHTML = `
  <div class="app ${collapsed ? 'collapsed' : ''}" id="shell">
    <aside class="sidebar" aria-label="Main navigation">
      <div class="brand">
        <a class="logo" href="/dashboard" aria-label="OPK HARDWARES dashboard">
          <span class="brand-logo"><img src="/assets/images/opk-logo.png" alt=""></span>
          <span class="logo-text"><strong>OPK</strong><span>HARDWARES</span></span>
        </a>
        <button class="sidebar-toggle" id="collapse" aria-label="Collapse sidebar" aria-pressed="${collapsed}">&#9776;</button>
      </div>
      <ul class="nav">
        ${NAV.map((n) => `<li><a href="${n.href}" title="${n.label}" ${MODULE_PAGES.has(n.id) ? `data-module-page="${n.id}"` : ''} ${n.id === page ? 'aria-current="page"' : ''}>${n.icon}<span class="label">${n.label}</span>${n.phase && !live.includes(n.id) ? '<span class="soon">Soon</span>' : ''}</a></li>`).join('')}
        <li class="nav-logout"><button id="logout" title="Log out"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/></svg><span class="label">Log out</span></button></li>
      </ul>
    </aside>
    <div class="scrim" id="scrim"></div>
    ${MODULE_PAGES.has(page) || page === 'pos' ? `<nav class="mobile-nav" aria-label="Quick navigation">
      ${['dashboard', 'products', 'sales', 'inventory'].map((id) => {
        const item = NAV.find((entry) => entry.id === id);
        return `<a href="${item.href}" data-module-page="${id}" ${id === page || (id === 'products' && page === 'pos') ? 'aria-current="page"' : ''}>${item.icon}<span>${id === 'dashboard' ? 'Home' : id === 'products' ? 'Products' : id === 'inventory' ? 'Stock' : 'Sales'}</span></a>`;
      }).join('')}
    </nav>` : ''}
    <div class="main">
      <header class="topbar">
        <button class="menu-btn" id="menu" aria-label="Open menu">&#9776;</button>
        <h1>${escapeHtml(title)}</h1>
        <input class="input search" type="search" id="global-search" placeholder="Search products, receipts, customers…" aria-label="Search">
        <div class="appearance-control">
          <button class="appearance-toggle" id="appearance-toggle" type="button" aria-label="Appearance settings" aria-expanded="false" aria-controls="appearance-menu" title="Appearance settings">
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>
          </button>
          <div class="appearance-menu" id="appearance-menu" role="group" aria-label="Choose appearance" hidden>
            ${APPEARANCE_OPTIONS.map((option) => `<button type="button" data-appearance-choice="${option}" aria-pressed="false">${option[0].toUpperCase()}${option.slice(1)}</button>`).join('')}
          </div>
        </div>
        <div class="user-chip"><div class="avatar" aria-hidden="true">${escapeHtml(initials)}</div>
          <div class="user-meta"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(role.replace('_', ' '))}</small></div></div>
      </header>
      <main class="content workspace-content" id="content"></main>
    </div>
  </div>`;
  root.removeAttribute('aria-busy');

  const shell = document.getElementById('shell');
  document.getElementById('collapse').addEventListener('click', () => {
    const c = shell.classList.toggle('collapsed');
    localStorage.setItem('opk_sidebar', c ? 'collapsed' : 'open');
  });
  document.getElementById('menu').addEventListener('click', () => shell.classList.add('nav-open'));
  document.getElementById('scrim').addEventListener('click', () => shell.classList.remove('nav-open'));
  document.getElementById('logout').addEventListener('click', signOut);
  const appearanceToggle = document.getElementById('appearance-toggle');
  const appearanceMenu = document.getElementById('appearance-menu');
  appearanceToggle.addEventListener('click', () => {
    const isExpanded = appearanceToggle.getAttribute('aria-expanded') === 'true';
    appearanceToggle.setAttribute('aria-expanded', String(!isExpanded));
    appearanceMenu.hidden = isExpanded;
  });
  appearanceMenu.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-appearance-choice]');
    if (!choice) return;
    localStorage.setItem(APPEARANCE_KEY, choice.dataset.appearanceChoice);
    applyAppearance(choice.dataset.appearanceChoice);
    appearanceMenu.hidden = true;
    appearanceToggle.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('.appearance-control')) return;
    appearanceMenu.hidden = true;
    appearanceToggle.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || appearanceMenu.hidden) return;
    appearanceMenu.hidden = true;
    appearanceToggle.setAttribute('aria-expanded', 'false');
    appearanceToggle.focus();
  });
  applyAppearance();

  const updateModuleRoute = (url) => {
    const nextPage = modulePageFromUrl(url) || 'dashboard';
    const nextTitle = PAGE_TITLES.get(nextPage) || 'Dashboard';
    document.body.dataset.page = nextPage;
    const titleEl = document.querySelector('.topbar h1');
    if (titleEl) titleEl.textContent = nextTitle;
    document.querySelectorAll('[data-module-page]').forEach((link) => {
      const isCurrent = link.dataset.modulePage === nextPage;
      if (isCurrent) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    shell.classList.remove('nav-open');
    window.dispatchEvent(new CustomEvent('opk:navigate', { detail: { page: nextPage, url } }));
  };
  root.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || !window.__opkModuleNavigation || event.defaultPrevented
      || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !modulePageFromUrl(url)) return;
    if (window.__opkCheckoutInProgress) {
      event.preventDefault();
      const notice = document.getElementById('page-alert');
      if (notice) {
        notice.className = 'alert alert-warning';
        notice.textContent = 'The sale is still processing. Please wait for its confirmation before leaving checkout.';
        notice.hidden = false;
      }
      return;
    }
    event.preventDefault();
    if (url.href !== location.href) history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    updateModuleRoute(url);
  });
  window.addEventListener('popstate', () => updateModuleRoute(new URL(location.href)));

  return { user: auth.user, profile, content: document.getElementById('content') };
}

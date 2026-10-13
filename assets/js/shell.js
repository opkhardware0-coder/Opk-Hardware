// App shell: auth guard, collapsible sidebar, top bar, user chip. Every protected page calls mountShell().
import { requireAuth, signOut, loadProfile } from './auth.js';
import { escapeHtml } from './ui.js';

const I = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const NAV = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: I('<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>') },
  { id: 'pos', label: 'Point of Sale', href: '/pos', icon: I('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0"/>'), phase: 4 },
  { id: 'products', label: 'Products & Categories', href: '/products', icon: I('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/>'), phase: 3 },
  { id: 'inventory', label: 'Inventory', href: '/inventory', icon: I('<path d="M3 7h18M5 7v13h14V7M9 11h6"/><path d="M4 3h16l1 4H3z"/>'), phase: 5 },
  { id: 'customers', label: 'Customers', href: '/customers', icon: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.900 6.500 5.500"/><path d="M16 4.800a3.500 3.500 0 010 6.400M18 14.800c2 .6 3.200 2.300 3.500 5.200"/>'), phase: 5 },
  { id: 'sales', label: 'Sales History', href: '/sales', icon: I('<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>'), phase: 4 },
  { id: 'suppliers', label: 'Suppliers', href: '/suppliers', icon: I('<path d="M1 6h13v10H1z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'), phase: 5 },
  { id: 'purchases', label: 'Purchasing', href: '/purchases', icon: I('<path d="M5 7h14l-1.500 12H6.500z"/><path d="M9 7a3 3 0 016 0"/>'), phase: 5 },
  { id: 'expenses', label: 'Expenses', href: '/expenses', icon: I('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.500"/>'), phase: 5 },
  { id: 'reports', label: 'Reports', href: '/reports', icon: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'), phase: 5 },
  { id: 'staff', label: 'Staff & Users', href: '/staff', icon: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.200 2 8 6"/>'), phase: 2 },
  { id: 'settings', label: 'Settings', href: '/settings', icon: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900l2.100 2.100M17 17l2.100 2.100M4.900 19.100L7 17M17 7l2.100-2.100"/>'), phase: 5 },
];

export async function mountShell({ page, title, live = [] }) {
  const root = document.getElementById('app');
  const auth = await requireAuth();
  if (auth.redirecting) return null;
  if (auth.notConfigured) {
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
        <a class="logo" href="/dashboard"><span class="logo-mark" aria-hidden="true">OPK</span>
          <span class="logo-text"><strong>OPK</strong><span>HARDWARES</span></span></a>
        <button class="sidebar-toggle" id="collapse" aria-label="Collapse sidebar" aria-pressed="${collapsed}">&#9776;</button>
      </div>
      <ul class="nav">
        ${NAV.map((n) => `<li><a href="${n.href}" title="${n.label}" ${n.id === page ? 'aria-current="page"' : ''}>${n.icon}<span class="label">${n.label}</span>${n.phase && !live.includes(n.id) ? '<span class="soon">Soon</span>' : ''}</a></li>`).join('')}
        <li style="margin-top:auto"><button id="logout" title="Log out"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/></svg><span class="label">Log out</span></button></li>
      </ul>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main">
      <header class="topbar">
        <button class="menu-btn" id="menu" aria-label="Open menu">&#9776;</button>
        <h1>${escapeHtml(title)}</h1>
        <input class="input search" type="search" id="global-search" placeholder="Search products, receipts, customers…" aria-label="Search">
        <div class="user-chip"><div class="avatar" aria-hidden="true">${escapeHtml(initials)}</div>
          <div class="user-meta"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(role.replace('_', ' '))}</small></div></div>
      </header>
      <main class="content" id="content"></main>
    </div>
  </div>`;

  const shell = document.getElementById('shell');
  document.getElementById('collapse').addEventListener('click', () => {
    const c = shell.classList.toggle('collapsed');
    localStorage.setItem('opk_sidebar', c ? 'collapsed' : 'open');
  });
  document.getElementById('menu').addEventListener('click', () => shell.classList.add('nav-open'));
  document.getElementById('scrim').addEventListener('click', () => shell.classList.remove('nav-open'));
  document.getElementById('logout').addEventListener('click', signOut);

  return { user: auth.user, profile, content: document.getElementById('content') };
}

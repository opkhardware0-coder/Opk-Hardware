import { mountShell } from './shell.js';
import { supabase } from './supabase.js';
import { escapeHtml, formatDateTime } from './ui.js';
import { getInstallState, promptInstall } from './pwa.js';

const STAFF_EXPORT_TABLES = [
  { table: 'products', label: 'Products & inventory' },
  { table: 'sales', label: 'Sales history' },
  { table: 'sale_items', label: 'Sale line items' },
  { table: 'customers', label: 'Customers' },
  { table: 'customer_payments', label: 'Customer payments' },
];
const MANAGER_EXPORT_TABLES = [
  { table: 'inventory_movements', label: 'Inventory movements' },
];
const TOUR_KEY = 'opk_tour_completed';
const canManage = (profile) => ['admin', 'manager'].includes(profile?.role);
const TOUR_STEPS = [
  {
    selector: '.topbar h1',
    title: 'Settings and your workspace',
    text: 'Use Settings to install OPK, take the workspace tour, reset this device, and manage staff.',
  },
  {
    selector: '.nav a[href="/dashboard"]',
    title: 'Dashboard overview',
    text: 'The dashboard displays database-backed sales, stock, customer balances, and recent receipts when those records are available.',
  },
  {
    selector: '.nav a[href="/products"]',
    title: 'POS and other modules',
    text: 'The POS and operational pages are connected to the database. Checkout validates stock, pricing, payments, and customer balances in a secured database function.',
  },
  {
    selector: '.user-chip',
    title: 'Your account and role',
    text: 'Your identity and role come from your signed-in account. Owners and managers can invite staff and update supported roles in Settings.',
  },
  {
    selector: '#logout',
    title: 'Sign out safely',
    text: 'Use Log out when you finish. It signs out through Supabase Auth; it does not change or remove business records.',
  },
];

function roleLabel(role) {
  return ({ admin: 'Owner (admin)', manager: 'Manager', cashier: 'Cashier' })[role] || 'Role not assigned';
}

function message(el, text, type = 'info') {
  el.className = `alert alert-${type}`;
  el.textContent = text;
  el.hidden = false;
}

function hideMessage(el) {
  el.hidden = true;
  el.textContent = '';
}

export function renderSettings({ user, profile, content }) {
  const displayName = profile?.full_name || user.user_metadata?.full_name || 'Name not set';
  const role = profile?.role || 'unassigned';
  const exportTables = canManage(profile) ? [...STAFF_EXPORT_TABLES, ...MANAGER_EXPORT_TABLES] : STAFF_EXPORT_TABLES;
  const lastExport = localStorage.getItem('opk_last_export');
  const exportLabel = lastExport ? formatDateTime(lastExport) : 'No exports completed on this device';

  content.innerHTML = `
    <div class="settings-heading">
      <div>
        <h2><span class="settings-heading-icon" aria-hidden="true">⚙</span> Settings</h2>
      </div>
    </div>

    <div class="settings-grid">
      <section class="settings-card install-card settings-install-card" aria-labelledby="install-title">
        <div class="settings-card-heading">
          <div class="settings-icon settings-app-logo" aria-hidden="true"><img src="/assets/images/opk-icon-192.png" alt=""></div>
          <div><h3 id="install-title">Install app</h3><p>Get quick access to OPK on this device.</p></div>
        </div>
        <div id="install-message" class="settings-inline-message" role="status" aria-live="polite"></div>
        <button class="btn btn-primary settings-install-button" id="install-app" type="button">Install app</button>
      </section>

      <section class="settings-card settings-tour-card" aria-labelledby="tour-title">
        <div class="settings-card-heading">
          <div class="settings-icon" aria-hidden="true">◇</div>
          <div><h3 id="tour-title">Guided Tour</h3><p>Take a quick look around the POS.</p></div>
        </div>
        <p id="tour-status" class="settings-help">${localStorage.getItem(TOUR_KEY) === '1' ? 'Tour completed.' : 'Learn the main pages and controls.'}</p>
        <button class="btn btn-primary" id="start-tour" type="button">Start tour</button>
      </section>

      <section class="settings-card settings-reset-card" aria-labelledby="reset-title">
        <div class="settings-card-heading">
          <div class="settings-icon settings-icon-warning" aria-hidden="true">↺</div>
          <div><h3 id="reset-title">Reset app data</h3><p>Clear this device’s app preferences, draft cart, and offline files.</p></div>
        </div>
        <div id="reset-message" role="status" aria-live="polite" hidden></div>
        <button class="btn btn-danger" id="reset-app" type="button">Reset this device</button>
        <p class="settings-help">Keeps your sign-in and all Supabase business records. An unresolved sale retry is retained to prevent duplicate sales.</p>
      </section>

      <section class="settings-card settings-users-card" aria-labelledby="users-title">
        <div class="settings-card-heading">
          <div class="settings-icon" aria-hidden="true">♙</div>
          <div><h3 id="users-title">Users & Staff</h3><p>View staff and manage permitted roles.</p></div>
        </div>
        <div id="users-message" role="status" aria-live="polite"></div>
        ${canManage(profile) ? `<form id="staff-invite-form" class="staff-invite-form">
          <label class="field"><span>Staff member name</span><input class="input" name="full_name" maxlength="100" required></label>
          <label class="field"><span>Email address</span><input class="input" name="email" type="email" maxlength="254" autocomplete="email" required></label>
          <button class="btn btn-primary" type="submit">Invite staff</button>
        </form>` : ''}
        <div id="users-list" class="settings-users-list"><div class="empty">Loading staff profiles…</div></div>
        <p class="settings-help">New staff receive an email to set their password. Invitations create a cashier account; role changes remain subject to Supabase policy.</p>
      </section>

      <section class="settings-card account-card" aria-labelledby="account-title">
        <div class="settings-card-heading">
          <div class="settings-icon" aria-hidden="true">◎</div>
          <div><h3 id="account-title">Your account</h3><p>Signed-in staff details.</p></div>
        </div>
        <dl class="settings-details">
          <div><dt>Name</dt><dd>${escapeHtml(displayName)}</dd></div>
          <div><dt>Email</dt><dd>${escapeHtml(user.email || 'Not provided')}</dd></div>
          <div><dt>Role</dt><dd><span class="badge badge-primary">${escapeHtml(roleLabel(role))}</span></dd></div>
        </dl>
        <a class="settings-text-link" href="/login?reset=1">Reset password</a>
      </section>

      <section class="settings-card settings-export-card" aria-labelledby="protection-title">
        <div class="settings-card-heading">
          <div class="settings-icon" aria-hidden="true">⬇</div>
          <div><h3 id="protection-title">Data Exports</h3><p>Download records available to your signed-in role.</p></div>
        </div>
        <div id="export-message" role="status" aria-live="polite" hidden></div>
        <div class="settings-export-list">
          ${exportTables.map((item) => `<div class="settings-export-row"><div><strong>${item.label}</strong><small>CSV spreadsheet</small></div><button class="btn btn-outline" type="button" data-export="${item.table}">Download CSV</button></div>`).join('')}
        </div>
        <button class="btn btn-secondary settings-backup-button" id="download-backup" type="button">Download JSON business-data backup</button>
        <p class="settings-help"><strong>Last export:</strong> <span id="last-export">${escapeHtml(exportLabel)}</span>. Private credentials are never exported.</p>
      </section>
    </div>

    <div id="tour-root"></div>`;

  setupInstallation();
  setupTour();
  setupExports(content, exportTables);
  setupReset(user.id);
  setupStaffInvitation(profile);
  loadStaffProfiles({ user, profile });
}

function setupStaffInvitation(profile) {
  const form = document.getElementById('staff-invite-form');
  if (!form) return;
  const notice = document.getElementById('users-message');
  const list = document.getElementById('users-list');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canManage(profile)) return message(notice, 'Manager access is required to invite staff.', 'error');
    const formData = new FormData(form);
    const fullName = formData.get('full_name')?.toString().trim() || '';
    const email = formData.get('email')?.toString().trim() || '';
    if (!fullName || fullName.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return message(notice, 'Enter a staff name and a valid email address.', 'error');
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Sending invite…';
    try {
      const { data: invitation, error } = await supabase.functions.invoke('invite-staff', {
        body: { full_name: fullName, email },
      });
      if (error) throw error;
      if (!invitation?.user?.id) throw new Error('The invitation endpoint returned no staff account.');
      list.insertAdjacentHTML('beforeend', `<div class="settings-user-card"><strong>${escapeHtml(fullName)}</strong><span>Cashier · invitation sent</span><small>${escapeHtml(email)}</small></div>`);
      form.reset();
      message(notice, `Invitation sent to ${email}. The staff member can set a password from their email.`, 'success');
    } catch (error) {
      message(notice, `Could not invite staff. ${error.message}`, 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Invite staff';
    }
  });
}

function setupInstallation() {
  const button = document.getElementById('install-app');
  const status = document.getElementById('install-message');
  let installationPending = false;
  const installSteps = () => {
    const agent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(agent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) return 'In Safari, tap Share, then choose “Add to Home Screen”.';
    if (/android/.test(agent)) return 'In Chrome, open the menu (⋮) and choose “Install app” or “Add to Home screen”.';
    if (/edg\//.test(agent)) return 'In Microsoft Edge, open the menu (⋯) and choose Apps > Install this site as an app.';
    if (/chrome|chromium/.test(agent)) return 'In Chrome, use the install icon in the address bar or open the menu (⋮) and choose “Install OPK HARDWARES”.';
    return 'Open this site in Chrome or Edge and use its menu to choose “Install app”. On iPhone or iPad, use Safari Share > “Add to Home Screen”.';
  };
  const update = (showStateMessage = true) => {
    const state = getInstallState();
    if (state === 'installed') installationPending = false;
    button.disabled = state === 'installed' || installationPending;
    button.textContent = state === 'installed' ? 'App installed' : installationPending ? 'Installation requested' : state === 'ready' ? 'Install app' : 'Show install steps';
    if (!showStateMessage) return;
    if (state === 'installed') {
      message(status, 'OPK HARDWARES is installed on this device.', 'success');
    } else if (installationPending) {
      message(status, 'Your browser accepted the installation request. It will finish in the browser interface.', 'info');
    } else if (state === 'unavailable') {
      message(status, `${installSteps()} The browser has not opened its one-tap install prompt.`, 'info');
    } else {
      message(status, 'Ready to install this app on your device.', 'success');
    }
  };
  window.addEventListener('opk-install-availability', update);
  window.addEventListener('opk-app-installed', update);
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const result = await promptInstall();
      if (result.outcome === 'accepted') {
        installationPending = true;
        message(status, 'Your browser accepted the installation request. It will finish in the browser interface.', 'info');
      } else if (result.outcome === 'dismissed') {
        message(status, 'Installation was cancelled. You can install OPK HARDWARES later from this page.', 'info');
      } else if (result.outcome === 'installed') {
        message(status, 'OPK HARDWARES is already installed on this device.', 'success');
      } else {
        message(status, `${installSteps()} The browser has not offered its one-tap install prompt.`, 'info');
      }
    } catch (error) {
      message(status, `The browser could not start installation: ${error.message}`, 'error');
    } finally {
      update(false);
    }
  });
  update();
}

function setupTour() {
  const root = document.getElementById('tour-root');
  let current = -1;
  let highlighted = null;
  let openedNavForTour = false;

  const close = (completed) => {
    document.body.classList.remove('tour-active');
    highlighted?.classList.remove('tour-spotlight');
    highlighted = null;
    if (openedNavForTour) document.getElementById('shell')?.classList.remove('nav-open');
    openedNavForTour = false;
    current = -1;
    root.replaceChildren();
    if (completed) {
      localStorage.setItem(TOUR_KEY, '1');
      const status = document.getElementById('tour-status');
      status.textContent = 'You have completed the current workspace tour.';
    }
  };

  const showStep = (index) => {
    highlighted?.classList.remove('tour-spotlight');
    current = Math.max(0, Math.min(index, TOUR_STEPS.length - 1));
    const step = TOUR_STEPS[current];
    highlighted = document.querySelector(step.selector);
    if (!highlighted) {
      close(false);
      const status = document.getElementById('tour-status');
      message(status, 'This tour step is unavailable on the current page layout.', 'warning');
      return;
    }

    if (window.matchMedia('(max-width: 900px)').matches && highlighted.closest('.sidebar')) {
      const shell = document.getElementById('shell');
      if (shell && !shell.classList.contains('nav-open')) {
        shell.classList.add('nav-open');
        openedNavForTour = true;
      }
    }
    highlighted.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    highlighted.classList.add('tour-spotlight');
    root.innerHTML = `
      <div class="tour-backdrop"></div>
      <section class="tour-dialog" role="dialog" aria-modal="true" aria-labelledby="tour-step-title" aria-describedby="tour-step-copy">
        <div class="tour-progress">STEP ${current + 1} OF ${TOUR_STEPS.length}</div>
        <button class="tour-close" type="button" aria-label="Exit tour">×</button>
        <h3 id="tour-step-title">${escapeHtml(step.title)}</h3>
        <p id="tour-step-copy">${escapeHtml(step.text)}</p>
        <div class="tour-actions">
          <button class="btn btn-ghost tour-skip" type="button">Skip tour</button>
          <div><button class="btn btn-outline tour-back" type="button" ${current === 0 ? 'disabled' : ''}>Back</button>
          <button class="btn btn-primary tour-next" type="button">${current === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}</button></div>
        </div>
      </section>`;

    root.querySelector('.tour-close').addEventListener('click', () => close(false));
    root.querySelector('.tour-skip').addEventListener('click', () => close(false));
    root.querySelector('.tour-back').addEventListener('click', () => showStep(current - 1));
    root.querySelector('.tour-next').addEventListener('click', () => {
      if (current === TOUR_STEPS.length - 1) close(true);
      else showStep(current + 1);
    });
    document.body.classList.add('tour-active');
    root.querySelector('.tour-next').focus();
  };

  document.getElementById('start-tour').addEventListener('click', () => showStep(0));
  document.addEventListener('keydown', (event) => {
    if (current >= 0 && event.key === 'Escape') close(false);
  });
}

async function fetchAllRows(table) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table).select('*').order('id', { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function csvFor(rows) {
  if (!rows.length) return 'No records\n';
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const quote = (value) => {
    let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [keys.map(quote).join(','), ...rows.map((row) => keys.map((key) => quote(row[key])).join(','))].join('\r\n');
}

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setupExports(content, exportTables) {
  const notice = document.getElementById('export-message');
  const last = document.getElementById('last-export');
  const buttons = [...content.querySelectorAll('[data-export]'), document.getElementById('download-backup')];
  const setBusy = (busy) => buttons.forEach((button) => {
    if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? button.id === 'download-backup' ? 'Preparing backup…' : 'Preparing export…' : button.dataset.idleLabel;
  });

  content.querySelectorAll('[data-export]').forEach((button) => {
    button.addEventListener('click', async () => {
      const table = button.dataset.export;
      const descriptor = exportTables.find((item) => item.table === table);
      if (!descriptor) return;
      setBusy(true);
      hideMessage(notice);
      try {
        const rows = await fetchAllRows(table);
        downloadFile(`opk-${table}-${new Date().toISOString().slice(0, 10)}.csv`, csvFor(rows), 'text/csv;charset=utf-8');
        const exportedAt = new Date().toISOString();
        localStorage.setItem('opk_last_export', exportedAt);
        last.textContent = formatDateTime(exportedAt);
        message(notice, `${descriptor.label} export downloaded (${rows.length} records).`, 'success');
      } catch (error) {
        message(notice, `Could not export ${descriptor.label.toLowerCase()}. ${error.message}`, 'error');
      } finally {
        setBusy(false);
      }
    });
  });

  document.getElementById('download-backup').addEventListener('click', async () => {
    setBusy(true);
    hideMessage(notice);
    try {
      const records = {};
      for (const { table } of exportTables) records[table] = await fetchAllRows(table);
      const backup = {
        format: 'opk-business-data',
        version: 1,
        exportedAt: new Date().toISOString(),
        note: 'Only browser-authorized business rows are included. Auth credentials and database secrets are never exported.',
        records,
      };
      downloadFile(`opk-business-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
      const exportedAt = new Date().toISOString();
      localStorage.setItem('opk_last_export', exportedAt);
      last.textContent = formatDateTime(exportedAt);
      const counts = exportTables.map(({ table, label }) => `${records[table].length} ${label.toLowerCase()}`).join(', ');
      message(notice, `Business-data backup downloaded: ${counts}.`, 'success');
    } catch (error) {
      message(notice, `Backup was not created because an authorized data export failed. ${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  });
}

function setupReset(userId) {
  const notice = document.getElementById('reset-message');
  document.getElementById('reset-app').addEventListener('click', async () => {
    const confirmation = window.prompt(
      'This clears OPK preferences, the draft cart, and offline app files on this device only. It does not erase Supabase business data or sign you out. Any unresolved sale retry will be kept to prevent duplicate sales. Type RESET to continue.'
    );
    if (confirmation !== 'RESET') {
      if (confirmation !== null) message(notice, 'Reset cancelled. Type RESET exactly to continue.', 'info');
      return;
    }
    const button = document.getElementById('reset-app');
    button.disabled = true;
    button.textContent = 'Resetting…';
    try {
      localStorage.removeItem('opk_sidebar');
      localStorage.removeItem('opk_settings');
      localStorage.removeItem('opk_products_view');
      localStorage.removeItem('opk_appearance');
      localStorage.removeItem('opk_last_export');
      localStorage.removeItem(TOUR_KEY);
      localStorage.removeItem(`opk_cart_${userId}`);
      localStorage.removeItem(`opk_sale_discount_${userId}`);
      if ('caches' in window) {
        const names = await caches.keys();
        const appCaches = names.filter((name) => name.startsWith('opk-pos-shell-'));
        const results = await Promise.all(appCaches.map((name) => caches.delete(name)));
        if (results.some((deleted) => !deleted)) throw new Error('The browser did not remove every OPK offline cache.');
      }
      message(notice, 'This device’s OPK app preferences and draft cart were reset. Business records and sign-in were kept.', 'success');
      window.setTimeout(() => location.reload(), 1000);
    } catch (error) {
      message(notice, `The reset was incomplete. ${error.message}`, 'error');
      button.disabled = false;
      button.textContent = 'Reset this device';
    }
  });
}

async function loadStaffProfiles({ user, profile }) {
  const list = document.getElementById('users-list');
  const notice = document.getElementById('users-message');
  try {
    const { data, error } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
    if (error) throw error;
    const profiles = [...(data || [])];
    if (!profiles.length) {
      list.innerHTML = '<div class="empty">No staff profiles are visible to this account.</div>';
      return;
    }
    const draw = () => {
      list.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Role</th><th>Account status</th><th>Role management</th></tr></thead><tbody>${profiles.map((row) => {
        const own = row.id === user.id;
        const name = row.full_name || (own ? user.email : 'Name not set');
        const mayChangeRole = canManage(profile) && !own && row.role !== 'admin' && (profile.role === 'admin' || row.role === 'cashier');
        const action = mayChangeRole
          ? `<div class="staff-role-actions"><label class="sr-only" for="settings-role-${row.id}">Role for ${escapeHtml(name)}</label><select class="input role-select" id="settings-role-${row.id}" data-settings-role="${row.id}"><option value="cashier" ${row.role === 'cashier' ? 'selected' : ''}>Cashier</option><option value="manager" ${row.role === 'manager' ? 'selected' : ''}>Manager</option></select><button class="btn btn-outline btn-small" type="button" data-save-settings-role="${row.id}">Save</button></div>`
          : own ? '<span class="badge badge-accent">Your account</span>' : '<span class="module-help">Owner-controlled</span>';
        return `<tr><td><strong>${escapeHtml(name)}</strong>${own ? ' <span class="badge badge-accent">You</span>' : ''}</td><td><span class="badge badge-primary">${escapeHtml(roleLabel(row.role))}</span></td><td><span class="status status-success">Profile exists</span></td><td>${action}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    };
    draw();
    message(notice, `${profiles.length} staff profile${profiles.length === 1 ? '' : 's'} loaded.`, 'info');
    list.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-save-settings-role]');
      if (!button) return;
      const row = profiles.find((item) => item.id === button.dataset.saveSettingsRole);
      const select = list.querySelector(`[data-settings-role="${CSS.escape(button.dataset.saveSettingsRole)}"]`);
      if (!row || !select || select.value === row.role) return;
      if (!window.confirm(`Assign ${select.value} access to ${row.full_name || 'this staff member'}? Supabase will enforce your permissions.`)) return;
      const idleLabel = button.textContent;
      button.disabled = true;
      button.textContent = 'Saving…';
      try {
        const { error: updateError } = await supabase.rpc('set_staff_role', {
          p_staff_id: row.id,
          p_role: select.value,
        });
        if (updateError) throw updateError;
        row.role = select.value;
        draw();
        message(notice, `${row.full_name || 'Staff member'} now has ${roleLabel(row.role)} access.`, 'success');
      } catch (updateError) {
        message(notice, `Could not update this role. ${updateError.message}`, 'error');
        button.disabled = false;
        button.textContent = idleLabel;
      }
    });
  } catch (error) {
    const name = profile?.full_name || user.user_metadata?.full_name || 'Your account';
    list.innerHTML = `<div class="settings-user-card"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(roleLabel(profile?.role))}</span><small>${escapeHtml(user.email || '')}</small></div>`;
    message(notice, `Could not load the authorized staff profile list. Showing only your signed-in profile. ${error.message}`, 'warning');
  }
}

if (!window.__opkContext) {
  try {
    const ctx = await mountShell({ page: 'settings', title: 'Settings' });
    if (ctx) {
      window.__opkContext = ctx;
      window.__opkModuleNavigation = true;
      let activePage = 'settings';
      let routeVersion = 0;
      const routeHandler = async (event) => {
        const nextPage = event.detail.page;
        activePage = nextPage;
        const version = ++routeVersion;
        try {
          if (nextPage === 'settings') {
            renderSettings(ctx);
          } else if (nextPage === 'dashboard') {
            const { renderDashboard } = await import('./dashboard.js');
            if (activePage === nextPage && routeVersion === version) await renderDashboard(ctx);
          } else {
            window.removeEventListener('opk:navigate', routeHandler);
            await import('./modules.js');
          }
        } catch (error) {
          window.addEventListener('opk:navigate', routeHandler);
          if (activePage === nextPage && routeVersion === version) {
            ctx.content.innerHTML = `<div class="alert alert-error" role="alert">Page could not be opened. ${escapeHtml(error.message || 'Please try again.')}</div>`;
          }
        }
      };
      window.addEventListener('opk:navigate', routeHandler);
      renderSettings(ctx);
    }
  } catch (error) {
    const root = document.getElementById('app');
    root.removeAttribute('aria-busy');
    root.innerHTML = `<main class="content"><div class="alert alert-error" role="alert">Settings could not be opened. ${escapeHtml(error.message || 'Please reload and try again.')}</div><p><a href="/dashboard">Return to Dashboard</a></p></main>`;
  }
}

import { mountShell } from './shell.js';
import { supabase } from './supabase.js';
import { escapeHtml, formatDateTime, formatMoney, startOfTodayAccra } from './ui.js';

function isManager(profile) {
  return ['admin', 'manager'].includes(profile?.role);
}

function businessDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(new Date(value));
}

if (!window.__opkContext) {
  try {
    const ctx = await mountShell({ page: 'dashboard', title: 'Dashboard' });
    if (ctx) {
      window.__opkContext = ctx;
      window.__opkModuleNavigation = true;
      let activePage = 'dashboard';
      let routeVersion = 0;
      const routeHandler = async (event) => {
        const nextPage = event.detail.page;
        activePage = nextPage;
        const version = ++routeVersion;
        try {
          if (nextPage === 'dashboard') {
            await renderDashboard({ ...ctx, isCurrent: () => activePage === nextPage && routeVersion === version });
          } else if (nextPage === 'settings') {
            const { renderSettings } = await import('./settings.js');
            if (activePage === nextPage && routeVersion === version) renderSettings(ctx);
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
      await renderDashboard(ctx);
    }
  } catch (error) {
    const root = document.getElementById('app');
    root.removeAttribute('aria-busy');
    root.innerHTML = `<main class="content"><div class="alert alert-error" role="alert">Dashboard could not be opened. ${escapeHtml(error.message || 'Please reload and try again.')}</div><p><a href="/login">Return to sign in</a></p></main>`;
  }
}

export async function renderDashboard({ content, user, profile, isCurrent = () => true }) {
  const name = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'there';
  const manager = isManager(profile);
  const start = startOfTodayAccra();
  const weekStart = new Date(Date.parse(start) - 6 * 24 * 60 * 60 * 1000).toISOString();
  content.innerHTML = `
    <div class="dashboard-welcome">
      <div><p class="settings-eyebrow">OPK HARDWARES WORKSPACE</p><h2>Welcome, ${escapeHtml(name)}</h2><p>${manager ? 'Here is your business at a glance.' : 'Your customer workspace is ready.'}</p></div>
      <span class="badge badge-primary">${escapeHtml(({ admin: 'Owner', manager: 'Manager', cashier: 'Staff' })[profile?.role] || 'Staff')}</span>
    </div>
    <div id="dashboard-message" role="status" aria-live="polite" hidden></div>
    <div class="cards dashboard-cards">
      ${manager ? '<article class="stat"><div class="k">Today’s sales</div><div class="v skeleton" id="today-sales">0000</div><div class="n">Completed sales today</div></article>' : ''}
      <article class="stat"><div class="k">Customers</div><div class="v skeleton" id="customer-count">0000</div><div class="n">Customer records available to you</div></article>
      <article class="stat dashboard-product-stat"><div class="k">Products</div><div class="v skeleton" id="product-count">0000</div><a class="dashboard-card-link" href="/products">${manager ? 'Add or manage products' : 'View product catalog'} <span aria-hidden="true">→</span></a></article>
    </div>
    ${manager ? `
      <section class="panel sales-chart-panel">
        <div class="dashboard-panel-heading"><div><h2>Sales per day</h2><p>Completed sales over the last seven days (GHS)</p></div></div>
        <div id="sales-chart" class="sales-chart-loading" role="status"><span class="spinner" aria-hidden="true"></span> Loading sales activity…</div>
      </section>
      <section class="panel"><h2>Recent sales</h2><div id="recent-sales" class="empty">Loading recent sales…</div></section>` : ''}`;

  const customerCount = supabase.from('customers').select('id', { count: 'exact', head: true });
  const productCount = supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true);
  const salesQuery = manager
    ? supabase.from('sales').select('receipt_no, grand_total, created_at, status').gte('created_at', weekStart).eq('status', 'completed').order('created_at', { ascending: false }).limit(1000)
    : Promise.resolve(null);
  const [customers, products, sales] = await Promise.all([customerCount, productCount, salesQuery]);
  if (!isCurrent()) return;

  if (customers.error) {
    showMessage(`Could not load the customer count. ${customers.error.message}`);
    setValue('customer-count', '—');
  } else {
    setValue('customer-count', new Intl.NumberFormat('en-GH').format(customers.count || 0));
  }

  if (products.error) {
    showMessage(`Could not load the product count. ${products.error.message}`);
    setValue('product-count', '—');
  } else {
    setValue('product-count', new Intl.NumberFormat('en-GH').format(products.count || 0));
  }

  if (!manager) return;
  if (sales.error) {
    showMessage(`Could not load sales activity. ${sales.error.message}`);
    setValue('today-sales', '—');
    document.getElementById('sales-chart').outerHTML = '<div class="empty">Sales chart is unavailable until sales data can be loaded.</div>';
    document.getElementById('recent-sales').textContent = 'Recent sales are unavailable until sales data can be loaded.';
    return;
  }

  const rows = sales.data || [];
  const todayRows = rows.filter((row) => businessDate(row.created_at) >= start.slice(0, 10));
  setValue('today-sales', formatMoney(todayRows.reduce((sum, row) => sum + Number(row.grand_total), 0)));
  renderSalesChart(rows);
  const recent = rows.slice(0, 8);
  document.getElementById('recent-sales').innerHTML = recent.length
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Receipt</th><th>Date</th><th class="numeric">Total</th></tr></thead><tbody>${recent.map((row) => `<tr><td>${escapeHtml(row.receipt_no)}</td><td>${escapeHtml(formatDateTime(row.created_at))}</td><td class="numeric">${formatMoney(row.grand_total)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">No sales in the last seven days.</div>';

}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (!element) return;
  element.classList.remove('skeleton');
  element.textContent = value;
}

function showMessage(text) {
  const element = document.getElementById('dashboard-message');
  element.className = 'alert alert-error';
  element.textContent = text;
  element.hidden = false;
}

function renderSalesChart(rows) {
  const totals = new Map();
  rows.forEach((row) => {
    const day = businessDate(row.created_at);
    totals.set(day, (totals.get(day) || 0) + Number(row.grand_total));
  });

  const today = Date.parse(startOfTodayAccra());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today + (index - 6) * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    return { key, date, total: totals.get(key) || 0 };
  });
  const max = Math.max(...days.map((day) => day.total), 0);
  const dateLabel = new Intl.DateTimeFormat('en-GH', { weekday: 'short', day: 'numeric', timeZone: 'Africa/Accra' });
  const chart = document.getElementById('sales-chart');
  chart.className = 'sales-chart';
  chart.setAttribute('role', 'list');
  chart.setAttribute('aria-label', 'Daily completed sales for the past seven days');
  chart.innerHTML = days.map((day) => {
    const height = max > 0 ? Math.max(4, day.total / max * 100) : 0;
    return `<div class="sales-chart-column" role="listitem" aria-label="${escapeHtml(dateLabel.format(day.date))}: ${escapeHtml(formatMoney(day.total))}">
      <div class="sales-chart-value">${day.total ? escapeHtml(formatMoney(day.total)) : ''}</div>
      <div class="sales-chart-track"><div class="sales-chart-bar" style="height:${height}%"></div></div>
      <div class="sales-chart-label">${escapeHtml(dateLabel.format(day.date))}</div>
    </div>`;
  }).join('');
}

// Dashboard: every figure comes from the database. No fabricated numbers.
import { mountShell } from './shell.js';
import { supabase } from './supabase.js';
import { formatMoney, startOfTodayAccra, escapeHtml } from './ui.js';

const ctx = await mountShell({ page: 'dashboard', title: 'Dashboard' });
if (ctx) render(ctx.content);

const TILES = [
  { id: 'sales', k: "Today's sales" },
  { id: 'txns', k: 'Transactions today' },
  { id: 'stock', k: 'Products in stock' },
  { id: 'low', k: 'Low-stock items', warn: true },
  { id: 'value', k: 'Inventory value (at cost)' },
  { id: 'owed', k: 'Customer balances owed' },
];

async function render(el) {
  el.innerHTML = `<div id="banner"></div><div class="cards">${TILES.map((t) => `
    <div class="stat ${t.warn ? 'warn' : ''}"><div class="k">${t.k}</div><div class="v skeleton" id="v-${t.id}">0000</div><div class="n" id="n-${t.id}"></div></div>`).join('')}</div>
    <section class="panel"><h2>Recent sales</h2><div id="recent"><div class="empty">Loading…</div></div></section>`;

  const set = (id, v, note = '') => {
    const e = document.getElementById(`v-${id}`);
    e.classList.remove('skeleton');
    e.textContent = v;
    document.getElementById(`n-${id}`).textContent = note;
  };

  try {
    const since = startOfTodayAccra();
    const [sales, products, customers, recent] = await Promise.all([
      supabase.from('sales').select('grand_total').gte('created_at', since).neq('status', 'void'),
      supabase.from('products').select('stock_qty, min_stock, cost_price').eq('is_active', true),
      supabase.from('customers').select('balance').gt('balance', 0),
      supabase.from('sales').select('receipt_no, grand_total, created_at').order('created_at', { ascending: false }).limit(8),
    ]);
    const err = [sales, products, customers, recent].find((r) => r.error)?.error;
    if (err) throw err;

    const todays = sales.data || [];
    set('sales', formatMoney(todays.reduce((s, r) => s + Number(r.grand_total), 0)));
    set('txns', String(todays.length));
    const p = products.data || [];
    set('stock', String(p.filter((r) => Number(r.stock_qty) > 0).length), `${p.length} active products`);
    set('low', String(p.filter((r) => Number(r.stock_qty) <= Number(r.min_stock)).length));
    set('value', formatMoney(p.reduce((s, r) => s + Number(r.stock_qty) * Number(r.cost_price), 0)));
    set('owed', formatMoney((customers.data || []).reduce((s, r) => s + Number(r.balance), 0)));

    const rows = recent.data || [];
    document.getElementById('recent').innerHTML = rows.length
      ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Receipt</th><th class="numeric">Total</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escapeHtml(r.receipt_no)}</td><td class="numeric">${formatMoney(r.grand_total)}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">No sales yet. Completed sales will appear here.</div>';
  } catch (e) {
    TILES.forEach((t) => set(t.id, '—'));
    document.getElementById('recent').innerHTML = '<div class="empty">No data available yet.</div>';
    document.getElementById('banner').innerHTML = `<div class="alert alert-info">The database tables are not set up yet, so live figures are unavailable. Run the SQL migration (Phase 2) in Supabase. <small>(${escapeHtml(e.message || 'query failed')})</small></div>`;
  }
}

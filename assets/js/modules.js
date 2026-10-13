import { mountShell } from './shell.js';
import { supabase } from './supabase.js';
import { escapeHtml, formatDateTime, formatMoney, toast } from './ui.js';

const page = document.body.dataset.page;
const TITLES = {
  pos: 'Point of Sale',
  products: 'Products & Categories',
  inventory: 'Inventory',
  sales: 'Sales History',
  reports: 'Reports',
};
const LIVE_PAGES = Object.keys(TITLES).concat('dashboard', 'settings');
const ctx = await mountShell({ page, title: TITLES[page] || 'OPK HARDWARES', live: LIVE_PAGES });
if (ctx) {
  const renderers = {
    pos: renderPos,
    products: renderProducts,
    inventory: renderInventory,
    sales: renderSales,
    reports: renderReports,
  };
  await renderers[page](ctx);
}

const canManage = (profile) => ['admin', 'manager'].includes(profile?.role);
const byId = (id) => document.getElementById(id);
const inputValue = (form, name) => new FormData(form).get(name)?.toString().trim() || '';
const money = (value) => formatMoney(Number(value || 0));
const quantity = (value) => new Intl.NumberFormat('en-GH', { maximumFractionDigits: 3 }).format(Number(value || 0));
const dateTime = (value) => escapeHtml(formatDateTime(value));
const unitLabel = (value) => escapeHtml(value || 'each');

function alertMarkup(id = 'page-alert') {
  return `<div id="${id}" role="status" aria-live="polite" hidden></div>`;
}

function showAlert(id, text, type = 'error') {
  const el = byId(id);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = text;
  el.hidden = false;
}

function clearAlert(id = 'page-alert') {
  const el = byId(id);
  if (el) {
    el.hidden = true;
    el.textContent = '';
  }
}

function setBusy(button, busy, busyLabel = 'Saving…') {
  if (busy) {
    button.dataset.idleLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.idleLabel || button.textContent;
    button.disabled = false;
  }
}

function pageIntro(eyebrow, title, description, action = '') {
  return `<div class="module-heading"><div><p class="settings-eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>${action}</div>`;
}

function canWriteNotice(profile, noun) {
  return canManage(profile) ? '' : `<p class="module-permission-note">You can view ${escapeHtml(noun)}. Only an admin or manager can change these records.</p>`;
}

function noRows(columns, message) {
  return `<tr><td colspan="${columns}" class="table-empty">${escapeHtml(message)}</td></tr>`;
}

function tableMarkup(headers, rows, className = '') {
  return `<div class="table-wrap"><table class="data-table ${className}"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function queryRows(table, select, configure = (query) => query) {
  let query = supabase.from(table).select(select);
  query = configure(query);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function showLoadError(content, title, error) {
  content.innerHTML = `${pageIntro('OPK HARDWARES', title, 'Data could not be loaded from the configured database.')}${`<div class="alert alert-error" role="alert">${escapeHtml(error.message || 'Database request failed')}</div>`}`;
}

function openDialog(id) {
  const dialog = byId(id);
  if (dialog?.showModal) dialog.showModal();
  else toast('This browser does not support the secure form dialog.', 'error');
  return dialog;
}

async function renderProducts(context) {
  const { content, profile } = context;
  let rows;
  try {
    rows = await queryRows('products', 'id, sku, name, category, unit, cost_price, retail_price, wholesale_price, stock_qty, min_stock, is_active, updated_at', (q) => q.order('name').limit(1000));
  } catch (error) {
    showLoadError(content, 'Products & Categories', error);
    return;
  }
  const manager = canManage(profile);
  content.innerHTML = `
    ${pageIntro('PRODUCT CATALOG', 'Products & Categories', 'Maintain the hardware catalog, pricing tiers, and stock thresholds.', manager ? '<button class="btn btn-primary" id="add-product">Add product</button>' : '')}
    ${alertMarkup()}
    ${canWriteNotice(profile, 'the product catalog')}
    <section class="module-card">
      <div class="module-toolbar"><label class="module-search-label" for="product-search">Search products</label><input class="input module-search" id="product-search" type="search" placeholder="Name, SKU, category…"></div>
      <div id="products-table"></div>
    </section>
    ${manager ? productDialog() : ''}`;
  const paint = (filter = '') => {
    const needle = filter.toLowerCase();
    const filtered = rows.filter((row) => [row.name, row.sku, row.category].some((value) => String(value || '').toLowerCase().includes(needle)));
    byId('products-table').innerHTML = tableMarkup(
      ['Product', 'SKU', 'Category', 'Stock', 'Cost', 'Retail', 'Wholesale', 'Status', ...(manager ? ['Actions'] : [])],
      filtered.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><small class="table-subline">${unitLabel(row.unit)}</small></td><td>${escapeHtml(row.sku || '—')}</td><td>${escapeHtml(row.category || 'Uncategorized')}</td><td>${quantity(row.stock_qty)}</td><td>${money(row.cost_price)}</td><td>${money(row.retail_price)}</td><td>${money(row.wholesale_price)}</td><td><span class="status ${row.is_active ? 'status-success' : 'status-warning'}">${row.is_active ? 'Active' : 'Inactive'}</span></td>${manager ? `<td class="module-actions"><button class="btn btn-outline btn-small" data-edit-product="${row.id}">Edit</button><button class="btn btn-outline btn-small" data-toggle-product="${row.id}">${row.is_active ? 'Deactivate' : 'Reactivate'}</button></td>` : ''}</tr>`).join('') || noRows(manager ? 9 : 8, 'No matching products. Add products to start building the catalog.'),
      'module-table'
    );
  };
  paint();
  byId('product-search').addEventListener('input', (event) => paint(event.target.value));
  if (!manager) return;
  byId('add-product').addEventListener('click', () => openProductDialog());
  byId('products-table').addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle-product]');
    if (toggle) {
      const row = rows.find((product) => product.id === toggle.dataset.toggleProduct);
      if (row) toggleProduct(row, toggle);
      return;
    }
    const button = event.target.closest('[data-edit-product]');
    if (!button) return;
    const row = rows.find((product) => product.id === button.dataset.editProduct);
    if (row) openProductDialog(row);
  });
  byId('product-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const product = {
      name: inputValue(form, 'name'),
      sku: inputValue(form, 'sku') || null,
      category: inputValue(form, 'category') || null,
      unit: inputValue(form, 'unit') || 'each',
      cost_price: Number(inputValue(form, 'cost_price')),
      retail_price: Number(inputValue(form, 'retail_price')),
      wholesale_price: Number(inputValue(form, 'wholesale_price')),
      min_stock: Number(inputValue(form, 'min_stock')),
    };
    if (!product.name || Object.values(product).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) {
      showAlert('page-alert', 'Enter a product name and valid non-negative prices and minimum stock.');
      return;
    }
    setBusy(button, true);
    try {
      const id = inputValue(form, 'id');
      let request = id
        ? supabase.from('products').update(product).eq('id', id)
        : supabase.from('products').insert(product);
      const { error } = await request;
      if (error) throw error;
      toast(id ? 'Product details updated. Stock history is unchanged.' : 'Product added. Set its starting stock in Inventory.', 'success');
      location.reload();
    } catch (error) {
      showAlert('page-alert', `Could not add product. ${error.message}`);
      setBusy(button, false);
    }
  });
}

async function toggleProduct(row, button) {
  if (!window.confirm(`${row.is_active ? 'Deactivate' : 'Reactivate'} ${row.name}? Historical sales and stock records will be preserved.`)) return;
  button.disabled = true;
  try {
    const { error } = await supabase.from('products').update({ is_active: !row.is_active }).eq('id', row.id);
    if (error) throw error;
    location.reload();
  } catch (error) {
    showAlert('page-alert', `Could not change product status. ${error.message}`);
    button.disabled = false;
  }
}

function productDialog() {
  return `<dialog class="app-dialog" id="product-dialog"><form id="product-form" class="app-dialog-form">
    <input type="hidden" name="id">
    <div class="dialog-heading"><h3 id="product-dialog-title">Add product</h3><button type="button" class="dialog-close" data-close="product-dialog" aria-label="Close">×</button></div>
    <p class="module-help">Stock starts at zero. Record starting stock in Inventory with a reason so the adjustment is audited.</p>
    <div class="form-grid">
      <label class="field"><span>Product name</span><input class="input" name="name" required maxlength="160"></label>
      <label class="field"><span>SKU / code</span><input class="input" name="sku" maxlength="80"></label>
      <label class="field"><span>Category</span><input class="input" name="category" maxlength="100" placeholder="e.g. Roofing"></label>
      <label class="field"><span>Unit</span><input class="input" name="unit" value="each" required maxlength="40"></label>
      <label class="field"><span>Cost price (GHS)</span><input class="input" name="cost_price" type="number" min="0" step=".01" value="0" required></label>
      <label class="field"><span>Retail price (GHS)</span><input class="input" name="retail_price" type="number" min="0" step=".01" value="0" required></label>
      <label class="field"><span>Wholesale price (GHS)</span><input class="input" name="wholesale_price" type="number" min="0" step=".01" value="0" required></label>
      <label class="field"><span>Low-stock threshold</span><input class="input" name="min_stock" type="number" min="0" step=".001" value="0" required></label>
    </div>
    <div class="dialog-actions"><button class="btn btn-outline" type="button" data-close="product-dialog">Cancel</button><button class="btn btn-primary" id="save-product" type="submit">Save product</button></div>
  </form></dialog>`;
}

function openProductDialog(product = null) {
  const form = byId('product-form');
  form.reset();
  form.elements.id.value = product?.id || '';
  for (const field of ['name', 'sku', 'category', 'unit', 'cost_price', 'retail_price', 'wholesale_price', 'min_stock']) {
    const fallback = ['cost_price', 'retail_price', 'wholesale_price', 'min_stock'].includes(field) ? '0' : field === 'unit' ? 'each' : '';
    form.elements[field].value = product?.[field] ?? fallback;
  }
  byId('product-dialog-title').textContent = product ? 'Edit product' : 'Add product';
  byId('save-product').textContent = product ? 'Save changes' : 'Save product';
  openDialog('product-dialog');
}

async function renderCustomers({ content, profile }) {
  let rows;
  let payments = [];
  try {
    rows = await queryRows('customers', 'id, name, phone, email, address, balance, created_at', (q) => q.order('name').limit(1000));
    payments = await queryRows('customer_payments', 'id, customer_id, amount, payment_method, reference, created_at', (q) => q.order('created_at', { ascending: false }).limit(100));
  } catch (error) {
    showLoadError(content, 'Customers', error);
    return;
  }
  const manager = canManage(profile);
  content.innerHTML = `
    ${pageIntro('CUSTOMER DIRECTORY', 'Customers', 'Keep customer contact details and review balances owed.', manager ? '<button class="btn btn-primary" id="add-customer">Add customer</button>' : '')}
    ${alertMarkup()}
    ${canWriteNotice(profile, 'customer records')}
    <section class="module-card"><div class="module-toolbar"><label class="module-search-label" for="customer-search">Search customers</label><input class="input module-search" id="customer-search" type="search" placeholder="Name, phone, email…"></div><div id="customers-table"></div></section>
    <section class="module-card"><h3 class="module-section-title">Recent customer payments</h3><div id="customer-payments-table"></div></section>
    ${manager ? `<dialog class="app-dialog" id="customer-dialog"><form id="customer-form" class="app-dialog-form"><input type="hidden" name="id"><div class="dialog-heading"><h3 id="customer-dialog-title">Add customer</h3><button type="button" class="dialog-close" data-close="customer-dialog" aria-label="Close">×</button></div><div class="form-grid"><label class="field"><span>Name</span><input class="input" name="name" required maxlength="160"></label><label class="field"><span>Phone</span><input class="input" name="phone" type="tel" maxlength="50"></label><label class="field"><span>Email</span><input class="input" name="email" type="email" maxlength="254"></label><label class="field"><span>Address</span><input class="input" name="address" maxlength="300"></label></div><p class="module-help">Customer balances are updated only by secured checkout and payment operations; they are not editable here.</p><div class="dialog-actions"><button class="btn btn-outline" type="button" data-close="customer-dialog">Cancel</button><button class="btn btn-primary" id="save-customer" type="submit">Save customer</button></div></form></dialog>` : ''}`;
  const paint = (filter = '') => {
    const needle = filter.toLowerCase();
    const filtered = rows.filter((row) => [row.name, row.phone, row.email].some((value) => String(value || '').toLowerCase().includes(needle)));
    byId('customers-table').innerHTML = tableMarkup(['Customer', 'Phone', 'Email', 'Address', 'Balance owed', 'Added', 'Action'],
      filtered.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.phone || '—')}</td><td>${escapeHtml(row.email || '—')}</td><td>${escapeHtml(row.address || '—')}</td><td class="numeric">${money(row.balance)}</td><td>${dateTime(row.created_at)}</td><td class="module-actions">${Number(row.balance) > 0 ? `<button class="btn btn-outline btn-small" data-customer-payment="${row.id}">Receive payment</button>` : '<span class="status status-success">Settled</span>'}${manager ? `<button class="btn btn-outline btn-small" data-customer-edit="${row.id}">Edit</button>` : ''}</td></tr>`).join('') || noRows(7, 'No matching customers.'),
      'module-table');
  };
  paint();
  const customerNames = new Map(rows.map((row) => [row.id, row.name]));
  byId('customer-payments-table').innerHTML = tableMarkup(['Date', 'Customer', 'Amount', 'Method', 'Reference'],
    payments.map((row) => `<tr><td>${dateTime(row.created_at)}</td><td>${escapeHtml(customerNames.get(row.customer_id) || 'Customer record unavailable')}</td><td class="numeric">${money(row.amount)}</td><td>${escapeHtml(row.payment_method.replace('_', ' '))}</td><td>${escapeHtml(row.reference || '—')}</td></tr>`).join('') || noRows(5, 'No customer payments have been recorded.'));
  byId('customer-search').addEventListener('input', (event) => paint(event.target.value));
  byId('customers-table').addEventListener('click', (event) => {
    const edit = event.target.closest('[data-customer-edit]');
    if (edit) {
      const customer = rows.find((row) => row.id === edit.dataset.customerEdit);
      if (customer) openCustomerDialog(customer);
      return;
    }
    const paymentButton = event.target.closest('[data-customer-payment]');
    if (paymentButton) {
      const customer = rows.find((row) => row.id === paymentButton.dataset.customerPayment);
      if (customer) openCustomerPaymentDialog(customer);
    }
  });
  const paymentDialog = `<dialog class="app-dialog" id="customer-payment-dialog"><form id="customer-payment-form" class="app-dialog-form"><input type="hidden" name="customer_id"><div class="dialog-heading"><h3>Receive customer payment</h3><button type="button" class="dialog-close" data-close="customer-payment-dialog" aria-label="Close">×</button></div><p id="customer-payment-balance" class="module-help"></p><label class="field"><span>Amount received (GHS)</span><input class="input" name="amount" type="number" min=".01" step=".01" required></label><label class="field"><span>Payment method</span><select class="input" name="payment_method"><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option></select></label><label class="field"><span>Reference (optional)</span><input class="input" name="reference" maxlength="100"></label><div class="dialog-actions"><button class="btn btn-outline" type="button" data-close="customer-payment-dialog">Cancel</button><button class="btn btn-primary" type="submit">Record payment</button></div></form></dialog>`;
  content.insertAdjacentHTML('beforeend', paymentDialog);
  byId('customer-payment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const amount = Number(inputValue(form, 'amount'));
    if (!Number.isFinite(amount) || amount <= 0) return showAlert('page-alert', 'Enter a payment amount greater than zero.');
    setBusy(button, true);
    try {
      const { error } = await supabase.rpc('record_customer_payment', {
        p_customer_id: inputValue(form, 'customer_id'),
        p_amount: amount,
        p_payment_method: inputValue(form, 'payment_method'),
        p_reference: inputValue(form, 'reference') || null,
        p_notes: null,
      });
      if (error) throw error;
      location.reload();
    } catch (error) {
      showAlert('page-alert', `Payment was not recorded. ${error.message}`);
      setBusy(button, false);
    }
  });
  if (!manager) return;
  byId('add-customer').addEventListener('click', () => openDialog('customer-dialog'));
  byId('customer-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const record = { name: inputValue(form, 'name'), phone: inputValue(form, 'phone') || null, email: inputValue(form, 'email') || null, address: inputValue(form, 'address') || null };
    if (!record.name) return showAlert('page-alert', 'Customer name is required.');
    setBusy(button, true);
    try {
      const id = inputValue(form, 'id');
      const { error } = id
        ? await supabase.from('customers').update(record).eq('id', id)
        : await supabase.from('customers').insert(record);
      if (error) throw error;
      location.reload();
    } catch (error) {
      showAlert('page-alert', `Could not save customer. ${error.message}`);
      setBusy(button, false);
    }
  });
}

function openCustomerDialog(customer = null) {
  const form = byId('customer-form');
  form.reset();
  form.elements.id.value = customer?.id || '';
  for (const field of ['name', 'phone', 'email', 'address']) form.elements[field].value = customer?.[field] || '';
  byId('customer-dialog-title').textContent = customer ? 'Edit customer' : 'Add customer';
  byId('save-customer').textContent = customer ? 'Save changes' : 'Save customer';
  openDialog('customer-dialog');
}

function openCustomerPaymentDialog(customer) {
  const form = byId('customer-payment-form');
  form.reset();
  form.elements.customer_id.value = customer.id;
  form.elements.amount.max = customer.balance;
  byId('customer-payment-balance').textContent = `${customer.name} currently owes ${money(customer.balance)}. The database rejects overpayments.`;
  openDialog('customer-payment-dialog');
}

async function renderSuppliers({ content, profile }) {
  const manager = canManage(profile);
  if (!manager) {
    content.innerHTML = `${pageIntro('SUPPLY DIRECTORY', 'Suppliers', 'Supplier contact data is restricted to admins and managers.')}<section class="module-card"><div class="empty">Your current role cannot view supplier contact records. An admin or manager can review this directory and record purchases.</div></section>`;
    return;
  }
  let rows;
  try {
    rows = await queryRows('suppliers', 'id, name, phone, email, address, notes, is_active, created_at', (q) => q.order('name').limit(1000));
  } catch (error) {
    showLoadError(content, 'Suppliers', error);
    return;
  }
  content.innerHTML = `${pageIntro('SUPPLY DIRECTORY', 'Suppliers', 'Manage supplier contacts used to record stock receipts.', manager ? '<button class="btn btn-primary" id="add-supplier">Add supplier</button>' : '')}${alertMarkup()}${canWriteNotice(profile, 'supplier records')}<section class="module-card"><div class="module-toolbar"><label class="module-search-label" for="supplier-search">Search suppliers</label><input class="input module-search" id="supplier-search" type="search" placeholder="Name, phone, email…"></div><div id="suppliers-table"></div></section>${manager ? supplierDialog() : ''}`;
  const paint = (filter = '') => {
    const needle = filter.toLowerCase();
    const found = rows.filter((row) => [row.name, row.phone, row.email].some((value) => String(value || '').toLowerCase().includes(needle)));
    byId('suppliers-table').innerHTML = tableMarkup(['Supplier', 'Phone', 'Email', 'Address', 'Status', 'Actions'],
      found.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.phone || '—')}</td><td>${escapeHtml(row.email || '—')}</td><td>${escapeHtml(row.address || '—')}</td><td><span class="status ${row.is_active ? 'status-success' : 'status-warning'}">${row.is_active ? 'Active' : 'Inactive'}</span></td><td class="module-actions"><button class="btn btn-outline btn-small" data-supplier-edit="${row.id}">Edit</button><button class="btn btn-outline btn-small" data-supplier-toggle="${row.id}">${row.is_active ? 'Deactivate' : 'Reactivate'}</button></td></tr>`).join('') || noRows(6, 'No matching suppliers.'), 'module-table');
  };
  paint();
  byId('supplier-search').addEventListener('input', (event) => paint(event.target.value));
  if (!manager) return;
  byId('add-supplier').addEventListener('click', () => openSupplierDialog());
  byId('suppliers-table').addEventListener('click', (event) => {
    const button = event.target.closest('[data-supplier-edit]');
    if (button) {
      const row = rows.find((supplier) => supplier.id === button.dataset.supplierEdit);
      if (row) openSupplierDialog(row);
      return;
    }
    const toggle = event.target.closest('[data-supplier-toggle]');
    if (!toggle) return;
    const row = rows.find((supplier) => supplier.id === toggle.dataset.supplierToggle);
    if (row) toggleSupplier(row, toggle);
  });
  byId('supplier-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const record = { name: inputValue(form, 'name'), phone: inputValue(form, 'phone') || null, email: inputValue(form, 'email') || null, address: inputValue(form, 'address') || null };
    if (!record.name) return showAlert('page-alert', 'Supplier name is required.');
    setBusy(button, true);
    try {
      const id = inputValue(form, 'id');
      const { error } = id
        ? await supabase.from('suppliers').update(record).eq('id', id)
        : await supabase.from('suppliers').insert(record);
      if (error) throw error;
      location.reload();
    } catch (error) {
      showAlert('page-alert', `Could not save supplier. ${error.message}`);
      setBusy(button, false);
    }
  });
}

async function toggleSupplier(row, button) {
  if (!window.confirm(`${row.is_active ? 'Deactivate' : 'Reactivate'} ${row.name}? Existing purchases keep their supplier snapshot.`)) return;
  button.disabled = true;
  try {
    const { error } = await supabase.from('suppliers').update({ is_active: !row.is_active }).eq('id', row.id);
    if (error) throw error;
    location.reload();
  } catch (error) {
    showAlert('page-alert', `Could not update supplier. ${error.message}`);
    button.disabled = false;
  }
}

function supplierDialog() {
  return `<dialog class="app-dialog" id="supplier-dialog"><form id="supplier-form" class="app-dialog-form"><input type="hidden" name="id"><div class="dialog-heading"><h3 id="supplier-dialog-title">Add supplier</h3><button type="button" class="dialog-close" data-close="supplier-dialog" aria-label="Close">×</button></div><div class="form-grid"><label class="field"><span>Name</span><input class="input" name="name" required maxlength="160"></label><label class="field"><span>Phone</span><input class="input" name="phone" type="tel" maxlength="50"></label><label class="field"><span>Email</span><input class="input" name="email" type="email" maxlength="254"></label><label class="field"><span>Address</span><input class="input" name="address" maxlength="300"></label></div><div class="dialog-actions"><button class="btn btn-outline" type="button" data-close="supplier-dialog">Cancel</button><button class="btn btn-primary" id="save-supplier" type="submit">Save supplier</button></div></form></dialog>`;
}

function openSupplierDialog(supplier = null) {
  const form = byId('supplier-form');
  form.reset();
  form.elements.id.value = supplier?.id || '';
  for (const field of ['name', 'phone', 'email', 'address']) form.elements[field].value = supplier?.[field] || '';
  byId('supplier-dialog-title').textContent = supplier ? 'Edit supplier' : 'Add supplier';
  byId('save-supplier').textContent = supplier ? 'Save changes' : 'Save supplier';
  openDialog('supplier-dialog');
}

async function renderInventory({ content, profile }) {
  let products;
  let movements = [];
  try {
    products = await queryRows('products', 'id, sku, name, category, unit, stock_qty, min_stock, is_active', (q) => q.eq('is_active', true).order('name').limit(1000));
    if (canManage(profile)) movements = await queryRows('inventory_movements', 'id, product_name, movement_type, quantity_change, quantity_after, reason, created_at', (q) => q.order('created_at', { ascending: false }).limit(50));
  } catch (error) {
    showLoadError(content, 'Inventory', error);
    return;
  }
  const manager = canManage(profile);
  const low = products.filter((row) => Number(row.stock_qty) <= Number(row.min_stock));
  content.innerHTML = `${pageIntro('STOCK CONTROL', 'Inventory', 'Review on-hand quantities and low-stock thresholds.', manager ? '<button class="btn btn-primary" id="adjust-stock">Adjust stock</button>' : '')}${alertMarkup()}<div class="cards module-stats"><article class="stat"><div class="k">Active products</div><div class="v">${products.length}</div></article><article class="stat"><div class="k">Units in stock</div><div class="v">${quantity(products.reduce((sum, row) => sum + Number(row.stock_qty), 0))}</div></article><article class="stat warn"><div class="k">At / below minimum</div><div class="v">${low.length}</div></article></div><section class="module-card"><div class="module-toolbar"><label class="module-search-label" for="inventory-search">Search inventory</label><input class="input module-search" id="inventory-search" type="search" placeholder="Name, SKU, category…"></div><div id="inventory-table"></div></section>${manager ? `<section class="module-card"><h3 class="module-section-title">Recent stock movements</h3><div id="movement-table"></div></section>${adjustmentDialog(products)}` : canWriteNotice(profile, 'stock levels')}`;
  const paint = (filter = '') => {
    const needle = filter.toLowerCase();
    const found = products.filter((row) => [row.name, row.sku, row.category].some((value) => String(value || '').toLowerCase().includes(needle)));
    byId('inventory-table').innerHTML = tableMarkup(['Product', 'SKU', 'Category', 'On hand', 'Minimum', 'Status'],
      found.map((row) => {
        const isLow = Number(row.stock_qty) <= Number(row.min_stock);
        return `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.sku || '—')}</td><td>${escapeHtml(row.category || '—')}</td><td>${quantity(row.stock_qty)} ${unitLabel(row.unit)}</td><td>${quantity(row.min_stock)}</td><td><span class="status ${isLow ? 'status-warning' : 'status-success'}">${isLow ? 'Low stock' : 'In stock'}</span></td></tr>`;
      }).join('') || noRows(6, 'No matching products.'));
  };
  paint();
  byId('inventory-search').addEventListener('input', (event) => paint(event.target.value));
  if (!manager) return;
  byId('movement-table').innerHTML = tableMarkup(['Date', 'Product', 'Movement', 'Change', 'After', 'Reason'],
    movements.map((movement) => `<tr><td>${dateTime(movement.created_at)}</td><td>${escapeHtml(movement.product_name)}</td><td>${escapeHtml(movement.movement_type)}</td><td class="numeric">${Number(movement.quantity_change) > 0 ? '+' : ''}${quantity(movement.quantity_change)}</td><td class="numeric">${quantity(movement.quantity_after)}</td><td>${escapeHtml(movement.reason || '—')}</td></tr>`).join('') || noRows(6, 'No recorded stock movements.'),
    'module-table');
  byId('adjust-stock').addEventListener('click', () => openDialog('adjustment-dialog'));
  byId('adjustment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const productId = inputValue(form, 'product_id');
    const delta = Number(inputValue(form, 'quantity_change'));
    const reason = inputValue(form, 'reason');
    if (!productId || !Number.isFinite(delta) || delta === 0 || !reason) return showAlert('page-alert', 'Select a product and enter a non-zero quantity change and reason.');
    setBusy(button, true);
    try {
      const { error } = await supabase.rpc('adjust_stock', { p_product_id: productId, p_quantity_change: delta, p_reason: reason });
      if (error) throw error;
      location.reload();
    } catch (error) {
      showAlert('page-alert', `Stock adjustment failed. ${error.message}`);
      setBusy(button, false);
    }
  });
}

function adjustmentDialog(products) {
  return `<dialog class="app-dialog" id="adjustment-dialog"><form id="adjustment-form" class="app-dialog-form"><div class="dialog-heading"><h3>Adjust stock</h3><button type="button" class="dialog-close" data-close="adjustment-dialog" aria-label="Close">×</button></div><p class="module-help">Use a positive number to add stock or a negative number to remove it. Each adjustment is saved to the stock movement history.</p><label class="field"><span>Product</span><select class="input" name="product_id" required><option value="">Choose product</option>${products.map((row) => `<option value="${row.id}">${escapeHtml(row.name)} (${quantity(row.stock_qty)} ${unitLabel(row.unit)})</option>`).join('')}</select></label><label class="field"><span>Quantity change</span><input class="input" name="quantity_change" type="number" step=".001" required></label><label class="field"><span>Reason</span><input class="input" name="reason" maxlength="200" required placeholder="e.g. Count correction"></label><div class="dialog-actions"><button class="btn btn-outline" type="button" data-close="adjustment-dialog">Cancel</button><button class="btn btn-primary" type="submit">Save adjustment</button></div></form></dialog>`;
}

function cartKey(userId) {
  return `opk_cart_${userId}`;
}

function readCart(userId, products) {
  try {
    const stored = JSON.parse(localStorage.getItem(cartKey(userId)) || '[]');
    if (!Array.isArray(stored)) throw new Error('The saved cart was not a list.');
    let removed = 0;
    let adjusted = 0;
    const cart = [];
    for (const row of stored) {
      const product = row && products.find((item) => item.id === row.id);
      const requested = Number(row?.quantity);
      if (!product || !Number.isFinite(requested) || requested <= 0) {
        removed += 1;
        continue;
      }
      const quantity = Math.min(Number(product.stock_qty), Math.round(requested * 1000) / 1000);
      if (quantity <= 0) {
        removed += 1;
        continue;
      }
      if (quantity !== requested) adjusted += 1;
      cart.push({ id: product.id, quantity });
    }
    if (removed || adjusted) {
      writeCart(userId, cart);
      toast(`Saved cart updated: ${removed} unavailable item(s) removed and ${adjusted} quantity/quantities adjusted to current stock.`, 'error');
    }
    return cart;
  } catch (error) {
    localStorage.removeItem(cartKey(userId));
    toast(`A damaged unsaved cart was cleared from this device. ${error.message}`, 'error');
    return [];
  }
}

function writeCart(userId, cart) {
  localStorage.setItem(cartKey(userId), JSON.stringify(cart));
}

async function renderPos({ content, user }) {
  let products;
  let customers;
  try {
    [products, customers] = await Promise.all([
      queryRows('products', 'id, sku, name, category, unit, retail_price, wholesale_price, stock_qty', (q) => q.eq('is_active', true).gt('stock_qty', 0).order('name').limit(1000)),
      queryRows('customers', 'id, name, phone, balance', (q) => q.order('name').limit(1000)),
    ]);
  } catch (error) {
    showLoadError(content, 'Point of Sale', error);
    return;
  }
  let cart = readCart(user.id, products);
  let tier = 'retail';
  content.innerHTML = `${pageIntro('COUNTER CHECKOUT', 'Point of Sale', 'Search products, build a cart, select a price tier, and securely complete the transaction.')}<p class="module-permission-note">Checkout currently records items at retail or wholesale price with no tax or discount. Only cash can include change. Any unpaid amount requires a customer. Stock is deducted atomically by Supabase after successful checkout.</p>${alertMarkup()}<div class="pos-layout"><section class="module-card pos-catalog"><div class="pos-controls"><label class="field"><span>Search products</span><input class="input" id="pos-search" type="search" placeholder="Product name or SKU"></label><label class="field"><span>Price tier</span><select class="input" id="pos-tier"><option value="retail">Retail</option><option value="wholesale">Wholesale</option></select></label></div><div id="pos-products" class="pos-products"></div></section><section class="module-card pos-cart"><div class="pos-cart-heading"><h3>Current sale</h3><button class="btn btn-outline btn-small" id="clear-cart" type="button">Clear cart</button></div><div id="cart-lines"></div><div class="pos-checkout"><label class="field"><span>Customer (required for balance due)</span><select class="input" id="pos-customer"><option value="">Walk-in customer</option>${customers.map((row) => `<option value="${row.id}">${escapeHtml(row.name)}${Number(row.balance) > 0 ? ` · owing ${money(row.balance)}` : ''}</option>`).join('')}</select></label><label class="field"><span>Payment method</span><select class="input" id="pos-payment"><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="credit">Credit (no payment today)</option></select></label><label class="field" id="tendered-wrap"><span>Amount received (GHS)</span><input class="input" id="pos-tendered" type="number" min="0" step=".01" value="0"></label><div class="pos-total-row"><span>Subtotal</span><strong id="cart-subtotal">GH₵0.00</strong></div><div class="pos-total-row"><span>Estimated balance due</span><strong id="cart-due">GH₵0.00</strong></div><button class="btn btn-primary btn-block pos-checkout-button" id="complete-sale" type="button">Complete sale</button></div></section></div>`;

  const paintProducts = (filter = '') => {
    const needle = filter.toLowerCase();
    const found = products.filter((row) => `${row.name} ${row.sku || ''} ${row.category || ''}`.toLowerCase().includes(needle));
    byId('pos-products').innerHTML = found.map((row) => {
      const price = tier === 'wholesale' ? row.wholesale_price : row.retail_price;
      return `<button class="pos-product" type="button" data-add-product="${row.id}" ${Number(row.stock_qty) <= 0 ? 'disabled' : ''}><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.sku || row.category || '')}</span><b>${money(price)}</b><small>${quantity(row.stock_qty)} ${unitLabel(row.unit)} available</small></button>`;
    }).join('') || '<div class="empty">No in-stock products match your search.</div>';
  };
  const paintCart = () => {
    cart = cart.filter((row) => products.some((product) => product.id === row.id));
    writeCart(user.id, cart);
    const lines = cart.map((line) => {
      const product = products.find((row) => row.id === line.id);
      return `<div class="cart-line"><div class="cart-line-title"><strong>${escapeHtml(product.name)}</strong><small>${money(tier === 'wholesale' ? product.wholesale_price : product.retail_price)} / ${unitLabel(product.unit)}</small></div><label class="sr-only" for="qty-${product.id}">Quantity for ${escapeHtml(product.name)}</label><input class="input cart-qty" id="qty-${product.id}" data-cart-qty="${product.id}" type="number" min=".001" max="${product.stock_qty}" step=".001" value="${line.quantity}"><strong>${money(Number(line.quantity) * Number(tier === 'wholesale' ? product.wholesale_price : product.retail_price))}</strong><button class="cart-remove" data-remove-product="${product.id}" type="button" aria-label="Remove ${escapeHtml(product.name)}">×</button></div>`;
    }).join('');
    byId('cart-lines').innerHTML = lines || '<div class="empty">Add products to this sale.</div>';
    const subtotal = cart.reduce((sum, line) => {
      const product = products.find((row) => row.id === line.id);
      return sum + Number(line.quantity) * Number(tier === 'wholesale' ? product.wholesale_price : product.retail_price);
    }, 0);
    const paid = Number(byId('pos-tendered').value || 0);
    byId('cart-subtotal').textContent = money(subtotal);
    byId('cart-due').textContent = money(Math.max(0, subtotal - paid));
    byId('complete-sale').disabled = cart.length === 0;
    byId('cart-lines').querySelectorAll('[data-cart-qty]').forEach((input) => input.addEventListener('change', () => {
      const line = cart.find((row) => row.id === input.dataset.cartQty);
      const value = Number(input.value);
      const product = products.find((row) => row.id === input.dataset.cartQty);
      if (!Number.isFinite(value) || value <= 0 || value > Number(product.stock_qty)) {
        input.value = line.quantity;
        showAlert('page-alert', `Enter a quantity greater than zero and no more than available stock (${quantity(product.stock_qty)}).`);
        return;
      }
      line.quantity = value;
      paintCart();
    }));
    byId('cart-lines').querySelectorAll('[data-remove-product]').forEach((button) => button.addEventListener('click', () => {
      cart = cart.filter((row) => row.id !== button.dataset.removeProduct);
      paintCart();
    }));
  };
  paintProducts();
  paintCart();
  byId('pos-search').addEventListener('input', (event) => paintProducts(event.target.value));
  byId('pos-tier').addEventListener('change', (event) => { tier = event.target.value; paintProducts(byId('pos-search').value); paintCart(); });
  byId('pos-products').addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-product]');
    if (!button) return;
    const product = products.find((row) => row.id === button.dataset.addProduct);
    const line = cart.find((row) => row.id === product.id);
    if (line) {
      if (Number(line.quantity) + 1 > Number(product.stock_qty)) return showAlert('page-alert', `Only ${quantity(product.stock_qty)} ${product.unit} of ${product.name} are in stock.`);
      line.quantity = Number(line.quantity) + 1;
    } else cart.push({ id: product.id, quantity: 1 });
    paintCart();
  });
  byId('pos-payment').addEventListener('change', (event) => {
    const credit = event.target.value === 'credit';
    byId('tendered-wrap').hidden = credit;
    if (credit) byId('pos-tendered').value = '0';
    paintCart();
  });
  byId('pos-tendered').addEventListener('input', paintCart);
  byId('clear-cart').addEventListener('click', () => {
    if (!cart.length || !window.confirm('Clear all unsaved items from this device’s cart?')) return;
    cart = [];
    paintCart();
    clearAlert();
  });
  byId('complete-sale').addEventListener('click', async (event) => {
    if (!cart.length) return;
    const button = event.currentTarget;
    const method = byId('pos-payment').value;
    const tendered = Number(byId('pos-tendered').value || 0);
    const customer = byId('pos-customer').value || null;
    if (!Number.isFinite(tendered) || tendered < 0) return showAlert('page-alert', 'Enter a valid non-negative amount received.');
    const clientTotal = cart.reduce((sum, line) => {
      const product = products.find((row) => row.id === line.id);
      return sum + Number(line.quantity) * Number(tier === 'wholesale' ? product.wholesale_price : product.retail_price);
    }, 0);
    if ((clientTotal > tendered || method === 'credit') && !customer) return showAlert('page-alert', 'Select a customer when recording credit or a partial payment.');
    if (method === 'credit' && tendered !== 0) return showAlert('page-alert', 'Credit sales must have zero amount received.');
    if (!window.confirm(`Complete this ${tier} sale for ${money(clientTotal)}? The database will recalculate pricing and stock in one transaction.`)) return;
    setBusy(button, true, 'Completing sale…');
    clearAlert();
    try {
      const { data, error } = await supabase.rpc('complete_sale', {
        p_customer_id: customer,
        p_items: cart.map(({ id, quantity: qty }) => ({ product_id: id, quantity: qty })),
        p_price_tier: tier,
        p_payment_method: method,
        p_amount_tendered: tendered,
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      localStorage.removeItem(cartKey(user.id));
      cart = [];
      paintCart();
      showAlert('page-alert', `Sale completed. Receipt ${result.receipt_no}. Paid ${money(result.amount_paid)}, balance ${money(result.balance_due)}, change ${money(result.change_due)}.`, 'success');
      toast(`Sale ${result.receipt_no} completed.`, 'success');
      button.disabled = true;
    } catch (error) {
      showAlert('page-alert', `Sale was not completed. ${error.message}`);
      setBusy(button, false);
    }
  });
}

async function renderSales({ content }) {
  let rows;
  try {
    rows = await queryRows('sales', 'id, receipt_no, customer_id, subtotal, discount, tax, grand_total, amount_paid, payment_method, status, created_at', (q) => q.order('created_at', { ascending: false }).limit(500));
  } catch (error) {
    showLoadError(content, 'Sales History', error);
    return;
  }
  const customerNames = new Map();
  let customerLoadError = null;
  try {
    const customers = await queryRows('customers', 'id, name');
    customers.forEach((row) => customerNames.set(row.id, row.name));
  } catch (error) {
    customerLoadError = error;
  }
  content.innerHTML = `${pageIntro('TRANSACTION RECORDS', 'Sales History', 'Review completed receipts, recorded payments, and outstanding customer balances.')}${alertMarkup()}<section class="module-card"><div class="module-toolbar"><label class="module-search-label" for="sales-search">Search receipt or customer</label><input class="input module-search" id="sales-search" type="search" placeholder="Receipt number…"><label class="date-filter">From <input class="input" id="sales-from" type="date"></label><label class="date-filter">To <input class="input" id="sales-to" type="date"></label></div><div id="sales-table"></div></section><div id="sale-detail"></div>`;
  const paint = () => {
    const needle = byId('sales-search').value.toLowerCase();
    const from = byId('sales-from').value;
    const to = byId('sales-to').value;
    const found = rows.filter((row) => {
      const date = String(row.created_at).slice(0, 10);
      return (!needle || `${row.receipt_no} ${customerNames.get(row.customer_id) || ''}`.toLowerCase().includes(needle))
        && (!from || date >= from) && (!to || date <= to);
    });
    byId('sales-table').innerHTML = tableMarkup(['Receipt', 'Date', 'Customer', 'Total', 'Paid', 'Balance', 'Method', 'Status', 'Items'],
      found.map((row) => `<tr><td><strong>${escapeHtml(row.receipt_no)}</strong></td><td>${dateTime(row.created_at)}</td><td>${escapeHtml(customerNames.get(row.customer_id) || 'Walk-in')}</td><td class="numeric">${money(row.grand_total)}</td><td class="numeric">${money(row.amount_paid)}</td><td class="numeric">${money(Math.max(0, Number(row.grand_total) - Number(row.amount_paid)))}</td><td>${escapeHtml(row.payment_method.replace('_', ' '))}</td><td><span class="status ${row.status === 'completed' ? 'status-success' : 'status-warning'}">${escapeHtml(row.status)}</span></td><td><button class="btn btn-outline btn-small" data-sale-detail="${row.id}">View</button></td></tr>`).join('') || noRows(9, 'No sales match this filter.'));
    byId('sales-table').querySelectorAll('[data-sale-detail]').forEach((button) => button.addEventListener('click', () => showSaleDetail(button.dataset.saleDetail, customerNames)));
  };
  content.querySelectorAll('#sales-search, #sales-from, #sales-to').forEach((input) => input.addEventListener('input', paint));
  paint();
  if (customerLoadError) showAlert('page-alert', `Sales loaded, but customer names could not be displayed. ${customerLoadError.message}`, 'warning');
}

async function showSaleDetail(id, customerNames) {
  try {
    const items = await queryRows('sale_items', 'product_name, sku, quantity, unit_price, price_tier, line_total', (q) => q.eq('sale_id', id).order('created_at'));
    byId('sale-detail').innerHTML = `<section class="module-card"><div class="module-section-heading"><h3 class="module-section-title">Receipt items</h3><button class="btn btn-outline btn-small" id="close-sale-detail">Close</button></div>${tableMarkup(['Product', 'SKU', 'Tier', 'Quantity', 'Unit price', 'Line total'], items.map((item) => `<tr><td>${escapeHtml(item.product_name)}</td><td>${escapeHtml(item.sku || '—')}</td><td>${escapeHtml(item.price_tier)}</td><td>${quantity(item.quantity)}</td><td>${money(item.unit_price)}</td><td>${money(item.line_total)}</td></tr>`).join('') || noRows(6, 'No line details are available for this sale.'))}</section>`;
    byId('close-sale-detail').addEventListener('click', () => { byId('sale-detail').replaceChildren(); });
  } catch (error) {
    showAlert('page-alert', `Could not load receipt items. ${error.message}`);
  }
}

async function renderPurchases({ content, profile }) {
  let purchases;
  let products = [];
  let suppliers = [];
  const manager = canManage(profile);
  try {
    purchases = await queryRows('purchases', 'id, reference_no, supplier_id, total, status, notes, created_at', (q) => q.order('created_at', { ascending: false }).limit(500));
    if (manager) [products, suppliers] = await Promise.all([
      queryRows('products', 'id, name, sku, unit, stock_qty', (q) => q.eq('is_active', true).order('name').limit(1000)),
      queryRows('suppliers', 'id, name', (q) => q.eq('is_active', true).order('name').limit(1000)),
    ]);
  } catch (error) {
    showLoadError(content, 'Purchasing', error);
    return;
  }
  const supplierNames = new Map(suppliers.map((row) => [row.id, row.name]));
  content.innerHTML = `${pageIntro('RECEIVING & RESTOCKING', 'Purchasing', 'Record received supplier stock; receipts and inventory movements are committed atomically.', manager ? '<button class="btn btn-primary" id="new-purchase">Receive stock</button>' : '')}${alertMarkup()}${canWriteNotice(profile, 'purchases')}<section class="module-card"><div id="purchases-table"></div></section>${manager ? purchaseDialog(products, suppliers) : ''}`;
  byId('purchases-table').innerHTML = tableMarkup(['Reference', 'Received', 'Supplier', 'Total cost', 'Status', 'Notes'],
    purchases.map((row) => `<tr><td><strong>${escapeHtml(row.reference_no)}</strong></td><td>${dateTime(row.created_at)}</td><td>${escapeHtml(supplierNames.get(row.supplier_id) || 'Supplier not assigned')}</td><td class="numeric">${money(row.total)}</td><td><span class="status status-success">${escapeHtml(row.status)}</span></td><td>${escapeHtml(row.notes || '—')}</td></tr>`).join('') || noRows(6, 'No purchase receipts have been recorded.'));
  if (!manager) return;
  byId('new-purchase').addEventListener('click', () => openDialog('purchase-dialog'));
  byId('purchase-add-line').addEventListener('click', () => addPurchaseLine(products));
  addPurchaseLine(products);
  byId('purchase-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const lines = [...form.querySelectorAll('.purchase-line')].map((line) => ({
      product_id: line.querySelector('[name="product_id"]').value,
      quantity: Number(line.querySelector('[name="quantity"]').value),
      unit_cost: Number(line.querySelector('[name="unit_cost"]').value),
    }));
    if (!lines.length || lines.some((row) => !row.product_id || !Number.isFinite(row.quantity) || row.quantity <= 0 || !Number.isFinite(row.unit_cost) || row.unit_cost < 0)) return showAlert('page-alert', 'Each line needs a product, positive quantity, and valid unit cost.');
    setBusy(button, true, 'Receiving stock…');
    try {
      const { data, error } = await supabase.rpc('receive_purchase', {
        p_supplier_id: inputValue(form, 'supplier_id') || null,
        p_items: lines,
        p_notes: inputValue(form, 'notes') || null,
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      showAlert('page-alert', `Stock received. Reference ${result.reference_no}, total ${money(result.total)}.`, 'success');
      location.reload();
    } catch (error) {
      showAlert('page-alert', `Purchase was not received. ${error.message}`);
      setBusy(button, false);
    }
  });
}

function purchaseDialog(products, suppliers) {
  return `<dialog class="app-dialog app-dialog-wide" id="purchase-dialog"><form id="purchase-form" class="app-dialog-form"><div class="dialog-heading"><h3>Receive stock</h3><button type="button" class="dialog-close" data-close="purchase-dialog" aria-label="Close">×</button></div><p class="module-help">Receiving immediately increases stock and records an immutable purchase and movement. It does not automatically change product selling or cost prices.</p><label class="field"><span>Supplier (optional)</span><select class="input" name="supplier_id"><option value="">No supplier selected</option>${suppliers.map((row) => `<option value="${row.id}">${escapeHtml(row.name)}</option>`).join('')}</select></label><div class="purchase-line-heading"><strong>Items</strong><button class="btn btn-outline btn-small" type="button" id="purchase-add-line">Add item</button></div><div id="purchase-lines"></div><label class="field"><span>Notes</span><textarea class="input" name="notes" rows="2" maxlength="500"></textarea></label><div class="dialog-actions"><button class="btn btn-outline" type="button" data-close="purchase-dialog">Cancel</button><button class="btn btn-primary" type="submit">Receive purchase</button></div></form></dialog>`;
}

function addPurchaseLine(products) {
  const row = document.createElement('div');
  row.className = 'purchase-line';
  row.innerHTML = `<label class="field"><span>Product</span><select class="input" name="product_id" required><option value="">Choose product</option>${products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)} · stock ${quantity(product.stock_qty)} ${unitLabel(product.unit)}</option>`).join('')}</select></label><label class="field"><span>Quantity</span><input class="input" name="quantity" type="number" min=".001" step=".001" required></label><label class="field"><span>Unit cost</span><input class="input" name="unit_cost" type="number" min="0" step=".01" required></label><button class="btn btn-outline btn-small" type="button" data-remove-purchase-line>Remove</button>`;
  row.querySelector('[data-remove-purchase-line]').addEventListener('click', () => {
    if (document.querySelectorAll('.purchase-line').length > 1) row.remove();
  });
  byId('purchase-lines').appendChild(row);
}

async function renderExpenses({ content, profile }) {
  const manager = canManage(profile);
  let expenses = [];
  if (manager) {
    try {
      expenses = await queryRows('expenses', 'id, description, category, amount, payment_method, notes, created_at', (q) => q.order('created_at', { ascending: false }).limit(500));
    } catch (error) {
      showLoadError(content, 'Expenses', error);
      return;
    }
  }
  content.innerHTML = `${pageIntro('OPERATING COSTS', 'Expenses', 'Record and review shop operating expenses.', manager ? '<button class="btn btn-primary" id="add-expense">Record expense</button>' : '')}${alertMarkup()}${manager ? `<div class="cards module-stats"><article class="stat"><div class="k">Visible expense records</div><div class="v">${expenses.length}</div></article><article class="stat"><div class="k">Total recorded</div><div class="v">${money(expenses.reduce((sum, row) => sum + Number(row.amount), 0))}</div></article></div><section class="module-card"><div id="expenses-table"></div></section>${expenseDialog()}` : '<section class="module-card"><div class="empty">Expense records are restricted to admin and manager roles by the database. Ask an authorized manager to review them.</div></section>'}`;
  if (!manager) return;
  byId('expenses-table').innerHTML = tableMarkup(['Date', 'Description', 'Category', 'Payment', 'Amount', 'Notes'],
    expenses.map((row) => `<tr><td>${dateTime(row.created_at)}</td><td><strong>${escapeHtml(row.description)}</strong></td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.payment_method.replace('_', ' '))}</td><td class="numeric">${money(row.amount)}</td><td>${escapeHtml(row.notes || '—')}</td></tr>`).join('') || noRows(6, 'No expense records yet.'));
  byId('add-expense').addEventListener('click', () => openDialog('expense-dialog'));
  byId('expense-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const amount = Number(inputValue(form, 'amount'));
    if (!inputValue(form, 'description') || !inputValue(form, 'category') || !Number.isFinite(amount) || amount <= 0) return showAlert('page-alert', 'Enter description, category, and an amount greater than zero.');
    setBusy(button, true);
    try {
      const { error } = await supabase.rpc('record_expense', {
        p_description: inputValue(form, 'description'),
        p_category: inputValue(form, 'category'),
        p_amount: amount,
        p_payment_method: inputValue(form, 'payment_method'),
        p_notes: inputValue(form, 'notes') || null,
      });
      if (error) throw error;
      location.reload();
    } catch (error) {
      showAlert('page-alert', `Expense was not recorded. ${error.message}`);
      setBusy(button, false);
    }
  });
}

function expenseDialog() {
  return `<dialog class="app-dialog" id="expense-dialog"><form id="expense-form" class="app-dialog-form"><div class="dialog-heading"><h3>Record expense</h3><button type="button" class="dialog-close" data-close="expense-dialog" aria-label="Close">×</button></div><div class="form-grid"><label class="field"><span>Description</span><input class="input" name="description" required maxlength="160"></label><label class="field"><span>Category</span><input class="input" name="category" required maxlength="80" placeholder="e.g. Utilities"></label><label class="field"><span>Amount (GHS)</span><input class="input" name="amount" type="number" min=".01" step=".01" required></label><label class="field"><span>Payment method</span><select class="input" name="payment_method"><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option></select></label><label class="field field-wide"><span>Notes</span><textarea class="input" name="notes" rows="2" maxlength="500"></textarea></label></div><div class="dialog-actions"><button class="btn btn-outline" type="button" data-close="expense-dialog">Cancel</button><button class="btn btn-primary" type="submit">Save expense</button></div></form></dialog>`;
}

async function renderReports({ content, profile }) {
  let sales;
  let expenses = [];
  let purchases = [];
  try {
    sales = await queryRows('sales', 'id, grand_total, amount_paid, status, created_at', (q) => q.order('created_at', { ascending: false }).limit(1000));
    if (canManage(profile)) [expenses, purchases] = await Promise.all([
      queryRows('expenses', 'amount, category, created_at', (q) => q.order('created_at', { ascending: false }).limit(1000)),
      queryRows('purchases', 'total, created_at', (q) => q.order('created_at', { ascending: false }).limit(1000)),
    ]);
  } catch (error) {
    showLoadError(content, 'Reports', error);
    return;
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
  content.innerHTML = `${pageIntro('BUSINESS OVERVIEW', 'Reports', 'Summary from available sales and records, using the Accra business date.')}${alertMarkup()}<section class="module-card"><div class="module-toolbar"><label class="date-filter">From <input class="input" id="report-from" type="date" value="${today}"></label><label class="date-filter">To <input class="input" id="report-to" type="date" value="${today}"></label><span class="module-help">Report data is limited to the latest 1,000 rows per table.</span></div><div id="report-output"></div></section>${canManage(profile) ? '' : '<p class="module-permission-note">Expense and purchase totals are visible only to managers/admins under database policies.</p>'}`;
  const paint = () => {
    const from = byId('report-from').value;
    const to = byId('report-to').value;
    if (from && to && from > to) return showAlert('page-alert', 'The start date must be on or before the end date.');
    clearAlert();
    const matches = (row) => {
      const day = String(row.created_at).slice(0, 10);
      return (!from || day >= from) && (!to || day <= to);
    };
    const periodSales = sales.filter(matches).filter((row) => row.status !== 'void');
    const periodExpenses = expenses.filter(matches);
    const periodPurchases = purchases.filter(matches);
    const revenue = periodSales.reduce((sum, row) => sum + Number(row.grand_total), 0);
    const paid = periodSales.reduce((sum, row) => sum + Number(row.amount_paid), 0);
    const due = periodSales.reduce((sum, row) => sum + Math.max(0, Number(row.grand_total) - Number(row.amount_paid)), 0);
    const expenseTotal = periodExpenses.reduce((sum, row) => sum + Number(row.amount), 0);
    const purchaseTotal = periodPurchases.reduce((sum, row) => sum + Number(row.total), 0);
    const cards = [
      ['Sales total', revenue, `${periodSales.length} completed transaction(s)`],
      ['Payments recorded', paid, 'Based on sale amount_paid'],
      ['Customer balances added', due, 'Outstanding balance for these sales'],
      ...(canManage(profile) ? [['Expenses recorded', expenseTotal, `${periodExpenses.length} record(s)`], ['Stock purchases', purchaseTotal, `${periodPurchases.length} receipt(s)`]] : []),
    ];
    byId('report-output').innerHTML = `<div class="cards report-cards">${cards.map(([label, value, note]) => `<article class="stat"><div class="k">${label}</div><div class="v">${money(value)}</div><div class="n">${note}</div></article>`).join('')}</div><h3 class="module-section-title">Daily sales</h3>${dailySalesTable(periodSales)}${canManage(profile) ? `<h3 class="module-section-title">Expenses by category</h3>${expenseCategoryTable(periodExpenses)}` : ''}`;
  };
  byId('report-from').addEventListener('change', paint);
  byId('report-to').addEventListener('change', paint);
  paint();
}

function dailySalesTable(rows) {
  const totals = new Map();
  rows.forEach((row) => {
    const day = String(row.created_at).slice(0, 10);
    const total = totals.get(day) || { count: 0, total: 0, paid: 0 };
    total.count += 1;
    total.total += Number(row.grand_total);
    total.paid += Number(row.amount_paid);
    totals.set(day, total);
  });
  const list = [...totals.entries()].sort(([a], [b]) => b.localeCompare(a));
  return tableMarkup(['Business date', 'Transactions', 'Sales total', 'Paid'], list.map(([day, item]) => `<tr><td>${escapeHtml(day)}</td><td>${item.count}</td><td class="numeric">${money(item.total)}</td><td class="numeric">${money(item.paid)}</td></tr>`).join('') || noRows(4, 'No sales in this date range.'));
}

function expenseCategoryTable(rows) {
  const totals = new Map();
  rows.forEach((row) => totals.set(row.category, (totals.get(row.category) || 0) + Number(row.amount)));
  return tableMarkup(['Category', 'Total'], [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([category, total]) => `<tr><td>${escapeHtml(category)}</td><td class="numeric">${money(total)}</td></tr>`).join('') || noRows(2, 'No expenses in this date range.'));
}

async function renderStaff({ content, user, profile }) {
  let profiles;
  const manager = canManage(profile);
  try {
    profiles = await queryRows('profiles', 'id, full_name, role, created_at', (q) => q.order('full_name').limit(1000));
  } catch (error) {
    showLoadError(content, 'Staff & Users', error);
    return;
  }
  content.innerHTML = `${pageIntro('TEAM ACCESS', 'Staff & Users', 'Review visible staff profiles and assign supported roles.', manager ? '' : '')}${alertMarkup()}<p class="module-permission-note">Create or invite accounts in Supabase Authentication first. New accounts receive the cashier role. This page never exposes a service-role key or manages passwords/account activation.</p><section class="module-card"><div id="staff-table"></div></section>`;
  byId('staff-table').innerHTML = tableMarkup(['Staff member', 'Role', 'Profile since', 'Role action'],
    profiles.map((row) => {
      const own = row.id === user.id;
      const canChangeRole = manager && !own && row.role !== 'admin' && (profile.role === 'admin' || row.role === 'cashier');
      const options = canChangeRole
        ? `<select class="input role-select" aria-label="Role for ${escapeHtml(row.full_name || 'staff member')}" data-staff-role="${row.id}"><option value="cashier" ${row.role === 'cashier' ? 'selected' : ''}>Cashier</option><option value="manager" ${row.role === 'manager' ? 'selected' : ''}>Manager</option></select><button class="btn btn-outline btn-small" data-save-role="${row.id}">Save role</button>`
        : own ? '<span class="badge badge-accent">Your account</span>' : '<span class="module-help">Owner-controlled</span>';
      return `<tr><td><strong>${escapeHtml(row.full_name || (own ? user.email : 'Name not set'))}</strong>${own ? `<small class="table-subline">${escapeHtml(user.email || '')}</small>` : ''}</td><td><span class="badge badge-primary">${escapeHtml(roleText(row.role))}</span></td><td>${dateTime(row.created_at)}</td><td><div class="staff-role-actions">${options}</div></td></tr>`;
    }).join('') || noRows(4, 'No staff profiles are visible.'));
  if (!manager) return;
  byId('staff-table').querySelectorAll('[data-save-role]').forEach((button) => button.addEventListener('click', async () => {
    const select = byId('staff-table').querySelector(`[data-staff-role="${CSS.escape(button.dataset.saveRole)}"]`);
    if (!select || select.value === profiles.find((row) => row.id === button.dataset.saveRole)?.role) return;
    if (!window.confirm(`Assign ${select.value} access to this staff profile? Database policies enforce the role restrictions.`)) return;
    setBusy(button, true, 'Saving…');
    try {
      const { error } = await supabase.rpc('set_staff_role', { p_staff_id: button.dataset.saveRole, p_role: select.value });
      if (error) throw error;
      showAlert('page-alert', 'Staff role updated.', 'success');
      location.reload();
    } catch (error) {
      showAlert('page-alert', `Could not change role. ${error.message}`);
      setBusy(button, false);
    }
  }));
}

function roleText(role) {
  return ({ admin: 'Owner / Admin', manager: 'Manager', cashier: 'Cashier' })[role] || 'Unassigned';
}

document.addEventListener('click', (event) => {
  const closeButton = event.target.closest('[data-close]');
  if (closeButton) byId(closeButton.dataset.close)?.close();
});

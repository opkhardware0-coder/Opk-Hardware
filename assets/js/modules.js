import { mountShell } from './shell.js';
import { supabase } from './supabase.js';
import { escapeHtml, formatDateTime, formatMoney, toast } from './ui.js';

let page = document.body.dataset.page;
const TITLES = {
  dashboard: 'Dashboard',
  pos: 'Products & Categories',
  products: 'Products & Categories',
  inventory: 'Inventory',
  sales: 'Sales History',
  reports: 'Reports',
  settings: 'Settings',
};
const LIVE_PAGES = Object.keys(TITLES).concat('dashboard', 'settings');
const ctx = window.__opkContext || await mountShell({ page, title: TITLES[page] || 'OPK HARDWARES', live: LIVE_PAGES });
if (ctx) window.__opkContext = ctx;
let activeModulePage = null;
let renderVersion = 0;
let activeModuleUrl = '';
let activePageReady = false;
const pageCache = new Map();

const canManage = (profile) => ['admin', 'manager'].includes(profile?.role);
const byId = (id) => document.getElementById(id);
const inputValue = (form, name) => new FormData(form).get(name)?.toString().trim() || '';
const money = (value) => formatMoney(Number(value || 0));
const cents = (value) => Math.round((Number(value) + Number.EPSILON) * 100);
const lineTotalCents = (line, product) => cents(Number(line.quantity) * Number(product.retail_price));
const quantity = (value) => new Intl.NumberFormat('en-GH', { maximumFractionDigits: 3 }).format(Number(value || 0));
const dateTime = (value) => escapeHtml(formatDateTime(value));
const unitLabel = (value) => escapeHtml(value || 'each');
const PRODUCT_IMAGE_BUCKET = 'product-images';

function productImageUrl(path) {
  return path ? supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl : '';
}

function validateProductImage(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPEG, PNG, or WebP product photo.';
  if (file.size > 5 * 1024 * 1024) return 'Product photos must be 5 MB or smaller.';
  return '';
}

async function uploadProductImage(file, userId) {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

let activeProductPreview = null;

function displayProductPreview(pathOrFile = null) {
  const preview = byId('product-image-preview');
  if (!preview) return;
  if (activeProductPreview) {
    URL.revokeObjectURL(activeProductPreview);
    activeProductPreview = null;
  }
  const src = pathOrFile instanceof File
    ? (activeProductPreview = URL.createObjectURL(pathOrFile))
    : productImageUrl(pathOrFile);
  preview.hidden = !src;
  preview.src = src || '';
}

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

function businessDay(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(new Date(value));
}

function downloadCsv(filename, rows) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const quote = (value) => {
    let text = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = rows.length
    ? [keys.map(quote).join(','), ...rows.map((row) => keys.map((key) => quote(row[key])).join(','))].join('\r\n')
    : 'No records\r\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function queryRows(table, select, configure = (query) => query) {
  let query = supabase.from(table).select(select);
  query = configure(query);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function queryStaffDirectory() {
  const { data, error } = await supabase.rpc('get_staff_directory');
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
  const { content, profile, user, isCurrent = () => true } = context;
  content.innerHTML = `${pageIntro('PRODUCT CATALOG', 'Products & Categories', 'Loading the catalogue…')}<section class="module-card"><div class="sales-chart-loading" role="status"><span class="spinner" aria-hidden="true"></span> Loading products…</div></section>`;
  let rows;
  try {
    rows = await queryRows('products', 'id, sku, name, category, unit, cost_price, retail_price, image_path, stock_qty, min_stock, is_active, updated_at', (q) => q.order('name').range(0, 99));
  } catch (error) {
    if (!isCurrent()) return;
    showLoadError(content, 'Products & Categories', error);
    return;
  }
  if (!isCurrent()) return;
  let nextProductOffset = rows.length;
  let pendingCheckout = readCheckoutAttempt(user.id);
  if (pendingCheckout?.payload?.p_items) {
    const loadedIds = new Set(rows.map((row) => row.id));
    const missingIds = pendingCheckout.payload.p_items.map((item) => item.product_id).filter((id) => !loadedIds.has(id));
    if (missingIds.length) {
      try {
        rows.push(...await queryRows('products', 'id, sku, name, category, unit, cost_price, retail_price, image_path, stock_qty, min_stock, is_active, updated_at', (q) => q.in('id', missingIds)));
      } catch (error) {
        if (!isCurrent()) return;
        showLoadError(content, 'Products & Categories', error);
        return;
      }
      if (!isCurrent()) return;
    }
  }
  const manager = canManage(profile);
  let cart = pendingCheckout?.payload?.p_items
    ? pendingCheckout.payload.p_items.map((item) => ({ id: item.product_id, quantity: Number(item.quantity) }))
    : readCart(user.id, rows);
  let moreProductsAvailable = rows.length === 100;
  let customersLoaded = false;
  let customersLoading = false;
  let customerRows = [];
  let completedSale = false;
  let currentPage = 0;
  let view = localStorage.getItem('opk_products_view') === 'list' ? 'list' : 'grid';
  const pageSize = 24;
  let categories = [...new Set(rows.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  content.innerHTML = `
    ${pageIntro('PRODUCT CATALOG', 'Products & Categories', 'Find hardware, manage your catalogue, and add items directly to a sale.', `<div class="product-heading-actions">${manager ? '<button class="btn btn-primary" id="add-product">Add product</button>' : ''}<button class="btn btn-outline product-cart-button" id="open-product-cart" type="button" aria-label="Open cart">🛒 <span>Cart</span><span class="cart-count" id="product-cart-count">0</span></button></div>`)}
    ${alertMarkup()}
    ${canWriteNotice(profile, 'the product catalog')}
    <section class="module-card product-catalog-card">
      <div class="product-toolbar">
        <label class="module-search-label" for="product-search">Search products<input class="input module-search" id="product-search" type="search" placeholder="Name, SKU, category…"></label>
        <label class="product-filter">Category<select class="input" id="product-category"><option value="">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}</select></label>
        <label class="product-filter">Stock status<select class="input" id="product-stock-filter"><option value="all">All stock</option><option value="available">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></label>
        <label class="product-filter">Sort by<select class="input" id="product-sort"><option value="name">Name</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="quantity">Quantity</option></select></label>
        <div class="product-view-toggle" role="group" aria-label="Product view"><button class="btn btn-outline btn-small" id="grid-view" type="button" aria-pressed="${view === 'grid'}">Grid</button><button class="btn btn-outline btn-small" id="list-view" type="button" aria-pressed="${view === 'list'}">List</button></div>
        ${manager ? '<button class="btn btn-ghost btn-small" id="manage-categories" type="button">Manage categories</button>' : ''}
      </div>
      <div id="products-table"></div>
      <div id="products-pagination" class="product-pagination"></div>
    </section>
    ${manager ? productDialog() + categoryDialog([]) : ''}
    ${productCartDialog([])}`;
  if (pendingCheckout?.payload) {
    const payload = pendingCheckout.payload;
    byId('catalog-payment').value = payload.p_payment_method;
    byId('catalog-tendered').value = String(payload.p_amount_tendered);
    byId('catalog-tendered-wrap').hidden = payload.p_payment_method === 'credit';
  }
  const activeProducts = () => rows.filter((row) => row.is_active);
  const productPrice = (product) => Number(product.retail_price);
  const filteredProducts = () => {
    const needle = byId('product-search').value.trim().toLowerCase();
    const category = byId('product-category').value;
    const stock = byId('product-stock-filter').value;
    const sort = byId('product-sort').value;
    const found = activeProducts().filter((row) => {
      const available = Number(row.stock_qty);
      const low = available > 0 && available <= Number(row.min_stock);
      return (!needle || `${row.name} ${row.sku || ''} ${row.category || ''}`.toLowerCase().includes(needle))
        && (!category || row.category === category)
        && (stock === 'all' || (stock === 'available' && available > 0) || (stock === 'low' && low) || (stock === 'out' && available <= 0));
    });
    found.sort((a, b) => sort === 'price-low' ? productPrice(a) - productPrice(b)
      : sort === 'price-high' ? productPrice(b) - productPrice(a)
        : sort === 'quantity' ? Number(b.stock_qty) - Number(a.stock_qty)
          : a.name.localeCompare(b.name));
    return found;
  };
  const paint = () => {
    const all = filteredProducts();
    const visible = all.slice(0, (currentPage + 1) * pageSize);
    const lowStock = (row) => Number(row.stock_qty) > 0 && Number(row.stock_qty) <= Number(row.min_stock);
    const actions = (row) => manager
        ? `<button class="btn btn-outline btn-small" type="button" data-edit-product="${row.id}">Edit</button><button class="btn btn-outline btn-small" type="button" data-toggle-product="${row.id}">Deactivate</button>`
      : '';
    const cardMarkup = (row) => `<article class="product-card">
      <div class="product-card-image">${row.image_path ? `<img src="${escapeHtml(productImageUrl(row.image_path))}" alt="${escapeHtml(row.name)}" loading="lazy">` : `<span aria-hidden="true">${escapeHtml((row.name || 'P').slice(0, 1).toUpperCase())}</span>`}</div>
      <div class="product-card-body"><div class="product-card-top"><span class="product-category">${escapeHtml(row.category || 'Uncategorized')}</span><span class="status ${Number(row.stock_qty) <= 0 ? 'status-danger' : lowStock(row) ? 'status-warning' : 'status-success'}">${Number(row.stock_qty) <= 0 ? 'Out of stock' : lowStock(row) ? 'Low stock' : 'In stock'}</span></div>
      <h3>${escapeHtml(row.name)}</h3><p class="product-card-sku">${escapeHtml(row.sku || 'No SKU')} · ${quantity(row.stock_qty)} ${unitLabel(row.unit)}</p>
      <div class="product-card-prices"><span>Selling price <strong>${money(row.retail_price)}</strong></span></div>
      <div class="product-card-actions"><button class="btn btn-primary btn-small" type="button" data-add-to-cart="${row.id}" ${Number(row.stock_qty) <= 0 ? 'disabled' : ''}>Add to sale</button>${actions(row)}</div></div></article>`;
    byId('products-table').innerHTML = view === 'grid'
      ? `<div class="products-grid">${visible.map(cardMarkup).join('') || '<div class="empty">No products match these filters.</div>'}</div>`
      : tableMarkup(['Product', 'Category', 'SKU', 'Selling price', 'Quantity', 'Status', 'Actions'],
        visible.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong><small class="table-subline">${unitLabel(row.unit)}</small></td><td>${escapeHtml(row.category || 'Uncategorized')}</td><td>${escapeHtml(row.sku || '—')}</td><td class="numeric">${money(row.retail_price)}</td><td>${quantity(row.stock_qty)}</td><td><span class="status ${Number(row.stock_qty) <= 0 ? 'status-danger' : lowStock(row) ? 'status-warning' : 'status-success'}">${Number(row.stock_qty) <= 0 ? 'Out of stock' : lowStock(row) ? 'Low stock' : 'In stock'}</span></td><td class="module-actions"><button class="btn btn-primary btn-small" type="button" data-add-to-cart="${row.id}" ${Number(row.stock_qty) <= 0 ? 'disabled' : ''}>Add</button>${actions(row)}</td></tr>`).join('') || noRows(7, 'No products match these filters.'), 'module-table');
    byId('products-pagination').innerHTML = `<span>Showing ${visible.length} of ${all.length} loaded products</span>${visible.length < all.length ? '<button class="btn btn-outline btn-small" id="load-more-products" type="button">Show more</button>' : ''}${moreProductsAvailable ? '<button class="btn btn-outline btn-small" id="load-next-catalog" type="button">Load next 100 products</button>' : ''}`;
    byId('product-cart-count').textContent = String(cart.reduce((sum, line) => sum + Number(line.quantity), 0));
    paintCart();
    byId('load-more-products')?.addEventListener('click', () => { currentPage += 1; paint(); });
    byId('load-next-catalog')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      setBusy(button, true, 'Loading…');
      try {
        const next = await queryRows('products', 'id, sku, name, category, unit, cost_price, retail_price, image_path, stock_qty, min_stock, is_active, updated_at', (q) => q.order('name').range(nextProductOffset, nextProductOffset + 99));
        const knownIds = new Set(rows.map((row) => row.id));
        rows.push(...next.filter((row) => !knownIds.has(row.id)));
        nextProductOffset += next.length;
        moreProductsAvailable = next.length === 100;
        syncCategoryOptions();
        paint();
      } catch (error) {
        showAlert('page-alert', `Could not load more products. ${error.message}`);
        setBusy(button, false);
      }
    });
  };
  const paintCart = () => {
    const count = cart.reduce((sum, line) => sum + Number(line.quantity), 0);
    byId('product-cart-count').textContent = String(count);
    const lines = cart.map((line) => {
      const product = rows.find((row) => row.id === line.id);
      if (!product) return '';
      return `<div class="cart-line"><div class="cart-line-title"><strong>${escapeHtml(product.name)}</strong><small>${money(productPrice(product))} / ${unitLabel(product.unit)}</small></div><label class="sr-only" for="catalog-qty-${product.id}">Quantity for ${escapeHtml(product.name)}</label><input class="input cart-qty" id="catalog-qty-${product.id}" data-cart-qty="${product.id}" type="number" min=".001" max="${product.stock_qty}" step=".001" value="${line.quantity}"><strong>${money(lineTotalCents(line, product) / 100)}</strong><button class="cart-remove" data-remove-product="${product.id}" type="button" aria-label="Remove ${escapeHtml(product.name)}">×</button></div>`;
    }).join('');
    byId('catalog-cart-lines').innerHTML = lines || '<div class="empty">Your cart is empty. Add products to start a sale.</div>';
    const subtotalCents = cart.reduce((sum, line) => sum + lineTotalCents(line, rows.find((row) => row.id === line.id)), 0);
    const subtotal = subtotalCents / 100;
    const tender = Number(byId('catalog-tendered').value || 0);
    const tenderCents = cents(tender);
    const due = Math.max(0, subtotalCents - tenderCents) / 100;
    const method = byId('catalog-payment').value;
    const customer = customerRows.find((row) => row.id === byId('catalog-customer').value);
    const paymentNote = byId('catalog-payment-note');
    let validationMessage = '';
    if (!Number.isFinite(tender) || tender < 0 || Math.abs(tender * 100 - Math.round(tender * 100)) > 1e-7) {
      validationMessage = 'Enter a valid payment amount to the nearest cent.';
    } else if (method !== 'cash' && tenderCents > subtotalCents) {
      validationMessage = 'Only cash payments can include change.';
    } else if (due > 0 && !customer) {
      validationMessage = `Select a customer to record the ${money(due)} balance due.`;
    }
    if (validationMessage) {
      paymentNote.textContent = validationMessage;
      paymentNote.className = 'alert alert-warning catalog-payment-note';
      paymentNote.hidden = false;
    } else if (due > 0 && customer) {
      const previousBalance = Number(customer.balance || 0);
      const newBalance = Math.round((previousBalance + due) * 100) / 100;
      paymentNote.textContent = previousBalance > 0
        ? `${customer.name} owes ${money(previousBalance)}; this sale adds ${money(due)} (new balance ${money(newBalance)}).`
        : `Balance due ${money(due)} will be added to ${customer.name}'s account.`;
      paymentNote.className = 'alert alert-info catalog-payment-note';
      paymentNote.hidden = false;
    } else {
      paymentNote.hidden = true;
      paymentNote.textContent = '';
    }
    byId('catalog-cart-total').textContent = money(subtotal);
    byId('catalog-cart-due').textContent = money(due);
    byId('catalog-complete-sale').disabled = !cart.length || Boolean(validationMessage);
    byId('catalog-complete-sale').textContent = cart.length ? 'Complete sale' : completedSale ? 'Sale completed' : 'Complete sale';
    writeCart(user.id, cart);
    applyPendingCheckoutState();
  };
  function applyPendingCheckoutState() {
    if (!pendingCheckout) {
      byId('catalog-customer').disabled = false;
      byId('catalog-payment').disabled = false;
      byId('catalog-tendered').disabled = false;
      byId('catalog-clear-cart').disabled = false;
      byId('catalog-complete-sale').textContent = cart.length ? 'Complete sale' : completedSale ? 'Sale completed' : 'Complete sale';
      return;
    }
    byId('catalog-customer').disabled = true;
    byId('catalog-payment').disabled = true;
    byId('catalog-tendered').disabled = true;
    byId('catalog-clear-cart').disabled = true;
    content.querySelectorAll('[data-add-to-cart], [data-edit-product], [data-toggle-product], [data-cart-qty], [data-remove-product]').forEach((control) => { control.disabled = true; });
    byId('catalog-complete-sale').textContent = pendingCheckout.blocked ? 'Review saved checkout' : 'Retry previous checkout';
    byId('catalog-complete-sale').disabled = pendingCheckout.blocked ? false : !cart.length;
  }
  const resetFilters = () => { currentPage = 0; paint(); };
  content.querySelectorAll('#product-search, #product-category, #product-stock-filter, #product-sort').forEach((control) => control.addEventListener(control.id === 'product-search' ? 'input' : 'change', resetFilters));
  byId('grid-view').addEventListener('click', () => setView('grid'));
  byId('list-view').addEventListener('click', () => setView('list'));
  function setView(next) {
    view = next;
    localStorage.setItem('opk_products_view', next);
    byId('grid-view').setAttribute('aria-pressed', String(next === 'grid'));
    byId('list-view').setAttribute('aria-pressed', String(next === 'list'));
    syncCategoryOptions();
    paint();
  }
  byId('open-product-cart').addEventListener('click', () => {
    openDialog('product-cart-dialog');
    paintCart();
    if (customersLoaded || customersLoading) return;
    customersLoading = true;
    const customerSelect = byId('catalog-customer');
    customerSelect.innerHTML = '<option value="">Loading customers…</option>';
    queryRows('customers', 'id, name, phone, balance', (q) => q.order('name').limit(1000)).then((loadedCustomers) => {
      customersLoaded = true;
      customerRows = loadedCustomers;
      customerSelect.innerHTML = `<option value="">Walk-in customer</option>${loadedCustomers.map((row) => `<option value="${row.id}">${escapeHtml(row.name)}${Number(row.balance) > 0 ? ` · owing ${money(row.balance)}` : ''}</option>`).join('')}`;
      if (pendingCheckout?.payload?.p_customer_id) customerSelect.value = pendingCheckout.payload.p_customer_id;
      if (activeModulePage === 'products' && byId('catalog-cart-lines')) paintCart();
    }).catch((error) => {
      customerSelect.innerHTML = '<option value="">Walk-in customer</option>';
      if (activeModulePage === 'products') showAlert('page-alert', `Customer list could not be loaded. ${error.message}`);
    }).finally(() => { customersLoading = false; });
  });
  byId('products-table').addEventListener('click', async (event) => {
    const add = event.target.closest('[data-add-to-cart]');
    if (add) {
      const product = rows.find((row) => row.id === add.dataset.addToCart);
      const line = cart.find((row) => row.id === product.id);
      if (line) {
        if (Number(line.quantity) + 1 > Number(product.stock_qty)) return showAlert('page-alert', `Only ${quantity(product.stock_qty)} ${product.unit} of ${product.name} are in stock.`);
        line.quantity = Number(line.quantity) + 1;
      } else cart.push({ id: product.id, quantity: 1 });
      completedSale = false;
      paint();
      return;
    }
    const edit = event.target.closest('[data-edit-product]');
    if (edit) {
      const product = rows.find((row) => row.id === edit.dataset.editProduct);
      if (product) openProductDialog(product);
      return;
    }
    const deactivate = event.target.closest('[data-toggle-product]');
    if (deactivate) {
      const product = rows.find((row) => row.id === deactivate.dataset.toggleProduct);
      if (product) await toggleProduct(product, deactivate, rows, paint);
    }
  });
  byId('catalog-cart-lines').addEventListener('change', (event) => {
    const quantityInput = event.target.closest('[data-cart-qty]');
    if (quantityInput) {
      const line = cart.find((row) => row.id === quantityInput.dataset.cartQty);
      const product = rows.find((row) => row.id === quantityInput.dataset.cartQty);
      const next = Number(quantityInput.value);
      if (!Number.isFinite(next) || next <= 0 || next > Number(product.stock_qty)) {
        quantityInput.value = line.quantity;
        showAlert('page-alert', `Enter a quantity greater than zero and no more than available stock (${quantity(product.stock_qty)}).`);
        return;
      }
      line.quantity = next;
      paint();
    }
  });
  byId('catalog-cart-lines').addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-product]');
    if (remove) {
      cart = cart.filter((row) => row.id !== remove.dataset.removeProduct);
      paint();
    }
  });
  byId('product-cart-dialog').addEventListener('change', (event) => {
    if (event.target.id === 'catalog-payment') {
      byId('catalog-tendered-wrap').hidden = event.target.value === 'credit';
      if (event.target.value === 'credit') byId('catalog-tendered').value = '0';
      paintCart();
    }
    if (event.target.id === 'catalog-customer') paintCart();
  });
  byId('catalog-tendered').addEventListener('input', paintCart);
  byId('catalog-clear-cart').addEventListener('click', () => {
    if (!cart.length || !window.confirm('Clear all unsaved items from this device’s cart?')) return;
    cart = [];
    paint();
  });
  byId('catalog-complete-sale').addEventListener('click', async (event) => {
    if (pendingCheckout?.blocked) {
      if (!window.confirm('Check Sales History first. If the saved sale is listed, do not retry it. Clear this old retry record only after you have checked the history.')) return;
      localStorage.removeItem(checkoutKey(user.id));
      pendingCheckout = null;
      paint();
      return showAlert('page-alert', 'Saved retry cleared. Review the cart and submit the sale only if Sales History confirms it was not already completed.', 'success');
    }
    if (!cart.length) return;
    const button = event.currentTarget;
    const method = byId('catalog-payment').value;
    const tendered = Number(byId('catalog-tendered').value || 0);
    const customerId = byId('catalog-customer').value || null;
    const totalCents = cart.reduce((sum, line) => sum + lineTotalCents(line, rows.find((row) => row.id === line.id)), 0);
    const total = totalCents / 100;
    const tenderedCents = cents(tendered);
    const due = Math.max(0, totalCents - tenderedCents) / 100;
    if (!Number.isFinite(tendered) || tendered < 0 || Math.abs(tendered * 100 - Math.round(tendered * 100)) > 1e-7) return showAlert('page-alert', 'Enter a valid payment amount to the nearest cent.');
    if (method !== 'cash' && tenderedCents > totalCents) return showAlert('page-alert', 'Only cash payments can include change.');
    if (due > 0 && !customerId) return showAlert('page-alert', `Select a customer to record the ${money(due)} balance due.`);
    const customer = customerRows.find((row) => row.id === customerId);
    const paidNow = Math.min(total, tendered);
    const change = method === 'cash' ? Math.max(0, tendered - total) : 0;
    const confirmation = due > 0 && customer
      ? `Complete sale for ${money(total)}? Paid ${money(paidNow)}; ${money(due)} will be added to ${customer.name}'s existing balance of ${money(customer.balance)}.`
      : `Complete sale for ${money(total)}? Paid ${money(paidNow)}${change > 0 ? `; change ${money(change)}` : ''}.`;
    if (!window.confirm(confirmation)) return;
    const payload = {
      p_customer_id: customerId,
      p_items: cart.map(({ id, quantity: qty }) => ({ product_id: id, quantity: qty })),
      p_price_tier: 'retail',
      p_payment_method: method,
      p_amount_tendered: tendered,
    };
    if (pendingCheckout?.payload && JSON.stringify(payload) !== JSON.stringify(pendingCheckout.payload)) {
      return showAlert('page-alert', 'A previous checkout has an uncertain result. Reload this page to retry it safely, then verify Sales History before starting another sale.');
    }
    setBusy(button, true, 'Completing sale…');
    window.__opkCheckoutInProgress = true;
    try {
      pendingCheckout = pendingCheckout || { request_id: crypto.randomUUID(), payload };
      localStorage.setItem(checkoutKey(user.id), JSON.stringify(pendingCheckout));
      applyPendingCheckoutState();
      const { data, error } = await supabase.rpc('complete_sale_once', {
        ...pendingCheckout.payload,
        p_request_id: pendingCheckout.request_id,
      });
      if (error) {
        const alreadyCompletedWithDifferentDetails = error.message?.includes('already completed with different cart details');
        if (error.code && !alreadyCompletedWithDifferentDetails) {
          localStorage.removeItem(checkoutKey(user.id));
          pendingCheckout = null;
        }
        throw error;
      }
      const result = Array.isArray(data) ? data[0] : data;
      const completedLines = cart.map((line) => ({ ...line }));
      completedLines.forEach((line) => {
        const product = rows.find((row) => row.id === line.id);
        if (product) product.stock_qty = Math.max(0, Number(product.stock_qty) - Number(line.quantity));
      });
      if (customer && Number(result.balance_due) > 0) {
        customer.balance = Math.round((Number(customer.balance || 0) + Number(result.balance_due)) * 100) / 100;
      }
      cart = [];
      localStorage.removeItem(cartKey(user.id));
      localStorage.removeItem(checkoutKey(user.id));
      pendingCheckout = null;
      completedSale = true;
      byId('product-cart-dialog').close();
      byId('catalog-tendered').value = '0';
      paint();
      window.dispatchEvent(new Event('opk:data-changed'));
      button.textContent = 'Sale completed';
      button.disabled = true;
      showAlert('page-alert', `Sale ${result.receipt_no} completed. Paid ${money(result.amount_paid)}, balance ${money(result.balance_due)}, change ${money(result.change_due)}.`, 'success');
      toast(`Sale ${result.receipt_no} completed.`, 'success');
      const soldProductIds = completedLines.map((line) => line.id);
      queryRows('products', 'id, stock_qty', (q) => q.in('id', soldProductIds)).then((latestStock) => {
        latestStock.forEach((stock) => {
          const product = rows.find((row) => row.id === stock.id);
          if (product) product.stock_qty = stock.stock_qty;
        });
        if (activeModulePage === 'products' && byId('product-cart-count')) paint();
      }).catch((error) => {
        toast(`Sale completed, but stock could not be refreshed from the database. ${error.message}`, 'error');
      });
    } catch (error) {
      const fetchFailed = error?.name === 'TypeError' && /fetch/i.test(error.message || '');
      showAlert('page-alert', fetchFailed
        ? 'Could not reach Supabase, so the sale result is unknown. Do not start a new sale. Your cart and checkout request are saved; use “Retry previous checkout” to safely check or finish this same sale, or verify Sales History first.'
        : `Sale was not completed. ${error.message}`);
      if (!pendingCheckout) paint();
      setBusy(button, false);
      paintCart();
    } finally {
      window.__opkCheckoutInProgress = false;
    }
  });
  if (manager) {
    byId('add-product').addEventListener('click', () => openProductDialog());
    byId('product-form').elements.image.addEventListener('change', (event) => {
      const file = event.currentTarget.files?.[0] || null;
      const imageError = validateProductImage(file);
      if (imageError) {
        event.currentTarget.value = '';
        const current = rows.find((row) => row.id === inputValue(byId('product-form'), 'id'));
        displayProductPreview(current?.image_path || null);
        return showAlert('page-alert', imageError);
      }
      displayProductPreview(file);
    });
    byId('product-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      const record = {
        sku: inputValue(form, 'sku') || null,
        name: inputValue(form, 'name'),
        category: inputValue(form, 'category') || null,
        unit: inputValue(form, 'unit') || 'each',
        cost_price: Number(inputValue(form, 'cost_price')),
        retail_price: Number(inputValue(form, 'retail_price')),
        min_stock: Number(inputValue(form, 'min_stock')),
      };
      const initialStock = Number(inputValue(form, 'stock_qty'));
      const imageFile = form.elements.image.files?.[0] || null;
      const imageError = validateProductImage(imageFile);
      if (imageError) return showAlert('page-alert', imageError);
      if (!record.name || Object.values(record).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value < 0)) || !Number.isFinite(initialStock) || initialStock < 0) {
        return showAlert('page-alert', 'Enter a product name and valid non-negative prices, stock, and minimum stock.');
      }
      setBusy(button, true);
      let uploadedImagePath = null;
      try {
        const id = inputValue(form, 'id');
        const previous = id ? rows.find((row) => row.id === id) : null;
        const imagePath = imageFile ? await uploadProductImage(imageFile, user.id) : previous?.image_path || null;
        if (imageFile) uploadedImagePath = imagePath;
        record.image_path = imagePath;
        let saved;
        if (id) {
          const { data, error } = await supabase.from('products').update(record).eq('id', id).select('id, sku, name, category, unit, cost_price, retail_price, image_path, stock_qty, min_stock, is_active, updated_at').single();
          if (error) throw error;
          saved = data;
        } else {
          const { data, error } = await supabase.rpc('create_product_with_stock', {
            p_sku: record.sku, p_name: record.name, p_category: record.category, p_unit: record.unit,
            p_cost_price: record.cost_price, p_retail_price: record.retail_price,
            p_wholesale_price: record.retail_price, p_initial_stock: initialStock, p_min_stock: record.min_stock,
            p_image_path: imagePath,
          });
          if (error) throw error;
          saved = Array.isArray(data) ? data[0] : data;
        }
        if (id && previous?.image_path && imagePath !== previous.image_path) {
          try {
            const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([previous.image_path]);
            if (error) toast(`Product saved, but its previous photo could not be removed. ${error.message}`, 'error');
          } catch (error) {
            toast(`Product saved, but its previous photo could not be removed. ${error.message}`, 'error');
          }
        }
        if (id) rows.splice(rows.findIndex((row) => row.id === id), 1, saved);
        else rows.push(saved);
        form.reset();
        displayProductPreview();
        byId('product-dialog').close();
        syncCategoryOptions();
        paint();
        toast(id ? 'Product updated.' : 'Product added to the catalogue.', 'success');
      } catch (error) {
        if (uploadedImagePath) {
          const { error: cleanupError } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([uploadedImagePath]);
          if (cleanupError) {
            showAlert('page-alert', `Could not save product. ${error.message} The uploaded photo could not be cleaned up: ${cleanupError.message}`);
            return;
          }
        }
        showAlert('page-alert', `Could not save product. ${error.message}`);
      } finally {
        setBusy(button, false);
      }
    });
    byId('products-table').addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit-product]');
      if (!edit) return;
      const product = rows.find((row) => row.id === edit.dataset.editProduct);
      if (product) openProductDialog(product);
    });
    byId('manage-categories')?.addEventListener('click', () => openDialog('category-dialog'));
    byId('category-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const from = inputValue(form, 'from');
      const to = inputValue(form, 'to');
      const button = form.querySelector('[type="submit"]');
      if (!from || from === to) return showAlert('page-alert', 'Choose a different destination category.');
      setBusy(button, true);
      try {
        const { error } = await supabase.from('products').update({ category: to || null }).eq('category', from);
        if (error) throw error;
        rows.forEach((row) => { if (row.category === from) row.category = to || null; });
        byId('category-dialog').close();
        syncCategoryOptions();
        paint();
        toast(to ? `Category “${from}” renamed to “${to}”.` : `Category “${from}” removed; its products remain uncategorized.`, 'success');
      } catch (error) {
        showAlert('page-alert', `Could not update category. ${error.message}`);
      } finally {
        setBusy(button, false);
      }
    });
  }
  function syncCategoryOptions() {
    const updated = [...new Set(rows.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    categories = updated;
    const selected = byId('product-category').value;
    byId('product-category').innerHTML = `<option value="">All categories</option>${updated.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}`;
    byId('product-category').value = updated.includes(selected) ? selected : '';
    const categorySelect = byId('category-form')?.elements.from;
    if (categorySelect) categorySelect.innerHTML = `<option value="">Choose category</option>${updated.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}`;
  }
  syncCategoryOptions();
  paint();
  if (pendingCheckout?.blocked) {
    showAlert('page-alert', 'Cart actions are paused because an older checkout needs review. Check Sales History, then choose “Review saved checkout” to unlock the catalogue.');
  }
}

async function toggleProduct(row, button, rows = null, repaint = null) {
  if (!window.confirm(`${row.is_active ? 'Deactivate' : 'Reactivate'} ${row.name}? Historical sales and stock records will be preserved.`)) return;
  button.disabled = true;
  try {
    const { error } = await supabase.from('products').update({ is_active: !row.is_active }).eq('id', row.id);
    if (error) throw error;
    row.is_active = !row.is_active;
    if (rows && repaint) repaint();
    toast(`Product ${row.is_active ? 'reactivated' : 'deactivated'}.`, 'success');
  } catch (error) {
    showAlert('page-alert', `Could not change product status. ${error.message}`);
    button.disabled = false;
  }
}

function productDialog() {
  return `<dialog class="app-dialog" id="product-dialog"><form id="product-form" class="app-dialog-form">
    <input type="hidden" name="id">
    <div class="dialog-heading"><h3 id="product-dialog-title">Add product</h3><button type="button" class="dialog-close" data-close="product-dialog" aria-label="Close">×</button></div>
    <p class="module-help">Starting stock is recorded as an auditable inventory movement. Product photos are optional (JPEG, PNG, or WebP; up to 5 MB).</p>
    <div class="form-grid">
      <label class="field"><span>Product name</span><input class="input" name="name" required maxlength="160"></label>
      <label class="field"><span>SKU / code</span><input class="input" name="sku" maxlength="80"></label>
      <label class="field"><span>Category</span><input class="input" name="category" maxlength="100" placeholder="e.g. Roofing"></label>
      <label class="field"><span>Unit</span><input class="input" name="unit" value="each" list="product-units" required maxlength="40"><datalist id="product-units"><option value="bag"><option value="piece"><option value="length"><option value="bundle"><option value="sheet"><option value="box"><option value="each"></datalist></label>
      <label class="field"><span>Cost price (GHS)</span><input class="input" name="cost_price" type="number" min="0" step=".01" value="0" required></label>
      <label class="field"><span>Retail price (GHS)</span><input class="input" name="retail_price" type="number" min="0" step=".01" value="0" required></label>
      <label class="field"><span>Product photo (optional)</span><input class="input" name="image" type="file" accept="image/jpeg,image/png,image/webp"><img id="product-image-preview" class="product-image-preview" alt="Product photo preview" hidden></label>
      <label class="field"><span>Starting stock</span><input class="input" name="stock_qty" type="number" min="0" step=".001" value="0" required></label>
      <label class="field"><span>Low-stock threshold</span><input class="input" name="min_stock" type="number" min="0" step=".001" value="0" required></label>
    </div>
    <div class="dialog-actions"><button class="btn btn-outline" type="button" data-close="product-dialog">Cancel</button><button class="btn btn-primary" id="save-product" type="submit">Save product</button></div>
  </form></dialog>`;
}

function categoryDialog(categories) {
  return `<dialog class="app-dialog" id="category-dialog"><form id="category-form" class="app-dialog-form">
    <div class="dialog-heading"><h3>Manage categories</h3><button type="button" class="dialog-close" data-close="category-dialog" aria-label="Close">×</button></div>
    <p class="module-help">Categories are labels stored on products, not separate database records. Rename a label or remove it from products without deleting any products or sale history. To add a category, create or edit a product and enter its category.</p>
    <label class="field"><span>Category to change</span><select class="input" name="from" required><option value="">Choose category</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}</select></label>
    <label class="field"><span>New category (leave blank to remove this label)</span><input class="input" name="to" maxlength="100" placeholder="e.g. Roofing"></label>
    <div class="dialog-actions"><button class="btn btn-outline" type="button" data-close="category-dialog">Cancel</button><button class="btn btn-primary" type="submit">Update products</button></div>
  </form></dialog>`;
}

function productCartDialog(customers) {
  return `<dialog class="app-dialog product-cart-dialog" id="product-cart-dialog">
    <div class="dialog-heading"><div><h3>Sale cart</h3><p class="module-help">Stock is deducted only after the sale is successfully completed.</p></div><button class="dialog-close" type="button" data-close="product-cart-dialog" aria-label="Close">×</button></div>
    ${alertMarkup('catalog-alert')}
    <div class="catalog-cart-controls"><label class="field"><span>Customer (required for a balance due)</span><select class="input" id="catalog-customer"><option value="">Walk-in customer</option>${customers.map((row) => `<option value="${row.id}">${escapeHtml(row.name)}${Number(row.balance) > 0 ? ` · owing ${money(row.balance)}` : ''}</option>`).join('')}</select></label>
      <label class="field"><span>Payment method</span><select class="input" id="catalog-payment"><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="credit">Credit (no payment today)</option></select></label>
      <label class="field" id="catalog-tendered-wrap"><span>Amount received (GHS)</span><input class="input" id="catalog-tendered" type="number" min="0" step=".01" value="0"></label>
    </div>
    <div id="catalog-payment-note" class="catalog-payment-note" role="status" aria-live="polite" hidden></div>
    <div id="catalog-cart-lines"></div>
    <div class="pos-total-row"><span>Subtotal</span><strong id="catalog-cart-total">${money(0)}</strong></div>
    <div class="pos-total-row"><span>Estimated balance due</span><strong id="catalog-cart-due">${money(0)}</strong></div>
    <div class="dialog-actions"><button class="btn btn-outline" id="catalog-clear-cart" type="button">Clear cart</button><button class="btn btn-primary" id="catalog-complete-sale" type="button">Complete sale</button></div>
  </dialog>`;
}

function openProductDialog(product = null) {
  const form = byId('product-form');
  form.reset();
  displayProductPreview(product?.image_path || null);
  form.elements.id.value = product?.id || '';
  for (const field of ['name', 'sku', 'category', 'unit', 'cost_price', 'retail_price', 'stock_qty', 'min_stock']) {
    const fallback = ['cost_price', 'retail_price', 'stock_qty', 'min_stock'].includes(field) ? '0' : field === 'unit' ? 'each' : '';
    form.elements[field].value = product?.[field] ?? fallback;
  }
  form.elements.stock_qty.disabled = Boolean(product);
  form.elements.stock_qty.title = product ? 'Change existing stock through Inventory so the change is audited.' : '';
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
    const customer = rows.find((row) => row.id === inputValue(form, 'customer_id'));
    if (!customer || Number(customer.balance) <= 0) return showAlert('page-alert', 'This customer has no outstanding balance to pay.');
    if (Math.round(amount * 100) > Math.round(Number(customer.balance) * 100)) {
      return showAlert('page-alert', `Amount exceeds the customer's outstanding balance of ${money(customer.balance)}. Enter that amount or less.`);
    }
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

async function renderInventory({ content, profile, isCurrent = () => true }) {
  let products;
  let movements = [];
  try {
    products = await queryRows('products', 'id, sku, name, category, unit, stock_qty, min_stock, is_active', (q) => q.eq('is_active', true).order('name').limit(1000));
    if (canManage(profile)) movements = await queryRows('inventory_movements', 'id, product_name, movement_type, quantity_change, quantity_after, reason, created_at', (q) => q.order('created_at', { ascending: false }).limit(50));
  } catch (error) {
    if (!isCurrent()) return;
    showLoadError(content, 'Inventory', error);
    return;
  }
  if (!isCurrent()) return;
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

function checkoutKey(userId) {
  return `opk_checkout_request_${userId}`;
}

function readCheckoutAttempt(userId) {
  const raw = localStorage.getItem(checkoutKey(userId));
  if (!raw) return null;
  try {
    const attempt = JSON.parse(raw);
    if (attempt && typeof attempt.request_id === 'string' && Array.isArray(attempt.payload?.p_items)) {
      if ('p_collection_items' in attempt.payload) {
        toast('A checkout saved by the previous goods-collection workflow needs review. Check Sales History before clearing or retrying it.', 'error');
        return { request_id: attempt.request_id, payload: null, blocked: true };
      }
      return attempt;
    }
  } catch {
    toast('A saved checkout could not be read. Check Sales History before starting another sale.', 'error');
    return { request_id: '', payload: null };
  }
  toast('A saved checkout is incomplete. Check Sales History before starting another sale.', 'error');
  return { request_id: '', payload: null };
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
      const requestedCollected = Number(row?.collected);
      const collected = Number.isFinite(requestedCollected)
        ? Math.max(0, Math.min(quantity, Math.round(requestedCollected * 1000) / 1000))
        : quantity;
      cart.push({ id: product.id, quantity, collected });
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
      queryRows('products', 'id, sku, name, category, unit, retail_price, stock_qty', (q) => q.eq('is_active', true).gt('stock_qty', 0).order('name').limit(1000)),
      queryRows('customers', 'id, name, phone, balance', (q) => q.order('name').limit(1000)),
    ]);
  } catch (error) {
    showLoadError(content, 'Point of Sale', error);
    return;
  }
  let cart = readCart(user.id, products);
  const tier = 'retail';
  content.innerHTML = `${pageIntro('COUNTER CHECKOUT', 'Point of Sale', 'Search products and securely complete a sale.')}<p class="module-permission-note">Sales use the product selling price. Only cash can include change. Any unpaid amount requires a customer. Stock is deducted atomically by Supabase after successful checkout.</p>${alertMarkup()}<div class="pos-layout"><section class="module-card pos-catalog"><div class="pos-controls"><label class="field"><span>Search products</span><input class="input" id="pos-search" type="search" placeholder="Product name or SKU"></label></div><div id="pos-products" class="pos-products"></div></section><section class="module-card pos-cart"><div class="pos-cart-heading"><h3>Current sale</h3><button class="btn btn-outline btn-small" id="clear-cart" type="button">Clear cart</button></div><div id="cart-lines"></div><div class="pos-checkout"><label class="field"><span>Customer (required for balance due)</span><select class="input" id="pos-customer"><option value="">Walk-in customer</option>${customers.map((row) => `<option value="${row.id}">${escapeHtml(row.name)}${Number(row.balance) > 0 ? ` · owing ${money(row.balance)}` : ''}</option>`).join('')}</select></label><label class="field"><span>Payment method</span><select class="input" id="pos-payment"><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="credit">Credit (no payment today)</option></select></label><label class="field" id="tendered-wrap"><span>Amount received (GHS)</span><input class="input" id="pos-tendered" type="number" min="0" step=".01" value="0"></label><div class="pos-total-row"><span>Subtotal</span><strong id="cart-subtotal">GH₵0.00</strong></div><div class="pos-total-row"><span>Estimated balance due</span><strong id="cart-due">GH₵0.00</strong></div><button class="btn btn-primary btn-block pos-checkout-button" id="complete-sale" type="button">Complete sale</button></div></section></div>`;

  const paintProducts = (filter = '') => {
    const needle = filter.toLowerCase();
    const found = products.filter((row) => `${row.name} ${row.sku || ''} ${row.category || ''}`.toLowerCase().includes(needle));
    byId('pos-products').innerHTML = found.map((row) => {
      const price = row.retail_price;
      return `<button class="pos-product" type="button" data-add-product="${row.id}" ${Number(row.stock_qty) <= 0 ? 'disabled' : ''}><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.sku || row.category || '')}</span><b>${money(price)}</b><small>${quantity(row.stock_qty)} ${unitLabel(row.unit)} available</small></button>`;
    }).join('') || '<div class="empty">No in-stock products match your search.</div>';
  };
  const paintCart = () => {
    cart = cart.filter((row) => products.some((product) => product.id === row.id));
    writeCart(user.id, cart);
    const lines = cart.map((line) => {
      const product = products.find((row) => row.id === line.id);
      return `<div class="cart-line"><div class="cart-line-title"><strong>${escapeHtml(product.name)}</strong><small>${money(product.retail_price)} / ${unitLabel(product.unit)}</small></div><label class="sr-only" for="qty-${product.id}">Quantity for ${escapeHtml(product.name)}</label><input class="input cart-qty" id="qty-${product.id}" data-cart-qty="${product.id}" type="number" min=".001" max="${product.stock_qty}" step=".001" value="${line.quantity}"><strong>${money(Number(line.quantity) * Number(product.retail_price))}</strong><button class="cart-remove" data-remove-product="${product.id}" type="button" aria-label="Remove ${escapeHtml(product.name)}">×</button></div>`;
    }).join('');
    byId('cart-lines').innerHTML = lines || '<div class="empty">Add products to this sale.</div>';
    const subtotal = cart.reduce((sum, line) => {
      const product = products.find((row) => row.id === line.id);
      return sum + Number(line.quantity) * Number(product.retail_price);
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
      return sum + Number(line.quantity) * Number(product.retail_price);
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
        p_price_tier: 'retail',
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

async function renderSales({ content, profile, isCurrent = () => true }) {
  content.innerHTML = `${pageIntro('TRANSACTION RECORDS', 'Sales History', 'Loading recent sales and daily totals…')}<section class="module-card"><div class="sales-chart-loading" role="status"><span class="spinner" aria-hidden="true"></span> Loading sales…</div></section>`;
  let rows;
  let customers;
  let profiles = [];
  let expenses = [];
  const manager = canManage(profile);
  try {
    [rows, customers, profiles, expenses] = await Promise.all([
      queryRows('sales', 'id, receipt_no, customer_id, created_by, subtotal, discount, tax, grand_total, amount_paid, payment_method, status, created_at', (q) => q.order('created_at', { ascending: false }).range(0, 499)),
      queryRows('customers', 'id, name'),
      queryStaffDirectory(),
      manager ? queryRows('expenses', 'amount, created_at', (q) => q.order('created_at', { ascending: false }).limit(1000)) : Promise.resolve([]),
    ]);
  } catch (error) {
    if (!isCurrent()) return;
    showLoadError(content, 'Sales History', error);
    return;
  }
  if (!isCurrent()) return;
  const customerNames = new Map();
  const staffNames = new Map();
  customers.forEach((row) => customerNames.set(row.id, row.name));
  profiles.forEach((row) => staffNames.set(row.id, row.full_name));
  const today = businessDay(new Date());
  let moreSalesAvailable = rows.length === 500;
  content.innerHTML = `${pageIntro('TRANSACTION RECORDS', 'Sales History', 'Search sales, review daily totals, and open a complete receipt.')}${alertMarkup()}<section class="module-card"><div class="module-toolbar"><label class="module-search-label" for="sales-search">Search receipt or customer<input class="input module-search" id="sales-search" type="search" placeholder="Receipt number or customer…"></label><label class="date-filter">From <input class="input" id="sales-from" type="date" value="${today}"></label><label class="date-filter">To <input class="input" id="sales-to" type="date" value="${today}"></label>${manager ? `<label class="date-filter">Cashier <select class="input" id="sales-cashier"><option value="">All staff</option>${profiles.map((row) => `<option value="${row.id}">${escapeHtml(row.full_name || 'Staff')}</option>`).join('')}</select></label>` : ''}<label class="date-filter">Payment method <select class="input" id="sales-method"><option value="">All methods</option>${['cash', 'mobile_money', 'card', 'bank_transfer', 'credit'].map((method) => `<option value="${method}">${escapeHtml(method.replace('_', ' '))}</option>`).join('')}</select></label><label class="date-filter">Status <select class="input" id="sales-status"><option value="">All statuses</option><option value="completed">Completed</option><option value="draft">Draft</option><option value="void">Void</option></select></label></div><div id="daily-sales-summary"></div><div class="sales-export-actions"><button class="btn btn-outline btn-small" id="export-filtered-sales" type="button">Export filtered CSV</button></div><div id="sales-table"></div><div class="product-pagination" id="sales-pagination"></div></section><div id="sale-detail"></div>`;
  const paint = () => {
    const needle = byId('sales-search').value.toLowerCase();
    const from = byId('sales-from').value;
    const to = byId('sales-to').value;
    const found = rows.filter((row) => {
      const date = businessDay(row.created_at);
      return (!needle || `${row.receipt_no} ${customerNames.get(row.customer_id) || ''}`.toLowerCase().includes(needle))
        && (!from || date >= from) && (!to || date <= to)
        && (!manager || !byId('sales-cashier').value || row.created_by === byId('sales-cashier').value)
        && (!byId('sales-method').value || row.payment_method === byId('sales-method').value)
        && (!byId('sales-status').value || row.status === byId('sales-status').value);
    });
    const completed = found.filter((row) => row.status === 'completed');
    const gross = completed.reduce((sum, row) => sum + Number(row.subtotal), 0);
    const total = completed.reduce((sum, row) => sum + Number(row.grand_total), 0);
    const collected = completed.reduce((sum, row) => sum + Number(row.amount_paid), 0);
    const discounts = completed.reduce((sum, row) => sum + Number(row.discount), 0);
    const balances = completed.reduce((sum, row) => sum + Math.max(0, Number(row.grand_total) - Number(row.amount_paid)), 0);
    const matchedExpenses = expenses.filter((row) => (!from || businessDay(row.created_at) >= from) && (!to || businessDay(row.created_at) <= to));
    const expenseTotal = matchedExpenses.reduce((sum, row) => sum + Number(row.amount), 0);
    byId('daily-sales-summary').innerHTML = `<div class="cards sales-summary-cards"><article class="stat"><div class="k">Completed sales</div><div class="v">${completed.length}</div></article><article class="stat"><div class="k">Gross sales</div><div class="v">${money(gross)}</div></article><article class="stat"><div class="k">Discounts</div><div class="v">${money(discounts)}</div></article><article class="stat"><div class="k">Sales after discounts</div><div class="v">${money(total)}</div></article><article class="stat"><div class="k">Payments collected</div><div class="v">${money(collected)}</div></article><article class="stat"><div class="k">Balance on these sales</div><div class="v">${money(balances)}</div><div class="n">Original sale balances</div></article>${manager ? `<article class="stat"><div class="k">Expenses (separate)</div><div class="v">${money(expenseTotal)}</div></article>` : ''}</div>`;
    byId('sales-table').innerHTML = tableMarkup(['Receipt', 'Sale date & time', 'Cashier', 'Customer', 'Total', 'Paid', 'Balance', 'Method', 'Status', 'Items'],
      found.map((row) => `<tr><td><strong>${escapeHtml(row.receipt_no)}</strong></td><td>${dateTime(row.created_at)}</td><td>${escapeHtml(staffNames.get(row.created_by) || 'Staff')}</td><td>${escapeHtml(customerNames.get(row.customer_id) || 'Walk-in')}</td><td class="numeric">${money(row.grand_total)}</td><td class="numeric">${money(row.amount_paid)}</td><td class="numeric">${money(Math.max(0, Number(row.grand_total) - Number(row.amount_paid)))}</td><td>${escapeHtml(row.payment_method.replace('_', ' '))}</td><td><span class="status ${row.status === 'completed' ? 'status-success' : 'status-warning'}">${escapeHtml(row.status)}</span></td><td><button class="btn btn-outline btn-small" data-sale-detail="${row.id}">View</button></td></tr>`).join('') || noRows(10, 'No sales match this filter.'));
    byId('sales-pagination').innerHTML = `${rows.length} recent transaction(s) loaded${moreSalesAvailable ? ' · ' + '<button class="btn btn-outline btn-small" id="load-more-sales" type="button">Load older sales</button>' : ''}`;
    byId('sales-table').querySelectorAll('[data-sale-detail]').forEach((button) => button.addEventListener('click', () => {
      const sale = rows.find((row) => row.id === button.dataset.saleDetail);
      showSaleDetail(button.dataset.saleDetail, customerNames, sale, staffNames);
    }));
    byId('load-more-sales')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      setBusy(button, true, 'Loading…');
      try {
        const more = await queryRows('sales', 'id, receipt_no, customer_id, created_by, subtotal, discount, tax, grand_total, amount_paid, payment_method, status, created_at', (q) => q.order('created_at', { ascending: false }).range(rows.length, rows.length + 499));
        rows.push(...more);
        moreSalesAvailable = more.length === 500;
        paint();
      } catch (error) {
        showAlert('page-alert', `Could not load older sales. ${error.message}`);
        setBusy(button, false);
      }
    });
    byId('export-filtered-sales').onclick = () => downloadCsv(`opk-sales-${businessDay(new Date())}.csv`, found.map((row) => ({
      receipt: row.receipt_no,
      sale_time_ghana: formatDateTime(row.created_at),
      cashier: staffNames.get(row.created_by) || 'Staff',
      customer: customerNames.get(row.customer_id) || 'Walk-in',
      subtotal_ghs: row.subtotal,
      discount_ghs: row.discount,
      total_ghs: row.grand_total,
      paid_at_sale_ghs: row.amount_paid,
      original_balance_ghs: Math.max(0, Number(row.grand_total) - Number(row.amount_paid)),
      payment_method: row.payment_method,
      status: row.status,
    })));
  };
  content.querySelectorAll('#sales-search, #sales-from, #sales-to, #sales-method, #sales-status').forEach((input) => input.addEventListener('input', paint));
  byId('sales-cashier')?.addEventListener('change', paint);
  paint();
  const saleId = new URLSearchParams(location.search).get('sale');
  if (saleId) {
    let sale = rows.find((row) => row.id === saleId);
    if (!sale) {
      try {
        [sale] = await queryRows('sales', 'id, receipt_no, customer_id, created_by, subtotal, discount, tax, grand_total, amount_paid, payment_method, status, created_at', (q) => q.eq('id', saleId).limit(1));
      } catch (error) {
        showAlert('page-alert', `Could not load the linked sale. ${error.message}`);
      }
    }
    if (sale) showSaleDetail(saleId, customerNames, sale, staffNames);
    else showAlert('page-alert', 'The linked sale was not found or is not available to this account.');
  }
}

async function showSaleDetail(id, customerNames, sale = null, staffNames = new Map()) {
  try {
    const items = await queryRows('sale_items', 'product_name, sku, quantity, unit_price, line_total', (q) => q.eq('sale_id', id).order('created_at'));
    const receiptSummary = sale ? `<div class="cards sales-summary-cards"><article class="stat"><div class="k">Receipt</div><div class="v">${escapeHtml(sale.receipt_no)}</div><div class="n">${dateTime(sale.created_at)}</div></article><article class="stat"><div class="k">Cashier</div><div class="v">${escapeHtml(staffNames.get(sale.created_by) || 'Staff')}</div><div class="n">${escapeHtml(customerNames.get(sale.customer_id) || 'Walk-in customer')}</div></article><article class="stat"><div class="k">Subtotal</div><div class="v">${money(sale.subtotal)}</div></article><article class="stat"><div class="k">Discount / tax</div><div class="v">${money(sale.discount)} / ${money(sale.tax)}</div></article><article class="stat"><div class="k">Total / paid</div><div class="v">${money(sale.grand_total)} / ${money(sale.amount_paid)}</div></article><article class="stat"><div class="k">Sale-time balance</div><div class="v">${money(Math.max(0, Number(sale.grand_total) - Number(sale.amount_paid)))}</div><div class="n">Payment method: ${escapeHtml(sale.payment_method.replace('_', ' '))}</div></article></div><p class="module-help">Payment amounts are the values stored on the sale. Customer payments are not linked to individual receipts in the current database.</p>` : '';
    byId('sale-detail').innerHTML = `<section class="module-card">${receiptSummary}<div class="module-section-heading"><h3 class="module-section-title">Receipt items</h3><button class="btn btn-outline btn-small" id="close-sale-detail">Close</button></div>${tableMarkup(['Product', 'SKU', 'Quantity', 'Unit price', 'Line total'], items.map((item) => `<tr><td>${escapeHtml(item.product_name)}</td><td>${escapeHtml(item.sku || '—')}</td><td>${quantity(item.quantity)}</td><td>${money(item.unit_price)}</td><td>${money(item.line_total)}</td></tr>`).join('') || noRows(5, 'No line details are available for this sale.'))}</section>`;
    byId('sale-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  wireExpenseRecorder();
}

function wireExpenseRecorder() {
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

function dailySalesTable(rows) {
  const totals = new Map();
  rows.forEach((row) => {
    const day = businessDay(row.created_at);
    const total = totals.get(day) || { count: 0, subtotal: 0, discount: 0, total: 0, paid: 0 };
    total.count += 1;
    total.subtotal += Number(row.subtotal);
    total.discount += Number(row.discount);
    total.total += Number(row.grand_total);
    total.paid += Number(row.amount_paid);
    totals.set(day, total);
  });
  const list = [...totals.entries()].sort(([a], [b]) => b.localeCompare(a));
  return tableMarkup(['Business date', 'Transactions', 'Gross sales', 'Discounts', 'Sales after discounts', 'Paid at sale'], list.map(([day, item]) => `<tr><td>${escapeHtml(day)}</td><td>${item.count}</td><td class="numeric">${money(item.subtotal)}</td><td class="numeric">${money(item.discount)}</td><td class="numeric">${money(item.total)}</td><td class="numeric">${money(item.paid)}</td></tr>`).join('') || noRows(6, 'No sales in this date range.'));
}

function expenseCategoryTable(rows) {
  const totals = new Map();
  rows.forEach((row) => totals.set(row.category, (totals.get(row.category) || 0) + Number(row.amount)));
  return tableMarkup(['Category', 'Total'], [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([category, total]) => `<tr><td>${escapeHtml(category)}</td><td class="numeric">${money(total)}</td></tr>`).join('') || noRows(2, 'No expenses in this date range.'));
}

async function renderReports({ content, profile, isCurrent = () => true }) {
  const manager = canManage(profile);
  content.innerHTML = `${pageIntro('BUSINESS OVERVIEW', 'Reports', 'Sales, recorded expenses, and inventory are shown separately. Profit is not inferred.')}${alertMarkup()}<section class="module-card"><div class="module-toolbar"><label class="date-filter">From <input class="input" id="report-from" type="date"></label><label class="date-filter">To <input class="input" id="report-to" type="date"></label><button class="btn btn-outline btn-small" id="export-report-sales" type="button">Export filtered sales CSV</button></div><div id="report-output"><div class="sales-chart-loading" role="status"><span class="spinner" aria-hidden="true"></span> Loading reports…</div></div></section>`;
  const [salesResult, itemsResult, productsResult, expensesResult, movementsResult] = await Promise.allSettled([
    queryRows('sales', 'id, created_by, subtotal, discount, grand_total, amount_paid, status, created_at', (q) => q.order('created_at', { ascending: false }).limit(2000)),
    queryRows('sale_items', 'sale_id, product_id, product_name, quantity, line_total, created_at', (q) => q.order('created_at', { ascending: false }).limit(10000)),
    queryRows('products', 'id, name, sku, unit, stock_qty, min_stock, is_active', (q) => q.order('name').limit(2000)),
    manager ? queryRows('expenses', 'amount, category, created_at', (q) => q.order('created_at', { ascending: false }).limit(2000)) : Promise.resolve([]),
    manager ? queryRows('inventory_movements', 'product_name, movement_type, quantity_change, quantity_after, reason, created_by, created_at', (q) => q.order('created_at', { ascending: false }).limit(2000)) : Promise.resolve([]),
  ]);
  if (!isCurrent()) return;
  const failures = [];
  const readResult = (result, label, fallback = []) => {
    if (result.status === 'fulfilled') return result.value;
    failures.push(`${label}: ${result.reason?.message || 'request failed'}`);
    return fallback;
  };
  const sales = readResult(salesResult, 'Sales');
  const saleItems = readResult(itemsResult, 'Sale items');
  const products = readResult(productsResult, 'Products');
  const expenses = readResult(expensesResult, 'Expenses');
  const movements = readResult(movementsResult, 'Inventory movements');
  const today = businessDay(new Date());
  byId('report-from').value = today;
  byId('report-to').value = today;
  const productById = new Map(products.map((row) => [row.id, row]));
  const paint = () => {
    const from = byId('report-from').value;
    const to = byId('report-to').value;
    if (from && to && from > to) return showAlert('page-alert', 'The start date must be on or before the end date.');
    if (failures.length) showAlert('page-alert', `Some report data could not be loaded. ${failures.join(' · ')}`);
    else clearAlert();
    const inRange = (row) => {
      const day = businessDay(row.created_at);
      return (!from || day >= from) && (!to || day <= to);
    };
    const matchedSales = sales.filter((row) => inRange(row) && row.status === 'completed');
    const saleIds = new Set(matchedSales.map((row) => row.id));
    const matchedItems = saleItems.filter((row) => saleIds.has(row.sale_id));
    const matchedExpenses = expenses.filter(inRange);
    const topProducts = new Map();
    for (const item of matchedItems) {
      const name = item.product_name || productById.get(item.product_id)?.name || 'Historical product';
      const product = topProducts.get(name) || { name, quantity: 0, revenue: 0, unit: productById.get(item.product_id)?.unit || 'each' };
      product.quantity += Number(item.quantity || 0);
      product.revenue += Number(item.line_total || 0);
      topProducts.set(name, product);
    }
    const gross = matchedSales.reduce((sum, row) => sum + Number(row.subtotal || 0), 0);
    const discounts = matchedSales.reduce((sum, row) => sum + Number(row.discount || 0), 0);
    const revenue = matchedSales.reduce((sum, row) => sum + Number(row.grand_total || 0), 0);
    const paid = matchedSales.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
    const expenseTotal = matchedExpenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const lowStock = products.filter((row) => row.is_active && Number(row.stock_qty) <= Number(row.min_stock));
    byId('report-output').innerHTML = `<div class="cards report-cards"><article class="stat"><div class="k">Completed transactions</div><div class="v">${matchedSales.length}</div></article><article class="stat"><div class="k">Gross sales</div><div class="v">${money(gross)}</div></article><article class="stat"><div class="k">Discounts</div><div class="v">${money(discounts)}</div></article><article class="stat"><div class="k">Sales after discounts</div><div class="v">${money(revenue)}</div></article><article class="stat"><div class="k">Payments received at sale</div><div class="v">${money(paid)}</div></article>${manager ? `<article class="stat"><div class="k">Expenses (separate)</div><div class="v">${money(expenseTotal)}</div></article>` : ''}</div><h3 class="module-section-title">Daily sales</h3>${dailySalesTable(matchedSales)}<h3 class="module-section-title">Top-selling products</h3>${tableMarkup(['Product', 'Quantity sold', 'Sales value'], [...topProducts.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 20).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${quantity(item.quantity)} ${unitLabel(item.unit)}</td><td class="numeric">${money(item.revenue)}</td></tr>`).join('') || noRows(3, 'No product sales in this date range.'))}<h3 class="module-section-title">Low-stock products</h3>${tableMarkup(['Product', 'SKU', 'Available', 'Threshold'], lowStock.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.sku || '—')}</td><td>${quantity(row.stock_qty)} ${unitLabel(row.unit)}</td><td>${quantity(row.min_stock)} ${unitLabel(row.unit)}</td></tr>`).join('') || noRows(4, 'No active products are below their low-stock threshold.'))}${manager ? `<h3 class="module-section-title">Expenses by category</h3>${expenseCategoryTable(matchedExpenses)}<h3 class="module-section-title">Inventory movements</h3>${tableMarkup(['Time', 'Product', 'Type', 'Change', 'Quantity after', 'Reason'], movements.filter(inRange).map((row) => `<tr><td>${dateTime(row.created_at)}</td><td>${escapeHtml(row.product_name)}</td><td>${escapeHtml(row.movement_type)}</td><td>${quantity(row.quantity_change)}</td><td>${quantity(row.quantity_after)}</td><td>${escapeHtml(row.reason || '—')}</td></tr>`).join('') || noRows(6, 'No inventory movements in this date range.'))}` : ''}`;
    byId('export-report-sales').onclick = () => downloadCsv(`opk-report-sales-${today}.csv`, matchedSales.map((row) => ({
      sale_time_ghana: formatDateTime(row.created_at),
      sale_id: row.id,
      gross_sales_ghs: row.subtotal,
      discount_ghs: row.discount,
      sales_after_discounts_ghs: row.grand_total,
      amount_paid_at_sale_ghs: row.amount_paid,
    })));
  };
  content.querySelectorAll('#report-from, #report-to').forEach((input) => input.addEventListener('change', paint));
  paint();
}

if (ctx) {
  const renderers = {
    pos: renderProducts,
    products: renderProducts,
    inventory: renderInventory,
    sales: renderSales,
    reports: renderReports,
    dashboard: async (context) => {
      const { renderDashboard } = await import('./dashboard.js');
      return renderDashboard(context);
    },
    settings: async (context) => {
      const { renderSettings } = await import('./settings.js');
      return renderSettings(context);
    },
  };
  window.__opkModuleNavigation = true;
  const showModulePage = async (nextPage, nextUrl = location.href) => {
    const render = renderers[nextPage];
    if (!render) return;
    const samePage = activeModulePage === nextPage;
    if (samePage && activeModuleUrl === nextUrl) return;
    if (!samePage && activePageReady && ctx.content.hasChildNodes()) {
      ctx.content.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
      const fragment = document.createDocumentFragment();
      while (ctx.content.firstChild) fragment.appendChild(ctx.content.firstChild);
      pageCache.set(activeModulePage, { fragment, savedAt: Date.now(), url: activeModuleUrl });
    }
    activeModulePage = nextPage;
    page = nextPage;
    activeModuleUrl = nextUrl;
    const version = ++renderVersion;
    if (!samePage) {
      const cached = pageCache.get(nextPage);
      if (cached && cached.url === nextUrl && Date.now() - cached.savedAt < 15000) {
        ctx.content.replaceChildren(cached.fragment);
        cached.savedAt = Date.now();
        activePageReady = true;
        return;
      }
      pageCache.delete(nextPage);
    }
    activePageReady = false;
    try {
      await render({ ...ctx, isCurrent: () => activeModulePage === nextPage && renderVersion === version });
      if (activeModulePage === nextPage && renderVersion === version) activePageReady = true;
    } catch (error) {
      if (activeModulePage === nextPage && renderVersion === version) showLoadError(ctx.content, TITLES[nextPage], error);
    }
  };
  window.addEventListener('opk:navigate', (event) => {
    void showModulePage(event.detail.page, event.detail.url.href);
  });
  window.addEventListener('opk:data-changed', () => pageCache.clear());
  await showModulePage(page, location.href);
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

-- OPK HARDWARES POS modules migration.
-- Run once in Supabase SQL Editor AFTER schema.sql.
-- Additive only: this migration does not drop or rewrite existing business tables.

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  sku text,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  price_tier text not null check (price_tier in ('retail', 'wholesale')),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

alter table public.sale_items add column if not exists product_name text;
alter table public.sale_items add column if not exists sku text;
alter table public.sale_items add column if not exists price_tier text not null default 'retail';
alter table public.sale_items add column if not exists line_total numeric(12, 2);
alter table public.sale_items add column if not exists created_at timestamptz not null default now();
update public.sale_items si
set product_name = coalesce(nullif(trim(p.name), ''), 'Historical product')
from public.products p
where si.product_id = p.id and (si.product_name is null or trim(si.product_name) = '');
update public.sale_items set product_name = 'Historical product'
where product_name is null or trim(product_name) = '';
alter table public.sale_items alter column product_name set not null;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique,
  supplier_id uuid references public.suppliers (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  total numeric(12, 2) not null check (total >= 0),
  status text not null default 'received' check (status = 'received'),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete restrict,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  sku text,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  movement_type text not null check (movement_type in ('sale', 'purchase', 'adjustment')),
  quantity_change numeric(12, 3) not null check (quantity_change <> 0),
  quantity_after numeric(12, 3) not null,
  reference_id uuid,
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category text not null,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'mobile_money', 'card', 'bank_transfer')),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null
    check (payment_method in ('cash', 'mobile_money', 'card', 'bank_transfer')),
  reference text,
  notes text,
  received_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_id_idx on public.sale_items (product_id);
create index if not exists purchases_created_at_idx on public.purchases (created_at desc);
create index if not exists purchases_supplier_id_idx on public.purchases (supplier_id);
create index if not exists purchase_items_purchase_id_idx on public.purchase_items (purchase_id);
create index if not exists inventory_movements_product_created_idx on public.inventory_movements (product_id, created_at desc);
create index if not exists expenses_created_at_idx on public.expenses (created_at desc);
create index if not exists customer_payments_customer_created_idx on public.customer_payments (customer_id, created_at desc);

drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

alter table public.sale_items enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.expenses enable row level security;
alter table public.customer_payments enable row level security;

drop policy if exists "Authenticated staff can read sale items" on public.sale_items;
create policy "Authenticated staff can read sale items"
on public.sale_items for select to authenticated using (true);

drop policy if exists "Managers can read suppliers" on public.suppliers;
create policy "Managers can read suppliers"
on public.suppliers for select to authenticated using ((select public.is_admin_or_manager()));
drop policy if exists "Managers can insert suppliers" on public.suppliers;
create policy "Managers can insert suppliers"
on public.suppliers for insert to authenticated with check ((select public.is_admin_or_manager()));
drop policy if exists "Managers can update suppliers" on public.suppliers;
create policy "Managers can update suppliers"
on public.suppliers for update to authenticated
using ((select public.is_admin_or_manager()))
with check ((select public.is_admin_or_manager()));
drop policy if exists "Managers can delete suppliers" on public.suppliers;
create policy "Managers can delete suppliers"
on public.suppliers for delete to authenticated using ((select public.is_admin_or_manager()));

drop policy if exists "Authenticated staff can read purchases" on public.purchases;
create policy "Authenticated staff can read purchases"
on public.purchases for select to authenticated using (true);
drop policy if exists "Authenticated staff can read purchase items" on public.purchase_items;
create policy "Authenticated staff can read purchase items"
on public.purchase_items for select to authenticated using (true);

drop policy if exists "Managers can read inventory movements" on public.inventory_movements;
create policy "Managers can read inventory movements"
on public.inventory_movements for select to authenticated using ((select public.is_admin_or_manager()));

drop policy if exists "Managers can read expenses" on public.expenses;
create policy "Managers can read expenses"
on public.expenses for select to authenticated using ((select public.is_admin_or_manager()));

drop policy if exists "Authenticated staff can read customer payments" on public.customer_payments;
create policy "Authenticated staff can read customer payments"
on public.customer_payments for select to authenticated using (true);

revoke all on public.products, public.customers, public.sale_items, public.suppliers, public.sales,
  public.purchases, public.purchase_items, public.inventory_movements, public.expenses,
  public.customer_payments from anon, authenticated;

grant select on public.products, public.customers, public.sales, public.sale_items,
  public.purchases, public.purchase_items, public.customer_payments to authenticated;
grant insert (sku, name, category, unit, cost_price, retail_price, wholesale_price, min_stock, is_active)
  on public.products to authenticated;
grant update (sku, name, category, unit, cost_price, retail_price, wholesale_price, min_stock, is_active)
  on public.products to authenticated;
grant insert (name, phone, email, address) on public.customers to authenticated;
grant update (name, phone, email, address) on public.customers to authenticated;
grant select on public.suppliers, public.inventory_movements, public.expenses to authenticated;
grant insert (name, phone, email, address, notes, is_active) on public.suppliers to authenticated;
grant update (name, phone, email, address, notes, is_active) on public.suppliers to authenticated;

create or replace function public.complete_sale(
  p_customer_id uuid,
  p_items jsonb,
  p_price_tier text,
  p_payment_method text,
  p_amount_tendered numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_product public.products%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_subtotal numeric(12, 2) := 0;
  v_line_total numeric(12, 2);
  v_tendered numeric(12, 2) := coalesce(p_amount_tendered, 0);
  v_paid numeric(12, 2);
  v_due numeric(12, 2);
  v_change numeric(12, 2);
  v_sale_id uuid;
  v_receipt text;
  v_customer_name text;
  v_role text;
begin
  select role into v_role from public.profiles where id = (select auth.uid());
  if v_role is null then raise exception 'A staff profile is required to make a sale.'; end if;
  if p_price_tier is null or p_price_tier not in ('retail', 'wholesale') then raise exception 'Choose retail or wholesale pricing.'; end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'mobile_money', 'card', 'bank_transfer', 'credit') then
    raise exception 'Choose a supported payment method.';
  end if;
  if p_amount_tendered is not null and p_amount_tendered <> round(p_amount_tendered, 2) then
    raise exception 'Payment amount supports up to two decimal places.';
  end if;
  if v_tendered < 0 then raise exception 'Payment amount cannot be negative.'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Sale items must be provided as a JSON array.';
  end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'A sale must contain between 1 and 100 items.';
  end if;
  if p_payment_method = 'credit' and v_tendered <> 0 then
    raise exception 'Use a payment method when recording money received; credit must have zero tendered.';
  end if;

  for v_item in
    select product_id, quantity
    from jsonb_to_recordset(p_items) as line(product_id uuid, quantity numeric)
  loop
    if v_item.product_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Each sale item needs a product and a quantity greater than zero.';
    end if;
    if v_item.quantity <> round(v_item.quantity, 3) then
      raise exception 'Product quantities support up to three decimal places.';
    end if;
    select * into v_product from public.products
      where id = v_item.product_id and is_active = true for update;
    if not found then raise exception 'A selected product is unavailable.'; end if;
    if v_product.stock_qty < v_item.quantity then
      raise exception 'Insufficient stock for product "%". Available: %', v_product.name, v_product.stock_qty;
    end if;

    v_line_total := round(
      v_item.quantity * case when p_price_tier = 'wholesale' then v_product.wholesale_price else v_product.retail_price end,
      2
    );
    v_subtotal := v_subtotal + v_line_total;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'sku', v_product.sku,
      'quantity', v_item.quantity,
      'unit_price', case when p_price_tier = 'wholesale' then v_product.wholesale_price else v_product.retail_price end,
      'line_total', v_line_total
    ));
  end loop;

  if v_tendered > v_subtotal and p_payment_method <> 'cash' then
    raise exception 'Only cash payments can include change.';
  end if;
  v_paid := least(v_subtotal, v_tendered);
  v_due := v_subtotal - v_paid;
  v_change := greatest(0, v_tendered - v_subtotal);
  if v_due > 0 and p_customer_id is null then
    raise exception 'Select a customer to record a partial payment or credit balance.';
  end if;
  if p_customer_id is not null then
    select name into v_customer_name from public.customers where id = p_customer_id for update;
    if not found then raise exception 'The selected customer was not found.'; end if;
  end if;

  v_receipt := 'OPK-' || to_char(pg_catalog.now() at time zone 'Africa/Accra', 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.sales (
    receipt_no, customer_id, created_by, subtotal, discount, tax, grand_total,
    amount_paid, payment_method, status
  ) values (
    v_receipt, p_customer_id, (select auth.uid()), v_subtotal, 0, 0, v_subtotal,
    v_paid, p_payment_method, 'completed'
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_to_recordset(v_lines) as line(
    product_id uuid, product_name text, sku text, quantity numeric,
    unit_price numeric, line_total numeric
  )
  loop
    insert into public.sale_items (
      sale_id, product_id, product_name, sku, quantity, unit_price, price_tier, line_total
    ) values (
      v_sale_id, v_item.product_id, v_item.product_name, v_item.sku,
      v_item.quantity, v_item.unit_price, p_price_tier, v_item.line_total
    );
    update public.products set stock_qty = stock_qty - v_item.quantity where id = v_item.product_id;
    insert into public.inventory_movements (
      product_id, product_name, movement_type, quantity_change, quantity_after, reference_id, created_by
    ) select id, name, 'sale', -v_item.quantity, stock_qty, v_sale_id, (select auth.uid())
      from public.products where id = v_item.product_id;
  end loop;

  if v_due > 0 then
    update public.customers set balance = balance + v_due where id = p_customer_id;
  end if;

  return jsonb_build_object(
    'sale_id', v_sale_id, 'receipt_no', v_receipt, 'subtotal', v_subtotal,
    'grand_total', v_subtotal, 'amount_paid', v_paid, 'balance_due', v_due, 'change_due', v_change,
    'customer_name', v_customer_name
  );
end;
$$;

create or replace function public.receive_purchase(
  p_supplier_id uuid,
  p_items jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_product public.products%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric(12, 2) := 0;
  v_line_total numeric(12, 2);
  v_purchase_id uuid;
  v_reference text;
begin
  if not (select public.is_admin_or_manager()) then raise exception 'Manager or admin access is required.'; end if;
  if p_supplier_id is not null and not exists (select 1 from public.suppliers where id = p_supplier_id and is_active) then
    raise exception 'Select an active supplier.';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Purchase items must be provided as a JSON array.';
  end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'A purchase must contain between 1 and 100 items.';
  end if;

  for v_item in
    select product_id, quantity, unit_cost
    from jsonb_to_recordset(p_items) as line(product_id uuid, quantity numeric, unit_cost numeric)
  loop
    if v_item.product_id is null or v_item.quantity is null or v_item.quantity <= 0
      or v_item.unit_cost is null or v_item.unit_cost < 0 then
      raise exception 'Each purchase item needs a product, positive quantity, and non-negative unit cost.';
    end if;
    if v_item.quantity <> round(v_item.quantity, 3) or v_item.unit_cost <> round(v_item.unit_cost, 2) then
      raise exception 'Purchase quantities support three decimal places and unit costs support two.';
    end if;
    select * into v_product from public.products where id = v_item.product_id and is_active = true for update;
    if not found then raise exception 'A selected product is unavailable.'; end if;
    v_line_total := round(v_item.quantity * v_item.unit_cost, 2);
    v_total := v_total + v_line_total;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id, 'product_name', v_product.name, 'sku', v_product.sku,
      'quantity', v_item.quantity, 'unit_cost', v_item.unit_cost, 'line_total', v_line_total
    ));
  end loop;

  v_reference := 'PO-' || to_char(pg_catalog.now() at time zone 'Africa/Accra', 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.purchases (reference_no, supplier_id, created_by, total, notes)
  values (v_reference, p_supplier_id, (select auth.uid()), v_total, nullif(trim(p_notes), ''))
  returning id into v_purchase_id;

  for v_item in select * from jsonb_to_recordset(v_lines) as line(
    product_id uuid, product_name text, sku text, quantity numeric, unit_cost numeric, line_total numeric
  )
  loop
    insert into public.purchase_items (
      purchase_id, product_id, product_name, sku, quantity, unit_cost, line_total
    ) values (
      v_purchase_id, v_item.product_id, v_item.product_name, v_item.sku,
      v_item.quantity, v_item.unit_cost, v_item.line_total
    );
    update public.products set stock_qty = stock_qty + v_item.quantity where id = v_item.product_id;
    insert into public.inventory_movements (
      product_id, product_name, movement_type, quantity_change, quantity_after, reference_id, reason, created_by
    ) select id, name, 'purchase', v_item.quantity, stock_qty, v_purchase_id, v_reference, (select auth.uid())
      from public.products where id = v_item.product_id;
  end loop;

  return jsonb_build_object('purchase_id', v_purchase_id, 'reference_no', v_reference, 'total', v_total);
end;
$$;

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_quantity_change numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
begin
  if not (select public.is_admin_or_manager()) then raise exception 'Manager or admin access is required.'; end if;
  if p_quantity_change is null or p_quantity_change = 0 then raise exception 'Enter a non-zero stock adjustment.'; end if;
  if p_quantity_change <> round(p_quantity_change, 3) then raise exception 'Stock adjustments support up to three decimal places.'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Enter a reason for the stock adjustment.'; end if;
  select * into v_product from public.products where id = p_product_id and is_active = true for update;
  if not found then raise exception 'The selected product was not found or is inactive.'; end if;
  if v_product.stock_qty + p_quantity_change < 0 then raise exception 'Stock cannot be adjusted below zero.'; end if;
  update public.products set stock_qty = stock_qty + p_quantity_change where id = p_product_id returning * into v_product;
  insert into public.inventory_movements (
    product_id, product_name, movement_type, quantity_change, quantity_after, reason, created_by
  ) values (
    v_product.id, v_product.name, 'adjustment', p_quantity_change, v_product.stock_qty, trim(p_reason), (select auth.uid())
  );
  return jsonb_build_object('product_id', v_product.id, 'quantity_after', v_product.stock_qty);
end;
$$;

create or replace function public.record_expense(
  p_description text,
  p_category text,
  p_amount numeric,
  p_payment_method text,
  p_notes text default null
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses%rowtype;
begin
  if not (select public.is_admin_or_manager()) then raise exception 'Manager or admin access is required.'; end if;
  if nullif(trim(p_description), '') is null or nullif(trim(p_category), '') is null then
    raise exception 'Description and category are required.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Expense amount must be greater than zero.'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Expense amount supports up to two decimal places.'; end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'mobile_money', 'card', 'bank_transfer') then
    raise exception 'Choose a supported expense payment method.';
  end if;
  insert into public.expenses (
    description, category, amount, payment_method, notes, created_by
  ) values (
    trim(p_description), trim(p_category), p_amount, p_payment_method, nullif(trim(p_notes), ''), (select auth.uid())
  ) returning * into v_expense;
  return v_expense;
end;
$$;

create or replace function public.record_customer_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null,
  p_notes text default null
)
returns public.customer_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_payment public.customer_payments%rowtype;
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid())) then
    raise exception 'A staff profile is required to record a customer payment.';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if p_amount <> round(p_amount, 2) then raise exception 'Payment amount supports up to two decimal places.'; end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'mobile_money', 'card', 'bank_transfer') then
    raise exception 'Choose a supported payment method.';
  end if;
  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found then raise exception 'The selected customer was not found.'; end if;
  if p_amount > v_customer.balance then raise exception 'Payment exceeds the customer balance of %.', v_customer.balance; end if;
  if v_customer.balance <= 0 then raise exception 'This customer has no outstanding balance.'; end if;

  update public.customers set balance = balance - p_amount where id = p_customer_id;
  insert into public.customer_payments (
    customer_id, amount, payment_method, reference, notes, received_by
  ) values (
    p_customer_id, p_amount, p_payment_method, nullif(trim(p_reference), ''),
    nullif(trim(p_notes), ''), (select auth.uid())
  ) returning * into v_payment;
  return v_payment;
end;
$$;

create or replace function public.set_staff_role(p_staff_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role text;
  v_target_role text;
begin
  select role into v_actor_role from public.profiles where id = (select auth.uid());
  if v_actor_role is null or v_actor_role not in ('admin', 'manager') then raise exception 'Manager or admin access is required.'; end if;
  if p_staff_id = (select auth.uid()) then raise exception 'You cannot change your own role.'; end if;
  if p_role is null or p_role not in ('manager', 'cashier') then raise exception 'Only admins can assign owner access.'; end if;
  select role into v_target_role from public.profiles where id = p_staff_id for update;
  if not found then raise exception 'Staff profile was not found.'; end if;
  if v_actor_role = 'manager' and (v_target_role <> 'cashier' or p_role not in ('cashier', 'manager')) then
    raise exception 'Managers may only assign cashier or manager access to existing cashier accounts.';
  end if;
  if v_actor_role = 'admin' and v_target_role = 'admin' then
    raise exception 'Owner access cannot be changed from this action.';
  end if;
  update public.profiles set role = p_role where id = p_staff_id;
end;
$$;

revoke all on function public.complete_sale(uuid, jsonb, text, text, numeric) from public;
revoke all on function public.receive_purchase(uuid, jsonb, text) from public;
revoke all on function public.adjust_stock(uuid, numeric, text) from public;
revoke all on function public.record_expense(text, text, numeric, text, text) from public;
revoke all on function public.record_customer_payment(uuid, numeric, text, text, text) from public;
revoke all on function public.set_staff_role(uuid, text) from public;
grant execute on function public.complete_sale(uuid, jsonb, text, text, numeric) to authenticated;
grant execute on function public.receive_purchase(uuid, jsonb, text) to authenticated;
grant execute on function public.adjust_stock(uuid, numeric, text) to authenticated;
grant execute on function public.record_expense(text, text, numeric, text, text) to authenticated;
grant execute on function public.record_customer_payment(uuid, numeric, text, text, text) to authenticated;
grant execute on function public.set_staff_role(uuid, text) to authenticated;

-- OPK HARDWARES starter schema.
-- Run this in the Supabase SQL Editor after creating the project.
-- Create staff accounts through Supabase Auth; the trigger below creates their
-- cashier profile automatically. Promote the first admin using the SQL at the end.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'cashier'
    check (role in ('admin', 'manager', 'cashier')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category text,
  unit text not null default 'each',
  cost_price numeric(12, 2) not null default 0 check (cost_price >= 0),
  retail_price numeric(12, 2) not null default 0 check (retail_price >= 0),
  wholesale_price numeric(12, 2) not null default 0 check (wholesale_price >= 0),
  stock_qty numeric(12, 3) not null default 0,
  min_stock numeric(12, 3) not null default 0 check (min_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CREATE TABLE IF NOT EXISTS does not add columns to an existing table.
-- Keep this migration rerunnable when products predates this schema.
alter table public.products
  add column if not exists is_active boolean not null default true;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  customer_id uuid references public.customers (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  tax numeric(12, 2) not null default 0 check (tax >= 0),
  grand_total numeric(12, 2) not null default 0 check (grand_total >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'mobile_money', 'card', 'bank_transfer', 'credit')),
  status text not null default 'completed'
    check (status in ('draft', 'completed', 'void')),
  created_at timestamptz not null default now()
);

create index if not exists products_active_idx on public.products (is_active);
create index if not exists customers_balance_idx on public.customers (balance) where balance > 0;
create index if not exists sales_created_at_idx on public.sales (created_at desc);
create index if not exists sales_status_created_at_idx on public.sales (status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      new.email,
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, full_name)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), u.email, '')
from auth.users as u
on conflict (id) do nothing;

create or replace function public.is_admin_or_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('admin', 'manager')
  );
$$;

revoke all on function public.is_admin_or_manager() from public;
grant execute on function public.is_admin_or_manager() to authenticated;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;

drop policy if exists "Staff can read permitted profiles" on public.profiles;
create policy "Staff can read permitted profiles"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin_or_manager()));

drop policy if exists "Staff can update their own name" on public.profiles;
create policy "Staff can update their own name"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists "Authenticated staff can read products" on public.products;
create policy "Authenticated staff can read products"
on public.products for select to authenticated
using (true);

drop policy if exists "Managers can insert products" on public.products;
create policy "Managers can insert products"
on public.products for insert to authenticated
with check ((select public.is_admin_or_manager()));

drop policy if exists "Managers can update products" on public.products;
create policy "Managers can update products"
on public.products for update to authenticated
using ((select public.is_admin_or_manager()))
with check ((select public.is_admin_or_manager()));

drop policy if exists "Managers can delete products" on public.products;
create policy "Managers can delete products"
on public.products for delete to authenticated
using ((select public.is_admin_or_manager()));

drop policy if exists "Authenticated staff can read customers" on public.customers;
create policy "Authenticated staff can read customers"
on public.customers for select to authenticated
using (true);

drop policy if exists "Managers can insert customers" on public.customers;
create policy "Managers can insert customers"
on public.customers for insert to authenticated
with check ((select public.is_admin_or_manager()));

drop policy if exists "Managers can update customers" on public.customers;
create policy "Managers can update customers"
on public.customers for update to authenticated
using ((select public.is_admin_or_manager()))
with check ((select public.is_admin_or_manager()));

drop policy if exists "Managers can delete customers" on public.customers;
create policy "Managers can delete customers"
on public.customers for delete to authenticated
using ((select public.is_admin_or_manager()));

drop policy if exists "Authenticated staff can read sales" on public.sales;
create policy "Authenticated staff can read sales"
on public.sales for select to authenticated
using (true);

-- Intentionally no client-side sales write policies yet. POS writes should be
-- added through a database transaction/RPC so totals, stock, and balances cannot
-- be forged or left inconsistent by direct browser requests.

revoke all on public.profiles, public.products, public.customers, public.sales from anon;
revoke all on public.profiles, public.products, public.customers, public.sales from authenticated;

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select on public.products, public.customers to authenticated;
grant insert (sku, name, category, unit, cost_price, retail_price, wholesale_price, min_stock, is_active)
  on public.products to authenticated;
grant update (sku, name, category, unit, cost_price, retail_price, wholesale_price, min_stock, is_active)
  on public.products to authenticated;
grant insert (name, phone, email, address) on public.customers to authenticated;
grant update (name, phone, email, address) on public.customers to authenticated;
grant select on public.sales to authenticated;

-- After creating your first staff account in Supabase Auth, promote it to admin:
-- update public.profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'YOUR-ADMIN-EMAIL');

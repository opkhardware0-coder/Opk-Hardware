create extension if not exists "uuid-ossp";

create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid references auth.users(id) on delete cascade unique,
  full_name text not null,
  staff_id text unique not null,
  email text not null,
  role text not null default 'staff' check (role in ('manager','staff')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz default now()
);

create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text,
  created_at timestamptz default now()
);

create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid references categories(id) on delete set null,
  name text not null, sku text unique, description text,
  unit text not null default 'piece',
  cost_price numeric(10,2) not null default 0,
  selling_price numeric(10,2) not null default 0,
  stock_quantity numeric(10,2) not null default 0,
  low_stock_threshold numeric(10,2) not null default 10,
  image_path text, active boolean not null default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists sales (
  id uuid primary key default uuid_generate_v4(),
  receipt_number text unique not null,
  staff_id uuid references profiles(id),
  subtotal numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  payment_method text not null,
  amount_paid numeric(10,2), change_amount numeric(10,2),
  created_at timestamptz default now()
);

create table if not exists sale_items (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid references sales(id) on delete cascade,
  product_id uuid references products(id),
  product_name_snapshot text not null,
  quantity numeric(10,2) not null,
  unit_price numeric(10,2) not null,
  total_price numeric(10,2) not null
);

create table if not exists stock_movements (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid references products(id) on delete cascade,
  user_id uuid references profiles(id),
  movement_type text not null check (movement_type in ('in','out','adjustment')),
  quantity numeric(10,2) not null,
  previous_quantity numeric(10,2) not null,
  new_quantity numeric(10,2) not null,
  reason text, created_at timestamptz default now()
);

create or replace function get_user_role() returns text
language sql security definer set search_path = public as $$
  select role from profiles where auth_user_id = auth.uid();
$$;

create or replace function get_email_by_staff_id(sid text) returns table (email text)
language sql security definer set search_path = public as $$
  select email from profiles where staff_id = sid and status = 'active' limit 1;
$$;

alter table profiles enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table stock_movements enable row level security;

create policy "read own profile" on profiles for select using (auth_user_id = auth.uid() or get_user_role() = 'manager');
create policy "manager manage profiles" on profiles for all using (get_user_role() = 'manager');
create policy "read categories" on categories for select using (true);
create policy "manager manage categories" on categories for all using (get_user_role() = 'manager');
create policy "read products" on products for select using (true);
create policy "manager manage products" on products for all using (get_user_role() = 'manager');
create policy "read sales" on sales for select using (get_user_role() = 'manager' or staff_id = (select id from profiles where auth_user_id = auth.uid()));
create policy "insert sales" on sales for insert with check (true);
create policy "read sale items" on sale_items for select using (true);
create policy "insert sale items" on sale_items for insert with check (true);
create policy "read stock movements" on stock_movements for select using (get_user_role() = 'manager');
create policy "insert stock movements" on stock_movements for insert with check (true);

insert into categories (name) values
  ('Cement'),('Iron & Steel'),('Roofing'),('Tools'),
  ('Plumbing'),('Electrical'),('General Hardware')
on conflict (name) do nothing;

insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Ghacem Cement 42.5R','CEM-001','bag',80,95,48,20 from categories where name='Cement'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Iron Rod 12mm','IRN-012','length',50,65,120,30 from categories where name='Iron & Steel'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Iron Rod 16mm','IRN-016','length',35,45,80,30 from categories where name='Iron & Steel'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Binding Wire','BND-001','roll',35,45,60,15 from categories where name='Iron & Steel'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Roofing Sheet','RFG-001','sheet',95,120,40,10 from categories where name='Roofing'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Nails (Common)','NLS-001','kg',18,25,200,50 from categories where name='General Hardware'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Wheelbarrow','WHL-001','piece',350,450,15,5 from categories where name='Tools'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Blocks','BLK-001','piece',10,15,300,100 from categories where name='General Hardware'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Building Sand','SND-001','trip',150,180,25,10 from categories where name='General Hardware'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Chippings','CHP-001','trip',180,220,20,10 from categories where name='General Hardware'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Timber','TMB-001','piece',120,150,35,10 from categories where name='General Hardware'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Plywood','PLY-001','sheet',260,320,18,5 from categories where name='General Hardware'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'PVC Pipe','PVC-001','length',55,75,60,20 from categories where name='Plumbing'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Plumbing Fittings','PLB-001','piece',12,20,100,30 from categories where name='Plumbing'
on conflict (sku) do nothing;
insert into products (category_id, name, sku, unit, cost_price, selling_price, stock_quantity, low_stock_threshold)
select id,'Paint 20L','PNT-001','bucket',220,280,22,8 from categories where name='General Hardware'
on conflict (sku) do nothing;
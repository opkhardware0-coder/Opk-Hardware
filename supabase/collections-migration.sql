-- OPK HARDWARES goods-collection workflow.
-- Run after schema.sql and pos-migration.sql. Additive only.

-- Repair legacy installations where sale_items was created before the POS
-- migration added its product snapshot columns.
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

alter table public.products add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
on storage.objects for select to public
using (bucket_id = 'product-images');
drop policy if exists "Managers can upload product images" on storage.objects;
create policy "Managers can upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_admin_or_manager())
);
drop policy if exists "Managers can update product images" on storage.objects;
create policy "Managers can update product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_admin_or_manager())
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_admin_or_manager())
);
drop policy if exists "Managers can delete product images" on storage.objects;
create policy "Managers can delete product images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.is_admin_or_manager())
);

create table if not exists public.goods_collection_orders (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete set null,
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_by_name text not null,
  status text not null check (status in ('pending', 'partial', 'completed')),
  expected_date date,
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.goods_collection_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.goods_collection_orders (id) on delete restrict,
  sale_item_id uuid not null unique references public.sale_items (id) on delete restrict,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  sku text,
  unit text not null default 'each',
  quantity_sold numeric(12, 3) not null check (quantity_sold > 0),
  quantity_collected numeric(12, 3) not null default 0
    check (quantity_collected >= 0 and quantity_collected <= quantity_sold),
  created_at timestamptz not null default now()
);

create table if not exists public.goods_collection_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.goods_collection_orders (id) on delete restrict,
  item_id uuid not null references public.goods_collection_items (id) on delete restrict,
  sale_id uuid not null references public.sales (id) on delete restrict,
  product_name text not null,
  customer_id uuid references public.customers (id) on delete set null,
  quantity numeric(12, 3) not null check (quantity > 0),
  collected_by uuid not null references public.profiles (id) on delete restrict,
  collected_by_name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.sale_checkout_requests (
  request_id uuid primary key,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists goods_collection_orders_status_created_idx
  on public.goods_collection_orders (status, created_at desc);
create index if not exists goods_collection_orders_customer_created_idx
  on public.goods_collection_orders (customer_id, created_at desc);
create index if not exists goods_collection_items_order_idx
  on public.goods_collection_items (order_id);
create index if not exists goods_collection_items_product_idx
  on public.goods_collection_items (product_id);
create index if not exists goods_collection_events_order_created_idx
  on public.goods_collection_events (order_id, created_at desc);
create index if not exists goods_collection_events_collector_created_idx
  on public.goods_collection_events (collected_by, created_at desc);

alter table public.goods_collection_orders enable row level security;
alter table public.goods_collection_items enable row level security;
alter table public.goods_collection_events enable row level security;

drop policy if exists "Authenticated staff can read collection orders" on public.goods_collection_orders;
create policy "Authenticated staff can read collection orders"
on public.goods_collection_orders for select to authenticated using (true);
drop policy if exists "Authenticated staff can read collection items" on public.goods_collection_items;
create policy "Authenticated staff can read collection items"
on public.goods_collection_items for select to authenticated using (true);
drop policy if exists "Authenticated staff can read collection events" on public.goods_collection_events;
create policy "Authenticated staff can read collection events"
on public.goods_collection_events for select to authenticated using (true);

revoke all on public.goods_collection_orders, public.goods_collection_items,
  public.goods_collection_events from anon, authenticated;
grant select on public.goods_collection_orders, public.goods_collection_items,
  public.goods_collection_events to authenticated;
alter table public.sale_checkout_requests enable row level security;
revoke all on public.sale_checkout_requests from anon, authenticated;

create or replace function public.create_product_with_stock(
  p_sku text,
  p_name text,
  p_category text,
  p_unit text,
  p_cost_price numeric,
  p_retail_price numeric,
  p_wholesale_price numeric,
  p_initial_stock numeric,
  p_min_stock numeric,
  p_image_path text default null
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
begin
  if not (select public.is_admin_or_manager()) then raise exception 'Manager or admin access is required.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required.'; end if;
  if p_cost_price is null or p_cost_price < 0 or p_cost_price <> round(p_cost_price, 2)
    or p_retail_price is null or p_retail_price < 0 or p_retail_price <> round(p_retail_price, 2)
    or p_wholesale_price is null or p_wholesale_price < 0 or p_wholesale_price <> round(p_wholesale_price, 2) then
    raise exception 'Product prices must be non-negative and use no more than two decimal places.';
  end if;
  if p_initial_stock is null or p_initial_stock < 0 or p_initial_stock <> round(p_initial_stock, 3)
    or p_min_stock is null or p_min_stock < 0 or p_min_stock <> round(p_min_stock, 3) then
    raise exception 'Stock quantities must be non-negative and use no more than three decimal places.';
  end if;
  if nullif(trim(p_unit), '') is null then raise exception 'Choose a unit of measurement.'; end if;
  if p_image_path is not null and (storage.foldername(p_image_path))[1] <> (select auth.uid())::text then
    raise exception 'Product images must be uploaded to your own staff folder.';
  end if;

  insert into public.products (
    sku, name, category, unit, cost_price, retail_price, wholesale_price, stock_qty, min_stock, image_path
  ) values (
    nullif(trim(p_sku), ''), trim(p_name), nullif(trim(p_category), ''), trim(p_unit),
    p_cost_price, p_retail_price, p_wholesale_price, p_initial_stock, p_min_stock, p_image_path
  ) returning * into v_product;

  if p_initial_stock > 0 then
    insert into public.inventory_movements (
      product_id, product_name, movement_type, quantity_change, quantity_after, reason, created_by
    ) values (
      v_product.id, v_product.name, 'adjustment', p_initial_stock, p_initial_stock,
      'Initial stock on product creation', (select auth.uid())
    );
  end if;
  return v_product;
end;
$$;

create or replace function public.complete_sale_with_collection(
  p_customer_id uuid,
  p_items jsonb,
  p_price_tier text,
  p_payment_method text,
  p_amount_tendered numeric,
  p_collection_items jsonb,
  p_request_id uuid,
  p_expected_date date default null,
  p_collection_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale jsonb;
  v_sale_id uuid;
  v_order_id uuid;
  v_sale_line record;
  v_collection record;
  v_item_id uuid;
  v_remaining numeric(12, 3);
  v_total_remaining numeric(12, 3) := 0;
  v_total_collected numeric(12, 3) := 0;
  v_status text;
  v_actor_name text;
  v_request_hash text;
  v_existing_hash text;
  v_existing_result jsonb;
  v_result jsonb;
begin
  if p_request_id is null then raise exception 'A checkout request id is required.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  v_request_hash := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'customer_id', p_customer_id,
    'items', p_items,
    'price_tier', p_price_tier,
    'payment_method', p_payment_method,
    'amount_tendered', p_amount_tendered,
    'collection_items', p_collection_items,
    'expected_date', p_expected_date,
    'collection_notes', p_collection_notes
  )::text);
  select request_hash, result into v_existing_hash, v_existing_result
  from public.sale_checkout_requests
  where request_id = p_request_id and requested_by = (select auth.uid());
  if found then
    if v_existing_hash <> v_request_hash then
      raise exception 'This checkout request was already completed with different cart details. Check Sales History before starting another sale.';
    end if;
    return v_existing_result;
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Sale items must be a JSON array.';
  end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'A sale must contain between 1 and 100 product lines.';
  end if;
  if p_collection_items is null or jsonb_typeof(p_collection_items) is distinct from 'array' then
    raise exception 'Collection quantities must be provided for every sale product.';
  end if;
  if exists (
    select product_id
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
    group by product_id having count(*) > 1
  ) then raise exception 'A product may only appear once in a sale.'; end if;
  if jsonb_array_length(p_collection_items) > 100 then raise exception 'A sale supports at most 100 collection lines.'; end if;

  select count(*) into v_total_collected
  from jsonb_to_recordset(p_collection_items) as item(product_id uuid, quantity_collected numeric);
  if v_total_collected <> jsonb_array_length(p_collection_items) then
    raise exception 'Every collection entry must contain a product and collection quantity.';
  end if;
  if exists (
    select product_id
    from jsonb_to_recordset(p_collection_items) as item(product_id uuid, quantity_collected numeric)
    group by product_id having count(*) > 1
  ) then raise exception 'A product may only appear once in collection quantities.'; end if;
  if exists (
    (select product_id from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
      except select product_id from jsonb_to_recordset(p_collection_items) as item(product_id uuid, quantity_collected numeric))
    union all
    (select product_id from jsonb_to_recordset(p_collection_items) as item(product_id uuid, quantity_collected numeric)
      except select product_id from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric))
  ) then raise exception 'Collection quantities must match the products in this sale.'; end if;

  v_sale := public.complete_sale(p_customer_id, p_items, p_price_tier, p_payment_method, p_amount_tendered);
  v_sale_id := (v_sale ->> 'sale_id')::uuid;
  select coalesce(nullif(trim(full_name), ''), 'Staff member') into v_actor_name
  from public.profiles where id = (select auth.uid());

  for v_sale_line in
    select id, product_id, product_name, sku, quantity
    from public.sale_items where sale_id = v_sale_id order by created_at, id
  loop
    select product_id, quantity_collected into v_collection
    from jsonb_to_recordset(p_collection_items) as item(product_id uuid, quantity_collected numeric)
    where product_id = v_sale_line.product_id;
    if not found then raise exception 'Choose the quantity collected now for each sale product.'; end if;
    if v_collection.quantity_collected is null or v_collection.quantity_collected < 0
      or v_collection.quantity_collected > v_sale_line.quantity
      or v_collection.quantity_collected <> round(v_collection.quantity_collected, 3) then
      raise exception 'Collected quantity must be between zero and the sold quantity, with up to three decimal places.';
    end if;
    v_total_remaining := v_total_remaining + v_sale_line.quantity - v_collection.quantity_collected;
    v_total_collected := v_total_collected + v_collection.quantity_collected;
  end loop;

  if jsonb_array_length(p_collection_items) <> (select count(*) from public.sale_items where sale_id = v_sale_id) then
    raise exception 'Collection quantities do not match this sale.';
  end if;

  v_status := case when v_total_remaining = 0 then 'completed'
    when v_total_collected = 0 then 'pending' else 'partial' end;
  insert into public.goods_collection_orders (
    sale_id, customer_id, recorded_by, recorded_by_name, status, expected_date, notes, completed_at
  ) values (
    v_sale_id, p_customer_id, (select auth.uid()), v_actor_name, v_status, p_expected_date,
    nullif(trim(p_collection_notes), ''), case when v_total_remaining = 0 then pg_catalog.now() else null end
  ) returning id into v_order_id;

  for v_sale_line in
    select si.id, si.product_id, si.product_name, si.sku, si.quantity, p.unit
    from public.sale_items si
    left join public.products p on p.id = si.product_id
    where si.sale_id = v_sale_id order by si.created_at, si.id
  loop
    select quantity_collected into v_collection
    from jsonb_to_recordset(p_collection_items) as item(product_id uuid, quantity_collected numeric)
    where product_id = v_sale_line.product_id;
    insert into public.goods_collection_items (
      order_id, sale_item_id, product_id, product_name, sku, unit, quantity_sold, quantity_collected
    ) values (
      v_order_id, v_sale_line.id, v_sale_line.product_id, v_sale_line.product_name, v_sale_line.sku,
      coalesce(v_sale_line.unit, 'each'), v_sale_line.quantity, v_collection.quantity_collected
    ) returning id into v_item_id;
    if v_collection.quantity_collected > 0 then
      insert into public.goods_collection_events (
        order_id, item_id, sale_id, product_name, customer_id, quantity, collected_by, collected_by_name, notes
      ) values (
        v_order_id, v_item_id, v_sale_id, v_sale_line.product_name, p_customer_id,
        v_collection.quantity_collected, (select auth.uid()), v_actor_name, 'Collected at sale completion'
      );
    end if;
  end loop;

  v_result := v_sale || jsonb_build_object(
    'collection_order_id', v_order_id, 'collection_status', v_status,
    'quantity_to_collect', v_total_remaining
  );
  insert into public.sale_checkout_requests (request_id, requested_by, request_hash, result)
  values (p_request_id, (select auth.uid()), v_request_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.complete_sale_once(
  p_customer_id uuid,
  p_items jsonb,
  p_price_tier text,
  p_payment_method text,
  p_amount_tendered numeric,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_existing_hash text;
  v_result jsonb;
begin
  if p_request_id is null then raise exception 'A checkout request id is required.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  v_hash := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'customer_id', p_customer_id,
    'items', p_items,
    'price_tier', p_price_tier,
    'payment_method', p_payment_method,
    'amount_tendered', p_amount_tendered
  )::text);
  select request_hash, result into v_existing_hash, v_result
  from public.sale_checkout_requests
  where request_id = p_request_id and requested_by = (select auth.uid());
  if found then
    if v_existing_hash <> v_hash then
      raise exception 'This checkout request was already completed with different sale details. Check Sales History before starting another sale.';
    end if;
    return v_result;
  end if;
  v_result := public.complete_sale(p_customer_id, p_items, p_price_tier, p_payment_method, p_amount_tendered);
  insert into public.sale_checkout_requests (request_id, requested_by, request_hash, result)
  values (p_request_id, (select auth.uid()), v_hash, v_result);
  return v_result;
end;
$$;

create or replace function public.record_goods_collection(
  p_item_id uuid,
  p_quantity numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.goods_collection_items%rowtype;
  v_order public.goods_collection_orders%rowtype;
  v_event_id uuid;
  v_remaining numeric(12, 3);
  v_order_status text;
  v_actor_name text;
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid())) then
    raise exception 'A staff profile is required to record a goods collection.';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 3) then
    raise exception 'Collection quantity must be positive and use up to three decimal places.';
  end if;

  select * into v_item from public.goods_collection_items where id = p_item_id for update;
  if not found then raise exception 'The collection item was not found.'; end if;
  select * into v_order from public.goods_collection_orders where id = v_item.order_id for update;
  if not found then raise exception 'The collection order was not found.'; end if;
  select coalesce(nullif(trim(full_name), ''), 'Staff member') into v_actor_name
  from public.profiles where id = (select auth.uid());
  v_remaining := v_item.quantity_sold - v_item.quantity_collected;
  if p_quantity > v_remaining then raise exception 'Collection exceeds the remaining quantity of %.', v_remaining; end if;

  update public.goods_collection_items
  set quantity_collected = quantity_collected + p_quantity where id = v_item.id
  returning * into v_item;
  insert into public.goods_collection_events (
    order_id, item_id, sale_id, product_name, customer_id, quantity, collected_by, collected_by_name, notes
  ) values (
    v_order.id, v_item.id, v_order.sale_id, v_item.product_name, v_order.customer_id,
    p_quantity, (select auth.uid()), v_actor_name, nullif(trim(p_notes), '')
  ) returning id into v_event_id;

  if not exists (
    select 1 from public.goods_collection_items
    where order_id = v_order.id and quantity_collected < quantity_sold
  ) then
    v_order_status := 'completed';
    update public.goods_collection_orders set status = 'completed', completed_at = pg_catalog.now()
    where id = v_order.id;
  else
    v_order_status := case when exists (
      select 1 from public.goods_collection_items
      where order_id = v_order.id and quantity_collected > 0
    ) then 'partial' else 'pending' end;
    update public.goods_collection_orders set status = v_order_status, completed_at = null
    where id = v_order.id;
  end if;

  return jsonb_build_object(
    'event_id', v_event_id, 'item_id', v_item.id, 'quantity_collected', v_item.quantity_collected,
    'quantity_remaining', v_item.quantity_sold - v_item.quantity_collected, 'status', v_order_status
  );
end;
$$;

create or replace function public.get_staff_directory()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), 'Staff')
  from public.profiles p
  where (select auth.uid()) is not null
  order by p.full_name;
$$;

revoke all on function public.create_product_with_stock(text, text, text, text, numeric, numeric, numeric, numeric, numeric) from public;
revoke all on function public.create_product_with_stock(text, text, text, text, numeric, numeric, numeric, numeric, numeric, text) from public;
revoke all on function public.create_product_with_stock(text, text, text, text, numeric, numeric, numeric, numeric, numeric) from authenticated;
revoke all on function public.complete_sale(uuid, jsonb, text, text, numeric) from authenticated;
revoke all on function public.complete_sale_once(uuid, jsonb, text, text, numeric, uuid) from public;
revoke all on function public.complete_sale_with_collection(uuid, jsonb, text, text, numeric, jsonb, uuid, date, text) from public;
revoke all on function public.record_goods_collection(uuid, numeric, text) from public;
revoke all on function public.get_staff_directory() from public;
grant execute on function public.create_product_with_stock(text, text, text, text, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.complete_sale_with_collection(uuid, jsonb, text, text, numeric, jsonb, uuid, date, text) to authenticated;
grant execute on function public.complete_sale_once(uuid, jsonb, text, text, numeric, uuid) to authenticated;
grant execute on function public.record_goods_collection(uuid, numeric, text) to authenticated;
grant execute on function public.get_staff_directory() to authenticated;
grant update (image_path) on public.products to authenticated;

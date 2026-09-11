-- All stock values represent AVAILABLE units; pending orders hold their units.
create table public.sellers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Seller',
  created_at timestamptz not null default now()
);
create function public.is_seller() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.sellers where user_id = auth.uid()); $$;
create table public.products (
  id uuid primary key default gen_random_uuid(), slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(name) between 3 and 160), category text not null check (category in ('Diecast', 'Pokémon')),
  brand text not null default '', price_cents integer not null check (price_cents between 50 and 9999999),
  stock integer not null default 0 check (stock between 0 and 100000), condition text not null,
  description text not null default '', image_url text not null default '', details jsonb not null default '{}',
  featured boolean not null default false, active boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.touch_product() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
create trigger product_updated before update on public.products for each row execute function public.touch_product();
create table public.orders (
  id uuid primary key default gen_random_uuid(), request_id uuid unique not null, request_items jsonb not null,
  client_hash text not null, status text not null default 'pending' check (status in ('pending','paid','shipped','cancelled','payment_review')),
  subtotal_cents integer not null default 0 check(subtotal_cents >= 0), total_cents integer, tax_cents integer not null default 0, shipping_cents integer not null default 0,
  currency text not null default 'usd' check(currency = 'usd'), stripe_session_id text unique, stripe_payment_id text,
  customer_email text, shipping jsonb not null default '{}', tracking_number text, shipping_carrier text,
  created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '35 minutes', paid_at timestamptz, shipped_at timestamptz
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id), name text not null, unit_price_cents integer not null check(unit_price_cents > 0), quantity integer not null check(quantity between 1 and 20), unique(order_id, product_id)
);
create index orders_pending on public.orders(expires_at) where status = 'pending';
create index orders_client on public.orders(client_hash, created_at);
create index order_items_order on public.order_items(order_id);
create index products_public on public.products(active, created_at desc);
alter table public.sellers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
create policy seller_self on public.sellers for select to authenticated using (user_id = auth.uid());
create policy public_catalog on public.products for select to anon, authenticated using (active or public.is_seller());
create policy seller_products_insert on public.products for insert to authenticated with check(public.is_seller());
create policy seller_products_update on public.products for update to authenticated using(public.is_seller()) with check(public.is_seller());
create policy seller_orders on public.orders for select to authenticated using(public.is_seller());
create policy seller_order_items on public.order_items for select to authenticated using(public.is_seller());
grant select on public.products to anon, authenticated;
grant insert, update on public.products to authenticated;
grant select on public.sellers, public.orders, public.order_items to authenticated;
grant all on public.sellers, public.products, public.orders, public.order_items to service_role;

create function public.reserve_order(p_items jsonb, p_request_id uuid, p_client_hash text) returns uuid language plpgsql security definer set search_path = '' as $$
declare item jsonb; product public.products; existing public.orders; order_id uuid; subtotal bigint := 0; qty integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 or p_request_id is null or length(p_client_hash) <> 64 then raise exception 'Invalid bag'; end if;
  if (select count(*) from jsonb_array_elements(p_items)) <> (select count(distinct value->>'id') from jsonb_array_elements(p_items)) then raise exception 'Duplicate products'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into existing from public.orders where request_id = p_request_id;
  if found then
    if existing.request_items <> p_items or existing.client_hash <> p_client_hash then raise exception 'Invalid request reuse'; end if;
    return existing.id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_hash, 1));
  if (select count(*) from public.orders where client_hash = p_client_hash and created_at > now() - interval '10 minutes') >= 10 then raise exception 'Too many checkout attempts'; end if;
  insert into public.orders(request_id, request_items, client_hash) values(p_request_id, p_items, p_client_hash) returning id into order_id;
  for item in select value from jsonb_array_elements(p_items) order by value->>'id' loop
    if jsonb_typeof(item->'quantity') <> 'number' or (item->>'quantity') !~ '^[0-9]+$' then raise exception 'Invalid quantity'; end if;
    qty := (item->>'quantity')::integer;
    if qty not between 1 and 20 then raise exception 'Invalid quantity'; end if;
    select * into product from public.products where id = (item->>'id')::uuid for update;
    if not found or not product.active or product.stock < qty then raise exception 'Not enough stock'; end if;
    update public.products set stock = stock - qty where id = product.id;
    insert into public.order_items(order_id, product_id, name, unit_price_cents, quantity) values(order_id, product.id, product.name, product.price_cents, qty);
    subtotal := subtotal + product.price_cents::bigint * qty;
  end loop;
  if subtotal > 99999999 then raise exception 'Bag total too large'; end if;
  update public.orders set subtotal_cents = subtotal where id = order_id;
  return order_id;
end; $$;

create function public.attach_checkout_session(p_order_id uuid, p_session_id text) returns void language plpgsql security definer set search_path = '' as $$
declare existing public.orders;
begin
  select * into existing from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order missing'; end if;
  if existing.stripe_session_id is not null and existing.stripe_session_id <> p_session_id then raise exception 'Session mismatch'; end if;
  update public.orders set stripe_session_id = p_session_id where id = p_order_id;
end; $$;

create function public.complete_order(p_order_id uuid, p_session_id text, p_total integer, p_subtotal integer, p_currency text, p_email text, p_shipping jsonb, p_payment_id text, p_tax integer, p_shipping_cents integer) returns void language plpgsql security definer set search_path = '' as $$
declare existing public.orders;
begin
  select * into existing from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order missing'; end if;
  if p_currency is distinct from 'usd' or p_subtotal is distinct from existing.subtotal_cents or p_total is distinct from (p_subtotal + p_tax + p_shipping_cents) then raise exception 'Payment amount mismatch'; end if;
  if existing.stripe_session_id is not null and existing.stripe_session_id <> p_session_id then raise exception 'Session mismatch'; end if;
  if existing.status in ('paid','shipped','payment_review') then return; end if;
  update public.orders set status = case when status = 'cancelled' then 'payment_review' else 'paid' end,
    stripe_session_id = p_session_id, stripe_payment_id = p_payment_id, total_cents = p_total, customer_email = p_email,
    shipping = p_shipping, tax_cents = p_tax, shipping_cents = p_shipping_cents, paid_at = now() where id = p_order_id;
end; $$;

create function public.release_order(p_order_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare existing public.orders; item record;
begin
  select * into existing from public.orders where id = p_order_id for update;
  if not found or existing.status <> 'pending' then return; end if;
  for item in select product_id, quantity from public.order_items where order_id = p_order_id order by product_id loop
    update public.products set stock = stock + item.quantity where id = item.product_id;
  end loop;
  update public.orders set status = 'cancelled' where id = p_order_id;
end; $$;

create function public.ship_order(p_order_id uuid, p_tracking text, p_carrier text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_seller() then raise exception 'Seller access required'; end if;
  if length(trim(p_tracking)) not between 3 and 100 or length(trim(p_carrier)) not between 2 and 50 then raise exception 'Valid tracking and carrier required'; end if;
  update public.orders set status = 'shipped', tracking_number = trim(p_tracking), shipping_carrier = trim(p_carrier), shipped_at = coalesce(shipped_at, now()) where id = p_order_id and status in ('paid','shipped');
  if not found then raise exception 'Only paid orders may be shipped'; end if;
end; $$;

revoke all on function public.is_seller() from public;
grant execute on function public.is_seller() to anon, authenticated, service_role;
revoke all on function public.reserve_order(jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.attach_checkout_session(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_order(uuid, text, integer, integer, text, text, jsonb, text, integer, integer) from public, anon, authenticated;
revoke all on function public.release_order(uuid) from public, anon, authenticated;
revoke all on function public.ship_order(uuid, text, text) from public, anon;
grant execute on function public.reserve_order(jsonb, uuid, text), public.attach_checkout_session(uuid, text), public.complete_order(uuid, text, integer, integer, text, text, jsonb, text, integer, integer), public.release_order(uuid) to service_role;
grant execute on function public.ship_order(uuid, text, text) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
create policy public_product_images on storage.objects for select to anon, authenticated using(bucket_id = 'product-images');
create policy seller_image_upload on storage.objects for insert to authenticated with check(bucket_id = 'product-images' and public.is_seller());

-- Billing V5: allow PayOS as a billing ledger provider.
-- Apply before enabling real PayOS checkout/webhook traffic.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'billing_customers'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%provider%'
  loop
    execute format('alter table public.billing_customers drop constraint %I', constraint_name);
  end loop;

  alter table public.billing_customers
    add constraint billing_customers_provider_check
    check (provider in ('stripe', 'app_store', 'google_play', 'payos', 'manual', 'trial'));
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'billing_subscriptions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%provider%'
  loop
    execute format('alter table public.billing_subscriptions drop constraint %I', constraint_name);
  end loop;

  alter table public.billing_subscriptions
    add constraint billing_subscriptions_provider_check
    check (provider in ('stripe', 'app_store', 'google_play', 'payos', 'manual', 'trial'));
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'billing_invoices'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%provider%'
  loop
    execute format('alter table public.billing_invoices drop constraint %I', constraint_name);
  end loop;

  alter table public.billing_invoices
    add constraint billing_invoices_provider_check
    check (provider in ('stripe', 'app_store', 'google_play', 'payos', 'manual', 'trial'));
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'billing_refunds'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%provider%'
  loop
    execute format('alter table public.billing_refunds drop constraint %I', constraint_name);
  end loop;

  alter table public.billing_refunds
    add constraint billing_refunds_provider_check
    check (provider in ('stripe', 'app_store', 'google_play', 'payos', 'manual', 'trial'));
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'billing_events'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%provider%'
  loop
    execute format('alter table public.billing_events drop constraint %I', constraint_name);
  end loop;

  alter table public.billing_events
    add constraint billing_events_provider_check
    check (provider in ('stripe', 'app_store', 'google_play', 'payos', 'manual', 'trial'));
end $$;

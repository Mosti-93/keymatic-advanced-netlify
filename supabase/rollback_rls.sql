-- Undo the RLS migrations: restore the exact setup recorded by audit.sql on
-- 2026-11-04 (RLS on/off per table, the original policies and grants), and
-- remove the helpers and trigger the migrations added.

begin;

-- 1) Drop every policy on the affected tables
do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('users', 'clients', 'pickup_requests', 'keys', 'key_slot_presence', 'machines',
                        'door_events', 'access_logs', 'relay_config', 'test_table')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 2) RLS on/off exactly as before
alter table public.clients disable row level security;
alter table public.pickup_requests disable row level security;
alter table if exists public.door_events disable row level security;
alter table public.users enable row level security;
alter table if exists public.keys enable row level security;
alter table if exists public.key_slot_presence enable row level security;
alter table if exists public.machines enable row level security;
alter table if exists public.relay_config enable row level security;
alter table if exists public.test_table enable row level security;
alter table if exists public.access_logs enable row level security;

-- 3) Original policies: "authenticated can do everything" on these tables
do $$
declare t text;
begin
  foreach t in array array['clients', 'key_slot_presence', 'keys', 'machines', 'pickup_requests', 'relay_config', 'test_table'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create policy %I on public.%I for delete to authenticated using (true)', 'auth delete ' || t, t);
      execute format('create policy %I on public.%I for insert to authenticated with check (true)', 'auth insert ' || t, t);
      execute format('create policy %I on public.%I for select to authenticated using (true)', 'auth read ' || t, t);
      execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', 'auth update ' || t, t);
      if t <> 'keys' then
        execute format('create policy %I on public.%I for select to authenticated using (true)', 'auth users can read ' || t, t);
      end if;
    end if;
  end loop;
end $$;
create policy "all authenticated can read" on public.keys for select to authenticated using (true);

-- Original users policies
create policy "users admin can read all" on public.users for select to authenticated
  using ((((auth.jwt() -> 'app_metadata') ->> 'role') = 'admin') or (id = auth.uid()));
create policy "users admin update" on public.users for update to authenticated
  using (((auth.jwt() -> 'app_metadata') ->> 'role') = 'admin')
  with check (((auth.jwt() -> 'app_metadata') ->> 'role') = 'admin');
create policy "users insert own profile" on public.users for insert to authenticated with check (id = auth.uid());
create policy "users read own profile" on public.users for select to authenticated using (id = auth.uid());
create policy "users update own profile" on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 4) Original grants (anon and authenticated had everything)
grant all on all tables in schema public to anon, authenticated;
alter view if exists public.key_slot_presence_v set (security_invoker = false);

-- 5) Remove what the migrations added
drop trigger if exists users_prevent_role_self_change on public.users;
drop function if exists public.prevent_role_self_change();
drop function if exists public.is_admin();
drop function if exists public.current_app_role();

commit;

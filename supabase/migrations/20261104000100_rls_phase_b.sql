-- ============================================================================
-- Row Level Security — Phase B: keys, key_slot_presence, machines
--
-- ⚠️ APPLY ONLY AFTER CHECKING THE RASPBERRY PI CODE. If the Pi talks to
-- Supabase with the public anon key, it would lose access to these tables.
-- The Pi must use the service role key (or a dedicated policy must be added).
--
-- Requires Phase A (uses public.is_admin()). Undo: supabase/rollback_rls.sql
-- ============================================================================

begin;

do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('keys', 'key_slot_presence', 'machines', 'door_events', 'access_logs', 'relay_config', 'test_table')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- machines: any signed-in user can read (names/addresses shown to owners and
-- guests); only admins change them.
alter table public.machines enable row level security;

create policy machines_select on public.machines
  for select to authenticated using (true);
create policy machines_admin_write on public.machines
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- keys: admins all; owners read their keys; guests read the key of their booking.
alter table public.keys enable row level security;

create policy keys_select on public.keys
  for select to authenticated
  using (
    public.is_admin()
    or owner_id = auth.uid()
    or uuid in (select key_id from public.clients where lower(email) = lower(auth.jwt() ->> 'email'))
  );
create policy keys_admin_write on public.keys
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- key_slot_presence: admins all; owners read slots holding their keys.
alter table public.key_slot_presence enable row level security;

create policy slots_select on public.key_slot_presence
  for select to authenticated
  using (
    public.is_admin()
    or "UID" in (select "UID" from public.keys where owner_id = auth.uid())
  );
create policy slots_admin_write on public.key_slot_presence
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Machine/device tables: admins only from the browser (the Pi and Edge
-- Functions use the service role). Tables that do not exist are skipped.
do $$
declare t text;
begin
  foreach t in array array['door_events', 'access_logs', 'relay_config', 'test_table'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
        t || '_admin_all', t);
      execute format('revoke all on public.%I from anon', t);
    end if;
  end loop;
end $$;

-- Views run with their owner's rights by default, which would bypass the
-- rules above; make the slot view respect the caller's RLS.
alter view if exists public.key_slot_presence_v set (security_invoker = true);

revoke all on public.keys, public.key_slot_presence, public.machines from anon;

commit;

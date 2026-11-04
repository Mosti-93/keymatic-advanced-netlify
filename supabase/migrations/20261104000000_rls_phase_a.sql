-- ============================================================================
-- Row Level Security — Phase A: users, clients, pickup_requests
--
-- Requires the web app version that loads guest pickups through
-- /api/pickup-link (server, service role). Server routes and Edge Functions use
-- the service role and are not affected by RLS.
--
-- Run audit.sql first and keep its output. This script REPLACES all existing
-- policies on the three tables below. Undo: supabase/rollback_rls.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Role helpers (security definer, so they can read public.users without
-- recursing into its own policies)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(role)) from public.users where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Remove whatever policies exist today on these tables (they are OR-ed with
-- ours, so a leftover "allow all" policy would keep the table open).
do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('users', 'clients', 'pickup_requests')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- users: everyone sees their own row; admins see and manage everyone.
-- Nobody but an admin can change a role (trigger below).
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;

create policy users_select_own_or_admin on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy users_update_own_or_admin on public.users
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy users_insert_admin on public.users
  for insert to authenticated
  with check (public.is_admin());

create policy users_delete_admin on public.users
  for delete to authenticated
  using (public.is_admin());

create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role and database triggers: allowed.
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can change roles';
  end if;
  return new;
end;
$$;

drop trigger if exists users_prevent_role_self_change on public.users;
create trigger users_prevent_role_self_change
  before update on public.users
  for each row execute function public.prevent_role_self_change();

-- ---------------------------------------------------------------------------
-- clients (guest bookings): admins all; owners their own guests;
-- a signed-in guest can read bookings made with their email.
-- ---------------------------------------------------------------------------
alter table public.clients enable row level security;

create policy clients_select on public.clients
  for select to authenticated
  using (
    public.is_admin()
    or owner_id = auth.uid()
    or lower(email) = lower(auth.jwt() ->> 'email')
  );

create policy clients_insert on public.clients
  for insert to authenticated
  with check (public.is_admin() or owner_id = auth.uid());

create policy clients_update on public.clients
  for update to authenticated
  using (public.is_admin() or owner_id = auth.uid())
  with check (public.is_admin() or owner_id = auth.uid());

create policy clients_delete on public.clients
  for delete to authenticated
  using (public.is_admin() or owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- pickup_requests: holds the machine door links. Server only — no policies
-- means no access for anon or signed-in users; the service role still works.
-- ---------------------------------------------------------------------------
alter table public.pickup_requests enable row level security;

commit;

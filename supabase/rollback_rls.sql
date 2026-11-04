-- Undo the RLS migrations: turn RLS off again on the affected tables and remove
-- the policies, trigger and helpers they added. (Policies that existed before
-- are listed in your saved audit.sql output if you need to recreate them.)

begin;

do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('users', 'clients', 'pickup_requests', 'keys', 'key_slot_presence', 'machines')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table public.users disable row level security;
alter table public.clients disable row level security;
alter table public.pickup_requests disable row level security;
alter table if exists public.keys disable row level security;
alter table if exists public.key_slot_presence disable row level security;
alter table if exists public.machines disable row level security;

drop trigger if exists users_prevent_role_self_change on public.users;
drop function if exists public.prevent_role_self_change();
drop function if exists public.is_admin();
drop function if exists public.current_app_role();

commit;

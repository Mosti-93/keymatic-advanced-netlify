-- READ-ONLY. Shows the current security setup. Run in Supabase → SQL Editor
-- and save the output before applying any migration.

-- 1) Tables in the public schema and whether Row Level Security is on
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- 2) Existing policies (these are OR-ed together, so one permissive policy opens a table)
select tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) What the public (anon) and signed-in (authenticated) roles may do per table
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- 4) Triggers on auth.users (e.g. the one that creates public.users rows on sign-up)
select tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;

-- 5) Role values in use
select role, count(*) from public.users group by role order by 2 desc;

-- Door status + heartbeat written by the keywatcher Pi (108+), shown on the Overview.
alter table public.machines add column if not exists door_status text;
alter table public.machines add column if not exists door_updated_at timestamptz;
alter table public.machines add column if not exists last_seen_at timestamptz;

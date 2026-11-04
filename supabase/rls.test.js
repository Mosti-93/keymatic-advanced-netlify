// @vitest-environment node
// Runs the real RLS migrations against an in-process Postgres (PGlite) with
// Supabase-like roles and checks who can see and change what.
import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const R = path.resolve(__dirname);

it("RLS policies give each role exactly the access it needs", async () => {
  const db = new PGlite();
  // --- Supabase-like scaffolding: roles + auth.uid()/auth.jwt() from settings ---
  await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;

  create table public.users (id uuid primary key, name text, email text, role text, last_login timestamptz);
  create table public.clients (id serial primary key, first_name text, email text, owner_id uuid, key_id uuid, check_in text, check_out text);
  create table public.pickup_requests (link_token text, valid boolean, door_on_req text, room_no text);
  create table public.keys (id serial primary key, uuid uuid, "UID" text, room_number text, owner_id uuid, machine_id text);
  create table public.key_slot_presence (machine_id text, slot_number int, "UID" text);
  create table public.machines (id serial primary key, machine_id text, "Machine name" text);
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to anon, authenticated, service_role;
  grant all on all sequences in schema public to anon, authenticated, service_role;

  -- an existing permissive policy (the kind that must be removed)
  alter table public.clients enable row level security;
  create policy "allow all" on public.clients for all using (true) with check (true);
  `);

  const ADMIN = "00000000-0000-0000-0000-00000000000a",
    OWNER = "00000000-0000-0000-0000-00000000000b",
    OWNER2 = "00000000-0000-0000-0000-00000000000c",
    GUEST = "00000000-0000-0000-0000-00000000000d",
    K1 = "11111111-1111-1111-1111-111111111111",
    K2 = "22222222-2222-2222-2222-222222222222";
  await db.exec(`
  insert into public.users values ('${ADMIN}','Admin','admin@x.com','admin',null),('${OWNER}','Owner','own@x.com','Owner ',null),
    ('${OWNER2}','Owner2','own2@x.com','owner',null),('${GUEST}','Guest','lina@x.com','client',null);
  insert into public.clients (first_name,email,owner_id,key_id) values ('Lina','LINA@x.com','${OWNER}','${K1}'),('John','john@x.com','${OWNER2}','${K2}');
  insert into public.pickup_requests values ('tok',true,'https://pi/door','204');
  insert into public.keys (uuid,"UID",room_number,owner_id,machine_id) values ('${K1}','AA','204','${OWNER}','A12'),('${K2}','BB','305','${OWNER2}','A12');
  insert into public.key_slot_presence values ('A12',1,'AA'),('A12',2,'BB');
  insert into public.machines (machine_id,"Machine name") values ('A12','Alpha');
  `);

  await db.exec(fs.readFileSync(`${R}/migrations/20261104000000_rls_phase_a.sql`, "utf8"));
  await db.exec(fs.readFileSync(`${R}/migrations/20261104000100_rls_phase_b.sql`, "utf8"));

  async function as(role, uid, email, sql) {
    await db.exec(
      `reset role; select set_config('request.jwt.claim.sub', '${uid || ""}', false), set_config('request.jwt.claims', '${uid ? JSON.stringify({ sub: uid, email }) : ""}', false); set role ${role};`
    );
    try {
      return { rows: (await db.query(sql)).rows };
    } catch (e) {
      return { error: e.message };
    } finally {
      await db.exec("reset role");
    }
  }
  const count = async (...a) => (await as(...a)).rows?.length ?? -1;

  // anon (guest link page, attacker with the public key)
  for (const t of ["users", "clients", "pickup_requests", "keys", "key_slot_presence", "machines"])
    expect((await count("anon", null, null, `select * from public.${t}`)) === 0, `anon sees nothing in ${t}`).toBe(
      true
    );
  expect(
    (await as("anon", null, null, `update public.pickup_requests set valid=false returning 1`)).rows?.length === 0,
    "anon cannot expire a pickup link"
  ).toBe(true);

  // admin
  expect(
    (await count("authenticated", ADMIN, "admin@x.com", "select * from public.users")) === 4,
    "admin sees all users"
  ).toBe(true);
  expect(
    (await count("authenticated", ADMIN, "admin@x.com", "select * from public.clients")) === 2,
    "admin sees all guests"
  ).toBe(true);
  expect(
    (await count("authenticated", ADMIN, "admin@x.com", "select * from public.keys")) === 2,
    "admin sees all keys"
  ).toBe(true);
  expect(
    !(await as("authenticated", ADMIN, "admin@x.com", `update public.users set role='owner' where id='${GUEST}'`))
      .error,
    "admin can change someone's role"
  ).toBe(true);
  await db.exec(`update public.users set role='client' where id='${GUEST}'`);
  expect(
    (await count("authenticated", ADMIN, "admin@x.com", "select * from public.pickup_requests")) === 0,
    "even admins cannot read door links from the browser"
  ).toBe(true);

  // owner (role stored as 'Owner ' — mixed case/space)
  expect(
    (await count("authenticated", OWNER, "own@x.com", "select * from public.users")) === 1,
    "owner sees only own user row"
  ).toBe(true);
  expect(
    (await count("authenticated", OWNER, "own@x.com", "select * from public.clients")) === 1,
    "owner sees only own guests"
  ).toBe(true);
  expect(
    (await count("authenticated", OWNER, "own@x.com", "select * from public.keys")) === 1,
    "owner sees only own keys"
  ).toBe(true);
  expect(
    (await count("authenticated", OWNER, "own@x.com", "select * from public.key_slot_presence")) === 1,
    "owner sees only slots with own keys"
  ).toBe(true);
  expect(
    (await count("authenticated", OWNER, "own@x.com", "select * from public.machines")) === 1,
    "owner can read machines"
  ).toBe(true);
  expect(
    !(
      await as(
        "authenticated",
        OWNER,
        "own@x.com",
        `insert into public.clients (first_name,email,owner_id) values ('New','n@x.com','${OWNER}')`
      )
    ).error,
    "owner can add own guest"
  ).toBe(true);
  expect(
    !!(
      await as(
        "authenticated",
        OWNER,
        "own@x.com",
        `insert into public.clients (first_name,email,owner_id) values ('Evil','e@x.com','${OWNER2}')`
      )
    ).error,
    "owner cannot add guest for another owner"
  ).toBe(true);
  expect(
    (await as("authenticated", OWNER, "own@x.com", `delete from public.clients where owner_id='${OWNER2}' returning 1`))
      .rows?.length === 0,
    "owner cannot delete another owner's guests"
  ).toBe(true);
  expect(
    !!(await as("authenticated", OWNER, "own@x.com", `update public.users set role='admin' where id='${OWNER}'`)).error,
    "owner cannot make themselves admin"
  ).toBe(true);
  expect(
    !(await as("authenticated", OWNER, "own@x.com", `update public.users set last_login=now() where id='${OWNER}'`))
      .error,
    "owner can update own last_login (login page)"
  ).toBe(true);
  expect(
    (await as("authenticated", OWNER, "own@x.com", `update public.keys set owner_id='${OWNER}' returning 1`)).rows
      ?.length === 0,
    "owner cannot take over keys"
  ).toBe(true);

  // guest (client): bookings by email, case-insensitive
  expect(
    (await count("authenticated", GUEST, "lina@x.com", "select * from public.clients")) === 1,
    "guest sees own booking by email"
  ).toBe(true);
  expect(
    (await count("authenticated", GUEST, "lina@x.com", "select * from public.keys")) === 1,
    "guest sees only their booking's key"
  ).toBe(true);
  expect(
    (await count("authenticated", GUEST, "lina@x.com", "select * from public.users")) === 1,
    "guest sees only own user row"
  ).toBe(true);
  expect(
    !!(await as("authenticated", GUEST, "lina@x.com", `update public.users set role='admin' where id='${GUEST}'`))
      .error,
    "guest cannot make themselves admin"
  ).toBe(true);

  // service role (API routes / edge functions) unaffected
  expect(
    (await count("service_role", null, null, "select * from public.pickup_requests")) === 1,
    "server (service role) still reads pickup links"
  ).toBe(true);
  expect(
    !(await as("service_role", null, null, `update public.users set role='owner' where id='${GUEST}'`)).error,
    "server can change roles (set-role API)"
  ).toBe(true);

  // rollback works
  await db.exec(fs.readFileSync(`${R}/rollback_rls.sql`, "utf8"));
  expect((await count("anon", null, null, "select * from public.users")) === 4, "rollback restores access").toBe(true);
}, 60000);

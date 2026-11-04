// @vitest-environment node
// Runs the real RLS migrations against an in-process Postgres (PGlite) that
// mirrors the production setup recorded by audit.sql on 2026-11-04, and checks
// who can see and change what — including the holes that audit found.
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const R = path.resolve(__dirname);
const sql = (f) => fs.readFileSync(path.join(R, f), "utf8");

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const OWNER = "00000000-0000-0000-0000-00000000000b";
const OWNER2 = "00000000-0000-0000-0000-00000000000c";
const GUEST = "00000000-0000-0000-0000-00000000000d";
const NEWBIE = "00000000-0000-0000-0000-00000000000e";
const K1 = "11111111-1111-1111-1111-111111111111";
const K2 = "22222222-2222-2222-2222-222222222222";

const TABLES = [
  "users",
  "clients",
  "pickup_requests",
  "keys",
  "key_slot_presence",
  "machines",
  "door_events",
  "access_logs",
  "relay_config",
  "test_table",
];

/** Production as audited: RLS on/off per table, 40 policies, anon/authenticated granted everything. */
const PRODUCTION = `
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
create table public.door_events (id serial primary key, machine_id text, event text);
create table public.access_logs (id serial primary key, note text);
create table public.relay_config (id serial primary key, machine_id text, pin int);
create table public.test_table (id serial primary key, x text);
create view public.key_slot_presence_v as select * from public.key_slot_presence;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

alter table public.users enable row level security;
alter table public.keys enable row level security;
alter table public.key_slot_presence enable row level security;
alter table public.machines enable row level security;
alter table public.relay_config enable row level security;
alter table public.test_table enable row level security;
alter table public.access_logs enable row level security;
`;

let db;
async function as(role, uid, email, q) {
  const claims = uid ? JSON.stringify({ sub: uid, email }) : "";
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub', '${uid || ""}', false), set_config('request.jwt.claims', '${claims}', false); set role ${role};`
  );
  try {
    return { rows: (await db.query(q)).rows };
  } catch (e) {
    return { error: e.message };
  } finally {
    await db.exec("reset role");
  }
}
const rowsOf = async (...a) => (await as(...a)).rows?.length ?? -1;
const policyCount = async () =>
  (await db.query("select count(*)::int as n from pg_policies where schemaname='public'")).rows[0].n;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PRODUCTION);
  // the original policies, recreated by the rollback script's own block
  const rollback = sql("rollback_rls.sql");
  const policiesBlock = rollback.slice(
    rollback.indexOf("-- 3) Original policies"),
    rollback.indexOf("-- 4) Original grants")
  );
  await db.exec(policiesBlock);
  await db.exec(`
    insert into public.users values ('${ADMIN}','Admin','admin@x.com','admin',null),('${OWNER}','Owner','own@x.com','Owner ',null),
      ('${OWNER2}','Owner2','own2@x.com','owner',null),('${GUEST}','Guest','lina@x.com','client',null);
    insert into public.clients (first_name,email,owner_id,key_id) values ('Lina','LINA@x.com','${OWNER}','${K1}'),('John','john@x.com','${OWNER2}','${K2}');
    insert into public.pickup_requests values ('tok',true,'https://pi/door','204');
    insert into public.keys (uuid,"UID",room_number,owner_id,machine_id) values ('${K1}','AA','204','${OWNER}','A12'),('${K2}','BB','305','${OWNER2}','A12');
    insert into public.key_slot_presence values ('A12',1,'AA'),('A12',2,'BB');
    insert into public.machines (machine_id,"Machine name") values ('A12','Alpha');
    insert into public.door_events (machine_id,event) values ('A12','open');
    insert into public.relay_config (machine_id,pin) values ('A12',4);
  `);
}, 60000);

describe("before: the holes found by the audit", () => {
  it("matches the audited production setup (40 policies)", async () => {
    expect(await policyCount()).toBe(40);
  });

  it("lets anyone with the public key read door links and guests", async () => {
    expect(await rowsOf("anon", null, null, "select * from public.pickup_requests")).toBe(1);
    expect(await rowsOf("anon", null, null, "select * from public.clients")).toBe(2);
  });

  it("lets any user make themselves admin", async () => {
    const r = await as(
      "authenticated",
      GUEST,
      "lina@x.com",
      `update public.users set role='admin' where id='${GUEST}' returning id`
    );
    expect(r.rows).toHaveLength(1);
    await db.exec(`update public.users set role='client' where id='${GUEST}'`);
  });

  it("lets any signed-in account change machines", async () => {
    const r = await as(
      "authenticated",
      GUEST,
      "lina@x.com",
      `update public.machines set "Machine name"='x' returning id`
    );
    expect(r.rows).toHaveLength(1);
    await db.exec(`update public.machines set "Machine name"='Alpha'`);
  });
});

describe("after Phase A + B", () => {
  beforeAll(async () => {
    await db.exec(sql("migrations/20261104000000_rls_phase_a.sql"));
    await db.exec(sql("migrations/20261104000100_rls_phase_b.sql"));
  });

  it("anonymous visitors see and change nothing", async () => {
    for (const t of TABLES) {
      const r = await as("anon", null, null, `select * from public.${t}`);
      expect(r.rows?.length ?? 0, `anon reads ${t}`).toBe(0);
    }
    // blocked = empty result or "permission denied"
    const view = await as("anon", null, null, "select * from public.key_slot_presence_v");
    expect(view.error ?? view.rows.length).toSatisfy((v) => v === 0 || /permission denied/.test(v));
    expect(
      (await as("anon", null, null, "update public.pickup_requests set valid=false returning 1")).rows?.length ?? 0
    ).toBe(0);
  });

  it("nobody in the browser can TRUNCATE (RLS does not cover it)", async () => {
    expect((await as("anon", null, null, "truncate public.keys")).error).toMatch(/permission denied/);
    expect((await as("authenticated", OWNER, "own@x.com", "truncate public.clients")).error).toMatch(
      /permission denied/
    );
  });

  it("admins manage everything except door links", async () => {
    expect(await rowsOf("authenticated", ADMIN, "admin@x.com", "select * from public.users")).toBe(4);
    expect(await rowsOf("authenticated", ADMIN, "admin@x.com", "select * from public.clients")).toBe(2);
    expect(await rowsOf("authenticated", ADMIN, "admin@x.com", "select * from public.keys")).toBe(2);
    expect(await rowsOf("authenticated", ADMIN, "admin@x.com", "select * from public.relay_config")).toBe(1);
    expect(
      (await as("authenticated", ADMIN, "admin@x.com", `update public.users set role='owner' where id='${GUEST}'`))
        .error
    ).toBeUndefined();
    await db.exec(`update public.users set role='client' where id='${GUEST}'`);
    expect(await rowsOf("authenticated", ADMIN, "admin@x.com", "select * from public.pickup_requests")).toBe(0);
  });

  it("owners only see and change their own data", async () => {
    const o = (q) => as("authenticated", OWNER, "own@x.com", q);
    expect(await rowsOf("authenticated", OWNER, "own@x.com", "select * from public.users")).toBe(1);
    expect(await rowsOf("authenticated", OWNER, "own@x.com", "select * from public.clients")).toBe(1);
    expect(await rowsOf("authenticated", OWNER, "own@x.com", "select * from public.keys")).toBe(1);
    expect(await rowsOf("authenticated", OWNER, "own@x.com", "select * from public.key_slot_presence")).toBe(1);
    expect(await rowsOf("authenticated", OWNER, "own@x.com", "select * from public.machines")).toBe(1);
    expect(await rowsOf("authenticated", OWNER, "own@x.com", "select * from public.relay_config")).toBe(0);
    expect(
      (await o(`insert into public.clients (first_name,email,owner_id) values ('New','n@x.com','${OWNER}')`)).error
    ).toBeUndefined();
    expect(
      (await o(`insert into public.clients (first_name,email,owner_id) values ('Evil','e@x.com','${OWNER2}')`)).error
    ).toBeDefined();
    expect((await o(`delete from public.clients where owner_id='${OWNER2}' returning 1`)).rows).toHaveLength(0);
    expect((await o(`update public.machines set "Machine name"='x' returning 1`)).rows).toHaveLength(0);
    expect((await o(`update public.keys set owner_id='${OWNER}' returning 1`)).rows).toHaveLength(0);
  });

  it("nobody can make themselves admin, but normal profile updates work", async () => {
    expect(
      (await as("authenticated", OWNER, "own@x.com", `update public.users set role='admin' where id='${OWNER}'`)).error
    ).toMatch(/admin/);
    expect(
      (await as("authenticated", GUEST, "lina@x.com", `update public.users set role='admin' where id='${GUEST}'`)).error
    ).toMatch(/admin/);
    expect(
      (await as("authenticated", OWNER, "own@x.com", `update public.users set last_login=now() where id='${OWNER}'`))
        .error
    ).toBeUndefined();
  });

  it("new sign-ups can create their own profile, but not as admin", async () => {
    const n = (q) => as("authenticated", NEWBIE, "new@x.com", q);
    expect(
      (await n(`insert into public.users (id,name,email,role) values ('${NEWBIE}','N','new@x.com','admin')`)).error
    ).toMatch(/admin/);
    expect(
      (await n(`insert into public.users (id,name,email,role) values ('${NEWBIE}','N','new@x.com','client')`)).error
    ).toBeUndefined();
  });

  it("guests see only their own booking and its key", async () => {
    expect(await rowsOf("authenticated", GUEST, "lina@x.com", "select * from public.clients")).toBe(1);
    expect(await rowsOf("authenticated", GUEST, "lina@x.com", "select * from public.keys")).toBe(1);
    expect(await rowsOf("authenticated", GUEST, "lina@x.com", "select * from public.users")).toBe(1);
  });

  it("the server (service role) keeps full access", async () => {
    expect(await rowsOf("service_role", null, null, "select * from public.pickup_requests")).toBe(1);
    expect(
      (await as("service_role", null, null, `update public.users set role='owner' where id='${GUEST}'`)).error
    ).toBeUndefined();
  });
});

describe("rollback", () => {
  it("restores the audited setup exactly", async () => {
    await db.exec(sql("rollback_rls.sql"));
    expect(await policyCount()).toBe(40);
    expect(await rowsOf("anon", null, null, "select * from public.pickup_requests")).toBe(1);
    const rls = (
      await db.query("select relname, relrowsecurity from pg_class where relname = any($1) order by 1", [TABLES])
    ).rows;
    expect(Object.fromEntries(rls.map((r) => [r.relname, r.relrowsecurity]))).toEqual({
      access_logs: true,
      clients: false,
      door_events: false,
      key_slot_presence: true,
      keys: true,
      machines: true,
      pickup_requests: false,
      relay_config: true,
      test_table: true,
      users: true,
    });
  });
});

# Keymatic

Smart key pickup for rentals and hotels. Owners add guests, guests receive a
personal link, and the Keymatic machine releases their key.

Built with **Next.js 16 (App Router)**, **React 19**, **Supabase** and **Tailwind CSS 4**.
Deployed on **Netlify** (custom domain: `keymatic.myotp.site`).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```

## Scripts

| Command                           | What it does                                  |
| --------------------------------- | --------------------------------------------- |
| `npm run dev`                     | Start the dev server                          |
| `npm run build`                   | Production build                              |
| `npm test`                        | Run the test suite (Vitest + Testing Library) |
| `npm run lint`                    | ESLint, fails on any warning                  |
| `npm run format` / `format:check` | Prettier write / check                        |

CI (`.github/workflows/ci.yml`) runs format check, lint, tests and build on every pull request.

## Environment variables

See [`.env.example`](.env.example). `NEXT_PUBLIC_*` values reach the browser;
`SUPABASE_SERVICE_ROLE_KEY`, `SIGNING_SECRET` and `MACHINE_*_URL` are server-only
and used by the API routes.

## Project structure

```
src/
  app/
    (admin)/            Admin pages (URLs have no "(admin)"); layout checks the admin role
      admin/            Overview dashboard
      create-key/       Keys
      create-machine/   Machines (+ refresh whitelist)
      create-owner/     Owners
      link-owner/       Assign keys to owners/machines
      add-client/       Guests and pickups
      users/            Users and roles
    owner-panel/        Owner area
    client-panel/       Guest area ("My stays")
    pickup/[token]/     Guest pickup flow at the machine
    api/                Server routes (all require a signed-in user with the right role)
    login/ signup/ reset-password/ account-verified/
  components/           AppShell (top bar), DataTable, PageHeader/Notice/FormPanel, Logo, AuthCard
  lib/pickup.js         Pickup helpers (machine replies, timeouts, DB updates)
  utils/                Supabase client, role guards (client + API), guest status, load-on-mount hook
```

## Conventions

- **UI**: use the `k-*` classes in `src/app/globals.css` and the shared components; every list uses `DataTable`.
- **Access**: pages use `useRequireRole`; API routes use `requireRole`. Data must also be protected by Supabase RLS.
- **Tests** live next to the code as `*.test.js(x)`.

## Database security (Row Level Security)

Rules live in [`supabase/`](supabase) and are tested against a real Postgres (PGlite) in `supabase/rls.test.js`.

| File                           | Purpose                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `audit.sql`                    | Read-only: shows tables, RLS status, existing policies and grants. Run and save first.                               |
| `migrations/…_rls_phase_a.sql` | Locks `users`, `clients`, `pickup_requests`.                                                                         |
| `migrations/…_rls_phase_b.sql` | Locks `keys`, `key_slot_presence`, `machines`. **Only after confirming the Raspberry Pi uses the service role key.** |
| `rollback_rls.sql`             | Undo both phases.                                                                                                    |

Who can do what after both phases:

|                   | Anonymous | Guest (client)          | Owner                      | Admin | Server (service role) |
| ----------------- | --------- | ----------------------- | -------------------------- | ----- | --------------------- |
| users             | —         | own row                 | own row                    | all   | all                   |
| clients           | —         | own bookings (by email) | own guests                 | all   | all                   |
| keys              | —         | own booking's key       | own keys (read)            | all   | all                   |
| key_slot_presence | —         | —                       | slots with own keys (read) | all   | all                   |
| machines          | —         | read                    | read                       | all   | all                   |
| pickup_requests   | —         | —                       | —                          | —     | all                   |

Roles can only be changed by an admin (trigger). The guest pickup page reads and completes bookings through
`/api/pickup-link/[token]`, so guests never touch the database directly.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Stand-in for the Supabase client used by requireRole.
const state = { user: null, userError: null, profile: null };
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: state.userError }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile }) }) }),
    }),
  }),
}));

const { requireRole, authHeaders } = await import("./requireRole");

const req = (auth) => new Request("http://x/api", { headers: auth ? { authorization: auth } : {} });

describe("requireRole (API guard)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    Object.assign(state, { user: { id: "u1", app_metadata: {} }, userError: null, profile: { role: "admin" } });
  });

  it("rejects requests without a token (401)", async () => {
    const { response } = await requireRole(req(), ["admin"]);
    expect(response.status).toBe(401);
  });

  it("rejects invalid sessions (401)", async () => {
    state.user = null;
    const { response } = await requireRole(req("Bearer bad"), ["admin"]);
    expect(response.status).toBe(401);
  });

  it("rejects the wrong role (403)", async () => {
    state.profile = { role: "owner" };
    const { response } = await requireRole(req("Bearer ok"), ["admin"]);
    expect(response.status).toBe(403);
  });

  it("accepts an allowed role, case-insensitively", async () => {
    state.profile = { role: " Owner " };
    const out = await requireRole(req("Bearer ok"), ["admin", "owner"]);
    expect(out.response).toBeUndefined();
    expect(out.role).toBe("owner");
  });

  it("falls back to the auth app_metadata role", async () => {
    state.profile = null;
    state.user.app_metadata = { role: "admin" };
    const out = await requireRole(req("Bearer ok"), ["admin"]);
    expect(out.role).toBe("admin");
  });

  it("fails closed when Supabase is not configured (500)", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { response } = await requireRole(req("Bearer ok"), ["admin"]);
    expect(response.status).toBe(500);
  });
});

describe("authHeaders", () => {
  it("adds the bearer token when signed in", async () => {
    const sb = { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } };
    await expect(authHeaders(sb)).resolves.toEqual({ Authorization: "Bearer t" });
  });

  it("returns nothing when signed out", async () => {
    const sb = { auth: { getSession: async () => ({ data: { session: null } }) } };
    await expect(authHeaders(sb)).resolves.toEqual({});
  });
});

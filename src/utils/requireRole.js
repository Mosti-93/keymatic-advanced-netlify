import { createClient } from "@supabase/supabase-js";

/**
 * Server-side check for API routes: verifies the caller's Supabase session
 * (Authorization: Bearer <access_token>) and that their role is allowed.
 * Role is read from public.users (same source the login page uses), with
 * the auth app_metadata role as a fallback.
 *
 * Returns { user, role } on success, or { response } with a 401/403 to return.
 */
export async function requireRole(request, allowedRoles) {
  const json = (body, status) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { response: json({ error: "Missing access token" }, 401) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { response: json({ error: "Server misconfigured" }, 500) };

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return { response: json({ error: "Invalid session" }, 401) };

  const { data: profile } = await sb.from("users").select("role").eq("id", user.id).maybeSingle();
  const role = String(profile?.role || user.app_metadata?.role || "")
    .trim()
    .toLowerCase();

  if (!allowedRoles.includes(role)) {
    return { response: json({ error: "Forbidden" }, 403) };
  }
  return { user, role };
}

/** Browser helper: Authorization header for the current Supabase session. */
export async function authHeaders(supabase) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

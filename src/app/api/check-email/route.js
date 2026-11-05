import { getServiceClient } from "@/lib/pickupServer";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/check-email { email } → { exists }
 * Used by the sign-up page before the visitor has an account, so it runs on the
 * server with the service role (the browser can no longer read public.users once
 * Row Level Security Phase A is applied). Answers only yes/no, never the row.
 */
export async function POST(request) {
  let email = "";
  try {
    ({ email = "" } = await request.json());
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  email = String(email).trim();
  if (!EMAIL.test(email) || email.length > 254) return json({ error: "Invalid email." }, 400);

  try {
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("users")
      .select("id")
      .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return json({ exists: !!data });
  } catch (e) {
    console.error("[check-email] failed:", e);
    return json({ error: "Could not check this email." }, 500);
  }
}

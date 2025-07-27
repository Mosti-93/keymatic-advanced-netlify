import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  const { type, record } = await req.json();

  if (type === "user.created" && record) {
    const userId = record.id;
    const email = record.email;
    const name = record.user_metadata?.full_name || "";
    const role = "reviewer"; // or "pending" if you want review

    // Insert user into your users table
    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/users`, {
      method: "POST",
      headers: {
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([{ id: userId, email, name, role }]),
    });

    if (resp.ok) {
      return new Response("User synced!", { status: 200 });
    } else {
      return new Response("Failed to sync user.", { status: 500 });
    }
  }

  return new Response("Ignored", { status: 200 });
});

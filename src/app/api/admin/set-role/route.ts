console.log("SERVICE KEY EXISTS:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { user_id, role } = await req.json();

    if (!user_id || !role) {
      return NextResponse.json({ error: "Missing user_id or role" }, { status: 400 });
    }

    const allowedRoles = ["admin", "owner", "client", "reviewer", "editor"];
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // 1) Read caller JWT from Authorization header
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ error: "Missing access token" }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // 2) Verify caller is admin (using anon client + caller token)
    const supabaseAnon = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const callerRole = (userData.user.app_metadata as any)?.role;
    if (callerRole !== "admin") {
      return NextResponse.json({ error: "Forbidden (admin only)" }, { status: 403 });
    }

    // 3) Use service role to update target user app_metadata.role
    const supabaseAdmin = createClient(url, service);

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      app_metadata: { role },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, user: data.user });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

/**
 * Client-side page guard. Checks the real Supabase session and the role in
 * public.users (not localStorage, which anyone can edit). Redirects to /login
 * when signed out or when the role is not allowed.
 *
 * Note: this only hides pages. Data must still be protected by Supabase RLS.
 */
export function useRequireRole(allowedRoles) {
  const router = useRouter();
  const [state, setState] = useState({ checking: true, user: null, profile: null });
  const allowedKey = allowedRoles.join(",");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("id", user.id)
        .maybeSingle();
      const role = String(profile?.role || "").trim().toLowerCase();
      if (!allowedKey.split(",").includes(role)) {
        router.replace("/login");
        return;
      }
      if (active) setState({ checking: false, user, profile: { ...profile, role } });
    })();

    // Kick the user out if they sign out in another tab.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login");
    });
    return () => {
      active = false;
      sub?.subscription?.unsubscribe();
    };
  }, [router, allowedKey]);

  return state;
}

export function CheckingAccess() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-7 w-7 rounded-full border-[2.5px] border-black/10 border-t-[#0071e3] animate-spin" aria-label="Loading" />
    </div>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import Logo from "@/components/Logo";

export const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/create-key", label: "Keys" },
  { href: "/create-machine", label: "Machines" },
  { href: "/create-owner", label: "Owners" },
  { href: "/link-owner", label: "Link Owner" },
  { href: "/add-client", label: "Guests" },
  { href: "/users", label: "Users" },
];

/** Frosted, sticky top bar shared by every signed-in page. */
export default function AppShell({ nav = [], children, homeHref = "/" }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    try { localStorage.clear(); } catch {}
    router.replace("/login");
  };

  const isActive = (href) => pathname === href;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href={homeHref} className="text-[#1d1d1f]">
            <Logo size={26} />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-full px-3 py-1.5 text-[13px] transition-colors ${
                  isActive(n.href) ? "bg-black/5 text-[#1d1d1f] font-medium" : "text-[#6e6e73] hover:text-[#1d1d1f]"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={signOut} className="hidden md:inline-flex k-btn-secondary !py-1.5 !px-4 !text-[13px]">
              Sign out
            </button>
            {nav.length > 0 && (
              <button
                onClick={() => setOpen((o) => !o)}
                className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5"
                aria-label="Menu"
                aria-expanded={open}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  {open ? (
                    <path d="M4 4l10 10M14 4L4 14" stroke="#1d1d1f" strokeWidth="1.6" strokeLinecap="round" />
                  ) : (
                    <path d="M2 6h14M2 12h14" stroke="#1d1d1f" strokeWidth="1.6" strokeLinecap="round" />
                  )}
                </svg>
              </button>
            )}
            {nav.length === 0 && (
              <button onClick={signOut} className="md:hidden k-btn-secondary !py-1.5 !px-4 !text-[13px]">Sign out</button>
            )}
          </div>
        </div>

        {open && (
          <div className="md:hidden border-t border-black/5 bg-white/90 backdrop-blur-xl">
            <nav className="mx-auto max-w-6xl px-5 py-3 flex flex-col">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className={`py-3 text-[17px] border-b border-black/5 ${isActive(n.href) ? "font-semibold" : "text-[#1d1d1f]"}`}
                >
                  {n.label}
                </Link>
              ))}
              <button onClick={signOut} className="py-3 text-left text-[17px] text-[#d70015]">Sign out</button>
            </nav>
          </div>
        )}
      </header>
      <main>{children}</main>
    </div>
  );
}

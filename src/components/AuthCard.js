import Link from "next/link";
import { LogoMark } from "@/components/Logo";

/** Centered, Apple-style card used by sign in / sign up / password pages. */
export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-[400px] k-fade-in">
        <div className="text-center mb-8">
          <Link href="/" aria-label="Keymatic home" className="inline-block">
            <LogoMark size={52} />
          </Link>
          <h1 className="mt-6 text-[32px] font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>{title}</h1>
          {subtitle && <p className="mt-2 text-[17px] k-muted">{subtitle}</p>}
        </div>
        <div className="k-card">{children}</div>
        {footer && <div className="mt-6 text-center text-[15px] k-muted">{footer}</div>}
      </div>
    </div>
  );
}

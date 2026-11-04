import Link from "next/link";
import Logo, { LogoMark } from "@/components/Logo";

const STEPS = [
  {
    n: "1",
    title: "Book",
    text: "Add the guest and their dates. Keymatic links their key to a machine automatically.",
  },
  {
    n: "2",
    title: "Send",
    text: "The guest receives a personal pickup link by email before check-in.",
  },
  {
    n: "3",
    title: "Pick up",
    text: "At the machine, they confirm, the door opens, and their key is released. That’s it.",
  },
];

const FEATURES = [
  { icon: "🔐", title: "Secure by design", text: "Signed commands, personal links, and access that expires at check-out." },
  { icon: "⚡️", title: "Always on", text: "Guests arrive at 3 a.m.? The machine is ready. No front desk needed." },
  { icon: "📊", title: "Everything at a glance", text: "See every key, machine, owner and guest live in one dashboard." },
];

// Stylised key-machine illustration (pure SVG, no image files).
function MachineArt() {
  const slots = Array.from({ length: 12 });
  return (
    <svg viewBox="0 0 420 300" className="w-full h-auto" role="img" aria-label="Keymatic machine">
      <defs>
        <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbfbfd" />
          <stop offset="1" stopColor="#e8e8ed" />
        </linearGradient>
        <linearGradient id="screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2997ff" />
          <stop offset="1" stopColor="#0040b0" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="18" floodOpacity="0.14" />
        </filter>
      </defs>
      <rect x="60" y="20" width="300" height="250" rx="28" fill="url(#body)" filter="url(#shadow)" />
      <rect x="84" y="44" width="252" height="54" rx="14" fill="url(#screen)" />
      <text x="210" y="77" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="600" fontFamily="-apple-system, Inter, sans-serif">
        Room 204 · Ready
      </text>
      {slots.map((_, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = 84 + col * 64;
        const y = 116 + row * 46;
        const active = i === 5;
        return (
          <g key={i}>
            <rect x={x} y={y} width="56" height="38" rx="10" fill={active ? "#e8f2fd" : "#ffffff"} stroke={active ? "#0071e3" : "#d2d2d7"} strokeWidth={active ? 2 : 1} />
            <circle cx={x + 28} cy={y + 19} r="4" fill={active ? "#0071e3" : "#d2d2d7"} />
          </g>
        );
      })}
    </svg>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Logo size={26} className="text-[#1d1d1f]" />
          <div className="flex items-center gap-2">
            <Link href="/login" className="k-btn-ghost !py-1.5 !px-4 !text-[14px]">Sign in</Link>
            <Link href="/signup" className="k-btn-primary !py-1.5 !px-4 !text-[14px]">Get started</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-20 sm:pt-28 pb-16 text-center">
        <p className="k-eyebrow k-fade-in">Introducing Keymatic</p>
        <h1 className="k-fade-in-2 mt-4 text-5xl sm:text-7xl font-semibold tracking-tight text-[#1d1d1f]" style={{ letterSpacing: "-0.04em" }}>
          Keys, handed over.
          <br />
          <span className="bg-gradient-to-r from-[#2997ff] to-[#0040b0] bg-clip-text text-transparent">Automatically.</span>
        </h1>
        <p className="k-fade-in-3 mx-auto mt-6 max-w-2xl text-xl sm:text-2xl text-[#6e6e73]">
          Smart key machines for rentals and hotels. Your guests pick up their keys any time, with a single link.
        </p>
        <div className="k-fade-in-3 mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/login" className="k-btn-primary k-btn-lg">Sign in</Link>
          <a href="#how" className="k-btn-ghost k-btn-lg">See how it works ›</a>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 sm:px-8 pb-24 k-fade-in-3">
        <MachineArt />
      </section>

      {/* How it works */}
      <section id="how" className="bg-[#f5f5f7]">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-24">
          <h2 className="text-center text-4xl sm:text-5xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
            Three steps. Zero waiting.
          </h2>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="k-card">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0071e3] text-white font-semibold">{s.n}</div>
                <h3 className="mt-5 text-2xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-[17px] k-muted leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 py-24">
        <div className="grid gap-12 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <div className="text-4xl">{f.icon}</div>
              <h3 className="mt-4 text-xl font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-[17px] k-muted leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#f5f5f7]">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-24 text-center">
          <div className="flex justify-center"><LogoMark size={56} /></div>
          <h2 className="mt-6 text-4xl sm:text-5xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
            Ready when your guests are.
          </h2>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/login" className="k-btn-primary k-btn-lg">Sign in</Link>
            <Link href="/signup" className="k-btn-secondary k-btn-lg">Create account</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/5">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8 text-[12px] k-faint flex flex-col sm:flex-row justify-between gap-2">
          <span>© {new Date().getFullYear()} Keymatic. All rights reserved.</span>
          <span>Smart key pickup.</span>
        </div>
      </footer>
    </div>
  );
}

// Keymatic wordmark: a rounded key-ring mark + name.
export function LogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="km-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2997ff" />
          <stop offset="1" stopColor="#0058d0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#km-g)" />
      <circle cx="12.5" cy="13" r="5" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path
        d="M16.2 16.6 L24 24.4 M20.6 21 L23 18.6 M22.6 23 L24.6 21"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Logo({ size = 28, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight text-[19px] ${className}`}>
      <LogoMark size={size} />
      <span>Keymatic</span>
    </span>
  );
}

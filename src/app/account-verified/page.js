import Link from "next/link";
import AuthCard from "@/components/AuthCard";

export default function AccountVerifiedPage() {
  return (
    <AuthCard title="You’re verified." subtitle="Your email is confirmed. Welcome to Keymatic.">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e7f6ec]">
          <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
            <path
              d="M8 15.5l4.5 4.5L22 10"
              fill="none"
              stroke="#1d8a3a"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <Link href="/login" className="k-btn-primary k-btn-block k-btn-lg mt-6">
          Sign in
        </Link>
      </div>
    </AuthCard>
  );
}

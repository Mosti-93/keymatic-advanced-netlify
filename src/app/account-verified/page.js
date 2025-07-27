'use client';
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AccountVerifiedPage() {
  const router = useRouter();

  // Optionally, redirect after a few seconds
  // useEffect(() => {
  //   const timer = setTimeout(() => router.push('/login'), 5000);
  //   return () => clearTimeout(timer);
  // }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="bg-white shadow rounded-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center text-green-700 mb-6">
          🎉 Your account has been verified!
        </h1>
        <p className="text-lg text-center text-gray-700 mb-6">
          You can now log in with your email and password.
        </p>
        <a
          href="/login"
          className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
        >
          Go to Login
        </a>
      </div>
    </div>
  );
}

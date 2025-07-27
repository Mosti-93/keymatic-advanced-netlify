'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setMessage("");
    setSubmitting(true);

    const { data, error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage("Failed to update password: " + error.message);
    } else {
      setMessage("Password updated! You can now login with your new password.");
      setTimeout(() => router.push("/login"), 2000);
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-black">
      <div className="bg-white shadow rounded-lg p-8 max-w-md w-full text-black">
        <h1 className="text-2xl font-bold text-center mb-6 text-black">🔑 Reset Your Password</h1>
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-black">New Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            {submitting ? "Resetting..." : "Set New Password"}
          </button>
        </form>
        {message && <div className="text-center mt-4 text-black">{message}</div>}
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import AuthCard from "@/components/AuthCard";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Handle access_token from the URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      const params = new URLSearchParams(hash.substring(1));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token) {
        supabase.auth.setSession({
          access_token,
          refresh_token: refresh_token || "",
        });
      }
    }
  }, []);

  const handleReset = async (e) => {
    e.preventDefault();
    setMessage("");
    setSubmitting(true);

    // Change the user's password
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage("Failed to update password: " + error.message);
    } else {
      setMessage("Password updated! You can now login with your new password.");
      setTimeout(() => router.push("/login"), 2000);
    }
    setSubmitting(false);
  };

  const isError = message.startsWith("Failed");
  return (
    <AuthCard title="Choose a new password" subtitle="Use at least 8 characters.">
      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label className="k-label" htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="k-input"
            required
          />
        </div>
        {message && <div className={isError ? "k-alert-error" : "k-alert-success"}>{message}</div>}
        <button type="submit" disabled={submitting} className="k-btn-primary k-btn-block k-btn-lg">
          {submitting ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthCard>
  );
}

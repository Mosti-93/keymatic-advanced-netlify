'use client';
import { useState } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleForgot = async (e) => {
    e.preventDefault();
    setMessage("");
    setSubmitting(true);

    // Step 1: Check if email exists in users table
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (userError || !user) {
      setMessage("This email is not registered.");
      setSubmitting(false);
      return;
    }

    // Step 2: Send the password reset email
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setMessage("Failed to send password reset email: " + error.message);
    } else {
      setMessage(
        "A password reset link has been sent. Please check your email."
      );
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="bg-white shadow rounded-lg p-8 max-w-md w-full text-black">
        <h1 className="text-2xl font-bold text-center mb-6">🔑 Forgot Password?</h1>
        <form onSubmit={handleForgot} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            {submitting ? "Sending..." : "Send Password Reset Link"}
          </button>
        </form>
        {message && <div className="text-center mt-4">{message}</div>}
      </div>
    </div>
  );
}

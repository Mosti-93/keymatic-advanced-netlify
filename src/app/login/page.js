'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) {
        setError(
          loginError.message.toLowerCase().includes("not confirmed") ||
          loginError.message.toLowerCase().includes("confirm your email")
            ? "Your email is waiting for verification. Please check your inbox."
            : loginError.message
        );
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Unexpected error: user not found");
        return;
      }

      await supabase
        .from('users')
        .update({ last_login: user.last_sign_in_at })
        .eq('id', user.id);

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        setError("Your user is under review. Once approved, you will receive an email.");
        return;
      }

      const role = profile?.role?.trim().toLowerCase();
      if (!role) {
        setError("No role found. Please contact support.");
        return;
      }

      localStorage.setItem("role", role);
      localStorage.setItem("userId", user.id);

      switch (role) {
        case "admin":
          router.push("/admin");
          break;
        case "owner":
          router.push("/owner-panel");
          break;
        case "client":
          router.push("/client-panel");
          break;
        default:
          router.push("/");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    }
  };

  // Forgot password handler
  const handleForgot = async (e) => {
    e.preventDefault();
    setResetMsg("");
    setSubmitting(true);

    // Check if email exists in users table
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (userError || !user) {
      setResetMsg("This email is not registered.");
      setSubmitting(false);
      return;
    }

    // Send the password reset email
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://nimble-granita-b2e3cd.netlify.app/reset-password", // <-- your deployed URL here
    });

    if (error) {
      setResetMsg("Failed to send password reset email: " + error.message);
    } else {
      setResetMsg("A password reset link has been sent. Please check your email.");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="bg-white shadow rounded-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-6">🔐 Keymatic Login</h1>
        {!showForgot ? (
          <>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Enter user email"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                  required
                />
              </div>
              <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">
                Login
              </button>
              {error && <div className="text-red-600 text-center">{error}</div>}
            </form>
            <p className="mt-2 text-sm text-center">
              <button
                onClick={() => {
                  setShowForgot(true);
                  setResetMsg("");
                  setError("");
                  setPassword(""); // Optionally clear password field
                }}
                className="text-blue-600 hover:underline bg-transparent border-0 p-0"
                type="button"
              >
                Forgot your password?
              </button>
            </p>
            <p className="mt-4 text-sm text-gray-500 text-center">
              Don&apos;t have an account?{" "}
              <a href="/signup" className="text-blue-600 hover:underline">
                Sign up
              </a>
            </p>
          </>
        ) : (
          <form onSubmit={handleForgot} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Enter your email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
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
            {resetMsg && <div className="text-center mt-4">{resetMsg}</div>}
            <button
              type="button"
              onClick={() => {
                setShowForgot(false);
                setResetMsg("");
              }}
              className="text-blue-600 hover:underline bg-transparent border-0 block mx-auto mt-2"
            >
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

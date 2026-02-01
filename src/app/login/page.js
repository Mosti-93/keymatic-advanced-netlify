"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  const [showResendVerify, setShowResendVerify] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  // Helper: prefer deployed base URL (Netlify), fallback to current origin
  const getSiteUrl = () => {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    if (typeof window === "undefined") return "http://localhost:3000";
    return window.location.origin.replace(/\/$/, "");
  };

  const isErrorText = (txt) => {
    const t = (txt || "").toLowerCase();
    return (
      t.includes("failed") ||
      t.includes("error") ||
      t.includes("cannot") ||
      t.includes("can only") ||
      t.includes("security purposes") ||
      t.includes("incorrect") ||
      t.includes("not confirmed") ||
      t.includes("invalid")
    );
  };

  const resetMsgClass = useMemo(() => {
    if (!resetMsg) return "";
    return isErrorText(resetMsg) ? "text-red-600" : "text-green-700";
  }, [resetMsg]);

  const resendMsgClass = useMemo(() => {
    if (!resendMsg) return "";
    return isErrorText(resendMsg) ? "text-red-600" : "text-green-700";
  }, [resendMsg]);

  const SignupCta = () => (
    <div className="mt-3 text-center">
      <button
        type="button"
        onClick={() => router.push("/signup")}
        className="px-4 py-2 bg-gray-900 text-white rounded-md hover:opacity-90 transition"
      >
        Sign up
      </button>
    </div>
  );

  const handleResendVerification = async () => {
    setResendMsg("");
    setError("");

    const trimmedEmail = (email || "").trim().toLowerCase();
    if (!trimmedEmail) {
      setResendMsg("Please enter your email first.");
      return;
    }

    try {
      const emailRedirectTo = `${getSiteUrl()}/auth/callback`;

      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: trimmedEmail,
        options: { emailRedirectTo },
      });

      if (resendError) {
        setResendMsg("Failed to resend verification email: " + resendError.message);
      } else {
        setResendMsg("Verification email sent. Please check inbox/spam.");
      }
    } catch (e) {
      setResendMsg("Unexpected error while resending. Please try again.");
    }
  };

  /**
   * IMPORTANT (RLS-safe):
   * Do NOT query public.users by email from the browser.
   * That breaks with RLS and also leaks whether an email exists (enumeration).
   * Login should rely on Supabase Auth only.
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setResendMsg("");
    setShowResendVerify(false);

    try {
      const trimmedEmail = (email || "").trim().toLowerCase();
      const trimmedPassword = (password || "").trim();

      if (!trimmedEmail || !trimmedPassword) {
        setError("Please enter both email and password.");
        return;
      }

      const { data: authData, error: loginError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      });

      if (loginError) {
        const msg = (loginError.message || "Login failed.").toLowerCase();
        const code = loginError.code || "";

        const isNotConfirmed =
          code === "email_not_confirmed" ||
          msg.includes("email not confirmed") ||
          msg.includes("not confirmed");

        if (isNotConfirmed) {
          setError("Email not confirmed. Please verify your email to login.");
          setShowResendVerify(true);
          return;
        }

        // Treat invalid creds generically (don’t reveal if email exists)
        if (msg.includes("invalid login credentials")) {
          setError("Wrong email or password.");
          return;
        }

        setError(loginError.message || "Login failed.");
        return;
      }

      const user = authData?.user;
      if (!user?.id) {
        setError("Unexpected error: user not found after login.");
        return;
      }

      // Update last_login (won’t block login if it fails)
      try {
        await supabase
          .from("users")
          .update({ last_login: new Date().toISOString() })
          .eq("id", user.id);
      } catch (_) {}

      // Fetch profile (RLS should allow only own row: id = auth.uid())
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setError(`Failed to load user profile: ${profileError.message}`);
        return;
      }

      if (!profile) {
        setError("Profile not found for this account. Please contact support/admin.");
        return;
      }

      const role = (profile.role || "").trim().toLowerCase();
      if (!role) {
        setError("No role found for this user.");
        return;
      }

      localStorage.setItem("role", role);
      localStorage.setItem("userId", user.id);

      if (role === "admin") router.push("/admin");
      else if (role === "owner") router.push("/owner-panel");
      else if (role === "client") router.push("/client-panel");
      else router.push("/");
    } catch (e) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * IMPORTANT (RLS-safe + security):
   * Never block reset based on public.users lookup.
   * Always call resetPasswordForEmail and show a generic message.
   */
  const handleForgot = async (e) => {
    e.preventDefault();
    setResetMsg("");
    setError("");
    setSubmitting(true);

    try {
      const trimmedEmail = (email || "").trim().toLowerCase();
      if (!trimmedEmail) {
        setResetMsg("Please enter your email first.");
        return;
      }

      const redirectTo = `${getSiteUrl()}/reset-password`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo,
      });

      if (resetError) {
        setResetMsg("Failed to send password reset email: " + resetError.message);
      } else {
        // Generic success to avoid email enumeration
        setResetMsg("If this email exists, a reset link has been sent. Please check inbox/spam.");
      }
    } catch (e) {
      setResetMsg("Unexpected error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="bg-white shadow rounded-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-6">Keymatic Login</h1>

        {!showForgot ? (
          <>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                    setResendMsg("");
                    setShowResendVerify(false);
                  }}
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
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                    setResendMsg("");
                    setShowResendVerify(false);
                  }}
                  placeholder="Enter password"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-60"
              >
                {submitting ? "Logging in..." : "Login"}
              </button>

              {error && <div className="text-red-600 text-center font-medium">{error}</div>}

              {showResendVerify && (
                <div className="text-center space-y-2">
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    className="px-4 py-2 bg-gray-900 text-white rounded-md hover:opacity-90 transition"
                  >
                    Resend verification email
                  </button>
                  {resendMsg && <div className={`${resendMsgClass} font-medium`}>{resendMsg}</div>}
                </div>
              )}
            </form>

            <p className="mt-2 text-sm text-center">
              <button
                onClick={() => {
                  setShowForgot(true);
                  setResetMsg("");
                  setError("");
                  setShowResendVerify(false);
                  setResendMsg("");
                  setPassword("");
                }}
                className="text-blue-600 hover:underline bg-transparent border-0 p-0"
                type="button"
              >
                Forgot your password?
              </button>
            </p>

            <p className="mt-4 text-sm text-gray-500 text-center">
              Don&apos;t have an account? <SignupCta />
            </p>
          </>
        ) : (
          <form onSubmit={handleForgot} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Enter your email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setResetMsg("");
                }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-60"
            >
              {submitting ? "Sending..." : "Send Password Reset Link"}
            </button>

            {resetMsg && (
              <div className={`text-center mt-4 font-medium ${resetMsgClass}`}>{resetMsg}</div>
            )}

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

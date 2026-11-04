"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import AuthCard from "@/components/AuthCard";

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

  // Message shown after sign up ("?msg=verify_email_sent")
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const msg = new URLSearchParams(window.location.search).get("msg");
    if (msg === "verify_email_sent") setNotice("Check your inbox to verify your email, then sign in.");
  }, []);

  const handleResendVerification = async () => {
    setResendMsg("");
    setError("");

    const trimmedEmail = (email || "").trim().toLowerCase();
    if (!trimmedEmail) {
      setResendMsg("Please enter your email first.");
      return;
    }

    try {
      const emailRedirectTo = `${getSiteUrl()}/account-verified`;

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
      const trimmedPassword = password || ""; // don't trim: spaces can be part of a password

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
      else setError("Your account has no access yet. Please contact the admin.");
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
    <AuthCard
      title={showForgot ? "Reset password" : "Sign in to Keymatic"}
      subtitle={showForgot ? "We’ll email you a link to choose a new one." : "Manage keys, machines and guests."}
      footer={
        showForgot ? (
          <button
            type="button"
            className="k-link"
            onClick={() => {
              setShowForgot(false);
              setResetMsg("");
            }}
          >
            ‹ Back to sign in
          </button>
        ) : (
          <>
            New to Keymatic?{" "}
            <button type="button" className="k-link" onClick={() => router.push("/signup")}>
              Create an account
            </button>
          </>
        )
      }
    >
      {notice && !showForgot && <div className="k-alert-info mb-5">{notice}</div>}

      {!showForgot ? (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="k-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
                setResendMsg("");
                setShowResendVerify(false);
              }}
              placeholder="name@example.com"
              className="k-input"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="k-label" htmlFor="password">Password</label>
              <button
                type="button"
                className="text-[13px] k-link mb-1.5"
                onClick={() => {
                  setShowForgot(true);
                  setResetMsg("");
                  setError("");
                  setShowResendVerify(false);
                  setResendMsg("");
                  setPassword("");
                }}
              >
                Forgot password?
              </button>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
                setResendMsg("");
                setShowResendVerify(false);
              }}
              placeholder="Password"
              className="k-input"
              required
            />
          </div>

          {error && <div className="k-alert-error">{error}</div>}

          {showResendVerify && (
            <div className="space-y-2">
              <button type="button" onClick={handleResendVerification} className="k-btn-secondary k-btn-block">
                Resend verification email
              </button>
              {resendMsg && (
                <div className={isErrorText(resendMsg) ? "k-alert-error" : "k-alert-success"}>{resendMsg}</div>
              )}
            </div>
          )}

          <button type="submit" disabled={submitting} className="k-btn-primary k-btn-block k-btn-lg !mt-6">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleForgot} className="space-y-4">
          <div>
            <label className="k-label" htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setResetMsg("");
              }}
              placeholder="name@example.com"
              className="k-input"
              required
            />
          </div>
          {resetMsg && <div className={isErrorText(resetMsg) ? "k-alert-error" : "k-alert-success"}>{resetMsg}</div>}
          <button type="submit" disabled={submitting} className="k-btn-primary k-btn-block k-btn-lg">
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}

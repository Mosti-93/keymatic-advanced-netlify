"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import AuthCard from "@/components/AuthCard";

export default function SignUpPage() {
  const router = useRouter();

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [country, setCountry] = useState("");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const getOrigin = () => {
    if (typeof window === "undefined") return "http://localhost:3000";
    return window.location.origin;
  };

  const getEmailRedirectTo = () => {
    // Must be allowed in Supabase Auth URL Configuration
    return `${getOrigin()}/account-verified`;
  };

  const checkEmailExistsInUsersTable = async (trimmedEmail) => {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .ilike("email", trimmedEmail.replace(/[\\%_]/g, "\\$&"))
      .limit(1)
      .maybeSingle();

    if (error) return { ok: false, exists: null, message: error.message };
    return { ok: true, exists: !!data };
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setAlreadyRegistered(false);

    const trimmedEmail = (email || "").trim().toLowerCase();
    const trimmedFullName = (fullName || "").trim();
    const trimmedPassword = password || "";

    if (!trimmedEmail) {
      setError("Please enter your email.");
      setSubmitting(false);
      return;
    }
    if (!trimmedPassword) {
      setError("Please enter your password.");
      setSubmitting(false);
      return;
    }
    if (!trimmedFullName) {
      setError("Please enter your full name.");
      setSubmitting(false);
      return;
    }

    try {
      // 1) Check if email already exists in your app DB first
      const existsCheck = await checkEmailExistsInUsersTable(trimmedEmail);

      if (!existsCheck.ok) {
        setError("Unable to verify this email right now. Please try again.");
        return;
      }

      // If already registered -> show RED message and do NOT sign up again
      if (existsCheck.exists) {
        setAlreadyRegistered(true);
        setError(
          "This email is already registered. Please log in or check your email if you didn’t verify your email yet."
        );
        return;
      }

      // 2) New email -> proceed with signUp
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword,
        options: {
          emailRedirectTo: getEmailRedirectTo(),
          data: {
            full_name: trimmedFullName,
            phone: (phoneNumber || "").trim(),
            country: (country || "").trim(),
          },
        },
      });

      if (signUpError) {
        const raw = signUpError.message || "";
        const msg = raw.toLowerCase();

        // If Supabase indicates "already registered" anyway, show red message
        if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("user already")) {
          setAlreadyRegistered(true);
          setError(
            "This email is already registered. Please log in or check your email if you didn’t verify your email yet."
          );
          return;
        }

        setError(raw || "Sign up failed.");
        return;
      }

      // Another Supabase “existing user” signal
      const identities = data?.user?.identities || [];
      if (Array.isArray(identities) && identities.length === 0) {
        setAlreadyRegistered(true);
        setError(
          "This email is already registered. Please log in or check your email if you didn’t verify your email yet."
        );
        return;
      }

      // Normal new signup success
      router.push("/login?msg=verify_email_sent");
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="It takes less than a minute."
      footer={
        <>
          Already have an account?{" "}
          <button type="button" className="k-link" onClick={() => router.push("/login")}>
            Sign in
          </button>
        </>
      }
    >
      <form onSubmit={handleSignUp} className="space-y-4">
        <div>
          <label className="k-label" htmlFor="fullName">
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setError("");
              setAlreadyRegistered(false);
            }}
            placeholder="Your name"
            className="k-input"
            required
          />
        </div>
        <div>
          <label className="k-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
              setAlreadyRegistered(false);
            }}
            placeholder="name@example.com"
            className="k-input"
            required
          />
        </div>
        <div>
          <label className="k-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
              setAlreadyRegistered(false);
            }}
            placeholder="Choose a password"
            className="k-input"
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="k-label" htmlFor="phone">
              Phone (optional)
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
              }}
              placeholder="+20 …"
              className="k-input"
            />
          </div>
          <div>
            <label className="k-label" htmlFor="country">
              Country (optional)
            </label>
            <input
              id="country"
              type="text"
              autoComplete="country-name"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
              }}
              placeholder="Egypt"
              className="k-input"
            />
          </div>
        </div>

        {error && (
          <div className="k-alert-error">
            {error}
            {alreadyRegistered && (
              <div className="mt-2">
                <button type="button" className="k-link" onClick={() => router.push("/login")}>
                  Go to sign in ›
                </button>
              </div>
            )}
          </div>
        )}

        <button type="submit" disabled={submitting} className="k-btn-primary k-btn-block k-btn-lg !mt-6">
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthCard>
  );
}

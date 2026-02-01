"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

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
    return `${getOrigin()}/auth/callback`;
  };

  const checkEmailExistsInUsersTable = async (trimmedEmail) => {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .ilike("email", trimmedEmail)
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
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="bg-white shadow rounded-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-6">Key Owner Sign Up</h1>

        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
                setAlreadyRegistered(false);
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
                setAlreadyRegistered(false);
              }}
              placeholder="Enter password"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setError("");
                setAlreadyRegistered(false);
              }}
              placeholder="Enter full name"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Phone Number</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Enter phone number"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Country</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Enter country"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-60"
          >
            {submitting ? "Signing up..." : "Sign Up"}
          </button>

          {error && (
            <div className="text-red-600 text-center font-medium">
              {error}

              {alreadyRegistered && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="px-4 py-2 bg-gray-900 text-white rounded-md hover:opacity-90 transition"
                  >
                    Go to Login
                  </button>
                </div>
              )}
            </div>
          )}
        </form>

        <p className="mt-4 text-sm text-gray-500 text-center">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="text-blue-600 hover:underline bg-transparent border-0 p-0"
          >
            Login
          </button>
        </p>
      </div>
    </div>
  );
}

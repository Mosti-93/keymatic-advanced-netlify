'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient"; // adjust import as needed

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login"); // 'login' or 'signup'
  const [error, setError] = useState("");

  const handleAuth = async (e) => {
    e.preventDefault();
    setError("");
    let result;

    if (mode === "login") {
      result = await supabase.auth.signInWithPassword({ email, password });
    } else {
      result = await supabase.auth.signUp({ email, password });
    }

    if (result.error) {
      setError(result.error.message);
      return;
    }

    // You may want to sync with your users table here (optional)

    // Redirect to dashboard or desired page
    router.push("/admin");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="bg-white shadow rounded-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-6">🔐 Keymatic {mode === "login" ? "Login" : "Sign Up"}</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter user email"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black placeholder-black focus:text-black focus:placeholder-black focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            {mode === "login" ? "Login" : "Sign Up"}
          </button>
          {error && <div className="text-red-500 text-center">{error}</div>}
        </form>
        <div className="mt-4 text-center">
          {mode === "login" ? (
            <button
              className="text-sm text-blue-600"
              onClick={() => setMode("signup")}
            >
              Don&apos;t have an account? Sign up
            </button>
          ) : (
            <button
              className="text-sm text-blue-600"
              onClick={() => setMode("login")}
            >
              Already have an account? Login
            </button>
          )}
        </div>
        <p className="mt-4 text-sm text-gray-500 text-center">
          For demo or to create an account, please contact us
        </p>
      </div>
    </div>
  );
}

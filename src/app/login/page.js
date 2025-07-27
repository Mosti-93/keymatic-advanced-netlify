'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      // 1. Try login
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

      // 2. Get user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Unexpected error: user not found");
        return;
      }

      // 3. (Optional) Mirror last_login
      await supabase
        .from('users')
        .update({ last_login: user.last_sign_in_at })
        .eq('id', user.id);

      // 4. Get role
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

      // 5. Store in localStorage and redirect
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="bg-white shadow rounded-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-6">🔐 Keymatic Login</h1>
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
          <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Login</button>
          {error && <div className="text-red-600 text-center">{error}</div>}
        </form>
        <p className="mt-4 text-sm text-gray-500 text-center">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="text-blue-600 hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}

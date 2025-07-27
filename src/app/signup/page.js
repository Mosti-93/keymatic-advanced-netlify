'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    phone: "",
    country: ""
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // 1. Sign up user in Supabase Auth
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (signUpError) {
      // Friendly duplicate error message
      if (
        signUpError.status === 400 ||
        (signUpError.message && signUpError.message.toLowerCase().includes("user already registered"))
      ) {
        setError("This email is already registered.");
      } else {
        setError(signUpError.message);
      }
      return;
    }

    // 2. Get the user id from signup response or by fetching
    let userId = data?.user?.id;
    if (!userId) {
      const { data: userData } = await supabase.auth.getUser();
      userId = userData?.user?.id;
    }
    if (!userId) {
      setError("Sign up succeeded, but failed to get user ID.");
      return;
    }

    // 3. Insert profile in users table
    const { error: dbError } = await supabase
      .from("users")
      .insert([
        {
          id: userId,
          name: form.name,
          email: form.email,
          phone: form.phone,
          country: form.country,
          role: "owner",
        },
      ]);
    if (dbError) {
      // Friendly duplicate error for users table
      if (
        dbError.code === "23505" ||
        (dbError.message && dbError.message.includes("duplicate key"))
      ) {
        setError("This email is already registered.");
      } else {
        setError("Sign up succeeded, but failed to add profile info. Error: " + dbError.message);
      }
      return;
    }

    setSuccess("Sign up successful! Please log in.");
    setTimeout(() => router.push("/login"), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-black">
      <div className="bg-white shadow rounded-lg p-8 max-w-md w-full text-black">
        <h1 className="text-3xl font-bold text-center mb-6 text-black">👤 Key Owner Sign Up</h1>
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-black">Email</label>
            <input
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black">Password</label>
            <input
              name="password"
              type="password"
              required
              value={form.password}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black">Full Name</label>
            <input
              name="name"
              type="text"
              required
              value={form.name}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black">Phone Number</label>
            <input
              name="phone"
              type="text"
              value={form.phone}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black">Country</label>
            <input
              name="country"
              type="text"
              value={form.country}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-black"
            />
          </div>
          <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">
            Sign Up
          </button>
          {error && <div className="text-red-500 text-center">{error}</div>}
          {success && <div className="text-green-600 text-center">{success}</div>}
        </form>
        <p className="mt-4 text-sm text-gray-500 text-center">
          Already have an account?{" "}
          <a href="/login" className="text-blue-600 hover:underline">Login</a>
        </p>
      </div>
    </div>
  );
}

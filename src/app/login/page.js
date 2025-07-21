'use client';
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e) => {
    e.preventDefault();
    let role = "";

    if (email === "admin@keymatic.com" && password === "admin123") {
      role = "admin";
    } else if (email === "owner@keymatic.com" && password === "owner123") {
      role = "owner";
    } else if (email === "client@keymatic.com" && password === "client123") {
      role = "client";
    } else {
      alert("Invalid credentials");
      return;
    }

    // Save user in localStorage
    localStorage.setItem("user", JSON.stringify({ email, role }));

    // Redirect based on role
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
        router.push("/"); // fallback to home
        break;
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
            Login
          </button>
        </form>
        <p className="mt-4 text-sm text-gray-500 text-center">
          For demo or creat account please contact us
        </p>
      </div>
    </div>
  );
}

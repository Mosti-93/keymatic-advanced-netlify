'use client'
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const handleLogin = () => {
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
      <header className="flex justify-end p-6">
        <button
          onClick={handleLogin}
          className="px-4 py-2 bg-white text-blue-600 rounded-md shadow hover:bg-gray-100 transition"
        >
          Login
        </button>
      </header>
      <main className="flex-grow flex flex-col justify-center items-center text-center px-4">
        <h1 className="text-5xl font-bold mb-4">🚀 Welcome to Keymatic</h1>
        <p className="text-lg mb-6">Smart Key Management System</p>
        <p className="text-sm text-gray-200">Manage your keys and access with ease</p>
      </main>
    </div>
  );
}

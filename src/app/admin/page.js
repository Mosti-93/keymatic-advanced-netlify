'use client';
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/utils/supabaseClient";

export default function Dashboard() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role === "admin") {
      setAuthorized(true);
    } else {
      router.push("/");
    }
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    router.push("/");
  };

  const initialData = [
    {
      keyId: "Key 101",
      roomNo: "101",
      machine: { id: 1, name: "Machine A", location: "Main Lobby" },
      owner: { name: "Mostafa Els", email: "mostafa@example.com" },
      client: {
        name: "Ahmed Ali",
        email: "ahmed@example.com",
        checkIn: "2025-07-20",
        checkOut: "2025-07-25",
      },
    },
    {
      keyId: "Key 102",
      roomNo: "102",
      machine: { id: 2, name: "Machine B", location: "2nd Floor" },
      owner: { name: "Sara Youssef", email: "sara@example.com" },
      client: {
        name: "John Doe",
        email: "john@example.com",
        checkIn: "2025-07-15",
        checkOut: "2025-07-18",
      },
    },
  ];

  const [data] = useState(initialData);

  if (!authorized) return null; // Will be redirected

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow flex items-center px-6 py-4 relative">
        <h1 className="absolute left-1/2 transform -translate-x-1/2 text-3xl font-bold text-gray-900">
          Keymatic Dashboard
        </h1>
        <div className="ml-auto">
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <Link href="/create-key" className="flex items-center justify-center p-6 bg-blue-600 text-white rounded-xl shadow hover:bg-blue-700 transition text-lg font-semibold">🔑 Create Key</Link>
          <Link href="/create-owner" className="flex items-center justify-center p-6 bg-purple-600 text-white rounded-xl shadow hover:bg-purple-700 transition text-lg font-semibold">👤 Edit Owner</Link>
          <Link href="/create-machine" className="flex items-center justify-center p-6 bg-green-600 text-white rounded-xl shadow hover:bg-green-700 transition text-lg font-semibold">🏭 Create Machine</Link>
          <Link href="/users" className="flex items-center justify-center p-6 bg-yellow-500 text-white rounded-xl shadow hover:bg-yellow-600 transition text-lg font-semibold">👥 Users</Link>
          <Link href="/link-owner" className="flex items-center justify-center p-6 bg-pink-500 text-white rounded-xl shadow hover:bg-pink-600 transition text-lg font-semibold">🔗 Link Owner</Link>
          <Link href="/add-client" className="flex items-center justify-center p-6 bg-indigo-500 text-white rounded-xl shadow hover:bg-indigo-600 transition text-lg font-semibold">👥 Add Client</Link>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">📋 Full Database Table</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded-lg">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 border border-gray-300 text-xs font-medium text-gray-500 uppercase">KEY</th>
                  <th className="px-4 py-2 border border-gray-300 text-xs font-medium text-gray-500 uppercase">ROOM NO</th>
                  <th className="px-4 py-2 border border-gray-300 text-xs font-medium text-gray-500 uppercase">MACHINE</th>
                  <th className="px-4 py-2 border border-gray-300 text-xs font-medium text-gray-500 uppercase">OWNER</th>
                  <th className="px-4 py-2 border border-gray-300 text-xs font-medium text-gray-500 uppercase">CLIENT</th>
                  <th className="px-4 py-2 border border-gray-300 text-xs font-medium text-gray-500 uppercase">EDIT</th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-2 border border-gray-300">{entry.keyId}</td>
                    <td className="px-4 py-2 border border-gray-300">{entry.roomNo}</td>
                    <td className="px-4 py-2 border border-gray-300">{entry.machine.name} ({entry.machine.location})</td>
                    <td className="px-4 py-2 border border-gray-300">
                      {entry.owner.name}
                      <br />
                      <span className="text-gray-500 text-xs">{entry.owner.email}</span>
                    </td>
                    <td className="px-4 py-2 border border-gray-300">
                      {entry.client.name}
                      <br />
                      <span className="text-gray-500 text-xs">
                        {entry.client.checkIn} → {entry.client.checkOut}
                      </span>
                    </td>
                    <td className="px-4 py-2 border border-gray-300 text-blue-600 hover:underline cursor-pointer">Edit</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

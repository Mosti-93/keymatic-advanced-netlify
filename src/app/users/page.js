'use client';
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";

const ROLES = ["admin", "owner", "client", "reviewer", "editor"];

export default function UsersRolesControlPage() {
  const [users, setUsers] = useState([]);
  const [editId, setEditId] = useState(null);
  const [newRole, setNewRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Fetch all users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, last_login")
      .order("name", { ascending: true });
    if (!error) setUsers(data);
    setLoading(false);
  }

  function formatDate(dateString) {
    if (!dateString) return "-";
    const d = new Date(dateString);
    return d.toLocaleString();
  }

  function startEdit(user) {
    setEditId(user.id);
    setNewRole(user.role);
    setMessage("");
  }

  async function saveRole(user) {
    setLoading(true);
    const { error } = await supabase
      .from("users")
      .update({ role: newRole })
      .eq("id", user.id);
    if (error) {
      setMessage("❌ Failed to update role");
    } else {
      setMessage("✅ Role updated!");
      await fetchUsers();
    }
    setEditId(null);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-white py-10 text-black">
      <div className="bg-white shadow rounded-lg p-8 w-full max-w-6xl text-black">
        <h1 className="text-3xl font-bold text-center mb-8 text-black">
          👥 Users Roles Control
        </h1>
        {message && (
          <div className={`mb-4 text-center ${message.startsWith("✅") ? "text-green-600" : "text-red-500"}`}>
            {message}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-300 rounded-lg text-black">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-4 border border-gray-300 text-lg text-black">Name</th>
                <th className="px-6 py-4 border border-gray-300 text-lg text-black">Email</th>
                <th className="px-6 py-4 border border-gray-300 text-lg text-black">Role</th>
                <th className="px-6 py-4 border border-gray-300 text-lg text-black">Last Login</th>
                <th className="px-6 py-4 border border-gray-300 text-lg text-black">Edit</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-black text-lg">
                    Loading...
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 border border-gray-300 text-black">{user.name}</td>
                    <td className="px-6 py-4 border border-gray-300 text-black">{user.email}</td>
                    <td className="px-6 py-4 border border-gray-300 text-black">
                      {editId === user.id ? (
                        <select
                          className="border rounded px-2 py-1 text-black"
                          value={newRole}
                          onChange={e => setNewRole(e.target.value)}
                        >
                          {ROLES.map(role => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="capitalize">{user.role}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 border border-gray-300 text-center text-black">
                      {formatDate(user.last_login)}
                    </td>
                    <td className="px-6 py-4 border border-gray-300 text-center">
                      {editId === user.id ? (
                        <>
                          <button
                            className="px-4 py-2 bg-blue-600 text-white rounded mr-2 hover:bg-blue-700"
                            onClick={() => saveRole(user)}
                            disabled={loading}
                          >
                            Save
                          </button>
                          <button
                            className="px-4 py-2 bg-gray-300 text-black rounded hover:bg-gray-400"
                            onClick={() => setEditId(null)}
                            disabled={loading}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="px-4 py-2 bg-yellow-400 text-black rounded hover:bg-yellow-500"
                          onClick={() => startEdit(user)}
                          disabled={loading}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

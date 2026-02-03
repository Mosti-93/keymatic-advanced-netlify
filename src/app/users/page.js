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
  const [myUserId, setMyUserId] = useState(null);

  useEffect(() => {
    (async () => {
      await fetchUsers();
      await fetchMyUserId();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchMyUserId() {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user?.id) {
      setMyUserId(data.user.id);
    }
  }

  async function fetchUsers() {
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, role, last_login")
        .order("name", { ascending: true });

      if (error) {
        setUsers([]);
        setMessage(`Failed to load users: ${error.message}`);
        return;
      }

      setUsers(data || []);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(user) {
    setEditId(user.id);
    setNewRole(user.role || "");
    setMessage("");
  }

  function cancelEdit() {
    setEditId(null);
    setNewRole("");
    setMessage("");
  }

  async function saveRole(user) {
    setLoading(true);
    setMessage("");

    try {
      if (!newRole || !ROLES.includes(newRole)) {
        setMessage("Invalid role selected.");
        return;
      }

      // 1) Get current session token
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) {
        setMessage(`Session error: ${sessionErr.message}`);
        return;
      }

      const token = sessionData?.session?.access_token;
      if (!token) {
        setMessage("No session token. Please log out and log in again.");
        return;
      }

      // 2) Update REAL role in Auth via API route
      const res = await fetch("/api/admin/set-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          role: newRole,
        }),
      });

      const out = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = out?.error || `Request failed with status ${res.status}`;
        setMessage(`Failed to update Auth role: ${errMsg}`);
        return;
      }

      // 3) Sync public.users.role for UI display (optional but recommended)
      const { error: dbErr } = await supabase
        .from("users")
        .update({ role: newRole })
        .eq("id", user.id);

      if (dbErr) {
        setMessage(`Auth role updated, but users table sync failed: ${dbErr.message}`);
        return;
      }

      setMessage("Role updated successfully.");
      await fetchUsers();
      setEditId(null);
      setNewRole("");
    } catch (e) {
      setMessage("Failed to update role due to unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-white py-10 text-black">
      <div className="bg-white shadow rounded-lg p-8 w-full max-w-6xl text-black">
        <h1 className="text-3xl font-bold text-center mb-8 text-black">
          Users Roles Control
        </h1>

        {message && (
          <div className="mb-4 text-center text-black">
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
              {users.map((u) => {
                const isEditing = editId === u.id;
                const isSelf = myUserId && u.id === myUserId;

                return (
                  <tr key={u.id} className="bg-white">
                    <td className="px-6 py-4 border border-gray-300">{u.name || ""}</td>
                    <td className="px-6 py-4 border border-gray-300">{u.email || ""}</td>

                    <td className="px-6 py-4 border border-gray-300">
                      {isEditing ? (
                        <select
                          className="border rounded px-2 py-1"
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value)}
                          disabled={loading}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      ) : (
                        u.role || ""
                      )}
                    </td>

                    <td className="px-6 py-4 border border-gray-300">
                      {u.last_login || ""}
                    </td>

                    <td className="px-6 py-4 border border-gray-300">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
                            disabled={loading}
                            onClick={() => saveRole(u)}
                          >
                            Save
                          </button>

                          <button
                            className="bg-gray-300 text-black px-4 py-2 rounded disabled:opacity-60"
                            disabled={loading}
                            onClick={cancelEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="bg-black text-white px-4 py-2 rounded disabled:opacity-60"
                          disabled={loading || isSelf}
                          title={isSelf ? "For safety, you cannot edit your own role here." : ""}
                          onClick={() => startEdit(u)}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {loading && (
            <div className="mt-4 text-center">Loading...</div>
          )}
        </div>
      </div>
    </div>
  );
}

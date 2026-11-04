"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import DataTable, { RowAction, toDate, fmtDate } from "@/components/DataTable";
import PageHeader, { Notice } from "@/components/PageHeader";

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
      const { error: dbErr } = await supabase.from("users").update({ role: newRole }).eq("id", user.id);

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

  const ROLE_BADGE = {
    admin: "k-badge-blue",
    owner: "k-badge-green",
    client: "k-badge-gray",
    reviewer: "k-badge-orange",
    editor: "k-badge-orange",
  };
  const roleFilter = (r) => ({
    key: r,
    label: r[0].toUpperCase() + r.slice(1) + "s",
    test: (u) => String(u.role || "").toLowerCase() === r,
  });

  return (
    <div className="k-page">
      <PageHeader eyebrow="Users" title="People & roles" subtitle="Control who can access what." />
      <Notice>{message}</Notice>
      <DataTable
        title="All users"
        rows={users}
        loading={loading && users.length === 0}
        exportName="users"
        searchPlaceholder="Search name or email"
        defaultSort={{ key: "name", dir: "asc" }}
        filters={[
          { key: "all", label: "All", test: () => true },
          roleFilter("admin"),
          roleFilter("owner"),
          roleFilter("client"),
        ]}
        columns={[
          { key: "name", header: "Name", mobile: "title", cell: (u) => <span className="font-medium">{u.name}</span> },
          { key: "email", header: "Email", mobile: "subtitle" },
          {
            key: "role",
            header: "Role",
            value: (u) => u.role || "",
            cell: (u) =>
              editId === u.id ? (
                <select
                  className="k-input !py-1.5 !px-3 !w-auto"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  disabled={loading}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              ) : u.role ? (
                <span className={ROLE_BADGE[String(u.role).toLowerCase()] || "k-badge-gray"}>{u.role}</span>
              ) : null,
          },
          {
            key: "last_login",
            header: "Last sign in",
            value: (u) => toDate(u.last_login),
            cell: (u) => (u.last_login ? fmtDate(u.last_login) : "Never"),
          },
        ]}
        rowActions={(u) => {
          const isSelf = myUserId && u.id === myUserId;
          return editId === u.id ? (
            <>
              <RowAction tone="primary" disabled={loading} onClick={() => saveRole(u)}>
                Save
              </RowAction>
              <RowAction disabled={loading} onClick={cancelEdit}>
                Cancel
              </RowAction>
            </>
          ) : (
            <RowAction
              disabled={loading || isSelf}
              title={isSelf ? "For safety, you can’t change your own role." : "Change role"}
              onClick={() => startEdit(u)}
            >
              Change role
            </RowAction>
          );
        }}
      />
    </div>
  );
}

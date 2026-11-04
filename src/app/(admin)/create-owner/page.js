"use client";
import { useState } from "react";
import { useLoadOnMount } from "@/utils/useLoadOnMount";
import { supabase } from "@/utils/supabaseClient";
import DataTable, { RowAction, toDate, fmtDate } from "@/components/DataTable";
import PageHeader, { Notice, FormPanel } from "@/components/PageHeader";

export default function CreateOwnerPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", country: "" });
  const [owners, setOwners] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Fetch directly from users where role = 'owner'
  const fetchOwners = async () => {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, phone, country, role, created_at, last_login")
      .eq("role", "owner")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch owners:", error);
    } else {
      setOwners(data);
    }
    setLoaded(true);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    const { name, email, phone, country } = form;

    if (!name.trim()) {
      setMessage("⚠️ Owner name is required.");
      return;
    }

    if (editMode) {
      // Update users table
      const { error: updateError } = await supabase
        .from("users")
        .update({ name, email, phone, country })
        .eq("id", editingUserId);

      if (updateError) {
        setMessage("❌ Failed to update owner: " + updateError.message);
        return;
      }

      setMessage("✅ Owner updated.");
    } else {
      // Insert into users with role = 'owner'
      const { error: userError } = await supabase
        .from("users")
        .insert([
          {
            name,
            email,
            phone,
            country,
            role: "owner",
          },
        ])
        .select();

      if (userError) {
        if (userError.message?.includes("unique_email")) {
          setMessage("⚠️ This email is already in use.");
        } else if (userError.message?.includes("unique_phone")) {
          setMessage("⚠️ This phone number is already in use.");
        } else {
          setMessage("❌ Failed to create owner: " + userError.message);
        }
        return;
      }

      setMessage("✅ Owner saved.");
    }

    setForm({ name: "", email: "", phone: "", country: "" });
    setEditMode(false);
    setEditingUserId(null);
    fetchOwners();
  };

  const handleEdit = (owner) => {
    setForm({
      name: owner.name || "",
      email: owner.email || "",
      phone: owner.phone || "",
      country: owner.country || "",
    });
    setEditMode(true);
    setEditingUserId(owner.id);
    setMessage(`✏️ Editing Owner: ${owner.name}`);
  };

  const handleDelete = async (userId) => {
    if (!confirm("Are you sure you want to delete this owner?")) return;
    const { error } = await supabase.from("users").delete().eq("id", userId);
    if (!error) {
      setMessage("✅ Owner deleted.");
      fetchOwners();
    } else {
      setMessage("❌ Failed to delete owner: " + error.message);
    }
  };

  useLoadOnMount(fetchOwners);

  const resetForm = () => {
    setForm({ name: "", email: "", phone: "", country: "" });
    setEditMode(false);
    setEditingUserId(null);
    setMessage("");
  };

  return (
    <div className="k-page">
      <PageHeader eyebrow="Owners" title="Property owners" subtitle="The people whose keys live in your machines." />

      <Notice>{message}</Notice>
      <div className="space-y-6">
        <FormPanel title={editMode ? "Edit owner" : "Add owner"} addLabel="Add owner" forceOpen={editMode}>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
            {[
              { label: "Name", name: "name", type: "text", ph: "Full name" },
              { label: "Email", name: "email", type: "email", ph: "name@example.com" },
              { label: "Phone", name: "phone", type: "tel", ph: "+20 …" },
              { label: "Country", name: "country", type: "text", ph: "Egypt" },
            ].map(({ label, name, type, ph }) => (
              <div key={name}>
                <label className="k-label" htmlFor={`owner-${name}`}>
                  {label}
                </label>
                <input
                  id={`owner-${name}`}
                  type={type}
                  name={name}
                  value={form[name]}
                  onChange={handleChange}
                  placeholder={ph}
                  className="k-input"
                  required={name === "name"}
                />
              </div>
            ))}
            <div className="flex gap-2 pt-2 md:col-span-2 lg:col-span-3 md:justify-end">
              <button type="submit" className="k-btn-primary flex-1 md:flex-none md:min-w-40">
                {editMode ? "Save changes" : "Add owner"}
              </button>
              {editMode && (
                <button type="button" onClick={resetForm} className="k-btn-secondary">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </FormPanel>

        <DataTable
          title="All owners"
          rows={owners}
          loading={!loaded}
          exportName="owners"
          searchPlaceholder="Search owners"
          defaultSort={{ key: "name", dir: "asc" }}
          emptyText="No owners yet. Add your first one."
          columns={[
            {
              key: "name",
              mobile: "title",
              header: "Name",
              cell: (o) => <span className="font-medium">{o.name}</span>,
            },
            { key: "email", mobile: "meta", header: "Email" },
            { key: "phone", mobile: "meta", header: "Phone" },
            { key: "country", header: "Country" },
            {
              key: "last_login",
              header: "Last sign in",
              value: (o) => toDate(o.last_login),
              cell: (o) => (o.last_login ? fmtDate(o.last_login) : "Never"),
            },
          ]}
          rowClassName={(o) => (o.id === editingUserId ? "!bg-[#e8f2fd]" : "")}
          rowActions={(o) => (
            <>
              <RowAction onClick={() => handleEdit(o)}>Edit</RowAction>
              <RowAction tone="danger" onClick={() => handleDelete(o.id)}>
                Delete
              </RowAction>
            </>
          )}
        />
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function CreateOwnerPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', country: '' });
  const [owners, setOwners] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchOwners();
  }, []);

  // Fetch directly from users where role = 'owner'
  const fetchOwners = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, phone, country, role, created_at, last_login')
      .eq('role', 'owner')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Failed to fetch owners:", error);
    } else {
      setOwners(data);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    const { name, email, phone, country } = form;

    if (!name.trim()) {
      setMessage('⚠️ Owner name is required.');
      return;
    }

    if (editMode) {
      // Update users table
      const { error: updateError } = await supabase
        .from('users')
        .update({ name, email, phone, country })
        .eq('id', editingUserId);

      if (updateError) {
        setMessage('❌ Failed to update owner: ' + updateError.message);
        return;
      }

      setMessage('✅ Owner updated.');
    } else {
      // Insert into users with role = 'owner'
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert([{
          name,
          email,
          phone,
          country,
          role: 'owner'
        }])
        .select();

      if (userError) {
        if (userError.message?.includes('unique_email')) {
          setMessage('⚠️ This email is already in use.');
        } else if (userError.message?.includes('unique_phone')) {
          setMessage('⚠️ This phone number is already in use.');
        } else {
          setMessage('❌ Failed to create owner: ' + userError.message);
        }
        return;
      }

      setMessage('✅ Owner saved.');
    }

    setForm({ name: '', email: '', phone: '', country: '' });
    setEditMode(false);
    setEditingUserId(null);
    fetchOwners();
  };

  const handleEdit = (owner) => {
    setForm({
      name: owner.name || '',
      email: owner.email || '',
      phone: owner.phone || '',
      country: owner.country || ''
    });
    setEditMode(true);
    setEditingUserId(owner.id);
    setMessage(`✏️ Editing Owner: ${owner.name}`);
  };

  const handleDelete = async (userId) => {
    if (!confirm('Are you sure you want to delete this owner?')) return;
    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (!error) {
      setMessage('✅ Owner deleted.');
      fetchOwners();
    } else {
      setMessage('❌ Failed to delete owner: ' + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">👤 Manage Owners</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-10 px-4 space-y-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{editMode ? 'Edit Owner' : 'Edit Owner'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: "Owner Name", name: "name", type: "text" },
              { label: "Email", name: "email", type: "email" },
              { label: "Phone", name: "phone", type: "tel" },
              { label: "Country", name: "country", type: "text" }
            ].map(({ label, name, type }) => (
              <div key={name}>
                <label className="block text-sm font-medium text-gray-700">{label}</label>
                <input
                  type={type}
                  name={name}
                  value={form[name]}
                  onChange={handleChange}
                  className="mt-1 block w-full border rounded-md p-2"
                  required={name === "name"}
                />
              </div>
            ))}

            <div className="flex space-x-2">
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                {editMode ? 'Update Owner' : 'Save Owner'}
              </button>
              {editMode && (
                <button
                  type="button"
                  onClick={() => {
                    setForm({ name: '', email: '', phone: '', country: '' });
                    setEditMode(false);
                    setEditingUserId(null);
                    setMessage('');
                  }}
                  className="bg-gray-400 text-white px-4 py-2 rounded-md hover:bg-gray-500"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          {message && <p className="mt-4 text-sm text-center">{message}</p>}
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">📋 Existing Owners</h2>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {["Name", "Email", "Phone", "Country", "Actions"].map((col) => (
                  <th key={col} className={`px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider ${col === "Actions" ? "text-right" : "text-left"}`}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {owners.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-center text-gray-500">No owners found.</td>
                </tr>
              ) : (
                owners.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2">{o.name}</td>
                    <td className="px-4 py-2">{o.email}</td>
                    <td className="px-4 py-2">{o.phone}</td>
                    <td className="px-4 py-2">{o.country}</td>
                    <td className="px-4 py-2 space-x-2 text-right">
                      <button
                        onClick={() => handleEdit(o)}
                        className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(o.id)}
                        className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

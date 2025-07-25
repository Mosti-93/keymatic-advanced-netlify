'use client';
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function CreateOwnerPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', city: '', country: '' });
  const [owners, setOwners] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchOwners();
  }, []);

  const fetchOwners = async () => {
    const { data, error } = await supabase.from('owners').select('*').order('inserted_at', { ascending: false });
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

    const { name, email, phone, city, country } = form;

    if (!name.trim()) {
      setMessage('⚠️ Owner name is required.');
      return;
    }

    let result;
    if (editMode) {
      result = await supabase
        .from('owners')
        .update({
          full_name: name,
          email,
          phone,
          city,
          country
        })
        .eq('id', editingId);
    } else {
      result = await supabase
        .from('owners')
        .insert([{
          full_name: name,
          email,
          phone,
          city,
          country
        }]);
    }

    const { error } = result;

    if (error) {
      console.error("Error saving owner:", error);
      if (error.message.includes('unique_email')) {
        setMessage('⚠️ This email is already in use.');
      } else if (error.message.includes('unique_phone')) {
        setMessage('⚠️ This phone number is already in use.');
      } else {
        setMessage(`❌ ${error.message}`);
      }
    } else {
      setMessage(editMode ? '✅ Owner updated.' : '✅ Owner saved.');
      setForm({ name: '', email: '', phone: '', city: '', country: '' });
      setEditMode(false);
      setEditingId(null);
      fetchOwners();
    }
  };

  const handleEdit = (owner) => {
    setForm({
      name: owner.full_name || '',
      email: owner.email || '',
      phone: owner.phone || '',
      city: owner.city || '',
      country: owner.country || ''
    });
    setEditMode(true);
    setEditingId(owner.id);
    setMessage(`✏️ Editing Owner: ${owner.full_name}`);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this owner?')) return;
    const { error } = await supabase.from('owners').delete().eq('id', id);
    if (!error) {
      setMessage('✅ Owner deleted.');
      fetchOwners();
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
          <h2 className="text-xl font-semibold mb-4">{editMode ? 'Edit Owner' : 'Add New Owner'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: "Owner Name", name: "name", type: "text" },
              { label: "Email", name: "email", type: "email" },
              { label: "Phone", name: "phone", type: "tel" },
              { label: "City", name: "city", type: "text" },
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
                    setForm({ name: '', email: '', phone: '', city: '', country: '' });
                    setEditMode(false);
                    setEditingId(null);
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
                {["Name", "Email", "Phone", "City", "Country", "Actions"].map((col) => (
<th key={col} className={`px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider ${col === "Actions" ? "text-right" : "text-left"}`}>
  {col}
</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {owners.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-2 text-center text-gray-500">No owners found.</td>
                </tr>
              ) : (
                owners.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2">{o.full_name}</td>
                    <td className="px-4 py-2">{o.email}</td>
                    <td className="px-4 py-2">{o.phone}</td>
                    <td className="px-4 py-2">{o.city}</td>
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

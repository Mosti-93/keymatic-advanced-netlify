'use client'
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function CreateKeyPage() {
  const [form, setForm] = useState({
    key_id: '',
    UID: '',
    room_number: '',
    machine_id: '',
    owner_id: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [keys, setKeys] = useState([]);
  const [machines, setMachines] = useState([]);
  const [owners, setOwners] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState(null);

  useEffect(() => {
    fetchKeys();
    fetchMachines();
    fetchOwners();
  }, []);

  const fetchKeys = async () => {
    const { data, error } = await supabase.from('keys').select('*');
    if (!error) setKeys(data);
  };

  const fetchMachines = async () => {
    const { data, error } = await supabase.from('machines').select('id, "Machine name"');
    if (!error) setMachines(data);
  };

  const fetchOwners = async () => {
    const { data, error } = await supabase.from('owners').select('id, full_name');
    if (!error) setOwners(data);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { key_id, UID, room_number } = form;
    if (!key_id || !UID || !room_number) {
      setMessage('⚠️ key_id, UID, and room_number are required.');
      setLoading(false);
      return;
    }

    const payload = {
      key_id,
      UID,
      room_number,
      machine_id: form.machine_id || null,
      owner_id: form.owner_id || null,
    };

    let response;
    if (editMode) {
      response = await supabase.from('keys').update(payload).eq('id', editingKeyId);
    } else {
      response = await supabase.from('keys').insert([payload]);
    }

    const { error } = response;
    if (error) {
      console.error('Insert Error:', error);
      setMessage(`❌ Failed to save key: ${error.message}`);
    } else {
      setMessage(editMode ? '✅ Key updated.' : '✅ Key saved.');
      setForm({ key_id: '', UID: '', room_number: '', machine_id: '', owner_id: '' });
      setEditMode(false);
      setEditingKeyId(null);
      fetchKeys();
    }

    setLoading(false);
  };

  const handleEdit = (key) => {
    setForm({
      key_id: key.key_id,
      UID: key.UID,
      room_number: key.room_number,
      machine_id: key.machine_id || '',
      owner_id: key.owner_id || ''
    });
    setEditMode(true);
    setEditingKeyId(key.id);
    setMessage(`✏️ Editing Key: ${key.key_id}`);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this key?')) return;
    const { error } = await supabase.from('keys').delete().eq('id', id);
    if (!error) {
      setMessage('✅ Key deleted.');
      fetchKeys();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <h1 className="text-3xl font-bold">🔑 Manage Keys</h1>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-10 px-4 space-y-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{editMode ? 'Edit Key' : 'Add New Key'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { name: 'key_id', label: 'Key ID' },
              { name: 'UID', label: 'UID' },
              { name: 'room_number', label: 'Room No' }
            ].map(({ name, label }) => (
              <div key={name}>
                <label className="block text-sm font-medium">{label}</label>
                <input
                  type="text"
                  name={name}
                  value={form[name]}
                  onChange={handleChange}
                  className="mt-1 block w-full border rounded-md p-2"
                  required
                />
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium">Machine (optional)</label>
              <select
                name="machine_id"
                value={form.machine_id}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md p-2"
              >
                <option value="">-- Select Machine --</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>{m["Machine name"]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium">Owner (optional)</label>
              <select
                name="owner_id"
                value={form.owner_id}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md p-2"
              >
                <option value="">-- Select Owner --</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.full_name}</option>
                ))}
              </select>
            </div>

            <div className="flex space-x-2">
  <button
    type="submit"
    disabled={loading}
    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
  >
    {loading ? 'Saving...' : editMode ? 'Update Key' : 'Save Key'}
  </button>
  {editMode && (
    <button
      type="button"
      onClick={() => {
        setForm({ key_id: '', UID: '', room_number: '', machine_id: '', owner_id: '' });
        setEditMode(false);
        setEditingKeyId(null);
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
          <h2 className="text-xl font-semibold mb-4">📋 Existing Keys</h2>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {["key_id", "UID", "room_number", "machine_id", "owner_id"].map((col) => (
                  <th key={col} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {col}
                  </th>
                ))}
                <th className="px-4 py-2 text-right">Actions</th>

              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-2">{k.key_id}</td>
                  <td className="px-4 py-2">{k.UID}</td>
                  <td className="px-4 py-2">{k.room_number}</td>
                  <td className="px-4 py-2">{k.machine_id}</td>
                  <td className="px-4 py-2">{k.owner_id}</td>
                 <td className="px-4 py-2 space-x-2 text-right">
  <button
    onClick={() => handleEdit(k)}
    className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
  >
    Edit
  </button>
  <button
    onClick={() => handleDelete(k.id)}
    className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
  >
    Delete
  </button>
</td>


                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

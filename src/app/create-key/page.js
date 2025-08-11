'use client'
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function CreateKeyPage() {
  const [form, setForm] = useState({
    key_id: '',
    UID: '',
    room_number: '',
    machine_id: '',   // keep as string; DB uses text like "A01"
    owner_id: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [keys, setKeys] = useState([]);
  const [machines, setMachines] = useState([]);
  const [owners, setOwners] = useState([]);
  const [filteredOwners, setFilteredOwners] = useState([]);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const [keysRes, machinesRes, ownersRes] = await Promise.all([
      supabase.from('keys').select('*'),
      // NOTE: can't alias a quoted column in select -> fetch raw then normalize in JS
      supabase.from('machines').select('machine_id, "Machine name"'),
      supabase.from('users').select('id, name, email, phone').eq('role', 'owner')
    ]);

    if (!keysRes.error) setKeys(keysRes.data || []);

    if (!machinesRes.error) {
      const normalized = (machinesRes.data || []).map(m => ({
        ...m,
        machine_name: m["Machine name"],  // normalize once
      }));
      setMachines(normalized);
    }

    if (!ownersRes.error) setOwners(ownersRes.data || []);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'machine_id') {
      setForm(prev => ({ ...prev, machine_id: value })); // string or ''
      return;
    }
    setForm(prev => ({ ...prev, [name]: value }));
  };

  // Fast lookup tolerant to string/number mismatch
  const machinesById = useMemo(
    () => new Map(machines.map(m => [String(m.machine_id), m])),
    [machines]
  );
  const getMachine = (machine_id) => machinesById.get(String(machine_id));
  const getOwner = (id) => owners.find(o => o.id === id);

  // Owner search logic
  const handleOwnerSearch = (e) => {
    const value = e.target.value;
    setOwnerSearch(value);
    setSelectedOwner(null);
    setForm(prev => ({ ...prev, owner_id: '' }));
    if (value.trim().length < 2) {
      setFilteredOwners([]);
      return;
    }
    const q = value.trim().toLowerCase();
    const matches = owners.filter(owner =>
      (owner.name && owner.name.toLowerCase().includes(q)) ||
      (owner.email && owner.email.toLowerCase().includes(q))
    );
    setFilteredOwners(matches || []);
  };

  const handleOwnerSelect = (owner) => {
    setSelectedOwner(owner);
    setOwnerSearch(owner.name + (owner.email ? ` (${owner.email})` : ''));
    setFilteredOwners([]);
    setForm(prev => ({ ...prev, owner_id: owner.id }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { key_id, UID } = form;
    if (!key_id || !UID) {
      setMessage('key_id and UID are required.');
      setLoading(false);
      return;
    }

    // Keep machine_id as string (or null)
    const machineIdValue =
      form.machine_id === '' || form.machine_id == null ? null : String(form.machine_id);

    const payload = {
      key_id,
      UID,
      room_number: form.room_number || null,
      machine_id: machineIdValue,
      owner_id: form.owner_id || null,
    };

    const response = editMode
      ? await supabase.from('keys').update(payload).eq('id', editingKeyId)
      : await supabase.from('keys').insert([payload]);

    if (response.error) {
      console.error('Insert/Update Error:', response.error);
      setMessage(`Failed to save key: ${response.error.message}`);
    } else {
      setMessage(editMode ? 'Key updated.' : 'Key saved.');
      setForm({ key_id: '', UID: '', room_number: '', machine_id: '', owner_id: '' });
      setSelectedOwner(null);
      setOwnerSearch('');
      setEditMode(false);
      setEditingKeyId(null);
      fetchAll();
    }

    setLoading(false);
  };

  const handleEdit = (key) => {
    const ownerObj = owners.find(o => o.id === key.owner_id) || null;
    setForm({
      key_id: key.key_id,
      UID: key.UID,
      room_number: key.room_number || '',
      machine_id: key.machine_id == null ? '' : String(key.machine_id), // string for <select>
      owner_id: key.owner_id ?? ''
    });
    setSelectedOwner(ownerObj);
    setOwnerSearch(ownerObj ? (ownerObj.name + (ownerObj.email ? ` (${ownerObj.email})` : '')) : '');
    setEditMode(true);
    setEditingKeyId(key.id);
    setMessage(`Editing Key: ${key.key_id}`);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this key?')) return;
    const { error } = await supabase.from('keys').delete().eq('id', id);
    if (!error) {
      setMessage('Key deleted.');
      fetchAll();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <h1 className="text-3xl font-bold">Manage Keys</h1>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-10 px-4 space-y-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{editMode ? 'Edit Key' : 'Add New Key'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { name: 'key_id', label: 'Key ID', required: true },
              { name: 'UID', label: 'UID', required: true },
              { name: 'room_number', label: 'Room No', required: false }
            ].map(({ name, label, required }) => (
              <div key={name}>
                <label className="block text-sm font-medium">{label}</label>
                <input
                  type="text"
                  name={name}
                  value={form[name]}
                  onChange={handleChange}
                  className="mt-1 block w-full border rounded-md p-2"
                  {...(required ? { required: true } : {})}
                />
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium">Machine (optional)</label>
              <select
                name="machine_id"
                value={form.machine_id === null ? '' : String(form.machine_id)}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md p-2"
              >
                <option value="">-- Select Machine --</option>
                {machines.map((m) => (
                  <option key={m.machine_id} value={String(m.machine_id)}>
                    {m.machine_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Owner Search Field */}
            <div className="relative">
              <label className="block text-sm font-medium">Owner (optional, search by name or email)</label>
              <input
                type="text"
                value={ownerSearch}
                onChange={handleOwnerSearch}
                placeholder="Type owner name or email"
                className="mt-1 block w-full border rounded-md p-2"
                autoComplete="off"
              />
              {filteredOwners.length > 0 && (
                <ul className="absolute z-10 bg-white border border-gray-300 rounded-md shadow max-h-40 overflow-y-auto mt-1 w-full">
                  {filteredOwners.map((owner) => (
                    <li
                      key={owner.id}
                      onClick={() => handleOwnerSelect(owner)}
                      className="p-2 hover:bg-blue-100 cursor-pointer"
                    >
                      <span className="font-medium">{owner.name}</span>
                      <span className="ml-2 text-xs text-gray-600">{owner.email}</span>
                    </li>
                  ))}
                </ul>
              )}
              {selectedOwner && (
                <div className="mt-3 p-3 bg-gray-100 rounded-md shadow">
                  <h3 className="text-base font-semibold">{selectedOwner.name}</h3>
                  <p className="text-sm text-gray-700">Email: {selectedOwner.email}</p>
                  {selectedOwner.phone && <p className="text-sm text-gray-700">Phone: {selectedOwner.phone}</p>}
                </div>
              )}
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
                    setOwnerSearch('');
                    setSelectedOwner(null);
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
          <h2 className="text-xl font-semibold mb-4">Existing Keys</h2>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {["key_id", "UID", "room_number", "machine_id", "machine_name", "owner_name"].map((col) => (
                  <th key={col} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {col}
                  </th>
                ))}
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {keys.map((k) => {
                const machine = getMachine(k.machine_id);
                const owner = getOwner(k.owner_id);
                return (
                  <tr key={k.id}>
                    <td className="px-4 py-2">{k.key_id}</td>
                    <td className="px-4 py-2">{k.UID}</td>
                    <td className="px-4 py-2">{k.room_number}</td>
                    {/* show raw FK even if name missing */}
                    <td className="px-4 py-2">{k.machine_id ?? '—'}</td>
                    {/* resolved machine name via normalized field */}
                    <td className="px-4 py-2">{machine ? machine.machine_name : '—'}</td>
                    <td className="px-4 py-2">{owner?.name ?? '—'}</td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

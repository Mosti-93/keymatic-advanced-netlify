'use client'
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function LinkOwnerPage() {
  // --- Link form states ---
  const [ownerEmail, setOwnerEmail] = useState('');
  const [foundOwners, setFoundOwners] = useState([]);
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [availableKeys, setAvailableKeys] = useState([]);
  const [keySearch, setKeySearch] = useState('');
  const [foundKeys, setFoundKeys] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [machineSearch, setMachineSearch] = useState('');
  const [foundMachines, setFoundMachines] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [message, setMessage] = useState('');

  // --- Table data states ---
  const [keys, setKeys] = useState([]);
  const [machines, setMachines] = useState([]);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(false);

  // --- Edit mode ---
  const [editMode, setEditMode] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState(null);

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { fetchUnassignedKeys(); fetchMachinesForForm(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [keysRes, machinesRes, ownersRes] = await Promise.all([
      supabase.from('keys').select('*').not('owner_id', 'is', null).not('machine_id', 'is', null),
      supabase.from('machines').select('id, machine_id, "Machine name"'),
      supabase.from('users').select('id, name, email')
    ]);
    setKeys(keysRes.data || []);
    setMachines(machinesRes.data || []);
    setOwners(ownersRes.data || []);
    setLoading(false);
  };

  // For the linking form:
  const fetchUnassignedKeys = async () => {
    const { data: keys } = await supabase
      .from("keys")
      .select("*")
      .is("owner_id", null);
    setAvailableKeys(keys || []);
  };
  const fetchMachinesForForm = async () => {
    setFoundMachines([]); // Always empty by default
  };

  // Lookup helpers for the table:
  const getMachine = (id) => machines.find(m => m.id === id);
  const getOwner = (id) => owners.find(o => o.id === id);

  // --- Linking form logic (search, select, submit, edit, delete) ---
  const handleEmailInput = async (e) => {
    const value = e.target.value;
    setOwnerEmail(value);
    setSelectedOwner(null);
    if (value.length < 2) { setFoundOwners([]); return; }
    const { data } = await supabase.from("users").select("id, name, email").ilike("email", `%${value.trim()}%`);
    setFoundOwners(data || []);
  };
  const handleOwnerSelect = (owner) => {
    setSelectedOwner(owner);
    setOwnerEmail(owner.email);
    setFoundOwners([]);
  };
  const handleKeySearchInput = (e) => {
    const value = e.target.value;
    setKeySearch(value);
    setSelectedKey(null);
    if (value.length < 1) { setFoundKeys([]); return; }
    const filtered = availableKeys.filter(k =>
      (k.key_id || '').toLowerCase().includes(value.trim().toLowerCase()) ||
      (k.UID || '').toLowerCase().includes(value.trim().toLowerCase())
    );
    setFoundKeys(filtered);
  };
  const handleKeySelect = (key) => {
    setSelectedKey(key);
    setKeySearch(key.key_id || key.id);
    setFoundKeys([]);
  };
  const handleMachineSearchInput = (e) => {
    const value = e.target.value;
    setMachineSearch(value);
    setSelectedMachine(null);
    if (value.length < 1) { setFoundMachines([]); return; }
    const filtered = machines.filter(m =>
      (m.machine_id || '').toLowerCase().includes(value.trim().toLowerCase()) ||
      (m["Machine name"] || '').toLowerCase().includes(value.trim().toLowerCase())
    );
    setFoundMachines(filtered);
  };
  const handleMachineSelect = (machine) => {
    setSelectedMachine(machine);
    setMachineSearch(machine.machine_id || machine.id);
    setFoundMachines([]);
  };

  // Add or Edit Link
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedKey && !editMode) return;
    if (!selectedOwner || !selectedMachine) return;
    const payload = {
      owner_id: selectedOwner.id,
      machine_id: selectedMachine.id
    };
    let error;
    if (editMode && editingKeyId) {
      ({ error } = await supabase.from("keys").update(payload).eq("id", editingKeyId));
    } else {
      ({ error } = await supabase
        .from("keys")
        .update(payload)
        .eq("id", selectedKey.id));
    }
    if (!error) {
      setAvailableKeys(prev => prev.filter(k => k.id !== (editMode ? editingKeyId : selectedKey.id)));
      setSelectedKey(null); setKeySearch('');
      setSelectedMachine(null); setMachineSearch('');
      setSelectedOwner(null); setOwnerEmail('');
      setEditMode(false); setEditingKeyId(null);
      setFoundOwners([]); setFoundKeys([]); setFoundMachines([]);
      setMessage(editMode ? '✅ Link updated.' : '✅ Key linked.');
      fetchAll();
      fetchUnassignedKeys();
    } else {
      setMessage("❌ Failed to link key: " + error.message);
    }
  };

  // Edit button in the table
  const handleEdit = (row) => {
    const owner = getOwner(row.owner_id);
    setSelectedOwner(owner || null);
    setOwnerEmail(owner?.email || '');
    setSelectedKey(row);
    setKeySearch(row.key_id || row.id);
    const machine = getMachine(row.machine_id);
    setSelectedMachine(machine || null);
    setMachineSearch(machine?.machine_id || machine?.id || '');
    setFoundOwners([]); setFoundKeys([]); setFoundMachines([]);
    setEditMode(true);
    setEditingKeyId(row.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Delete button in the table
  const handleDelete = async (rowId) => {
    if (!window.confirm('Are you sure you want to delete this link?')) return;
    const { error } = await supabase
      .from("keys")
      .update({ owner_id: null, machine_id: null })
      .eq("id", rowId);
    if (!error) {
      setMessage('✅ Link deleted.');
      fetchAll();
      fetchUnassignedKeys();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <h1 className="text-3xl font-bold">🔗 Link Owner</h1>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-10 px-4 space-y-8">
        {/* Link Form */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{editMode ? "Edit Linked Key" : "Link Key to Owner"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Owner Search */}
            <div className="mb-4 relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search Owner by Email</label>
              <input
                type="email"
                placeholder="Enter owner email"
                value={ownerEmail}
                onChange={handleEmailInput}
                className="block w-full rounded-md border-gray-300 shadow-sm"
                autoComplete="off"
              />
              {foundOwners.length > 0 && (
                <ul className="absolute left-0 top-full z-10 bg-white border border-gray-300 rounded-md shadow max-h-48 w-full overflow-y-auto mt-1">
                  {foundOwners.map((owner) => (
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
            </div>
            {/* Key Search */}
            <div className="mb-4 relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search Key by ID or UID</label>
              <input
                type="text"
                placeholder="Type to search key_id or UID"
                value={keySearch}
                onChange={handleKeySearchInput}
                className="block w-full rounded-md border-gray-300 shadow-sm"
                autoComplete="off"
                disabled={availableKeys.length === 0}
              />
              {foundKeys.length > 0 && (
                <ul className="absolute left-0 top-full z-10 bg-white border border-gray-300 rounded-md shadow max-h-48 w-full overflow-y-auto mt-1">
                  {foundKeys.map((key) => (
                    <li
                      key={key.id}
                      onClick={() => handleKeySelect(key)}
                      className="p-2 hover:bg-blue-100 cursor-pointer"
                    >
                      <span className="font-medium">
                        {key.key_id || key.id}
                        <span className="ml-2 text-xs text-gray-600">{key.UID}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Machine Search */}
            <div className="mb-4 relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search Machine by ID or Name</label>
              <input
                type="text"
                placeholder="Type to search machine_id or name"
                value={machineSearch}
                onChange={handleMachineSearchInput}
                className="block w-full rounded-md border border-gray-300 shadow-sm"
                autoComplete="off"
                disabled={machines.length === 0}
              />
              {foundMachines.length > 0 && (
                <ul className="absolute left-0 top-full z-10 bg-white border border-gray-300 rounded-md shadow max-h-48 w-full overflow-y-auto mt-1">
                  {foundMachines.map((machine) => (
                    <li
                      key={machine.id}
                      onClick={() => handleMachineSelect(machine)}
                      className="p-2 hover:bg-green-100 cursor-pointer"
                    >
                      <span className="font-medium">
                        {machine.machine_id}
                        <span className="ml-2 text-xs text-gray-600">{machine['Machine name']}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex space-x-2">
              <button
                type="submit"
                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition"
                disabled={editMode
                  ? !selectedOwner || !selectedMachine || !editingKeyId
                  : !selectedOwner || !selectedKey || !selectedMachine}
              >
                {editMode ? "Update Link" : "Link"}
              </button>
              {editMode && (
                <button
                  type="button"
                  onClick={() => {
                    setEditMode(false);
                    setEditingKeyId(null);
                    setSelectedKey(null);
                    setKeySearch('');
                    setSelectedMachine(null);
                    setMachineSearch('');
                    setSelectedOwner(null);
                    setOwnerEmail('');
                    setMessage('');
                    setFoundOwners([]);
                    setFoundKeys([]);
                    setFoundMachines([]);
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

        {/* Existing Keys Table (same as CreateKeyPage) */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">📋 Existing Keys</h2>
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
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading…</td></tr>
              ) : keys.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No linked keys found.</td></tr>
              ) : (
                keys.map((k) => {
                  const machine = getMachine(k.machine_id);
                  const owner = getOwner(k.owner_id);
                  return (
                    <tr key={k.id}>
                      <td className="px-4 py-2">{k.key_id}</td>
                      <td className="px-4 py-2">{k.UID}</td>
                      <td className="px-4 py-2">{k.room_number}</td>
                      <td className="px-4 py-2">{machine?.machine_id || '—'}</td>
                      <td className="px-4 py-2">{machine?.["Machine name"] || '—'}</td>
                      <td className="px-4 py-2">{owner?.name || '—'}</td>
                      <td className="px-4 py-2 text-right space-x-2">
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
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

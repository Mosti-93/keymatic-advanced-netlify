'use client'
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function LinkOwnerPage() {
  // --- Owner search state ---
  const [ownerEmail, setOwnerEmail] = useState('');
  const [foundOwners, setFoundOwners] = useState([]);
  const [selectedOwner, setSelectedOwner] = useState(null);

  // --- Key search state ---
  const [availableKeys, setAvailableKeys] = useState([]); // unassigned keys
  const [keySearch, setKeySearch] = useState('');
  const [foundKeys, setFoundKeys] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);

  // --- Machine search state ---
  const [machines, setMachines] = useState([]); // all machines
  const [machineSearch, setMachineSearch] = useState('');
  const [foundMachines, setFoundMachines] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState(null);

  // --- Linked keys table state ---
  const [linkedRows, setLinkedRows] = useState([]);
  const [loadingTable, setLoadingTable] = useState(false);

  // Fetch all unassigned keys on mount
  useEffect(() => {
    const fetchUnassignedKeys = async () => {
      const { data: keys } = await supabase
        .from("keys")
        .select("*")
        .is("owner_id", null);
      setAvailableKeys(keys || []);
    };
    fetchUnassignedKeys();
  }, []);

  // Fetch all machines on mount
  useEffect(() => {
    const fetchMachines = async () => {
      const { data: machinesData } = await supabase
        .from("machines")
        .select("*");
      setMachines(machinesData || []);
    };
    fetchMachines();
  }, []);

  // --- Owner search logic ---
  const handleEmailInput = async (e) => {
    const value = e.target.value;
    setOwnerEmail(value);
    setSelectedOwner(null);
    if (value.length < 2) {
      setFoundOwners([]);
      return;
    }
    const { data } = await supabase
      .from("owners")
      .select("*")
      .ilike("email", `%${value.trim()}%`);
    setFoundOwners(data || []);
  };

  const handleOwnerSelect = (owner) => {
    setSelectedOwner(owner);
    setOwnerEmail(owner.email);
    setFoundOwners([]);
  };

  // --- Key search logic (live dropdown, searches key_id & UID) ---
  const handleKeySearchInput = (e) => {
    const value = e.target.value;
    setKeySearch(value);
    setSelectedKey(null);
    if (value.length < 1) {
      setFoundKeys([]);
      return;
    }
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

  // --- Machine search logic (live dropdown, by machine_id or Machine name) ---
  const handleMachineSearchInput = (e) => {
    const value = e.target.value;
    setMachineSearch(value);
    setSelectedMachine(null);
    if (value.length < 1) {
      setFoundMachines([]);
      return;
    }
    const filtered = machines.filter(m =>
      (m.machine_id || '').toLowerCase().includes(value.trim().toLowerCase()) ||
      (m['Machine name'] || '').toLowerCase().includes(value.trim().toLowerCase())
    );
    setFoundMachines(filtered);
  };

  const handleMachineSelect = (machine) => {
    setSelectedMachine(machine);
    setMachineSearch(machine.machine_id || machine.id);
    setFoundMachines([]);
  };

  // --- Handle add link ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedKey || !selectedOwner || !selectedMachine) return;
    const { error } = await supabase
      .from("keys")
      .update({
        owner_id: selectedOwner.id,
        machine_id: selectedMachine.id
      })
      .eq("id", selectedKey.id);

    if (!error) {
      setAvailableKeys(prev => prev.filter(k => k.id !== selectedKey.id));
      setSelectedKey(null);
      setKeySearch('');
      setSelectedMachine(null);
      setMachineSearch('');
      fetchLinkedRows();
    } else {
      alert("Failed to link key: " + error.message);
    }
  };

  // --- LIVE TABLE LOGIC ---
  const fetchLinkedRows = async () => {
    setLoadingTable(true);
    let { data: keys, error } = await supabase
      .from('keys')
      .select(`
        id,
        key_id,
        UID,
        owner_id,
        machine_id,
        owners:owner_id (
          id, full_name, email
        ),
        machines:machine_id (
          id, machine_id, "Machine name", location
        )
      `)
      .not('owner_id', 'is', null)
      .not('machine_id', 'is', null);

    setLinkedRows(keys || []);
    setLoadingTable(false);
  };

  useEffect(() => { fetchLinkedRows(); }, []);

  // --- Edit/Delete ---
  const handleDelete = async (rowId) => {
    if (!window.confirm('Are you sure you want to delete this link?')) return;
    const { error } = await supabase
      .from("keys")
      .update({ owner_id: null, machine_id: null })
      .eq("id", rowId);
    if (!error) {
      setLinkedRows(prev => prev.filter(r => r.id !== rowId));
      // Or: fetchLinkedRows();
    }
  };

  const handleEdit = (row) => {
    // Example: fill form with existing row to relink or update
    setSelectedOwner(row.owners);
    setOwnerEmail(row.owners?.email || '');
    setSelectedKey({ id: row.id, key_id: row.key_id, UID: row.UID });
    setKeySearch(row.key_id || row.id);
    setSelectedMachine(row.machines);
    setMachineSearch(row.machines?.machine_id || row.machines?.id || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- UI ---
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">🔗 Link Owner</h1>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8 space-y-8">

        {/* Search & Link Form */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Link Key to Owner</h2>
          {/* Owner Search */}
          <div className="mb-4 relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Owner by Email</label>
            <input
              type="email"
              placeholder="Enter owner email"
              value={ownerEmail}
              onChange={handleEmailInput}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
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
                    <span className="font-medium">{owner.full_name || owner.name}</span>
                    <span className="ml-2 text-xs text-gray-600">{owner.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selectedOwner && (
            <div className="p-3 mb-4 border rounded bg-green-50">
              <div className="font-semibold">{selectedOwner.full_name || selectedOwner.name}</div>
              <div className="text-sm text-gray-600">{selectedOwner.email}</div>
              <div className="text-sm">{selectedOwner.phone || ''}</div>
              <div className="text-sm">{selectedOwner.city || ''} {selectedOwner.country || ''}</div>
            </div>
          )}
          {/* Key Search */}
          <div className="mb-4 relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Key by ID or UID</label>
            <input
              type="text"
              placeholder="Type to search key_id or UID"
              value={keySearch}
              onChange={handleKeySearchInput}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500"
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
              className="block w-full rounded-md border border-gray-300 shadow-sm focus:border-green-500"
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
          {/* Link */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <button
              type="submit"
              className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition"
              disabled={!selectedOwner || !selectedKey || !selectedMachine}
            >
            Link
            </button>
          </form>
        </div>

        {/* Linked Keys Table (live) */}
        <div className="bg-white shadow rounded-lg p-6 mt-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center">📋 Linked Keys</h2>
          {loadingTable ? (
            <div className="text-center text-gray-400 p-8">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border border-gray-300 rounded-lg">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 border border-gray-300">OWNER</th>
                    <th className="px-4 py-2 border border-gray-300">KEY</th>
                    <th className="px-4 py-2 border border-gray-300">MACHINE</th>
                    <th className="px-4 py-2 border border-gray-300">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedRows.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 border border-gray-300">
                        {row.owners?.full_name || '—'}
                      </td>
                      <td className="px-4 py-2 border border-gray-300">
                        {row.key_id}
                        <br />
                        <span className="text-xs text-gray-500">{row.UID}</span>
                      </td>
                      <td className="px-4 py-2 border border-gray-300">
                        {row.machines?.machine_id}
                        <br />
                        <span className="text-xs text-gray-500">{row.machines?.['Machine name']}</span>
                      </td>
                      <td className="px-4 py-2 border border-gray-300 text-right space-x-2">
                        <button
                          onClick={() => handleEdit(row)}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {linkedRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-gray-400 py-4">
                        No linked keys found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

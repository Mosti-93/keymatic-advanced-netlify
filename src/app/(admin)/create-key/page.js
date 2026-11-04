'use client'
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function CreateKeyPage() {
  // -------- FORM STATE --------
  const [form, setForm] = useState({
    key_id: '',
    UID: '',
    room_number: '',
    room_location: '',
    room_address: '',
    machine_id: '',   // keep as string; DB uses text like "A01"
    owner_id: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // -------- DATA STATE --------
  const [keys, setKeys] = useState([]);
  const [machines, setMachines] = useState([]);
  const [owners, setOwners] = useState([]);

  // -------- OWNER SEARCH (FORM) --------
  const [filteredOwners, setFilteredOwners] = useState([]);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [selectedOwner, setSelectedOwner] = useState(null);

  // -------- EDIT MODE --------
  const [editMode, setEditMode] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState(null);

  // -------- TABLE CONTROLS (Owner Panel–style) --------
  const [tableFilter, setTableFilter] = useState('');
  const [ownerAssignedFilter, setOwnerAssignedFilter] = useState('all');   // all | yes | no
  const [machineAssignedFilter, setMachineAssignedFilter] = useState('all'); // all | yes | no
  const [sortField, setSortField] = useState('key_id');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const [keysRes, machinesRes, ownersRes] = await Promise.all([
      supabase.from('keys').select('*'),
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

  // -------- HELPERS --------
  const machinesById = useMemo(
    () => new Map(machines.map(m => [String(m.machine_id), m])),
    [machines]
  );
  const ownersById = useMemo(
    () => new Map(owners.map(o => [o.id, o])),
    [owners]
  );

  const getMachine = (machine_id) => {
    if (machine_id === null || machine_id === undefined || machine_id === '') return undefined;
    return machinesById.get(String(machine_id));
  };
  const getOwner = (id) => ownersById.get(id);

  // Owner search logic (form)
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

  // -------- FORM EVENTS --------
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'machine_id') {
      setForm(prev => ({ ...prev, machine_id: value })); // string or ''
      return;
    }
    setForm(prev => ({ ...prev, [name]: value }));
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

    const machineIdValue =
      form.machine_id === '' || form.machine_id == null ? null : String(form.machine_id);

    const payload = {
      key_id,
      UID,
      room_number: form.room_number || null,
      room_location: form.room_location || null,
      room_address: form.room_address || null,
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
      setForm({
        key_id: '',
        UID: '',
        room_number: '',
        room_location: '',
        room_address: '',
        machine_id: '',
        owner_id: ''
      });
      setSelectedOwner(null);
      setOwnerSearch('');
      setEditMode(false);
      setEditingKeyId(null);
      fetchAll();
    }

    setLoading(false);
  };

  const handleEdit = (key) => {
    const ownerObj = ownersById.get(key.owner_id) || null;
    setForm({
      key_id: key.key_id,
      UID: key.UID,
      room_number: key.room_number || '',
      room_location: key.room_location || '',
      room_address: key.room_address || '',
      machine_id: key.machine_id == null ? '' : String(key.machine_id),
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

  // -------- TABLE: SEARCH / FILTER / SORT --------
  const sorters = {
    key_id: (k) => (k.key_id || '').toLowerCase(),
    UID: (k) => (k.UID || '').toLowerCase(),
    room_number: (k) => (k.room_number || '').toLowerCase(),
    room_location: (k) => (k.room_location || '').toLowerCase(),
    room_address: (k) => (k.room_address || '').toLowerCase(),
    machine: (k) => {
      const m = getMachine(k.machine_id);
      const idStr = k.machine_id == null ? '' : String(k.machine_id);
      return ((m?.machine_name || '') + ' ' + idStr).toLowerCase();
    },
    owner: (k) => {
      const o = getOwner(k.owner_id);
      return ((o?.name || '') + ' ' + (o?.email || '')).toLowerCase();
    },
  };

  const passesAssignedFilter = (val, mode) => {
    if (mode === 'all') return true;
    if (mode === 'yes') return val != null && val !== '' && val !== undefined;
    if (mode === 'no')  return val == null || val === '';
    return true;
  };

  const visibleKeys = useMemo(() => {
    let arr = [...keys];

    // Assigned filters
    arr = arr.filter(k =>
      passesAssignedFilter(k.owner_id, ownerAssignedFilter) &&
      passesAssignedFilter(k.machine_id, machineAssignedFilter)
    );

    // Free text search
    if (tableFilter.trim()) {
      const f = tableFilter.trim().toLowerCase();
      arr = arr.filter(k => {
        const m = getMachine(k.machine_id);
        const o = getOwner(k.owner_id);
        return (
          (k.key_id || '').toLowerCase().includes(f) ||
          (k.UID || '').toLowerCase().includes(f) ||
          (k.room_number || '').toLowerCase().includes(f) ||
          (k.room_location || '').toLowerCase().includes(f) ||
          (k.room_address || '').toLowerCase().includes(f) ||
          (m?.machine_name || '').toLowerCase().includes(f) ||
          (String(k.machine_id ?? '')).toLowerCase().includes(f) ||
          (o?.name || '').toLowerCase().includes(f) ||
          (o?.email || '').toLowerCase().includes(f)
        );
      });
    }

    // Sort
    if (sortField && sorters[sortField]) {
      arr.sort((a, b) => {
        const va = sorters[sortField](a);
        const vb = sorters[sortField](b);
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return arr;
  }, [keys, tableFilter, ownerAssignedFilter, machineAssignedFilter, sortField, sortDir, machinesById, ownersById]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortLabel = ({ field, children }) => (
    <span className="cursor-pointer select-none" onClick={() => handleSort(field)}>
      {children} {sortField === field && (sortDir === 'asc' ? '▲' : '▼')}
    </span>
  );

  // -------- RENDER --------
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <h1 className="text-3xl font-bold">Manage Keys</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-10 px-4 space-y-8">
        {/* FORM CARD */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{editMode ? 'Edit Key' : 'Add New Key'}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Key ID + UID row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium">Key ID</label>
                <input
                  type="text"
                  name="key_id"
                  value={form.key_id}
                  onChange={handleChange}
                  className="mt-1 block w-full border rounded-md p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium">UID</label>
                <input
                  type="text"
                  name="UID"
                  value={form.UID}
                  onChange={handleChange}
                  className="mt-1 block w-full border rounded-md p-2"
                  required
                />
              </div>
            </div>

            {/* Room No */}
            <div>
              <label className="block text-sm font-medium">Room No</label>
              <input
                type="text"
                name="room_number"
                value={form.room_number}
                onChange={handleChange}
                className="mt-1 block w-full border rounded-md p-2"
              />
            </div>

            {/* Room Location + Room Address */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium">Room Location</label>
                <input
                  type="text"
                  name="room_location"
                  value={form.room_location}
                  onChange={handleChange}
                  className="mt-1 block w-full border rounded-md p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">Room Address</label>
                <input
                  type="text"
                  name="room_address"
                  value={form.room_address}
                  onChange={handleChange}
                  className="mt-1 block w-full border rounded-md p-2"
                />
              </div>
            </div>

            {/* Machine + Owner row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              {/* Owner Search */}
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
            </div>

            {/* Submit buttons */}
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
                    setForm({
                      key_id: '',
                      UID: '',
                      room_number: '',
                      room_location: '',
                      room_address: '',
                      machine_id: '',
                      owner_id: ''
                    });
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

        {/* KEYS TABLE (Owner Panel–style, left-to-right order) */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold">Existing Keys</h2>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={tableFilter}
                onChange={e => setTableFilter(e.target.value)}
                placeholder="Search key_id, UID, room, owner, machine..."
                className="p-2 border rounded-md w-72"
              />

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Owner</label>
                <select
                  value={ownerAssignedFilter}
                  onChange={(e) => setOwnerAssignedFilter(e.target.value)}
                  className="p-2 border rounded-md"
                >
                  <option value="all">All</option>
                  <option value="yes">Assigned</option>
                  <option value="no">Unassigned</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Machine</label>
                <select
                  value={machineAssignedFilter}
                  onChange={(e) => setMachineAssignedFilter(e.target.value)}
                  className="p-2 border rounded-md"
                >
                  <option value="all">All</option>
                  <option value="yes">Assigned</option>
                  <option value="no">Unassigned</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded-lg">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    <SortLabel field="key_id">Key ID</SortLabel>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    <SortLabel field="UID">UID</SortLabel>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    <SortLabel field="room_number">Room No</SortLabel>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    <SortLabel field="room_location">Room Location</SortLabel>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    <SortLabel field="room_address">Room Address</SortLabel>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    <SortLabel field="machine">Machine</SortLabel>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    <SortLabel field="owner">Owner</SortLabel>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleKeys.map((k) => {
                  const m = getMachine(k.machine_id);
                  const o = getOwner(k.owner_id);
                  return (
                    <tr key={k.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 border border-gray-300">{k.key_id}</td>
                      <td className="px-4 py-3 border border-gray-300">{k.UID}</td>
                      <td className="px-4 py-3 border border-gray-300">{k.room_number || '—'}</td>
                      <td className="px-4 py-3 border border-gray-300">{k.room_location || '—'}</td>
                      <td className="px-4 py-3 border border-gray-300">{k.room_address || '—'}</td>
                      <td className="px-4 py-3 border border-gray-300">
                        {m ? `${m.machine_name} (${k.machine_id})` : (k.machine_id ?? '—')}
                      </td>
                      <td className="px-4 py-3 border border-gray-300">
                        {o ? `${o.name}${o.email ? ' • ' + o.email : ''}` : '—'}
                      </td>
                      <td className="px-4 py-3 border border-gray-300 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => handleEdit(k)}
                            className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(k.id)}
                            className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visibleKeys.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-400 py-4">
                      No keys found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

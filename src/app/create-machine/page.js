'use client'
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

export default function CreateMachinePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    machineId: '',
    machineName: '',
    location: '',
    machineAddress: '',
    capacity: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [machines, setMachines] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [editingMachineId, setEditingMachineId] = useState(null);

  // Table controls (Owner Panel–style)
  const [tableFilter, setTableFilter] = useState('');
  const [sortField, setSortField] = useState('machine_id'); // machine_id | machine_name | location | machine_address | capacity
  const [sortDir, setSortDir] = useState('asc');

  const isValidMachineId = (id) => /^[A-D0-9]{3}$/.test(id);

  useEffect(() => { fetchMachines(); }, []);

  const fetchMachines = async () => {
    const { data, error } = await supabase.from('machines').select('*');
    if (error) {
      console.error('Error fetching machines:', error);
    } else {
      setMachines(data || []);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    let { machineId, machineName, location, machineAddress, capacity } = form;
    machineId = (machineId || '').toUpperCase(); // Force uppercase before validation

    if (!isValidMachineId(machineId)) {
      setMessage('Machine ID must be 3 characters (A-D and 0-9 only).');
      setLoading(false);
      return;
    }

    let data, error;

    if (editMode) {
      ({ data, error } = await supabase
        .from('machines')
        .update({
          machine_id: machineId,
          "Machine name": machineName,
          location,
          machine_address: machineAddress,
          capacity: capacity === '' ? null : parseInt(capacity, 10)
        })
        .eq('id', editingMachineId));
    } else {
      ({ data, error } = await supabase
        .from('machines')
        .insert([{
          machine_id: machineId,
          "Machine name": machineName,
          location,
          machine_address: machineAddress,
          capacity: capacity === '' ? null : parseInt(capacity, 10)
        }]));
    }

    if (error) {
      if (error.code === '23505') {
        setMessage('Machine ID or Machine Name already exists.');
      } else {
        console.error('Error saving machine:', error);
        setMessage('Failed to save machine. Try again.');
      }
    } else {
      setMessage(editMode ? 'Machine updated successfully!' : 'Machine saved successfully!');
      setForm({ machineId: '', machineName: '', location: '', machineAddress: '', capacity: '' });
      setEditMode(false);
      setEditingMachineId(null);
      fetchMachines();
    }

    setLoading(false);
  };

  const handleEdit = (machine) => {
    setForm({
      machineId: machine.machine_id || '',
      machineName: machine["Machine name"] || '',
      location: machine.location || '',
      machineAddress: machine.machine_address || '',
      capacity: machine.capacity?.toString() || ''
    });
    setEditMode(true);
    setEditingMachineId(machine.id);
    setMessage(`Editing Machine: ${machine["Machine name"]}`);
  };

  const handleDelete = async (id) => {
    const confirmDelete = confirm('Are you sure you want to delete this machine?');
    if (!confirmDelete) return;

    const { error } = await supabase.from('machines').delete().eq('id', id);
    if (error) {
      console.error('Error deleting machine:', error);
      setMessage('Failed to delete machine.');
    } else {
      setMessage('Machine deleted successfully.');
      fetchMachines();
    }
  };

  // ---------- Table search/sort (Owner Panel style) ----------
  const sorters = {
    machine_id: (m) => (m.machine_id || '').toLowerCase(),
    machine_name: (m) => ((m["Machine name"] || '').toLowerCase()),
    location: (m) => (m.location || '').toLowerCase(),
    machine_address: (m) => (m.machine_address || '').toLowerCase(),
    capacity: (m) => Number.isFinite(m.capacity) ? m.capacity : -Infinity,
  };

  const visibleMachines = useMemo(() => {
    let arr = [...machines];

    // search
    if (tableFilter.trim()) {
      const f = tableFilter.trim().toLowerCase();
      arr = arr.filter(m =>
        (m.machine_id || '').toLowerCase().includes(f) ||
        ((m["Machine name"] || '').toLowerCase().includes(f)) ||
        (m.location || '').toLowerCase().includes(f) ||
        (m.machine_address || '').toLowerCase().includes(f) ||
        String(m.capacity ?? '').toLowerCase().includes(f)
      );
    }

    // sort
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
  }, [machines, tableFilter, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortLabel = ({ field, children }) => (
    <span className="cursor-pointer select-none" onClick={() => handleSort(field)}>
      {children} {sortField === field && (sortDir === 'asc' ? '▲' : '▼')}
    </span>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">Create Machine</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8 space-y-8">
        {/* Form */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{editMode ? 'Edit Machine' : 'Add New Machine'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Machine ID + Machine Name side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Machine ID</label>
                <input
                  type="text"
                  name="machineId"
                  value={form.machineId}
                  onChange={handleChange}
                  placeholder="Enter machine ID"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">Must be exactly 3 characters (A-D, 0-9 only).</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Machine Name</label>
                <input
                  type="text"
                  name="machineName"
                  value={form.machineName}
                  onChange={handleChange}
                  placeholder="Enter machine name"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50"
                  required
                />
              </div>
            </div>

            {/* Location + Address side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Location</label>
                <input
                  type="text"
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  placeholder="Paste location Link Here !"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Machine Address</label>
                <input
                  type="text"
                  name="machineAddress"
                  value={form.machineAddress}
                  onChange={handleChange}
                  placeholder="Exact address Street, building, floor…"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Capacity</label>
              <input
                type="number"
                name="capacity"
                value={form.capacity}
                onChange={handleChange}
                placeholder="Enter capacity"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50"
                required
              />
            </div>

            <div className="flex space-x-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center px-4 py-2 bg-green-600 border border-transparent rounded-md font-semibold text-white hover:bg-green-700 transition"
              >
                {loading ? 'Saving...' : editMode ? 'Update Machine' : 'Save Machine'}
              </button>
              {editMode && (
                <button
                  type="button"
                  onClick={() => {
                    setForm({ machineId: '', machineName: '', location: '', machineAddress: '', capacity: '' });
                    setEditMode(false);
                    setEditingMachineId(null);
                    setMessage('');
                  }}
                  className="px-4 py-2 bg-gray-400 text-white rounded-md hover:bg-gray-500"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          {message && <p className="mt-4 text-center text-sm">{message}</p>}
        </div>

        {/* Machines table (Owner Panel–style) */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold">Existing Machines</h2>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={tableFilter}
                onChange={e => setTableFilter(e.target.value)}
                placeholder="Search by ID, name, location, address, capacity…"
                className="p-2 border rounded-md w-72"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded-lg">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    <SortLabel field="machine_id">Machine ID</SortLabel>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    <SortLabel field="machine_name">Machine Name</SortLabel>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    <SortLabel field="location">Location</SortLabel>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    <SortLabel field="machine_address">Machine Address</SortLabel>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    <SortLabel field="capacity">Capacity</SortLabel>
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleMachines.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 border border-gray-300">{m.machine_id}</td>
                    <td className="px-4 py-3 border border-gray-300">{m["Machine name"]}</td>
                    <td className="px-4 py-3 border border-gray-300">{m.location}</td>
                    <td className="px-4 py-3 border border-gray-300">{m.machine_address || ''}</td>
                    <td className="px-4 py-3 border border-gray-300">{m.capacity}</td>
                    <td className="px-4 py-3 border border-gray-300 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => handleEdit(m)}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleMachines.length === 0 && (
                  <tr>
                    <td className="px-6 py-4 text-sm text-gray-500" colSpan={6}>No machines found.</td>
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

'use client'
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

export default function CreateMachinePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    machineId: '',
    machineName: '',
    location: '',
    capacity: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [machines, setMachines] = useState([]);

  // Fetch all machines
  useEffect(() => {
    fetchMachines();
  }, []);

  const fetchMachines = async () => {
    const { data, error } = await supabase.from('machines').select('*');
    if (error) {
      console.error('Error fetching machines:', error);
    } else {
      setMachines(data);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { machineId, machineName, location, capacity } = form;

    // Insert into Supabase
    const { data, error } = await supabase
      .from('machines')
      .insert([{ 
        machine_id: machineId, 
        "Machine name": machineName,  // column has space!
        location, 
        capacity: parseInt(capacity)
      }]);

    if (error) {
      if (error.code === '23505') { // Unique violation
        setMessage('⚠️ Machine ID or Machine Name already exists.');
      } else {
        console.error('Error inserting machine:', error);
        setMessage('❌ Failed to save machine. Try again.');
      }
    } else {
      console.log('Machine inserted:', data);
      setMessage('✅ Machine saved successfully!');
      setForm({ machineId: '', machineName: '', location: '', capacity: '' });
      fetchMachines(); // Refresh table
    }

    setLoading(false);
  };

  const handleEdit = (machine) => {
    alert(`Edit feature coming soon for: ${machine["Machine name"]}`);
  };

  const handleDelete = async (id) => {
    const confirmDelete = confirm('Are you sure you want to delete this machine?');
    if (!confirmDelete) return;

    const { error } = await supabase.from('machines').delete().eq('id', id);
    if (error) {
      console.error('Error deleting machine:', error);
      setMessage('❌ Failed to delete machine.');
    } else {
      setMessage('✅ Machine deleted successfully.');
      fetchMachines(); // Refresh table
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">🏭 Create Machine</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8 space-y-8">
        {/* Form */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Add New Machine</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <div>
              <label className="block text-sm font-medium text-gray-700">Location</label>
              <input
                type="text"
                name="location"
                value={form.location}
                onChange={handleChange}
                placeholder="Enter location"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50"
                required
              />
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
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-4 py-2 bg-green-600 border border-transparent rounded-md font-semibold text-white hover:bg-green-700 transition"
            >
              {loading ? 'Saving...' : 'Save Machine'}
            </button>
          </form>
          {message && <p className="mt-4 text-center text-sm">{message}</p>}
        </div>

        {/* Table */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">📋 Existing Machines</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 rounded-lg shadow">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Machine ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Machine Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capacity</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {machines.map((machine) => (
                  <tr key={machine.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{machine.machine_id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{machine["Machine name"]}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{machine.location}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{machine.capacity}</td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm space-x-1 w-28">
                      <button
                        onClick={() => handleEdit(machine)}
                        className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(machine.id)}
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
        </div>
      </main>
    </div>
  );
}

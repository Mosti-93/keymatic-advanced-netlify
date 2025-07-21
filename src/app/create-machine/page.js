'use client'
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient"; // 👈 import Supabase client

export default function CreateMachinePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    machineId: '',
    name: '',
    location: '',
    capacity: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [machines, setMachines] = useState([]);

  // 👇 Fetch machines from Supabase
  const fetchMachines = async () => {
    const { data, error } = await supabase.from('machines').select('*');
    if (error) {
      console.error('Error fetching machines:', error);
    } else {
      setMachines(data);
    }
  };

  useEffect(() => {
    fetchMachines();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { machineId, name, location, capacity } = form;

    // 👇 Insert into Supabase
    const { error } = await supabase
      .from('machines') // 👈 your table name
      .insert([{ 
        machine_id: machineId, 
        name, 
        location, 
        capacity: parseInt(capacity) 
      }]);

    if (error) {
      console.error('Error inserting machine:', error);
      setMessage('❌ Failed to save machine. Try again.');
    } else {
      setMessage('✅ Machine saved successfully!');
      setForm({ machineId: '', name: '', location: '', capacity: '' }); // Clear form
      fetchMachines(); // 👈 Refresh table
    }

    setLoading(false);
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
              <input type="text" name="machineId" value={form.machineId} onChange={handleChange} placeholder="Enter machine ID" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Machine Name</label>
              <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Enter machine name" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Location</label>
              <input type="text" name="location" value={form.location} onChange={handleChange} placeholder="Enter location" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Capacity</label>
              <input type="number" name="capacity" value={form.capacity} onChange={handleChange} placeholder="Enter capacity" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50" required />
            </div>
            <button type="submit" disabled={loading} className="inline-flex items-center px-4 py-2 bg-green-600 border border-transparent rounded-md font-semibold text-white hover:bg-green-700 transition">
              {loading ? 'Saving...' : 'Save Machine'}
            </button>
          </form>
          {message && <p className="mt-4 text-center text-sm">{message}</p>}
        </div>

        {/* Existing Machines Table */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">📋 Existing Machines</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded-lg">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">MACHINE ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">NAME</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">LOCATION</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">CAPACITY</th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 border border-gray-300">{m.machine_id}</td>
                    <td className="px-6 py-4 border border-gray-300">{m.name}</td>
                    <td className="px-6 py-4 border border-gray-300">{m.location}</td>
                    <td className="px-6 py-4 border border-gray-300">{m.capacity}</td>
                  </tr>
                ))}
                {machines.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-6 py-4 text-center text-gray-500">No machines found</td>
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

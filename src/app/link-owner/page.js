'use client'
import { useState } from "react";

const dummyOwners = [
  { email: 'john@example.com', name: 'John Doe', phone: '123456789', city: 'Cairo', country: 'Egypt', keys: ['K1 - ABCD1234', 'K2 - EFGH5678'] },
  { email: 'jane@example.com', name: 'Jane Smith', phone: '987654321', city: 'Alexandria', country: 'Egypt', keys: ['K3 - IJKL9101'] }
];

const dummyMachines = [
  { id: 'M1', name: 'Main Locker', location: 'Cairo' },
  { id: 'M2', name: 'Secondary Locker', location: 'Alexandria' },
  { id: 'M3', name: 'Backup Locker', location: 'Giza' }
];

const linkedKeys = [
  { owner: 'John Doe', key: 'K1 - ABCD1234', machine: 'M1 - Main Locker', location: 'Cairo' },
  { owner: 'Jane Smith', key: 'K3 - IJKL9101', machine: 'M2 - Secondary Locker', location: 'Alexandria' }
];

export default function LinkOwnerPage() {
  const [ownerEmail, setOwnerEmail] = useState('');
  const [foundOwner, setFoundOwner] = useState(null);
  const [keyMachineMap, setKeyMachineMap] = useState({});

  const handleEmailSearch = () => {
    const owner = dummyOwners.find(o => o.email.toLowerCase() === ownerEmail.toLowerCase());
    if (owner) {
      const map = {};
      owner.keys.forEach(k => map[k] = '');
      setKeyMachineMap(map);
    }
    setFoundOwner(owner || { notFound: true });
  };

  const handleKeySelect = (key, machineId) => {
    setKeyMachineMap(prev => ({ ...prev, [key]: machineId }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Saved Links:', keyMachineMap);
    // TODO: Send to backend API
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">🔗 Link Owner</h1>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8 space-y-8">
        {/* Search */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Search Owner by Email</h2>
          <div className="flex space-x-2 mb-6">
            <input
              type="email"
              placeholder="Enter owner email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="flex-1 block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <button type="button" onClick={handleEmailSearch} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">Search</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white border border-gray-200 rounded p-4 shadow-sm space-y-2">
              <label className="block text-sm font-medium text-gray-700">🔑 Select Key</label>
              <select
                onChange={(e) => handleKeySelect(e.target.value, '')}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                value=""
              >
                <option value="">-- Select Key --</option>
                {foundOwner && !foundOwner.notFound && foundOwner.keys.map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>

              <label className="block text-sm font-medium text-gray-700 mt-2">🏭 Assign to Machine</label>
              <select
                onChange={(e) => handleKeySelect(e.target.value, e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50"
                value=""
              >
                <option value="">-- Select Machine --</option>
                {dummyMachines.map(m => (
                  <option key={m.id} value={m.id}>{m.id} - {m.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition">Save Links</button>
          </form>
        </div>

        {/* Linked Keys Table */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">📋 Linked Keys</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded-lg">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">OWNER</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">KEY</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">MACHINE</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">LOCATION</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">EDIT</th>
                </tr>
              </thead>
              <tbody>
                {linkedKeys.map((link, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 border border-gray-300">{link.owner}</td>
                    <td className="px-6 py-4 border border-gray-300">{link.key}</td>
                    <td className="px-6 py-4 border border-gray-300">{link.machine}</td>
                    <td className="px-6 py-4 border border-gray-300">{link.location}</td>
                    <td className="px-6 py-4 border border-gray-300 text-purple-600 hover:underline cursor-pointer">Edit</td>
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

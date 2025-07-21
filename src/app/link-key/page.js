'use client'
import { useState } from "react";

const dummyMachines = [
  { id: 'M1', name: 'Main Locker', location: 'Cairo', capacity: 20 },
  { id: 'M2', name: 'Secondary Locker', location: 'Alexandria', capacity: 10 }
];

const dummyKeys = [
  { id: 'K1', uid: 'ABCD1234', room: '101', owner: 'John Doe' },
  { id: 'K2', uid: 'EFGH5678', room: '102', owner: 'Jane Smith' }
];

export default function LinkKeyPage() {
  const [selectedMachine, setSelectedMachine] = useState<{ name: string; email: string; phone: string; roomNo: string; } | null>(null);
  const [selectedKey, setSelectedKey] = useState<{ name: string; email: string; phone: string; roomNo: string; } | null>(null);

  const handleMachineChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const machine = dummyMachines.find(m => m.id === e.target.value);
    machine ? setSelectedMachine(machine) : setSelectedMachine(null);
  };

  const handleKeyChange = (e) => {
    const key = dummyKeys.find(k => k.id === e.target.value);
    setSelectedKey(key);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Link submitted:', { machine: selectedMachine, key: selectedKey });
    // TODO: Send to backend API
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">🔗 Link Key</h1>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8 space-y-8">
        {/* Link Key Form */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Link Key to Machine</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Key Dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Select Key</label>
              <select onChange={handleKeyChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50">
                <option value="">-- Select Key --</option>
                {dummyKeys.map((k) => (
                  <option key={k.id} value={k.id}>{k.id} - {k.uid}</option>
                ))}
              </select>
              {selectedKey && (
                <div className="mt-2 text-sm text-gray-600">
                  🆔 <strong>UID:</strong> {selectedKey.uid}<br />
                  🚪 <strong>Room:</strong> {selectedKey.room}<br />
                  👤 <strong>Owner:</strong> {selectedKey.owner}
                </div>
              )}
            </div>

            {/* Machine Dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Select Machine</label>
              <select onChange={handleMachineChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50">
                <option value="">-- Select Machine --</option>
                {dummyMachines.map((m) => (
                  <option key={m.id} value={m.id}>{m.id} - {m.name}</option>
                ))}
              </select>
              {selectedMachine && (
                <div className="mt-2 text-sm text-gray-600">
                  📦 <strong>Name:</strong> {selectedMachine.name}<br />
                  📍 <strong>Location:</strong> {selectedMachine.location}<br />
                  🛠 <strong>Capacity:</strong> {selectedMachine.capacity}
                </div>
              )}
            </div>

            <button type="submit" className="inline-flex items-center px-4 py-2 bg-yellow-500 border border-transparent rounded-md font-semibold text-white hover:bg-yellow-600 transition">Link Key</button>
          </form>
        </div>

        {/* Linked Keys Table */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">📋 Linked Keys</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded-lg">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">KEY</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">ROOM NO</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">MACHINE</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">LOCATION</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">OWNER</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">EDIT</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 border border-gray-300">K1 - ABCD1234</td>
                  <td className="px-6 py-4 border border-gray-300">101</td>
                  <td className="px-6 py-4 border border-gray-300">M1 - Main Locker</td>
                  <td className="px-6 py-4 border border-gray-300">Cairo</td>
                  <td className="px-6 py-4 border border-gray-300">John Doe</td>
                  <td className="px-6 py-4 border border-gray-300 text-yellow-600 hover:underline cursor-pointer">Edit</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

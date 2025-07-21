'use client';
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const dummyClients = [
  { name: 'Alice Brown', email: 'alice@example.com', phone: '111-222-333', roomNo: '201', checkIn: '2025-07-20', checkOut: '2025-07-25' },
  { name: 'Bob White', email: 'bob@example.com', phone: '444-555-666', roomNo: '202', checkIn: '2025-07-15', checkOut: '2025-07-18' },
  { name: 'Charlie Green', email: 'charlie@example.com', phone: '777-888-999', roomNo: '203', checkIn: '2025-07-10', checkOut: '2025-07-12' }
];

export default function CreateClientPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', roomNo: '', checkIn: '', checkOut: ''
  });
  const [filter, setFilter] = useState('current'); // current | coming | past

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/");
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Client Created:', form);
    // TODO: Send data to backend API
  };

  const filterClients = () => {
    const today = new Date().toISOString().split('T')[0];
    return dummyClients.filter(client => {
      if (filter === 'current') return client.checkIn <= today && client.checkOut >= today;
      if (filter === 'coming') return client.checkIn > today;
      if (filter === 'past') return client.checkOut < today;
      return true;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow flex items-center px-6 py-4 relative">
        <h1 className="absolute left-1/2 transform -translate-x-1/2 text-3xl font-bold text-gray-900">Owner Panel</h1>
        <div className="ml-auto">
          <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition">Logout</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8 space-y-8">
        {/* Form */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Add New Client</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {["name", "email", "phone", "roomNo", "checkIn", "checkOut"].map((field, idx) => (
              <div key={idx}>
                <label className="block text-sm font-medium text-gray-700">
                  {field === "roomNo" ? "Room No" : field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                </label>
                <input
                  type={field.includes("Date") ? "date" : "text"}
                  name={field}
                  value={form[field]}
                  onChange={handleChange}
                  placeholder={`Enter ${field}`}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
              </div>
            ))}
            <div className="md:col-span-2">
              <button type="submit" className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition">Save Client</button>
            </div>
          </form>
        </div>

        {/* Clients Table */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold flex items-center">📋 Existing Clients</h2>
            <div className="space-x-2">
              {["current", "coming", "past"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded-lg">
              <thead className="bg-gray-100">
                <tr>
                  {["NAME", "EMAIL", "PHONE", "ROOM", "CHECK-IN", "CHECK-OUT", "EDIT"].map((col, i) => (
                    <th key={i} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filterClients().map((client, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 border border-gray-300">{client.name}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.email}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.phone}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.roomNo}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.checkIn}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.checkOut}</td>
                    <td className="px-6 py-4 border border-gray-300 text-green-600 hover:underline cursor-pointer">Edit</td>
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

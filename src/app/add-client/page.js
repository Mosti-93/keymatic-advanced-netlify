'use client';
import { useState } from "react";

const dummyClients = [
  { name: 'Alice Brown', email: 'alice@example.com', phone: '111-222-333', roomNo: '201', checkIn: '2025-07-20', checkOut: '2025-07-25' },
  { name: 'Bob White', email: 'bob@example.com', phone: '444-555-666', roomNo: '202', checkIn: '2025-07-15', checkOut: '2025-07-18' },
  { name: 'Charlie Green', email: 'charlie@example.com', phone: '777-888-999', roomNo: '203', checkIn: '2025-07-10', checkOut: '2025-07-12' }
];

const dummyOwners = [
  { name: "Mostafa Els", email: "mostafa@example.com", phone: "123-456-7890", roomNo: "101" },
  { name: "Ahmed Ali", email: "ahmed@example.com", phone: "987-654-3210", roomNo: "102" },
  { name: "John Doe", email: "john@example.com", phone: "555-555-5555", roomNo: "103" }
];

export default function AddClientPage() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', roomNo: '', checkIn: '', checkOut: ''
  });
  const [filter, setFilter] = useState('current');
  const [ownerSearch, setOwnerSearch] = useState('');
  const [filteredOwners, setFilteredOwners] = useState([]);
  const [selectedOwner, setSelectedOwner] = useState(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Client Created:', form, 'Linked Owner:', selectedOwner);
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
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">Add Client</h1>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8 space-y-8">
        {/* Add Client Form */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Add New Client</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Client Name</label>
              <input type="text" name="name" value={form.name} onChange={handleChange} placeholder="Enter client name" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="Enter email" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone No</label>
              <input type="text" name="phone" value={form.phone} onChange={handleChange} placeholder="Enter phone number" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Room No</label>
              <input type="text" name="roomNo" value={form.roomNo} onChange={handleChange} placeholder="Enter room number" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Check-In Date</label>
              <input type="date" name="checkIn" value={form.checkIn} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Check-Out Date</label>
              <input type="date" name="checkOut" value={form.checkOut} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
            </div>

            {/* Owner Search Field */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Link to Owner (Search by Email)</label>
              <input
                type="text"
                value={ownerSearch}
                onChange={(e) => {
                  setOwnerSearch(e.target.value);
                  const matches = dummyOwners.filter(owner =>
                    owner.email.toLowerCase().includes(e.target.value.toLowerCase())
                  );
                  setFilteredOwners(matches);
                }}
                placeholder="Type owner's email"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              {filteredOwners.length > 0 && (
                <ul className="mt-2 bg-white border border-gray-300 rounded-md shadow max-h-40 overflow-y-auto">
                  {filteredOwners.map((owner, idx) => (
                    <li
                      key={idx}
                      onClick={() => {
                        setSelectedOwner(owner);
                        setOwnerSearch(owner.email);
                        setFilteredOwners([]);
                      }}
                      className="p-2 hover:bg-blue-100 cursor-pointer"
                    >
                      {owner.email}
                    </li>
                  ))}
                </ul>
              )}
              {selectedOwner && (
                <div className="mt-3 p-4 bg-gray-100 rounded-md shadow">
                  <h3 className="text-lg font-semibold">{selectedOwner.name}</h3>
                  <p>Email: {selectedOwner.email}</p>
                  <p>Phone: {selectedOwner.phone}</p>
                  <p>Room No: {selectedOwner.roomNo}</p>
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <button type="submit" className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition">Save Client</button>
            </div>
          </form>
        </div>

        {/* Existing Clients Table */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold flex items-center">Existing Clients</h2>
            <div className="space-x-2">
              <button onClick={() => setFilter('current')} className={`px-3 py-1 rounded ${filter === 'current' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Current</button>
              <button onClick={() => setFilter('coming')} className={`px-3 py-1 rounded ${filter === 'coming' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Coming</button>
              <button onClick={() => setFilter('past')} className={`px-3 py-1 rounded ${filter === 'past' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>Past</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded-lg">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">NAME</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">EMAIL</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">PHONE</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">ROOM</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">CHECK-IN</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">CHECK-OUT</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300">EDIT</th>
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

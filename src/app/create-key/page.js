'use client';
export const dynamic = 'force-dynamic';

import { useState } from "react";

export default function CreateKeyPage() {
  const [form, setForm] = useState({
    keyId: '', uid: '', roomNo: '', machine: '', owner: ''
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form submitted:', form);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-800">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto py-4 px-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            🔑 Create Key
          </h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto py-12 px-6 space-y-10">
        {/* Create Key Form */}
        <section className="bg-white rounded-2xl shadow-md p-8">
          <h2 className="text-2xl font-semibold mb-6 text-gray-800">Add New Key</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {["keyId", "uid", "roomNo", "machine", "owner"].map((field) => (
              <div key={field} className="flex flex-col">
                <label className="text-sm font-medium text-gray-600 mb-1 capitalize">
                  {field}
                </label>
                <input
                  type="text"
                  name={field}
                  value={form[field]}
                  onChange={handleChange}
                  placeholder={`Enter ${field}`}
                  className="px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-700"
                />
              </div>
            ))}
            <div className="md:col-span-2">
              <button
                type="submit"
                className="w-full py-3 px-6 bg-blue-600 text-white rounded-lg font-semibold shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Save Key
              </button>
            </div>
          </form>
        </section>

        {/* Existing Keys Table */}
        <section className="bg-white rounded-2xl shadow-md p-8">
          <h2 className="text-2xl font-semibold mb-6 text-gray-800 flex items-center gap-2">
            📋 Existing Keys
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border rounded-lg overflow-hidden">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  {["Key ID", "UID", "Room No", "Machine", "Owner", "Edit"].map((head) => (
                    <th key={head} className="px-5 py-3 text-left text-sm font-medium border-b border-gray-300">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-gray-50 transition">
                  <td className="px-5 py-3 border-b border-gray-200">1</td>
                  <td className="px-5 py-3 border-b border-gray-200">ABCD1234</td>
                  <td className="px-5 py-3 border-b border-gray-200">101</td>
                  <td className="px-5 py-3 border-b border-gray-200">Machine 1</td>
                  <td className="px-5 py-3 border-b border-gray-200">John Doe</td>
                  <td className="px-5 py-3 border-b border-gray-200">
                    <button className="text-blue-600 hover:underline">Edit</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

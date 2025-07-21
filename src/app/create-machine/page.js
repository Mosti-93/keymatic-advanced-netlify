'use client';
import { useState } from "react";

export default function CreateMachinePage() {
  const [form, setForm] = useState({ machineId: '', name: '', location: '', capacity: '' });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Form submitted:', form);
    // TODO: Send to backend API
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">🏭 Create Machine</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-10 sm:px-6 lg:px-8 space-y-8">
        {/* Create Machine Form */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Add New Machine</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: "Machine ID", name: "machineId", type: "text", placeholder: "Enter machine ID" },
              { label: "Machine Name", name: "name", type: "text", placeholder: "Enter machine name" },
              { label: "Location", name: "location", type: "text", placeholder: "Enter location" },
              { label: "Capacity", name: "capacity", type: "number", placeholder: "Enter capacity" }
            ].map((field, idx) => (
              <div key={idx}>
                <label className="block text-sm font-medium text-gray-700">{field.label}</label>
                <input
                  type={field.type}
                  name={field.name}
                  value={form[field.name]}
                  onChange={handleChange}
                  placeholder={field.placeholder}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring focus:ring-green-200 focus:ring-opacity-50"
                />
              </div>
            ))}
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 bg-green-600 border border-transparent rounded-md font-semibold text-white hover:bg-green-700 transition"
            >
              Save Machine
            </button>
          </form>
        </div>

        {/* Existing Machines Table */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">📋 Existing Machines</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded-lg">
              <thead className="bg-gray-100">
                <tr>
                  {["MACHINE ID", "NAME", "LOCATION", "CAPACITY", "EDIT"].map((col, i) => (
                    <th
                      key={i}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase border border-gray-300"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 border border-gray-300">1</td>
                  <td className="px-6 py-4 border border-gray-300">Machine A</td>
                  <td className="px-6 py-4 border border-gray-300">Main Hall</td>
                  <td className="px-6 py-4 border border-gray-300">50</td>
                  <td className="px-6 py-4 border border-gray-300 text-green-600 hover:underline cursor-pointer">Edit</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

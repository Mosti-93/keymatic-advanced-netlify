'use client';
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function AddClientPage() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', roomNo: '', checkIn: '', checkOut: ''
  });
  const [clients, setClients] = useState([]);
  const [owners, setOwners] = useState([]);
  const [filteredOwners, setFilteredOwners] = useState([]);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [filter, setFilter] = useState('current');
  const [message, setMessage] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchClients();
    fetchOwners();
  }, []);

  const fetchClients = async () => {
    const { data, error } = await supabase.from('clients').select('*').order('inserted_at', { ascending: false });
    if (!error) setClients(data);
  };

  const fetchOwners = async () => {
    const { data, error } = await supabase.from('owners').select('id, full_name, email, phone, room_no');
    if (!error) setOwners(data);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    const { name, email, phone, roomNo, checkIn, checkOut } = form;
    const owner_id = selectedOwner?.id || null;

    let result;
    if (editMode) {
      result = await supabase.from('clients').update({
        name,
        email,
        phone,
        room_no: roomNo,
        check_in: checkIn,
        check_out: checkOut,
        owner_id
      }).eq('id', editingId);
    } else {
      result = await supabase.from('clients').insert([{
        name,
        email,
        phone,
        room_no: roomNo,
        check_in: checkIn,
        check_out: checkOut,
        owner_id
      }]);
    }

    const { error } = result;
    if (error) {
      if (error.message.includes('unique_client_email')) {
        setMessage('⚠️ Email is already used.');
      } else if (error.message.includes('unique_client_phone')) {
        setMessage('⚠️ Phone number is already used.');
      } else {
        setMessage(`❌ ${error.message}`);
      }
    } else {
      setMessage(editMode ? '✅ Client updated.' : '✅ Client saved!');
      setForm({ name: '', email: '', phone: '', roomNo: '', checkIn: '', checkOut: '' });
      setSelectedOwner(null);
      setOwnerSearch('');
      setEditMode(false);
      setEditingId(null);
      fetchClients();
    }
  };

  const handleEdit = (client) => {
    setForm({
      name: client.name,
      email: client.email,
      phone: client.phone,
      roomNo: client.room_no,
      checkIn: client.check_in,
      checkOut: client.check_out
    });
    setSelectedOwner(owners.find(o => o.id === client.owner_id) || null);
    setOwnerSearch(client.owner?.email || '');
    setEditMode(true);
    setEditingId(client.id);
    setMessage(`✏️ Editing client: ${client.name}`);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this client?')) return;
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (!error) {
      setMessage('✅ Client deleted.');
      fetchClients();
    }
  };

  const filterClients = () => {
    const today = new Date().toISOString().split('T')[0];
    return clients.filter(client => {
      if (filter === 'current') return client.check_in <= today && client.check_out >= today;
      if (filter === 'coming') return client.check_in > today;
      if (filter === 'past') return client.check_out < today;
      return true;
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <h1 className="text-3xl font-bold">Add Client</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-10 px-4 space-y-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{editMode ? 'Edit Client' : 'Add New Client'}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: "Client Name", name: "name", type: "text" },
              { label: "Email", name: "email", type: "email" },
              { label: "Phone No", name: "phone", type: "text" },
              { label: "Room No", name: "roomNo", type: "text" },
              { label: "Check-In Date", name: "checkIn", type: "date" },
              { label: "Check-Out Date", name: "checkOut", type: "date" }
            ].map(({ label, name, type }) => (
              <div key={name}>
                <label className="block text-sm font-medium text-gray-700">{label}</label>
                <input
                  type={type}
                  name={name}
                  value={form[name]}
                  onChange={handleChange}
                  required={name === "name"}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-200 focus:ring-opacity-50"
                />
              </div>
            ))}

            {/* Owner Search */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Link to Owner (Search by Email)</label>
              <input
                type="text"
                value={ownerSearch}
                onChange={(e) => {
                  setOwnerSearch(e.target.value);
                  const matches = owners.filter(owner =>
                    owner.email.toLowerCase().includes(e.target.value.toLowerCase())
                  );
                  setFilteredOwners(matches);
                }}
                placeholder="Type owner's email"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
              {filteredOwners.length > 0 && (
                <ul className="mt-2 bg-white border border-gray-300 rounded-md shadow max-h-40 overflow-y-auto">
                  {filteredOwners.map((owner) => (
                    <li
                      key={owner.id}
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
                  <h3 className="text-lg font-semibold">{selectedOwner.full_name}</h3>
                  <p>Email: {selectedOwner.email}</p>
                  <p>Phone: {selectedOwner.phone}</p>
                  <p>Room No: {selectedOwner.room_no}</p>
                </div>
              )}
            </div>

            <div className="md:col-span-2 flex gap-3">
              <button
                type="submit"
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition"
              >
                {editMode ? 'Update Client' : 'Save Client'}
              </button>
              {editMode && (
                <button
                  type="button"
                  onClick={() => {
                    setForm({ name: '', email: '', phone: '', roomNo: '', checkIn: '', checkOut: '' });
                    setEditMode(false);
                    setEditingId(null);
                    setSelectedOwner(null);
                    setOwnerSearch('');
                    setMessage('');
                  }}
                  className="w-full px-4 py-2 bg-gray-400 text-white rounded-md hover:bg-gray-500 transition"
                >
                  Cancel
                </button>
              )}
            </div>
            {message && <p className="mt-4 text-center text-sm col-span-2">{message}</p>}
          </form>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">📋 Existing Clients</h2>
            <div className="space-x-2">
              {["current", "coming", "past"].map((key) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1 rounded ${filter === key ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                >
                  {key[0].toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded-lg">
              <thead className="bg-gray-100">
                <tr>
                  {["NAME", "EMAIL", "PHONE", "ROOM", "CHECK-IN", "CHECK-OUT", "ACTIONS"].map((col) => (
                    <th
                      key={col}
                      className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 ${col === "ACTIONS" ? "text-right" : "text-left"}`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filterClients().map((client, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 border border-gray-300">{client.name}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.email}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.phone}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.room_no}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.check_in}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.check_out}</td>
                    <td className="px-6 py-4 border border-gray-300 text-right space-x-2">
                      <button
                        onClick={() => handleEdit(client)}
                        className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(client.id)}
                        className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
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

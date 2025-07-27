'use client';
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

export default function OwnerPanelPage() {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState(null);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', keyId: '', checkIn: '', checkOut: ''
  });
  const [clients, setClients] = useState([]);
  const [keys, setKeys] = useState([]);
  const [filter, setFilter] = useState('current');
  const [message, setMessage] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Get owner from login
  useEffect(() => {
    const fetchOwner = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push("/");
      const { data: profile, error } = await supabase
        .from("users")
        .select("id, role, name, email")
        .eq("id", user.id)
        .single();
      if (error || profile?.role !== "owner") return router.push("/");
      setOwnerId(profile.id);
    };
    fetchOwner();
  }, []);

  // Fetch data after ownerId is ready
  useEffect(() => {
    if (ownerId) {
      fetchClients();
      fetchKeys();
    }
  }, [ownerId]);

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('*').eq('owner_id', ownerId);
    setClients(data || []);
  };

  const fetchKeys = async () => {
    const { data } = await supabase.from('keys').select('uuid, room_number, owner_id, UID').eq('owner_id', ownerId);
    setKeys(data || []);
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    const { firstName, lastName, email, phone, keyId, checkIn, checkOut } = form;

    let result;
    if (editMode) {
      result = await supabase.from('clients').update({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        key_id: keyId,
        check_in: checkIn,
        check_out: checkOut,
        owner_id: ownerId
      }).eq('id', editingId);
    } else {
      result = await supabase.from('clients').insert([{
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        key_id: keyId,
        check_in: checkIn,
        check_out: checkOut,
        owner_id: ownerId
      }]);
    }

    const { error } = result;
    if (error) {
      if (error.message.includes('unique_client_email')) setMessage('⚠️ Email is already used.');
      else if (error.message.includes('unique_client_phone')) setMessage('⚠️ Phone number is already used.');
      else setMessage(`❌ ${error.message}`);
    } else {
      setMessage(editMode ? '✅ Client updated.' : '✅ Client saved!');
      setForm({ firstName: '', lastName: '', email: '', phone: '', keyId: '', checkIn: '', checkOut: '' });
      setEditMode(false);
      setEditingId(null);
      fetchClients();
    }
  };

  const handleEdit = (client) => {
    setForm({
      firstName: client.first_name || '',
      lastName: client.last_name || '',
      email: client.email,
      phone: client.phone,
      keyId: client.key_id || '',
      checkIn: client.check_in,
      checkOut: client.check_out
    });
    setEditMode(true);
    setEditingId(client.id);
    setMessage(`✏️ Editing ${client.first_name} ${client.last_name}`);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this client?')) return;
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (!error) {
      setMessage('✅ Client deleted.');
      fetchClients();
    }
  };

  // Add Start Pickup handler here
  const handleStartPickup = (client) => {
    alert(`Start pickup for ${client.first_name || client.name} (${client.email})`);
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

  const getKeyInfo = (client) => {
    const key = keys.find(k => k.uuid === client.key_id);
    return key ? `${key.room_number} (UID: ${key.UID || key.uuid})` : '';
  };

  if (!ownerId) return <div className="p-10 text-center text-gray-500">Loading owner data...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <h1 className="text-3xl font-bold">Owner Panel</h1>
        </div>
      </header>
      <main className="max-w-7xl mx-auto py-10 px-4 space-y-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">{editMode ? 'Edit Client' : 'Add New Client'}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">First Name</label>
              <input
                type="text"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Last Name</label>
              <input
                type="text"
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone No</label>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
            {/* Key Dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Room No / Key</label>
              <select
                name="keyId"
                value={form.keyId}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                required
              >
                <option value="">Select key for owner</option>
                {keys.map((k) => (
                  <option key={k.uuid} value={k.uuid}>
                    {k.room_number} (UID: {k.UID || k.uuid})
                  </option>
                ))}
              </select>
            </div>
            {/* Check-in/Check-out SIDE BY SIDE */}
            <div className="flex gap-2 col-span-1 md:col-span-2">
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700">Check-In Date</label>
                <input
                  type="date"
                  name="checkIn"
                  value={form.checkIn}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                />
              </div>
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700">Check-Out Date</label>
                <input
                  type="date"
                  name="checkOut"
                  value={form.checkOut}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                />
              </div>
            </div>
            {/* Buttons */}
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
                    setForm({ firstName: '', lastName: '', email: '', phone: '', keyId: '', checkIn: '', checkOut: '' });
                    setEditMode(false);
                    setEditingId(null);
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
        {/* Clients Table */}
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
                  {["FIRST NAME", "LAST NAME", "EMAIL", "PHONE", "ROOM / UID", "CHECK-IN", "CHECK-OUT", "ACTIONS"].map((col) => (
                    <th
                      key={col}
                      className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 ${col === "ACTIONS" ? "text-right" : "text-left"}`}
                    >
                      {col}
                    </th>
                  ))}
                  {/* Add Start Pickup header */}
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-right">
                    Start Pickup
                  </th>
                </tr>
              </thead>
              <tbody>
                {filterClients().map((client, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 border border-gray-300">{client.first_name}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.last_name}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.email}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.phone}</td>
                    <td className="px-6 py-4 border border-gray-300">{getKeyInfo(client)}</td>
                    <td className="px-6 py-4 border border-gray-300 w-40">{client.check_in}</td>
                    <td className="px-6 py-4 border border-gray-300 w-40">{client.check_out}</td>
                    <td className="px-6 py-4 border border-gray-300">
                      <div className="flex flex-row gap-2 justify-end">
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
                      </div>
                    </td>
                    {/* Add Start Pickup button */}
                    <td className="px-6 py-4 border border-gray-300 text-right">
                      {(['current', 'coming'].includes(filter)) && (
                        <button
                          onClick={() => handleStartPickup(client)}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md text-white bg-teal-600 hover:bg-teal-700"
                        >
                          Start Pickup
                        </button>
                      )}
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

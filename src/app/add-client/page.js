'use client';
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";

export default function AddClientPage() {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', keyId: '', checkIn: '', checkOut: ''
  });
  const [clients, setClients] = useState([]);
  const [keys, setKeys] = useState([]);
  const [owners, setOwners] = useState([]);
  const [filteredOwners, setFilteredOwners] = useState([]);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [filter, setFilter] = useState('current');
  const [message, setMessage] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [tableFilter, setTableFilter] = useState('');
  const [sortField, setSortField] = useState('check_in');
  const [sortDir, setSortDir] = useState('asc');
  const [slotPresence, setSlotPresence] = useState([]); // NEW

  useEffect(() => {
    fetchClients();
    fetchKeys();
    fetchOwners();
    fetchSlotPresence(); // NEW
  }, []);

  const fetchClients = async () => {
    const { data, error } = await supabase.from('clients').select('*');
    if (!error) setClients(data);
  };

  // includes slot_number now
  const fetchKeys = async () => {
    const { data, error } = await supabase
      .from('keys')
      .select('uuid, room_number, owner_id, UID, machine_id, slot_number');
    if (!error) setKeys(data || []);
  };

  const fetchOwners = async () => {
    const { data, error } = await supabase.from('users')
      .select('id, name, email, phone')
      .eq('role', 'owner');
    if (!error) setOwners(data || []);
  };

  const fetchSlotPresence = async () => { // NEW
    const { data } = await supabase
      .from('key_slot_presence')
      .select('machine_id, slot_number, UID');
    setSlotPresence(data || []);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "checkOut" && value) {
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
      setForm((prev) => ({
        ...prev,
        [name]: isDateOnly ? `${value}T11:00:00` : value,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    const { firstName, lastName, email, phone, keyId, checkIn, checkOut } = form;
    const owner_id = selectedOwner?.id || null;

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
        owner_id
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
      setForm({ firstName: '', lastName: '', email: '', phone: '', keyId: '', checkIn: '', checkOut: '' });
      setSelectedOwner(null);
      setOwnerSearch('');
      setEditMode(false);
      setEditingId(null);
      fetchClients();
    }
  };

  const handleEdit = (client) => {
    let firstName = client.first_name || '';
    let lastName = client.last_name || '';
    if ((!firstName || !lastName) && client.name) {
      const nameParts = client.name.trim().split(' ');
      firstName = nameParts[0] || '';
      lastName = nameParts.slice(1).join(' ') || '';
    }
    setForm({
      firstName,
      lastName,
      email: client.email,
      phone: client.phone,
      keyId: client.key_id || '',
      checkIn: client.check_in,
      checkOut: client.check_out
    });
    const owner = owners.find(o => o.id === client.owner_id) || null;
    setSelectedOwner(owner);
    setOwnerSearch(owner?.email || '');
    setEditMode(true);
    setEditingId(client.id);
    setMessage(`✏️ Editing client: ${firstName} ${lastName}`);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this client?')) return;
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (!error) {
      setMessage('✅ Client deleted.');
      fetchClients();
    }
  };

  const handleStartPickup = async (client) => {
    // Resolve first/last even if only client.name exists
    const parsedFirst =
      client.first_name ||
      (client.name ? client.name.trim().split(' ')[0] : '') ||
      '';
    const parsedLast =
      client.last_name ||
      (client.name ? client.name.trim().split(' ').slice(1).join(' ') : '') ||
      '';

    const key = keys.find(k => k.uuid === client.key_id);

    if (!key?.UID) {
      setMessage("❌ Key has no UID assigned!");
      return;
    }

    // Real-time presence check
    const { data: slot } = await supabase
      .from('key_slot_presence')
      .select('*')
      .eq('UID', key.UID)
      .maybeSingle();

    if (!slot) {
      setMessage("❌ The key is NOT in the machine right now. Please check bookings or missing key.");
      return;
    }

    // Prefer presence slot -> key.slot_number -> cached presence
    let slot_number = slot?.slot_number || key?.slot_number;
    if (!slot_number && key?.UID && key?.machine_id) {
      const spSlot = slotPresence.find(
        sp => sp.UID === key.UID && String(sp.machine_id) === String(key.machine_id)
      );
      slot_number = spSlot?.slot_number || "";
    }

    if (!slot_number) {
      setMessage("❌ Key data missing: slot number not found for the selected key.");
      return;
    }

    setMessage("⏳ Starting pickup...");

    const roomNo = key.room_number || "";
    const UID = key.UID || "";
    const machineId = key.machine_id || "";
    const owner = owners.find(o => o.id === key?.owner_id) || {};
    const ownerName = owner.name || "";

    // >>> Send explicit first/last so backend can store them <<<
    const pickupPayload = {
      clientId: client.id,
      clientEmail: client.email || "",
      clientFirstName: parsedFirst,                           // NEW
      clientLastName: parsedLast,                             // NEW
      clientName: `${parsedFirst} ${parsedLast}`.trim(),      // (still send full name)
      ownerName,
      keyId: client.key_id,
      roomNo,
      UID,
      slot_number,
      checkIn: client.check_in,
      checkOut: client.check_out,
      machineId,
    };

    try {
      const res = await fetch("/api/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pickupPayload),
      });

      const data = await res.json();
      if (data.success) {
        setMessage("✅ Pickup started and email sent!");
      } else {
        setMessage("❌ Failed: " + (data.error || "Unknown error."));
      }
    } catch (e) {
      setMessage("❌ Pickup error: " + e.message);
    }
  };

  // --------------------------------------------------------

  // Helper: get key info for a client
  const getKeyInfo = (client) => {
    const key = keys.find(k => k.uuid === client.key_id);
    return key ? `${key.room_number || ''} (UID: ${key.UID || key.uuid})` : '';
  };

  // Filtering and sorting clients list
  function getFirstName(client) {
    if (client.first_name) return client.first_name;
    if (client.name) return client.name.split(' ')[0];
    return '';
  }
  function getLastName(client) {
    if (client.last_name) return client.last_name;
    if (client.name) return client.name.split(' ').slice(1).join(' ');
    return '';
  }

  const filterClients = () => {
    const today = new Date().toISOString().slice(0,10);
    let filtered = clients.filter(client => {
      if (filter === 'current') return client.check_in <= today && client.check_out >= today;
      if (filter === 'coming') return client.check_in > today;
      if (filter === 'past') return client.check_out < today;
      return true;
    });

    if (tableFilter.trim()) {
      const f = tableFilter.trim().toLowerCase();
      filtered = filtered.filter(client =>
        (client.first_name || '').toLowerCase().includes(f) ||
        (client.last_name || '').toLowerCase().includes(f) ||
        (client.email || '').toLowerCase().includes(f) ||
        (client.phone || '').toLowerCase().includes(f) ||
        (client.check_in || '').toLowerCase().includes(f) ||
        (client.check_out || '').toLowerCase().includes(f) ||
        getKeyInfo(client).toLowerCase().includes(f)
      );
    }

    const sorters = {
      check_in: client => client.check_in || '',
      check_out: client => client.check_out || '',
      full_name: client => ((client.first_name || '') + ' ' + (client.last_name || '')).toLowerCase(),
      key_info: client => getKeyInfo(client).toLowerCase(),
      email: client => (client.email || '').toLowerCase(),
      phone: client => (client.phone || '').toLowerCase()
    };

    if (sortField && sorters[sortField]) {
      filtered.sort((a,b) => {
        let va = sorters[sortField](a);
        let vb = sorters[sortField](b);
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  };

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  // Owner search handlers (unchanged)
  const handleOwnerSearch = (e) => {
    const value = e.target.value;
    setOwnerSearch(value);
    setSelectedOwner(null);
    setForm(prev => ({ ...prev, keyId: '' }));
    if (value.length < 2) {
      setFilteredOwners([]);
      return;
    }
    const matches = owners.filter(owner =>
      (owner.name && owner.name.toLowerCase().includes(value.trim().toLowerCase())) ||
      (owner.email && owner.email.toLowerCase().includes(value.trim().toLowerCase()))
    );
    setFilteredOwners(matches || []);
  };

  const handleOwnerSelect = (owner) => {
    setSelectedOwner(owner);
    setOwnerSearch(owner.email);
    setFilteredOwners([]);
    setForm(prev => ({ ...prev, keyId: '' }));
  };

  // Helper for date/time display in the table
  function displayDateTime(val) {
    if (!val) return <span className="text-gray-400">-</span>;
    const dt = val.replace(' ', 'T');
    const [date, timePart] = dt.split('T');
    const time = (timePart || '').slice(0,5); // HH:MM
    return (
      <span>
        <span>{date}</span>
        <br />
        <span className="text-xs text-gray-500">{time}</span>
      </span>
    );
  }

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
            {/* First Name */}
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
            {/* Last Name */}
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
            {/* Email */}
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
            {/* Phone */}
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
            {/* Owner Search */}
            <div className="md:col-span-2 relative">
              <label className="block text-sm font-medium text-gray-700">Link to Owner (Search by Email or Name)</label>
              <input
                type="text"
                value={ownerSearch}
                onChange={handleOwnerSearch}
                placeholder="Type owner's email"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                autoComplete="off"
              />
              {filteredOwners.length > 0 && (
                <ul className="absolute z-10 bg-white border border-gray-300 rounded-md shadow max-h-40 overflow-y-auto mt-1 w-full">
                  {filteredOwners.map((owner) => (
                    <li
                      key={owner.id}
                      onClick={() => handleOwnerSelect(owner)}
                      className="p-2 hover:bg-blue-100 cursor-pointer"
                    >
                      <span className="font-medium">{owner.name}</span>
                      <span className="ml-2 text-xs text-gray-600">{owner.email}</span>
                    </li>
                  ))}
                </ul>
              )}
              {selectedOwner && (
                <div className="mt-3 p-4 bg-gray-100 rounded-md shadow">
                  <h3 className="text-lg font-semibold">{selectedOwner.name}</h3>
                  <p>Email: {selectedOwner.email}</p>
                  <p>Phone: {selectedOwner.phone}</p>
                </div>
              )}
            </div>
            {/* Key Dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Room No / Key</label>
              <select
                name="keyId"
                value={form.keyId}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                disabled={!selectedOwner}
                required
              >
                <option value="">Select key for owner</option>
                {selectedOwner
                  ? keys.filter(k => k.owner_id === selectedOwner.id).map((k) => (
                      <option key={k.uuid} value={k.uuid}>
                        {k.room_number} (UID: {k.UID || k.uuid})
                      </option>
                    ))
                  : keys.map((k) => (
                      <option key={k.uuid} value={k.uuid}>
                        {k.room_number} (UID: {k.UID || k.uuid})
                      </option>
                    ))
                }
              </select>
            </div>
            {/* Check-in/Check-out SIDE BY SIDE */}
            <div className="flex gap-2 col-span-1 md:col-span-2">
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700">Check-In Date & Time</label>
                <input
                  type="datetime-local"
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
                  value={form.checkOut ? form.checkOut.slice(0, 10) : ""}
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
            {message && (
              <p
                className={`mt-4 text-center text-sm col-span-2 ${
                  message.startsWith("❌")
                    ? "font-bold text-red-600"
                    : "text-green-700"
                }`}
              >
                {message}
              </p>
            )}
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

          <div className="my-2">
            <input
              type="text"
              value={tableFilter}
              onChange={e => setTableFilter(e.target.value)}
              placeholder="Search by name, room, email, UID, etc"
              className="p-2 border rounded-md w-64"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 rounded-lg">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left">
                    START PICKUP
                  </th>
                  <th
                    className="px-6 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left cursor-pointer"
                    onClick={() => handleSort('full_name')}
                  >
                    FULL NAME {sortField === 'full_name' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    className="px-6 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left cursor-pointer"
                    onClick={() => handleSort('key_info')}
                  >
                    ROOM / UID {sortField === 'key_info' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    className="px-6 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left w-48 cursor-pointer"
                    onClick={() => handleSort('check_in')}
                  >
                    CHECK-IN {sortField === 'check_in' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    className="px-6 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left w-48 cursor-pointer"
                    onClick={() => handleSort('check_out')}
                  >
                    CHECK-OUT {sortField === 'check_out' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    className="px-6 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left cursor-pointer"
                    onClick={() => handleSort('email')}
                  >
                    EMAIL {sortField === 'email' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th
                    className="px-6 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left cursor-pointer"
                    onClick={() => handleSort('phone')}
                  >
                    PHONE {sortField === 'phone' && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-right">
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody>
                {filterClients().map((client, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 border border-gray-300 text-left">
                      {(['current', 'coming'].includes(filter)) && (
                        <button
                          onClick={() => handleStartPickup(client)}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-md text-white bg-teal-600 hover:bg-teal-700"
                        >
                          Start Pickup
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 border border-gray-300">
                      {(client.first_name || '') + ' ' + (client.last_name || '')}
                    </td>
                    <td className="px-6 py-4 border border-gray-300">{getKeyInfo(client)}</td>
                    <td className="px-6 py-4 border border-gray-300 w-48">
                      <div>
                        {client.check_in?.slice(0, 10)}
                        <div className="text-xs text-gray-500">{client.check_in?.slice(11, 16)}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 border border-gray-300 w-48">
                      <div>
                        {client.check_out?.slice(0, 10)}
                        <div className="text-xs text-gray-500">{client.check_out?.slice(11, 16)}</div>
                      </div>
                    </td>
                    <td className="px-6 py-3 border border-gray-300">{client.email}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.phone}</td>
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
                  </tr>
                ))}
                {filterClients().length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-400 py-4">
                      No clients found.
                    </td>
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

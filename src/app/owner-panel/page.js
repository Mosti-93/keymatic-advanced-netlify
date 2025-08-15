'use client';
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

export default function OwnerPanelPage() {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
  firstName: '', lastName: '', email: '', phone: '', keyId: '', checkIn: '', checkOut: '', platform: ''
});
const platforms = [
  "Airbnb",
  "Booking.com",
  "Vrbo",
  "Vacasa",
  "FlipKey",
  "Whimstay",
  "HomeExchange",
  "Hipcamp",
  "Misterb&b",
  "ThirdHome",
  "Fairbnb & similar"
];

  const [clients, setClients] = useState([]);
  const [keys, setKeys] = useState([]);
  const [machines, setMachines] = useState([]);
  const [slotPresence, setSlotPresence] = useState([]); // <-- Added!
  const [filter, setFilter] = useState('current');
  const [message, setMessage] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [tableFilter, setTableFilter] = useState('');
  const [sortField, setSortField] = useState('check_in');
  const [sortDir, setSortDir] = useState('asc');

  // Fetch slot_presence table
  const fetchSlotPresence = async () => {
    const { data } = await supabase
      .from('key_slot_presence')
      .select('machine_id, slot_number, UID');
    setSlotPresence(data || []);
  };

async function handleStartPickup(client) {
  setMessage("⏳ Starting pickup...");

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
  
  // Validate key exists
  if (!key) {
    setMessage("❌ No key assigned to this client");
    return;
  }

  const machineId = key?.machine_id || "";
  const roomNo = key?.room_number || "";
  const UID = key?.UID || "";

  // Check if key is physically in the machine
  const keyInMachine = slotPresence.some(sp => sp.UID === UID);
  if (!keyInMachine) {
    setMessage("❌ Key not detected in machine - please insert the key first");
    return;
  }

  // Fallback for slot_number using slotPresence table
  let slot_number = key?.slot_number || "";
  if (!slot_number && key?.UID) {
    const matchingSlots = slotPresence.filter(sp => sp.UID === key.UID);
    
    if (matchingSlots.length > 0) {
      // Try exact match first
      const exactMatch = matchingSlots.find(
        sp => String(sp.machine_id) === String(key.machine_id)
      );
      slot_number = exactMatch?.slot_number || matchingSlots[0]?.slot_number || "";
    }
  }

  if (!slot_number) {
    setMessage("❌ Could not determine slot number for the key");
    return;
  }

  try {
    const res = await fetch("/api/pickup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: client.id,
        clientEmail: client.email || "",
        clientFirstName: parsedFirst,
        clientLastName: parsedLast,
        clientName: `${parsedFirst} ${parsedLast}`.trim(),
        keyId: client.key_id,
        machineId,
        roomNo,
        checkIn: client.check_in,
        checkOut: client.check_out,
        UID,
        slot_number,
      }),
    });

    const data = await res.json();
    
    if (!res.ok) {
      // Handle HTTP errors
      let errorMsg = data?.error || "Pickup failed";
      if (res.status === 400) {
        errorMsg = "Key not detected in machine - please insert the key first";
      }
      setMessage(`❌ ${errorMsg}`);
      return;
    }

    if (data.success) {
      setMessage("✅ Pickup email sent!");
    } else {
      setMessage(`❌ ${data.error || "Unknown error occurred"}`);
    }
  } catch (e) {
    console.error("Pickup error:", e);
    setMessage(`❌ Network error: ${e.message}`);
  }
}


  function toDateTimeLocal(val) {
    if (!val) return '';
    return val.replace(' ', 'T').slice(0, 16);
  }

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('*').eq('owner_id', ownerId);
    setClients(data || []);
  };

  const fetchKeys = async () => {
    const { data } = await supabase
      .from('keys')
      .select('uuid, room_number, owner_id, UID, machine_id')
      .eq('owner_id', ownerId);
    setKeys(data || []);
  };

  const fetchMachines = async () => {
    const { data } = await supabase.from('machines').select('id, "Machine name", location');
    setMachines(data || []);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "checkOut" && value) {
      const hasTime = value.includes("T");
      setForm((prev) => ({
        ...prev,
        [name]: hasTime ? value : `${value}T11:00:00`
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        [name]: value
      }));
    }
  };

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
  owner_id: ownerId,
  platform: form.platform
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
  owner_id: ownerId,
  platform: form.platform
}]);

    }

    const { error } = result;
    if (error) {
      if (error.message.includes('unique_client_email')) setMessage('⚠️ Email is already used.');
      else if (error.message.includes('unique_client_phone')) setMessage('⚠️ Phone number is already used.');
      else setMessage(`❌ ${error.message}`);
    } else {
      setMessage(editMode ? '✅ Client updated.' : '✅ Client saved!');
      setForm({ firstName: '', lastName: '', email: '', phone: '', keyId: '', checkIn: '', checkOut: '', platform: '' });

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
    checkOut: client.check_out,
    platform: client.platform || ''
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

  function displayDateTime(val) {
    if (!val) return <span className="text-gray-400">-</span>;
    const dt = val.replace(' ', 'T');
    const [date, timePart] = dt.split('T');
    const time = (timePart || '').slice(0,5);
    return (
      <span>
        <span>{date}</span>
        <br />
        <span className="text-xs text-gray-500">{time}</span>
      </span>
    );
  }

  const getKeyInfo = (client) => {
    const key = keys.find(k => k.uuid === client.key_id);
    return key ? `${key.room_number} (UID: ${key.UID || key.uuid})` : '';
  };

  const sorters = {
  check_in: client => client.check_in || '',
  check_out: client => client.check_out || '',
  full_name: client => ((client.first_name || '') + ' ' + (client.last_name || '')).toLowerCase(),
  key_info: client => getKeyInfo(client).toLowerCase(),
  platform: client => (client.platform || '').toLowerCase(),
  email: client => (client.email || '').toLowerCase(),
  phone: client => (client.phone || '').toLowerCase()
};


  const filterClients = () => {
    const today = new Date().toISOString().split('T')[0];
    let filtered = clients.filter(client => {
      const ci = (client.check_in || '').slice(0, 10);
      const co = (client.check_out || '').slice(0, 10);
      if (filter === 'current') return ci <= today && co >= today;
      if (filter === 'coming') return ci > today;
      if (filter === 'past') return co < today;
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
  getKeyInfo(client).toLowerCase().includes(f) ||
  (client.platform || '').toLowerCase().includes(f)
);

    }
    if (sortField && sorters[sortField]) {
      filtered.sort((a, b) => {
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
      setProfile(profile);
    };
    fetchOwner();
  }, [router]);

  useEffect(() => {
    if (ownerId) {
      fetchClients();
      fetchKeys();
    }
  }, [ownerId]);

  useEffect(() => {
    fetchMachines();
    fetchSlotPresence(); // <-- New!
  }, []);

  useEffect(() => {
    if (!form.checkIn) {
      const now = new Date();
      now.setHours(10, 0, 0, 0);
      const pad = (n) => String(n).padStart(2, '0');
      const defaultStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T10:00`;
      setForm(f => ({ ...f, checkIn: defaultStr }));
    }
  }, []);

  if (!ownerId) return <div className="p-10 text-center text-gray-500">Loading owner data...</div>;

  // --- JSX STARTS HERE ---
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
<div>
  <label className="block text-sm font-medium text-gray-700">Platform</label>
  <input
    list="platform-options"
    name="platform"
    value={form.platform}
    onChange={handleChange}
    placeholder="Select or type platform"
    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
    required
  />
  <datalist id="platform-options">
    {platforms.map((p, idx) => (
      <option key={idx} value={p} />
    ))}
    <option value="Other" />
  </datalist>
</div>


            <div className="flex gap-2 col-span-1 md:col-span-2">
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700">Check-In Date & Time</label>
                <input
                  type="datetime-local"
                  name="checkIn"
                  value={toDateTimeLocal(form.checkIn)}
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
                    setForm({ firstName: '', lastName: '', email: '', phone: '', keyId: '', checkIn: '', checkOut: '', platform: '' });

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
                    Start Pickup
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
  className="px-6 py-3 text-xs font-medium text-gray-500 uppercase border border-gray-300 text-left cursor-pointer"
  onClick={() => handleSort('platform')}
>
  PLATFORM {sortField === 'platform' && (sortDir === 'asc' ? '▲' : '▼')}
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
                    <td className="px-6 py-4 border border-gray-300">{client.platform || '-'}</td>

                    <td className="px-6 py-4 border border-gray-300 w-48">{displayDateTime(client.check_in)}</td>
                    <td className="px-6 py-4 border border-gray-300 w-48">{displayDateTime(client.check_out)}</td>
                    <td className="px-6 py-4 border border-gray-300">{client.email}</td>
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
                    <td colSpan={9} className="text-center text-gray-400 py-4">
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

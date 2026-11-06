"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";
import { authHeaders } from "@/utils/requireRole";
import DataTable, { RowAction, toDate, fmtDate } from "@/components/DataTable";
import PageHeader, { Notice, FormPanel } from "@/components/PageHeader";
import PlatformSelect from "@/components/PlatformSelect";
import { guestStatus, GUEST_FILTERS, STATUS_BADGE } from "@/utils/guestStatus";

export default function AddClientPage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    keyId: "",
    checkIn: "",
    checkOut: "",
    platform: "",
  });

  const [clients, setClients] = useState([]);
  const [keys, setKeys] = useState([]);
  const [owners, setOwners] = useState([]);
  const [filteredOwners, setFilteredOwners] = useState([]);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [message, setMessage] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [slotPresence, setSlotPresence] = useState([]); // NEW

  useEffect(() => {
    fetchClients();
    fetchKeys();
    fetchOwners();
    fetchSlotPresence(); // NEW
  }, []);

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("check_in", { ascending: false })
      .order("id", { ascending: false });
    if (!error) setClients(data || []);
    setLoaded(true);
  };

  // includes slot_number now
  const fetchKeys = async () => {
    const { data, error } = await supabase.from("keys").select("uuid, room_number, owner_id, UID, machine_id");
    if (!error) setKeys(data || []);
  };

  const fetchOwners = async () => {
    const { data, error } = await supabase.from("users").select("id, name, email, phone").eq("role", "owner");
    if (!error) setOwners(data || []);
  };

  const fetchSlotPresence = async () => {
    // NEW
    const { data } = await supabase.from("key_slot_presence").select("machine_id, slot_number, UID");
    setSlotPresence(data || []);
  };

  // MATCHED to your other file:
  // - If checkOut is date-only, append T11:00:00
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "checkOut" && value) {
      const hasTime = value.includes("T");
      setForm((prev) => ({
        ...prev,
        [name]: hasTime ? value : `${value}T11:00:00`,
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
    setMessage("");

    const { firstName, lastName, email, phone, keyId, checkIn, checkOut } = form;
    const owner_id = selectedOwner?.id || null;

    // MATCHED to your other file:
    // - Pass check_in/check_out AS-IS (no ISO normalization)
    let result;
    if (editMode) {
      result = await supabase
        .from("clients")
        .update({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          key_id: keyId,
          check_in: checkIn,
          check_out: checkOut,
          owner_id,
          platform: form.platform,
        })
        .eq("id", editingId);
    } else {
      result = await supabase.from("clients").insert([
        {
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          key_id: keyId,
          check_in: checkIn,
          check_out: checkOut,
          owner_id,
          platform: form.platform,
        },
      ]);
    }

    const { error } = result;
    if (error) {
      if (error.message.includes("unique_client_email")) {
        setMessage("⚠️ Email is already used.");
      } else if (error.message.includes("unique_client_phone")) {
        setMessage("⚠️ Phone number is already used.");
      } else {
        setMessage(`❌ ${error.message}`);
      }
    } else {
      setMessage(editMode ? "✅ Client updated." : "✅ Client saved!");
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        keyId: "",
        checkIn: "",
        checkOut: "",
        platform: "",
      });
      setSelectedOwner(null);
      setOwnerSearch("");
      setEditMode(false);
      setEditingId(null);
      fetchClients();
    }
  };

  const handleEdit = (client) => {
    let firstName = client.first_name || "";
    let lastName = client.last_name || "";
    if ((!firstName || !lastName) && client.name) {
      const nameParts = client.name.trim().split(" ");
      firstName = nameParts[0] || "";
      lastName = nameParts.slice(1).join(" ") || "";
    }

    setForm({
      firstName,
      lastName,
      email: client.email || "",
      phone: client.phone || "",
      keyId: client.key_id || "",
      checkIn: client.check_in || "",
      checkOut: client.check_out || "",
      platform: client.platform || "",
    });

    const owner = owners.find((o) => o.id === client.owner_id) || null;
    setSelectedOwner(owner);
    setOwnerSearch(owner?.email || "");
    setEditMode(true);
    setEditingId(client.id);
    setMessage(`✏️ Editing client: ${firstName} ${lastName}`);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this client?")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (!error) {
      setMessage("✅ Client deleted.");
      fetchClients();
    }
  };

  const handleStartPickup = async (client) => {
    try {
      if (!client?.id) throw new Error("Invalid client data");

      const parsedFirst = client.first_name || (client.name ? client.name.trim().split(" ")[0] : "") || "";
      const parsedLast =
        client.last_name || (client.name ? client.name.trim().split(" ").slice(1).join(" ") : "") || "";

      const key = keys.find((k) => k.uuid === client.key_id);
      if (!key) throw new Error("No key assigned to this client");
      if (!key?.UID) throw new Error("Key has no UID assigned");

      // Check key presence in machine
      const { data: slot, error: slotError } = await supabase
        .from("key_slot_presence")
        .select("*")
        .eq("UID", key.UID)
        .maybeSingle();

      if (slotError) throw new Error(`Failed to check key presence: ${slotError.message}`);
      if (!slot) throw new Error("Key not detected in machine - please verify physical key presence");

      // Determine slot number with fallbacks
      let slot_number = slot?.slot_number || key?.slot_number;
      if (!slot_number && key?.UID && key?.machine_id) {
        const spSlot = slotPresence.find(
          (sp) => sp.UID === key.UID && String(sp.machine_id) === String(key.machine_id)
        );
        slot_number = spSlot?.slot_number || "";
      }
      if (!slot_number) throw new Error("Could not determine slot number for the key");

      const owner = owners.find((o) => o.id === key?.owner_id) || {};
      const pickupPayload = {
        clientId: client.id,
        clientEmail: client.email || "",
        clientFirstName: parsedFirst,
        clientLastName: parsedLast,
        clientName: `${parsedFirst} ${parsedLast}`.trim(),
        ownerName: owner.name || "",
        keyId: client.key_id,
        roomNo: key.room_number || "",
        UID: key.UID || "",
        slot_number,
        checkIn: client.check_in,
        checkOut: client.check_out,
        machineId: key.machine_id || "",
      };

      setMessage("⏳ Starting pickup process...");

      const res = await fetch("/api/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders(supabase)) },
        body: JSON.stringify(pickupPayload),
      });

      if (!res.ok) {
        let errorMsg = `Server error: ${res.status}`;
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorData.message || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "Pickup failed without error details");

      setMessage("✅ Pickup initiated successfully!");
      fetchClients();
    } catch (error) {
      console.error("Pickup error:", error);
      setMessage(`❌ ${error.message}`);
      if (error.name === "TypeError" && error.message.includes("Failed to fetch")) {
        setMessage("❌ Network error - could not connect to server");
      }
    }
  };

  // Owner search handlers (unchanged)
  const handleOwnerSearch = async (e) => {
    const value = e.target.value || "";
    setOwnerSearch(value);
    setSelectedOwner(null);
    setForm((prev) => ({ ...prev, keyId: "" }));

    const q = value.trim();
    if (q.length < 2) {
      setFilteredOwners([]);
      return;
    }

    const like = `%${q}%`;
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, phone")
      .eq("role", "owner")
      .or(`name.ilike.${like},email.ilike.${like}`)
      .order("name", { ascending: true })
      .limit(10);

    if (error) {
      console.error("[owners search] error:", error);
      setFilteredOwners([]);
      return;
    }
    setFilteredOwners(data || []);
  };

  const handleOwnerSelect = (owner) => {
    setSelectedOwner(owner);
    setOwnerSearch(owner.email);
    setFilteredOwners([]);
    setForm((prev) => ({ ...prev, keyId: "" }));
  };

  const resetForm = () => {
    setForm({ firstName: "", lastName: "", email: "", phone: "", keyId: "", checkIn: "", checkOut: "", platform: "" });
    setEditMode(false);
    setEditingId(null);
    setSelectedOwner(null);
    setOwnerSearch("");
    setMessage("");
  };

  const keyFor = (c) => keys.find((k) => k.uuid === c.key_id);
  const ownerKeys = selectedOwner ? keys.filter((k) => String(k.owner_id) === String(selectedOwner.id)) : keys;
  const input = (label, name, props = {}) => (
    <div>
      <label className="k-label" htmlFor={`c-${name}`}>
        {label}
      </label>
      <input id={`c-${name}`} name={name} value={form[name]} onChange={handleChange} className="k-input" {...props} />
    </div>
  );

  return (
    <div className="k-page">
      <PageHeader eyebrow="Guests" title="Guests & pickups" subtitle="Add bookings and send pickup links." />

      <Notice>{message}</Notice>
      <div className="space-y-6">
        <FormPanel title={editMode ? "Edit guest" : "Add guest"} addLabel="Add guest" forceOpen={editMode}>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              {input("First name", "firstName", { required: true })}
              {input("Last name", "lastName", { required: true })}
            </div>
            {input("Email", "email", { type: "email", required: true, placeholder: "guest@example.com" })}
            {input("Phone", "phone", { placeholder: "+20 …" })}

            <div className="relative">
              <label className="k-label" htmlFor="c-owner">
                Owner
              </label>
              <div className="relative">
                <input
                  id="c-owner"
                  value={ownerSearch}
                  onChange={handleOwnerSearch}
                  placeholder="Search owner name or email"
                  className={`k-input ${selectedOwner ? "!pr-10 !border-[#1d8a3a]" : ""}`}
                  autoComplete="off"
                />
                {selectedOwner && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#1d8a3a]">✓</span>}
              </div>
              {filteredOwners.length > 0 && (
                <ul className="absolute left-0 top-full z-20 mt-1.5 max-h-56 w-full overflow-y-auto rounded-2xl bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)] border border-black/5">
                  {filteredOwners.map((owner) => (
                    <li key={owner.id}>
                      <button
                        type="button"
                        onClick={() => handleOwnerSelect(owner)}
                        className="w-full text-left rounded-xl px-3 py-2 hover:bg-[#f5f5f7]"
                      >
                        <span className="font-medium">{owner.name}</span>
                        <span className="ml-2 text-[13px] k-faint">{owner.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="k-label" htmlFor="c-key">
                Room / key
              </label>
              <select
                id="c-key"
                name="keyId"
                value={form.keyId}
                onChange={handleChange}
                className="k-input"
                disabled={!selectedOwner && !editMode}
                required
              >
                <option value="">{selectedOwner || editMode ? "Select a key" : "Choose an owner first"}</option>
                {ownerKeys.map((k) => (
                  <option key={k.uuid} value={k.uuid}>
                    Room {k.room_number} · {k.UID || k.uuid}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="k-label" htmlFor="c-platform">
                Platform
              </label>
              <PlatformSelect id="c-platform" value={form.platform} onChange={handleChange} />
            </div>

            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              {input("Check-in", "checkIn", { type: "datetime-local" })}
              <div>
                <label className="k-label" htmlFor="c-checkOut">
                  Check-out
                </label>
                <input
                  id="c-checkOut"
                  type="date"
                  name="checkOut"
                  value={form.checkOut ? form.checkOut.slice(0, 10) : ""}
                  onChange={handleChange}
                  className="k-input"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 md:col-span-2 lg:col-span-3 md:justify-end">
              <button type="submit" className="k-btn-primary flex-1 md:flex-none md:min-w-40">
                {editMode ? "Save changes" : "Add guest"}
              </button>
              {editMode && (
                <button type="button" onClick={resetForm} className="k-btn-secondary">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </FormPanel>

        <DataTable
          title="Guests"
          rows={clients}
          loading={!loaded}
          exportName="guests"
          searchPlaceholder="Search name, room, email, phone"
          filters={GUEST_FILTERS}
          defaultSort={{ key: "check_in", dir: "asc" }}
          emptyText="No guests in this view."
          columns={[
            {
              key: "name",
              mobile: "title",
              header: "Guest",
              nowrap: true,
              value: (c) => `${c.first_name || ""} ${c.last_name || ""}`.trim(),
              cell: (c) => <span className="font-medium">{`${c.first_name || ""} ${c.last_name || ""}`.trim()}</span>,
            },
            {
              key: "room",
              mobile: "meta",
              mobileText: (c) => (keyFor(c)?.room_number ? `Room ${keyFor(c).room_number}` : ""),
              header: "Room",
              value: (c) => keyFor(c)?.room_number || "",
              cell: (c) => {
                const k = keyFor(c);
                return k ? (
                  <>
                    <div>Room {k.room_number}</div>
                    <div className="text-[12px] k-faint">{k.UID}</div>
                  </>
                ) : null;
              },
            },
            {
              key: "status",
              mobile: "badge",
              header: "Status",
              value: (c) => STATUS_BADGE[guestStatus(c)][1],
              cell: (c) => {
                const [cls, label] = STATUS_BADGE[guestStatus(c)];
                return <span className={cls}>{label}</span>;
              },
            },
            {
              key: "check_in",
              mobile: "meta",
              mobileText: (c) => `${fmtDate(c.check_in)} → ${fmtDate(c.check_out)}`,
              header: "Check-in",
              nowrap: true,
              value: (c) => toDate(c.check_in),
              cell: (c) => fmtDate(c.check_in),
            },
            {
              key: "check_out",
              mobile: "hide",
              header: "Check-out",
              nowrap: true,
              value: (c) => toDate(c.check_out),
              cell: (c) => fmtDate(c.check_out),
            },
            { key: "platform", header: "Platform" },
            {
              key: "contact",
              header: "Contact",
              value: (c) => [c.email, c.phone].filter(Boolean).join(" · "),
              cell: (c) => (
                <>
                  <div className="max-w-[200px] truncate" title={c.email}>
                    {c.email}
                  </div>
                  {c.phone && <div className="text-[12px] k-faint">{c.phone}</div>}
                </>
              ),
            },
          ]}
          rowClassName={(c) => (c.id === editingId ? "!bg-[#e8f2fd]" : "")}
          rowActions={(c) => (
            <>
              {["current", "upcoming"].includes(guestStatus(c)) && (
                <RowAction tone="primary" onClick={() => handleStartPickup(c)}>
                  Start pickup
                </RowAction>
              )}
              <RowAction
                onClick={() => {
                  handleEdit(c);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Edit
              </RowAction>
              <RowAction tone="danger" onClick={() => handleDelete(c.id)}>
                Delete
              </RowAction>
            </>
          )}
        />
      </div>
    </div>
  );
}

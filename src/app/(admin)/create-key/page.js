"use client";
import { useState, useMemo } from "react";
import { useLoadOnMount } from "@/utils/useLoadOnMount";
import { supabase } from "@/utils/supabaseClient";
import DataTable, { RowAction } from "@/components/DataTable";
import PageHeader, { Notice, FormPanel } from "@/components/PageHeader";

export default function CreateKeyPage() {
  // -------- FORM STATE --------
  const [form, setForm] = useState({
    key_id: "",
    UID: "",
    room_number: "",
    room_location: "",
    room_address: "",
    machine_id: "", // keep as string; DB uses text like "A01"
    owner_id: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // -------- DATA STATE --------
  const [keys, setKeys] = useState([]);
  const [machines, setMachines] = useState([]);
  const [owners, setOwners] = useState([]);

  // -------- OWNER SEARCH (FORM) --------
  const [filteredOwners, setFilteredOwners] = useState([]);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [selectedOwner, setSelectedOwner] = useState(null);

  // -------- EDIT MODE --------
  const [editMode, setEditMode] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState(null);

  const [loaded, setLoaded] = useState(false);
  const [slots, setSlots] = useState([]); // key_slot_presence: which key is in which machine slot
  const [clients, setClients] = useState([]); // bookings, to show who has a key out

  const fetchAll = async () => {
    const [keysRes, machinesRes, ownersRes, slotsRes, clientsRes] = await Promise.all([
      supabase.from("keys").select("*"),
      supabase.from("machines").select('machine_id, "Machine name"'),
      supabase.from("users").select("id, name, email, phone").eq("role", "owner"),
      supabase.from("key_slot_presence").select("machine_id, slot_number, UID"),
      supabase.from("clients").select("id, first_name, last_name, email, key_id, check_in, check_out"),
    ]);
    if (!slotsRes.error) setSlots(slotsRes.data || []);
    if (!clientsRes.error) setClients(clientsRes.data || []);

    if (!keysRes.error) setKeys(keysRes.data || []);

    if (!machinesRes.error) {
      const normalized = (machinesRes.data || []).map((m) => ({
        ...m,
        machine_name: m["Machine name"], // normalize once
      }));
      setMachines(normalized);
    }

    if (!ownersRes.error) setOwners(ownersRes.data || []);
    setLoaded(true);

    // Opened from the dashboard's "Edit" link (/create-key?edit=<key id>):
    // put that key straight into the edit form.
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (editId && !keysRes.error) {
      const target = (keysRes.data || []).find((k) => String(k.id) === editId);
      if (target) {
        handleEdit(target, ownersRes.data || []);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setMessage("That key was not found. It may have been deleted.");
      }
    }
  };

  // -------- HELPERS --------
  const machinesById = useMemo(() => new Map(machines.map((m) => [String(m.machine_id), m])), [machines]);

  // Where each key is right now: in a machine slot, out with a staying guest, or out.
  const statusByKeyId = useMemo(() => {
    const norm = (v) =>
      String(v ?? "")
        .trim()
        .toUpperCase();
    const toDate = (v) => (v ? new Date(String(v).replace(" ", "T")) : null);
    const slotByUid = new Map(slots.filter((s) => s.UID).map((s) => [norm(s.UID), s]));
    const now = new Date();
    const map = new Map();
    for (const k of keys) {
      const slot = k.UID ? slotByUid.get(norm(k.UID)) : null;
      const guest = clients.find((c) => {
        const a = toDate(c.check_in);
        const b = toDate(c.check_out);
        return c.key_id && c.key_id === k.uuid && a && b && a <= now && now <= b;
      });
      const guestName = guest ? [guest.first_name, guest.last_name].filter(Boolean).join(" ") || guest.email : "";
      if (slot) {
        map.set(k.id, {
          kind: "in",
          label: "In machine",
          detail: `${String(slot.machine_id ?? "").trim()} · slot ${slot.slot_number}`,
        });
      } else if (guest) {
        map.set(k.id, { kind: "guest", label: "With guest", detail: guestName });
      } else {
        map.set(k.id, { kind: "out", label: "Out", detail: k.UID ? "Not in any machine" : "No UID" });
      }
    }
    return map;
  }, [keys, slots, clients]);
  const ownersById = useMemo(() => new Map(owners.map((o) => [o.id, o])), [owners]);

  const getMachine = (machine_id) => {
    if (machine_id === null || machine_id === undefined || machine_id === "") return undefined;
    return machinesById.get(String(machine_id));
  };
  const getOwner = (id) => ownersById.get(id);

  // Owner search logic (form)
  const handleOwnerSearch = (e) => {
    const value = e.target.value;
    setOwnerSearch(value);
    setSelectedOwner(null);
    setForm((prev) => ({ ...prev, owner_id: "" }));
    if (value.trim().length < 2) {
      setFilteredOwners([]);
      return;
    }
    const q = value.trim().toLowerCase();
    const matches = owners.filter(
      (owner) =>
        (owner.name && owner.name.toLowerCase().includes(q)) || (owner.email && owner.email.toLowerCase().includes(q))
    );
    setFilteredOwners(matches || []);
  };

  const handleOwnerSelect = (owner) => {
    setSelectedOwner(owner);
    setOwnerSearch(owner.name + (owner.email ? ` (${owner.email})` : ""));
    setFilteredOwners([]);
    setForm((prev) => ({ ...prev, owner_id: owner.id }));
  };

  // -------- FORM EVENTS --------
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "machine_id") {
      setForm((prev) => ({ ...prev, machine_id: value })); // string or ''
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { key_id, UID } = form;
    if (!key_id || !UID) {
      setMessage("key_id and UID are required.");
      setLoading(false);
      return;
    }

    const machineIdValue = form.machine_id === "" || form.machine_id == null ? null : String(form.machine_id);

    const payload = {
      key_id,
      UID,
      room_number: form.room_number || null,
      room_location: form.room_location || null,
      room_address: form.room_address || null,
      machine_id: machineIdValue,
      owner_id: form.owner_id || null,
    };

    const response = editMode
      ? await supabase.from("keys").update(payload).eq("id", editingKeyId)
      : await supabase.from("keys").insert([payload]);

    if (response.error) {
      console.error("Insert/Update Error:", response.error);
      setMessage(`Failed to save key: ${response.error.message}`);
    } else {
      setMessage(editMode ? "Key updated." : "Key saved.");
      setForm({
        key_id: "",
        UID: "",
        room_number: "",
        room_location: "",
        room_address: "",
        machine_id: "",
        owner_id: "",
      });
      setSelectedOwner(null);
      setOwnerSearch("");
      setEditMode(false);
      setEditingKeyId(null);
      fetchAll();
    }

    setLoading(false);
  };

  // ownerList is passed when called during the first load, before ownersById is ready.
  const handleEdit = (key, ownerList) => {
    const ownerObj = (ownerList ? ownerList.find((o) => o.id === key.owner_id) : ownersById.get(key.owner_id)) || null;
    setForm({
      key_id: key.key_id,
      UID: key.UID,
      room_number: key.room_number || "",
      room_location: key.room_location || "",
      room_address: key.room_address || "",
      machine_id: key.machine_id == null ? "" : String(key.machine_id),
      owner_id: key.owner_id ?? "",
    });
    setSelectedOwner(ownerObj);
    setOwnerSearch(ownerObj ? ownerObj.name + (ownerObj.email ? ` (${ownerObj.email})` : "") : "");
    setEditMode(true);
    setEditingKeyId(key.id);
    setMessage(`Editing Key: ${key.key_id}`);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this key?")) return;
    const { error } = await supabase.from("keys").delete().eq("id", id);
    if (!error) {
      setMessage("Key deleted.");
      fetchAll();
    }
  };

  useLoadOnMount(fetchAll);

  const resetForm = () => {
    setForm({
      key_id: "",
      UID: "",
      room_number: "",
      room_location: "",
      room_address: "",
      machine_id: "",
      owner_id: "",
    });
    setEditMode(false);
    setEditingKeyId(null);
    setOwnerSearch("");
    setSelectedOwner(null);
    setMessage("");
  };

  const isUrl = (v) => /^https?:\/\//i.test(String(v || "").trim());
  const field = (label, name, props = {}) => (
    <div>
      <label className="k-label" htmlFor={`k-${name}`}>
        {label}
      </label>
      <input id={`k-${name}`} name={name} value={form[name]} onChange={handleChange} className="k-input" {...props} />
    </div>
  );

  // -------- RENDER --------
  return (
    <div className="k-page">
      <PageHeader eyebrow="Keys" title="All keys" subtitle="Every physical key, its room, owner and machine." />

      <Notice>{message}</Notice>
      <div className="space-y-6">
        <FormPanel title={editMode ? "Edit key" : "Add key"} addLabel="Add key" forceOpen={editMode}>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
            <div className="grid grid-cols-2 gap-3">
              {field("Key ID", "key_id", { placeholder: "e.g. Key 204", required: true })}
              {field("UID (tag)", "UID", { placeholder: "e.g. 1D52D2EC", required: true })}
            </div>
            {field("Room number", "room_number", { placeholder: "e.g. 204" })}
            {field("Room location (map link)", "room_location", { placeholder: "Paste a Google Maps link" })}
            {field("Room address", "room_address", { placeholder: "Street, building, floor…" })}
            <div>
              <label className="k-label" htmlFor="k-machine">
                Machine
              </label>
              <select
                id="k-machine"
                name="machine_id"
                value={form.machine_id === null ? "" : String(form.machine_id)}
                onChange={handleChange}
                className="k-input"
              >
                <option value="">No machine</option>
                {machines.map((m) => (
                  <option key={m.machine_id} value={String(m.machine_id)}>
                    {m.machine_name} ({String(m.machine_id).trim()})
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <label className="k-label" htmlFor="k-owner">
                Owner
              </label>
              <div className="relative">
                <input
                  id="k-owner"
                  value={ownerSearch}
                  onChange={handleOwnerSearch}
                  placeholder="Type owner name or email"
                  autoComplete="off"
                  className={`k-input ${selectedOwner ? "!pr-10 !border-[#1d8a3a]" : ""}`}
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
            <div className="flex gap-2 pt-2 md:col-span-2 lg:col-span-3 md:justify-end">
              <button type="submit" disabled={loading} className="k-btn-primary flex-1 md:flex-none md:min-w-40">
                {loading ? "Saving…" : editMode ? "Save changes" : "Add key"}
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
          title="Keys"
          rows={keys}
          loading={!loaded}
          exportName="keys"
          searchPlaceholder="Search key, UID, room, owner, machine"
          defaultSort={{ key: "key_id", dir: "asc" }}
          emptyText="No keys yet. Add your first one."
          filters={[
            { key: "all", label: "All", test: () => true },
            { key: "in", label: "In machine", test: (k) => statusByKeyId.get(k.id)?.kind === "in" },
            { key: "guest", label: "With guest", test: (k) => statusByKeyId.get(k.id)?.kind === "guest" },
            { key: "out", label: "Out", test: (k) => statusByKeyId.get(k.id)?.kind === "out" },
            { key: "unassigned", label: "No owner", test: (k) => !k.owner_id },
            { key: "nomachine", label: "No machine", test: (k) => !k.machine_id },
            { key: "relink", label: "Unknown machine", test: (k) => !!k.machine_id && !getMachine(k.machine_id) },
          ]}
          columns={[
            {
              key: "key_id",
              mobile: "title",
              header: "Key",
              cell: (k) => <span className="font-medium">{k.key_id}</span>,
            },
            {
              key: "UID",
              header: "UID",
              cell: (k) => (k.UID ? <code className="text-[12px] k-muted">{k.UID}</code> : null),
            },
            {
              key: "room_number",
              mobile: "subtitle",
              mobileCell: (k) => (k.room_number ? `Room ${k.room_number}` : ""),
              header: "Room",
            },
            {
              key: "room",
              header: "Address",
              value: (k) => k.room_address || (isUrl(k.room_location) ? "" : k.room_location),
              cell: (k) => (
                <div className="max-w-[220px]">
                  {k.room_address && <div>{k.room_address}</div>}
                  {isUrl(k.room_location) ? (
                    <a href={k.room_location} target="_blank" rel="noopener noreferrer" className="k-link text-[13px]">
                      Open map ↗
                    </a>
                  ) : (
                    k.room_location && <div className="text-[13px] k-muted">{k.room_location}</div>
                  )}
                </div>
              ),
            },
            {
              key: "machine",
              mobile: "meta",
              mobileText: (k) => {
                const m = getMachine(k.machine_id);
                return m ? m.machine_name : k.machine_id ? "Needs relink" : "No machine";
              },
              header: "Machine",
              value: (k) => {
                const m = getMachine(k.machine_id);
                return m ? `${m.machine_name || ""} ${m.machine_id}` : "";
              },
              cell: (k) => {
                if (!k.machine_id) return <span className="k-faint">None</span>;
                const m = getMachine(k.machine_id);
                if (!m) return <span className="k-badge-orange">Unknown · relink</span>;
                return (
                  <>
                    <div>{m.machine_name}</div>
                    <div className="text-[12px] k-faint">{String(m.machine_id).trim()}</div>
                  </>
                );
              },
            },
            {
              key: "owner",
              mobile: "meta",
              mobileText: (k) => getOwner(k.owner_id)?.name || "No owner",
              header: "Owner",
              value: (k) => getOwner(k.owner_id)?.name || "",
              cell: (k) => {
                const o = getOwner(k.owner_id);
                return o ? (
                  <>
                    <div>{o.name}</div>
                    <div className="text-[12px] k-faint">{o.email}</div>
                  </>
                ) : (
                  <span className="k-faint">None</span>
                );
              },
            },
            {
              key: "status",
              mobile: "badge",
              header: "Status",
              value: (k) => statusByKeyId.get(k.id)?.label || "",
              cell: (k) => {
                const st = statusByKeyId.get(k.id);
                if (!st) return null;
                const badge =
                  st.kind === "in" ? "k-badge-green" : st.kind === "guest" ? "k-badge-blue" : "k-badge-gray";
                return (
                  <>
                    <span className={badge}>{st.label}</span>
                    <div className="mt-1 text-[12px] k-faint">{st.detail}</div>
                  </>
                );
              },
            },
          ]}
          rowClassName={(k) => (k.id === editingKeyId ? "!bg-[#e8f2fd]" : "")}
          rowActions={(k) => (
            <>
              <RowAction
                onClick={() => {
                  handleEdit(k);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Edit
              </RowAction>
              <RowAction tone="danger" onClick={() => handleDelete(k.id)}>
                Delete
              </RowAction>
            </>
          )}
        />
      </div>
    </div>
  );
}

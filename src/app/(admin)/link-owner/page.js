"use client";
import { useState } from "react";
import { useLoadOnMount } from "@/utils/useLoadOnMount";
import { supabase } from "@/utils/supabaseClient";
import DataTable, { RowAction } from "@/components/DataTable";
import PageHeader, { Notice, FormPanel } from "@/components/PageHeader";

export default function LinkOwnerPage() {
  // --- Link form states ---
  const [ownerEmail, setOwnerEmail] = useState("");
  const [foundOwners, setFoundOwners] = useState([]);
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [availableKeys, setAvailableKeys] = useState([]);
  const [keySearch, setKeySearch] = useState("");
  const [foundKeys, setFoundKeys] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [machineSearch, setMachineSearch] = useState("");
  const [foundMachines, setFoundMachines] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [message, setMessage] = useState("");

  // --- Table data states ---
  const [keys, setKeys] = useState([]);
  const [machines, setMachines] = useState([]);
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Edit mode ---
  const [editMode, setEditMode] = useState(false);
  const [editingKeyId, setEditingKeyId] = useState(null);

  const fetchAll = async () => {
    const [keysRes, machinesRes, ownersRes] = await Promise.all([
      supabase.from("keys").select("*").not("owner_id", "is", null).not("machine_id", "is", null),
      supabase.from("machines").select('id, machine_id, "Machine name"'),
      supabase.from("users").select("id, name, email"),
    ]);
    setKeys(keysRes.data || []);
    setMachines(machinesRes.data || []);
    setOwners(ownersRes.data || []);
    setLoading(false);
  };

  // For the linking form:
  const fetchUnassignedKeys = async () => {
    const { data: keys } = await supabase.from("keys").select("*").is("owner_id", null);
    setAvailableKeys(keys || []);
  };

  // Lookup helpers for the table:
  // keys.machine_id holds the machine code (e.g. "A12"), like Create Key and the pickup flow expect.
  // Older rows linked here may hold machines.id, so match either.
  const getMachine = (id) =>
    machines.find((m) => String(m.machine_id) === String(id)) || machines.find((m) => String(m.id) === String(id));
  const getOwner = (id) => owners.find((o) => o.id === id);

  // --- Linking form logic (search, select, submit, edit, delete) ---
  const handleEmailInput = async (e) => {
    const value = e.target.value;
    setOwnerEmail(value);
    setSelectedOwner(null);
    if (value.length < 2) {
      setFoundOwners([]);
      return;
    }
    const { data } = await supabase.from("users").select("id, name, email").ilike("email", `%${value.trim()}%`);
    setFoundOwners(data || []);
  };
  const handleOwnerSelect = (owner) => {
    setSelectedOwner(owner);
    setOwnerEmail(owner.email);
    setFoundOwners([]);
  };
  const handleKeySearchInput = (e) => {
    const value = e.target.value;
    setKeySearch(value);
    setSelectedKey(null);
    if (value.length < 1) {
      setFoundKeys([]);
      return;
    }
    const filtered = availableKeys.filter(
      (k) =>
        (k.key_id || "").toLowerCase().includes(value.trim().toLowerCase()) ||
        (k.UID || "").toLowerCase().includes(value.trim().toLowerCase())
    );
    setFoundKeys(filtered);
  };
  const handleKeySelect = (key) => {
    setSelectedKey(key);
    setKeySearch(key.key_id || key.id);
    setFoundKeys([]);
  };
  const handleMachineSearchInput = (e) => {
    const value = e.target.value;
    setMachineSearch(value);
    setSelectedMachine(null);
    if (value.length < 1) {
      setFoundMachines([]);
      return;
    }
    const filtered = machines.filter(
      (m) =>
        (m.machine_id || "").toLowerCase().includes(value.trim().toLowerCase()) ||
        (m["Machine name"] || "").toLowerCase().includes(value.trim().toLowerCase())
    );
    setFoundMachines(filtered);
  };
  const handleMachineSelect = (machine) => {
    setSelectedMachine(machine);
    setMachineSearch(machine.machine_id || machine.id);
    setFoundMachines([]);
  };

  // Add or Edit Link
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedKey && !editMode) return;
    if (!selectedOwner || !selectedMachine) return;
    const payload = {
      owner_id: selectedOwner.id,
      machine_id: selectedMachine.machine_id,
    };
    let error;
    if (editMode && editingKeyId) {
      ({ error } = await supabase.from("keys").update(payload).eq("id", editingKeyId));
    } else {
      ({ error } = await supabase.from("keys").update(payload).eq("id", selectedKey.id));
    }
    if (!error) {
      setAvailableKeys((prev) => prev.filter((k) => k.id !== (editMode ? editingKeyId : selectedKey.id)));
      setSelectedKey(null);
      setKeySearch("");
      setSelectedMachine(null);
      setMachineSearch("");
      setSelectedOwner(null);
      setOwnerEmail("");
      setEditMode(false);
      setEditingKeyId(null);
      setFoundOwners([]);
      setFoundKeys([]);
      setFoundMachines([]);
      setMessage(editMode ? "✅ Link updated." : "✅ Key linked.");
      fetchAll();
      fetchUnassignedKeys();
    } else {
      setMessage("❌ Failed to link key: " + error.message);
    }
  };

  // Edit button in the table
  const handleEdit = (row) => {
    const owner = getOwner(row.owner_id);
    setSelectedOwner(owner || null);
    setOwnerEmail(owner?.email || "");
    setSelectedKey(row);
    setKeySearch(row.key_id || row.id);
    const machine = getMachine(row.machine_id);
    setSelectedMachine(machine || null);
    setMachineSearch(machine?.machine_id || machine?.id || "");
    setFoundOwners([]);
    setFoundKeys([]);
    setFoundMachines([]);
    setEditMode(true);
    setEditingKeyId(row.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Delete button in the table
  const handleDelete = async (rowId) => {
    if (!window.confirm("Are you sure you want to delete this link?")) return;
    const { error } = await supabase.from("keys").update({ owner_id: null, machine_id: null }).eq("id", rowId);
    if (!error) {
      setMessage("✅ Link deleted.");
      fetchAll();
      fetchUnassignedKeys();
    }
  };

  useLoadOnMount(async () => {
    await Promise.all([fetchAll(), fetchUnassignedKeys()]);
  });

  const cancelEdit = () => {
    setEditMode(false);
    setEditingKeyId(null);
    setSelectedKey(null);
    setKeySearch("");
    setSelectedMachine(null);
    setMachineSearch("");
    setSelectedOwner(null);
    setOwnerEmail("");
    setMessage("");
    setFoundOwners([]);
    setFoundKeys([]);
    setFoundMachines([]);
  };

  const canSubmit = editMode
    ? selectedOwner && selectedMachine && editingKeyId
    : selectedOwner && selectedKey && selectedMachine;

  return (
    <div className="k-page">
      <PageHeader
        eyebrow="Link Owner"
        title="Assign keys"
        subtitle="Connect a key to its owner and the machine it lives in."
      />

      <Notice>{message}</Notice>
      <div className="space-y-6">
        <FormPanel title={editMode ? "Edit link" : "New link"} addLabel="Link a key" forceOpen={editMode}>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
            <Typeahead
              label="Owner"
              placeholder="Search owner email"
              type="email"
              value={ownerEmail}
              onChange={handleEmailInput}
              selected={!!selectedOwner}
              items={foundOwners}
              itemKey={(o) => o.id}
              renderItem={(o) => (
                <>
                  <span className="font-medium">{o.name}</span>
                  <span className="ml-2 text-[13px] k-faint">{o.email}</span>
                </>
              )}
              onPick={handleOwnerSelect}
            />
            <Typeahead
              label="Key"
              placeholder={
                editMode ? "Key being edited" : availableKeys.length ? "Search key ID or UID" : "No unassigned keys"
              }
              value={keySearch}
              onChange={handleKeySearchInput}
              disabled={editMode || availableKeys.length === 0}
              selected={!!selectedKey}
              items={foundKeys}
              itemKey={(k) => k.id}
              renderItem={(k) => (
                <>
                  <span className="font-medium">{k.key_id || k.id}</span>
                  <span className="ml-2 text-[13px] k-faint">{k.UID}</span>
                </>
              )}
              onPick={handleKeySelect}
            />
            <Typeahead
              label="Machine"
              placeholder="Search machine code or name"
              value={machineSearch}
              onChange={handleMachineSearchInput}
              disabled={machines.length === 0}
              selected={!!selectedMachine}
              items={foundMachines}
              itemKey={(m) => m.id}
              renderItem={(m) => (
                <>
                  <span className="font-medium">{m.machine_id}</span>
                  <span className="ml-2 text-[13px] k-faint">{m["Machine name"]}</span>
                </>
              )}
              onPick={handleMachineSelect}
            />
            <div className="flex gap-2 pt-2 md:col-span-2 lg:col-span-3 md:justify-end">
              <button type="submit" className="k-btn-primary flex-1 md:flex-none md:min-w-40" disabled={!canSubmit}>
                {editMode ? "Save link" : "Link key"}
              </button>
              {editMode && (
                <button type="button" onClick={cancelEdit} className="k-btn-secondary">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </FormPanel>

        <DataTable
          title="Linked keys"
          rows={keys}
          loading={loading}
          exportName="linked-keys"
          searchPlaceholder="Search keys, owners, machines"
          defaultSort={{ key: "room", dir: "asc" }}
          emptyText="No linked keys yet."
          filters={[
            { key: "all", label: "All", test: () => true },
            { key: "relink", label: "Needs relink", test: (k) => k.machine_id != null && !getMachine(k.machine_id) },
          ]}
          columns={[
            {
              key: "key_id",
              mobile: "title",
              header: "Key",
              value: (k) => k.key_id || k.id,
              cell: (k) => <span className="font-medium">{k.key_id || k.id}</span>,
            },
            {
              key: "UID",
              header: "UID",
              cell: (k) => (k.UID ? <code className="text-[12px] k-muted">{k.UID}</code> : null),
            },
            {
              key: "room",
              mobile: "subtitle",
              mobileCell: (k) => (k.room_number ? `Room ${k.room_number}` : ""),
              header: "Room",
              value: (k) => k.room_number,
            },
            {
              key: "machine",
              mobile: "meta",
              mobileText: (k) => {
                const m = getMachine(k.machine_id);
                return m ? m["Machine name"] || m.machine_id : "Needs relink";
              },
              header: "Machine",
              value: (k) => {
                const m = getMachine(k.machine_id);
                return m ? `${m["Machine name"] || ""} ${m.machine_id}` : "";
              },
              cell: (k) => {
                const m = getMachine(k.machine_id);
                if (!m) return <span className="k-badge-orange">Unknown · relink</span>;
                return (
                  <>
                    <div>{m["Machine name"] || m.machine_id}</div>
                    <div className="text-[12px] k-faint">{m.machine_id}</div>
                  </>
                );
              },
            },
            { key: "owner", mobile: "meta", header: "Owner", value: (k) => getOwner(k.owner_id)?.name || "" },
          ]}
          rowClassName={(k) => (k.id === editingKeyId ? "!bg-[#e8f2fd]" : "")}
          rowActions={(k) => (
            <>
              <RowAction onClick={() => handleEdit(k)}>Edit</RowAction>
              <RowAction tone="danger" onClick={() => handleDelete(k.id)}>
                Unlink
              </RowAction>
            </>
          )}
        />
      </div>
    </div>
  );
}

/** Text field with a dropdown of matches (used for owner / key / machine search). */
function Typeahead({ label, items, itemKey, renderItem, onPick, selected, ...input }) {
  return (
    <div className="relative">
      <label className="k-label">{label}</label>
      <div className="relative">
        <input {...input} autoComplete="off" className={`k-input ${selected ? "!pr-10 !border-[#1d8a3a]" : ""}`} />
        {selected && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#1d8a3a]" aria-label="Selected">
            ✓
          </span>
        )}
      </div>
      {items.length > 0 && (
        <ul className="absolute left-0 top-full z-20 mt-1.5 max-h-56 w-full overflow-y-auto rounded-2xl bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)] border border-black/5">
          {items.map((it) => (
            <li key={itemKey(it)}>
              <button
                type="button"
                onClick={() => onPick(it)}
                className="w-full text-left rounded-xl px-3 py-2 hover:bg-[#f5f5f7]"
              >
                {renderItem(it)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

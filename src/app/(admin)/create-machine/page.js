"use client";
import { useState, useEffect } from "react";
import { useLoadOnMount } from "@/utils/useLoadOnMount";
import { supabase } from "@/utils/supabaseClient";
import { authHeaders } from "@/utils/requireRole";
import DataTable, { RowAction } from "@/components/DataTable";
import PageHeader, { Notice, FormPanel } from "@/components/PageHeader";

export default function CreateMachinePage() {
  const [form, setForm] = useState({
    machineId: "",
    machineName: "",
    location: "",
    machineAddress: "",
    capacity: "",
    cloudUrl: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [machines, setMachines] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingMachineId, setEditingMachineId] = useState(null);

  // Track refresh status per machine
  // Example: { A01: { text: 'Refresh started', color: 'green' }, ABC: { text:'Error', color:'red' } }
  const [refreshStatus, setRefreshStatus] = useState({});

  // Track number of whitelist registrations per machine (keys already registered)
  // keyed by machine_id, e.g. { A12: 2 }
  const [regCounts, setRegCounts] = useState({});

  const isValidMachineId = (id) => /^[A-D0-9]{3}$/.test(id);

  const fetchMachines = async () => {
    const { data, error } = await supabase.from("machines").select("*");
    if (error) {
      console.error("Error fetching machines:", error);
    } else {
      setMachines(data || []);
    }
    setLoaded(true);
  };

  // After we have the list of machines, fetch how many UIDs are registered
  // in machine_whitelist for each machine.
  // After we have the list of machines, fetch how many active UIDs
  // are registered in key_slot_presence for each machine.
  useEffect(() => {
    const fetchRegistrationCounts = async () => {
      const counts = {};

      if (!machines || machines.length === 0) {
        setRegCounts({});
        return;
      }

      await Promise.all(
        machines.map(async (m) => {
          if (!m || !m.machine_id) return;

          // Some rows in your DB have "A12\n", so we trim just in case.
          const mid = m.machine_id.trim();

          try {
            // We ask Supabase:
            //  - from key_slot_presence
            //  - only rows for this machine_id
            //  - only rows where UID is NOT null
            //  - we don't need the row data, only the count
            //
            // NOTE: .not('UID','is',null) means "UID IS NOT NULL"
            const { count, error } = await supabase
              .from("key_slot_presence")
              .select("UID", { count: "exact", head: true })
              .eq("machine_id", mid)
              .not("UID", "is", null);

            if (error) {
              console.error("Error fetching UID count for machine", mid, error);
              counts[mid] = 0;
            } else {
              counts[mid] = typeof count === "number" ? count : 0;
            }
          } catch (err) {
            console.error("Unexpected error fetching UID count for machine", mid, err);
            counts[mid] = 0;
          }
        })
      );

      setRegCounts(counts);
    };

    fetchRegistrationCounts();
  }, [machines]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    let { machineId, machineName, location, machineAddress, capacity, cloudUrl } = form;
    machineId = (machineId || "").toUpperCase(); // Force uppercase before validation

    if (!isValidMachineId(machineId)) {
      setMessage("Machine ID must be 3 characters (A-D and 0-9 only).");
      setLoading(false);
      return;
    }

    let error;

    if (editMode) {
      ({ error } = await supabase
        .from("machines")
        .update({
          machine_id: machineId,
          "Machine name": machineName,
          location,
          machine_address: machineAddress,
          capacity: capacity === "" ? null : parseInt(capacity, 10),
          machine_cloud_url:
            String(cloudUrl || "")
              .trim()
              .replace(/\/+$/, "") || null,
        })
        .eq("id", editingMachineId));
    } else {
      ({ error } = await supabase.from("machines").insert([
        {
          machine_id: machineId,
          "Machine name": machineName,
          location,
          machine_address: machineAddress,
          capacity: capacity === "" ? null : parseInt(capacity, 10),
          machine_cloud_url:
            String(cloudUrl || "")
              .trim()
              .replace(/\/+$/, "") || null,
        },
      ]));
    }

    if (error) {
      if (error.code === "23505") {
        setMessage("Machine ID or Machine Name already exists.");
      } else {
        console.error("Error saving machine:", error);
        setMessage("Failed to save machine. Try again.");
      }
    } else {
      setMessage(editMode ? "Machine updated successfully!" : "Machine saved successfully!");
      setForm({ machineId: "", machineName: "", location: "", machineAddress: "", capacity: "", cloudUrl: "" });
      setEditMode(false);
      setEditingMachineId(null);
      fetchMachines();
    }

    setLoading(false);
  };

  const handleEdit = (machine) => {
    setForm({
      machineId: machine.machine_id || "",
      machineName: machine["Machine name"] || "",
      location: machine.location || "",
      machineAddress: machine.machine_address || "",
      capacity: machine.capacity?.toString() || "",
      cloudUrl: machine.machine_cloud_url || "",
    });
    setEditMode(true);
    setEditingMachineId(machine.id);
    setMessage(`Editing Machine: ${machine["Machine name"]}`);
  };

  const handleDelete = async (id) => {
    const confirmDelete = confirm("Are you sure you want to delete this machine?");
    if (!confirmDelete) return;

    const { error } = await supabase.from("machines").delete().eq("id", id);
    if (error) {
      console.error("Error deleting machine:", error);
      setMessage("Failed to delete machine.");
    } else {
      setMessage("Machine deleted successfully.");
      fetchMachines();
    }
  };

  // Trigger a refresh for the given machine by calling the secure API route
  const handleRefresh = async (machineId) => {
    // Immediately indicate refresh has started
    setRefreshStatus((prev) => ({
      ...prev,
      [machineId]: { text: "Refreshing…", color: "gray" },
    }));

    try {
      const res = await fetch(`/api/machines/${machineId}/refresh-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders(supabase)) },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // error from backend or Pi
        setRefreshStatus((prev) => ({
          ...prev,
          [machineId]: {
            text: data?.error ? `Error: ${data.error}` : `Error ${res.status}`,
            color: "red",
          },
        }));
        return;
      }

      // success from Pi (e.g. { status: 'refresh started' })
      const msg = data?.status || "Refresh started";
      setRefreshStatus((prev) => ({
        ...prev,
        [machineId]: { text: msg, color: "green" },
      }));

      // important: reload machines (and therefore regCounts)
      await fetchMachines();
    } catch (err) {
      setRefreshStatus((prev) => ({
        ...prev,
        [machineId]: { text: "Network error", color: "red" },
      }));
    }
  };

  useLoadOnMount(fetchMachines);

  const resetForm = () => {
    setForm({ machineId: "", machineName: "", location: "", machineAddress: "", capacity: "", cloudUrl: "" });
    setEditMode(false);
    setEditingMachineId(null);
    setMessage("");
  };

  const isUrl = (v) => /^https?:\/\//i.test(String(v || "").trim());
  const usage = (m) => {
    const reg = regCounts[(m.machine_id || "").trim()];
    const cap = Number(m.capacity);
    return { reg: reg ?? null, cap: Number.isFinite(cap) && cap > 0 ? cap : null };
  };

  const field = (label, name, props = {}, hint) => (
    <div>
      <label className="k-label" htmlFor={`m-${name}`}>
        {label}
      </label>
      <input id={`m-${name}`} name={name} value={form[name]} onChange={handleChange} className="k-input" {...props} />
      {hint && <p className="mt-1.5 text-[12px] k-faint">{hint}</p>}
    </div>
  );

  return (
    <div className="k-page">
      <PageHeader eyebrow="Machines" title="Your machines" subtitle="Where keys live, and how full each one is." />

      <Notice>{message}</Notice>
      <div className="space-y-6">
        <FormPanel title={editMode ? "Edit machine" : "Add machine"} addLabel="Add machine" forceOpen={editMode}>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
            {field(
              "Machine ID",
              "machineId",
              { placeholder: "e.g. A12", required: true, maxLength: 3 },
              "3 characters: A–D and 0–9."
            )}
            {field("Name", "machineName", { placeholder: "e.g. Alpha", required: true })}
            {field("Location (map link)", "location", { placeholder: "Paste a Google Maps link", required: true })}
            {field("Address", "machineAddress", { placeholder: "Street, building, floor…" })}
            {field("Capacity", "capacity", { type: "number", min: 1, placeholder: "Number of slots", required: true })}
            {field(
              "Pi address",
              "cloudUrl",
              { type: "url", placeholder: "https://api-a08.myotp.site" },
              "Used by Refresh. The Pi's Cloudflare Tunnel address."
            )}
            <div className="flex gap-2 pt-2 md:col-span-2 lg:col-span-3 md:justify-end">
              <button type="submit" disabled={loading} className="k-btn-primary flex-1 md:flex-none md:min-w-40">
                {loading ? "Saving…" : editMode ? "Save changes" : "Add machine"}
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
          title="All machines"
          rows={machines}
          loading={!loaded}
          exportName="machines"
          searchPlaceholder="Search ID, name, address"
          defaultSort={{ key: "machine_id", dir: "asc" }}
          emptyText="No machines yet. Add your first one."
          columns={[
            {
              key: "machine_id",
              mobile: "title",
              header: "ID",
              value: (m) => (m.machine_id || "").trim(),
              cell: (m) => <span className="font-medium">{(m.machine_id || "").trim()}</span>,
            },
            { key: "name", mobile: "subtitle", header: "Name", value: (m) => m["Machine name"] },
            {
              key: "place",
              mobile: "meta",
              mobileText: (m) => m.machine_address || "",
              header: "Address",
              value: (m) => m.machine_address || (isUrl(m.location) ? "" : m.location),
              cell: (m) => (
                <div className="max-w-[260px]">
                  {m.machine_address && <div>{m.machine_address}</div>}
                  {isUrl(m.location) ? (
                    <a href={m.location} target="_blank" rel="noopener noreferrer" className="k-link text-[13px]">
                      Open map ↗
                    </a>
                  ) : (
                    m.location && <div className="text-[13px] k-muted">{m.location}</div>
                  )}
                </div>
              ),
            },
            {
              key: "capacity",
              mobile: "meta",
              mobileText: (m) => {
                const u = usage(m);
                return u.cap ? `${u.reg ?? 0} of ${u.cap} keys` : "";
              },
              header: "Keys / capacity",
              value: (m) => {
                const u = usage(m);
                return u.cap ? (u.reg ?? 0) / u.cap : -1;
              },
              cell: (m) => {
                const { reg, cap } = usage(m);
                if (!cap) return m.capacity ?? null;
                const pct = Math.min(100, Math.round(((reg ?? 0) / cap) * 100));
                return (
                  <div className="w-28">
                    <div className="text-[13px]">
                      {reg ?? "…"} <span className="k-faint">/ {cap}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: pct >= 90 ? "#d70015" : "#0071e3" }}
                      />
                    </div>
                  </div>
                );
              },
              export: true,
            },
            {
              key: "status",
              header: "Refresh",
              sortable: false,
              search: false,
              export: false,
              value: (m) => refreshStatus[m.machine_id]?.text || "",
              cell: (m) => {
                const st = refreshStatus[m.machine_id];
                if (!st) return <span className="k-faint">—</span>;
                const cls =
                  st.color === "green" ? "k-badge-green" : st.color === "red" ? "k-badge-red" : "k-badge-gray";
                return (
                  <span className={cls} title={st.text}>
                    {st.text.length > 28 ? st.text.slice(0, 28) + "…" : st.text}
                  </span>
                );
              },
            },
          ]}
          rowClassName={(m) => (m.id === editingMachineId ? "!bg-[#e8f2fd]" : "")}
          rowActions={(m) => (
            <>
              <RowAction
                tone="primary"
                onClick={() => handleRefresh(m.machine_id)}
                disabled={refreshStatus[m.machine_id]?.text === "Refreshing…"}
              >
                Refresh
              </RowAction>
              <RowAction onClick={() => handleEdit(m)}>Edit</RowAction>
              <RowAction tone="danger" onClick={() => handleDelete(m.id)}>
                Delete
              </RowAction>
            </>
          )}
        />
      </div>
    </div>
  );
}

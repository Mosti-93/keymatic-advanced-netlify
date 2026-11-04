"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";
import { authHeaders } from "@/utils/requireRole";
import { CheckingAccess } from "@/utils/useRequireRole";
import AppShell from "@/components/AppShell";
import DataTable, { RowAction, toDate, fmtDate } from "@/components/DataTable";
import PageHeader, { Notice, FormPanel } from "@/components/PageHeader";
import { guestStatus, GUEST_FILTERS, STATUS_BADGE } from "@/utils/guestStatus";

/** Today at 10:00, formatted for a datetime-local input (default check-in). */
function defaultCheckIn() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T10:00`;
}

export default function OwnerPanelPage() {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(() => ({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    keyId: "",
    checkIn: defaultCheckIn(),
    checkOut: "",
    platform: "",
  }));
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
    "Fairbnb & similar",
  ];

  const [clients, setClients] = useState([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [keys, setKeys] = useState([]);
  const [slotPresence, setSlotPresence] = useState([]); // <-- Added!
  const [message, setMessage] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Fetch slot_presence table
  const fetchSlotPresence = async () => {
    const { data } = await supabase.from("key_slot_presence").select("machine_id, slot_number, UID");
    setSlotPresence(data || []);
  };

  async function handleStartPickup(client) {
    setMessage("⏳ Starting pickup...");

    // Resolve first/last even if only client.name exists
    const parsedFirst = client.first_name || (client.name ? client.name.trim().split(" ")[0] : "") || "";
    const parsedLast = client.last_name || (client.name ? client.name.trim().split(" ").slice(1).join(" ") : "") || "";

    const key = keys.find((k) => k.uuid === client.key_id);

    // Validate key exists
    if (!key) {
      setMessage("❌ No key assigned to this client");
      return;
    }

    const machineId = key?.machine_id || "";
    const roomNo = key?.room_number || "";
    const UID = key?.UID || "";

    // Check if key is physically in the machine
    const keyInMachine = slotPresence.some((sp) => sp.UID === UID);
    if (!keyInMachine) {
      setMessage("❌ Key not detected in machine - please insert the key first");
      return;
    }

    // Fallback for slot_number using slotPresence table
    let slot_number = key?.slot_number || "";
    if (!slot_number && key?.UID) {
      const matchingSlots = slotPresence.filter((sp) => sp.UID === key.UID);

      if (matchingSlots.length > 0) {
        // Try exact match first
        const exactMatch = matchingSlots.find((sp) => String(sp.machine_id) === String(key.machine_id));
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
        headers: { "Content-Type": "application/json", ...(await authHeaders(supabase)) },
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
    if (!val) return "";
    return val.replace(" ", "T").slice(0, 16);
  }

  const fetchClients = useCallback(async () => {
    const { data } = await supabase.from("clients").select("*").eq("owner_id", ownerId);
    setClients(data || []);
    setClientsLoaded(true);
  }, [ownerId]);

  const fetchKeys = useCallback(async () => {
    const { data } = await supabase
      .from("keys")
      .select("uuid, room_number, owner_id, UID, machine_id")
      .eq("owner_id", ownerId);
    setKeys(data || []);
  }, [ownerId]);

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
          owner_id: ownerId,
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
          owner_id: ownerId,
          platform: form.platform,
        },
      ]);
    }

    const { error } = result;
    if (error) {
      if (error.message.includes("unique_client_email")) setMessage("⚠️ Email is already used.");
      else if (error.message.includes("unique_client_phone")) setMessage("⚠️ Phone number is already used.");
      else setMessage(`❌ ${error.message}`);
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

      setEditMode(false);
      setEditingId(null);
      fetchClients();
    }
  };

  const handleEdit = (client) => {
    setForm({
      firstName: client.first_name || "",
      lastName: client.last_name || "",
      email: client.email,
      phone: client.phone,
      keyId: client.key_id || "",
      checkIn: client.check_in,
      checkOut: client.check_out,
      platform: client.platform || "",
    });
    setEditMode(true);
    setEditingId(client.id);
    setMessage(`✏️ Editing ${client.first_name} ${client.last_name}`);
  };

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this client?")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (!error) {
      setMessage("✅ Client deleted.");
      fetchClients();
    }
  };

  useEffect(() => {
    const fetchOwner = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: profile, error } = await supabase
        .from("users")
        .select("id, role, name, email")
        .eq("id", user.id)
        .single();
      if (
        error ||
        String(profile?.role || "")
          .trim()
          .toLowerCase() !== "owner"
      )
        return router.replace("/login");
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
  }, [ownerId, fetchClients, fetchKeys]);

  useEffect(() => {
    fetchSlotPresence();
  }, []);

  if (!ownerId) return <CheckingAccess />;

  const resetForm = () => {
    setForm({ firstName: "", lastName: "", email: "", phone: "", keyId: "", checkIn: "", checkOut: "", platform: "" });
    setEditMode(false);
    setEditingId(null);
    setMessage("");
  };
  const keyFor = (c) => keys.find((k) => k.uuid === c.key_id);
  const inMachine = (k) => !!k?.UID && slotPresence.some((sp) => sp.UID === k.UID);
  const counts = {
    now: clients.filter((c) => guestStatus(c) === "current").length,
    upcoming: clients.filter((c) => guestStatus(c) === "upcoming").length,
    keys: keys.length,
    ready: keys.filter(inMachine).length,
  };
  const input = (label, name, props = {}) => (
    <div>
      <label className="k-label" htmlFor={`o-${name}`}>
        {label}
      </label>
      <input id={`o-${name}`} name={name} value={form[name]} onChange={handleChange} className="k-input" {...props} />
    </div>
  );
  const firstName = (profile?.name || "").split(" ")[0];

  return (
    <AppShell nav={[]} homeHref="/owner-panel">
      <div className="k-page">
        <PageHeader
          eyebrow="Owner"
          title={firstName ? `Hi, ${firstName}.` : "Your guests"}
          subtitle="Add guests and send their pickup links."
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 k-fade-in-2">
          {[
            ["Staying now", counts.now],
            ["Upcoming", counts.upcoming],
            ["Your keys", counts.keys],
            ["Keys in machine", counts.ready],
          ].map(([label, v]) => (
            <div key={label} className="k-card !p-6">
              <div className="text-[13px] k-muted">{label}</div>
              <div className="mt-1 text-4xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>
                {v}
              </div>
            </div>
          ))}
        </div>

        {message && <Notice>{message}</Notice>}

        <div className="space-y-6">
          <FormPanel title={editMode ? "Edit guest" : "Add guest"} addLabel="Add guest" forceOpen={editMode}>
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-start">
              <div className="grid grid-cols-2 gap-3">
                {input("First name", "firstName", { required: true })}
                {input("Last name", "lastName", { required: true })}
              </div>
              {input("Email", "email", { type: "email", required: true, placeholder: "guest@example.com" })}
              {input("Phone", "phone", { placeholder: "+20 …" })}
              <div>
                <label className="k-label" htmlFor="o-key">
                  Room / key
                </label>
                <select id="o-key" name="keyId" value={form.keyId} onChange={handleChange} className="k-input" required>
                  <option value="">Select a key</option>
                  {keys.map((k) => (
                    <option key={k.uuid} value={k.uuid}>
                      Room {k.room_number} · {k.UID || k.uuid}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="k-label" htmlFor="o-platform">
                  Platform
                </label>
                <input
                  id="o-platform"
                  list="platform-options"
                  name="platform"
                  value={form.platform}
                  onChange={handleChange}
                  placeholder="Airbnb, Booking.com…"
                  className="k-input"
                  required
                />
                <datalist id="platform-options">
                  {platforms.map((p, idx) => (
                    <option key={idx} value={p} />
                  ))}
                  <option value="Other" />
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="k-label" htmlFor="o-checkIn">
                    Check-in
                  </label>
                  <input
                    id="o-checkIn"
                    type="datetime-local"
                    name="checkIn"
                    value={toDateTimeLocal(form.checkIn)}
                    onChange={handleChange}
                    className="k-input"
                  />
                </div>
                <div>
                  <label className="k-label" htmlFor="o-checkOut">
                    Check-out
                  </label>
                  <input
                    id="o-checkOut"
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
            title="Your guests"
            rows={clients}
            loading={!clientsLoaded}
            exportName="my-guests"
            searchPlaceholder="Search name, room, email, phone"
            filters={GUEST_FILTERS}
            defaultSort={{ key: "check_in", dir: "asc" }}
            emptyText="No guests in this view."
            columns={[
              {
                key: "name",
                header: "Guest",
                mobile: "title",
                nowrap: true,
                value: (c) => `${c.first_name || ""} ${c.last_name || ""}`.trim(),
                cell: (c) => <span className="font-medium">{`${c.first_name || ""} ${c.last_name || ""}`.trim()}</span>,
              },
              {
                key: "room",
                header: "Room",
                mobile: "subtitle",
                value: (c) => keyFor(c)?.room_number || "",
                cell: (c) => {
                  const k = keyFor(c);
                  if (!k) return null;
                  return (
                    <>
                      <div>Room {k.room_number}</div>
                      <div className="text-[12px]">
                        {inMachine(k) ? (
                          <span className="text-[#1d8a3a]">● In machine</span>
                        ) : (
                          <span className="k-faint">Not in machine</span>
                        )}
                      </div>
                    </>
                  );
                },
              },
              {
                key: "status",
                header: "Status",
                value: (c) => STATUS_BADGE[guestStatus(c)][1],
                cell: (c) => {
                  const [cls, label] = STATUS_BADGE[guestStatus(c)];
                  return <span className={cls}>{label}</span>;
                },
              },
              {
                key: "check_in",
                header: "Check-in",
                nowrap: true,
                value: (c) => toDate(c.check_in),
                cell: (c) => fmtDate(c.check_in),
              },
              {
                key: "check_out",
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
    </AppShell>
  );
}

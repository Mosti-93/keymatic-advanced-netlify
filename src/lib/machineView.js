// Pure helpers for the Overview and machine pages: turn the raw tables
// (machines, key_slot_presence, keys, clients) into what the screens show.
// No React and no Supabase here, so everything can be tested on its own.

export const clean = (v) => String(v ?? "").trim();
export const norm = (v) => clean(v).toUpperCase();
export const toDate = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(" ", "T"));
  return isNaN(d) ? null : d;
};

/** The machine reports every minute; this much silence means offline. */
export const OFFLINE_AFTER_MS = 3 * 60 * 1000;
/** A door left open longer than this raises an alert. */
export const DOOR_OPEN_ALERT_MS = 5 * 60 * 1000;
/** How far ahead "Upcoming" looks. */
export const UPCOMING_HOURS = 48;
/** A key not returned after a stay counts as overdue for this long (older ones are just "out"). */
export const OVERDUE_DAYS = 30;

export function guestName(c) {
  if (!c) return "";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Guest";
}

/** keys.machine_id normally holds the machine code (e.g. "A12"); older rows may hold machines.id. */
export function keyBelongsTo(key, machine) {
  const mid = clean(key?.machine_id);
  if (!mid || !machine) return false;
  return norm(mid) === norm(machine.machine_id) || mid === String(machine.id);
}

export function findMachineForKey(key, machines) {
  return (machines || []).find((m) => keyBelongsTo(key, m)) || null;
}

/** Map of upper-case UID -> slot row, for slots holding a registered key. */
function slotsByUid(slots) {
  const map = new Map();
  // A key the machine reports as unregistered (NON_REG_UID) may already be registered here,
  // just not synced to the machine yet. It is still physically in that slot.
  for (const s of slots || []) if (!s.UID && s.NON_REG_UID) map.set(norm(s.NON_REG_UID), { ...s, notSynced: true });
  for (const s of slots || []) if (s.UID) map.set(norm(s.UID), s);
  return map;
}

/**
 * One card per machine:
 *  - slots: what is in each slot (registered key, unregistered key, or empty)
 *  - inCount: keys physically inside (registered + unregistered)
 *  - linked: keys assigned to this machine, inside or not
 *  - freeToLink: capacity - linked (room to assign more keys)
 */
export function buildMachineCards({ machines = [], slots = [], keys = [], now = new Date() }) {
  const keyByUid = new Map(keys.filter((k) => k.UID).map((k) => [norm(k.UID), k]));
  return machines
    .map((m) => {
      const code = clean(m.machine_id);
      const mine = slots.filter((s) => norm(s.machine_id) === norm(code));
      const maxSlot = mine.reduce((n, s) => Math.max(n, parseInt(s.slot_number, 10) || 0), 0);
      const capacity = parseInt(m.capacity, 10) || maxSlot || 10;
      const bySlot = new Map(mine.map((s) => [parseInt(s.slot_number, 10), s]));

      const list = Array.from({ length: capacity }, (_, i) => {
        const s = bySlot.get(i + 1);
        const uid = s?.UID ? norm(s.UID) : "";
        // A key the machine does not know (not in its whitelist) is reported in NON_REG_UID.
        const nonReg = !uid && s?.NON_REG_UID ? norm(s.NON_REG_UID) : "";
        // Registered on the website but the machine's key list is old: not unknown, just needs Sync keys.
        const syncKey = nonReg ? keyByUid.get(nonReg) || null : null;
        const unregUid = syncKey ? "" : nonReg;
        const key = uid ? keyByUid.get(uid) || null : syncKey;
        return {
          n: i + 1,
          uid: uid || nonReg,
          unreg: Boolean(unregUid),
          notSynced: Boolean(syncKey),
          key,
          keyId: key?.id ?? null,
          room: key?.room_number ? String(key.room_number) : "",
          keyLabel: key ? key.key_id || key.room_number || uid : "",
          // A registered key that is linked to a different machine.
          foreign: Boolean(key && !keyBelongsTo(key, m)),
        };
      });

      // Keys the machine reports in a slot number above its capacity.
      const outside = mine
        .filter((s) => s.UID && (parseInt(s.slot_number, 10) || 0) > capacity)
        .map((s) => ({
          n: parseInt(s.slot_number, 10),
          room: keyByUid.get(norm(s.UID))?.room_number || norm(s.UID),
        }));

      const linkedKeys = keys.filter((k) => keyBelongsTo(k, m));
      const regIn = list.filter((s) => s.uid && !s.unreg).length;
      const unregIn = list.filter((s) => s.unreg).length;
      const linkedIn = list.filter((s) => s.key && !s.foreign).length;
      const linked = linkedKeys.length;

      const lastSeen = toDate(m.last_seen_at);
      const door = String(m.door_status || "").toLowerCase();
      const doorAt = toDate(m.door_updated_at);

      return {
        id: m.id,
        code,
        name: m["Machine name"] || code,
        place: m.machine_address || m.location || "",
        mapLink: /^https?:\/\//i.test(String(m.location || "")) ? m.location : "",
        capacity,
        slots: list,
        outside,
        regIn,
        unregIn,
        inCount: regIn + unregIn,
        linked,
        linkedIn,
        linkedOut: Math.max(0, linked - linkedIn),
        freeToLink: Math.max(0, capacity - linked),
        freeSlots: Math.max(0, capacity - regIn - unregIn),
        overLinked: linked > capacity,
        lastSeen,
        online: lastSeen ? now - lastSeen < OFFLINE_AFTER_MS : null,
        door: door === "open" || door === "closed" ? door : "",
        doorAt,
        doorOpenTooLong: door === "open" && doorAt ? now - doorAt > DOOR_OPEN_ALERT_MS : false,
        hasCloudUrl: Boolean(clean(m.machine_cloud_url)),
        timezone: clean(m.timezone),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** Slots laid out like the real machine: rows of 5, 4, 5, 4, … */
export function slotRows(slots = []) {
  const rows = [];
  let i = 0;
  while (i < slots.length) {
    const size = rows.length % 2 === 0 ? 5 : 4;
    rows.push(slots.slice(i, i + size));
    i += size;
  }
  return rows;
}

/** Bookings for one key, with parsed dates. */
function stays(clients, key) {
  return (clients || [])
    .filter((c) => c.key_id && key.uuid && c.key_id === key.uuid)
    .map((c) => ({ ...c, _in: toDate(c.check_in), _out: toDate(c.check_out) }))
    .filter((c) => c._in && c._out);
}

/** Most urgent first: used to order the key list. */
export const KEY_STATE_ORDER = ["overdue", "waiting", "guest", "out", "in"];

export const KEY_STATES = {
  in: { label: "In machine", badge: "k-badge-green" },
  waiting: { label: "Waiting pickup", badge: "k-badge-blue" },
  guest: { label: "With guest", badge: "k-badge-blue" },
  overdue: { label: "Not returned", badge: "k-badge-red" },
  out: { label: "Out", badge: "k-badge-gray" },
};

/**
 * Where every key is and who has it:
 *   in       inside a machine, no stay right now
 *   waiting  inside a machine but a guest's stay has started (not picked up yet)
 *   guest    out, and a guest is staying now
 *   overdue  out, the last stay has ended and the key is not back
 *   out      out, no booking explains it
 */
export function buildKeyStatus({ keys = [], slots = [], clients = [], machines = [], now = new Date() }) {
  const inSlot = slotsByUid(slots);
  const overdueFrom = new Date(now.getTime() - OVERDUE_DAYS * 86400000);
  const rows = keys.map((k) => {
    const slot = k.UID ? inSlot.get(norm(k.UID)) : null;
    const machine = findMachineForKey(k, machines);
    const list = stays(clients, k);
    const current = list.find((c) => c._in <= now && now <= c._out) || null;
    const last = list.filter((c) => c._out < now).sort((a, b) => b._out - a._out)[0] || null;
    const next = list.filter((c) => c._in > now).sort((a, b) => a._in - b._in)[0] || null;

    let state;
    let detail;
    let since = null;
    let guest = null;
    if (slot) {
      const where = `${clean(slot.machine_id)} · slot ${slot.slot_number}${slot.notSynced ? " · press Sync keys" : ""}`;
      if (current) {
        state = "waiting";
        guest = current;
        detail = `${guestName(current)} hasn't picked it up · ${where}`;
        since = current._in;
      } else {
        state = "in";
        detail = where;
        since = toDate(k.last_status_time);
      }
    } else if (!k.UID) {
      state = "out";
      detail = "No UID on this key";
    } else if (current) {
      state = "guest";
      guest = current;
      detail = `${guestName(current)} · until ${fmtShort(current._out)}`;
      since = current._in;
    } else if (last && last._out >= overdueFrom) {
      state = "overdue";
      guest = last;
      detail = `${guestName(last)} checked out ${fmtShort(last._out)}`;
      since = last._out;
    } else {
      state = "out";
      detail = "Not in any machine, no booking";
      since = toDate(k.last_status_time);
    }

    return {
      id: k.id,
      keyLabel: k.key_id || k.room_number || k.UID || k.uuid || String(k.id),
      uid: k.UID ? norm(k.UID) : "",
      room: k.room_number ? String(k.room_number) : "",
      machineCode: machine ? clean(machine.machine_id) : clean(k.machine_id),
      machineName: machine ? machine["Machine name"] || clean(machine.machine_id) : "",
      machineKnown: Boolean(machine),
      ownerId: k.owner_id ?? null,
      slot: slot ? parseInt(slot.slot_number, 10) || null : null,
      slotMachine: slot ? clean(slot.machine_id) : "",
      state,
      label: KEY_STATES[state].label,
      badge: KEY_STATES[state].badge,
      detail,
      since,
      guest,
      next,
    };
  });
  const rank = (r) => KEY_STATE_ORDER.indexOf(r.state);
  return rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      String(a.room || a.keyLabel).localeCompare(String(b.room || b.keyLabel), undefined, { numeric: true })
  );
}

/**
 * Bookings that need attention soon:
 *   overdue  stay ended, key not back (top of the list)
 *   pickup   check-in from the start of today up to UPCOMING_HOURS ahead, key still in the machine
 *   return   check-out from now up to UPCOMING_HOURS ahead
 */
export function buildUpcoming({ keyStatus = [], keys = [], clients = [], now = new Date(), hours = UPCOMING_HOURS }) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const horizon = new Date(now.getTime() + hours * 3600000);
  const statusById = new Map(keyStatus.map((r) => [r.id, r]));
  const out = [];

  for (const k of keys) {
    const st = statusById.get(k.id);
    if (!st) continue;
    const base = { keyId: k.id, room: st.room, keyLabel: st.keyLabel, machineCode: st.machineCode };
    if (st.state === "overdue" && st.guest) {
      out.push({ ...base, type: "overdue", at: st.guest._out, guest: guestName(st.guest), clientId: st.guest.id });
    }
    for (const c of stays(clients, k)) {
      const keyInside = st.state === "in" || st.state === "waiting";
      if (c._in >= startOfDay && c._in <= horizon && keyInside) {
        out.push({ ...base, type: "pickup", at: c._in, late: c._in < now, guest: guestName(c), clientId: c.id });
      }
      if (c._out >= now && c._out <= horizon) {
        out.push({ ...base, type: "return", at: c._out, guest: guestName(c), clientId: c.id });
      }
    }
  }
  const rank = { overdue: 0, pickup: 1, return: 1 };
  return out.sort((a, b) => rank[a.type] - rank[b.type] || a.at - b.at);
}

const notReturnedText = (list) =>
  `${list.length} ${list.length === 1 ? "key" : "keys"} not returned: ${list
    .slice(0, 4)
    .map((r) => (r.room ? `room ${r.room}` : r.keyLabel))
    .join(", ")}${list.length > 4 ? "…" : ""}`;

/**
 * Problems support should look at first. Each alert names its machine
 * (`machine`, null when it has none) and has a `short` text for inside that
 * machine's card, plus a full `text` that names the machine.
 */
export function buildAlerts({ cards = [], keyStatus = [] }) {
  const alerts = [];
  const known = new Set(cards.map((m) => norm(m.code)));
  for (const m of cards) {
    const href = `/machines/${encodeURIComponent(m.code)}`;
    const add = (tone, short) =>
      alerts.push({ tone, machine: m.code, href, short, text: `${m.name} (${m.code}): ${short}` });
    if (m.online === false) add("red", `Offline${m.lastSeen ? ` · last seen ${fmtAgo(m.lastSeen)}` : ""}`);
    if (m.doorOpenTooLong) add("orange", `Door open for ${fmtAgo(m.doorAt, "")}`);
    if (m.unregIn > 0) add("orange", `${m.unregIn} unregistered ${m.unregIn === 1 ? "key" : "keys"} inside`);
    const notSynced = m.slots.filter((s) => s.notSynced);
    if (notSynced.length) {
      alerts.push({
        tone: "orange",
        machine: m.code,
        href,
        sync: true,
        short: `Slot ${notSynced.map((s) => s.n).join(", ")}: registered, but the machine doesn't know yet. Press Sync keys.`,
        text: `${m.name} (${m.code}): ${notSynced.length === 1 ? "1 key needs" : `${notSynced.length} keys need`} Sync keys`,
      });
    }
    if (m.overLinked) add("orange", `${m.linked} keys linked but only ${m.capacity} slots`);
    const overdue = keyStatus.filter((r) => r.state === "overdue" && norm(r.machineCode) === norm(m.code));
    if (overdue.length) add("red", notReturnedText(overdue));
  }
  const orphan = keyStatus.filter((r) => r.state === "overdue" && !known.has(norm(r.machineCode)));
  if (orphan.length) {
    const text = `${notReturnedText(orphan)} (no machine)`;
    alerts.push({ tone: "red", machine: null, href: "#keys", short: text, text });
  }
  return alerts;
}

// ---------- machine log ----------

const EVENT_LABELS = {
  door_unlocked: "Door unlocked",
  door_open: "Door opened",
  door_opened: "Door opened",
  door_closed: "Door closed",
  slot_unlocked: "Slot unlocked",
  key_in: "Key returned",
  key_returned: "Key returned",
  key_inserted: "Key returned",
  key_out: "Key picked up",
  key_removed: "Key picked up",
  key_picked_up: "Key picked up",
  pickup: "Key picked up",
  unregistered_key: "Unregistered key",
  whitelist_sync: "Keys synced",
  online: "Machine online",
  offline: "Machine offline",
  boot: "Machine started",
  remote_failed: "Remote action failed",
};

export function eventLabel(kind) {
  const k = String(kind || "").toLowerCase();
  if (EVENT_LABELS[k]) return EVENT_LABELS[k];
  const t = k.replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Event";
}

/** Rough group for filtering and colouring the log. */
export function eventGroup(kind) {
  const k = String(kind || "").toLowerCase();
  if (k.includes("fail") || k.includes("error")) return "problem";
  if (k.startsWith("door")) return "door";
  if (k.startsWith("slot") || k.startsWith("key") || k === "pickup" || k.includes("unreg")) return "key";
  return "machine";
}

export function eventTime(e) {
  return toDate(e?.created_at || e?.inserted_at || e?.at || e?.ts) || null;
}

/** Newest first, whatever the time column is called. */
export function sortEvents(events = []) {
  return [...events].sort((a, b) => (eventTime(b)?.getTime() || 0) - (eventTime(a)?.getTime() || 0));
}

// ---------- formatting ----------

export function fmtShort(d) {
  const v = toDate(d);
  if (!v) return "—";
  return v.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(d) {
  const v = toDate(d);
  return v ? v.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
}

/** "just now", "4 min ago", "2 h ago", "3 d ago" (suffix "" drops "ago"). */
export function fmtAgo(d, suffix = " ago", now = new Date()) {
  const v = toDate(d);
  if (!v) return "—";
  const s = Math.max(0, Math.round((now - v) / 1000));
  if (s < 45) return suffix ? "just now" : "under a minute";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min${suffix}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h${suffix}`;
  return `${Math.round(h / 24)} d${suffix}`;
}

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";
import { DateTime } from "npm:luxon";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
const SITE_URL = (Deno.env.get("SITE_URL") || "https://keymatic.myotp.site").replace(/\/+$/, "");
// Optional: shown as "Need help? WhatsApp …" when set (Supabase secret SUPPORT_CONTACT).
const SUPPORT_CONTACT = (Deno.env.get("SUPPORT_CONTACT") || "").trim();

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const hmacKey = "mysupersecretkey";
const DEFAULT_CLOUD_URL = "https://roy-il-breast-mineral.trycloudflare.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function toTitleCase(name: string) {
  if (!name) return "";
  return name
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

async function hmacSHA256(message: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Interpret an ISO datetime in the MACHINE'S timezone (tz) and return UTC "yyyy-MM-dd'T'HH:mm:ss".
 * If the incoming string already has an offset or Z, Luxon respects it.
 * If it’s naive (no offset), DateTime.fromISO(..., { zone: tz }) treats it as local in that tz.
 */
function formatUtcDateTime(dtString: string, tz: string): string {
  const hasZone = /Z|[+-]\d{2}:?\d{2}$/.test(dtString);
  const dt = hasZone
    ? DateTime.fromISO(dtString, { setZone: true })
    : DateTime.fromISO(dtString, { zone: tz || "UTC" });

  if (!dt.isValid) throw new Error(`Invalid datetime: ${dtString}`);
  return dt.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss");
}

// Space-separated UTC for Postgres
function toDbTs(isoOrT: string): string {
  const dt = DateTime.fromISO(isoOrT, { setZone: true }).toUTC();
  if (!dt.isValid) throw new Error(`Invalid datetime for DB: ${isoOrT}`);
  return dt.toFormat("yyyy-LL-dd HH:mm:ss");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  let body: any;
  try {
    body = await req.json();

    const validateDateTime = (dt: string) =>
      !!dt && (DateTime.fromISO(dt, { setZone: true }).isValid || DateTime.fromISO(dt).isValid);

    if (!validateDateTime(body.check_in || body.checkIn) || !validateDateTime(body.check_out || body.checkOut)) {
      throw new Error("Timestamps must be valid ISO (e.g., '2025-08-10T16:27:00' or '2025-08-10T16:27:00+02:00').");
    }
  } catch (err) {
    console.error("[400] JSON/TS parse error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Invalid JSON or timestamp format",
        details: "Use ISO like '2025-08-10T16:27:00' (machine tz) or '2025-08-10T16:27:00+02:00' (explicit zone).",
      }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Body fields
  const client_id = body.client_id || body.clientId;
  const key_id = body.key_id || body.keyId;
  const UID = body.UID || body.uid;
  const slot_number = body.slot_number || body.slotNumber;
  const machine_id = body.machine_id || body.machineId;
  const room_no = body.room_no || body.roomNo;
  const check_in = body.check_in || body.checkIn;
  const check_out = body.check_out || body.checkOut;
  const client_email = body.client_email || body.clientEmail;
  const client_name = body.client_name || body.clientName;
  const client_first_name = body.client_first_name || body.clientFirstName || null;
  const client_last_name = body.client_last_name || body.clientLastName || null;
  const location = body.location || null;
  const city = body.city || null;
  const machine_name = body.machine_name || body.machineName || null;

  if (!client_id || !key_id || !UID || !slot_number || !machine_id || !check_in || !check_out) {
    console.error("[400] Missing required fields", {
      client_id,
      key_id,
      UID,
      slot_number,
      machine_id,
      check_in,
      check_out,
    });
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // machines
  const { data: machineData, error: machineError } = await supabase
    .from("machines")
    .select("*")
    .eq("machine_id", machine_id)
    .maybeSingle();

  if (machineError || !machineData) {
    console.error("[500] Machine fetch failed:", machineError);
    return new Response(
      JSON.stringify({
        error: "Failed to fetch machine data",
        details: machineError?.message || "Machine not found",
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const cloudBase = machineData?.machine_cloud_url || DEFAULT_CLOUD_URL;
  const machineTZ: string = machineData?.timezone || "UTC";

  // clients.platform
  let platformForSubject = "Keymatic";
  let platformForBody = "";
  try {
    const { data: clientRow, error: clientErr } = await supabase
      .from("clients")
      .select("platform")
      .eq("id", client_id)
      .maybeSingle();
    if (clientErr) console.warn("Could not fetch client platform:", clientErr.message);
    platformForSubject = toTitleCase(clientRow?.platform || "Keymatic");
    platformForBody = clientRow?.platform ? toTitleCase(clientRow.platform) : "";
  } catch (e) {
    console.warn("Clients fetch failed (non-fatal):", e);
  }

  // keys: for room_location / room_address and owner fallback
  let keyRow: { owner_id?: string | null; room_location?: string | null; room_address?: string | null } | null = null;
  try {
    if (key_id) {
      const { data: k } = await supabase
        .from("keys")
        .select("owner_id, room_location, room_address, room_number")
        .eq("id", key_id)
        .maybeSingle();
      keyRow = k ?? null;
    }
    if (!keyRow && UID) {
      const { data: k2 } = await supabase
        .from("keys")
        .select("owner_id, room_location, room_address, room_number")
        .eq("UID", UID)
        .maybeSingle();
      keyRow = k2 ?? null;
    }
  } catch (e) {
    console.warn("Keys fetch failed (non-fatal):", e);
  }

  const roomLocationValue = keyRow?.room_location ?? null;
  const roomAddressValue = keyRow?.room_address ?? null;

  const roomNumberValue = (room_no ?? keyRow?.room_number ?? null) as string | null;

  // === Owner resolution from users table (via owner_id from machine or key) ===
  let ownerNameValue: string | null = null;
  let ownerEmailValue: string | null = null;

  // helper to fetch from users once we have an owner_id
  const fetchUserOwnerById = async (ownerId?: string | null) => {
    if (!ownerId) return { name: null, email: null };
    const { data, error } = await supabase.from("users").select("name, email").eq("id", ownerId).maybeSingle();
    if (error) {
      console.warn("users fetch (owner) error:", error.message);
      return { name: null, email: null };
    }
    return {
      name: data?.name ? toTitleCase(data.name) : null,
      email: data?.email ?? null,
    };
  };

  // Try machine.owner_id then key.owner_id
  {
    const a = await fetchUserOwnerById(machineData?.owner_id);
    ownerNameValue = a.name;
    ownerEmailValue = a.email;
  }
  if (!ownerNameValue || !ownerEmailValue) {
    const b = await fetchUserOwnerById(keyRow?.owner_id);
    ownerNameValue = ownerNameValue ?? b.name;
    ownerEmailValue = ownerEmailValue ?? b.email;
  }

  // machines.machine_address → machine_address for pickup_requests
  const machineAddressForInsert = machineData?.machine_address || null;

  // platform value for DB
  const platformValue = platformForBody || (body.platform ? toTitleCase(body.platform) : null);

  // TIMESTAMP HANDLING — tz-aware
  const nowUtc = DateTime.utc();
  const ts_utc = Math.floor(nowUtc.toSeconds());
  const offsetSeconds = (nowUtc.setZone(machineTZ).offset || 0) * 60; // minutes → seconds
  const ts = ts_utc + offsetSeconds;

  // For device: UTC T-format
  const startT = formatUtcDateTime(check_in, machineTZ);
  const expT = formatUtcDateTime(check_out, machineTZ);
  // For DB: space-format UTC
  const checkInDb = toDbTs(startT);
  const checkOutDb = toDbTs(expT);

  // Build commands
  const cmds = [
    `PI:RELAY:ON|ts=${ts}|start=${startT}|exp=${expT}`,
    `PI:LIMIT:?|ts=${ts}|start=${startT}|exp=${expT}`,
    `ESP:RELAY${slot_number}:ON|ts=${ts}|start=${startT}|exp=${expT}`,
    `ESP:LIMIT${slot_number}:?|ts=${ts}|start=${startT}|exp=${expT}`,
    // NEW LCD signed requests
    `LCD: pickup ${slot_number}${roomNumberValue ? " " + roomNumberValue : ""}|ts=${ts}|start=${startT}|exp=${expT}`,
    `LCD: fout ${slot_number}|ts=${ts}|start=${startT}|exp=${expT}`,
    `LCD: off ${slot_number}|ts=${ts}|start=${startT}|exp=${expT}`,
  ];

  // URLs with HMAC
  const req_urls = await Promise.all(
    cmds.map(async (cmd) => {
      const sig = await hmacSHA256(cmd, hmacKey);
      return `${cloudBase}/action?cmd=${encodeURIComponent(cmd)}&sig=${encodeURIComponent(sig)}`;
    })
  );

  const link_token = crypto.randomUUID();

  // INSERT payload (includes platform, client_email, owner_email, machine_address, room_location, room_address)
  const dataToInsert: Record<string, any> = {
    link_token,
    client_id,
    check_in: checkInDb,
    check_out: checkOutDb,
    key_id,
    valid: true,
    created_at: new Date().toISOString(),
    machine_id,
    room_no: room_no ?? roomNumberValue ?? null,
    door_on_req: req_urls[0],
    door_status_req: req_urls[1],
    relay_on_req: req_urls[2],
    relay_status_req: req_urls[3],
    LCD_room_req: req_urls[4],
    LCD_flash_req: req_urls[5],
    LCD_off_req: req_urls[6],
    UID,
    slot_number,
    client_first_name: client_first_name ? toTitleCase(client_first_name) : null,
    client_last_name: client_last_name ? toTitleCase(client_last_name) : null,
    machine_name: machine_name || machineData?.["Machine name"] || null,
    location: location || machineData?.location || null,
    city: city || machineData?.city || null,
    client_name:
      client_first_name && client_last_name
        ? `${toTitleCase(client_first_name)} ${toTitleCase(client_last_name)}`
        : client_name
          ? toTitleCase(client_name)
          : null,

    // the six “missed” fields (matching your real table)
    platform: platformValue,
    client_email: client_email || null,
    owner_email: ownerEmailValue ?? null,
    machine_address: machineAddressForInsert,
    room_location: roomLocationValue,
    room_address: roomAddressValue,
  };

  const { error: insertError } = await supabase.from("pickup_requests").insert([dataToInsert]);

  if (insertError) {
    console.error("[500] Insert failed:", insertError);
    return new Response(
      JSON.stringify({
        error: "Failed to insert pickup request",
        details: insertError.message || String(insertError),
        // Helpful to see exactly what keys we attempted to insert:
        columns: Object.keys(dataToInsert),
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // Friendly local-time strings for email
  const checkInFriendly = DateTime.fromISO(check_in, { zone: machineTZ }).toFormat(
    "EEEE, MMM d, yyyy 'at' HH:mm '(local time)'"
  );
  const checkOutFriendly = DateTime.fromISO(check_out, { zone: machineTZ }).toFormat(
    "EEEE, MMM d, yyyy 'at' HH:mm '(local time)'"
  );

  // Email (non-fatal if it fails)
  if (client_email && (client_first_name || client_last_name || client_name)) {
    try {
      await resend.emails.send({
        from: `Keymatic for ${platformForSubject} <noreply@send.myotp.site>`,
        to: client_email,
        subject: `🔑 Your key pickup link — Room ${room_no ?? roomNumberValue ?? ""}`.trim(),
        html: generateEmailTemplate({
          displayName:
            client_first_name && client_last_name
              ? `${toTitleCase(client_first_name)} ${toTitleCase(client_last_name)}`
              : toTitleCase(client_name || ""),
          pickupLink: `${SITE_URL}/pickup/${link_token}`,
          howItWorksLink: `${SITE_URL}/how-it-works?t=${link_token}`,
          city: city || machineData?.city || "",
          room_no: room_no ?? roomNumberValue ?? null,
          check_in: checkInFriendly,
          check_out: checkOutFriendly,
          machineDisplayName: machineData?.["Machine name"] || "",
          machineAddress: machineData?.machine_address || "",
          mapLink: machineData?.location || "",
          platform: platformForBody,
          ownerName: ownerNameValue || "", // pass owner name from users
        }),
      });
    } catch (err) {
      console.error("Email send failed (non-fatal):", err);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      request: dataToInsert,
      machine_cloud_url: cloudBase,
      machine_tz: machineTZ,
      ts_used: ts,
      ts_utc,
      offset_seconds: offsetSeconds,
    }),
    { status: 200, headers: CORS_HEADERS }
  );
});

// Email template
function generateEmailTemplate(params: {
  displayName: string;
  pickupLink: string;
  howItWorksLink: string;
  city: string;
  machineAddress?: string;
  room_no?: string | null;
  platform?: string;
  check_in: string; // already friendly
  check_out: string; // already friendly
  machineDisplayName: string;
  mapLink: string;
  ownerName?: string;
}) {
  const row = (label: string, value?: string | null, extra = "") =>
    value ? `<b>${label}:</b> ${esc(value)}${extra}<br>` : "";
  const mapLink = /^https?:\/\//i.test(params.mapLink || "") ? params.mapLink : "";
  const where = [params.machineDisplayName, params.city, params.machineAddress].filter(Boolean).join(" — ");
  const mapHtml = mapLink ? ` · <a href="${esc(mapLink)}" style="color:#1d4ed8;">Open map</a>` : "";
  const langs: [string, string][] = [
    ["ar", "العربية"],
    ["de", "Deutsch"],
    ["fr", "Français"],
    ["es", "Español"],
    ["zh", "中文"],
    ["ru", "Русский"],
    ["it", "Italiano"],
    ["pt", "Português"],
    ["tr", "Türkçe"],
  ];
  const langLinks = langs
    .map(
      ([c, n]) =>
        `<a href="${esc(params.howItWorksLink)}&lang=${c}" style="color:#1d4ed8;text-decoration:none;">${n}</a>`
    )
    .join(" · ");

  return `
  <div style="font-family: Arial, sans-serif; color:#1f2937; max-width:600px; margin:auto; line-height:1.6;">
    <div style="text-align:center; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px; font-size:14px; margin-bottom:18px; color:#1e3a8a;">
      🌍 <a href="${esc(params.howItWorksLink)}" style="color:#1d4ed8; font-weight:700;">For your language, click here</a><br>
      <span style="font-size:13px;">${langLinks}</span>
    </div>

    <h2 style="margin:0 0 6px; font-size:22px; color:#1e40af;">Hello ${esc(params.displayName)},</h2>
    <p style="margin:0 0 16px; font-size:15px;">Your key is ready at the KeyMatic machine.</p>

    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; font-size:14px; margin-bottom:16px;">
      ${where ? `<b>Machine:</b> ${esc(where)}${mapHtml}<br>` : mapHtml ? `<b>Machine:</b>${mapHtml}<br>` : ""}
      ${row("Room", params.room_no ?? "")}
      ${row("Platform", params.platform)}
      ${row("Owner", params.ownerName)}
      ${row("Check-in", params.check_in)}
      ${row("Check-out", params.check_out)}
    </div>

    <p style="margin:0 0 16px; font-size:15px; color:#1e3a8a;"><b>You can pick up your key anytime from your check-in time, 24/7.</b></p>

    <div style="font-size:16px; font-weight:700; margin-bottom:6px;">How to pick up your key</div>
    <ol style="margin:0 0 16px; padding-left:20px; font-size:15px;">
      <li>Go to the KeyMatic machine${mapLink ? " (use the map link above)" : ""}.</li>
      <li>Open your pickup link below and tap <b>Start</b>.</li>
      <li>Enter your last name and the <b>3-character Machine ID</b> from the sticker on the machine. Tap <b>Continue</b>.</li>
      <li>Tap <b>Open Door</b>, then <b>Release Key</b>.</li>
      <li>Take your key and close the machine door.</li>
    </ol>

    <div style="text-align:center; margin:18px 0 8px;">
      <a href="${esc(params.pickupLink)}" style="display:inline-block; background:#1d4ed8; color:#ffffff; padding:12px 26px; border-radius:8px; font-size:16px; font-weight:700; text-decoration:none;">Start my key pickup</a>
    </div>
    <p style="margin:0 0 16px; font-size:12px; color:#4b5563; text-align:center; word-break:break-all;">
      or copy this link: <a href="${esc(params.pickupLink)}" style="color:#1d4ed8;">${esc(params.pickupLink)}</a>
    </p>

    <div style="border-top:1px solid #e5e7eb; padding-top:12px; font-size:14px;">
      ${SUPPORT_CONTACT ? `<b>Need help?</b> WhatsApp ${esc(SUPPORT_CONTACT)}<br>` : ""}
      <span style="color:#4b5563;">This link is only for you. It stops working after you pick up your key or after check-out.</span>
    </div>

    <p style="margin:16px 0 0; font-size:14px;">Enjoy your stay,<br><b style="color:#1e40af;">KeyMatic Team</b></p>
  </div>
  `;
}

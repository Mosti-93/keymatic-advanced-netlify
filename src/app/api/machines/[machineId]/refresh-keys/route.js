import crypto from "crypto";

// 1. Map dashboard machine IDs (like "A12") to the actual Pi URL/IP+port.
//    EDIT THIS to match your real Pi address/port.
const MACHINE_CONFIG = {
  A12: "https://api-a12.myotp.site", // change to your Pi IP for A12
  A01: "https://api-a12.myotp.site", // if you only have one Pi now, you can point both to same IP
  // Add more entries if you have more machines:
  // A02: "http://192.168.1.50:5000",
};

// 2. Helper to format timestamps like "2025-10-29T17:48:48"
function isoNoTZ(dateObj) {
  const pad = (n) => String(n).padStart(2, "0");
  const Y = dateObj.getFullYear();
  const M = pad(dateObj.getMonth() + 1);
  const D = pad(dateObj.getDate());
  const h = pad(dateObj.getHours());
  const m = pad(dateObj.getMinutes());
  const s = pad(dateObj.getSeconds());
  return `${Y}-${M}-${D}T${h}:${m}:${s}`;
}

// 3. HMAC generator
//    This MUST match what the Pi expects.
//    SECRET_KEY must match the Pi's SECRET_KEY (without the leading b and quotes).
//    Example from Pi: SECRET_KEY = b"mysupersecretkey"
function buildSignature(cmd) {
  const SECRET_KEY = "mysupersecretkey";
  return crypto
    .createHmac("sha256", SECRET_KEY)
    .update(cmd, "utf8")
    .digest("base64");
}




// 4. Your Next.js version requires awaiting the context to get params.
export async function POST(request, context) {
  // context is like a promise that resolves to { params: { machineId: "A12" } }
  const { params } = await context;

  // Example: /api/machines/A12/refresh-keys  ->  machineId === "A12"
  const dashboardMachineId = params.machineId;

  // A. Pick which Pi to talk to
  const endpoint = MACHINE_CONFIG[dashboardMachineId];
  if (!endpoint) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `No endpoint configured for machine ${dashboardMachineId}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // B. Build whitelist refresh command for Pi
  //    Pi FastAPI /action expects something like:
  //    PI:REFRESH_WHITELIST|machine=A12|start=...|exp=...
  //
  // We'll allow 2 minutes validity window.
  const now = new Date();
  const startTs = isoNoTZ(now);

  const in2min = new Date(now.getTime() + 2 * 60 * 1000);
  const expTs = isoNoTZ(in2min);

  const cmd = `PI:REFRESH_WHITELIST|machine=${dashboardMachineId}|start=${startTs}|exp=${expTs}`;

  // C. Build signature that Pi will verify
  const sig = buildSignature(cmd);

  // D. Send GET to Pi /action with 5s timeout
  const url = `${endpoint}/action?cmd=${encodeURIComponent(
    cmd
  )}&sig=${encodeURIComponent(sig)}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);

  let piJson;
  let piStatus = 0;

  try {
    const piResp = await fetch(url, {
      method: "GET",
      signal: ac.signal,
    });
    clearTimeout(timer);

    piStatus = piResp.status;
    piJson = await piResp.json(); // FastAPI dict -> JSON
  } catch (err) {
    clearTimeout(timer);
    // Can't reach Pi at all
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Cannot reach machine",
        detail: String(err),
        triedURL: url,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  // E. Pi responded but said no
  if (piStatus >= 400) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Pi rejected command",
        piStatus,
        piReply: piJson,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  // F. Success
  return new Response(
    JSON.stringify({
      ok: true,
      machine: dashboardMachineId,
      piStatus,
      piReply: piJson,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

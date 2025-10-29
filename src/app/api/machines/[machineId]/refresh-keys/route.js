import crypto from "crypto";

// Resolve which Pi URL we should talk to for a given machine ID
function getMachineEndpoint(machineId) {
  if (machineId === "A12") return process.env.MACHINE_A12_URL;
  if (machineId === "A01") return process.env.MACHINE_A01_URL;
  // Add more machines here later if needed:
  // if (machineId === "A02") return process.env.MACHINE_A02_URL;
  return undefined;
}

// Make a timestamp string like "2025-10-29T18:05:43"
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

// Build HMAC signature the exact same way the Pi validates it
function buildSignature(cmd) {
  const SECRET_KEY = process.env.SIGNING_SECRET;
  if (!SECRET_KEY) {
    throw new Error("SIGNING_SECRET is missing in env");
  }

  // You used base64 earlier and it worked (20jj+TqK...= etc. looked like base64),
  // so we'll keep base64 here.
  return crypto
    .createHmac("sha256", SECRET_KEY)
    .update(cmd, "utf8")
    .digest("base64");
}

// Your Next.js version requires "await context" to read params
export async function POST(request, context) {
  const { params } = await context;
  const dashboardMachineId = params.machineId; // e.g. "A12"

  // 1. Pick which Pi to talk to
  const endpoint = getMachineEndpoint(dashboardMachineId);
  if (!endpoint) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `No endpoint configured for machine ${dashboardMachineId}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

// 2. Build whitelist refresh command
const now = new Date();
const startTs = isoNoTZ(now);

// give 10 minutes of validity so timestamp check doesn't fail if
// Netlify time != Pi local time
const in10min = new Date(now.getTime() + 10 * 60 * 1000);
const expTs = isoNoTZ(in1000min);

const cmd = `PI:REFRESH_WHITELIST|machine=${dashboardMachineId}|start=${startTs}|exp=${expTs}`;

// 3. Sign it with HMAC so Pi accepts it
const sig = buildSignature(cmd);

  // 4. Send it to the Pi /action endpoint with timeout
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
    piJson = await piResp.json();
  } catch (err) {
    clearTimeout(timer);

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

  // 5. Pi responded but said no (wrong machine, etc.)
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

  // 6. Success
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

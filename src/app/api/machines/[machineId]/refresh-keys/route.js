import crypto from "crypto";
import { requireRole } from "@/utils/requireRole";
import { getServiceClient } from "@/lib/pickupServer";
import { promoteSyncedSlots } from "@/lib/machineCommands";

// Resolve which Pi URL we should talk to for a given machine ID:
// 1) MACHINE_<ID>_URL env var (override), 2) machines.machine_cloud_url
// (set on the Machines page as "Pi address"), else none.
async function getMachineEndpoint(machineId) {
  const id = String(machineId || "").trim();
  if (!/^[A-Za-z0-9_]+$/.test(id)) return undefined;
  const fromEnv = String(process.env[`MACHINE_${id.toUpperCase()}_URL`] || "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  try {
    const { data } = await getServiceClient()
      .from("machines")
      .select("machine_cloud_url")
      .eq("machine_id", id)
      .maybeSingle();
    const url = String(data?.machine_cloud_url || "").trim();
    return url ? url.replace(/\/+$/, "") : undefined;
  } catch (e) {
    console.error("[refresh-keys] could not read machine address:", e);
    return undefined;
  }
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
  return crypto.createHmac("sha256", SECRET_KEY).update(cmd, "utf8").digest("base64");
}

// Next.js 15+: context.params is a Promise and must be awaited itself
// (awaiting `context` alone leaves params.machineId undefined).
export async function POST(request, context) {
  // Only admins may send signed commands to a machine.
  const auth = await requireRole(request, ["admin"]);
  if (auth.response) return auth.response;

  const { machineId } = await context.params;
  const dashboardMachineId = String(machineId || "").trim(); // e.g. "A08"

  // 1. Pick which Pi to talk to
  const endpoint = await getMachineEndpoint(dashboardMachineId);
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

  // make it valid for, say, 24 hours instead of 10 minutes
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const expTs = isoNoTZ(in24h);

  // then:
  const cmd = `PI:REFRESH_WHITELIST|machine=${dashboardMachineId}|start=${startTs}|exp=${expTs}`;

  // 3. Sign it with HMAC so Pi accepts it
  const sig = buildSignature(cmd);

  // 4. Send it to the Pi /action endpoint with timeout
  const url = `${endpoint}/action?cmd=${encodeURIComponent(cmd)}&sig=${encodeURIComponent(sig)}`;

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

  // 6. Success. Keys already in a slot stay "unregistered" in the database until
  // the Pi rereads them, so move them to UID now that the machine knows them.
  let slotsFixed = 0;
  try {
    slotsFixed = await promoteSyncedSlots(getServiceClient(), dashboardMachineId);
  } catch (e) {
    console.warn("[refresh-keys] slot update after sync failed:", e?.message);
  }
  return new Response(
    JSON.stringify({
      ok: true,
      slotsFixed,
      machine: dashboardMachineId,
      piStatus,
      piReply: piJson,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

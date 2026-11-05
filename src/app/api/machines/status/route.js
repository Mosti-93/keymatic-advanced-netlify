import { requireRole } from "@/utils/requireRole";
import { getServiceClient } from "@/lib/pickupServer";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Ask one Pi for its time; answering at all means the machine is online. */
async function ping(url) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${url}/time`, { signal: ctrl.signal, cache: "no-store" });
    return { online: res.ok, ms: Date.now() - started, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { online: false, ms: null, error: e.name === "AbortError" ? "No answer in 5 s" : "Not reachable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/machines/status → { checkedAt, machines: { <machine_id>: { online, ms, error, hasAddress } } }
 * Checks every machine's saved Pi address (machines.machine_cloud_url, or the
 * MACHINE_<ID>_URL env override) by calling its /time endpoint.
 */
export async function GET(request) {
  const auth = await requireRole(request, ["admin", "owner"]);
  if (auth.response) return auth.response;

  try {
    const { data, error } = await getServiceClient().from("machines").select("machine_id, machine_cloud_url");
    if (error) throw error;
    const entries = await Promise.all(
      (data || []).map(async (m) => {
        const id = String(m.machine_id || "").trim();
        const env = String(process.env[`MACHINE_${id.toUpperCase()}_URL`] || "").trim();
        const url = (env || String(m.machine_cloud_url || "").trim()).replace(/\/+$/, "");
        if (!url) return [id, { online: false, ms: null, error: "No Pi address saved", hasAddress: false }];
        return [id, { ...(await ping(url)), hasAddress: true }];
      })
    );
    return json({ checkedAt: new Date().toISOString(), machines: Object.fromEntries(entries) });
  } catch (e) {
    console.error("[machines/status] failed:", e);
    return json({ error: "Could not check machines." }, 500);
  }
}

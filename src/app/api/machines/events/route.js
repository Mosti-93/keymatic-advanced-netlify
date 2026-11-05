import { requireRole } from "@/utils/requireRole";
import { getServiceClient } from "@/lib/pickupServer";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * GET /api/machines/events?machine=A08&limit=200
 * The machine log (door, slots, pickups, returns, remote actions), newest first.
 * Admins only; read with the service role so it works whatever the table's RLS is.
 */
export async function GET(request) {
  const auth = await requireRole(request, ["admin"]);
  if (auth.response) return auth.response;

  const params = new URL(request.url).searchParams;
  const machine = String(params.get("machine") || "").trim();
  const limit = Math.min(500, Math.max(1, parseInt(params.get("limit"), 10) || 200));
  if (machine && !/^[A-Za-z0-9_]+$/.test(machine)) return json({ events: [], error: "Bad machine id" }, 400);

  const sb = getServiceClient();
  const query = (ordered) => {
    let q = sb.from("machine_events").select("*");
    if (machine) q = q.ilike("machine_id", machine);
    if (ordered) q = q.order("created_at", { ascending: false });
    return q.limit(limit);
  };

  let { data, error } = await query(true);
  // Older tables may not have created_at: fall back to the default order.
  if (error && /created_at/i.test(error.message)) ({ data, error } = await query(false));
  if (error) return json({ events: [], error: error.message }, 500);
  return json({ events: data || [] });
}

import { getServiceClient, loadPickup, loadKeyUid } from "@/lib/pickupServer";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** GET /api/pickup-link/:token — booking details for the guest pickup page. */
export async function GET(_request, { params }) {
  const { token } = await params;
  try {
    const sb = getServiceClient();
    const row = await loadPickup(sb, token);
    if (!row) return json({ error: "Invalid or not found." }, 404);
    const uid = await loadKeyUid(sb, row.room_no).catch(() => null);
    return json({ row, uid });
  } catch (e) {
    console.error("[pickup-link] load failed:", e);
    return json({ error: "Could not load this pickup link." }, 500);
  }
}

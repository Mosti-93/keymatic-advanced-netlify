import { getServiceClient, loadPickup, publicView } from "@/lib/pickupServer";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/**
 * GET /api/pickup-link/:token — welcome details for the guest pickup page.
 * Only display fields go to the phone: never the answers (last name, Machine ID)
 * and never the signed machine links.
 */
export async function GET(_request, { params }) {
  const { token } = await params;
  try {
    const row = await loadPickup(getServiceClient(), token);
    if (!row) return json({ error: "Invalid or not found." }, 404);
    return json({ booking: publicView(row) });
  } catch (e) {
    console.error("[pickup-link] load failed:", e);
    return json({ error: "Could not load this pickup link." }, 500);
  }
}

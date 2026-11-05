import { getServiceClient, verifyPickup } from "@/lib/pickupServer";

/** POST /api/pickup-link/:token/verify  { lastName, machineId } — checked on the server. */
export async function POST(request, { params }) {
  const { token } = await params;
  try {
    const { lastName = "", machineId = "" } = await request.json().catch(() => ({}));
    const { status, body } = await verifyPickup(getServiceClient(), token, {
      lastName: String(lastName).slice(0, 100),
      machineId: String(machineId).slice(0, 10),
    });
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[pickup-link] verify failed:", e);
    return Response.json({ ok: false, error: "Could not check your answers." }, { status: 500 });
  }
}

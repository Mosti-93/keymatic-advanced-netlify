import { getServiceClient, completePickup } from "@/lib/pickupServer";

/** POST /api/pickup-link/:token/complete — called after the key is released. */
export async function POST(_request, { params }) {
  const { token } = await params;
  try {
    const { status, body } = await completePickup(getServiceClient(), token);
    return Response.json(body, { status });
  } catch (e) {
    console.error("[pickup-link] complete failed:", e);
    return Response.json({ error: "Could not complete pickup." }, { status: 500 });
  }
}

import { getServiceClient, runPickupAction } from "@/lib/pickupServer";

/** POST /api/pickup-link/:token/action  { action: "open" | "release" | "check" } */
export async function POST(request, { params }) {
  const { token } = await params;
  try {
    const { action } = await request.json().catch(() => ({}));
    const { status, body } = await runPickupAction(getServiceClient(), token, String(action || ""));
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[pickup-link] action failed:", e);
    return Response.json({ result: "error" }, { status: 500 });
  }
}

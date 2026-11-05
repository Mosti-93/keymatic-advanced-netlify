import { requireRole } from "@/utils/requireRole";
import { getServiceClient } from "@/lib/pickupServer";
import { ACTIONS, sendMachineAction, auditDetail } from "@/lib/machineCommands";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * POST /api/machines/<code>/command  { action, slot?, reason? }
 * Remote support: open the door, unlock a slot, read sensors, sync keys.
 * Admins only. Every action that changes something is written to machine_events
 * with who did it and why (failures too).
 */
export async function POST(request, context) {
  const auth = await requireRole(request, ["admin"]);
  if (auth.response) return auth.response;

  const { machineId } = await context.params;
  const code = String(machineId || "").trim();
  if (!/^[A-Za-z0-9_]+$/.test(code)) return json({ ok: false, message: "Bad machine id" }, 400);

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* empty body */
  }
  const action = String(body.action || "");
  const def = ACTIONS[action];
  if (!def) return json({ ok: false, message: "Unknown action" }, 400);
  const slot = def.needsSlot ? parseInt(body.slot, 10) : null;
  if (def.needsSlot && !(slot >= 1 && slot <= 99)) return json({ ok: false, message: "Pick a slot" }, 400);

  const sb = getServiceClient();
  // Some machine_id values carry stray whitespace ("A12\n"), so match after trimming.
  const { data: rows, error } = await sb.from("machines").select("*");
  if (error) return json({ ok: false, message: error.message }, 500);
  const machine = (rows || []).find(
    (m) =>
      String(m.machine_id || "")
        .trim()
        .toUpperCase() === code.toUpperCase()
  );
  if (!machine) return json({ ok: false, message: `Machine ${code} not found` }, 404);
  if (def.needsSlot) {
    const cap = parseInt(machine.capacity, 10);
    if (cap && slot > cap) return json({ ok: false, message: `This machine has ${cap} slots` }, 400);
  }

  const outcome = await sendMachineAction({ machine, action, slot, secret: process.env.SIGNING_SECRET });

  if (def.log) {
    try {
      const { error: logErr } = await sb.from("machine_events").insert([
        {
          machine_id: String(machine.machine_id).trim().toUpperCase(),
          slot: slot ?? 0,
          kind: outcome.ok ? def.log : "remote_failed",
          uid: null,
          room: null,
          detail: auditDetail({
            actor: auth.user?.email,
            reason: body.reason,
            outcome: outcome.ok ? outcome : { message: `${action}: ${outcome.message}` },
          }),
        },
      ]);
      if (logErr) console.warn("[command] log failed:", logErr.message);
    } catch (e) {
      console.warn("[command] log failed:", e?.message);
    }
  }

  return json(outcome);
}

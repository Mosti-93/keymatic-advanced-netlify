import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Helper for Title Case
function toTitleCase(str: string) {
  return (str || "").replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

serve(async (req) => {
  console.log("==== EDGE FUNCTION STARTED ====");

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body;
  try {
    body = await req.json();
    console.log("Function invoked with body:", body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // Extract payload data
  const {
    clientId,
    clientEmail,
    clientName,
    keyId,
    roomNo,
    ownerName,
    checkIn,
    checkOut,
    machineId,
  } = body;

  if (!clientId || !clientEmail || !machineId) {
    return new Response(JSON.stringify({ error: "Missing fields" }), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // 1. Generate secure token & expiration
  const token = crypto.randomUUID();
  const pickupUrl = `https://nimble-granita-b2e3cd.netlify.app/pickup/${token}`;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  // 2. Fetch the machine details from the DB
  let machineName = "", machineCity = "", machineLocation = "";
  const { data: machineRow, error: machineErr } = await supabase
    .from("machines")
    .select('id, "Machine name", city, location')
    .eq('id', machineId)
    .single();

  if (machineRow) {
    machineName = machineRow["Machine name"];
    machineCity = machineRow["city"];
    machineLocation = machineRow["location"];
  } else {
    console.error("Could not find machine row for ID", machineId, machineErr);
    machineName = `Machine ${machineId}`;
    machineCity = "";
    machineLocation = "";
  }

  // Title Case all names/fields for the guest
  const clientNameTitle = toTitleCase(clientName);
  const ownerNameTitle = toTitleCase(ownerName);
  const machineCityTitle = toTitleCase(machineCity);
  const machineNameTitle = toTitleCase(machineName);
  const machineLocationTitle = machineLocation; // This is now the FULL Google Maps URL from your DB
const navigateUrl = machineLocationTitle || "";

  // 3. Save token/session to DB
  const { error } = await supabase.from("pickup_tokens").insert([{
    token,
    client_id: clientId,
    client_email: clientEmail,
    machine_id: machineId,
    room_no: roomNo,
    expires_at: expiresAt,
  }]);

  if (error) {
    console.error("DB Insert failed:", error);
    return new Response(JSON.stringify({ error: "Failed to save token: " + error.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  // 4. Build the email body
  const html = `
    <div style="font-family: Arial, sans-serif; color: #222;">
      <h2>Welcome, ${clientNameTitle}</h2>
      <p>
        We’re <b>Keymatic</b> – making your key pickup easier and more fun than ever!<br>
        for your stay at:<br>
        📍 <b>City:</b> ${machineCityTitle}<br>
        🔑 <b>Room Number:</b> ${roomNo}<br>
        👤 <b>Owner:</b> ${ownerNameTitle}<br>
        🗓️ <b>Check-in:</b> ${checkIn}<br>
        🗓️ <b>Check-out:</b> ${checkOut}<br>
      </p>
      <p><b>⏰ No need to wait — you can pick up your key anytime, 24/7!</b></p>
      <hr>
      <h3>How to Pick Up Your Key:</h3>
      <ol>
        <li>
          Go to our Keymatic machine in <b>${machineCityTitle}</b>.<br>
          ${machineLocationTitle && navigateUrl ? `🚗 <a href="${navigateUrl}" target="_blank">Navigate me</a>` : ""}
        </li>
        <li>At the machine (${machineNameTitle}), tap your secure pickup link below.</li>
        <li>On the web page, confirm your last name and machine ID.</li>
        <li>Click “Open Door” and then “Release Key” on the web page.</li>
        <li>Take your key from the open slot — and that’s it!</li>
      </ol>
      <div style="color: #e66; margin: 10px 0 20px 0;">
        ❗ <b>Please don’t forget to close the machine door after you pick up your key!</b>
      </div>
      <hr>
      <h3>Start Your Key Pickup:</h3>
      <a href="${pickupUrl}" style="display: inline-block; margin-bottom: 6px; font-size: 18px; color: #1572A1; font-weight: bold;">
        Click here to start your pickup process
      </a>
      <br>—or copy this link into your browser—<br>
      <div style="font-size:13px; color:#555; background:#f3f3f3; padding:6px 10px; border-radius:6px; word-break:break-all;">${pickupUrl}</div>
      <hr>
      <b>Please remember:</b>
      <ul>
        <li>This link is for you only. It expires after use or after your check-out date.</li>
        <li>For your security, don’t share it with anyone.</li>
      </ul>
      <br>
      Enjoy your stay! If you have any questions, your host and the Keymatic team are always here to help.
      <br><br>
      <b>Keymatic Team</b>
    </div>
  `;

  // 5. Send email with Resend
  try {
    const emailResult = await resend.emails.send({
      from: 'noreply@towelmatic.com', // Your verified sending domain
      to: clientEmail,
      subject: '🔑 Your Keymatic Pickup Link',
      html,
    });
    console.log("Email send result:", emailResult);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  } catch (err) {
    console.error("Email sending failed:", err);
    return new Response(JSON.stringify({ error: "Email send failed: " + err.message }), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
});

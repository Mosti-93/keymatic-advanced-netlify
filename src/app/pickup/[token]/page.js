"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

const TABLE_NAME = "pickup_requests";
const TOKEN_COLUMN = "link_token";
const DB_COLUMNS = "client_first_name,client_last_name,machine_id,room_no,check_out,valid,machine_name,city,machine_address,platform,door_on_req,door_status_req,relay_on_req,relay_status_req";

function formatName(name) {
  return name ? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() : "";
}

async function callMachineAPI(endpoint, payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`/api/machine/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error('Request timed out');
    throw error;
  }
}

function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal })
    .then(async (r) => {
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      try { return JSON.parse(text); } catch { return { text }; }
    })
    .catch((err) => {
      clearTimeout(t);
      if (err.name === "AbortError") {
        const e = new Error("timeout");
        // @ts-ignore
        e.code = "TIMEOUT";
        throw e;
      }
      throw err;
    });
}

async function invalidateByUID(supabase, { token, uid, machineId, roomNo }) {
  const isoNow = new Date().toISOString();
  const noteBase = roomNo ? `Key removed for room ${roomNo}` : `Key removed (by UID)`;
  const result = { linkUpdated: false, keyUpdated: false, slotsCleared: 0 };
  if (!token) throw new Error("Missing token");

  try {
    {
      const { error } = await supabase
        .from(TABLE_NAME)
        .update({ valid: false, pulled_at: isoNow })
        .eq(TOKEN_COLUMN, token);
      if (error) throw error;
      result.linkUpdated = true;
    }

    if (uid) {
      const { error } = await supabase
        .from("keys")
        .update({
          isPresent: "OUT",
          last_status_time: isoNow,
          statusText: "KEY_REMOVED",
        })
        .eq("UID", uid);
      if (error) throw error;
      result.keyUpdated = true;
    } else {
      console.warn("[invalidateByUID] No UID provided; skipping keys and slot clear.");
      return result;
    }

    let q1 = supabase
      .from("key_slot_presence")
      .update({
        UID: null,
        removed_at: isoNow,
        notes: noteBase,
      })
      .eq("UID", uid)
      .is("removed_at", null);

    if (machineId) q1 = q1.eq("machine_id", String(machineId).toUpperCase());

    let { data: upd1, error: e1 } = await q1.select("*");
    if (e1) throw e1;
    let affected = upd1?.length ?? 0;

    if (affected === 0) {
      const { data: upd2, error: e2 } = await supabase
        .from("key_slot_presence")
        .update({
          UID: null,
          removed_at: isoNow,
          notes: noteBase,
        })
        .eq("UID", uid)
        .is("removed_at", null)
        .select("*");
      if (e2) throw e2;
      affected = upd2?.length ?? 0;
    }

    if (affected === 0) {
      const { data: upd3, error: e3 } = await supabase
        .from("key_slot_presence")
        .update({
          UID: null,
          removed_at: isoNow,
          notes: noteBase,
        })
        .eq("UID", uid)
        .select("*");
      if (e3) throw e3;
      affected = upd3?.length ?? 0;
    }

    if (affected === 0 && typeof uid === "string") {
      const variants = [uid.toUpperCase(), uid.toLowerCase()];
      for (const v of variants) {
        const { data: upd4, error: e4 } = await supabase
          .from("key_slot_presence")
          .update({
            UID: null,
            removed_at: isoNow,
            notes: noteBase,
          })
          .eq("UID", v)
          .is("removed_at", null)
          .select("*");
        if (e4) throw e4;
        affected = upd4?.length ?? 0;
        if (affected > 0) break;
      }
    }

    result.slotsCleared = affected;
    if (affected === 0) {
      console.warn("[invalidateByUID] No key_slot_presence row cleared for UID:", uid, "machine:", machineId);
    }

    return result;
  } catch (err) {
    console.error("invalidateByUID error:", err);
    throw err;
  }
}

function extractStatusText(r) {
  if (!r) return "";
  if (typeof r === "string") return r;
  if (typeof r.text === "string") return r.text;
  if (typeof r.status === "string") return r.status;
  if (typeof r.message === "string") return r.message;
  try { return JSON.stringify(r); } catch { return String(r); }
}

function isRelayOnSuccess(resp) {
  const s = extractStatusText(resp);
  return s.includes("Pi relay turned ON");
}

function parseLimitSwitch(resp) {
  const s = extractStatusText(resp).toUpperCase();
  if (s.includes("LIMIT SWITCH IS OFF")) return "OFF";
  if (s.includes("LIMIT SWITCH IS ON")) return "ON";
  return "UNKNOWN";
}

export default function Page() {
  const { token } = useParams();
  // normalize the URL param to a single string
  const linkToken = typeof token === "string"
    ? token
    : Array.isArray(token)
    ? token[0]
    : String(token ?? "");

  console.log("[pickup] page mounted. token =", token, "linkToken =", linkToken);


  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [expiredReason, setExpiredReason] = useState(null);
  const [error, setError] = useState("");

  const [data, setData] = useState(null);
const [step, setStep] = useState("welcome");

  const [lastName, setLastName] = useState("");
  const [machineId, setMachineId] = useState(["", "", ""]);
  const [focusedIndex, setFocusedIndex] = useState(null);
  const [showKeypad, setShowKeypad] = useState(false);

  // NEW: hint toggle state
  const [showHint, setShowHint] = useState(false);

  // API states
  const [doorResponse, setDoorResponse] = useState(null);
  const [relayResponse, setRelayResponse] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState(null);

  const pinRefs = [useRef(null), useRef(null), useRef(null)];
  const pageRef = useRef(null);
  const keypadRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");

      try {
        if (!linkToken) {

          setError("Missing token in URL.");
          return;
        }

        const { data: row, error: qErr } = await supabase
          .from(TABLE_NAME)
          .select(DB_COLUMNS)
          .eq(TOKEN_COLUMN, linkToken)

          .single();

        if (qErr) {
          if (qErr.code === "PGRST116" || qErr.details?.includes("Results contain 0 rows")) {
            setError("Invalid or not found.");
          } else {
            setError("Database error: " + (qErr.message || "unknown"));
          }
          return;
        }

        const now = new Date();
        const expiredByDate = row.check_out ? now > new Date(row.check_out) : false;
        const inactive = row.valid === false;

        if (expiredByDate) {
          setExpired(true);
          setExpiredReason("time");
        }
        if (inactive) {
          setExpired(true);
          setExpiredReason("invalid");
        }
        if (!mounted) return;

        setData({
          city: row.city || "",
          machineAddress: row.machine_address || "",
          machineName: row.machine_name || "Unknown machine",
          machineId: String(row.machine_id ?? "").toUpperCase(),
          roomNo: row.room_no ?? null,
          platform: row.platform || "",
          clientLastName: row.client_last_name || "",
          clientFirstName: row.client_first_name || "",
          doorOnUrl: row.door_on_req || "",
          doorStatusUrl: row.door_status_req || "",
          relayOnUrl: row.relay_on_req || "",
          relayStatusUrl: row.relay_status_req || "",
        });

        try {
          let fetchedUID = null;
          if (row.room_no) {
            const { data: krow, error: kErr } = await supabase
              .from("keys")
              .select("UID")
              .eq("room_number", row.room_no)
              .maybeSingle();
            if (kErr) console.warn("[load] keys lookup error:", kErr);
            fetchedUID = krow?.UID ?? null;
          }
          setData(prev => ({ ...prev, uid: fetchedUID }));
        } catch (e) {
          console.warn("[load] UID fetch failed:", e);
        }

      } catch (e) {
        setError("Unexpected error: " + (e?.message || String(e)));
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [linkToken]);


  useEffect(() => {
    const handleClickOutside = (event) => {
      const target = event.target;
      const clickedInsideMachineId = pinRefs.some(
        (ref) => ref.current && ref.current.contains(target)
      );
      const clickedInsideKeypad =
        keypadRef.current && keypadRef.current.contains(target);
      if (!clickedInsideMachineId && !clickedInsideKeypad) {
        setShowKeypad(false);
        setFocusedIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (focusedIndex !== null) {
      pinRefs[focusedIndex]?.current?.focus();
      keypadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusedIndex, pinRefs]);

  useEffect(() => {
    if (data && lastName.trim() !== "" && machineId.every((c) => c.trim() !== "")) {
      handleConfirm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastName, machineId]);

  useEffect(() => {
    if (step === "closeDoor") {
      const timer = setTimeout(() => setStep("success"), 5000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  function handleKeypadClick(value) {
    if (value === "⌫") {
      handleBackspace();
      return;
    }
    if (focusedIndex !== null && focusedIndex < 3) {
      const next = [...machineId];
      next[focusedIndex] = value.toUpperCase();
      setMachineId(next);
      keypadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

      if (focusedIndex < 2) setFocusedIndex(focusedIndex + 1);
      else {
        setFocusedIndex(null);
        setShowKeypad(false);
      }
    }
  }

  function handleBackspace() {
    if (focusedIndex !== null && focusedIndex >= 0) {
      const next = [...machineId];
      if (next[focusedIndex]) {
        next[focusedIndex] = "";
      } else if (focusedIndex > 0) {
        setFocusedIndex(focusedIndex - 1);
        pinRefs[focusedIndex - 1].current?.focus();
        next[focusedIndex - 1] = "";
      }
      setMachineId(next);
      setShowKeypad(true);
      keypadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function handleConfirm() {
    if (!data) {
      setError("Data not loaded yet");
      return;
    }

    const enteredMachineId = machineId.join("").toUpperCase().trim();
    const dbMachineId = data?.machineId?.toUpperCase().trim();
    const enteredLastName = lastName.trim().toLowerCase();
    const dbLastName = data?.clientLastName?.toLowerCase().trim();

    if (!enteredLastName || !enteredMachineId) {
      setError("Please fill all fields");
      return;
    }

    if (enteredLastName !== dbLastName && enteredMachineId !== dbMachineId) {
      setError("❌ Both last name and machine ID are incorrect.");
    } else if (enteredLastName !== dbLastName) {
      setError("❌ Incorrect last name.");
    } else if (enteredMachineId !== dbMachineId) {
      setError("❌ Incorrect machine ID.");
    } else {
      setError("");
      setStep("openDoor");
    }
  }

  async function handleOpenDoor() {
  setApiLoading(true);
  setApiError(null);
  console.log("[pickup] handleOpenDoor start");


    try {
      if (!data?.doorOnUrl) throw new Error("Missing door_on_req URL");

      const doorResp = await fetchWithTimeout(data.doorOnUrl, 10000);
      setDoorResponse(doorResp);

      if (isRelayOnSuccess(doorResp) && data?.doorStatusUrl) {
        try {
          await new Promise(res => setTimeout(res, 200));
          const statusResp = await fetchWithTimeout(data.doorStatusUrl, 8000);
const limit = parseLimitSwitch(statusResp);
console.log("[pickup] door limit switch =", limit, "raw:", statusResp);

      
          if (limit === "OFF") {
            setDoorResponse({ door: doorResp, statusText: extractStatusText(statusResp) });
            setStep("releaseKey");
          } else if (limit === "ON") {
            setDoorResponse({ door: doorResp, statusText: extractStatusText(statusResp) });
            setApiError("Door cant open please check if something block the door");
          } else {
            setDoorResponse({ door: doorResp, statusText: extractStatusText(statusResp) });
            setApiError("Unexpected door status. Please try again.");
          }
        } catch (e) {
          // @ts-ignore
          if (e.code === "TIMEOUT") setApiError("machine are offline Please check if machine connected to power or call support");
          else setApiError(`Door status error: ${e.message}`);
        }
        return;
      }

      setApiError("machine are offline Please check if machine connected to power or call support");
    } catch (error) {
      // @ts-ignore
      if (error.code === "TIMEOUT" || String(error.message || "").startsWith("HTTP "))
        setApiError("machine are offline Please check if machine connected to power or call support");
      else setApiError(`Door operation failed: ${error.message}`);
    } finally {
      setApiLoading(false);
    }
  }

 async function handleReleaseKey() {
  setApiLoading(true);
  setApiError(null);
  console.log("[pickup] handleReleaseKey start");

  try {
    if (!data?.relayOnUrl) throw new Error("Missing relay_on_req URL");

    const relayResp = await fetchWithTimeout(data.relayOnUrl, 10000);
    console.log("[pickup] relay ON response =", relayResp);

    // Give the hardware time to move
    await new Promise((res) => setTimeout(res, 5000));

    if (!data?.relayStatusUrl) throw new Error("Missing relay_status_req URL");

    const statusResp = await fetchWithTimeout(data.relayStatusUrl, 8000);
    const respText = (statusResp.esp_response || extractStatusText(statusResp)).toUpperCase();
    console.log("[pickup] relay status respText =", respText);

    if (respText.includes("LIMIT") && respText.includes(":ON")) {
      setApiError("Please take the key !!");
      return;
    }

    if (respText.includes("LIMIT") && respText.includes(":OFF")) {
      setApiError("");

      // 1) Mark DB state (invalidate link, mark key out, clear slot)
      try {
        await invalidateByUID(supabase, {
          token: linkToken,             // <-- use normalized token
          uid: data.uid,
          machineId: data.machineId,
          roomNo: data.roomNo,
        });
        console.log("[pickup] invalidateByUID done");
      } catch (e) {
        console.warn("invalidateByUID failed:", e);
      }

      // 2) TRIGGER EMAILS — call your Supabase Edge Function (notify-pickup)
      //    Inserted RIGHT AFTER invalidateByUID and BEFORE closing UI
      try {
        const payload = {
          token: linkToken,            // <-- use normalized token
          uid: data?.uid,
          machineId: data?.machineId,
          roomNo: data?.roomNo,
        };
        console.log("notify-pickup POST payload →", payload);

        const resp = await fetch(
          "https://vnnqjmsshzbmngnlyvzq.functions.supabase.co/notify-pickup",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        const raw = await resp.text();
        console.log("notify-pickup → status", resp.status, "body", raw);

        if (!resp.ok) {
          setApiError(`Couldn’t send confirmation email (${resp.status}).`);
        }
      } catch (e) {
        console.warn("notify-pickup fetch error:", e);
        setApiError("Email trigger failed. Check console for details.");
      }

      // 3) Continue the UI flow
      setRelayResponse(null);
      alert("The key has been delivered successfully. Please close the door");
      setStep("closeDoor");
      return;
    }

    // Unknown response
    setApiError("Unexpected key status. Please try again.");
  } catch (error) {
    // @ts-ignore
    if (error.code === "TIMEOUT" || String(error.message || "").startsWith("HTTP ")) {
      setApiError("Machine is offline. Please check if machine connected to power or call support");
    } else {
      setApiError(`Key release failed: ${error.message}`);
    }
  } finally {
    setApiLoading(false);
  }
}


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-700 to-purple-800 text-white">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  if (expired) {
    const title = expiredReason === "invalid" ? "Invalid link" : "Expired";
    const msg =
      expiredReason === "invalid"
        ? "This pickup link has already been used and is no longer valid."
        : "This pickup link has expired and can’t be used anymore.";
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-red-700 to-red-900 text-white p-6">
        <h1 className="text-5xl font-bold mb-4">{title}</h1>
        <p className="text-lg text-center">{msg}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-700 to-purple-800 text-white p-6">
        <h1 className="text-5xl font-bold mb-4">Error</h1>
        <p className="text-lg text-center">Unable to load pickup information.</p>
      </div>
    );
  }

  return (
    <div
      ref={pageRef}
      className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-700 to-purple-800 text-white px-4 py-8 relative"
    >
      {step !== "welcome" && (
  <div className="text-center mb-8">
    <h1 className="text-4xl font-extrabold tracking-tight mb-2">🔑 KEYMATIC PICKUP</h1>
    <p className="text-white/80">Welcome {formatName(data?.clientFirstName)}</p>
  </div>
)}


      {step !== "welcome" && (
  <div className="text-center mb-6">
    <p className="mb-1">
      Picking key No <span className="font-semibold">"{data?.roomNo}"</span>
    </p>
    <p>
      From Machine Name :<span className="font-semibold">{data?.machineName}</span>
      {data?.city && ` / City: ${data.city}`}
    </p>
  </div>
)}





{step === "welcome" && (
  <div className="w-full max-w-md">
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/15 shadow-lg text-center space-y-4">

      
      {/* Header */}
      <p className="text-xs tracking-widest uppercase text-white/70">
        KEYMATIC • KEY DELIVERY MACHINE 🔑
      </p>

      {/* Welcome */}
      <h1 className="text-4xl font-extrabold tracking-tight text-white">
        WELCOME
      </h1>
      <p className="text-3xl font-bold text-white">
        {formatName(data?.clientFirstName)}
      </p>

      {/* Confirmation Lines */}
      <div className="text-sm leading-relaxed text-white/90 space-y-1">
  <p>Please confirm the following:</p>
  <p>
    📍 City: <strong>{data?.city ?? "-"}</strong>
    {data?.machineAddress && ` — ${data.machineAddress}`}
  </p>
  <p>
    🏷️ Confirm the Machine Name is: <strong>{formatName(data?.machineName) ?? "-"}</strong>
  </p>
  <p>🔑 To grab key for room <strong>{data?.roomNo ?? "-"}</strong></p>
  <p>🖥️ Platform: <strong>{data?.platform ?? "-"}</strong></p>
</div>


      {/* Info */}
      <p className="text-sm text-white/85">
        💡 You’re about to pick up your key. It’s quick and straightforward.
      </p>
      <p className="text-sm text-white/85">
        ⚡ The process usually takes under a minute.
      </p>

      {/* Start Button */}
      <button
        onClick={() => setStep("confirm")}
        className="mt-4 w-full bg-white text-indigo-900 font-semibold py-2 rounded-lg hover:bg-indigo-100 transition"
      >
        ✅ I’m at the machine — Start
      </button>

      {/* Note */}
      <p className="text-xs text-white/60">
        🕒 Not at the machine? Open this link again when you arrive.
      </p>
    </div>
  </div>
)}





      {step === "confirm" && (
        <div className="w-full max-w-xs text-center">
          <p className="mb-2 text-lg font-medium">Please confirm your last name as sent on the Email</p>
          <input
            type="text"
            placeholder="Enter your last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={`p-2 border rounded-lg w-full mb-3 text-white placeholder-gray-300 text-center focus:outline-none focus:ring-2 ${
              error.includes("last name") 
                ? "border-red-500 bg-red-900/20 focus:ring-red-500"
                : "border-gray-300 focus:ring-white focus:border-blue-900"
            }`}
          />

          <div className="mb-2 flex items-center justify-between">
  <p className="text-lg font-medium">Enter Machine ID</p>
  <button
    type="button"
    onClick={() => setShowHint(v => !v)}
    className="text-sm underline text-blue-200 hover:text-white"
  >
    {showHint ? "Hide hint" : "How to get it"}
  </button>
</div>
{showHint && (
  <div className="mt-2 flex justify-center">
    <img
      src="/MachineID.jpg"
      alt="Where to find the Machine ID label on your device"
      className="w-32 h-auto rounded-lg border border-white/30 shadow"
    />
  </div>
)}

          <div className="flex justify-center gap-1 mb-1">
            {machineId.map((char, idx) => (
              <input
                key={idx}
                type="text"
                value={char}
                maxLength={1}
                onFocus={() => { setFocusedIndex(idx); setShowKeypad(true); }}
                ref={pinRefs[idx]}
                readOnly
                className={`w-20 h-20 text-center text-black rounded-lg text-xl placeholder-gray-400 bg-white transition focus:outline-none ${
                  error.includes("machine ID") || error.includes("Both")
                    ? "border-2 border-red-500 bg-red-100"
                    : focusedIndex === idx
                      ? "ring-4 ring-blue-900 border-blue-900"
                      : "border border-gray-300"
                }`}
                placeholder="•"
              />
            ))}
          </div>

          

          {showKeypad && (
            <div
              ref={keypadRef}
              className="bg-white bg-opacity-20 backdrop-blur-lg p-3 rounded-2xl shadow-xl mt-3"
            >
              <div className="grid grid-cols-3 gap-y-3 gap-x-3 justify-items-center">
                {[
                  "1","2","3",
                  "4","5","6",
                  "7","8","9",
                  "A","0","B",
                  "C","D","⌫",
                ].map((btn, idx) => (
                  <button
                    key={idx}
                    onClick={() => btn && handleKeypadClick(btn)}
                    disabled={!btn}
                    className={`w-20 h-20 flex items-center justify-center rounded-full text-2xl font-semibold ${
                      btn === "⌫"
                        ? "text-white bg-red-500 hover:bg-red-600"
                        : "text-gray-800 bg-gray-100 hover:bg-gray-200"
                    } shadow active:scale-95 transition`}
                  >
                    {btn}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-red-300 mt-2 font-medium bg-red-900/30 px-4 py-2 rounded-lg border border-red-500 animate-pulse">
              {error}
            </p>
          )}
        </div>
      )}

      {step === "openDoor" && (
        <div className="mt-5 text-center w-full max-w-xs">
          <button
            onClick={handleOpenDoor}
            disabled={apiLoading}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg w-full transition transform active:scale-95 disabled:opacity-50"
          >
            {apiLoading ? "Opening..." : "Open Machine Door"}
          </button>
          {apiError && <p className="text-red-300 mt-2">{apiError}</p>}
        </div>
      )}

      {step === "releaseKey" && (
        <div className="mt-5 text-center w-full max-w-xs">
          <button
            onClick={handleReleaseKey}
            disabled={apiLoading}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg w-full transition transform active:scale-95 disabled:opacity-50"
          >
            {apiLoading ? "Releasing...Please Pull the key Now !" : "🔑 Release Key"}
          </button>
          {apiError && <p className="text-red-300 mt-2">{apiError}</p>}
        </div>
      )}

      {step === "closeDoor" && (
        <div className="mt-5 text-center w-full max-w-xs">
          <p className="text-xl mb-3 text-blue-200">✅ Key released successfully</p>
          <p className="text-lg">Please close the door to finish.</p>
          <p className="mt-3 text-sm text-gray-200 animate-pulse">Waiting for door to close...</p>
        </div>
      )}

      {step === "success" && (
        <div className="mt-6 text-center">
          <h2 className="text-2xl font-bold mb-3 text-green-300">Thank you</h2>
          <p className="text-lg">Process complete. Have a nice day.</p>
        </div>
      )}
    </div>
  );
}
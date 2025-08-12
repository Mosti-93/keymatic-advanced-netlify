"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

const TABLE_NAME = "pickup_requests";
const TOKEN_COLUMN = "link_token";
const DB_COLUMNS = "client_first_name,client_last_name,machine_id,room_no,check_out,valid,machine_name,city,door_on_req,door_status_req,relay_on_req,relay_status_req";

function formatName(name) {
  return name ? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() : "";
}

async function callMachineAPI(endpoint, payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`/api/machine/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
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
        e.code = "TIMEOUT";
        throw e;
      }
      throw err;
    });
}

async function invalidateLink(supabase, token, roomNo, machineId) {
  const isoNow = new Date().toISOString();

  try {
    // 1) Mark pickup request as invalid
    const { error: e1 } = await supabase
      .from(TABLE_NAME)
      .update({ valid: false, pulled_at: isoNow })
      .eq(TOKEN_COLUMN, token);
    if (e1) throw e1;

    // 2) Update key status to OUT
    if (roomNo) {
      const { error: e2 } = await supabase
        .from("keys")
        .update({ 
          isPresent: 'OUT', 
          last_status_time: isoNow,
          statusText: "KEY_REMOVED"
        })
        .eq("room_number", roomNo);
      if (e2) throw e2;

      // 3) Get UID from keys table
      const { data: keyData, error: e3 } = await supabase
        .from("keys")
        .select("UID")
        .eq("room_number", roomNo)
        .maybeSingle();
      if (e3) throw e3;
      if (!keyData) throw new Error(`No key found for room ${roomNo}`);

      const uid = keyData.UID;
      if (uid) {
        // 4) Find and update the presence record
        const query = supabase
          .from("key_slot_presence")
          .update({
            UID: null,
            removed_at: isoNow,
            notes: `Key removed for room ${roomNo}`
          })
          .eq("UID", uid)
          .is("removed_at", null);

        if (machineId) {
          query.eq("machine_id", machineId);
        }

        const { error: e4 } = await query;
        if (e4) throw e4;
      }
    }
  } catch (error) {
    console.error("Error in invalidateLink:", error);
    throw error;
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

  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [expiredReason, setExpiredReason] = useState(null); // "invalid" | "time" | null

  const [error, setError] = useState("");

  const [data, setData] = useState(null);
  const [step, setStep] = useState("confirm");

  const [lastName, setLastName] = useState("");
  const [machineId, setMachineId] = useState(["", "", ""]);
  const [focusedIndex, setFocusedIndex] = useState(null);
  const [showKeypad, setShowKeypad] = useState(false);

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
        if (!token) {
          setError("Missing token in URL.");
          return;
        }

        const { data: row, error: qErr } = await supabase
  .from(TABLE_NAME)
  .select(DB_COLUMNS)
  .eq(TOKEN_COLUMN, token)
  .single();  // <- exactly one link/request

if (qErr) {
  // 404 from .single() means "no row for this token"
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
  machineName: row.machine_name || "Unknown machine",
  machineId: String(row.machine_id ?? "").toUpperCase(),
  roomNo: row.room_no || "N/A",
  clientLastName: row.client_last_name || "",
  clientFirstName: row.client_first_name || "",
  // signed URLs for this request
  doorOnUrl: row.door_on_req || "",
  doorStatusUrl: row.door_status_req || "",
  relayOnUrl: row.relay_on_req || "",
  relayStatusUrl: row.relay_status_req || "",
});

      } catch (e) {
        setError("Unexpected error: " + (e?.message || String(e)));
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [token]);

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
    if (
      data &&
      lastName.trim() !== "" &&
      machineId.every((c) => c.trim() !== "")
    ) {
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

  try {
    if (!data?.doorOnUrl) throw new Error("Missing door_on_req URL");

    console.log("Sending door_on_req to:", data.doorOnUrl);
    const doorResp = await fetchWithTimeout(data.doorOnUrl, 10000);
    console.log("Door_on_req response:", doorResp);

    // Always show raw response (you can hide later)
    setDoorResponse(doorResp);

    // CASE 1: success pattern -> immediately check door_status_req
    if (isRelayOnSuccess(doorResp) && data?.doorStatusUrl) {
      try {
        // small delay before checking door status
await new Promise(res => setTimeout(res, 200));

console.log("Sending door_status_req to:", data.doorStatusUrl);
const statusResp = await fetchWithTimeout(data.doorStatusUrl, 8000);

        console.log("Door_status_req response:", statusResp);

        const limit = parseLimitSwitch(statusResp);

        if (limit === "OFF") {
          // Door opened -> move to release key
          setDoorResponse({
            door: doorResp,
            statusText: extractStatusText(statusResp),
          });
          setStep("releaseKey");
        } else if (limit === "ON") {
          // Door still closed -> show message and keep user on same step with retry
          setDoorResponse({
            door: doorResp,
            statusText: extractStatusText(statusResp),
          });
          setApiError("Door cant open please check if something block the door");
          // Keep current step = "openDoor" so the button is still available
        } else {
          // Unknown/Unexpected -> show text but do not advance
          setDoorResponse({
            door: doorResp,
            statusText: extractStatusText(statusResp),
          });
          setApiError("Unexpected door status. Please try again.");
        }
      } catch (e) {
        if (e.code === "TIMEOUT") {
          setApiError("machine are offline Please check if machine connected to power or call support");
        } else {
          setApiError(`Door status error: ${e.message}`);
        }
        // Stay on openDoor step
      }
      return; // We handled case 1 completely
    }

    // CASE 2: bad/other response -> treat as offline
    // (Our fetchWithTimeout throws on HTTP errors; reaching here means HTTP OK but no success pattern)
    setApiError("machine are offline Please check if machine connected to power or call support");

  } catch (error) {
    // HTTP error / timeout / network -> offline message
    if (error.code === "TIMEOUT" || String(error.message || "").startsWith("HTTP ")) {
      setApiError("machine are offline Please check if machine connected to power or call support");
    } else {
      setApiError(`Door operation failed: ${error.message}`);
    }
  } finally {
    setApiLoading(false);
  }
}



  async function handleReleaseKey() {
  setApiLoading(true);
  setApiError(null);

  try {
    if (!data?.relayOnUrl) throw new Error("Missing relay_on_req URL");

    // 1) Send relay_on_req
    console.log("Sending relay_on_req to:", data.relayOnUrl);
    const relayResp = await fetchWithTimeout(data.relayOnUrl, 10000);
    console.log("Relay_on_req response:", relayResp);

    // Wait 5 seconds before checking key status
    await new Promise(res => setTimeout(res, 5000));

    if (!data?.relayStatusUrl) throw new Error("Missing relay_status_req URL");

    // 2) Send relay_status_req
    console.log("Sending relay_status_req to:", data.relayStatusUrl);
    const statusResp = await fetchWithTimeout(data.relayStatusUrl, 8000);
    console.log("Relay_status_req response:", statusResp);

    // Extract esp_response text
    const respText = (statusResp.esp_response || extractStatusText(statusResp)).toUpperCase();

    if (respText.includes("LIMIT") && respText.includes(":ON")) {
      // Key still in place
      setApiError("Please take the key !!");
      // Keep Release Key button active (stay on releaseKey step)
    } else if (respText.includes("LIMIT") && respText.includes(":OFF")) {
  // Key removed -> mark link invalid immediately
  setApiError(""); // clear error
  try {
await invalidateLink(supabase, token, data.roomNo, data.machineId);  } catch (e) {
    console.warn("invalidateLink failed:", e);
  }
  alert("The key has been delivered successfully. Please close the door");
  setStep("closeDoor");


    } else {
      // Unknown response
      setApiError("Unexpected key status. Please try again.");
    }

  } catch (error) {
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
      <div className="text-center mb-12">
        <h2 className="text-2xl mb-1">
          Welcome {formatName(data?.clientFirstName)}
        </h2>
        <p className="text-lg mb-1">to</p>
        <h1 className="text-4xl font-extrabold tracking-tight mb-8">
          KEYMATIC PICKUP
        </h1>
      </div>

      <div className="text-center mb-6">
        <p className="mb-1">
          Picking key No <span className="font-semibold">"{data?.roomNo}"</span>
        </p>
        <p>
          From Machine Name :<span className="font-semibold">{data?.machineName}</span>
          {data?.city && ` / City: ${data.city}`}
        </p>
      </div>

      {step === "confirm" && (
        <div className="w-full max-w-xs text-center">
          <p className="mb-2 text-lg font-medium">Please confirm your last name</p>
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

          <p className="mb-2 text-lg font-medium">Enter Machine ID</p>
          <div className="flex justify-center gap-1 mb-2">
            {machineId.map((char, idx) => (
              <input
                key={idx}
                type="text"
                value={char}
                maxLength={1}
                onFocus={() => {
                  setFocusedIndex(idx);
                  setShowKeypad(true);
                }}
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
            {apiLoading ? "Releasing...Please Pull the key Now !" : "Release Key"}
          </button>
          
          {apiError && <p className="text-red-300 mt-2">{apiError}</p>}
        </div>
      )}

      {step === "closeDoor" && (
        <div className="mt-5 text-center w-full max-w-xs">
          <p className="text-xl mb-3 text-blue-200">
            Key Released Successfully
            {relayResponse?.message && `: ${relayResponse.message}`}
          </p>
          <div className="bg-blue-900/30 p-3 rounded-lg mb-4">
            <pre className="text-xs overflow-x-auto">
              {JSON.stringify(relayResponse, null, 2)}
            </pre>
          </div>
          <p className="text-lg">Please close the door to finish.</p>
          <p className="mt-3 text-sm text-gray-200 animate-pulse">
            Waiting for door to close...
          </p>
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
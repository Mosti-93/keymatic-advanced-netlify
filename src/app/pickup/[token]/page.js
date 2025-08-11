"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/utils/supabaseClient";

const TABLE_NAME = "pickup_requests";
const TOKEN_COLUMN = "client_id";
const DB_COLUMNS = "client_first_name,client_last_name,machine_id,room_no,check_out,valid,machine_name,city";

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

export default function Page() {
  const { token } = useParams();

  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
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

        const { data: rows, error: qErr } = await supabase
          .from(TABLE_NAME)
          .select(DB_COLUMNS)
          .eq(TOKEN_COLUMN, token)
          .limit(1);

        if (qErr) {
          setError("Database error: " + (qErr.message || "unknown"));
          return;
        }
        if (!rows || rows.length === 0) {
          setError("Invalid or not found.");
          return;
        }

        const row = rows[0];
        const now = new Date();
        const expiredByDate = row.check_out ? now > new Date(row.check_out) : false;
        const inactive = row.valid === false;

        if (expiredByDate || inactive) setExpired(true);

        if (!mounted) return;

        setData({
          city: row.city || "",
          machineName: row.machine_name || "Unknown machine",
          machineId: String(row.machine_id ?? "").toUpperCase(),
          roomNo: row.room_no || "N/A",
          clientLastName: row.client_last_name || "",
          clientFirstName: row.client_first_name || "",
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
      const response = await callMachineAPI('door', { 
        action: 'door_on_req',
        machineId: data.machineId,
        clientId: token 
      });
      
      setDoorResponse(response);
      setStep("releaseKey");
    } catch (error) {
      setApiError(`Door operation failed: ${error.message}`);
    } finally {
      setApiLoading(false);
    }
  }

  async function handleReleaseKey() {
    setApiLoading(true);
    setApiError(null);
    
    try {
      const response = await callMachineAPI('relay', { 
        action: 'relay_on_req',
        machineId: data.machineId,
        clientId: token 
      });
      
      setRelayResponse(response);
      setStep("closeDoor");
    } catch (error) {
      setApiError(`Key release failed: ${error.message}`);
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
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-red-700 to-red-900 text-white p-6">
        <h1 className="text-5xl font-bold mb-4">Expired</h1>
        <p className="text-lg text-center">This link is no longer valid.</p>
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
          From <span className="font-semibold">{data?.machineName}</span>
          {data?.city && ` • ${data.city}`}
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
            {apiLoading ? "Opening..." : "Open Machine Door (door_on_req)"}
          </button>
          {doorResponse && (
            <div className="mt-3 p-2 bg-green-900/30 rounded-lg">
              <p className="text-green-300">Response:</p>
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(doorResponse, null, 2)}
              </pre>
            </div>
          )}
          {apiError && <p className="text-red-300 mt-2">{apiError}</p>}
        </div>
      )}

      {step === "releaseKey" && (
        <div className="mt-5 text-center w-full max-w-xs">
          <p className="text-xl mb-3 text-green-300">
            Door Status: {doorResponse?.status || "Open"}
          </p>
          <button
            onClick={handleReleaseKey}
            disabled={apiLoading}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg w-full transition transform active:scale-95 disabled:opacity-50"
          >
            {apiLoading ? "Releasing..." : "Release Key (relay_on_req)"}
          </button>
          {relayResponse && (
            <div className="mt-3 p-2 bg-green-900/30 rounded-lg">
              <p className="text-green-300">Response:</p>
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(relayResponse, null, 2)}
              </pre>
            </div>
          )}
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
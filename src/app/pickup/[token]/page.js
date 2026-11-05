"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { formatName, normalizeToken } from "@/lib/pickup";

const OFFLINE_MSG = "The machine is offline. Please check that it is connected to power, or contact support.";

/** POST to one of this link's server routes; returns { status, body }. */
async function postLink(token, path, payload) {
  const res = await fetch(`/api/pickup-link/${encodeURIComponent(token)}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export default function Page() {
  const { token } = useParams();
  const linkToken = normalizeToken(token);

  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [expiredReason, setExpiredReason] = useState(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const [data, setData] = useState(null);
  const [step, setStep] = useState("welcome");

  const [lastName, setLastName] = useState("");
  const [machineId, setMachineId] = useState(["", "", ""]);
  const [focusedIndex, setFocusedIndex] = useState(null);
  const [showKeypad, setShowKeypad] = useState(false);

  // NEW: hint toggle state
  const [showHint, setShowHint] = useState(false);

  // API states
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [keyReleased, setKeyReleased] = useState(false);
  const [apiDetail, setApiDetail] = useState("");

  const pin0 = useRef(null);
  const pin1 = useRef(null);
  const pin2 = useRef(null);
  const pinRefs = useMemo(() => [pin0, pin1, pin2], []);
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

        const res = await fetch(`/api/pickup-link/${encodeURIComponent(linkToken)}`, { cache: "no-store" });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(res.status === 404 ? "Invalid or not found." : payload.error || "Could not load this pickup link.");
          return;
        }
        const b = payload.booking || {};

        if (b.state === "used") {
          setExpired(true);
          setExpiredReason("invalid");
        } else if (b.state === "expired") {
          setExpired(true);
          setExpiredReason("time");
        } else if (b.state === "notyet") {
          setExpired(true);
          setExpiredReason("notyet");
        }
        if (!mounted) return;

        setData({
          city: b.city || "",
          machineAddress: b.machineAddress || "",
          machineName: b.machineName || "Unknown machine",
          roomNo: b.roomNo ?? null,
          platform: b.platform || "",
          clientFirstName: b.clientFirstName || "",
          checkIn: b.checkIn || null,
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
  }, [linkToken]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const target = event.target;
      const clickedInsideMachineId = pinRefs.some((ref) => ref.current && ref.current.contains(target));
      const clickedInsideKeypad = keypadRef.current && keypadRef.current.contains(target);
      if (!clickedInsideMachineId && !clickedInsideKeypad) {
        setShowKeypad(false);
        setFocusedIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pinRefs]);

  useEffect(() => {
    if (focusedIndex !== null) {
      pinRefs[focusedIndex]?.current?.focus();
      keypadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusedIndex, pinRefs]);

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
      setError("");
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
      setError("");
      setShowKeypad(true);
      keypadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  const answersComplete = lastName.trim() !== "" && machineId.every((c) => c.trim() !== "");

  /** Send the guest's answers to the server, which decides. */
  async function handleVerify() {
    if (!answersComplete || checking) return;
    setChecking(true);
    setError("");
    try {
      const { status, body } = await postLink(linkToken, "verify", {
        lastName: lastName.trim(),
        machineId: machineId.join(""),
      });
      if (body.ok) {
        setStep("openDoor");
        return;
      }
      if (status === 410) {
        setExpired(true);
        setExpiredReason(body.state === "used" ? "invalid" : body.state === "notyet" ? "notyet" : "time");
        return;
      }
      const left = typeof body.triesLeft === "number" ? ` (${body.triesLeft} tries left)` : "";
      setError((body.error || "Could not check your answers.") + left);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  /** Ask the server to run one machine step. Returns the result word. */
  async function runAction(action) {
    const { status, body } = await postLink(linkToken, "action", { action });
    if (body.reason) console.warn("[pickup]", action, body.reason);
    setApiDetail(body.reason ? String(body.reason).slice(0, 60) : "");
    if (status === 401) {
      // The check expired (more than a few minutes passed). Ask again.
      setStep("confirm");
      setError("Please confirm your last name and Machine ID again.");
      return "unverified";
    }
    if (status === 410) {
      setExpired(true);
      setExpiredReason(body.state === "used" ? "invalid" : body.state === "notyet" ? "notyet" : "time");
      return "closed";
    }
    return body.result || "error";
  }

  async function handleOpenDoor() {
    setApiLoading(true);
    setApiError(null);
    try {
      const result = await runAction("open");
      if (result === "open") setStep("releaseKey");
      else if (result === "blocked") setApiError("The door could not open. Please check that nothing is blocking it.");
      else if (result === "offline") setApiError(OFFLINE_MSG);
      else if (result === "unknown") setApiError("Unexpected door status. Please try again.");
      else if (result === "error") setApiError("Something went wrong. Please try again.");
    } catch {
      setApiError("Network error. Please try again.");
    } finally {
      setApiLoading(false);
    }
  }

  /** Is the key out yet? Finishes the pickup on the server when it is. */
  async function checkKey() {
    const result = await runAction("check");
    if (result === "taken") setStep("closeDoor");
    else if (result === "still_in") setApiError("Please take your key, then tap the button again.");
    else if (result === "offline") setApiError(OFFLINE_MSG);
    else if (result === "unknown") setApiError("Unexpected key status. Please try again.");
    else if (result === "error") setApiError("Something went wrong. Please try again.");
    return result;
  }

  async function handleReleaseKey() {
    setApiLoading(true);
    setApiError(null);
    try {
      if (keyReleased) {
        await checkKey();
        return;
      }
      const result = await runAction("release");
      if (result === "released") {
        setKeyReleased(true);
        // Give the hardware time to move, then check the slot.
        await new Promise((res) => setTimeout(res, 5000));
        await checkKey();
      } else if (result === "offline") setApiError(OFFLINE_MSG);
      else if (result === "error") setApiError("Something went wrong. Please try again.");
    } catch {
      setApiError("Network error. Please try again.");
    } finally {
      setApiLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 text-white">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  if (expired) {
    const title = expiredReason === "invalid" ? "Invalid link" : expiredReason === "notyet" ? "Not yet" : "Expired";
    const msg =
      expiredReason === "invalid"
        ? "This pickup link has already been used and is no longer valid."
        : expiredReason === "notyet"
          ? `This pickup link works from your check-in time${
              data?.checkIn ? ` (${new Date(data.checkIn).toLocaleString()})` : ""
            }. Please come back then.`
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 text-white p-6">
        <h1 className="text-5xl font-bold mb-4">Error</h1>
        <p className="text-lg text-center">Unable to load pickup information.</p>
      </div>
    );
  }

  return (
    <div
      ref={pageRef}
      className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-700 to-blue-900 text-white px-4 py-8 relative"
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
            Picking key No <span className="font-semibold">&ldquo;{data?.roomNo}&rdquo;</span>
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
            <p className="text-xs tracking-widest uppercase text-white/70">KEYMATIC • KEY DELIVERY MACHINE 🔑</p>

            {/* Welcome */}
            <h1 className="text-4xl font-extrabold tracking-tight text-white">WELCOME</h1>
            <p className="text-3xl font-bold text-white">{formatName(data?.clientFirstName)}</p>

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
              <p>
                🔑 To grab key for room <strong>{data?.roomNo ?? "-"}</strong>
              </p>
              <p>
                🖥️ Platform: <strong>{data?.platform ?? "-"}</strong>
              </p>
            </div>

            {/* Info */}
            <p className="text-sm text-white/85">
              💡 You’re about to pick up your key. It’s quick and straightforward.
            </p>
            <p className="text-sm text-white/85">⚡ The process usually takes under a minute.</p>

            {/* Start Button */}
            <button
              onClick={() => setStep("confirm")}
              className="mt-4 w-full bg-white text-blue-900 font-semibold py-2 rounded-lg hover:bg-blue-100 transition"
            >
              ✅ I’m at the machine — Start
            </button>

            {/* Note */}
            <p className="text-xs text-white/60">🕒 Not at the machine? Open this link again when you arrive.</p>
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
            onChange={(e) => {
              setLastName(e.target.value);
              setError("");
            }}
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
              onClick={() => setShowHint((v) => !v)}
              className="text-sm underline text-blue-200 hover:text-white"
            >
              {showHint ? "Hide hint" : "How to get it"}
            </button>
          </div>
          {showHint && (
            <div className="mt-2 flex justify-center">
              <Image
                src="/MachineID.jpg"
                alt="Where to find the Machine ID label on your device"
                width={484}
                height={788}
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
            <div ref={keypadRef} className="bg-white bg-opacity-20 backdrop-blur-lg p-3 rounded-2xl shadow-xl mt-3">
              <div className="grid grid-cols-3 gap-y-3 gap-x-3 justify-items-center">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "0", "B", "C", "D", "⌫"].map((btn, idx) => (
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

          <button
            type="button"
            onClick={handleVerify}
            disabled={!answersComplete || checking}
            className="mt-4 w-full bg-white text-blue-900 font-semibold py-2 rounded-lg hover:bg-blue-100 transition disabled:opacity-50"
          >
            {checking ? "Checking..." : "Continue"}
          </button>

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
            className="bg-white hover:bg-blue-100 text-blue-900 font-bold py-2 px-4 rounded-lg w-full transition transform active:scale-95 disabled:opacity-50"
          >
            {apiLoading ? "Opening..." : "Open Machine Door"}
          </button>
          {apiError && <p className="text-red-300 mt-2">{apiError}</p>}
          {apiError && apiDetail && <p className="text-white/50 text-xs mt-1">Code: {apiDetail}</p>}
        </div>
      )}

      {step === "releaseKey" && (
        <div className="mt-5 text-center w-full max-w-xs">
          <button
            onClick={handleReleaseKey}
            disabled={apiLoading}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg w-full transition transform active:scale-95 disabled:opacity-50"
          >
            {apiLoading
              ? "Releasing... please pull the key now"
              : keyReleased
                ? "✅ I took my key — check again"
                : "🔑 Release Key"}
          </button>
          {apiError && <p className="text-red-300 mt-2">{apiError}</p>}
          {apiError && apiDetail && <p className="text-white/50 text-xs mt-1">Code: {apiDetail}</p>}
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

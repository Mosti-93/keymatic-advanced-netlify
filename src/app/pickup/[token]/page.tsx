"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface PickupData {
  location: string;
  machineName: string;
  machineId: string;
  roomNo: string;
  clientLastName: string;
  clientFirstName: string;
}

// Helper to format the name safely
function formatName(name?: string) {
  return name ? name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() : "";
}

export default function Page({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [data, setData] = useState<PickupData | null>(null);
  const [step, setStep] = useState<
    "confirm" | "openDoor" | "releaseKey" | "closeDoor" | "success"
  >("confirm");
  const [lastName, setLastName] = useState("");
  const [machineId, setMachineId] = useState(["", "", ""]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [error, setError] = useState("");

  const pinRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const pageRef = useRef<HTMLDivElement>(null);
  const keypadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setData({
      location: "Main Lobby",
      machineName: "Machine A",
      machineId: "111",
      roomNo: "101",
      clientLastName: "samahy",
      clientFirstName: "mostafa",
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideMachineId = pinRefs.some((ref) =>
        ref.current?.contains(target)
      );
      const clickedInsideKeypad = keypadRef.current?.contains(target);
      if (!clickedInsideMachineId && !clickedInsideKeypad) {
        setShowKeypad(false);
        setFocusedIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (focusedIndex !== null) {
      pinRefs[focusedIndex]?.current?.focus();
      keypadRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [focusedIndex]);

  useEffect(() => {
    if (
      data &&
      lastName.trim() !== "" &&
      machineId.every((char) => char.trim() !== "")
    ) {
      handleConfirm();
    }
  }, [lastName, machineId, data]);

  useEffect(() => {
    if (step === "closeDoor") {
      const timer = setTimeout(() => {
        setStep("success");
      }, 5000); // wait 5 seconds to simulate door closed
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handleKeypadClick = (value: string) => {
    if (value === "⌫") {
      handleBackspace();
    } else {
      if (focusedIndex !== null && focusedIndex < 3) {
        const newMachineId = [...machineId];
        newMachineId[focusedIndex] = value;
        setMachineId(newMachineId);

        keypadRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        if (focusedIndex < 2) {
          setFocusedIndex(focusedIndex + 1);
        } else {
          setFocusedIndex(null);
          setShowKeypad(false);
        }
      }
    }
  };

  const handleBackspace = () => {
    if (focusedIndex !== null && focusedIndex >= 0) {
      const newMachineId = [...machineId];
      if (newMachineId[focusedIndex]) {
        newMachineId[focusedIndex] = "";
      } else if (focusedIndex > 0) {
        setFocusedIndex(focusedIndex - 1);
        pinRefs[focusedIndex - 1].current?.focus();
        newMachineId[focusedIndex - 1] = "";
      }
      setMachineId(newMachineId);
      setShowKeypad(true);
      keypadRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  };

  const handleConfirm = () => {
    const enteredMachineId = machineId.join("").toUpperCase().trim();
    const apiMachineId = data?.machineId?.toUpperCase().trim();
    const enteredLastName = lastName.trim().toLowerCase();
    const apiLastName = data?.clientLastName?.toLowerCase().trim();

    if (enteredLastName === apiLastName && enteredMachineId === apiMachineId) {
      setError("");
      setStep("openDoor");
    } else {
      setError("❌ Incorrect Last Name or Machine ID.");
    }
  };

  const handleOpenDoor = () => {
    setStep("releaseKey");
  };

  const handleReleaseKey = () => {
    setStep("closeDoor");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-800 to-indigo-900 text-white">
        <p className="text-lg animate-pulse">Loading...</p>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-red-700 to-red-900 text-white p-6">
        <h1 className="text-5xl font-bold mb-4">⚠️ Expired</h1>
        <p className="text-lg text-center">This link is no longer valid.</p>
      </div>
    );
  }

  const keypadButtons = [
    "1", "2", "3",
    "4", "5", "6",
    "7", "8", "9",
    "A", "0", "B",
    "C", "D", "⌫",
  ];

  return (
    <div
      ref={pageRef}
      className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-700 to-purple-800 text-white px-4 py-8 relative"
    >
      <div className="text-center mb-12">
        <h2 className="text-2xl mb-1">
          👋 Welcome {formatName(data?.clientFirstName)}
        </h2>
        <p className="text-lg mb-1">to</p>
        <h1 className="text-4xl font-extrabold tracking-tight mb-8">
          🔑 KEYMATIC PICKUP
        </h1>
      </div>

      <div className="text-center mb-6">
        <p className="mb-1">
          Picking key No{" "}
          <span className="font-semibold">"{data?.roomNo}"</span>
        </p>
        <p>
          From <span className="font-semibold">{data?.machineName}</span> /{" "}
          {data?.location}
        </p>
      </div>

      {step === "confirm" && (
        <div className="w-full max-w-xs text-center">
          <p className="mb-2 text-lg font-medium">
            Please confirm your last name
          </p>
          <input
            type="text"
            placeholder="Enter your last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="p-2 border border-gray-300 rounded-lg w-full mb-3 text-white placeholder-gray-500 text-center focus:outline-none focus:ring-3 focus:ring-white focus:border-blue-900"
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
                className={`w-20 h-20 text-center text-black rounded-lg text-xl placeholder-gray-400 bg-white transition focus:outline-none focus:ring-3 focus:ring-white focus:border-white
                  ${
                    focusedIndex === idx
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
                {keypadButtons.map((btn, idx) => (
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
          {error && <p className="text-red-400 mt-2">{error}</p>}
        </div>
      )}

      {step === "openDoor" && (
        <div className="mt-5 text-center">
          <button
            onClick={handleOpenDoor}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg w-full transition transform active:scale-95"
          >
            Open Machine Door
          </button>
        </div>
      )}

      {step === "releaseKey" && (
        <div className="mt-5 text-center">
          <p className="text-xl mb-3 text-green-400">Door Status: Open</p>
          <button
            onClick={handleReleaseKey}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg w-full transition transform active:scale-95"
          >
            Release Key
          </button>
        </div>
      )}

      {step === "closeDoor" && (
        <div className="mt-5 text-center">
          <p className="text-xl mb-3 text-blue-300">
            ✅ Key Released Successfully
          </p>
          <p className="text-lg">Please close the door to finish.</p>
          <p className="mt-3 text-sm text-gray-300 animate-pulse">
            Waiting for door to close...
          </p>
        </div>
      )}

      {step === "success" && (
        <div className="mt-6 text-center">
          <h2 className="text-2xl font-bold mb-3 text-green-400">
            🎉 Thank you!
          </h2>
          <p className="text-lg">Process Complete. Have a nice day!</p>
        </div>
      )}
    </div>
  );
}

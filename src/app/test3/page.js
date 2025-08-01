'use client'
import React, { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = 'https://vnnqjmsshzbmngnlyvzq.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubnFqbXNzaHpibW5nbmx5dnpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMzE2ODksImV4cCI6MjA2NjgwNzY4OX0.ATv6RVLhr5Oi3lJ74fMe4WJrUdm-d2gjuID7VDGtAec';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const cloudBase = 'https://shuttle-uncertainty-sites-meat.trycloudflare.com';
const hmacKey = "mysupersecretkey";

function encodeBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

export default function KeymaticRequestPage() {
  const [keys, setKeys] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [slotNumber, setSlotNumber] = useState('');
  const [requests, setRequests] = useState([]);
  const [responses, setResponses] = useState([null, null, null, null]);
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);

  React.useEffect(() => {
    // Fetch all keys
    supabase
      .from("keys")
      .select("*")
      .then(({ data }) => {
        if (data) setKeys(data);
      });
  }, []);

  // Helper: HMAC SHA256 in browser
  async function hmacSHA256(message, secret) {
    const encoder = new TextEncoder();
    const key = await window.crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await window.crypto.subtle.sign("HMAC", key, encoder.encode(message));
    return encodeBase64(new Uint8Array(sig));
  }

  async function createRequests() {
    if (!selectedRoom) {
      setStatus("❌ Select a room number.");
      return;
    }
    setCreating(true);
    setResponses([null, null, null, null]);
    setStatus('⏳ Generating requests...');
    setRequests([]);
    setSlotNumber('');
    setSelectedKey(null);

    // 1. Find the key for the selected room number
    const key = keys.find(k =>
      String(k.room_number || k.room_no) === String(selectedRoom)
    );
    if (!key) {
      setStatus("❌ No key found for this room number.");
      setCreating(false);
      return;
    }
    setSelectedKey(key);

    // 2. Look up slot_number from key_slot_presence (using UID as FK)
    const { data: slotPresence, error } = await supabase
      .from('key_slot_presence')
      .select('slot_number')
      .eq('UID', key.UID) // <<--- FIXED: use correct column name and case!
      .maybeSingle();

    const slot = slotPresence ? slotPresence.slot_number : null;
    setSlotNumber(slot);

    if (!slot) {
      setStatus("❌ This key is not assigned to any slot.");
      setCreating(false);
      return;
    }

    // 3. Get current timestamp from the cloud
    let ts = 0;
    try {
      const res = await fetch(`${cloudBase}/time`);
      if (!res.ok) throw new Error('Cloud time server error');
      const data = await res.json();
      ts = data.ts;
    } catch (e) {
      setStatus("❌ Failed to fetch time from Cloud URL.");
      setCreating(false);
      return;
    }

    // 4. Command patterns
    const cmds = [
      `PI:RELAY:ON|ts=${ts}`,        // Door open
      `PI:LIMIT:?|ts=${ts}`,        // Door status
      `ESP:RELAY${slot}:ON|ts=${ts}`, // Key release
      `ESP:LIMIT${slot}:?|ts=${ts}`   // Key status
    ];

    // 5. Generate signatures for each
    const reqs = [];
    for (let i = 0; i < 4; ++i) {
      // eslint-disable-next-line no-await-in-loop
      const sig = await hmacSHA256(cmds[i], hmacKey);
      const url = `${cloudBase}/action?cmd=${encodeURIComponent(cmds[i])}&sig=${encodeURIComponent(sig)}`;
      reqs.push({ cmd: cmds[i], sig, url });
    }
    setRequests(reqs);
    setStatus('✅ Requests generated!');
    setCreating(false);
  }

  async function sendRequest(idx) {
    setStatus(`⏳ Sending request ${idx + 1}...`);
    try {
      const res = await fetch(requests[idx].url, { method: 'GET' });
      const data = await res.json();
      setResponses(arr => {
        const updated = [...arr];
        updated[idx] = data;
        return updated;
      });
      setStatus(`✅ Response received for request ${idx + 1}`);
    } catch (e) {
      setStatus(`❌ Request failed: ${e.message}`);
    }
  }

  return (
    <div style={{
      fontFamily: 'sans-serif',
      background: "#111",
      minHeight: "100vh",
      padding: 32,
      color: "#fff",
      maxWidth: 650,
      margin: "0 auto"
    }}>
      <h2>Keymatic 4-Request Tester</h2>

      {/* Dropdown for room */}
      <div style={{ margin: "14px 0 18px 0" }}>
        <b>Room Number: </b>
        <select
          value={selectedRoom}
          style={{ fontSize: 18, padding: 6, marginLeft: 8 }}
          onChange={e => {
            setSelectedRoom(e.target.value);
            setRequests([]);
            setResponses([null, null, null, null]);
            setStatus("");
            setSelectedKey(null);
            setSlotNumber('');
          }}
        >
          <option value="">-- Select Room --</option>
          {[...new Set(keys.map(k => k.room_number || k.room_no).filter(Boolean))].map(room =>
            <option value={room} key={room}>{room}</option>
          )}
        </select>
      </div>

      <button
        onClick={createRequests}
        style={{
          background: "#1e6fd9", color: "#fff", fontWeight: "bold",
          padding: "10px 22px", fontSize: 18, border: "none", borderRadius: 7, marginBottom: 18, marginTop: 5,
          cursor: creating ? "not-allowed" : "pointer", opacity: creating ? 0.7 : 1
        }}
        disabled={creating || !selectedRoom}
      >
        ➕ Create 4 req
      </button>

      {(selectedKey && slotNumber) && (
        <div style={{ marginTop: 8, fontSize: 15, marginBottom: 14 }}>
          <b>Key UID:</b> {selectedKey.UID} &nbsp; <b>Slot:</b> {slotNumber}
        </div>
      )}

      {requests.length === 4 && (
        <div style={{ marginTop: 14 }}>
          {["Door Open", "Door Status", "Key Release", "Key Status"].map((label, i) => (
            <div key={i} style={{ marginBottom: 22, background: "#181f2a", borderRadius: 6, padding: 12 }}>
              <button
                onClick={() => sendRequest(i)}
                style={{
                  background: "#14903c", color: "#fff", fontWeight: "bold",
                  padding: "7px 22px", fontSize: 16, border: "none", borderRadius: 7, marginBottom: 6,
                  cursor: "pointer"
                }}
              >
                {label}
              </button>
              <div style={{ marginTop: 6, fontSize: 15 }}>
                <b>CMD:</b> {requests[i].cmd}
                <br />
                <b>SIG:</b> {requests[i].sig}
                <br />
                <b>URL:</b> <span style={{ wordBreak: "break-all" }}>{requests[i].url}</span>
              </div>
              {responses[i] && (
                <pre style={{
                  background: "#222", color: "#fff",
                  padding: 9, borderRadius: 4, marginTop: 8, fontSize: 14
                }}>{JSON.stringify(responses[i], null, 2)}</pre>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ margin: "16px 0 0 0", fontWeight: "bold", color: status.startsWith("❌") ? "#f55" : "#0f7" }}>
        {status}
      </div>
    </div>
  );
}

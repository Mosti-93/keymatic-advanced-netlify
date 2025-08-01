'use client'
import React, { useState } from "react";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vnnqjmsshzbmngnlyvzq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubnFqbXNzaHpibW5nbmx5dnpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMzE2ODksImV4cCI6MjA2NjgwNzY4OX0.ATv6RVLhr5Oi3lJ74fMe4WJrUdm-d2gjuID7VDGtAec';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const cloudBase = 'https://shuttle-uncertainty-sites-meat.trycloudflare.com';
const hmacKey = "mysupersecretkey";

export default function TestPage() {
  const [status, setStatus] = useState('');
  const [lastScan, setLastScan] = useState([]);
  const [keys, setKeys] = useState([]);
  const [espResult, setEspResult] = useState('');
  const [pickupUrl, setPickupUrl] = useState('');
  const [cmdPreview, setCmdPreview] = useState('');
  const [sigPreview, setSigPreview] = useState('');
  const [timePreview, setTimePreview] = useState('');
  const [selectedUID, setSelectedUID] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotPresence, setSlotPresence] = useState([]);

  const tableCellStyle = { color: "#fff", fontWeight: "bold" };
  const headerStyle = { background: "#fff", fontWeight: "bold", color: "black", fontSize: 17 };

  // Updated parser: captures UID or "NONE"
  function parseEspResponse(espResult) {
    try {
      const json = JSON.parse(espResult);
      if (!json.esp_response) return null;
      // Accepts anything after the colon, so "NONE" or real UID
      const match = json.esp_response.match(/UID(\d+):(.*)/);
      if (match) {
        return { slot: match[1], uid: match[2] };
      }
    } catch (e) {}
    return null;
  }

  async function fetchKeys() {
    const { data, error } = await supabase
      .from('keys')
      .select('*')
      .order('slot_number', { ascending: true });
    if (!error) setKeys(data || []);
  }

  async function fetchKeySlotPresence() {
    const { data, error } = await supabase
      .from('key_slot_presence')
      .select('*')
      .order('slot_number', { ascending: true }); // use your real column name
    if (!error) setSlotPresence(data || []);
  }

  // Main function: handles both assign and release logic
  async function updateKeySlotPresence(slot, uid) {
    setStatus(`⌛ Updating UID in key_slot_presence (slot ${slot})...`);
    // 1. If we're assigning a real UID, release it from any other slot first
    if (uid && uid !== 'NONE') {
      await supabase.from('key_slot_presence').update({ UID: null }).eq('UID', uid);
    }
    // 2. Set UID (null for empty/NONE, or value for present key)
    const newUid = (!uid || uid === 'NONE') ? null : uid;
    const { error } = await supabase
      .from('key_slot_presence')
      .update({ UID: newUid })
      .eq('slot_number', slot);
    if (error) {
      setStatus(`❌ Failed to update UID in key_slot_presence: ${error.message}`);
      return false;
    } else {
      setStatus(`✅ UID updated in key_slot_presence (slot ${slot} → ${newUid === null ? 'Empty' : newUid})`);
      await fetchKeySlotPresence();
      return true;
    }
  }

  async function updateKeyLocation() {
    setStatus('⌛ Scanning all slots for keys...');
    try {
      const res = await fetch('/api/scan_all_slots');
      if (!res.ok) throw new Error('No response from scanner backend');
      const data = await res.json();
      setLastScan(data);

      for (const { slot_number, uid } of data) {
        if (uid) {
          await supabase.from('keys').upsert({
            slot_number,
            UID: uid,
            isPresent: true,
            lastUpdate: new Date().toISOString()
          }, { onConflict: ['slot_number'] });
        } else {
          await supabase.from('keys').update({
            isPresent: false,
            UID: null,
            lastUpdate: new Date().toISOString()
          }).eq('slot_number', slot_number);
        }
      }
      setStatus('✅ Key locations updated successfully!');
      await fetchKeys();
    } catch (err) {
      setStatus('❌ Failed to update key locations: ' + err.message);
    }
  }

  async function sendEspSlotUIDPickup(slotId) {
    setSelectedSlot(slotId);
    setPickupUrl('');
    setCmdPreview('');
    setSigPreview('');
    setTimePreview('');
    setEspResult('');
    setStatus('⌛ Fetching time from Cloud...');
    let ts = 0;
    try {
      const res = await fetch(cloudBase + '/time');
      if (!res.ok) throw new Error('Cloud time server error');
      const data = await res.json();
      ts = data.ts;
      setTimePreview(ts);
      setStatus(`✅ Time from Cloud: ${ts}`);
    } catch (e) {
      setStatus("❌ Failed to fetch time from Cloud URL.");
      return;
    }

    const device = 'ESP';
    const cmdType = 'UID';
    const action = '?';
    const fullCmd = `${device}:${cmdType}${slotId}:${action}|ts=${ts}`;
    setCmdPreview(fullCmd);

    const encoder = new TextEncoder();
    const keyData = encoder.encode(hmacKey);
    const msgData = encoder.encode(fullCmd);

    let sigBase64 = '';
    try {
      const cryptoKey = await window.crypto.subtle.importKey(
        "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sigBuffer = await window.crypto.subtle.sign("HMAC", cryptoKey, msgData);
      sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
      setSigPreview(sigBase64);
    } catch (err) {
      setStatus("❌ Failed to compute HMAC signature: " + err.message);
      return;
    }

    const encodedCMD = encodeURIComponent(fullCmd);
    const encodedSIG = encodeURIComponent(sigBase64);
    const url = `${cloudBase}/action?cmd=${encodedCMD}&sig=${encodedSIG}`;
    setPickupUrl(url);
    setStatus("⌛ Sending request to machine...");

    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) throw new Error("No response from ESP/Cloud API.");
      const json = await response.json();

      setEspResult(JSON.stringify(json, null, 2));
      const parsed = json && json.esp_response ? parseEspResponse(JSON.stringify(json)) : null;
      if (parsed && typeof parsed.uid !== "undefined") {
        if (!parsed.uid || parsed.uid === 'NONE') {
          setStatus(`Slot ${parsed.slot} is empty. Setting UID to null.`);
          await updateKeySlotPresence(parsed.slot, null);
        } else {
          setStatus(`✅ UID received from machine: ${parsed.uid} (slot ${parsed.slot})`);
          await updateKeySlotPresence(parsed.slot, parsed.uid);
        }
      } else {
        setStatus("❌ No UID received from machine for this slot.");
      }
    } catch (err) {
      setStatus("❌ Failed to get UID from machine: " + err.message);
      setEspResult('');
    }
  }

  React.useEffect(() => {
    fetchKeys();
    fetchKeySlotPresence();
  }, []);

  function copyText(val) {
    navigator.clipboard.writeText(val);
    setStatus("Copied!");
    setTimeout(() => setStatus(""), 600);
  }

  function dbUIDforSlot(slotId) {
    const found = keys.find(k => String(k.slot_number) === String(slotId));
    return found && found.UID
      ? <span>{found.UID}{found.room_no ? ` | Room: ${found.room_no}` : ""}</span>
      : <span style={{color:'#aaa'}}>Empty</span>;
  }

  function showSlotUIDFromMachine() {
    if (!espResult) return null;
    const parsed = parseEspResponse(espResult);
    if (parsed && typeof parsed.uid !== "undefined") {
      if (!parsed.uid || parsed.uid === "NONE") {
        return (
          <div style={{ color: "#e57373", marginTop: 10 }}>
            <b>No key detected in slot {parsed.slot} (live)</b>
          </div>
        );
      }
      const dbSlot = keys.find(
        k =>
          String(k.UID || '').trim().toLowerCase() === String(parsed.uid || '').trim().toLowerCase()
      );
      return (
        <div style={{ color: "#7dfb7d", marginTop: 10 }}>
          <b>
            Live: Key UID <span style={{ color: '#ff9' }}>{parsed.uid}</span>
            {" | Room: "}
            {dbSlot && dbSlot.room_number ? dbSlot.room_number : <span style={{ color: "#e57373" }}>Unknown</span>}
            {" detected in slot " + parsed.slot}
            {dbSlot ? ` (matches DB slot ${dbSlot.slot_number})` : " (not found in DB)"}
          </b>
        </div>
      );
    }
    return null;
  }

  return (
    <div style={{
      fontFamily: 'sans-serif',
      padding: 24,
      maxWidth: 900,
      margin: "auto",
      background: "#111",
      minHeight: "100vh"
    }}>
      <h2 style={{ color: "#fff" }}>Keymatic Test Page</h2>

      {/* Dropdown at the top */}
      <div style={{ margin: "0 0 24px 0", color: "#fff" }}>
        <label htmlFor="uid-dropdown"><b>Select key UID:</b></label>
        <select
          id="uid-dropdown"
          value={selectedUID}
          style={{ fontSize: 16, marginLeft: 8, padding: 4 }}
          onChange={e => setSelectedUID(e.target.value)}
        >
          <option value="">-- Select UID --</option>
          {[...new Set(keys.map(k => k.UID).filter(Boolean))].map(uid => {
            const key = keys.find(k => k.UID === uid);
            return (
              <option value={uid} key={uid}>
                {uid}{key && key.room_no ? ` | Room: ${key.room_no}` : ""}
              </option>
            );
          })}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 42, marginBottom: 28 }}>
        {[1,2,3].map(slotId => (
          <div key={slotId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              style={{
                background: "#14903c",
                color: "white",
                padding: "10px 20px",
                fontWeight: "bold",
                fontSize: 17,
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                marginBottom: 8
              }}
              onClick={() => sendEspSlotUIDPickup(slotId)}
            >
              🚀 UID Pickup (Slot {slotId})
            </button>
            <div style={{ color: "#fff", fontSize: 15 }}>
              <b>DB UID:</b> {dbUIDforSlot(slotId)}
            </div>
          </div>
        ))}
        <button
          style={{
            background: "#1e6fd9",
            color: "white",
            padding: "10px 20px",
            fontWeight: "bold",
            fontSize: 17,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            height: 56, alignSelf: "center"
          }}
          onClick={updateKeyLocation}
        >
          🔄 Update Key Location
        </button>
      </div>

      <p style={{ color: status.startsWith('❌') ? "red" : "lime", fontWeight: "bold" }}>{status}</p>

      {pickupUrl && (
        <div style={{ background: "#181f2a", color: "#fff", borderRadius: 6, padding: 12, marginBottom: 20 }}>
          <div><b>Pickup Request URL:</b>
            <button style={{ marginLeft: 8 }} onClick={() => copyText(pickupUrl)}>Copy</button>
            <pre style={{ color: "#fff", wordBreak: "break-all", fontSize: 15 }}>{pickupUrl}</pre>
          </div>
          <div><b>cmd param:</b>
            <button style={{ marginLeft: 8 }} onClick={() => copyText(cmdPreview)}>Copy</button>
            <pre style={{ color: "#fff", fontSize: 15 }}>{cmdPreview}</pre>
          </div>
          <div><b>sig param:</b>
            <button style={{ marginLeft: 8 }} onClick={() => copyText(sigPreview)}>Copy</button>
            <pre style={{ color: "#fff", fontSize: 15 }}>{sigPreview}</pre>
          </div>
          <div><b>Cloud Timestamp:</b> {timePreview}</div>
          {showSlotUIDFromMachine()}
        </div>
      )}

      {espResult && (
        <div style={{
          background: "#222",
          borderRadius: 6,
          padding: 12,
          marginBottom: 20,
          whiteSpace: 'pre',
          fontFamily: 'monospace',
          color: "#fff"
        }}>
          <b>Machine Response:</b>
          <pre style={{ color: "#fff" }}>{espResult}</pre>
        </div>
      )}

      <h3 style={{ marginTop: 24, color: "#fff" }}>Current Keys Table</h3>
      <table border={1} cellPadding={6} style={{ borderCollapse: "collapse", width: "100%", fontSize: 16 }}>
        <thead>
          <tr>
            <th style={headerStyle}>Slot No</th>
            <th style={headerStyle}>UID</th>
            <th style={headerStyle}>Room No</th>
            <th style={headerStyle}>isPresent</th>
            <th style={headerStyle}>lastUpdate</th>
          </tr>
        </thead>
        <tbody>
          {keys.map(k => (
            <tr key={k.id || k.slot_number} style={{ background: "#222" }}>
              <td style={tableCellStyle}>{k.slot_number}</td>
              <td style={tableCellStyle}>{k.UID || "Empty"}</td>
              <td style={tableCellStyle}>{k.room_no || ""}</td>
              <td style={{
                ...tableCellStyle,
                color: k.isPresent ? "#3ec774" : "#e57373"
              }}>
                {k.isPresent ? "Yes" : "No"}
              </td>
              <td style={tableCellStyle}>{k.lastUpdate ? new Date(k.lastUpdate).toLocaleString() : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Slot Presence Table */}
      <h3 style={{ marginTop: 24, color: "#fff" }}>Slot Presence Table</h3>
      <table border={1} cellPadding={6} style={{ borderCollapse: "collapse", width: "100%", fontSize: 16 }}>
        <thead>
          <tr>
            <th style={headerStyle}>Slot No</th>
            <th style={headerStyle}>UID</th>
          </tr>
        </thead>
        <tbody>
          {slotPresence.map((s) => (
            <tr key={s.slot_number} style={{ background: "#222" }}>
              <td style={tableCellStyle}>{s.slot_number}</td>
              <td style={tableCellStyle}>{s.UID || "Empty"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {lastScan.length > 0 && (
        <>
          <h3 style={{ marginTop: 36, color: "#fff" }}>Last Scan Results</h3>
          <table border={1} cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={headerStyle}>Slot No</th>
                <th style={headerStyle}>UID</th>
              </tr>
            </thead>
            <tbody>
              {lastScan.map(({ slot_number, uid }) => (
                <tr key={slot_number} style={{ background: "#222" }}>
                  <td style={tableCellStyle}>{slot_number}</td>
                  <td style={tableCellStyle}>{uid || "Empty"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

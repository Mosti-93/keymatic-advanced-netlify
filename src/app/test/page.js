'use client'
import React, { useState } from "react";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vnnqjmsshzbmngnlyvzq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubnFqbXNzaHpibW5nbmx5dnpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMzE2ODksImV4cCI6MjA2NjgwNzY4OX0.ATv6RVLhr5Oi3lJ74fMe4WJrUdm-d2gjuID7VDGtAec';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function RelayLinkTool() {
  const [cloudBase, setCloudBase] = useState('');
  const [device, setDevice] = useState('');
  const [cmdType, setCmdType] = useState('');
  const [id, setId] = useState('');
  const [action, setAction] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [link, setLink] = useState('');
  const [status, setStatus] = useState('');
  const [response, setResponse] = useState(null);
  const [endPickup, setEndPickup] = useState(false);

  async function fetchConfigFromDb() {
    setStatus('⌛ Fetching config from DB...');
    const { data, error } = await supabase
      .from('relay_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error || !data || !data[0]) {
      setStatus('❌ Failed to fetch config from DB!');
      return false;
    }

    const config = data[0];
    setCloudBase(config.cloud_url || '');
    setDevice(config.device_type || '');
    setCmdType(config.cmd_type || '');
    setAction(config.action || '');
    setSecretKey(config.secret_key || '');
    setId(config.slot_no || '');
    setEndPickup(config.end_pickup === true);
    setStatus('✅ Config loaded from DB');
    return config;
  }

  async function saveLinkToDb() {
    setStatus('⌛ Fetching config & generating link...');
    setResponse(null);

    const config = await fetchConfigFromDb();
    if (!config) return;

    let base = config.cloud_url?.trim().replace(/\/$/, '') || '';
    if (!base.startsWith('http')) {
      setStatus('❌ Please enter valid Cloud URL (start with https://)');
      return;
    }
    if (!config.secret_key) {
      setStatus('❌ Please enter a secret key');
      return;
    }

    let ts = Math.floor(Date.now() / 1000);
    let baseCmd = "";
    if (config.device_type === "PI") {
      baseCmd = `${config.device_type}:${config.cmd_type}:${config.action}`;
    } else {
      if (!config.slot_no) {
        setStatus('❌ Please enter slot_no in DB for ESP command.');
        return;
      }
      baseCmd = `${config.device_type}:${config.cmd_type}${config.slot_no}:${config.action}`;
    }
    const full_cmd = `${baseCmd}|ts=${ts}`;

    // HMAC SHA256 sign
    const encoder = new TextEncoder();
    const keyData = encoder.encode(config.secret_key);
    const msgData = encoder.encode(full_cmd);
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sigBuffer = await window.crypto.subtle.sign("HMAC", cryptoKey, msgData);
    const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

    const encodedCMD = encodeURIComponent(full_cmd);
    const encodedSIG = encodeURIComponent(sigBase64);

    const relay_url = `${base}/action?cmd=${encodedCMD}&sig=${encodedSIG}`;
    setLink(relay_url);

    try {
      const { error } = await supabase.from('relay_links').insert([{ url: relay_url }]);
      if (error) throw error;
      setStatus('✅ Link saved to DB!');
    } catch (err) {
      setStatus('❌ Failed to save to DB: ' + err.message);
    }
  }

  // --- Only block trigger if end_pickup is true ---
  async function triggerLinkFromDb() {
    setStatus('⌛ Fetching config and last link from DB...');
    setResponse(null);

    // Fetch config for end_pickup
    const { data: configData, error: configErr } = await supabase
      .from('relay_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1);

    const config = configData && configData[0];
    if (configErr || !config) {
      setStatus('❌ Failed to fetch config from DB!');
      return;
    }

    // Block if end_pickup is true!
    if (config.end_pickup === true) {
      setStatus('❌ The key was already picked up before.');
      return;
    }

    // Fetch latest link
    const { data, error } = await supabase
      .from('relay_links')
      .select('url')
      .order('time', { ascending: false })
      .limit(1);

    if (error || !data || !data[0] || !data[0].url) {
      setStatus('❌ No link found in DB!');
      return;
    }

    const relay_url = data[0].url;
    setLink(relay_url);
    setStatus('⌛ Sending GET request to saved link...');

    try {
      const res = await fetch(relay_url, { method: 'GET' });
      const text = await res.text();
      setResponse(text);
      setStatus(res.ok ? '✅ Triggered link! Response: ' + text : '❌ Request failed! Response: ' + text);
    } catch (err) {
      setStatus('❌ Failed to send request: ' + err.message);
      setResponse(null);
    }
  }

  function copy(val) {
    navigator.clipboard.writeText(val);
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 20, maxWidth: 800, margin: "auto" }}>
      <h2>Relay Link Tool (Supabase)</h2>
      <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        <button
          style={{
            background: "#1e6fd9",
            color: "white",
            padding: "10px 20px",
            fontWeight: "bold",
            fontSize: 17,
            border: "none",
            borderRadius: 6,
            cursor: "pointer"
          }}
          onClick={saveLinkToDb}
        >
          💾 Save Link to DB (from config)
        </button>
        <button
          style={{
            background: "#17a01f",
            color: "white",
            padding: "10px 20px",
            fontWeight: "bold",
            fontSize: 17,
            border: "none",
            borderRadius: 6,
            cursor: "pointer"
          }}
          onClick={triggerLinkFromDb}
        >
          ⚡ Trigger from DB
        </button>
      </div>
      <label style={{ display: 'block', marginTop: 15, fontWeight: 'bold' }}>Cloud URL (from DB):</label>
      <input type="text" value={cloudBase} readOnly style={{ width: '100%', padding: 8, marginTop: 5, background: "#f5f5f5" }} />
      <label style={{ display: 'block', marginTop: 15, fontWeight: 'bold' }}>Device Type (from DB):</label>
      <input type="text" value={device} readOnly style={{ width: '100%', padding: 8, marginTop: 5, background: "#f5f5f5" }} />
      <label style={{ display: 'block', marginTop: 15, fontWeight: 'bold' }}>Command Type (from DB):</label>
      <input type="text" value={cmdType} readOnly style={{ width: '100%', padding: 8, marginTop: 5, background: "#f5f5f5" }} />
      {device === "ESP" && (
        <div>
          <label style={{ display: 'block', marginTop: 15, fontWeight: 'bold' }}>ID / Slot No (from DB):</label>
          <input type="text" value={id} readOnly style={{ width: '100%', padding: 8, marginTop: 5, background: "#f5f5f5" }} />
        </div>
      )}
      <label style={{ display: 'block', marginTop: 15, fontWeight: 'bold' }}>Action (from DB):</label>
      <input type="text" value={action} readOnly style={{ width: '100%', padding: 8, marginTop: 5, background: "#f5f5f5" }} />
      <label style={{ display: 'block', marginTop: 15, fontWeight: 'bold' }}>Secret Key (from DB):</label>
      <input type="text" value={secretKey} readOnly style={{ width: '100%', padding: 8, marginTop: 5, background: "#f5f5f5" }} />
      <label style={{ display: 'block', marginTop: 15, fontWeight: 'bold', color: endPickup ? 'red' : 'inherit' }}>
        End Pickup (from DB):</label>
      <input type="text" value={endPickup ? "true" : "false"} readOnly style={{ width: '100%', padding: 8, marginTop: 5, background: "#f5f5f5", color: endPickup ? "red" : "black" }} />
      <label style={{ display: 'block', marginTop: 15, fontWeight: 'bold' }}>Saved/Triggered Link:</label>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 5, gap: 8 }}>
        <input type="text" value={link} readOnly style={{ width: '100%', padding: 8 }} />
        <button onClick={() => copy(link)}>📋 Copy</button>
      </div>
      <p style={{ color: status.includes('❌') ? 'red' : 'green', fontWeight: 'bold' }}>{status}</p>
      {response !== null &&
        <pre style={{
          background: '#f3f3f3',
          padding: 10,
          borderRadius: 4,
          marginTop: 10,
          fontSize: 14
        }}>
          {response}
        </pre>
      }
    </div>
  );
}

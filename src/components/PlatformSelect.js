"use client";
import { useState } from "react";

export const PLATFORMS = [
  "Airbnb",
  "Booking.com",
  "Vrbo",
  "Vacasa",
  "FlipKey",
  "Whimstay",
  "HomeExchange",
  "Hipcamp",
  "Misterb&b",
  "ThirdHome",
  "Fairbnb & similar",
];

const OTHER = "__other__";

/**
 * Booking platform picker: a dropdown of known platforms plus "Other…",
 * which reveals a text box. Calls onChange like a normal input
 * ({ target: { name, value } }) so it plugs into existing form handlers.
 */
export default function PlatformSelect({ id, name = "platform", value, onChange, required = true }) {
  const [pickedOther, setPickedOther] = useState(false);
  const isCustom = !!value && !PLATFORMS.includes(value);
  const showOther = pickedOther || isCustom;
  const emit = (v) => onChange({ target: { name, value: v } });

  return (
    <div className="space-y-2">
      <select
        id={id}
        value={showOther ? OTHER : value || ""}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setPickedOther(true);
            emit("");
          } else {
            setPickedOther(false);
            emit(e.target.value);
          }
        }}
        className="k-input"
        required={required && !showOther}
      >
        <option value="" disabled>
          Choose a platform
        </option>
        {PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {showOther && (
        <input
          aria-label="Other platform"
          value={value || ""}
          onChange={(e) => emit(e.target.value)}
          placeholder="Type the platform name"
          className="k-input"
          required={required}
          autoFocus={pickedOther}
        />
      )}
    </div>
  );
}

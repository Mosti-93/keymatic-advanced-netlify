// utils/getBookingStatus.js
import { DateTime } from "luxon";

// Detect the user's timezone in browser, fallback to UTC on server
export function getUserZone(defaultZone = "UTC") {
  if (typeof window !== "undefined" && typeof Intl !== "undefined") {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || defaultZone;
  }
  return defaultZone; // SSR or no Intl
}

/**
 * Returns: "Current" | "Coming" | "Past"
 * Reads DB timestamps as UTC and compares them in the user's local timezone.
 */
export function getBookingStatus(checkInISO, checkOutISO) {
  if (!checkInISO || !checkOutISO) return "Unknown";

  const zone = getUserZone("UTC");
  const checkIn = DateTime.fromISO(checkInISO, { zone: "utc" }).setZone(zone);
  const checkOut = DateTime.fromISO(checkOutISO, { zone: "utc" }).setZone(zone);
  const now = DateTime.now().setZone(zone);

  if (!checkIn.isValid || !checkOut.isValid) return "Unknown";
  if (now >= checkIn && now <= checkOut) return "Current";
  if (now < checkIn) return "Coming";
  return "Past";
}

/** Format a UTC timestamp for display in the user's local timezone */
export function toLocalParts(isoUtc) {
  if (!isoUtc) return { date: "", time: "", zone: getUserZone("UTC") };
  const zone = getUserZone("UTC");
  const dt = DateTime.fromISO(isoUtc, { zone: "utc" }).setZone(zone);
  if (!dt.isValid) return { date: "", time: "", zone };
  return {
    date: dt.toFormat("yyyy-LL-dd"),
    time: dt.toFormat("HH:mm"),
    zone,
  };
}

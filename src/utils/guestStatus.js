// Booking status from DB date strings, same rule the app always used:
// compares the YYYY-MM-DD part with today's date.
export function guestStatus(c) {
  const today = new Date().toISOString().split("T")[0];
  const ci = (c.check_in || "").slice(0, 10);
  const co = (c.check_out || "").slice(0, 10);
  if (ci && co && ci <= today && co >= today) return "current";
  if (ci && ci > today) return "upcoming";
  if (co && co < today) return "past";
  return "unknown";
}

export const GUEST_FILTERS = [
  { key: "current", label: "Staying now", test: (c) => guestStatus(c) === "current" },
  { key: "upcoming", label: "Upcoming", test: (c) => guestStatus(c) === "upcoming" },
  { key: "past", label: "Past", test: (c) => guestStatus(c) === "past" },
  { key: "all", label: "All", test: () => true },
];

export const STATUS_BADGE = {
  current: ["k-badge-green", "Staying"],
  upcoming: ["k-badge-blue", "Upcoming"],
  past: ["k-badge-gray", "Past"],
  unknown: ["k-badge-gray", "—"],
};

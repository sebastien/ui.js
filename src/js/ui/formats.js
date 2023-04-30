import { bool as _bool, type, len } from "./utils.js";

// --
// ## Formats
export const bool = _bool;
export const text = (_) => `${_}`;
export const attr = (_) => (bool(_) ? text(_) : "");
export const not = (_) => !bool(_);
export const idem = (_) => _;
export const ago = (date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  const absDiff = Math.abs(diffInSeconds);

  if (absDiff < 60) {
    return `${absDiff}s ${diffInSeconds > 0 ? "ago" : "ahead"}`;
  }

  const diffInMinutes = Math.floor(absDiff / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ${diffInSeconds > 0 ? "ago" : "ahead"}`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ${diffInSeconds > 0 ? "ago" : "ahead"}`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d ${diffInSeconds > 0 ? "ago" : "ahead"}`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks}w ${diffInSeconds > 0 ? "ago" : "ahead"}`;
  }

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const dateYear = date.getFullYear();
  const currentYear = now.getFullYear();
  const dateString = `On ${monthNames[date.getMonth()]}, ${date.getDate()}`;

  return dateYear === currentYear ? dateString : `${dateString}, ${dateYear}`;
};
export const format = (value, format) => (Formats[format] || idem)(value);
export const timetuple = (_) =>
  new Date(
    Date.UTC(
      _[0], // Year
      _[1] - 1, // Month (zero-based, so subtract 1)
      _[2], // Day
      _[3], // Hour
      _[4], // Minute
      _[5] // Second
    )
  );
export const debug = (value) => {
  console.log("[uijs.debug] Slot value:", { value });
  return value;
};
export const Formats = {
  bool,
  text,
  not,
  idem,
  type,
  attr,
  len,
  debug,
  ago,
  timetuple,
};
// EOF

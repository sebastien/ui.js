import { bool as _bool, type } from "./utils/values.js";
import { len } from "./utils/collections.js";

// --
// ## Formats
export const bool = _bool;
export const text = (_) => `${_}`;
export const count = (_) => {
	return `${_.length}`;
};
export const attr = (_) => (bool(_) ? text(_) : "");
export const not = (_) => !bool(_);
export const idem = (_) => _;
export const ago = (date) => {
	if (!(date && date instanceof Date)) {
		return null;
	}
	const now = new Date();
	const diffInSeconds = Math.floor((now - date) / 1000);
	const absDiff = Math.abs(diffInSeconds);

	if (absDiff < 1) {
		return "now";
	}

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
	_ && _ instanceof Array
		? new Date(
				Date.UTC(
					_[0], // Year
					_[1] - 1, // Month (zero-based, so subtract 1)
					_[2], // Day
					_[3], // Hour
					_[4], // Minute
					_[5] // Second
				)
		  )
		: _ instanceof Date
		? _
		: null;

const htmlParser = new DOMParser();
export const html = (value) => {
	console.log("HTML VALUE", value);
	const doc = htmlParser.parseFromString(value, "text/html");
	const res = new DocumentFragment();
	while (doc.body && doc.body.firstChild) {
		res.appendChild(doc.body.firstChild);
	}
	return res;
};
export const debug = (value, scope) => {
	console.log("[uijs.debug] Slot value:", { value, scope });
	return value;
};

export const registerFormat = (name, format) => {
	Formats[name] = format;
	return format;
};

export const Formats = {
	bool,
	text,
	count,
	not,
	html,
	idem,
	type,
	attr,
	len,
	debug,
	ago,
	timetuple,
};
// EOF

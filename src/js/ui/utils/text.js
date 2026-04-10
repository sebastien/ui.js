export const camelToKebab = (str) =>
	str
		// Look for any lowercase letter followed by an uppercase letter
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		// Convert the entire string to lowercase
		.toLowerCase();
// EOF

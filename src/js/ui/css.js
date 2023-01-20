// --
// ## CSS

const CSS_UNITS = [
	"%",
	"em",
	"ex",
	"cap",
	"ch",
	"ic",
	"rem",
	"lh",
	"rlh",
	"vw",
	"vh",
	"vi",
	"vb",
	"vmin",
	"vmax",
	"cm",
	"mm",
	"Q",
	"in",
	"pc",
	"pt",
	"px",
	"deg",
	"rad",
	"grad",
	"turn",
	"s",
	"mm",
	"Hz",
	"kHz",
	"fr",
	"dpi",
	"dpcm",
	"dppx",
	"x",
].reduce((r, v) => {
	r[v] = true;
	return r;
}, {});

const RE_CSS_PROPERTY = /[A-Za-z][a-z]*/g;
export const cssPropertyName = (name) => {
	if (name && name.startsWith("--")) return name;
	else {
		const property = RE_CSS_PROPERTY;
		const res = [];
		let match = null;
		while ((match = property.exec(name)) !== null) {
			res.push(match[0].toLowerCase());
		}
		return res.join("-");
	}
};

// EOF

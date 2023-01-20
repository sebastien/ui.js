import { clamp, prel, lerp, def, asMappable } from "./utils.js";

// SEE: Sourced from <https://observablehq.com/@sebastien/tokens>

// --
// # Color

export const RE_COLOR =
	/#([A-Fa-f0-9][A-Fa-f0-9])([A-Fa-f0-9][A-Fa-f0-9])([A-Fa-f0-9][A-Fa-f0-9])/;
export class Color {
	static BLACK = new Color([0, 0, 0, 1]);
	static WHITE = new Color([1, 1, 1, 1]);

	static DarkLight(black = undefined, white = undefined) {
		white = Color.Ensure(white || Color.WHITE);
		black = Color.Ensure(black || Color.BLACK);
		const dark = black.luminance < white.luminance ? black : white;
		const light = dark === black ? white : black;
		return [dark, light];
	}

	static Ensure(value, strict = true) {
		return value instanceof Color
			? value
			: value instanceof Array ||
			  (typeof value === "string" && value.match(RE_COLOR))
			? new Color(value)
			: strict
			? (() => {
					throw new Error(
						`Could not decode color from ${typeof value}: ${value}`
					);
			  })()
			: null;
	}

	constructor(value) {
		if (!(value instanceof Array || typeof value === "string")) {
			throw new Error(
				`Color value should be RGBA array or hex string, got ${typeof value}: ${value}`
			);
		}
		this.value = value instanceof Array ? value : hex(value);
		if (this.value.reduce((r, v) => (isNaN(v) ? r + 1 : r), 0)) {
			throw new Error(
				`Could not create color from: ${value}, got NaN in ${this.value}`
			);
		}
		if (!this.value) {
			throw new Error(`Could not create color from: ${value}`);
		}
		while (this.value.length < 4) {
			this.value.push(1.0);
		}
	}

	get rgb() {
		const [r, g, b] = this.value.map((_) => Math.round(gamma(_) * 255));
		return `rgb(${r},${g},${b})`;
	}

	get hex() {
		return hex(this.value);
	}

	get lightness() {
		// SEE: https://developer.mozilla.org/en-US/docs/Web/Accessibility/Understanding_Colors_and_Luminance
		// Ref: "Another way to describe this is that our perception roughly follows a power curve with an exponent of ~0.425, so perceptual lightness is approximately L* = Y0.425, though this depends on adaptation."
		return Math.pow(this.luminance, 0.425);
	}

	get luminance() {
		const [r, g, b] = this.value;
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}

	// Returns a version of the current color that contrast (in luminance) with
	// the other color of `delta` (between 0 and 1). The actual luminance delta
	// may be lower if it's not possible to make the luminance greter.
	contrast(other, delta = 0.1) {
		const la = this.luminance;
		const lb = Color.Ensure(other).luminance;
		const ld = clamp(lb - la, 0, 1);
		return Math.abs(ld) === delta
			? this
			: this.tint(clamp(la + delta * (ld / Math.abs(ld)), 0, 1));
	}

	// Creates a derived color with the given alpha value.
	alpha(value = 0.5) {
		const res = new Color([...this.value]);
		res.value[3] = clamp(value);
		return res;
	}

	// Returns a grey version of this color
	grey(k = 1) {
		const l = this.luminance;
		const g = new Color([l, l, l, 1]);
		return k >= 1 ? g : this.blend(g, k);
	}

	tint(luminance = 0.5, black = undefined, white = undefined) {
		const [dark, light] = Color.DarkLight(black, white);
		const l = clamp(this.luminance, 0, 1);
		const v = clamp(luminance, 0, 1);
		// If the current luminance is less than the target luminance
		return l < v
			? // Then we blend to white of a factor that the difference in
			  this.blend(light, prel(v, l, light.luminance))
			: this.blend(dark, prel(v, l, dark.luminance));
	}

	scale(steps = 10, black = undefined, white = undefined) {
		const [dark, light] = Color.DarkLight(black, white);
		return new Array(steps + 1)
			.fill(0)
			.map((_, i) => this.tint(i / steps, dark, light));
	}

	blend(color, k = 0.5) {
		const c = Color.Ensure(color, true);
		return new Color(
			this.value.map((v, i) => clamp(lerp(v, c.value[i], k), 0, 1))
		);
	}

	// TODO: Grey
	toString() {
		return hex(this.value);
	}
}

export const rgb = (r, g, b, a = 255, convert = degamma) => [
	convert(r / 255),
	convert(def(g, r) / 255),
	convert(def(b, g, r) / 255),
	convert(def(a, 255) / 255),
];

export const hex = (c, convert = undefined) =>
	typeof c === "string"
		? rgb(
				parseInt(c.substring(1, 3), 16),
				parseInt(c.substring(3, 5), 16),
				parseInt(c.substring(5, 7), 16),
				parseInt(c.substring(7, 9) || "FF", 16),
				convert
		  )
		: c instanceof Array
		? `#${Math.round((convert || gamma)(c[0]) * 255)
				.toString(16)
				.padStart(2, "0")}${Math.round((convert || gamma)(c[1]) * 255)
				.toString(16)
				.padStart(2, "0")}${Math.round((convert || gamma)(c[2]) * 255)
				.toString(16)
				.padStart(2, "0")}${Math.round(
				(convert || gamma)(c[3] === undefined ? 1.0 : c[3]) * 255
		  )
				.toString(16)
				.padStart(2, "0")}`.toUpperCase()
		: c;

export const gamma = asMappable((_) =>
	_ <= 0.00304 ? _ * 12.92 : 1.055 * Math.pow(_, 1.0 / 2.4) - 0.055
);

export const degamma = asMappable((_) =>
	_ <= 0.03928 ? _ / 12.92 : Math.pow((_ + 0.055) / 1.055, 2.4)
);

export const color = (_) => Color.Ensure(_);

export default color;

// EOF

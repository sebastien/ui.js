import { Stop } from "./values.js";

export class Future {
	constructor() {
		this.subs = [];
	}
	sub(callback) {
		this.sub.push(callback);
		return this;
	}
	unsub(callback) {
		const i = this.sub.indexOf(callback);
		return i >= 0 && (this.sub.splice(i, 1) || true);
	}
	trigger(value, end) {
		let i = 0;
		for (const f of this.sub) {
			i = i + 1;
			if (f(value, end) === Stop) {
				break;
			}
		}
	}
}

export class Stream extends Future {
	constructor() {
		super();
		this.revision = -1;
		this.value = undefined;
	}

	feed(value) {
		this.value = value;
		this.revision += 1;
	}
}

export class Repeat extends Stream {
	constructor(functor, period, condition) {
		super();
		this.period = period;
		this.condition = condition;
		this.functor = functor;
		this._step = () => {
			self.step();
		};
		this.step();
	}

	step() {
		this.feed(this.functor());
		if (!this.condition || this.condition(this)) {
			this.schedule();
		}
	}

	schedule(delay = this.period) {
		globalThis.setTimeout(this.step.bind(this), delay * 1000);
	}
}

export const repeat = (period, callback) => new Repeat(callback, period);

// EOF

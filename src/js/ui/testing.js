import { eq } from "./delta.js";

class Assertion {
	constructor(handler) {
		this.name = name;
		this.isSuccess = undefined;
		this.context = undefined;
		this.message = undefined;
		this.handler = handler;
	}

	as(name) {
		this.name = name;
		return this;
	}

	assert(value, ...rest) {
		return value
			? this.succeed("Condition met", { value })
			: this.fail(...rest);
	}

	same(actual, expected, message) {
		return eq(actual, expected)
			? this.succeed("Value is as expected", { value: actual })
			: this.fail(message, { expected, actual });
	}

	succeed(message, context) {
		this.isSuccess = this.isSuccess !== false ? true : false;
		if (this.isSuccess) {
			console.log(">-- OK", message, context);
		} else {
			console.log(">-- PASS", message, context);
		}
		this.handler({
			state: this.isSuccess,
			operation: true,
			message,
			context,
		});
		return this;
	}

	fail(message, context) {
		console.warn("-!- FAIL", message, context);
		this.isSuccess = false;
		this.message = message;
		this.context = context;
		this.handler({ state: false, operation: false, message, context });
		return this;
	}
}

class Test {
	constructor(handler) {
		this.assertions = [];
		this.handler = handler;
	}
	expect() {
		const res = new Assertion((...rest) => this.onEvent(res, ...rest));
		this.assertions.push(res);
		return res;
	}

	onEvent(...rest) {
		this.handler ? this.handler(this, ...rest) : null;
	}
}

export const Tests = [];
export const test = (testor, handler) => {
	const test = new Test(handler);
	Tests.push(test);
	testor({ expect: (...args) => test.expect(...args) });
	return test;
};

export default test;

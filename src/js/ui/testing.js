import { eq } from "./delta.js";

class Assertion {
  constructor() {
    this.name = name;
    this.isSuccess = undefined;
    this.context = undefined;
    this.message = undefined;
  }

  as(name) {
    this.name = name;
    return this;
  }
  same(actual, expected, message) {
    return eq(actual, expected)
      ? this.succeed()
      : this.fail(message, { expected, actual });
  }
  succeed() {
    this.isSuccess = this.isSuccess !== false ? true : false;
    return this;
  }
  fail(message, context) {
    this.isSuccess = false;
    this.message = message;
    this.context = context;
    return this;
  }
}

class Test {
  constructor() {
    this.assertions = [];
  }
  expect() {
    const res = new Assertion();
    this.assertions.push(res);
    return res;
  }
}

export const Tests = [new Test()];
export const test = (testor) => {
  const test = new Test();
  Tests.push(test);
  testor({ expect: (...args) => test.expect(...args) });
  return test;
};

export default test;

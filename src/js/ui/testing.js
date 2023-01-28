import { eq } from "./delta.js";

class TestLog {
  constructor(success, ...detail) {
    this.isSuccess = success;
    this.detail = detail;
  }
}
class Test {
  constructor() {
    this.log = [];
  }
  succeed(...rest) {
    this.log.push(new TestLog(true, ...rest));
    return this;
  }
  fail(...rest) {
    this.log.push(new TestLog(false, ...rest));
    return this;
  }
}

export const Tests = [new Test()];

export const succeed = (...rest) => Tests.at(-1).succeed(...rest);
export const fail = (...rest) => Tests.at(-1).fail(...rest);

export const expect = (actual, expected, message) =>
  eq(actual, expected) ? succeed() : fail(message, { expected, actual });

const api = { expect };
export const test = (testor) => {
  const test = new Test();
  Tests.push();
  testor(api);
  console.log("TEST RESULTS", { test });
  return test;
};

export default test;

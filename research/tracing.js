const reactiveValues = new Map();
const dependencies = new Map();

const trace = (func) => {
  const dependenciesForFunc = [];
  const tracedFunc = () => {
    dependenciesForFunc.forEach((reactiveValue) => {
      reactiveValue();
    });
    return func();
  };
  dependencies.set(tracedFunc, dependenciesForFunc);
  console.log("TRACED", { tracedFunc });
  return tracedFunc;
};

const reactive = (value) => {
  const listeners = [];
  const reactiveValue = (...args) => {
    if (args.length === 0) {
      listeners.forEach((listener) => listener());
      return value;
    }
    value = args[0];
    listeners.forEach((listener) => listener());
  };
  reactiveValue.depend = () => {
    listeners.push(currentFunc);
    if (currentFunc) {
      dependencies.get(currentFunc).push(reactiveValue);
    }
  };
  reactiveValues.set(reactiveValue, value);
  return reactiveValue;
};

let currentFunc = null;

const withTracing = (func) => {
  currentFunc = trace(func);
  const result = currentFunc();
  currentFunc = null;
  console.log("TRACED.tracing", { currentFunc, result });
  return currentFunc;
};

const name = reactive("John");
const greet = withTracing(() => {
  console.log(`Hello, ${name()}!`);
});

greet(); // logs "Hello, John!"
name("Jane");
greet(); // logs "Hello, Jane!"

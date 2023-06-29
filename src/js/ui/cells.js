import { INPUTS, Selector, parseSelector } from "./selector.js";
import { onError } from "./utils.js";

// --
// The cells module defines primitives for reactive state management.
//
const NAME = "[A-Za-z0-9_]+";
const PATH = "([@.]?([A-Za-z0-9]*)(\\.[A-Za-z0-9]+)*)";
const DECL = new RegExp(`^(?<inputs>${INPUTS})->(?<output>${PATH})$`);

// --
// A derivation maps a functor that takes inputs extracted from the
// inputs selector, and sets the value at the output path.
class Derivation {
  constructor(inputs, output, functor) {
    this.inputs = inputs;
    this.output = output;
    this.functor = functor;
  }
}

class NetworkState {
  constructor(network, scope) {
    this.network = network;
    this.scope = scope;
    this.outputs = network.derivations.map((_, i) => _.output.abspath(scope));
    this.inputs = network.derivations.map((_, i) =>
      _.inputs
        .apply(scope, ((...rest) => this.onInputChange(i, ...rest)).bind(this))
        .bind(scope)
    );
  }

  init() {
    this.network.derivations.forEach((_, i) => this.trigger(i));
    return this;
  }

  dispose() {
    this.handlers.forEach((_) => _.unbind(this.scope));
    return this;
  }

  onInputChange(index, value) {
    // FIXME: We should do something with the value
    this.trigger(index);
    // TODO: We should publish a cycle here
  }

  trigger(i) {
    const derivation = this.network.derivations[i];
    const input = this.inputs[i];
    const value =
      input.selector.type === Selector.LIST
        ? derivation.functor(...input.value)
        : derivation.functor(input.value);
    // We produce the output
    this.scope.state.patch(this.outputs[i], value);
    return value;
  }
}

class Network {
  constructor(derivations) {
    this.derivations = derivations;
  }
  apply(scope) {
    return new NetworkState(this, scope);
  }
}

export const cells = (definition) =>
  new Network(
    Object.entries(definition).reduce((r, [decl, functor]) => {
      const m = decl.match(DECL);
      if (!m) {
        onError(`cells: Could not parse declaration "${decl}"`, { definition });
        return null;
      } else {
        const { output, inputs } = m?.groups || {};
        r.push(
          new Derivation(parseSelector(inputs), parseSelector(output), functor)
        );
      }
      return r;
    }, [])
  );
// EOF

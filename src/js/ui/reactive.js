import { map, each, access } from "./utils/collections.js";
import { cmp } from "./utils/delta.js";
import { NotImplementedError } from "./utils/errors.js";

// Wraps a subscription
export class Subscription {
  constructor(handler, path) {
    this.handler = handler;
    this.path = path;
  }
  trigger() {
    return this.handler();
  }
}

// A hierarchical set of subscriptions
export class Subscribable {
  constructor() {
    this.subscriptions = null;
  }

  subscribed(path = null, offset = 0, creates = false) {
    if (!this.subscriptions) {
      if (creates) {
        this.subscriptions = new Map();
      } else {
        return null;
      }
    }
    let subs = this.subscriptions;
    const n = path ? path.length : 0;
    for (let i = offset; i < n; i++) {
      const chunk = path[i];
      if (!subs.has(chunk)) {
        if (creates) {
          const s = new Map();
          // We bind the parent to the `Map` key
          s.set(Map, subs);
          subs.set(chunk, s);
          subs = s;
        } else {
          return undefined;
        }
      } else {
        subs = subs.get(chunk);
      }
    }
    if (creates && !subs.has(null)) {
      const res = [];
      subs.set(null, res);
      return res;
    } else {
      return subs.get(null);
    }
  }

  sub(handler, path, offset = 0) {
    const res = new Subscription(handler, path);
    this.subscribed(path, offset, true).push(res);
    return res;
  }

  topics(path, offset = 0) {
    const res = [];
    let subs = this.subscriptions;
    if (!subs) {
      return res;
    }
    const n = path.length;
    for (let i = offset; i < n; i++) {
      const chunk = path[i];
      if (subs.has(chunk)) {
        const p = subs.get(chunk);
        res.splice(0, 0, p.get(null));
        subs = p;
      }
    }
    return res;
  }

  unsub(sub, path = null, offset = 0) {
    if (!this.subscriptions) {
      return null;
    }
    const p = this.subscribed(path, offset, false);
    const i = p ? p.indexOf(sub) : -1;
    return i >= 0 ? (p.splice(i, 1), sub) : null;
  }

  trigger(value, path = null, offset = 0, bubbles = true) {
    let count = 0;
    if (!this.subscriptions) {
      return count;
    }
    if (bubbles) {
      for (const p in this.topics(path, offset)) {
        for (const s of p.get(Subscription) || []) {
          s.trigger(value);
          count += 1;
        }
      }
    } else {
      const p = this.subscribed(path, offset, false);
      if (p) {
        for (const s of p.get(Subscription) || []) {
          s.trigger(value);
          count += 1;
        }
      }
    }
    return count;
  }
}

export class Cell extends Subscribable {
  constructor() {
    super();
  }

  get(path) {
    throw NotImplementedError;
  }
}

export class Value extends Cell {
  constructor(value, comparator = cmp) {
    super();
    this.value = value;
    this.comparator = comparator;
  }

  set(value, path = null, offset = 0) {
    if (path) {
      throw NotImplementedError;
    }
    const previous = this.value;
    this.value = value;
    this.comparator(value, previous) && this.trigger(value);
  }

  get(path = null, offset = 0) {
    return access(this.value, path, offset);
  }

  put(path) {
    throw NotImplementedError;
  }

  patch(path) {
    throw NotImplementedError;
  }

  delete(path) {
    throw NotImplementedError;
  }
}

export class Reducer extends Cell {
  constructor(input, reducer, value = undefined, comparator = cmp) {
    super();
    this.input = input;
    this.reducer = reducer;
    this.subscribed =
      input instanceof Cell
        ? input.sub(this.update)
        : map(input, (_, k) => _.sub(null, (_) => this.update(_, k)));
    this.value = value;
    this.inputValue = undefined;
    this.revision = -1;
    this._pending = undefined;
    this.comparator = comparator;
  }

  get(path = null, offset = 0) {
    if (this.revision === -1) {
      this.inputValue = this.evaluateInputs();
      this._set(this.evaluate(this.inputValue));
    }
    return access(this.value, path, offset);
  }

  unbind() {
    if (this.input instanceof Cell) {
      this.subscribed && this.input.unsub(null, this.subscribed);
    } else {
      each(this.input, (_, k) => this.input[k].unsub(null, _));
    }
  }

  update(value, k = null) {
    if (value instanceof Promise) {
      throw new Error(
        "Cannot update a cell with a future, value must be final",
        { value, k }
      );
    } else {
      // TODO: We may want to compare the previous input value.
      this.inputValue = value;
      this._set(this.reducer(value));
    }
  }

  evaluateInputs() {
    throw NotImplementedError;
  }

  evaluate() {
    throw NotImplementedError;
  }

  _set(value) {
    if (value instanceof Promise) {
      const r = this.revision;
      const cell = this;
      const updater = (_) =>
        cell.revision === r && (_ instanceof Promise ? _.then(updater) : _);
      value.then(updater);
      return undefined;
    } else {
      if (this.comparator(value, this.value) !== 0) {
        this.value = value;
        this.revision += 1;
        return true;
      } else {
        return false;
      }
    }
  }
}

// --
// Reduces a single input argument
export class ValueReducer extends Reducer {
  evaluateInputs() {
    return this.input.get();
  }
  evaluate(value = this.evaluateInputs()) {
    return this.reducer(...value);
  }
}

// --
// Reduces an array of arguments
export class ListReducer extends Cell {
  constructor(input, reducer, value = undefined, cmp = undefined) {
    super(input, reducer, value, cmp);
    this.inputValue = map(input, (_) => _.get());
  }

  evaluateInputs() {
    return map(this.input, (_) => _.get());
  }

  evaluate(value = this.evaluateInputs()) {
    return this.reducer(...value);
  }

  update(value, k) {
    if (value instanceof Promise) {
      throw new Error(
        "Cannot update a cell with a future, value must be final",
        { value, k }
      );
    } else {
      this.inputValue[k] = value;
      // TODO: Should we absorb changes at the input? Probably not.
      this._set(this.reducer(this.inputValue));
    }
  }
}

// --
// Reduces a map of arguments
export class MapReducer extends ListReducer {
  evaluate(value = this.evaluateInputs()) {
    return this.reducer(value);
  }
}

export class Scope extends Cell {
  constructor(parent) {
    super();
    this.slots = parent
      ? Object.create(
          parent instanceof Scope
            ? parent.slots
            : map(parent, (_) => new Value(_))
        )
      : {};
    this.parent = parent instanceof Scope ? parent : null;
  }

  get(path, offset = 0) {
    const slot = this.slots[path[offset]];
    return slot ? slot.get(path, offset + 1) : undefined;
  }

  set(path, value) {
    if (typeof path === "string") {
      const slot = this.slots[path];
      if (slot) {
        slot.set(value);
      } else {
        this.slots[path] = new Value(value);
      }
    } else {
      throw NotImplementedError;
    }
  }

  subscribed(path, creates = false, offset = 0) {
    const slot = this.slots[path[offset]];
    return slot ? slot.subscribed(path, creates, offset + 1) : undefined;
  }

  sub(path, handler, offset = 0) {
    const slot = this.slots[path[offset]];
    return slot ? slot.sub(path, handler, offset + 1) : undefined;
  }

  topics(path, offset = 0) {
    const slot = this.slots[path[offset]];
    return slot ? slot.topics(path, offset + 1) : undefined;
  }

  unsub(path, sub, offset = 0) {
    const slot = this.slots[path[offset]];
    return slot ? slot.unsub(path, sub, offset + 1) : undefined;
  }

  trigger(path, bubbles, offset = 0) {
    const slot = this.slots[path[offset]];
    return slot ? slot.trigger(path, bubbles, offset + 1) : undefined;
  }

  // TODO: Cell
}
// EOF

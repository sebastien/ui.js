import { map, access } from "./utils/collections.js";

// Wraps a subscription
export class Subscription {
  constructor(path, handler) {
    this.path = path;
    this.handler = handler;
  }
  trigger() {
    return this.handler();
  }
}

// A hierarchical set of subscriptions
export class Subscribable {
  constructor() {
    this.paths = new Map();
  }

  subs(path, creates = false, offset = 0) {
    let paths = this.paths;
    const n = path.length;
    for (let i = offset; i < n; i++) {
      const chunk = path[i];
      if (!paths.has(chunk)) {
        if (creates) {
          const s = new Map();
          // This sets the parent
          s.set(Map, paths);
          paths.set(chunk, s);
          paths = s;
        } else {
          return undefined;
        }
      } else {
        paths = paths.get(chunk);
      }
    }
    return paths;
  }

  sub(path, handler, offset = 0) {
    const res = new Subscription(path, handler);
    const p = this.subs(path, true, offset);
    if (!p.has(Subscription)) {
      // This sets the list of subscriptions
      p.set(Subscription, []);
    } else {
      p.get(Subscription).push(res);
    }
    return res;
  }

  topics(path, offset = 0) {
    const res = [];
    let paths = this.paths;
    const n = path.length;
    for (let i = offset; i < n; i++) {
      const chunk = path[i];
      if (paths.has(chunk)) {
        const p = paths.get(chunk);
        res.splice(0, 0, p);
        paths = p;
      }
    }
    return res;
  }

  unsub(path, sub, offset = 0) {
    const p = this.subs(path, false, offset);
    const i = p ? p.indexOf(sub) : -1;
    return i >= 0 ? (p.splice(i, 1), sub) : null;
  }

  trigger(path, bubbles, offset = 0) {
    if (bubbles) {
      for (const p in this.topics(path, offset)) {
        for (const s of p.get(Subscription) || []) {
          s.trigger();
        }
      }
    } else {
      const p = this.subs(path, false, offset);
      if (p) {
        for (const s of p.get(Subscription) || []) {
          s.trigger();
        }
      }
    }
  }
}

class Cell extends Subscribable {
  constructor() {
    super();
  }

  get(path) {}

  put(path) {}

  patch(path) {}

  delete(path) {}
}

export class Value extends Cell {
  constructor(value) {
    super();
    this.value = value;
  }

  get(path, offset = 0) {
    return access(this.value, path, offset);
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

  subs(path, creates = false, offset = 0) {
    const slot = this.slots[path[offset]];
    return slot ? slot.subs(path, creates, offset + 1) : undefined;
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

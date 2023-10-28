import { access } from "../utils/collections.js";

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

  get(path, creates = false) {
    let paths = this.paths;
    for (const chunk of path) {
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

  sub(path, handler) {
    const res = new Subscription(path, handler);
    const p = this.get(path, true);
    if (!p.has(Subscription)) {
      // This sets the list of subscriptions
      p.set(Subscription, []);
    } else {
      p.get(Subscription).push(res);
    }
    return res;
  }

  topics(path) {
    const res = [];
    let paths = this.paths;
    for (const chunk of path) {
      if (paths.has(chunk)) {
        const p = paths.get(chunk);
        res.splice(0, 0, p);
        paths = p;
      }
    }
    return res;
  }

  unsub(path, sub) {
    const p = this.get(path, false);
    const i = p ? p.indexOf(sub) : -1;
    return i >= 0 ? (p.splice(i, 1), sub) : null;
  }

  trigger(path, bubbles) {
    if (bubbles) {
      for (const p in this.topics(path)) {
        for (const s of p.get(Subscription) || []) {
          s.trigger();
        }
      }
    } else {
      const p = this.get(path, false);
      if (p) {
        for (const s of this.get(Subscription) || []) {
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

class Value extends Cell {
  constructor(value) {
    super();
    this.value = value;
  }

  get(path) {
    return access(this.value, path);
  }
}

// EOF

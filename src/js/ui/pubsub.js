import { Empty } from "./utils.js";

// --
// ## Pub/Sub

// const asKey = (key) => (typeof key === "number" ? `${key}` : key);
const asKey = (key) => key;

export class Topic {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = parent;
    this.children = new Map();
    this.handlers = undefined;
    this.values = [];
    this.capacity = 1;
    this.path =
      name !== "" && name !== null && name !== undefined
        ? parent
          ? [...parent.path, name]
          : [name]
        : [];
  }

  get value() {
    const n = this.values.length;
    return n === 0 ? Empty : this.values.at(-1);
  }

  get(name, create = true) {
    const key = asKey(name);
    return key instanceof Array
      ? key.reduce((r, v) => (r ? r.get(v, create) : null), this)
      : this.children.has(key)
      ? this.children.get(key)
      : create
      ? this.children.set(key, new Topic(key, this)).get(key)
      : null;
  }

  move(ka, kb) {
    ka = asKey(ka);
    kb = asKey(kb);
    const a = this.children.get(ka);
    this.children.delete(ka);
    const b = this.children.get(kb);
    this.children.set(kb, a);
    return b;
  }

  // TODO: Arguably, it may be easier to always have an  array, and limit it
  // using the capacity.
  pub(data, limit = 1, capacity = undefined) {
    console.log(`Topic.pub at '${this.path.join(".")}'`, data);
    // We let the publisher decide of the capacity of the topic. This may change
    // the data retention on the topic.
    if (capacity !== undefined) {
      this.capacity = capacity;
    }
    if (this.capacity >= 0 && this.values.length >= this.capacity - 1) {
      this.values.splice(0, this.values.length + 1 - this.capacity);
    }
    this.values.push(data);
    // This is the dispatching algorithm, that supports handlers consuming
    // values.
    let topic = this;
    let offset = 0;
    let count = 0;
    while (topic && (limit === -1 || offset < limit)) {
      if (topic.handlers) {
        for (let handler of topic.handlers) {
          if (handler(data, topic, offset) === false) {
            return count++;
          } else {
            count++;
          }
        }
      }
      topic = topic.parent;
      offset += 1;
    }
    return count;
  }

  del(limit = 1) {
    console.log(`Topic.del at '${this.path.join(".")}'`);
    let topic = this;
    let offset = 0;
    while (topic && (limit === -1 || offset < limit)) {
      if (topic.handlers) {
        for (let handler of topic.handlers) {
          // TODO: We should stop propagation
          handler(Empty, topic, offset);
        }
      }
      topic = topic.parent;
      offset += 1;
    }
    this.parent.children.delete(this.name, this);
    this.parent = null;
    return this;
  }

  // Consumes a value off the list of values
  consume() {
    if (this.values.length) {
      return this.values.shift();
    } else {
      return Empty;
    }
  }
  flush() {
    const v = this.values;
    this.values = [];
    return v;
  }

  sub(handler, withLast = 1) {
    const values = [...this.values];
    console.log(`Topic.sub at '${this.path.join(".")}'`, handler, {
      values,
      value: this.value,
      withLast,
    });
    if (!this.handlers) {
      this.handlers = [];
    }
    this.handlers.push(handler);
    // If the current value is not empty, and the handler requests with last n
    if (this.value !== Empty && withLast !== 0) {
      if (this.capacity === 1) {
        handler(this.value, this);
      } else {
        const n = this.values.length;
        for (let i = Math.max(0, n - withLast); i < n; i++) {
          if (handler(this.values[i], this) === false) {
            break;
          }
        }
      }
    }
    return this;
  }

  unsub(handler) {
    let i = 0;
    while (i >= 0) {
      i = this.handlers.indexOf(handler);
      if (i >= 0) {
        this.handlers.splice(i, 1);
      }
    }
    return this;
  }

  walk(callback, includeSelf = false) {
    if (includeSelf === false || callback(this) !== false) {
      for (let v of this.children.values()) {
        if (v.walk(callback, true) === false) {
          return false;
        }
      }
    }
  }

  list() {
    const res = [];
    this.walk((_) => res.push(_), false);
    return res;
  }
}

export class PubSub {
  constructor() {
    this.topics = new Topic();
  }

  get(topic, create = true) {
    return topic
      ? topic instanceof Topic
        ? topic
        : this.topics.get(
            topic instanceof Array ? topic : topic.split("."),
            create
          )
      : this.topics;
  }

  pub(topic, data, limit = undefined, capacity = undefined) {
    return this.get(topic).pub(data, limit, capacity), this;
  }

  sub(topic, handler, withLast = true) {
    return this.get(topic).sub(handler, withLast), this;
  }

  unsub(topic, handler) {
    const t = this.get(topic, false);
    return t && t.unsub(handler), this;
  }
}

export const bus = () => {
  const bus = new PubSub();
  const pub = (topic, data, limit = undefined) => bus.pub(topic, data, limit);
  const topic = (topic) => bus.get(topic);
  const sub = (topic, handler, withLast) => bus.sub(topic, handler, withLast);
  const unsub = (topic, handler) => bus.unsub(topic, handler);
  return { bus, pub, sub, unsub, topic };
};
// EOF

// --
// ## Pub/Sub

const Empty = new Object();

export class Topic {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = parent;
    this.children = new Map();
    this.handlers = undefined;
    this.value = Empty;
    this.path =
      name !== "" && name !== null && name !== undefined
        ? parent
          ? [...parent.path, name]
          : [name]
        : [];
  }

  get(name) {
    return name instanceof Array
      ? name.reduce((r, v) => r.get(v), this)
      : this.children.has(name)
      ? this.children.get(name)
      : this.children.set(name, new Topic(name, this)).get(name);
  }

  move(ka, kb) {
    const a = this.children.get(ka);
    this.children.delete(ka);
    const b = this.children.get(kb);
    this.children.set(kb, a);
    return b;
  }

  pub(data, limit = -1) {
    this.value = data;
    let topic = this;
    let offset = 0;
    while (topic && (limit === -1 || offset < limit)) {
      if (topic.handlers) {
        for (let handler of topic.handlers) {
          // TODO: We should stop propagation
          handler(data, topic, offset);
        }
      }
      topic = topic.parent;
      offset += 1;
    }
  }

  sub(handler, withLast = true) {
    if (!this.handlers) {
      this.handlers = [];
    }
    this.handlers.push(handler);
    withLast && this.value !== Empty && handler(this.value);
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

  walk(callback) {
    if (callback(this) !== false) {
      for (let v of this.children.values()) {
        if (v.walk(callback) === false) {
          return false;
        }
      }
    }
  }

  list() {
    const res = [];
    this.walk((_) => res.push(_));
    return res;
  }
}

class PubSub {
  constructor() {
    this.topics = new Topic();
  }

  get(topic) {
    return topic
      ? topic instanceof Topic
        ? topic
        : this.topics.get(topic instanceof Array ? topic : topic.split("."))
      : this.topics;
  }

  pub(topic, data) {
    console.log("PUB", this.get(topic).path.join("."), data);
    return this.get(topic).pub(data), this;
  }

  sub(topic, handler, withLast = true) {
    console.log("SUB", this.get(topic).path.join("."), handler);
    return this.get(topic).sub(handler, withLast), this;
  }

  unsub(topic, handler) {
    return this.get(topic).unsub(handler), this;
  }
}

export const bus = new PubSub();
export const pub = (topic, data) => bus.pub(topic, data);
export const sub = (topic, handler, withLast) =>
  bus.sub(topic, handler, withLast);
export const unsub = (topic, handler) => bus.unsub(topic, handler);

// DEBUG
window.BUS = bus;
// EOF

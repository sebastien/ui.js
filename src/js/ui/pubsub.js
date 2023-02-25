// --
// ## Pub/Sub

const Empty = new Object();

const asKey = (key) => (typeof key === "number" ? `${key}` : key);

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

  get(name, create = true) {
    const key = asKey(name);
    return key instanceof Array
      ? key.reduce((r, v) => r.get(v), this)
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

  pub(data, limit = 1) {
    console.log(`Topic.pub at '${this.path.join(".")}'`, data);
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
    // console.log(`Topic.sub at '${this.path.join(".")}'`, handler);
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

class PubSub {
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

  pub(topic, data, limit = undefined) {
    return this.get(topic).pub(data, limit), this;
  }

  sub(topic, handler, withLast = true) {
    return this.get(topic).sub(handler, withLast), this;
  }

  unsub(topic, handler) {
    return this.get(topic).unsub(handler), this;
  }
}

export const Bus = new PubSub();
export const pub = (topic, data, limit = undefined) =>
  Bus.pub(topic, data, limit);
export const sub = (topic, handler, withLast) =>
  Bus.sub(topic, handler, withLast);
export const unsub = (topic, handler) => Bus.unsub(topic, handler);

// EOF

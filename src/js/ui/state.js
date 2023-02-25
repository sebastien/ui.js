import { parsePath } from "./paths.js";
import { Bus } from "./pubsub.js";
import { type } from "./utils.js";

// --
// ## State Tree

export class StateTree {
  constructor() {
    this.state = {};
    this.bus = Bus;
  }

  // -- doc
  // Retrieves the value at the given `path`
  get(path) {
    let res = this.state;
    for (let k of path instanceof Array ? path : path.split(".")) {
      if (!res) {
        return undefined;
      }
      res = res[k];
    }
    return res;
  }

  // -- doc
  // Ensures there's a value at the given `path`, assigning the `defaultValue`
  // if not existing.
  ensure(path, defaultValue = undefined, limit = 0, offset = 0) {
    let scope = this.state;
    const p = path instanceof Array ? path : path.split(".");
    let i = 0 + offset;
    const j = p.length - 1 + limit;
    while (i <= j) {
      const k = p[i++];
      if (scope[k] === undefined) {
        if (i === j && defaultValue !== undefined) {
          scope = scope[k] = defaultValue;
        } else if (typeof k === "number") {
          scope = scope[k] = [];
        } else {
          scope = scope[k] = {};
        }
      } else {
        scope = scope[k];
      }
    }
    return scope;
  }

  // -- doc
  // Returns the scope (ie. the parent object) at the give path. For instance
  // if the path is `items.1`, this will return the value at path `items`.
  scope(path) {
    return this.ensure(path, undefined, -1);
  }

  put(path = null, value = undefined) {
    return this.patch(path, value);
  }

  patch(path = null, value = undefined, clear = false) {
    const p = path instanceof Array ? path : path ? parsePath(path) : [];
    const scope = p.length === 0 ? null : this.scope(p);
    const key = p.at(-1);
    const updated = clear
      ? value
      : this._apply(p.length === 0 ? this.state : scope[key], value);
    const scopeTopic = this.bus.get(p.slice(0, -1), false);
    if (p.length === 0) {
      this.state = updated;
      this._pub(scopeTopic, updated);
    } else {
      scope[key] = updated;
      if (scopeTopic) {
        this._pub(scopeTopic.get(key, false), updated);
        scopeTopic.pub(scope);
      }
    }
  }

  // -- doc #internal
  // Relays a change to a given topic
  _pub(topic, value) {
    if (!topic) {
      return;
    }
    switch (type(value)) {
      case "list":
      case "map":
        // Any child topic should be updated with the delta.
        for (let [k, t] of topic.children.entries()) {
          const v = value[k];
          // We force a pub on objects, as the key may have changed
          if (v !== t.value || typeof (v === "object")) {
            this._pub(t, v);
          }
        }
        topic.pub(value);
        break;
      default:
        // This is a single value so that means any children
        // topic is then marked as undefined/removed.
        topic.walk((_) => {
          _.pub(undefined);
        });
        topic.pub(value);
    }
  }

  // -- doc #internal
  // Returns value applied with the given changes.
  _apply(value, changes) {
    if (changes === null) {
      return null;
    } else if (
      value === undefined ||
      value === null ||
      type(changes) !== "map"
    ) {
      return changes;
    }
    switch (type(value)) {
      case "list":
        for (let k in changes) {
          if (typeof k === "number") {
            while (value.length < k) {
              value.push(k);
            }
          }
          value[k] = changes[k];
        }
        return value;
      case "map":
        for (let k in changes) {
          value[k] = changes[k];
        }
        return value;
      default:
        return changes;
    }
  }
}

export const State = new StateTree();

export const get = (path) => State.get(path);
export const patch = (path, data) => State.patch(path, data);

// DEBUG
window.STATE = State;
// EOF

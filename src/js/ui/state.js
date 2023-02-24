import { parsePath } from "./paths.js";
import { pub } from "./pubsub.js";
import { nextKey, copy } from "./utils.js";

// --
// ## State Tree

export class StateEvent {
  constructor(name, value, previous, scope, key) {
    this.name = name;
    this.value = value;
    this.previous = previous;
    this.scope = scope;
    this.key = key;
  }
}

export class StateTree {
  constructor() {
    this.state = {};
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

  // -- doc
  // Patches the `value` at the given `path`.
  patch(path = null, value = undefined, clear = false) {
    const p = path instanceof Array ? path : path ? parsePath(path) : [];
    if (p.length === 0) {
      const previous = copy(this.state);
      this.state = clear ? value : Object.assign(this.state, value);
      pub(
        [],
        new StateEvent("Update", this.state, previous, this.state, undefined),
        1 // We limit propagation to the current topic
      );
    } else {
      const scope = this.scope(p);
      // If key is null, then we generate a new one based on the data
      let key = p[p.length - 1];
      if (key === null) {
        key = nextKey(scope);
      }
      const base = p.slice(0, -1);
      if (scope[key] !== value) {
        // scope[key] may be undefined
        if (value === null) {
          // If the value is removed
          if (scope instanceof Array) {
            // We test for an Array
            const n = scope.length;
            const last = scope[n - 1];
            scope.splice(key, 1);
            // NOTE: This is not great as this will send as many events as there are
            // next items, this is because all the indices have changed, and we need
            // to update the topic tree.
            for (let i = key; i < n - 1; i++) {
              pub(
                [...base, i],
                new StateEvent("Update", scope[i], copy(scope[i + 1]), i),
                1 // We limit propagation to the current topic
              );
            }
            pub(
              p,
              new StateEvent("Delete", null, last, scope, n - 1),
              1 // We limit propagation to the current topic
            );
          } else {
            // Or a dictionary
            const previous = copy(scope[key]);
            delete scope[key];
            pub(
              p,
              new StateEvent("Delete", null, previous, scope, key),
              1 // We limit propagation to the current topic
            );
          }
        } else {
          const previous = copy(scope[key]);
          // The value is not removed, easy case
          if (scope instanceof Array) {
            while (scope.length < key) {
              scope.push(undefined);
            }
          }
          scope[key] =
            clear || scope[key] == null || typeof scope[key] !== "object"
              ? value
              : Object.assign(scope[key], value);
          pub(
            p,
            new StateEvent(
              previous === undefined ? "Create" : "Update",
              scope[key],
              previous,
              scope,
              key
            ),
            1 // We limit propagation to the current topic
          );
        }
      }
    }
  }
}

export const State = new StateTree();

export const get = (path) => State.get(path);
export const patch = (path, data) => State.patch(path, data);

// DEBUG
window.STATE = State;
// EOF

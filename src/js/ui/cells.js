import { onError } from "./utils/logging.js";

// --
//
// ## Controller Cells
//

// TODO: StateCell -> StoredCell
// TODO: LocalCell -> InternalCell
// TODO: Shoudl be slots
//
export class Cell {
  constructor() {
    this.scope = undefined;
    this.revision = 0;
  }

  bind(scope) {
    this.scope = scope;
    return this;
  }

  unbind() {
    this.scope = undefined;
    return this;
  }

  get value() {
    throw new Error("Cell.value not implemented", { cell: this });
  }

  sub(handler) {
    throw new Error("Cell.sub not implemented", { cell: this });
  }

  unsub(handler) {
    throw new Error("Cell.unsub not implemented", { cell: this });
  }

  set(value) {
    throw new Error("Cell.set not implemented", { cell: this });
  }

  clear() {
    this.set(undefined);
  }

  onDeferred(promise, operation) {
    const cell = this;
    const revision = cell.revision;
    // We can't cancel promises;
    promise.then((value) =>
      cell.revision === revision ? operation(value) : null
    );
  }
}

// --
// Local cells store their state locally, ie within the cell directly. This
// is to be put in contrast with state cells, which persist their state
// in another cell.
export class LocalCell extends Cell {
  constructor() {
    super();
    this.handlers = [];
    this._value = undefined;
  }

  get value() {
    return this._value;
  }

  sub(handler) {
    this.handlers.push(handler);
    return this;
  }

  unsub(handler) {
    this.handlers.remove(handler);
    return this;
  }

  set(value) {
    if (this._value !== value) {
      this._value = value;
      // TODO: We should compare here
      this.trigger(value, this);
    }
    return value;
  }

  trigger(...args) {
    if (this.handlers) {
      for (const handler of this.handlers) {
        try {
          handler(...args);
        } catch (e) {
          onError("components: Handler failed", { cell: this, handler });
        }
      }
    }
  }
}

export class StateCell extends Cell {
  constructor(path, value) {
    super();
    this.path = path;
    this.default = value;
    this.topic = undefined;
  }

  bind(scope) {
    super.bind(scope);
    this.topic = this.scope.state.bus.get(this.path);
    // If the slot has a default value and there is no value currently
    // defined in the state, then we assign it.
    if (this.default !== undefined) {
      if (this.scope.state.get(this.path) === undefined) {
        this.scope.state.put(this.path, this.default);
      }
    }
    return this;
  }

  get value() {
    return this.scope.state.get(this.path);
  }

  sub(handler) {
    this.topic.sub(handler);
    return this;
  }

  unsub(handler) {
    this.topic.unsub(handler);
    return this;
  }

  updated() {
    return this.set(this.value);
  }

  remove() {
    this.scope.state.remove(this.path);
    // TODO: Should we unbind at that point?
    this.unbind();
    return this;
  }

  update(value) {
    if (value instanceof Promise) {
      this.onDeferred(value, (_) => this.update(_));
    } else {
      this.scope.state.patch(this.path, value);
      this.revision += 1;
    }
    return this;
  }

  set(value) {
    if (value instanceof Promise) {
      this.onDeferred(value, (_) => this.set(_));
    } else {
      this.scope.state.put(this.path, value);
      this.revision += 1;
    }
    return this;
  }

  append(value) {
    if (value instanceof Promise) {
      onError("Appending a promise is not supported yet");
    } else {
      return new StateCell(
        this.scope.state.append(this.path, value),
        value
      ).bind(this.scope);
    }
  }

  //   TODO
  //   insert(key, value) {}
  //
  //   pop(key) {}
  //
  //   removeAt(key) {}
  //
  //   remove(value) {}
  // clear() {}
}

export class Ref extends StateCell {
  constructor(name) {
    super(undefined, undefined);
    this.name = name;
  }

  bind(scope) {
    this.path = [...scope.localPath, `#${this.name}`];
    return super.bind(scope);
  }
}

export class Slot extends StateCell {
  constructor(path, value) {
    super(path, value);
    // In case the value is derived from a cell
    this._cell = undefined;
    this._cellHandler = undefined;
  }

  get value() {
    // We resolve the cell, if there's one, or the scope, or the default.
    return this._cell
      ? this._cell.value
      : this.scope
      ? this.scope.state.get(this.path)
      : this.default;
  }

  update(value) {
    if (value && value instanceof Cell) {
      this.bindCell(value);
      this._update(value.value);
    } else {
      this.bindCell(null);
      this._update(value);
    }
  }

  set(value) {
    if (value && value instanceof Cell) {
      this.bindCell(value);
      this._set(value.value);
    } else {
      this.bindCell(null);
      this._set(value);
    }
    return this;
  }

  bindCell(cell) {
    if (cell !== this._cell) {
      if (this._cell) {
        this._cell.unsub(this._cellHandler);
        this._cell = undefined;
      }
      if (cell && cell instanceof Cell) {
        if (!this._cellHandler) {
          this._cellHandler = (_) => this._set(_);
        }
        this._cell = cell;
        cell.sub(this._cellHandler);
      }
    }
  }

  _set(value) {
    if (this.scope) {
      this.scope.state.put(this.path, value);
    }
  }

  _update(value) {
    if (this.scope) {
      this.scope.state.update(this.path, value);
    }
  }
}

// FIXME: We may want to specialize based on the type of reducer
export class Reducer extends LocalCell {
  constructor(inputs, functor, input, inputTrigger) {
    super();
    this.inputs = inputs;
    this.functor = functor;
    this.input = input;
    this._inputTrigger = inputTrigger;
  }

  onInputChange(key, value, ...rest) {
    onError("Slot.onInputChange: Not implemented", { slot: this });
  }

  doUpdate() {
    this.set(this.functor(...this.input));
  }
}

export class AtomReducer extends Reducer {
  constructor(inputs, functor) {
    super(inputs, functor, undefined, (...args) =>
      this.onInputChange(null, ...args)
    );
  }

  bind(scope) {
    super.bind(scope);
    this.inputs.sub(this._inputTrigger);
    this.input = this.inputs.value;
    this.doUpdate();
  }

  onInputChange(key, value, ...rest) {
    if (this.input !== value) {
      this.input = value;
      this.doUpdate();
    }
  }

  doUpdate() {
    this.set(this.functor(this.input));
  }
}

export class ArrayReducer extends Reducer {
  constructor(inputs, functor) {
    super(
      inputs,
      functor,
      inputs.map(() => undefined),
      inputs.map(
        (_, i) =>
          (...args) =>
            this.onInputChange(i, ...args)
      )
    );
  }

  bind(scope) {
    super.bind(scope);
    this.input = this.inputs.map((cell, i) => {
      cell.sub(this._inputTrigger[i]);
      return cell.value;
    });
    this.doUpdate();
  }

  onInputChange(key, value) {
    if (this.input[key] !== value) {
      this.input[key] = value;
      this.doUpdate();
    }
  }
  doUpdate() {
    this.set(this.functor(...this.input));
  }
}

export class MapReducer extends Reducer {
  constructor(inputs, functor) {
    super(
      inputs,
      functor,
      Object.keys(inputs).reduce((r, k) => {
        r[k] = undefined;
        return r;
      }, {}),
      Object.keys(inputs).reduce((r, k) => {
        r[k] = (...args) => this.onInputChange(k, ...args);
        return r;
      }, {})
    );
  }

  bind(scope) {
    super.bind(scope);
    this.input = {};
    for (const [key, cell] of Object.entries(this.inputs)) {
      cell.path.sub(this._inputTrigger[key]);
      this.input[key] = cell.value;
    }
    this.doUpdate();
  }

  onInputChange(key, value) {
    if (this.input[key] !== value) {
      this.input[key] = value;
      this._value = this.functor(this.input);
    }
  }
}

// EOF

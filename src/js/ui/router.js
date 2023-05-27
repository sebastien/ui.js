export class URLFormatter {
  parse(t, sep = "&") {
    const w = t.split(sep);
    return w.length === 1
      ? t === "null"
        ? null
        : t === "true"
        ? true
        : t === "false"
        ? false
        : /^\d+(\.\d+)?$/.test(t)
        ? parseFloat(t)
        : t
      : w.map((_) => this.parse(_, "+"));
  }

  apply(value) {
    return value === undefined
      ? ""
      : value === null
      ? "null"
      : value === true
      ? "true"
      : value === false
      ? "false"
      : typeof value === "number"
      ? `${value}`
      : typeof value === "string"
      ? value
      : value instanceof Array
      ? value.map((_) => this.apply(_)).join("+")
      : value instanceof Object
      ? Object.entries(value)
          .map(([k, v]) => `${k}:${this.apply(v)}`)
          .join("+")
      : "";
  }
}

export class URLHash {
  constructor() {
    this.state = {};
    this.revision = 0;
    this.formatter = new URLFormatter();
    this._onUpdate = () => this.pull();
    this.handlers = [];
    this.bind();
    this.pull();
  }

  onChange(handler, trigger = true) {
    this.handlers.push(handler);
    trigger && handler(this.state, this.revision);
    return this;
  }
  offChange(handler) {
    this.handlers.remove(handler);
    return this;
  }

  get(name = undefined) {
    return name === undefined ? this.state : this.state[name];
  }

  set(name, value = undefined) {
    if (typeof name === "string") {
      if (this.state[name] !== value) {
        if (value === undefined) {
          delete this.state[name];
        } else {
          this.state[name] = value;
        }
        this.push();
      }
    } else {
      this.state = name;
      this.push();
    }
  }

  parse(source) {
    const data = {};
    for (const [k, v] of new URLSearchParams(source).entries()) {
      data[k] = this.formatter.parse(v);
    }
    return data;
  }

  format() {
    const d = new URLSearchParams();
    for (const [k, v] of Object.entries(this.state)) {
      d.set(k, this.formatter.apply(v));
      console.log("SETTING", k, v, this.formatter.apply(v));
    }
    return d.toString();
  }

  pull() {
    this.state = this.parse(window.location.hash.substring(1));
    this.revision += 1;
    this.handlers.forEach((h) => h(this.state, this.revision));
    return this.state;
  }

  push() {
    const text = this.format();
    const loc = window.location;
    const url = `${loc.origin}${loc.pathname}${loc.search}#${text}`;
    // TODO: We could do a pushState
    globalThis.history.replaceState(this.state, "", url);
  }

  bind() {
    addEventListener("hashchange", this._onUpdate);
    return this;
  }

  unbind() {
    removeEventListener("hashchange", this._onUpdate);
    return this;
  }
}

// EOF

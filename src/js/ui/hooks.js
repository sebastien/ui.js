class StateSlot {
  constructor(state, path) {
    this.state = state;
    this.path = path;
  }
  get() {
    return this.state.get(this.path);
  }
  set() {
    return this.state.put(this.path);
  }
  on(handler) {
    this.state.on(this.path, handler);
    return () => this.state.off(this.path, handler);
  }
}

export const useState = (state, path) => {
  return StateSlot(state, path);
};

export const useLocalState = (state, path) => {
  return StateSlot(
    state,
    typeof path === "string"
      ? [...state.localPath, path]
      : state.localPath.concat(path)
  );
};

// EOF

// NOTE: Was part of reactive.js, but I don't think this is needed anymore
// with the Selected cell.
//
export class Reducer extends Cell {
	constructor(
		input,
		reducer = undefined,
		value = undefined,
		comparator = cmp
	) {
		super();
		this.input = input;
		this.reducer = reducer;
		// // TODO
		// this.subscribed =
		//   input instanceof Cell
		//     ? input.sub(this.update)
		//     : input
		//     ? map(input, (_, k) => _.sub(null, (_) => this.update(_, k)))
		//     : null;
		this.value = value;
		this.inputValue = undefined;
	}

	get(path = null, offset = 0) {
		if (this.revision === -1) {
			this.inputValue = this.evaluateInputs();
			this._set(this.evaluate(this.inputValue));
		}
		return access(this.value, path, offset);
	}

	unbind() {
		if (this.input instanceof Cell) {
			// this.subscribed && this.input.unsub(null, this.subscribed);
			console.log("FIXME");
		} else {
			console.log("FIXME");
			// each(this.input, (_, k) => this.input[k].unsub(null, _));
		}
	}

	update(value, k = null) {
		if (value instanceof Promise) {
			throw new Error(
				"Cannot update a cell with a future, value must be final",
				{ value, k }
			);
		} else {
			// TODO: We may want to compare the previous input value.
			this.inputValue = value;
			this._set(this.reducer ? this.reducer(value) : value);
		}
	}

	evaluateInputs() {
		throw NotImplementedError();
	}

	evaluate() {
		throw NotImplementedError();
	}
}

// --
// Reduces a single input argument
export class ValueReducer extends Reducer {
	evaluateInputs() {
		return this.input.get();
	}
	evaluate(value = this.evaluateInputs()) {
		return this.reducer(...value);
	}
}

// --
// Reduces an array of arguments
export class ListReducer extends Cell {
	constructor(input, reducer, value = undefined, cmp = undefined) {
		super(input, reducer, value, cmp);
		this.inputValue = map(input, (_) => _.get());
	}

	evaluateInputs() {
		return map(this.input, (_) => _.get());
	}

	evaluate(value = this.evaluateInputs()) {
		return this.reducer(value);
	}

	update(value, k) {
		if (value instanceof Promise) {
			throw new Error(
				"Cannot update a cell with a future, value must be final",
				{ value, k }
			);
		} else {
			this.inputValue[k] = value;
			// TODO: Should we absorb changes at the input? Probably not.
			this._set(this.reducer(this.inputValue));
		}
	}
}

// --
// Reduces a map of arguments
export class MapReducer extends ListReducer {
	evaluate(value = this.evaluateInputs()) {
		return this.reducer(value);
	}
}

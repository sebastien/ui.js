import { onError } from "./utils/logging.js";

const DERIVATION_KEY = Symbol("ui.cells.derivations");
const DEPENDENTS_KEY = Symbol("ui.cells.dependents");

const isPlainObject = (value) =>
	value && Object.getPrototypeOf(value) === Object.prototype;

// TODO: That should probably be "reactive"
//
// --
// The context acts as a singleton to retrieve the current context, typically
// used for handlers.
export class Context {
	static Stack = [];
	static Get() {
		return Context.Stack.at(-1);
	}
	static Push(value) {
		Context.Stack.push(value);
		return true;
	}
	static Pop(value) {
		if (Context.Stack.at(-1) === value) {
			Context.Stack.pop();
			return true;
		} else {
			return false;
		}
	}
	// --
	// Clear the given `context` so that the given `id` and 5 next slots
	// are nullified. This matches the stride of 6 slots per Slot instance.
	static Clear(ctx, id) {
		const derivations = ctx[DERIVATION_KEY];
		const dependents = ctx[DEPENDENTS_KEY];
		if (derivations && dependents) {
			const meta = derivations.get(id);
			if (meta) {
				for (let i = 0; i < meta.dependencies.length; i++) {
					const depId = meta.dependencies[i].id;
					const outputs = dependents.get(depId);
					if (outputs) {
						outputs.delete(id);
						if (!outputs.size) {
							dependents.delete(depId);
						}
					}
				}
				derivations.delete(id);
			}
			dependents.delete(id);
		}
		ctx[id] = null;
		ctx[id + 1] = null;
		ctx[id + 2] = null;
		ctx[id + 3] = null;
		ctx[id + 4] = null;
		ctx[id + 5] = null;
	}
	static Run(context, functor, args) {
		// TODO: should really be contextual if multiple threads.
		Context.Push(context);
		try {
			return args ? functor(...args) : functor();
		} finally {
			Context.Pop(context);
		}
	}
}

// There's still question on the boundary between slot/cell/derivation, etc.
export class Slot {
	static Id = 0;
	static Cycle = 0;
	static Pending = [];
	static PendingByContext = new WeakMap();
	static FlushQueued = false;
	static BatchDepthByContext = new WeakMap();
	static BatchedNotificationsByContext = new WeakMap();

	// These are the offsets for slot data within each context entry.
	// Slot IDs use a stride of 6 starting at index 4.

	// Metadata keys at indices 0-3 (shared across all contexts).
	// By using small integers instead of strings, these values share the
	// V8 elements backing store with slot data, avoiding separate named
	// property overhead (~1.8 MB savings in large apps).
	static Input = 0; // Special context value for passing values
	static Owner = 1; // Offset for the owning slot/effect
	static Parent = 2; // Offset for the parent context
	static Name = 3; // Offset for a debug name

	// Per-slot offsets 0-5 (added to each slot's base id):
	static Observable = 1; // Offset of the observable value
	// FIXME: Not sure if revision is useful, especially as slots
	// can be replicated across contexts.
	static Revision = 2; // Offset of the revision number
	static Node = 3; // Offset of the node
	static State = 4; // Offset of the state
	static Render = 5; // Offset of the render data

	// --
	// Matches the given `template` against the given `data`, returning
	// a flat array of alternating [slot, value, slot, value, ...] pairs
	// where slot is the original slot of the template, and value is
	// either a slot or a regular value.
	static Match(template, data, context = undefined, res = []) {
		// `data` may be a slot, in which case we may need to resolve it.
		const resolved_data =
			data instanceof Slot ? (context ? context[data.id] : undefined) : data;
		if (template instanceof Slot) {
			if (template.input) {
				Slot.Match(template.input, resolved_data, context, res);
			}
			res.push(template, data);
		} else if (template instanceof Map) {
			const is_map = data instanceof Map;
			if (resolved_data !== null && resolved_data !== undefined) {
				for (const k of template.keys()) {
					const w = is_map ? resolved_data.get(k) : resolved_data[k];
					Slot.Match(template[k], w, context, res);
				}
			}
		} else if (template instanceof Object) {
			const is_map = resolved_data instanceof Map;
			if (resolved_data !== null && resolved_data !== undefined) {
				for (const k in template) {
					const w = is_map ? resolved_data.get(k) : resolved_data[k];
					Slot.Match(template[k], w, context, res);
				}
			}
		}
		return res;
	}

	// --
	// Walks the template, and replaces any Slot with its value from
	// the given context.
	static *Walk(template) {
		if (template instanceof Slot) {
			yield template;
		} else if (template instanceof Map) {
			for (const v of template.values()) {
				for (const _ of Slot.Walk(v)) {
					yield _;
				}
			}
		} else if (Array.isArray(template)) {
			for (let i = 0; i < template.length; i++) {
				for (const _ of Slot.Walk(template[i])) {
					yield _;
				}
			}
		} else if (Object.getPrototypeOf(template) === Object.prototype) {
			for (const k in template) {
				for (const _ of Slot.Walk(template[k])) {
					yield _;
				}
			}
		}
	}

	// --
	// Like Walk, but uses a callback instead of a generator for better
	// performance in hot paths.
	static Each(template, callback) {
		if (template instanceof Slot) {
			callback(template);
		} else if (template instanceof Map) {
			for (const v of template.values()) {
				Slot.Each(v, callback);
			}
		} else if (Array.isArray(template)) {
			for (let i = 0; i < template.length; i++) {
				Slot.Each(template[i], callback);
			}
		} else if (
			template &&
			Object.getPrototypeOf(template) === Object.prototype
		) {
			for (const k in template) {
				Slot.Each(template[k], callback);
			}
		}
	}

	// --
	// Walks the template, and replaces any Slot with its value from
	// the given context.
	static Expand(template, context) {
		if (template instanceof Slot) {
			return context ? context[template.id] : undefined;
		} else if (template instanceof Map) {
			const res = new Map();
			for (const [k, v] of template.entries()) {
				res.set(k, Slot.Expand(v, context));
			}
			return res;
		} else if (Array.isArray(template)) {
			return template.map((_) => Slot.Expand(_, context));
		} else if (
			template !== null &&
			template !== undefined &&
			Object.getPrototypeOf(template) === Object.prototype
		) {
			const res = {};
			for (const k in template) {
				res[k] = Slot.Expand(template[k], context);
			}
			return res;
		} else {
			return template;
		}
	}

	// --
	// Subscribes a handler to the given slot id in context.
	static Sub(context, id, handler) {
		const subs =
			context[id + Slot.Observable] || (context[id + Slot.Observable] = []);
		subs.push(handler);
		return true;
	}

	// --
	// Unsubscribes a handler from the given slot id in context.
	static Unsub(context, id, handler) {
		const subs = context[id + Slot.Observable];
		if (subs) {
			const i = subs.indexOf(handler);
			if (i >= 0) {
				subs.splice(i, 1);
				return true;
			}
		}
		return false;
	}

	// --
	// Publishes a value to all subscribers of the given slot id in context.
	static Pub(context, id, value) {
		const subs = context[id + Slot.Observable];
		if (subs) {
			for (let i = 0; i < subs.length; i++) {
				if (subs[i](value) === false) {
					break;
				}
			}
		}
	}

	static IsBatching(context) {
		return (Slot.BatchDepthByContext.get(context) || 0) > 0;
	}

	static Batch(context, callback) {
		if (!context || typeof callback !== "function") {
			return callback ? callback() : undefined;
		}
		const depth = Slot.BatchDepthByContext.get(context) || 0;
		Slot.BatchDepthByContext.set(context, depth + 1);
		try {
			return callback();
		} finally {
			const next = (Slot.BatchDepthByContext.get(context) || 1) - 1;
			if (next <= 0) {
				Slot.BatchDepthByContext.delete(context);
				Slot.FlushBatchedNotifications(context);
			} else {
				Slot.BatchDepthByContext.set(context, next);
			}
		}
	}

	static QueueBatchedNotification(context, id) {
		let batch = Slot.BatchedNotificationsByContext.get(context);
		if (!batch) {
			batch = { ids: [], set: new Set() };
			Slot.BatchedNotificationsByContext.set(context, batch);
		}
		if (!batch.set.has(id)) {
			batch.set.add(id);
			batch.ids.push(id);
		}
	}

	static FlushBatchedNotifications(context) {
		const batch = Slot.BatchedNotificationsByContext.get(context);
		if (!batch?.ids.length) {
			return;
		}
		Slot.BatchedNotificationsByContext.delete(context);
		const handlers = [];
		const seen = new Set();
		const values = new Map();
		for (let i = 0; i < batch.ids.length; i++) {
			const id = batch.ids[i];
			const subs = context[id + Slot.Observable];
			if (!subs?.length) {
				continue;
			}
			const value = context[id];
			for (let j = 0; j < subs.length; j++) {
				const handler = subs[j];
				values.set(handler, value);
				if (!seen.has(handler)) {
					seen.add(handler);
					handlers.push(handler);
				}
			}
		}
		for (let i = 0; i < handlers.length; i++) {
			if (handlers[i](values.get(handlers[i])) === false) {
				break;
			}
		}
	}

	// --
	// Sets a value for the given slot id in context and notifies subscribers.
	static Notify(context, id, value, force) {
		if (force || value !== context[id]) {
			context[id] = value;
			context[id + Slot.Revision] = (context[id + Slot.Revision] || 0) + 1;
			Slot.MarkDependentsDirty(context, id);
			if (Slot.IsBatching(context)) {
				Slot.QueueBatchedNotification(context, id);
				return;
			}
			const subs = context[id + Slot.Observable];
			if (subs) {
				for (let i = 0; i < subs.length; i++) {
					if (subs[i](value) === false) {
						break;
					}
				}
			}
		}
	}

	static Derive(
		shape,
		processor,
		lazy = false,
		slot = undefined,
		context = Context.Get(),
	) {
		if (!context) {
			onError(
				"cells.Slot.Derive",
				"No context specified, cannot create derived cell",
			);
			return undefined;
		}
		const parsed = Slot.ParseShape(shape);
		if (!parsed) {
			throw new Error(
				"Derived cell shape should be an object or array of Slot",
			);
		}
		const target = slot || new Slot();
		if (typeof processor !== "function") {
			throw new Error("Derived cell processor should be a function");
		}

		for (let i = 0; i < parsed.dependencies.length; i++) {
			const dep = parsed.dependencies[i];
			if (dep.id === target.id || Slot.HasPath(context, target.id, dep.id)) {
				throw new Error(`Cyclic dependency detected for Slot(${target.id})`);
			}
		}

		const registry = Slot.Derivations(context);
		const dependents = Slot.Dependents(context);
		const meta = {
			id: target.id,
			processor,
			dependencies: parsed.dependencies,
			shapeType: parsed.shapeType,
			keys: parsed.keys,
			lazy: !!lazy,
			rank: 0,
			cycle: 0,
			dirty: !!lazy,
			stale: !!lazy,
		};

		meta.rank = Slot.CalculateRank(context, meta.dependencies);
		registry.set(target.id, meta);

		for (let i = 0; i < meta.dependencies.length; i++) {
			const dep = meta.dependencies[i];
			let succ = dependents.get(dep.id);
			if (!succ) {
				succ = new Set();
				dependents.set(dep.id, succ);
			}
			succ.add(target.id);
		}

		if (!meta.lazy) {
			Slot.EvaluateDerived(context, target.id, ++Slot.Cycle, true);
		}
		return target;
	}

	static ParseShape(shape) {
		if (Array.isArray(shape)) {
			const deps = [];
			for (let i = 0; i < shape.length; i++) {
				if (!(shape[i] instanceof Slot)) {
					return null;
				}
				deps.push(shape[i]);
			}
			return { shapeType: "array", dependencies: deps, keys: null };
		} else if (isPlainObject(shape)) {
			const keys = Object.keys(shape);
			const deps = [];
			for (let i = 0; i < keys.length; i++) {
				const dep = shape[keys[i]];
				if (!(dep instanceof Slot)) {
					return null;
				}
				deps.push(dep);
			}
			return { shapeType: "object", dependencies: deps, keys };
		}
		return null;
	}

	static Derivations(context) {
		let map = context[DERIVATION_KEY];
		if (!map) {
			map = new Map();
			context[DERIVATION_KEY] = map;
		}
		return map;
	}

	static Dependents(context) {
		let map = context[DEPENDENTS_KEY];
		if (!map) {
			map = new Map();
			context[DEPENDENTS_KEY] = map;
		}
		return map;
	}

	static Derivation(context, id) {
		return context?.[DERIVATION_KEY]
			? context[DERIVATION_KEY].get(id)
			: undefined;
	}

	static CalculateRank(context, dependencies) {
		let rank = 0;
		for (let i = 0; i < dependencies.length; i++) {
			const depMeta = Slot.Derivation(context, dependencies[i].id);
			const depRank = depMeta ? depMeta.rank + 1 : 1;
			rank = depRank > rank ? depRank : rank;
		}
		return rank;
	}

	static HasPath(context, sourceId, targetId, seen = new Set()) {
		if (sourceId === targetId) {
			return true;
		}
		if (seen.has(sourceId)) {
			return false;
		}
		seen.add(sourceId);
		const deps = Slot.Dependents(context).get(sourceId);
		if (!deps) {
			return false;
		}
		for (const next of deps) {
			if (next === targetId || Slot.HasPath(context, next, targetId, seen)) {
				return true;
			}
		}
		return false;
	}

	static ResolveShape(meta, values) {
		if (meta.shapeType === "array") {
			return values;
		}
		const res = {};
		for (let i = 0; i < meta.keys.length; i++) {
			res[meta.keys[i]] = values[i];
		}
		return res;
	}

	static MarkDependentsDirty(context, id) {
		const dependents = context[DEPENDENTS_KEY];
		if (!dependents) {
			return;
		}
		const visited = new Set();
		const stack = [id];
		while (stack.length > 0) {
			const source = stack.pop();
			const succ = dependents.get(source);
			if (!succ) {
				continue;
			}
			for (const derivedId of succ) {
				if (visited.has(derivedId)) {
					continue;
				}
				visited.add(derivedId);
				const meta = Slot.Derivation(context, derivedId);
				if (meta) {
					meta.dirty = true;
					meta.stale = true;
					Slot.EnqueueDerived(context, derivedId);
					stack.push(derivedId);
				}
			}
		}
	}

	static EnqueueDerived(context, id) {
		let ids = Slot.PendingByContext.get(context);
		if (!ids) {
			ids = new Set();
			Slot.PendingByContext.set(context, ids);
		}
		if (!ids.has(id)) {
			ids.add(id);
			Slot.Pending.push([context, id]);
		}
		if (!Slot.FlushQueued) {
			Slot.FlushQueued = true;
			queueMicrotask(() => Slot.FlushPending());
		}
	}

	static FlushPending() {
		Slot.FlushQueued = false;
		if (!Slot.Pending.length) {
			return;
		}
		const queue = Slot.Pending;
		Slot.Pending = [];
		for (let i = 0; i < queue.length; i++) {
			const [ctx, id] = queue[i];
			const ids = Slot.PendingByContext.get(ctx);
			ids?.delete(id);
		}
		const cycle = ++Slot.Cycle;
		queue.sort((a, b) => {
			const ma = Slot.Derivation(a[0], a[1]);
			const mb = Slot.Derivation(b[0], b[1]);
			return (ma ? ma.rank : 0) - (mb ? mb.rank : 0);
		});
		for (let i = 0; i < queue.length; i++) {
			const [context, id] = queue[i];
			const meta = Slot.Derivation(context, id);
			if (!meta?.dirty || meta.lazy) {
				continue;
			}
			Slot.EvaluateDerived(context, id, cycle, false);
		}
	}

	static FlushDerived(context, id, seen = new Set()) {
		if (seen.has(id)) {
			return;
		}
		seen.add(id);
		const meta = Slot.Derivation(context, id);
		if (!meta) {
			return;
		}
		for (let i = 0; i < meta.dependencies.length; i++) {
			const dep = meta.dependencies[i];
			const depMeta = Slot.Derivation(context, dep.id);
			if (depMeta && (depMeta.dirty || depMeta.stale)) {
				Slot.FlushDerived(context, dep.id, seen);
			}
		}
		if (meta.dirty || meta.stale) {
			Slot.EvaluateDerived(context, id, ++Slot.Cycle, true);
		}
	}

	static EvaluateDerived(context, id, cycle, forcedSync = false) {
		const meta = Slot.Derivation(context, id);
		if (!meta) {
			return;
		}
		meta.cycle = cycle;
		meta.dirty = false;
		meta.stale = false;

		const values = new Array(meta.dependencies.length);
		let hasPromise = false;
		for (let i = 0; i < meta.dependencies.length; i++) {
			const value = context[meta.dependencies[i].id];
			values[i] = value;
			hasPromise = hasPromise || value instanceof Promise;
		}

		if (hasPromise) {
			Promise.all(values)
				.then((resolved) => {
					const m = Slot.Derivation(context, id);
					if (!m || m.cycle !== cycle) {
						return;
					}
					return Slot.RunDerivedProcessor(
						context,
						id,
						cycle,
						resolved,
						forcedSync,
					);
				})
				.catch((error) =>
					onError("cells.Slot.EvaluateDerived", "Promise input failed", error),
				);
			return;
		}

		Slot.RunDerivedProcessor(context, id, cycle, values, forcedSync);
	}

	static RunDerivedProcessor(context, id, cycle, values, forcedSync = false) {
		const meta = Slot.Derivation(context, id);
		if (!meta || meta.cycle !== cycle) {
			return;
		}
		const shape = Slot.ResolveShape(meta, values);
		let result;
		try {
			result = Context.Run(context, meta.processor, [shape]);
		} catch (error) {
			onError("cells.Slot.Derive", "Derived processor failed", error);
			return;
		}
		if (result instanceof Promise) {
			result
				.then((value) => {
					const current = Slot.Derivation(context, id);
					if (!current || current.cycle !== cycle) {
						return;
					}
					Slot.Notify(context, id, value, true);
				})
				.catch((error) =>
					onError("cells.Slot.Derive", "Derived async processor failed", error),
				);
			return;
		}
		Slot.Notify(context, id, result, true);
		if (forcedSync) {
			const ids = Slot.PendingByContext.get(context);
			ids?.delete(id);
		}
	}

	constructor() {
		// Slot IDs start at 4 (after metadata indices 0-3) and use a stride
		// of 6. Each slot reserves 6 entries in the context for:
		// +0 value, +1 observable, +2 revision, +3 node, +4 state, +5 render.
		this.id = 4 + Slot.Id++ * 6;
	}

	// --
	// Retrieves the slot value in the current context.
	get value() {
		return this.get();
	}
	set value(value) {
		this.set(value);
	}

	// --
	// Ensures the subscriber array for this slot is initialized in the context.
	// For hot paths, prefer using Slot.Sub/Unsub/Notify/Pub static methods
	// directly to avoid intermediate object allocation.
	observable(context = Context.Get()) {
		if (context) {
			// Ensure subscriber array is initialized in the context.
			if (!context[this.id + Slot.Observable]) {
				context[this.id + Slot.Observable] = [];
			}
			return context;
		}
		onError(
			"cells.Slot.observable",
			"No context specified, cannot retrieve observable",
		);
	}

	get() {
		const ctx = Context.Get();
		if (ctx) {
			const meta = Slot.Derivation(ctx, this.id);
			if (meta && (meta.dirty || meta.stale)) {
				Slot.FlushDerived(ctx, this.id);
			}
		}
		return ctx ? ctx[this.id] : undefined;
	}

	call(...args) {
		const fn = this.get();
		switch (typeof fn) {
			case "function":
				return fn(...args);
		}
	}

	// --
	// We `force` by default
	set(value, force = true, context = Context.Get()) {
		if (context) {
			Slot.Notify(context, this.id, value, force);
		}
	}

	update(dict, context = Context.Get()) {
		const patch = dict instanceof Slot ? dict.get() : dict;
		const current = this.get();
		const next = isPlainObject(current) ? current : {};
		if (patch && typeof patch === "object") {
			Object.assign(next, patch);
		}
		this.set(next, true, context);
		return next;
	}

	touch(context = Context.Get()) {
		const value = this.get();
		this.set(value, true, context);
		return value;
	}

	// ========================================================================
	// MANIPULATION API
	// ========================================================================

	at(index, value = undefined) {
		const i = typeof index === "string" ? parseInt(index, 10) : index;
		if (value === undefined) {
			return this.list().at(i);
		} else if (Number.isNaN(i)) {
			return this.get();
		} else {
			const v = this.list();
			while (v.length < i) {
				v.push(undefined);
			}
			v[i] = value;
			this.set(v, true);
			return v;
		}
	}

	append(item) {
		const v = this.list();
		v.push(item instanceof Slot ? item.get() : item);
		this.set(v, true);
	}

	remove(item) {
		const v = item instanceof Slot ? item.get() : item;
		const w = this.list();
		const i = w.indexOf(v);
		if (i !== -1) {
			w.splice(i, 1);
			this.set(w, true);
		}
		return w;
	}

	removeAt(item) {
		const i = item instanceof Slot ? item.get() : item;
		const w = this.list();
		if (i !== -1) {
			w.splice(i, 1);
			this.set(w, true);
		}
		return w;
	}

	insert(index, item) {
		const v = item instanceof Slot ? item.get() : item;
		const w = this.list();
		while (w.length < index) {
			w.push(undefined);
		}
		w.splice(index, 0, v);
		this.set(w, true);
		return w;
	}

	toggle(value = undefined) {
		const v = this.get();
		const w = value === undefined ? !v : v === value ? null : value;
		this.set(w);
		return w;
	}

	pop(index = undefined) {
		const w = this.list();
		if (w.length) {
			if (index === undefined) {
				w.pop();
			} else {
				w.splice(index, 1);
			}
			this.set(w, true);
		}
		return w;
	}

	// NOTE: This does not mutate
	list() {
		const v = this.get();
		return Array.isArray(v) ? v : [v];
	}

	dict(key = "_") {
		const v = this.get();
		return v === undefined || v === null
			? {}
			: Object.getPrototypeOf(v) === Object.prototype
				? v
				: { [key]: v };
	}
	map(key = "_") {
		const v = this.get();
		if (v instanceof Map) {
			return v;
		} else {
			const w = new Map();
			if (v !== undefined) {
				w.set(key, v);
			}
			return w;
		}
	}

	// --
	// Tells if the cell is of the given `type:int`.
	isa(type) {
		return this.id % type === 0;
	}

	toString() {
		//return `${FIELD_SEP}${this.id}${FIELD_SEP}`;
		return `${this.constructor.name}(${this.id})`;
	}
}

// --
// An observable value that can be subscribed to and updated. This is now
// a thin wrapper around inline context storage for backward compatibility.
// Hot paths should use Slot.Sub/Unsub/Notify/Pub static methods directly.
export class Observable {
	//--
	//Observables wrap a value, and map it to a specific id within a context.
	constructor(value, context, id) {
		this.id = id;
		this.context = context;
		// Initialize the value in context
		if (value !== undefined) {
			context[id] = value;
		}
		// Ensure subscriber array exists
		if (!context[id + Slot.Observable]) {
			context[id + Slot.Observable] = [];
		}
	}

	get subs() {
		return this.context[this.id + Slot.Observable];
	}

	// --
	// Returns the value of this observable within the context.
	get value() {
		return this.context[this.id];
	}

	set value(value) {
		this.set(value);
	}

	get revision() {
		return this.context[this.id + Slot.Revision] || 0;
	}

	get() {
		return this.value;
	}

	set(value, force = undefined) {
		Slot.Notify(this.context, this.id, value, force);
	}

	update(dict) {
		const patch = dict instanceof Slot ? dict.get() : dict;
		const current = this.get();
		const next = isPlainObject(current) ? current : {};
		if (patch && typeof patch === "object") {
			Object.assign(next, patch);
		}
		this.set(next, true);
		return next;
	}

	touch() {
		const value = this.get();
		this.set(value, true);
		return value;
	}

	pub(value) {
		Slot.Pub(this.context, this.id, value);
	}

	sub(handler) {
		return Slot.Sub(this.context, this.id, handler);
	}

	unsub(handler) {
		return Slot.Unsub(this.context, this.id, handler);
	}
}

// TODO: A Cell is an Observable with its own context.

// EOF

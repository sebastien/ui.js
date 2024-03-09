# Approach to faster rendering


## Takeaways

- Work in a document fragment/detached when creating new nodes, as for
  a first render incremental update will kill performance (2x slower).

- Function recursion is much faster than using a stack (3x faster)

- Type switch vs `instanceof` is negligible (670/2419 vs 646/2239), so
  instanceof is better.

- Difference between method overloading vs conditional dispatch based on `instanceof`
  if negligible. It's better to use method overloading then.

- DOM node cloning does not seem to have a notable impact.

- Iterators are about 2x slower than the equivalent when building a list
  by appending to it, concatenating is 1.5x slower.

- Using Map vs Objects doesn't really make a difference.

- When using temporary key-value structures, it's better to create a global
  object, set() and then clear() at the end. This only works in an atomic,
  single-thread model but saves a lot of memory (ie. mappings).

## Thoughts

UI effects are incremental: they take the current value, and the previous
state, which typically includes the previous value, and a reference to
previously created nodes.

```
Effect.apply(value, previous, state, effector) -> state
```


Applying the effect triggers the effector, which performs operations such as
DOM node insertion, mounting or unmounting. The resulting state becomes a mapping of nodes. For instance:

```javascript
const mapping = (value, previous, state, effector, scope, template) => {
    if (state === undefined) {
        // First run
        state = new Map();
        for (const k of value) {
            const v = value[k];
            const s = template.apply([k,v], null, null, effector, scope);
            state.set(k,[[k,v], s])
        }
    } else {
        const updated = new Map();
        for (const k of value) {
            const v = value[k];
            if (state.has(k)) {
                const pv, ps = state.get(k);
                state.set(k, template.apply([k,v], pv, ps, effector, scope));
            }  else {
                state.set(k, null, null, pv, ps, effector, scope);
            }
        }
        for (const k of state) {
            if (!update.has(k)) {
                const pv, ps = state.get(k);
                template.unapply([k,undefined], pv, ps, effector, scope)
            }
        }
    }
}
```

# Approach to faster rendering


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

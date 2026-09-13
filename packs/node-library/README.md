# node-library

Gates for a published Node.js library: no committed `node_modules`, a license file, and no `console.log` in `src/`.

Declare it with:

```json
"packs": [{ "id": "node-library", "source": "dist", "version": "1.0.0" }]
```

The gates are dependency-free on purpose: a pack gate runs in someone else's repository, so its failure injection must not assume a toolchain that repository may not have. `test/pack-conformance.test.mjs` composes this pack into a fixture consumer and proves every gate fires and reverts.

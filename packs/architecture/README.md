# architecture

Structural gates that hold for any repository: generated code stays out of `src/`, and the root declares one package system.

Both are shell-only on purpose — a pack gate's failure injection runs in someone else's repository and must not assume a toolchain that repository may not have. `test/pack-conformance.test.mjs` composes this pack with `node-library` into one fixture consumer and proves every gate of both fires and reverts.

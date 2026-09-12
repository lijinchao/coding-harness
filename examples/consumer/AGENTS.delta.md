# Repository delta — payments-api

Everything above this file comes from the shared base. This file holds only what is true for this repository.

## Commands

- Build: `make build`
- Test: `make test`
- Integration test: `make itest` (needs Docker)

## Conventions

- Money is always `BigDecimal`, never `double`.
- Every new endpoint needs an integration test under `src/itest`.
- Kafka event schemas live in `schemas/`; generated classes are never edited.

## Things the agent gets wrong

- The `v1/` package is frozen; changes go in `v2/`.
- Dependency versions are owned by the platform team; do not bump them.

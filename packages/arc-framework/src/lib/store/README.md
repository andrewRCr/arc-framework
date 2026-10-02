# Operational state contract

`index.ts` exposes the internal source API for backend-independent records, mutations, saved states, and sync.
`createStore` takes one explicit port object and loads the selected backend on its first operation; construction
performs no I/O. `createDefaultStorePorts` binds production dependencies with lazy identity, remote, and lock
resolution. Every operation returns an `ok` result or a recovery-complete typed refusal. Defects and environment
failures that
cannot be classified remain thrown errors.

Owners and record references are validated opaque values. Use the constructors in `recordReferences` to name one
role and its declared key; use the reference accessors to inspect it. A UID identifies an owner generation through
renames, while record versions provide the exact compare-and-swap basis. State versions select saved snapshots;
they do not replace per-record mutation checks.

The family registry describes scope, ref ownership, retention, sync, and install assignment. Each kind adds its
writer rule, merge mechanism, projection, and independent parser slot. Parser registration returns an isolated
registry. Logical placement and code links travel beside record content, without projected paths.

The `concurrency/` library supplies pure entry and line merges, stable entry IDs, and rank keys. Conflicts preserve
both labeled sides as separate records while the current side remains visible. A resolving write names the conflict
references explicitly.

Reference backends and conformance fixtures live exclusively in test support. This module adds no package export
or standalone build entry.

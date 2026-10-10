# Architecture lint support

Module-local architecture predicates run through ESLint using its parsed TypeScript source.

Architecture bans live in the ESLint configuration as one table. Rooted directory scopes use
`**/*.{ts,tsx,cts,mts}`; exact files express narrower scopes and exceptions. Composition partitions those anchors
without enumerating current source files, so future modules receive every matching row's rules.

Two predicates are ratchets rather than fail-closed bans. `store-raw-state` keeps the raw state helpers — meta parsing,
the lifecycle indexes, state-ref tree access, the Candidate and transition record stores, the Errand record snapshot
and transaction, and the inbox writer — inside `lib/store/`, and `surface-names` keeps the literal surface names and
path fragments inside the layout resolver. Their existing violations are recorded in `eslint-suppressions.json` as a
floor, and rerouting a caller shrinks it toward zero. Suppressions are counted per file and rule rather than per site,
so each ratchet reports under its own rule ID, `arc/store-raw-state` or `arc/surface-names`, and a floor never covers
a violation of another predicate in the same file. A violation that raises a file's recorded count fails lint; one that
replaces a fixed violation of the same rule in the same file keeps the count and passes unseen, as it does for the
size limits recorded there.

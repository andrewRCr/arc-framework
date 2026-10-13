# Local lint rules

Module-local architecture predicates and the file-level doc comment check run through ESLint using its parsed
TypeScript source.

Architecture bans live in the ESLint configuration as one table. Rooted directory scopes use
`**/*.{ts,tsx,cts,mts}`; exact files express narrower scopes and exceptions. Composition partitions those anchors
without enumerating current source files, so future modules receive every matching row's rules.

Three predicates are ratchets rather than fail-closed bans. `store-raw-state` keeps the raw state helpers — meta
parsing, shared meta line reading, and kind registrations, the lifecycle indexes, state-ref tree access, the Candidate
and transition record stores, the Git transition-record enumeration, the Errand record snapshot and transaction, and the
inbox writer — inside `lib/store/`. `surface-names` keeps the literal surface names and path fragments inside the layout
resolver. `work-unit-paths` keeps layout-resolver calls for work-unit state inside `lib/store/`: work-unit artifacts,
containers, and placement roots, cohort documents, and the Candidate, integration-boundary, and transition records. A
call whose address kind the linter cannot read counts, and so does passing the resolver or a layout namespace on, or
loading the layout module by require or a dynamic import. Their existing violations are recorded in `eslint-
suppressions.json` as a floor, and rerouting a caller shrinks it toward zero. Suppressions are counted per file and rule
rather than per site, so each ratchet reports under its own rule ID, `arc/store-raw-state`, `arc/surface-names`, or
`arc/work-unit-paths`, and a floor never covers a violation of another predicate in the same file. A violation that
raises a file's recorded count fails lint; one that replaces a fixed violation of the same rule in the same file keeps
the count and passes unseen, as it does for the size limits recorded there. A ratchet counts only the sites it names: a
module that wraps a helper or the resolver passes what it reads to its own callers uncounted.

`arc/module-doc-comment` requires each `src/` module to open with a `/**` doc block describing its purpose: one among
the comments before the module's first token, after any shebang. `eslint-plugin-jsdoc`'s `require-jsdoc` covers the
exported functions; the plugin's own file-overview rule is not used because it demands an `@file` tag. A module whose
first statement carries its own doc block passes, since nothing in the comment tells the two apart. Modules and
exported functions that predate both rules are recorded in `eslint-suppressions.json` as a floor.

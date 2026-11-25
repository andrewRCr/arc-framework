# Lineage records

`schema.ts` owns the closed terminal-transition shape, work-item references, and name-based cardinality and ordering
rules. Decompositions record incoming dispositions and outgoing prerequisite redistribution; renames and abandonments
carry no incoming dispositions or outgoing list. References keep the name at the transition and an optional UID.

`index.ts` exposes schemas, `parseLineageRecord` (null on refusal), and `writeLineageRecord` (canonical creation bytes).
The writer sorts copied reference lists by UTF-8 name bytes before validating and leaves its input intact.
`parser.ts` also provides the issue-bearing decode result used by `registration.ts`, which installs the create-only
kind's content parser behind the store's raw-state boundary.

`check.ts` refuses terminal lineage creation while the origin has held inbound entries in the proposed state. It
uses the shared work-item observation and the declared inbound grammar; no declared grammar means no held-entry
obligation. Unavailable reads retain an actionable refusal, and settling entries in the same batch permits retirement.

Creating abandonment also checks the exact record owner's cut-map singleton in the batch's before-state.
`lineage.cut-in-flight` refuses a stored map, naming `arc decompose <origin> --finish` and `--discard`; unavailable
map evidence retains its condition. The rule applies independently of inbound grammar and permits other transition
kinds and existing lineage versions.

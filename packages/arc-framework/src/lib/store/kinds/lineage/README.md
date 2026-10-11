# Lineage records

`schema.ts` owns the closed terminal-transition shape, work-item references, and name-based cardinality and ordering
rules. Decompositions record incoming dispositions and outgoing prerequisite redistribution; renames and abandonments
carry no incoming dispositions or outgoing list. References keep the name at the transition and an optional UID.

`index.ts` exposes schemas, `parseLineageRecord` (null on refusal), and `writeLineageRecord` (canonical creation bytes).
The writer sorts copied reference lists by UTF-8 name bytes before validating and leaves its input intact.
`parser.ts` also provides the issue-bearing decode result used by `registration.ts`, which installs the create-only
kind's content parser behind the store's raw-state boundary.

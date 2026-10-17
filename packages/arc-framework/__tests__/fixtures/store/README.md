# Ref-store process fixtures

`ref-process-writer.ts` runs the public ref-store factory in an independent Node process against a shared checkout.
`ref-process-protocol.ts` validates its input and results. The integration helper starts each writer and releases its
readiness barrier, allowing tests to coordinate real lock contention and lifecycle transitions.

`fetch-porcelain.json` records unmodified stdout, stderr, arguments, and exit codes from Git 2.55 fetching between
local bare repositories. The six scenarios cover creation, verbose up-to-date reporting, fast-forward, non-fast-forward
refusal, forced replacement, and pruning. Each scenario runs with an empty refmap to suppress configured tracking
updates; deterministic empty-tree commits fix the object IDs.

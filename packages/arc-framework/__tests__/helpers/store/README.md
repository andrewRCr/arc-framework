# Store conformance support

`registerStoreConformanceSuite` registers sixteen contract items against a fresh fixture for each assertion. Fixtures
declare served families, substrate and saved-state coverage, merge behavior, publish families, and named exclusions.
Excluded items, assertions, and refusal scenarios appear as skips with their reasons, including items that register no
family assertions. Registration rejects per-assertion declarations that are unused or hidden by a whole-item exclusion.

Drive a backend through `ConformanceFixture`: `content` supplies valid records and distinct edits; `settle`, `reopen`,
and `race` expose persistence and concurrency; `plant`, `hold`, `identity`, and the remote hooks produce real boundary
conditions. `produce` and `repair` retain the original operation so refusal recovery proves a successful retry.

The reference fixture serves every registered kind in memory with isolated parser slots, saved record snapshots,
provenance history, and an independently writable remote. Its registry mechanisms select the production pure merge
functions. Backend implementation files remain under test support and never become a production dependency.

The in-repo fixture runs tracked files, personal files, and transient identity records through the public factory over
real temporary Git clones and a bare origin. Content hooks use the transient record schema and serializer; personal
files accept arbitrary bytes. Faults bind to actual paths or ref blobs, notes locks use the real identity lock, and remote
hooks move the origin away, advance its ref, or install a receive hook. Recovery repairs those conditions before retrying
the retained operation. The fixture clock declares four contended sync attempts and exactly 30 milliseconds elapsed.

Personal and transient records sit outside branch state versions. Personal files have no history; transient history
returns ref commit messages. Neither substrate persists batch IDs in an observable history. Named sync exclusions retain
the existing producers: notes saves and Errand pushes can report `pushed` repeatedly, unequal same-key transient entries
conflict, and reconciled notes do not refresh personal working files. Direct remote tests verify those outcomes, distinct
transient entry reconciliation, both merged notes manifests, and publication of every served personal and transient role.

The import guard scans production source for references to this directory. After `npm run build`, the build guard checks
the raw bundle metafile and every output's input attribution. Planted import and metafile fixtures prove both guards
reject a test-backend dependency.

# Store conformance support

`registerStoreConformanceSuite` registers sixteen contract items against a fresh fixture for each assertion. Fixtures
declare served families, substrate and saved-state coverage, merge behavior, publish families, and named exclusions.
Excluded items, assertions, and refusal scenarios appear as skips with their reasons.

Drive a backend through `ConformanceFixture`: `content` supplies valid records and distinct edits; `settle`, `reopen`,
and `race` expose persistence and concurrency; `plant`, `hold`, `identity`, and the remote hooks produce real boundary
conditions. `produce` and `repair` retain the original operation so refusal recovery proves a successful retry.

The reference fixture serves every registered kind in memory with isolated parser slots, saved record snapshots,
provenance history, and an independently writable remote. Its registry mechanisms select the production pure merge
functions. Backend implementation files remain under test support and never become a production dependency.

The import guard scans production source for references to this directory. After `npm run build`, the build guard checks
the raw bundle metafile and every output's input attribution. Planted import and metafile fixtures prove both guards
reject a test-backend dependency.

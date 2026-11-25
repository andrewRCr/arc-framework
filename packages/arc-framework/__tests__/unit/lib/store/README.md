# Store contract tests

The core suites verify reference construction, strict record and mutation schemas, lifecycle placement, refusal
classes, sync completeness, and the registry's ownership and projection invariants. Constructor misuse also has
compile-time coverage.

The `concurrency/` suites exercise pure merge behavior and ordering properties. Reference-backend suites register
the shared conformance assertions through test-only fixtures; production code never imports those fixtures.

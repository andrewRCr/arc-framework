# Ref-store process fixtures

`ref-process-writer.ts` runs the public ref-store factory in an independent Node process against a shared checkout.
`ref-process-protocol.ts` validates its input and results. The integration helper starts each writer and releases its
readiness barrier, allowing tests to coordinate real lock contention and lifecycle transitions.

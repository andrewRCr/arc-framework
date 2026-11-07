# Type-check helper tests

These unit tests cover compiler resolution, literal process plans, memory targets and inherited limits, executable
identity during RSS sampling, shard discovery and partition comparison, and terminal compiler and ESLint reports.
Process-result fakes exercise continuation and status behavior without starting child processes.

`shard-coverage.test.ts` parses the installed configs with TypeScript 6's config parser, without constructing a
compiler program. It checks that every test root belongs to exactly one shard and that their compiler options match
the whole test program apart from explicit declaration and incremental-state differences and parser config paths.

Run this directory from the repository root with
`npm run test:file -- packages/arc-framework/__tests__/unit/scripts/typecheck`.

---

# Type-check and typed lint processes

`run.ts` dispatches source checking, sequential test shards, and typed linting from the package root. Compiler
resolution in `compiler.ts` uses the installed TypeScript 7 alias and its native platform package independently of
npm's shared bin links. `shards.ts` discovers shard configs and compares their parsed roots and options.

`memory-bound.ts` derives the Go soft target and Linux address-space backstop, preserving lower inherited limits.
`processes.ts` constructs literal invocations and retains child exit or signal status. `peak.ts` samples Linux RSS
only while the child is the intended executable, then formats terminal observations and advisory split cues.

`lint.ts` runs the package's ESLint directly through the current Node. Its `heap-report.ts` preload writes terminal
V8 heap observations to a unique report file, which the parent reads and removes after the child closes.

---

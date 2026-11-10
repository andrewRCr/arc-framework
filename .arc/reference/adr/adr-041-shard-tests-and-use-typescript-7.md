# ADR-041: Shard test checking and use TypeScript 7

## Status

Accepted (2026-11-06)

## Context

The repository's test program has outgrown a single compiler process's practical memory envelope. Increasing its
heap delays the next failure as the suite grows. Test files are checked without emission, while source declarations
are already checked by the source type check and the declaration build.

TypeScript 7's native compiler substantially reduces elapsed time, but changing engines alone does not bound peak
memory. Its Go heap also ignores a runner's V8 heap setting. TypeScript 6 remains necessary for compiler-API users,
typescript-eslint and the declaration build, so replacing that dependency would cross unrelated tooling boundaries.

Checking tests against emitted source declarations would avoid repeatedly checking source, but inferred schema
declarations are currently larger than the source they would replace. Emitting them now increases the cost.

## Decision

Split test roots into independently checked programs and run them sequentially through one script. Each shard checks
the source modules its roots import. The source type check remains one separate program and checks all source and
examples, including files no test imports, with its stricter unused-code options. Run every shard after a failure so
one invocation still reports every error, retaining the first failure status. Repeated source diagnostics are accepted.

Keep `tsconfig.test.json` as the shared options base, whole-program reference and ESLint parser project. Shards drop
only declaration and declaration-map checking: tests are never emitted, and the source type check and full build
retain declaration diagnostics. Parallel shard execution is rejected because its aggregate memory defeats the bound.

Use the explicitly resolved `typescript-7` npm alias for both type checks, beside the retained `typescript` 6 package
for tooling. Run the alias's own launcher, independent of npm's shared `tsc` bin link. Use one native checker because
extra checkers increase memory without a useful speed improvement on the measured programs. Keeping TypeScript 6 as
the type-check engine would retain the same partition but give up the measured native compiler's speed improvement.

Own the compiler's memory target in the script. Set `GOMEMLIMIT` independently of inherited runner heap settings,
using a 6000 MiB default envelope or a lower Linux job cgroup bound less 512 MiB for the controller and non-Go
memory. The default preserves the former compiler envelope without shaping healthy shard runs. Add a Linux
address-space backstop above the soft target, with a margin measured from native address-space
overhead, while preserving any lower inherited limit. A cgroup kill alone gives Go no target for earlier collection;
a V8 heap pin does not constrain the native compiler at all. The soft target alone can be exceeded, so it needs the
backstop. Platforms without Linux cgroup and address-space support retain the soft target and one checker.

Keep typed linting as one ESLint process over the existing paths. It builds the source program, so test sharding does
not reduce its type-aware lint cost. Retain typescript-eslint, the typed and custom rules, and the suppressions
baseline rather than adopting another linter and changing those contracts. The same script reports its memory, while
ESLint retains its own exit status and suppression-pruning behavior.

Preserve a forward path to checking tests against compact source declarations. Once those declarations are smaller,
add a composite source project that emits declarations only, an explicit project reference in every shard, and a
prebuild before checking tests. Referenced projects cannot disable emission, `extends` does not inherit references,
and a plain project check cannot consume declarations that have not been built. The test partition remains usable.

Accept TypeScript 7 as the sole compiler verdict for these checks after one-time landing parity qualification against
TypeScript 6, including planted TypeScript and `checkJs` errors. Retaining a permanent TypeScript 6 shadow test check
would restore the expensive program this decision removes. A diagnostic class TypeScript 7 misses can therefore go
unseen after landing; the one-time comparison establishes observed parity, not perpetual compiler equivalence.

## Consequences

- Each shard has a smaller peak and can be split further as the suite grows. Native checking reduces elapsed time,
  offsetting the extra work of checking imported source independently in several programs.
- Keeping TypeScript 6 for tooling avoids migrating compiler APIs, declaration generation and typed linting with the
  type-check engine. The additional native platform packages extend the installed dependency trust surface.
- Healthy compiler runs remain below a generous memory envelope. The soft target encourages collection; Linux's
  backstop ends an overrun. A tighter job cgroup can stop the whole controller before it reports an individual peak.
- Source growth still affects the single source check and typed lint process. Their ceilings need separate attention;
  splitting the tests does not solve that growth.
- Compact declarations can later remove duplicated source checking without replacing the test partition. Until then,
  repeated checking and repeated source diagnostics are the accepted cost of bounded test processes.
- TypeScript 7's future diagnostic omissions remain an accepted residual. Tooling's continued use of TypeScript 6
  supplies no second compiler verdict over the tests.

---

# Draft: Compact Schema Declarations

- **Purpose:** Give exported zod schemas explicit types so the declarations emitted for `src` stay compact enough for
  type-check programs to consume `src` as a referenced project.
- **Origin:** routed from `USER-INBOX § Work Unit` at housekeep drain (2026-11-05); captured during
  `test-typecheck-heap` draft-design (2026-11-05), as its own work unit (Owner).

---

## Problem

Emitting `src` declarations produces 612k lines (35 MB) from 346k source lines, and zod-importing declarations are
540k of them. `src` exports 1,045 `*Schema` consts; 6 carry an explicit type.

- `src/scripts/review-gate/status.d.ts` is 238,705 lines from 1,662: 22 internal status-variant schemas each spread
  `ReviewStatusBaseShape` and so inline the ~10k-line `RoutedReviewObligationSchema` type.
- `src/lib/locus/derived-schema.d.ts` is 40,546 lines from 81.

Measured on 2026-11-05: the declaration pass costs `typecheck` 0.41 GB (2.35 against 1.94 GB); checking the tests
against these declarations runs out of memory (about 4.6 GiB, worse than against source); with compact declarations
(a zod-stubbed proxy, 83k lines) the tests check in 2.84 GB against 3.28 GB from source.

Compact declarations are the prerequisite for type-check programs consuming `src` as a referenced project, the only
lever on the `src` floor every source-based shard pays, which grew about 0.24 GiB a week over 10-20 to 11-04.

## Approach

Settle first whether it can land module by module against a gauge, such as per-file declaration line count or a
declaration-size check. The technique must handle schemas composed by spread or `.extend`, which need their exact
`ZodObject` type rather than `ZodType<T>`. Pilot candidate: `src/scripts/review-gate/status.ts`, the largest reading
(39% of all declaration lines) and unchanged on every in-flight branch as of 2026-11-05.

## Sequencing

P1 (Owner, 2026-11-05), runway late January to mid-February (project-manager.ARC). Begin after `test-typecheck-heap`
lands, in modules the storage chain is not touching; storage modules after the cutover's deletion follow-ons;
re-measure at the flip. Its pilot and the non-storage modules can go to a Codex session once designed.
`test-typecheck-heap`'s landing ceilings keep heap headroom until this lands.

## Evidence

`~/dev/arc-evidence/test-typecheck-heap/results/SUMMARY.md` on this machine.

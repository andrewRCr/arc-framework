# Draft: Compact Schema Declarations

- **Purpose:** Give exported zod schemas explicit types so the declarations emitted for `src` stay compact enough for
  type-check programs to consume `src` as a referenced project.
- **Origin:** routed from `USER-INBOX § Work Unit` at housekeep drain (2026-11-05); captured during
  `test-typecheck-heap` draft-design (2026-11-05), as its own work unit (Owner).

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Correct the figures `compact-schema-declarations`' draft carried over before their correction**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-10).

- _Shapes:_ § Problem — the measured figures, and the `src`-floor rate given as the reason for P1.

- _Observation:_ the draft on `main` (`a2e478eb59`) repeats three figures from `draft-test-typecheck-heap.md` that
  its adversarial review corrected on 2026-11-05:
    - "612k lines (35 MB)": the emitted declarations total 29.5 MB; 35 MB is their size on disk.
    - "about 4.6 GiB" for the tests checked against `src` declarations: that run ran out of memory at 4.81 GiB RSS
      (5,046,272 KiB in `e6b-test-ref-cold-local.txt`).
    - "the `src` floor every source-based shard pays, which grew about 0.24 GiB a week": 0.24 is `typecheck`'s rate,
      declaration pass included. The shards drop that pass; over the same fortnight they grew 0.06 (e2e) to 0.15
      (unit) GiB a week, their own tests included.

- _Approach:_ correct the three against `test-typecheck-heap`'s measurement summary and its raw results, kept outside
  the repository. The third changes the stated reason: the declaration pass costs `typecheck` 0.38 GiB of end-of-run
  heap (2.19 against 1.81 GiB), while the shards' `src` share grows more slowly than 0.24 a week.

- _Captured during:_ `test-typecheck-heap` draft-design, adversarial review pass 2, 2026-11-05 (Owner-approved;
  the target has no checkout, so no session to message).

### `[ ]` **Re-date `compact-schema-declarations`' need from `test-typecheck-heap`'s landed peaks**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-10).

- _Shapes:_ § Sequencing — the need date and the reason for P1.

- _Observation:_ `test-typecheck-heap` landed on 2026-11-06 (#1291): five test shards on TS 7, each process printing
  its peak, and a shard split when its peak reaches the 2,765 MiB cue (ADR-041). Cold on `m4-mini` at landing:
  `typecheck` 1,931 MiB; the shards 1,189–2,028 MiB; `lint:ts`, one TS 6 process over the `src` program, 3,697 MiB RSS
  under a 4,192 MiB heap. Test growth is now absorbed by splitting, so the shards' test share no longer sets this
  unit's need, which the draft dates before the finer shards reach 6144 MiB, late January to mid-February. What
  remains is `src`'s growth, paid by the source check, typed lint and every shard's floor (the smallest shard, 1,189
  MiB, bounds that floor from above). The nearest ceiling is `lint:ts`: it passed at a 3,072 MiB heap on 11-05 against
  CI's 4096 MiB, at least about four weeks at `typecheck`'s 0.24 GiB a week (an upper, TS 6 rate), and the landed spec
  names a larger heap as its first remedy. The native source check (1.9 GiB against 6000 MiB) has months. TS 7's
  growth is unmeasured.

- _Approach:_ re-date the need from CI's TS 7 peak lines, first read at `projection-write-back`'s landing
  (`project-manager.ARC`): the shards' `src` floor against the 3 GiB target, and typed lint's heap. If that reading
  holds, P1 → P2 (PM recommendation; the Owner agreed on 2026-11-06, conditional on that reading), the design after
  the storage chain's crunch rather than right after `test-typecheck-heap`. No work unit depends on this one.

- _Captured during:_ `project-manager.ARC`, the at-landing re-read of `test-typecheck-heap`, 2026-11-06
  (Owner-approved; the target has no checkout, so no session to message).

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

`test-typecheck-heap`'s measurement summary, `results/SUMMARY.md`, kept outside the repository.

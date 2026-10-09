# Notes: Quality Gates and Hook Integration

## Per-increment check time (SC17)

SC17's before-and-after measurements are recorded here, each with its method.

**Earlier measurement (2026-07-25).** The QUICK-REFERENCE measured-cost table, recorded in `046272788`, gives warm-cache
wall time per check over the full project and targeted:

| Check                   | Full project | Targeted                                    |
| ----------------------- | ------------ | ------------------------------------------- |
| `lint:md`               | 6.9s         | 0.25s — `lint:md:file`, per file            |
| `lint:ts`               | 21.4s        | 2.1s one file · 9.1s one directory          |
| `lint:sh`               | 1.0s         | not narrowable (fixed hook/script set)      |
| `lint:arc:triggers`     | 0.27s        | corpus-wide by design; already cheap        |
| `lint:arc:domain-rules` | 0.23s        | corpus-wide by design; already cheap        |
| `lint:arc:section-refs` | 0.22s        | corpus-wide by design; already cheap        |
| `typecheck`             | 4.2s         | not narrowable (whole-program)              |
| `typecheck:test`        | 7.3s         | not narrowable (whole-program)              |
| `test:unit`             | 24.2s        | 1.1s — filename filter                      |
| `test:arc-contracts`    | 0.9s         | subset of `test`; a Tier 1 targeting handle |
| `test` (7,524)          | 67.0s        | narrow via `test:unit` or a per-tier script |
| `build`                 | 5.7s         | not narrowable                              |

The Tier 1 block then documented was per-file Markdown lint, `lint:ts`, `lint:sh`, and `test:unit`. The last three are
full-project scans, about 47s per task. Of 200 sampled commits, 64 were Markdown-only. Targeting the same coverage
brought a Markdown-only task to about 1s: per-file Markdown lint plus the ARC contract checks (about 0.7s combined).

SC17 takes its own baseline when implementation starts, so this measurement is context, not that baseline.

## Buffer triage

The 30 entries routed in before design were triaged on 2026-10-07 against `c009ab198`, each verdict spot-checked
against the tree. Route-outs went to `USER-INBOX` captures, each with `WU_Target` and `_Shapes:_`.

- **Folded into the design (6):** a CLI-resolved gate invocation (D3); local and CI gate parity (D9); the two-copy sync
  blind spot in selection (D4, D11); message-only content-gate caching (D5); the add → format → re-stage loop, with the
  auto-fix residual of Markdown-formatting enforcement (D7); ownership after repository Markdown enforcement shipped
  (D7).
- **Dismissed, resolved elsewhere (5):**
    - raw Git rename and copy statuses (`fcd311a85`; an Errand covers the missing test);
    - the worktree Markdown gate's untracked-file blindness (`df272224c`);
    - no markdownlint in the pre-commit hook (`lint:md:staged` in `.husky/pre-commit`);
    - Markdown-formatting enforcement (MD060 in `lint:md`);
    - large blobs crashing pre-commit validators (`872b1e8e0`; an Errand covers three scripts' local 32 MiB limit).
- **Storage-tied, held for the storage owners (5):** locking a completed task's identifier; dev-repo-only `npx tsx`
  hook delegations; commit-message range validation in CI; a TTY-confirm escalation for the force-push advisory; the
  unguarded flat `active/` layout.
- **Another work unit's charter (7):** the Markdown `§` citation and cross-file anchor checkers (`knowledge-lint`);
  destructive-lifecycle E2E and seam-assertion guards (a Work Unit capture); the four test-cost benchmark entries
  (Errands or a `test-suite-reliability` follow-up).
- **Errand-shaped (7):** fail closed on an unprovisioned hooks path; a false green on an excluded lint path; runtime
  examples versus meta-project references in code; integrity verification for mode-scoped installs; an exported-surface
  TSDoc lint rule; an actionlint gate; cognitive versus cyclomatic complexity. A changed-file Markdown under-wrap
  detector joined them as a new check.
- **Removed from scope (1):** the gate-coverage audit (`arc check-gates`) went to a provisional follow-on stub. Parity
  by construction (D9) removes the drift it targeted.

## Coordination

- **Editor-document publication** (D2's prerequisite) landed through `schema-introspection-layer`, on the base branch
  at `38597e53a`; `check-declaration` is the first production type to take its marker (Task 1.3.d).
- **CI layout** (§ Prerequisites) landed through `test-suite-reliability`, on the base branch at `e9ce523a3`.
- **Configuration home** under other install profiles (D2, D12 invariant 4) follows `config-storage-architecture`,
  whose CLI side can move `arc-config.yml`'s reader onto D2's typed read.
- **State storage.** D12's invariants meet `spec-storage-contract.md`'s ref layout (D10), sync and push (D12), task
  close (D16), branchless planning (D17), and ghost mode with the surface boundary (D19). Three holds went to
  `storage-seam`:
    - a failed push gate reads to the push loop as a code-leg failure;
    - the per-worktree reuse record joins the machine-local set;
    - the stored `verificationKind: "tier-3"` value is renamed when its record is next reshaped.
- **`markdown-formatting`** (shipped) handed commit-time auto-fix and restage to this work (D7).

## Sizing and landing

The mechanics slice (declaration through hooks) is roughly 8–12 of the 13–20 days. Activation decides whether it takes
an implementation slot beside the storage program's Stage 2. The work lands single-branch with chunked review, by Owner
direction (2026-10-07), following the landing rule the storage program sets for its own members
(`cohort-state-storage.md` § Soft coordination).

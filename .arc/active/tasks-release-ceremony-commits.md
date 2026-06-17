# Task List: Release Ceremony Commits

- **Design:** `spec-release-ceremony-commits.md`

---

## **Phase 1:** Accept no-active-WU ceremony invocations in the release wrappers

_Purpose:_ Split the work-unit resolver's single refusal into a zero-candidate (accept) versus multi-candidate
(refuse) outcome, then teach both release handlers to proceed on zero candidates — recording a null work unit in
the audit — while still refusing genuine ambiguity. This phase delivers the spec's single success signal.

### `[ ]` **1.1 Distinguish zero-candidate from multi-candidate in the WU resolver**

- _Goal:_ `resolveActiveWu` reports a no-active-WU result distinctly from a multi-candidate ambiguity, so the
  handlers can accept the former and refuse the latter.
- _Approach:_ replace the single `{status: "refused"}` outcome in `wu-resolution.ts` with two — a zero-candidate
  result and a multi-candidate (ambiguous) result carrying the existing disambiguation hint; the `resolved`
  outcome is unchanged. Keep this change at the type + resolver level; handler consumption is task 1.2.

    Build `test-first` (one behavior at a time):
    - 0 candidates → the zero-candidate outcome (no hint)
    - 2+ candidates → the ambiguous outcome, carrying the multi-candidate hint
    - 1 candidate → `resolved` with parsed `path` and `name` (unchanged)

### `[ ]` **1.2 Accept the zero-candidate case in the commit and push handlers**

- _Goal:_ `arc release commit` and `arc release push` proceed on a no-active-WU context — validating the
  interlock and writing an audit entry with a null work unit — and still refuse with code 10 on multi-candidate
  ambiguity; single-active-WU behavior is unchanged.
- _Context:_ both handlers already pass `wu: null` to the audit on their refuse paths, and the audit entry type
  is `AuditWorkUnit | null`, so the accept path records null provenance with no audit-shape change.

    - `[ ]` **1.2.a Wire the resolver outcomes through `commit.ts`**
        - On the ambiguous outcome, refuse code 10 (`no-active-wu`) as today; on the zero-candidate outcome,
          proceed with a null audit work unit into the existing branch-protection → interlock → `spawnGit` →
          audit cascade.
        - Build `test-first` (one behavior at a time): zero-candidate → proceeds (interlock validated, audit
          written with a null work unit, git exit code bubbled); multi-candidate → refuses code 10; single
          resolved → unchanged.

    - `[ ]` **1.2.b Mirror the change in `push.ts`**
        - Apply the same outcome-branching at the push refusal site; the push leg keys off the resolver outcome
          only (it has no commit message), so the accept path is symmetric with commit.
        - Build `test-first` (one behavior at a time): zero-candidate → proceeds; multi-candidate → refuses
          code 10; single resolved → unchanged.

## **Phase 2:** Verification

### `[ ]` **2.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` `arc release commit` and `arc release push` proceed on a no-active-WU context, writing an audit entry
  with a null work unit
- `[ ]` Both wrappers still refuse with code 10 when two or more active metas resolve
- `[ ]` Single-active-WU behavior is unchanged
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md

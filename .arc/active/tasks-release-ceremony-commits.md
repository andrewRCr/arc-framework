# Task List: Release Ceremony Commits

- **Design:** `spec-release-ceremony-commits.md`

---

## **Phase 1:** Accept no-active-WU ceremony invocations in the release wrappers

_Purpose:_ Split the work-unit resolver's single refusal into a zero-candidate (accept) versus multi-candidate
(refuse) outcome, then teach both release handlers to proceed on zero candidates — recording a null work unit in
the audit — while still refusing genuine ambiguity. This phase delivers the spec's single success signal.

### `[x]` **1.1 Distinguish zero-candidate from multi-candidate in the WU resolver**

- _Goal:_ `resolveActiveWu` reports a no-active-WU result distinctly from a multi-candidate ambiguity, so the
  handlers can accept the former and refuse the latter.
- _Outcome:_ `WuResolution` in `wu-resolution.ts` now has three arms — `resolved`, `none` (zero-candidate), and
  `ambiguous` (carries the disambiguation hint). Refusal code 10's identifier renamed `no-active-wu` →
  `ambiguous-active-wu` across `release/types.ts` (`RefusalIdentifier`, `REFUSAL_IDENTIFIERS`, the code-10
  `AuthorizationDecision` arm) and `formatRefusal` in `interlock-validation.ts` (message now names the
  ambiguity); numeric code unchanged.

### `[x]` **1.2 Accept the zero-candidate case in the commit and push handlers**

- _Goal:_ `arc release commit` and `arc release push` proceed on a no-active-WU context — validating the
  interlock and writing an audit entry with a null work unit — and still refuse with code 10 on multi-candidate
  ambiguity; single-active-WU behavior is unchanged.

    - `[x]` **1.2.a Wire the resolver outcomes through `commit.ts`**
        - `ambiguous` → refuse code 10 (`ambiguous-active-wu`); `none`/`resolved` → proceed, with the audit work
          unit null on `none` (`wu.status === "resolved" ? toAuditWorkUnit(wu) : null`). The accept clears gate
          10 but the cascade still runs, so branch-protection (13) keeps no-active-WU commits on the protected
          base refused — acceptance reachable only off-base.

    - `[x]` **1.2.b Mirror the change in `push.ts`**
        - Same outcome-branching at the push refusal site, symmetric with commit (null audit work unit on
          `none`, ambiguity refuses 10, cascade caveat identical).

- _Outcome:_ both handlers accept the zero-candidate ceremony-invocation path off-base; verified by handler unit
  tests covering off-base-proceeds, on-base-refuses-13, multi-candidate-refuses-10, and single-resolved-unchanged.
  Implemented as a single increment with 1.1 (resolver type + handler call sites are mutually dependent — the
  intermediate state is uncompilable).

## **Phase 2:** Verification

### `[x]` **2.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

- _Quality gates:_ `npm run -s lint:md`, `npm run lint:ts`, `npm run lint:sh`, `npm run typecheck:all`,
  `npm test`, and `npm run build` passed.
- _Success criteria:_ 5 criteria met; ready for integration.

---

## Success Criteria

- `[x]` `arc release commit` and `arc release push` proceed on a no-active-WU context, writing an audit entry
  with a null work unit
- `[x]` Both wrappers still refuse with code 10 when two or more active metas resolve
- `[x]` Single-active-WU behavior is unchanged
- `[x]` All quality gates pass (tests, linting, type checking)
- `[x]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md

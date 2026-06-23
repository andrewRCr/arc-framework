# Notes: lifecycle-closeout

## Contents

- Grounded surface inventory (create-spec audit)
- Verb surface-inventory bucketing
- Code residual surfaces (W1, W2, W4) + W3 verify pointers
- Resolver API (W2 / A4 grounding)
- Verify-landed checklist

---

## Grounded surface inventory (create-spec audit)

Line numbers are point-in-time (audit against HEAD `b08ccd08`); re-confirm at execution. Every `.arc/` doc edit
has a byte-identical `packages/arc-framework/arc/` mirror twin that must be edited in lockstep unless noted.

### A1 — verb rename / register

- Rename `graduate-work-unit.md → promote-work-unit.md` (both copies). Title `# Workflow: Graduate Work Unit` →
  `Promote Work Unit`. Link-ref consumers to repoint: `init-work-unit.md` (one `[graduate-work-unit]` label use +
  its `:` definition); `strategy-work-organization.md` (two label uses + the `:` definition).
- Circular self-definitions to delete: in `strategy-work-organization.md` (`"Graduation" names a readiness-ladder
  promotion …`) and `graduate-work-unit.md` (`"Graduation" names this readiness-ladder promotion — and only it.`).
- `graduat*` rewrite hits cluster in `graduate-work-unit.md` + `init-work-unit.md` (Path A / "Graduate Backlog
  Subdir" headings); scattered in `activate-work-unit.md` ("graduated to PRD"), `resume-work-unit.md`,
  `park-work-unit.md` ("reverses its graduate"), `draft-design.md`, `create-spec.md` ("graduate to `active/`").
- Additional **live durable** surfaces found at the generate-tasks grounding pass (beyond the original cluster),
  all in-scope: `classify-work-unit.md`, `template-draft.md`, `strategy-team-coordination.md`,
  `strategy-session-operations.md`, `STRATEGY-INDEX.md`, and the `arc-inbox` skill (1 hit each). `commit-footer.md`'s
  only hit is the `(graduation)` footer category — handled by Task 3.4 (ceremony-footer consistency fix → fold to
  `(maintenance)`; the fuller reconciliation is `naming-conventions`'), **not** this prose sweep. **Exempt** as
  point-in-time historical records: `adr-019` and the `reference/supplemental/research|analysis/*` snapshots.
- KEEP "readiness ladder" (the concept): `strategy-work-organization.md` § Readiness ladder; `init-work-unit.md`
  "readiness-ladder path". False positives to leave untouched: "graduated lookup" (`session-init.md` /
  `session-handoff.md`); the release-wrapper "confidence ladder"; `draft-* → notes-*` content-promotion colloquial.
- `demote` ships (`arc demote`, `planned → provisional`) — surface as `promote`'s inverse in `promote-work-unit.md`
  and the command catalog (no standalone ceremony).
- Session-init register parity: `session-init.md` discovery arm ("Propose next steps" + the full-protection note)
  and `session-init.template.md` (both `arc:if` arms — arc-in-git + non-git). Contributor variant is NOT a target
  (no discovery arm). Cosmetic: `decompose-work-unit.md` "activates each member", `activate-work-unit.md`
  "graduated to PRD".
- Cohort doc `cohort-lifecycle-state-machine.md`: phantom `idiomatic-alignment` references (register check
  re-homed into this WU), a `graduate-not-scaffold` usage, and a "multi-increment errand" → "extended errand"
  stale framing; refresh the `lifecycle-closeout` member entry to include the wiring scope. Keep the
  `graduation-cleanup` companion-WU reference (proper noun, not the retired verb).

### A2 — no meta-less draft

- Real contradiction to fix: `strategy-work-organization.md` § Partially Protected ("no planning branch or meta
  yet" — ties meta-lessness to partial protection).
- Sharpen (temporal, not a contradiction): `draft-design.md` (two spots — pre-WU base drafting "no meta yet"; make
  the "minted at `init`" sense explicit). The draft's originally-named clause is already gone. Leave
  errand-no-meta language alone.

### A3 — reopen ceremony

- Author `reopen-work-unit.md` (own file; inverse of `integrate-work-unit.md`; own-file precedent
  `deactivate-work-unit.md`). Drives `arc reopen [--keep-pr]`. Add the `integrate-work-unit.md` → reopen inverse
  back-link (absent today).

### A4 — resolver discoverability

- Absent from: QUICK-REFERENCE § ARC CLI Commands, DEV-RULES.ARC § Verification and Discovery, all strategies.
- Add: the QUICK-REFERENCE catalog entry; the DEV-RULES.ARC always-loaded rule (terse — always-loaded budget).

### A5 — inbox-drain prose (sweep after W1)

- `run-errand.md` Complete; `drain-inbox.md`; `init-work-unit.md` Promote path; `DEV-RULES.ARC` § Discovered Work
  Routing ("removed at completion (slug-matched)"); + the `lib/errand/close.ts` module-doc comment.

### A6 — strategy-work-organization additions + adjacent fold-in

- Add to `strategy-work-organization.md`: the `(phase, location)` model + `Active`/`active` disambiguation
  (§ Work Unit State); the derived-state vocabulary + the **Parked** render bucket + interim hand-render discipline
  (§ ROADMAP render / STATUS.USER — Parked is ABSENT today, an addition, not a verify); the `stub` required-fields
  policy statement; the protection-mode ship-layer framing (§ Branch Protection Modes).
- Fold in: `strategy-work-planning.md` and `strategy-planning-module.md` (graduation-pipeline vocabulary).
- `arc errand cut` removal (deregister, full — settled at generate-tasks grounding). The standalone command is
  `cli.ts:269` (`.command("cut <slug>")` → `handleErrandCut`); `handleErrandCut` + its `cutErrandBranch` import
  are in `handlers/errand.ts` (L118 / L21). The internal `cutErrandBranch`
  (`lib/session-init/errand-branch-cut.ts`) **stays** — composed by `openErrand` (`open.ts:67`). Reframe
  `strategy-work-organization.md` § The cut→occupy invariant (~L1289, both copies) around `open`'s composed cut;
  drop `handleErrandCut` test coverage, keep `cutErrandBranch`'s. Out of scope: the `review-method-family` draft's
  colloquial "errand cut" (another WU's planning artifact).

## Verb surface-inventory bucketing

Place each verb at its narrowest serving locus — don't blanket-propagate.

- **Always-loaded (DEV-RULES.ARC):** `arc status <slug>` only.
- **On-demand catalog (QUICK-REFERENCE § ARC CLI Commands):** start, park, resume, activate / deactivate,
  promote / demote, reopen, abandon, archive, stub, decompose, teardown, errand open / close / promote / retire,
  status <slug>, plan check. (The section carries zero lifecycle verbs today — all additions.)
- **Strategy canon (deep-dive):** the full set + model vocabulary, incl. set-stage / repoint-design, the
  `(phase, location)` model, the derived-state names, `Current Workflow` / the `[begin current workflow]` sentinel.
- **Workflow-trigger-only (neither DEV-RULES nor QUICK-REFERENCE):** set-stage, repoint-design.

## Code residual surfaces

### W1 — errand provenance producer-leg (confirmed universally dead)

- Consumer ships: `lib/errand/record.ts` (`origin: "description" | "inbox"`, `originEntry?`, with an enforced
  deserialize contract that `inbox` ⇔ `originEntry` present); `handlers/errand.ts` drains the capture off
  `record.originEntry` at close.
- Gap: `lib/errand/open.ts` `openErrand` hardcodes `origin: "description"` with no `originEntry` param; the
  `arc errand open` CLI (`handlers/errand.ts` `ErrandOpenOptions`) accepts only `--type` / `--intent`.
- Fix: add an `originEntry` param to `OpenErrandParams`; mint `origin` from its presence; add the producer flag
  (`--from-inbox <entry-slug>` vs. an `arc errand adopt` seam — open question); thread the four adoption call-sites
  (`drain-inbox`, `run-errand` Launch, the `arc-errand` skill, `session-init.template.md`'s bare
  `arc errand open <slug>`). No close-side or schema work.

### W2 — single rewire

- `integrate-work-unit.md` entry-mode dispatch hand-reads meta `**State:**` → rewire to `arc status <slug> --json`
  (the resolver enum distinguishes `integrating` from `active`). LEAVE: session-init `sessionType` (probe-resolved),
  the multiple-candidate disambiguation tiebreaker, and the precondition-gate `**State:**` checks (each verb
  re-guards). The PR-state resolution (`gh pr view`) stays — out of resolver scope.

### W4 — {NN}b nested archival cascade

- `archive.ts` ships the `{NN}a` cohort-sidecar cascade but no nested-parent `{NN}b`. Live nested cohort that will
  exercise it: `concurrent-work-conventions` (under `agile-parallelism`). Build `{NN}b` into the archive sweep.

### W3 — already shipped (verify only)

- Commit `808213c6`: `abandon` routes teardown out-of-band (`lib/work-unit/verbs/abandon.ts` — only `parked`
  deletes a branch in-verb; started states get set-phase + remove disposition; the handler surfaces
  `arc teardown --force`). The `deactivate-work-unit.md` ceremony is already migrated. Residual: verify no in-verb
  abandon-teardown prose survives, and drain the routed `decompose-matrix` `USER-INBOX` follow-up (slug-matched, on
  completion).

## Resolver API (W2 / A4 grounding)

- `arc status <slug> [--json]` (`cli.ts`) → `resolveSlugQuery` (`lib/work-unit/lifecycle-query.ts`): returns
  `position` (phase, location), `state` enum (`nonexistent` / `provisional` / `planned` / `planning` / `active` /
  `integrating` / `parked` / `shipped`), `occupied`, `shipped`, `dependsOn[]` (`{slug, landed}`).
- Code consumers: start dispatch (`verbs/dispatch.ts`), the occupancy guard (`lifecycle-guards.ts` — consumes the
  derivation, not `isOccupied`), dep-edge discharge at `activate` (`side-effects/discharge-dep-edges.ts`), and the
  teardown shipped-gate (`verbs/teardown.ts` — not `archive`). A workflow trigger invokes the CLI
  `arc status <slug> --json`.

## Verify-landed checklist

- ADR-027 status `Accepted` (2026-06-21) — confirmed.
- Embedded meta-template (`lib/git/worktree-scaffold.ts`, code-generated — no template file): carries
  `Current Workflow` + the `[begin current workflow]` sentinel — confirmed.
- Parked render-bucket hand-render discipline: documented in the cohort doc; ABSENT from
  `strategy-work-organization` (→ the A6 addition).

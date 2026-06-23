# Spec (`detailed` · `RFC`): lifecycle-closeout

- **Origin:** [internal] — `lifecycle-state-machine` cohort member; the global-consistency tail.

- **Purpose:** Leave the work-unit lifecycle corpus **consistent** with the shipped state machine — a
  cross-cutting verb/model documentation sweep, a bounded set of wiring completions the consistency audit
  surfaced as half-built edges, and the certifying audit that asserts no documented-but-unbuilt or half-migrated
  lifecycle surface remains.

---

## Introduction / Context

The `lifecycle-state-machine` cohort renamed and reshaped the work-unit lifecycle verbs (`graduate → promote`
plus the clean inverse `demote`, `abandon` split out of `deactivate`, `reopen` added, `start` made a full
dispatch) and migrated the deterministic transition mechanics into the CLI. Each prior member shipped under a
**local-consistency** rule: no member ships code whose own docs lag. What no single member owns is the
**cross-cutting** propagation — the verb renames across every durable doc, the lifecycle-workflow rewrites, the
state-model vocabulary — and the **global** assertion that the shipped substrate matches the model end to end.
This member owns both: the cross-cutting sweep, and the final consistency audit.

The cohort's governing principle is the **consistency-on-exit standard**: when the transformed domain is this
foundational, the cohort owns leaving the substrate _coherent_, not merely functional-in-parts. The limit-test:
absorb what would be _inconsistent_ if deferred (the model says X, the substrate doesn't do X); leave out what is
merely _un-enhanced_ (the substrate does X correctly and lacks only an additive nicety) and what belongs to a
_different foundational domain_.

This spec was written against a **discovery audit run to closure at create-spec** — the corpus sweep that finds
the half-built edges and classifies the rewiring set, performed in planning so the requirements below are
determinate rather than discovered during execution. The audit materially sharpened the worklist: one presumed
code item (`abandon` out-of-band teardown) was found already shipped and reclassified to a doc/verify item; the
resolver-rewiring set resolved to a single trigger; and two new edges surfaced (the nested-parent archival
cascade, the adjacent-strategy verb residue) and were folded in. The **certifying** audit — asserting the swept
corpus matches the model — remains a completion-time deliverable.

## Goals

- The durable corpus describes the **shipped** verb set and state model — no surface names a retired verb
  (`graduate`/`graduation` as a transition; the `--lifecycle` flag spelling) or a mechanism that does not exist
  (slug-matched inbox drain).
- The state-model vocabulary the prior members built — the `(phase, location)` two-axis model, the derived-state
  names, the `Parked` render bucket — is documented where readers reach for it.
- The half-built lifecycle edges the audit confirmed are **completed**: the errand inbox-drain provenance
  producer-leg, the single hand-rolled state read the resolver now owns, and the nested-parent archival cascade.
- Verb↔ceremony coverage is complete — `reopen` gains the judgment-half ceremony every other lifecycle verb has.
- The certifying audit passes: no documented-but-unbuilt transition, no half-migrated mechanic, no doc describing
  the old machine — across both the `.arc/` instance and the `packages/arc-framework/arc/` package mirror.

## Non-Goals

- **Re-authoring locally-swept member docs.** Each prior member already swept its own local surfaces; this member
  **audits** them for coherence, it does not redo them.
- **Un-enhanced additive niceties** that the substrate handles correctly today: the `graduation-cleanup`
  history-rewrite ceremony, the `roadmap-tooling` renderer itself (this member documents the interim hand-render
  discipline for the `Parked` bucket; it does not build the renderer).
- **A different foundational domain:** the `operational-state-docs` record/projection substrate.
- **The planning-readiness staleness mechanism** (re-validate-at-init + the don't-persist-forward-action
  convention) — surfaced by this member's audit but routed to `planning-iteration-mechanics` as new mechanism,
  not corpus repair.
- **The `composable-workflows` fragment cut** — the workflow-shell rewrite coordinates with it; this member does
  not design the fragment substrate.
- **Verb _naming_ register** beyond the shipped set — final naming coordinates with `idiomatic-alignment`; the
  `(graduation)` commit-context parenthetical is `rules-restructure`'s cascade, not this member's.

## Proposed Design

Three pillars: the documentation sweep, the targeted wiring completions, and the certifying audit. The sweep and
the audit are the spine; the wiring is the bounded code the audit surfaced. Every concrete reference below is
grounded against current file state (create-spec audit); unless noted, each `.arc/` surface has a byte-identical
package-mirror twin under `packages/arc-framework/arc/` that must be edited in lockstep.

### A. The cross-cutting documentation sweep

#### A1 — Verb-register sweep + `graduate → promote` rename

- **Rename the ceremony file** `graduate-work-unit.md → promote-work-unit.md` (both copies), with its
  `# Workflow:` title and every `[graduate-work-unit]` reference-link label that targets it (confirmed consumers:
  `init-work-unit.md`, `strategy-work-organization.md` at the link-ref definition plus two label uses).
- **Token-triage `graduat*`** across the corpus: rewrite the transition verb/noun (`graduate`/`graduation`) to
  `promote` / "promote up the readiness ladder"; **keep "readiness ladder"** (the `provisional → planned → active`
  rung concept, deliberately reserved). Delete the now-circular self-definitions (`"Graduation" names a
  readiness-ladder promotion`) in `strategy-work-organization.md` and the renamed ceremony. Leave false positives
  untouched (`graduated lookup` in session workflows; the confidence-ladder metaphor in the release-wrapper
  setup; content-promotion `draft-* → notes-*` colloquial usage). Scope: the **live durable surfaces** (workflows,
  methods, templates, strategies, skills); the **dated historical records** — ADRs and the
  `reference/supplemental/research|analysis` snapshots — are point-in-time and exempt.
- **Surface `demote`** — the shipped inverse of `promote` (`arc demote`, `planned → provisional`) currently has no
  doc surface. Add it as `promote`'s inverse in the renamed ceremony and the command catalog (A4); no standalone
  ceremony (a trivial backlog-tier move).
- **`Active` (phase) vs `active/` (location) disambiguation** — add the `(phase, location)` two-axis framing to
  `strategy-work-organization.md` (absent today), sharpest in the parked case (`State: Active` while physically in
  `backlog/planned/`).
- **Session-init register parity** — bring the discovery arm to parity with the cold-start arm's positive
  start-verb framing (a light, state-accurate `start`/`initialize`/`scaffold` at the "propose next steps" +
  full-protection note). Targets: `session-init.md` and `session-init.template.md` (both `arc:if` arms). The
  **contributor variant carries no discovery arm — it is not a target** (corrects the draft's mirror inventory).
  Plus the cosmetic `decompose-work-unit.md` "activates each member" and `activate-work-unit.md` "graduated to
  PRD" tightenings.
- **Cohort-doc corrections** — `cohort-lifecycle-state-machine.md` carries phantom `idiomatic-alignment`
  references (the verb-register check re-homed here, not there) and a `graduate-not-scaffold` usage; correct both
  in the sweep, and refresh the `lifecycle-closeout` member entry to reflect the wiring scope (today it names only
  the sweep + audit). The `multi-increment errand → extended errand` residue there is an audit stale-framing item
  (pillar C). The doc is itself swept to `completed/` when this member ships — not nested (`Parent: [none]`), so it
  rides the existing `{NN}a` sidecar cascade, untouched by W4.

#### A2 — Reconcile the "no meta-less draft" position

Enforce one position corpus-wide: a draft is always **meta-bearing** (accompanied by a provisional/planned stub or
an active Planning WU from inception); protection mode shapes only the ship layer (branch/PR), never the record.
The draft's originally-named hit (`draft-design.md`'s "no meta file may exist yet" clause) is **already gone**; the
live contradictions the audit found are:

- `strategy-work-organization.md` § Partially Protected — explicitly ties meta-lessness to partial protection
  ("it has no planning branch or meta yet"). The clear fix.
- `draft-design.md` (two spots) — pre-WU base-drafting "no meta yet" temporal phrasing; sharpen so the temporal
  sense (the meta is minted at `init`) is explicit and reads as no contradiction.

Boundary: this governs **WU artifacts**, not errands (legitimately meta-less `chore/<slug>` — owned by
`errand-lattice`); do not over-correct errand-no-meta language.

#### A3 — Author `reopen-work-unit.md` + ceremony-corpus coherence

`reopen` ships a verb (`Integrating → Active`, withdraw the PR) but has no judgment-half ceremony. Author a thin
standalone `reopen-work-unit.md` (its own file — the inverse of `integrate-work-unit.md`; own-file precedent is
`deactivate-work-unit.md`): drives `arc reopen [--keep-pr]`, judgment = the withdraw-vs-stay-integrating call.
Add the `integrate-work-unit.md` → `reopen` inverse back-link (the integrate ceremony does not currently name its
own inverse). While there, audit the ceremony corpus for residual coverage/symmetry/cross-reference gaps.

#### A4 — Surface the resolver state-query to agents

The resolver shipped a queryable `arc status <slug> [--json]` (resolves `(phase, location)`, the derived enum, and
dep-edge `landed` facts) but is **invisible at the agent-facing doc layer** (confirmed absent from QUICK-REFERENCE's
CLI inventory, DEV-RULES, and every strategy). Dual-home it:

- **QUICK-REFERENCE § ARC CLI Commands** — add the catalog entry at parity with its siblings (on-demand reference).
- **DEV-RULES.ARC § Verification and Discovery → "Verify before assuming"** — add an **always-loaded behavioral
  rule**: resolve a WU's lifecycle state by slug via `arc status <slug>` rather than inferring it from directory,
  branch, or a state-blind `Depends On` edge. This is principled selective elevation — it operationalizes the
  interim mitigation of the recurring state-blind-edge hazard, not mere discoverability. **Phrase it for the
  always-loaded budget:** DEV-RULES.ARC is read in full at every session-init, so this rule earns only a terse
  statement plus the inline command — the worked example, the `--json` detail, and the rationale belong on the
  on-demand QUICK-REFERENCE / strategy surfaces, not here.

#### A5 — Correct the drifted inbox-drain prose

`arc errand close` drains the originating capture off a recorded `record.originEntry` back-pointer, not slug
equality — yet the docs describe a "slug-matched `USER-INBOX` capture." Sweep all confirmed surfaces once W1
lands: `run-errand.md`, `drain-inbox.md`, `init-work-unit.md` (Promote path), `DEV-RULES.ARC` § Discovered Work
Routing, plus the stale `lib/errand/close.ts` module-doc comment.

#### A6 — `strategy-work-organization` model additions + adjacent-strategy fold-in

Beyond the verb residue, `strategy-work-organization.md` needs **additions** (not just edits): the
`(phase, location)` model, the derived-state vocabulary, the **`Parked` render bucket** (absent today — the
draft's "verify-landed" assumption was wrong; this is an addition, with the interim hand-render discipline), the
`stub` required-fields policy statement, and the protection-mode ship-layer framing. The verb-rename also folds in
**`strategy-work-planning.md` and `strategy-planning-module.md`** (carry dense `graduation`-pipeline vocabulary —
in-scope per the same verb-rename consistency concern). Remove the orphaned `arc errand cut` command: `open` is
the sole errand entry verb, so the standalone command exposes the cut half without the mandatory occupy and has no
correct use — deregister it (CLI + handler) and reframe `strategy-work-organization`'s § The cut→occupy invariant
around `open`'s composed `cutErrandBranch`, which stays.

### B. Targeted wiring completions

#### W1 — Errand inbox-drain provenance producer-leg

The consumer leg ships and is enforced (`record.ts` defines `origin: "description" | "inbox"` + `originEntry?`,
with a hard deserialize contract that `inbox` ⇔ `originEntry` present; `handlers/errand.ts` drains the capture off
`record.originEntry` at close). But **no code path sets the pointer** — `openErrand` hardcodes
`origin: "description"`, and `arc errand open` accepts no originating-capture argument — so the drain is
**universally dead** (every inbox-drained errand orphans its capture at close, confirmed). Fix, adopt-by-capture
provenance:

- Add an originating-entry parameter to `OpenErrandParams` (`lib/errand/open.ts`); mint
  `origin: originEntry ? "inbox" : "description"` with the conditional `originEntry` (serialize/deserialize already
  handle it).
- Add the `--from-inbox <entry-slug>` producer flag to `arc errand open` and thread it from the **adoption
  call-sites**, all confirmed origin-blind today: `run-errand` Launch; the warm `arc-errand` skill (a pointer — it
  delegates the literal `open` to run-errand, so it carries adoption guidance, not the command); `drain-inbox`
  § 6's `run-errand` hand-off (the genuine single-capture adoption — **not** § 5's grooming `open`, which batches
  many routing writes and adopts no one capture); and session-init's `--errand`/discovery adoption
  (`session-init.{md,template.md}` call bare `arc errand open <slug>`).
- No close-side or schema work: the consumer, the contract, and the conditional serialize already ship.

#### W2 — Resolver state-query trigger rewiring (single)

The audit classified the candidates: the only genuine inconsistency is `integrate-work-unit.md` hand-reading meta
`**State:**` to dispatch fresh-vs-resume entry mode — logic the resolver's derived enum (`integrating` vs `active`)
now owns. Rewire that one trigger to `arc status <slug> --json`. **Leave** the rest, which are consistent today:
session-init's `sessionType` (already resolver-backed via the probe envelope), the multiple-candidate
disambiguation tiebreaker, and the precondition-gate `**State:**` checks (each verb re-guards; rewiring would be
enhancement, not consistency repair — the consistency-on-exit test). The PR-state resolution in
`integrate-work-unit.md` (via `gh pr view`) is out of resolver scope and stays.

#### W3 — `abandon` out-of-band teardown — **reclassified (already shipped)**

The audit found this **already corrected** in source (commit `808213c6`): `abandon@{Planning,Active}` routes
branch+worktree teardown out-of-band through `arc teardown --force` in both the verb (`lib/work-unit/verbs/
abandon.ts` — only `parked` deletes a branch in-verb) and the handler, and the `deactivate-work-unit.md` ceremony
already documents it. **No code work.** Residual: verify no surface still describes in-verb abandon teardown, and
drain the routed `USER-INBOX` follow-up `decompose-matrix` filed (slug-matched, on completion).

#### W4 — Nested-parent `{NN}b` archival cascade

The `{NN}a` cohort-sidecar archival cascade ships; the nested-parent `{NN}b` cascade is **documented-but-unbuilt**
(`archive.ts` has no nested handling) and was explicitly deferred to "the closeout member's audit" by
`lifecycle-transition-core`. A live nested cohort exists (`agile-parallelism/concurrent-work-conventions/`) that
will exercise it. Absorbed per the consistency-on-exit standard: build the `{NN}b` cascade into the archive sweep
so a nested-parent cohort archives correctly.

### C. The certifying consistency audit

The completion-time pass that asserts the swept substrate matches the model: no documented-but-unbuilt transition,
no half-migrated mechanic, no doc describing the retired verb set — across both copies. It consumes the grounded
findings inventory (above) and the verify-landed checklist (ADR-027 `Accepted` — confirmed; the embedded
meta-template carrying `Current Workflow` + the `[begin current workflow]` sentinel — confirmed; the `{NN}b`
cascade — built in W4). Whether the audit leaves a **standing mechanical check** (a guard asserting docs match the
transition table) vs. a one-time manual pass is an open question.

## Alternatives & Rationale

- **One WU vs. splitting the code completions off.** Settled: one WU. The wiring legs are each sub-WU-warrant
  (bounded connecting legs where both ends already ship) — peeling them into peer WUs trips the lower
  decomposition guard rail — and they are coupled inward to the audit (which discovers them) and the sweep (A5
  documents exactly W1's mechanism). The consistency-on-exit standard assigns them here, and keeping them in-WU
  binds them to the single audit gate. The audit further shrank the code surface (W3 already shipped; W2 is one
  rewire), making the whole-WU shape safer still.
- **W1 — adopt-by-capture provenance** over title/content-matching (reintroduces the implicit-link fragility the
  record design retired) or slug-seeding (papers one lane, needs a close-side fallback that doesn't exist). The
  record design already chose it; only the producer leg is missing.
- **W2 — one rewire, not a sweep.** Rewiring the precondition gates would be enhancement over working code; the
  consistency-on-exit limit-test leaves un-enhanced surfaces alone and rewires only the genuine inconsistency.
- **W4 — absorb vs. route.** Absorbed: a live nested cohort makes the unbuilt cascade an inconsistency-if-deferred
  (model says nested cohorts archive with `{NN}b`; substrate can't), and `lifecycle-transition-core` explicitly
  punted it here — not an un-enhanced nicety.
- **Adjacent strategies — fold in vs. hold out.** Folded in: leaving `strategy-work-planning` /
  `strategy-planning-module` carrying retired `graduation` vocabulary is the exact half-renamed-corpus
  inconsistency closeout exists to close; the marginal cost is mechanical.

## Cross-cutting Considerations

- **Testing.** The wiring completions carry unit coverage: W1 — `arc errand open --from-inbox` mints
  `origin: "inbox"` + `originEntry`, and an inbox-drained errand's capture is dropped at `close` (the end-to-end
  drain that is dead today); W2 — `integrate-work-unit` entry dispatch resolves via the resolver; W4 — a
  nested-parent cohort archives with the `{NN}b` cascade. The `arc errand cut` removal adds no new test — it drops
  the command's coverage, and `cutErrandBranch`'s own unit coverage staying green proves the internal mechanic is
  unaffected. The doc sweep is gated by markdown lint (zero-tolerance); there is no automated check that docs match
  the shipped verb set — the certifying audit (C) is that check, manual unless it leaves a standing guard.
- **Package-project sync.** Every doc edit touches both the `.arc/` instance and the `packages/arc-framework/arc/`
  mirror (the pre-commit two-copy discipline applies); the audit verifies mirror parity as a closeout invariant.
- **Migration / rollout.** No data migration; this is the cohort's integration tail. The verb rename is a
  file-rename + reference-repoint with no behavior change; the wiring completions are additive.
- **Audience.** The swept surfaces span adopter-facing (`system/**`, `strategies/arc/**`, `DEV-RULES.ARC`,
  QUICK-REFERENCE, templates) and internal-dev-facing (this WU's artifacts); keep the adopter-facing edits free of
  transitional/internal-roadmap framing per the audience-boundary rule.

## Success Criteria

- No durable surface (both copies) names a retired lifecycle transition verb: `graduate-work-unit.md` is gone,
  `promote-work-unit.md` exists with title + all link-refs repointed; "readiness ladder" is preserved; `--lifecycle`
  and slug-matched-drain language are gone.
- `arc status <slug>` appears in QUICK-REFERENCE § ARC CLI Commands and as an always-loaded DEV-RULES.ARC rule.
- `strategy-work-organization` carries the `(phase, location)` model, the derived-state vocabulary, the `Parked`
  render bucket + interim hand-render discipline, the `stub` required-fields policy, and the protection-mode
  ship-layer framing; `strategy-work-planning` / `strategy-planning-module` carry no retired `graduation` vocabulary.
- `arc errand cut` is removed from the CLI and § The cut→occupy invariant is reframed around `open`'s composed cut;
  the internal `cutErrandBranch` mechanic is unaffected (its existing coverage stays green).
- W1: `arc errand open` accepts an originating-capture argument that mints `origin: "inbox"` + `originEntry`; an
  inbox-drained errand's capture is dropped at `arc errand close` (verified by test).
- W2: `integrate-work-unit` resolves entry mode from the resolver, not a hand-read of meta `**State:**`.
- W4: a nested-parent cohort archives correctly via the `{NN}b` cascade (verified by test).
- `reopen-work-unit.md` exists and drives `arc reopen`; `integrate-work-unit.md` links its inverse.
- The certifying audit asserts — across both copies — no documented-but-unbuilt transition, no half-migrated
  mechanic, no retired-verb description; mirror parity holds. All quality gates pass.

## Open Questions

- **Audit residue** — whether C leaves a standing mechanical check (a guard asserting docs match the transition
  table) or remains a one-time manual pass.
- **Workflow-shell boundary** — how much of the lifecycle-workflow shell rewrite is this member's vs. deferred to
  `composable-workflows`'s fragment cut; settle the line so the sweep neither under- nor over-reaches.

# Draft: Lifecycle Closeout

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). The
  global-consistency tail: runs only once the prior members have landed their code + local docs.
- **Cohort:** `lifecycle-state-machine`
- **Purpose:** Leave the corpus **consistent**, not merely functional-in-parts — the cross-cutting documentation
  propagation (verb renames, vocabulary, lifecycle-workflow rewrites) concentrated into one auditable final member;
  a small set of **targeted wiring completions** the closeout audit surfaces as half-built lifecycle edges; and the
  final consistency audit that certifies the shipped substrate matches the model. The realization of the cohort's
  consistency-on-exit standard.

> Shared context — the consistency-on-exit standard, the closeout criteria, and the shared model the sweep
> documents — lives in `cohort-lifecycle-state-machine.md`.

---

## Problem / Motivation

This cohort renames and reshapes verbs (`graduate → promote` + `demote`, `abandon` split out of `deactivate`,
`reopen` added, `start` becomes a full dispatch) and migrates transition mechanics to the CLI. The per-member
rule is **local consistency** — no member ships code whose own doc lags. But the *cross-cutting* sweep — the verb
renames propagated across every load-bearing doc, the lifecycle-workflow rewrites, the protection-mode ship-layer
documentation — is **global consistency**, and concentrating it in one final auditable member (rather than
scattering it) is how the cohort avoids shipping a half-migrated core whose authoritative definitions still
describe the old machine.

The rule: per-member docs update *with* their code (local); this member does the cross-cutting sweep + audit
(global). A pattern ARC has used before (the closeout doc-cascade member).

**Scope shape — sweep + audit + bounded wiring completions.** The closeout audit is not only a *certifying* pass;
it is also the *discovery* mechanism that surfaces half-built lifecycle edges the prior members left behind. Where
the audit finds a documented-but-unbuilt or half-migrated edge that the consistency-on-exit standard says the
cohort must absorb (model says X, substrate doesn't do X — *not* a merely un-enhanced nicety), closeout closes it
here rather than scattering a trailing fix. Two such edges are already confirmed (the errand inbox-drain
producer-leg and the resolver state-query's agent-facing reach — below), so this member's scope is doc-sweep +
audit **plus** a bounded set of targeted wiring completions. This is a deliberate, in-mandate expansion, not scope
creep: the cohort owns leaving the lifecycle core coherent end to end.

## Resolved model

Three pillars: the cross-cutting documentation sweep, the targeted wiring completions the audit surfaces, and the
final consistency audit that both certifies the corpus and discovers the wiring work.

### A. The cross-cutting documentation sweep

Propagate the cohort's verb/model changes across the durable surfaces no single member owns end-to-end:

- **`strategy-work-organization`** — the verb set, the `(phase, location)` model, the derived-state vocabulary
  (incl. the Parked render bucket), the `stub` required-fields *policy* (the contract is built in
  `lifecycle-transition-core`; the policy statement lands here), the protection-mode ship-layer framing.
- **The lifecycle workflows** — `init-work-unit`, `activate-work-unit`, `deactivate-work-unit`,
  `decompose-work-unit`, `integrate-work-unit`, `archive-work-unit`, `run-errand` — rewritten to the renamed verbs
  and the thinner judgment-only shells the CLI migration leaves (the workflow-shell boundary; coordinates with
  `composable-workflows`).
- **`DEV-RULES.ARC` / `AGENT-BRIEF.ARC`** — the verb vocabulary and any lifecycle-state language. (The errand /
  Atomic vocabulary entries are `errand-lattice`'s cascade; this member sweeps the WU-lifecycle verbs and
  reconciles the two so the combined vocabulary is coherent.)
- **Protection-mode shaping documentation** — the ship-layer property (mode shapes how a transition's commit
  lands, not the mutator bundle), the partial-relaxes-two-surfaces rule, the degrade-unknown-to-partial floor.

The sweep also carries these **scoped items**, each settled enough to name here (the exact file/section inventory
firms at create-spec against what the predecessors actually shipped):

#### A1. Lifecycle verb/term-register check (re-homed from `idiomatic-alignment`)

The cohort doc, this draft, and inbox entries all routed verb / term-register work to `idiomatic-alignment`, but
that WU's draft is about knowledge-format norms and **explicitly excludes** "renaming ARC's internal vocabulary"
(§ Scope boundary) — so the register check was **ownerless**. It lands here because closeout already owns the
cross-cutting verb sweep + final consistency audit (alt considered and rejected at drain 2026-06-17: a dedicated
register WU). Correct the phantom `idiomatic-alignment` references in the cohort doc + this draft as part of the
sweep. Sub-items:

- **Verb naming** — `start` / `park` / `promote` / `demote` / `reopen` / `abandon` register coherence.
- **`activate` vs `init` / `scaffold` register — no stale language, one parity fix (audited 2026-06-22).**
  `activate` is firmly anchored to the `Planning → Active` edge corpus-wide (`activate-work-unit.md`,
  `strategy-work-organization`, ADR-026), and the create-new edge uses `init` / `start` / `scaffold`
  (`init-work-unit`, `arc start`); no surface uses "activate" for the create edge, so an agent saying "activating it
  now" for a *new* WU is conversational drift, not ARC text. **But `session-init`'s two create-new arms are framed
  asymmetrically:** the **cold-start** arm positively models the verb (*"Offer to scaffold … Either scaffolds a
  Planning meta"*, `:147–149`), while the **discovery** arm — the exact "let's start WU-X" priming moment — is
  neutral (*"Propose next steps"* `:469`; *"run `init-work-unit`"* / *"proceed to `create-spec`"* `:489–492`),
  leaving a conversational vacuum the model fills with "activate". **Fix (register parity, not enhancement):** bring
  the discovery arm to parity with cold-start — a light, state-accurate positive start-verb (`start` /
  `initialize` / `scaffold`; discovery *is* the create-new context — activating an existing Planning WU is the
  Resume arm, not discovery) in Step 5's "propose next steps" + the full-protection note, mirrored to
  `session-init.template.md` + the contributor variant. Leave the generic Step 6 "Next action" framing alone (it
  points to any next action). The parity itself is the justification; the anti-drift effect is a bonus (doc framing
  is a mild lever against model drift). Plus the optional cosmetic tightening at `decompose-work-unit.md:354`
  ("activates each member …" → "scaffolds/initializes").
- **`graduate → promote` verb-vs-concept — resolved (2026-06-22): split the tangle.** The *verb* fully
  standardizes to `promote` (+ the clean inverse `demote`) — already shipped in code and the workflow bodies; there
  is no `graduate` verb. But **"readiness ladder" survives as a distinct concept** — the `provisional → planned →
  active` rung progression (directory positions, *orthogonal* to the `State` enum), deliberately reserved for this
  meaning, anchor-cross-linked, and the disambiguator for an overloaded `promote` (`arc promote` WU vs.
  `arc errand promote` vs. Class `heavy → novel`). The verbs can't carry it — you promote/demote *along* the
  ladder; the ladder is the axis, not the action. So: **retire** "graduation" the noun + "graduate" the verb (fold
  into "promote up / demote down the readiness ladder"); **keep** "readiness ladder"; **rename**
  `graduate-work-unit.md → promote-work-unit.md` (+ title + link-ref labels). **Token-by-token triage, not a
  blanket replace:** `graduat*` hits rewrite safely (transition-naming), but `ladder` does **not** — leave
  "readiness ladder" standing; and delete the now-circular self-definition "'Graduation' names a readiness-ladder
  promotion" (nothing left to define once "graduation" is gone).
- **`Active` phase vs `active` location collision** — the phase value `Active` (`WorkUnitState`) and the location
  `active/` reuse one word for two axes (maturity vs. engagement); sharpest in the parked case (`State: Active`
  while in `backlog/planned/`). A cascade (enum + dirs shipped), not a local rename.

#### A2. Reconcile the "no meta-less draft" position across all public-facing surfaces

Audit & reconcile the "no meta-less draft" position across **all** public-facing surfaces — shipped docs,
strategies, templates, lifecycle / planning workflows, code comments — so ARC holds one consistent position. Rides
the cross-cutting sweep + final consistency audit, not a separate hand-pass.

- **Position to enforce** ("Branchless ≠ recordless", authored into `spec-lifecycle-transition-core.md` §12): a
  draft is always meta-bearing — accompanied by a meta from inception (a provisional / planned stub or an active
  Planning WU), never free-floating. Protection mode shapes only the ship layer (branch / PR), never the record;
  partial skips the branch, never the meta. A recordless artifact has no derivable lifecycle state.
- **Known starting hit:** `draft-design.md` (the "under partial protection… no meta file may exist yet" clause)
  directly contradicts the position and must be revised. Not exhaustive — the audit is the discovery mechanism.
- **Boundary:** governs **drafts / WU artifacts**, not **errands** (legitimately meta-less `chore/<slug>`;
  `errand-lattice` owns that contrast) — don't over-correct errand-no-meta language while fixing draft-no-meta.

#### A3. Author a standalone `reopen-work-unit.md` ceremony + audit ceremony-corpus coherence

`reopen` ships a verb (`Integrating → Active`, withdraw the PR) but has **no judgment-half ceremony workflow**;
every other lifecycle verb has one. A verb↔ceremony coverage gap — but the verb is shipped + tested, so only the
ceremony prose is missing (closeout's doc-consistency tail).

- **Proposed:** author a thin standalone `reopen-work-unit.md` (its own file — `reopen` is the inverse of
  `integrate-work-unit.md`, **not** a path inside `activate-work-unit.md`; own-file precedent is
  `deactivate-work-unit.md`). Drives `arc reopen [--keep-pr]`; judgment = the withdraw-vs-stay-integrating call;
  the verb owns the `set-phase`-only flip + PR close / draft.
- **Broader mandate:** while there, audit the whole ceremony corpus for coherence — verb↔ceremony coverage (any
  other shipped verb missing a ceremony, or a ceremony naming a retired / renamed verb), inverse-pair symmetry, and
  cross-reference integrity. Rides the cross-cutting sweep + final consistency audit.

#### A4. Surface the resolver's state-query command to agents (discoverability — doc tier)

`lifecycle-state-resolver` shipped a real, queryable command — `arc status <slug> [--json]` — that resolves a WU's
`(phase, location)`, derived enum (`shipped` / `parked` / `active` / `occupied` / …) and dep-edge states, and it
is genuinely wired into its code consumers (`start` dispatch, the occupancy guard, dep-edge discharge, the archive
sweep). But it is **invisible at the agent-facing layer**: it appears in exactly one inline workflow comment
(`resume-work-unit.md`) and is **absent from QUICK-REFERENCE's CLI command inventory, DEV-RULES, and every
strategy**. An agent reading the documented surface has no way to know it exists — so agents still hand-infer WU
state (a recurring, documented hazard: reasoning from state-blind `Depends On` edges / directory / branch). The
fix is to dual-home it by surface *kind*:

- **QUICK-REFERENCE § ARC CLI Commands** — add the catalog entry (`arc status <slug> [--json]`), on-demand, at
  parity with its siblings (`arc user *`, `arc release *`). Reference lookup.
- **`DEV-RULES.ARC` § Verification and Discovery → "Verify before assuming"** — add an **always-loaded behavioral
  rule** (DEV-RULES.ARC is read in full at every session-init; QUICK-REFERENCE's CLI sections are not). The rule
  names the command inline, so the always-loaded surface carries both the behavior and the tool. Draft phrasing:
    > **Resolve work-unit state from the resolver, not by hand.** When you need a work unit's lifecycle state by
    > slug — is it shipped / parked / active / occupied, has a dependency landed — query `arc status <slug>`
    > (`--json` for programmatic reads) rather than inferring it from directory location, branch name, or a
    > `Depends On` edge. Inference is state-blind and non-deterministic across machines and worktrees; the resolver
    > reads location + meta deterministically.

  This is principled selective elevation (not a precedent to bulk-promote QUICK-REFERENCE entries): it corrects a
  recurring failure mode, and `arc status <slug> --json` already exposes `shipped?` + dep-edge states *today*, so
  the rule operationalizes an interim mitigation of the state-blind-edge hazard, not mere discoverability. The
  workflow-trigger *rewiring* that complements this (replacing hand-rolled state reads at the triggers) is a code
  concern in pillar B (W2).

#### A5. Correct the drifted errand inbox-drain prose

The errand-close inbox-drain is documented as dropping "the **slug-matched** `USER-INBOX` capture" — a mechanism
that does not exist (close drains off a recorded `originEntry` back-pointer, not slug equality) *and* a leg that
never fires today (W1). The drifted prose spans **five surfaces** (each plus its package mirror): `run-errand.md`
Complete (:163), `drain-inbox.md` (:188), `init-work-unit.md` Promote path (:307), `DEV-RULES.ARC` § Discovered
Work Routing (:298), and the historical `spec`/`meta-errand-lattice` wording the prose echoes. Once W1 lands,
sweep all five to describe the real provenance mechanism (close drains the originating capture recorded at
`arc errand open`).

#### Surface inventory (grounded against shipped predecessors)

The sweep's concrete inventory, firmed against what the members actually shipped (predecessor-grounding pass,
2026-06-22). Three classes:

**(i) Verb / command awareness — place each at its narrowest serving locus (don't blanket-propagate).** The full
verb set ships in code but appears in no command index. The sweep's job is *not* to dump every verb into every
surface — always-loaded session context is a guarded budget. Bucket each verb by where awareness actually serves a
reader (the differentiator is *how the verb is reached*):

- **Always-loaded behavioral rule (DEV-RULES.ARC) — `arc status <slug>` only.** It alone clears the bar: the "what
  state is WU X in?" need is *cross-context and universal* (it recurs anywhere an agent reasons about a WU, and is
  the standing fix for the state-blind-edge hazard). That universality is precisely what justifies the always-loaded
  spend — and the reason nothing else qualifies (A4).
- **On-demand command catalog (QUICK-REFERENCE § ARC CLI Commands) — the independently-invoked lifecycle verbs.**
  Its test is "would an agent reach for this command on its own?" (not the always-loaded budget — QUICK-REFERENCE's
  CLI section is on-demand). Pass: `start`, `park`, `resume`, `activate` / `deactivate`, `promote` / `demote`,
  `reopen`, `abandon`, `archive`, `stub`, `decompose`, `teardown`, `errand open` / `close` / `promote` / `retire`,
  plus `status <slug>` and `plan check`. The section carries *zero* lifecycle verbs today, so this is an addition.
- **Strategy canon (on-demand deep-dive) — the full verb set + model vocabulary.** Including `set-stage` /
  `repoint-design`, the `(phase, location)` model, the derived-state names, `Current Workflow` / the
  `[begin current workflow]` sentinel. The authoritative model lives here for the reader who needs depth.
- **Workflow-trigger-only — `set-stage` / `repoint-design`.** Pure workflow-internal pointer mechanics an agent
  never invokes standalone (the three planning-stage workflows fire them; PPR wired them in locally). Awareness
  belongs at the firing step — and so they get strategy canon (above) but **neither DEV-RULES nor QUICK-REFERENCE**.
  Any other executor mechanic an agent never independently reaches for follows the same rule.
- Also: verify `TECHNICAL-OVERVIEW` § Orchestration names `arc decompose`; `cut` is a dead-ish legacy verb (audit
  for removal); `+ .template.md` mirror applies to every QUICK-REFERENCE edit.

**(ii) Locally-updated surfaces — AUDIT for consistency, do NOT re-author.** Each member already swept its own
local docs; closeout verifies coherence, it does not redo them:

- `errand-lattice` ran its *own* cross-cutting sweep (its spec §9 owned it, not deferred to closeout):
  `strategy-work-organization` §§ Errand Work Class / Auto-Merge Lane, DEV-RULES.ARC § Discovered Work Routing,
  AGENT-BRIEF.ARC errand/`atomic` vocabulary, `run-errand` / `drain-inbox` / `init-work-unit` Promote path, the
  inbox skills. Residual here is the consistency audit + the W1 fix.
- `planning-pipeline-readiness` updated the planning workflows, `init-work-unit`, `session-init`, and authored the
  DEV-RULES.ARC "Recommend on advisory forks" rule (done — audit phrasing only).
- `decompose-matrix` rewrote `decompose-work-unit.md`, corrected `park-work-unit.md`, and updated
  `strategy-work-organization` § Decomposition + `assess-cohort-fit` + the cohort doc.
- `lifecycle-transition-core` re-pointed `init` / `activate` / `deactivate` / `graduate` / `archive` / `integrate`
  / `park` / `resume` workflow bodies locally. The *global* shell-rewrite + verb renames across the set remain
  closeout's (A-pillar intro).

**(iii) Verb-spelling reconciliations (audit).** `arc status --lifecycle <slug>` shipped as positional
`arc status <slug>` — reconcile every doc/note quoting `--lifecycle`. `set-stage` / `repoint-design` are
*provisional* spellings pending `idiomatic-alignment` — a rename-tracking obligation. **Rename
`graduate-work-unit.md → promote-work-unit.md`** (+ workflow title + `[graduate-work-unit]` link-ref labels): the
verb retired to `promote` and the body is already re-pointed; the filename + title are the residue (decided in A1).

### B. Targeted wiring completions

Bounded code/wiring the closeout audit surfaces as half-built lifecycle edges, absorbed here per the
consistency-on-exit standard. Each is "closeout-sized" because the building member already shipped most of the
edge and left only the connecting leg.

#### W1. Errand inbox-drain provenance producer-leg (close the inbox→errand→drain edge)

`errand-lattice` designed the inbox→errand drain as **recorded-provenance**: `arc errand close` drains the
originating `USER-INBOX` capture by a recorded `record.originEntry` back-pointer (the record schema ships the
field + an *enforced* inbox-origin contract; the close handler already consumes it). But **no code path ever sets
that pointer** — `openErrand` hardcodes `origin: "description"`, and `arc errand open` has no flag to pass an
originating capture. The wiring was twice forward-referenced to the building member's "Phase 6," which then
shipped without it. Consequence: the drain is **universally dead** — *every* inbox-drained errand silently orphans
its capture at close (not just fresh-slug ones, as the originating capture report assumed). The session-init
in-flight sweep is an *abandonment* backstop only; it does not cover the silent-success-on-clean-close case.

- **Chosen fix — adopt-by-capture provenance** (the design the spec actually chose; the other two approaches are
  inferior re-implementations of it — title/content-matching reintroduces the implicit-link fragility the record
  design retired; slug-seeding papers one lane and needs a close-side fallback that doesn't exist). Residual work
  is small because both ends already ship:
    - Add an originating-entry argument to `arc errand open` (e.g. `--from-inbox <entry-slug>` or a thin
      `arc errand adopt` seam); thread it into `openErrand` to mint `origin: "inbox"` + `originEntry`.
    - Thread the originating entry through the **full adoption call-site set** — `drain-inbox` §5/§6
      (:153), `run-errand` Launch step 3 (:55), the warm `arc-errand` skill, and session-init's `--errand` /
      discovery adoption (`session-init.template.md:260`). All four are confirmed origin-blind today — each calls
      `arc errand open <slug>` with only `--type` / `--intent`, and `open` accepts no origin linkage.
    - **No per-close-site work:** `arc errand close` already drains off the (now-populated) record, and
      `run-errand`'s Complete phase already invokes close — so the completion ceremony is sound; only the producer
      leg + the drifted prose (A5) are missing.
- **Surface:** errand record model + `arc errand open` (CLI + `lib/errand`), the adoption call-sites
  (`.arc/system/**`, both copies). Design fork already resolved → tighter than the original capture implied.

#### W2. Resolver state-query trigger rewiring (selective)

Complement A4's discoverability with selective rewiring of the workflow triggers that still hand-roll the state
question the shipped resolver was built to own — e.g. `integrate-work-unit.md` reads meta `**State:**` by hand;
candidates also in `session-init` entry-mode inference. **Selective, not blanket:** rewire only the genuine
inconsistencies (a trigger hand-rolling logic the resolver now owns), and leave the *un-enhanced* ones that work
correctly today (the consistency-on-exit test). The audit (pillar C) is what classifies each candidate; the exact
set firms at create-spec.

#### W3. `abandon` out-of-band teardown (close the teardown-edge asymmetry)

`abandon@{Planning,Active}` still fires its branch + worktree teardown **in-verb** — the same broken pattern
`decompose@planning` and `park@Planning` were corrected away from: the in-verb leg runs before the transform
commit, where the `worktree-clean` guard refuses a dirty tree and, in-place, targets the un-removable primary
worktree. Two of three teardown-bearing edges moved to the out-of-band `arc teardown --force` verb; `abandon` did
not. `decompose-matrix` deliberately scoped it out and captured it as a `USER-INBOX` follow-up; closeout absorbs it
(decided 2026-06-22) — leaving one of three teardown edges broken is the asymmetry the cohort exists to retire.

- **Fix:** drop `abandon`'s in-verb teardown legs (keep its `set-phase` + artifact disposition) and route the
  branch + worktree teardown out-of-band through `arc teardown --force`, mirroring the decompose/park correction.
  The verb and its force-teardown mode already ship — this is the same generalize-and-reuse the other two edges
  proved.
- **Surface:** the `abandon` verb (`lib/work-unit/verbs/abandon.ts`) + its ceremony/doc references; drain the routed
  `USER-INBOX` follow-up `decompose-matrix` filed (slug-matched) on completion. Symmetric to W1 — a half-built
  lifecycle edge the cohort closes rather than ships broken.

### C. The final consistency audit

The certifying **and discovering** pass: assert the shipped substrate matches the model — no documented-but-unbuilt
transition, no half-migrated mechanic, no doc describing the old verb set — and surface the half-built edges that
become pillar B. The cohort's **B1** code transition table (the hand-rolled declarative table + thin executor
built in `lifecycle-transition-core` — the migration-depth tier, not to be confused with wiring item W1) is the
audit's mechanical instrument for the totality + encoding-consistency invariants; this member runs the
corpus-level static audit on top and is the gate the cohort's closeout criteria key on. W1's errand edge and A4's
discoverability gap are two findings this audit already produced during planning.

**Audit findings inventory (grounded).** Concrete documented-but-unbuilt / half-migrated items the audit must
resolve or consciously route:

- **The `abandon@{Planning,Active}` in-verb teardown twin** — `decompose@planning` and `park@Planning` were
  corrected to fire teardown *out-of-band* via `arc teardown --force` (the in-verb leg targeted the un-removable
  primary worktree and refused a dirty tree); `abandon` still carries the **identical broken in-verb teardown**.
  Two of three teardown-bearing edges migrated; one did not. **Absorbed into closeout as W3** (decided
  2026-06-22) — see pillar B.
- **`reopen` has no ceremony** (→ A3); the **`graduate-work-unit.md` filename** names a retired verb (→ A1).
- **Stale framing to sweep:** the retired `start --from <draft>` adopt-edge (corpus reconcile); "multi-increment
  errand" residue in the cohort doc / `draft-decompose-matrix` (the framing sharpened to *extended errand*); any
  "self-tears-down in-verb" prose surviving the decompose/park rewrites.
- **Verify-landed:** ADR-027 `Proposed → Accepted`; the cohort-doc nested-parent `{NN}b` archival cascade (left
  for this audit); the embedded meta-template carries `Current Workflow` + the `[begin current workflow]` sentinel;
  the Parked render bucket's interim hand-render discipline is documented (the renderer itself is
  `roadmap-tooling`'s).
- **Note-don't-fill (deliberate floors / other domains):** the encoding-consistency validator is defined but not
  hook-enforced (routed to `quality-gate-hooks`); executor git/non-TTY mechanics, the OSD record re-home, and the
  `roadmap-tooling` renderer are forward-compat seams, not closeout consistency gaps.
- **Surfaced-and-routed — planning-readiness staleness (not closeout's to build).** A draft's point-in-time
  readiness / forward-action declarations (and the `Current Workflow` stage pointer) are persisted as durable but
  decay across the often-weeks gap to a backlog stub's init/activation; nothing re-validates them at that boundary,
  so a long-sitting draft can be graduated presuming a stale "ready". `planning-pipeline-readiness` already built
  half the guard (the `[begin current workflow]` `Next Action` sentinel + code-owned pointer retiring forward-action
  prose); the missing layer is re-validation-at-init plus a don't-persist-forward-action convention. **New
  mechanism, not corpus-repair** — so the audit surfaces it and routes it to the planning-readiness domain
  (`planning-iteration-mechanics`, the PPR spin-off that owns readiness-iteration mechanics), per the
  consistency-on-exit limit-test closeout itself models. Captured 2026-06-22.

## Open questions (→ create-spec)

- **Surface inventory firming** — *grounded 2026-06-22* against what `lifecycle-state-resolver`,
  `lifecycle-transition-core`, `decompose-matrix`, `errand-lattice`, and `planning-pipeline-readiness` actually
  shipped (the inventory now lives in pillar A § "Surface inventory"). Remaining detail-design: settle the exact
  per-verb section list at create-spec from that inventory. `planning-pipeline-readiness` is confirmed an
  **un-listed sweep input** — a real surface-coverage member despite its absence from this WU's `Depends On` (the
  omission is correct for the *build* graph; closeout doesn't build on PPR's seams).
- **Workflow-shell boundary** — how much of the workflow-shell rewrite is this member's vs. deferred to
  `composable-workflows` (the markdown-tier fragment-cut owner).
- **Errand-provenance arg shape (W1)** — the exact open-side surface (`--from-inbox <entry-slug>` flag on
  `arc errand open` vs. a dedicated `arc errand adopt` seam) and how each adoption call-site passes it.
- **Resolver trigger-rewiring extent (W2)** — which hand-rolled state reads are genuine inconsistency (rewire) vs.
  un-enhanced (leave); the audit classifies, the spec records the set.
- **Audit residue** — whether the final audit is a one-time manual pass or leaves a standing mechanical check
  (candidate: a structural guard asserting docs match the transition table).

## Dependencies

- **Cohort-internal:** `Depends On: lifecycle-state-resolver`, `lifecycle-transition-core`, `decompose-matrix`,
  `errand-lattice` — the tail; it sweeps what they shipped. **`planning-pipeline-readiness` is a fifth sweep input**
  (its `set-stage` / `repoint-design` verbs + `Current Workflow` vocabulary need surfacing) — confirmed by the
  grounding pass, *not* a `Depends On` edit: the build graph is correct (closeout doesn't build on PPR's seams);
  the coverage was the gap, now closed in the inventory.
- **Forward-compat:** `composable-workflows` (the workflow-shell rewrite coordinates with its fragment-cut);
  `idiomatic-alignment` (the final verb-register check — now re-homed *into* A1, with the phantom references
  corrected).
- **Downstream:** `finalize-parallelism` carries a `Depends On: lifecycle-closeout` edge — the lifecycle is
  coherent for its end-to-end trace once this member's audit is green.

## Continuity

- **Readiness (as assessed 2026-06-22):** `formalization-ready` — scope known, scoped items (A1–A5, W1–W3)
  settled, surface inventory grounded, the draft reconciled into one coherent input, and every settle-able fork
  decided (the `abandon` twin W3, the graduation split A1, the `activate`/init register A1). What remains are
  genuine create-spec details, not draft fundamentals — the W1 arg shape and the W2 rewiring extent (the latter the
  audit itself classifies). *Point-in-time, not a standing instruction:* this reflects the state as of capture; the
  authoritative next-stage signal is the meta's `Current Workflow` pointer (set at the capture commit), and a
  deferred resumption should re-validate against current state rather than trust this line — the staleness concern
  routed in the audit above, dogfooded here.
- **Scope-shape watch:** closeout has accreted real code surface — W1 (errand record + CLI + call-sites), W2
  (workflow-trigger rewiring), and W3 (`abandon` out-of-band teardown) — on top of the doc sweep + audit. Each
  is individually in-mandate (consistency-on-exit), but the cumulative shape is worth a deliberate look at
  create-spec: confirm the member stays coherent as one WU rather than splitting the code completions off. (No
  split proposed yet — flagging, not deciding.)

---

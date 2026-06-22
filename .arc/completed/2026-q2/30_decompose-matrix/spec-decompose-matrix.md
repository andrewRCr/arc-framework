# Spec (`detailed` · `RFC`): decompose-matrix

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14).

- **Purpose:** Model `decompose` as the full `{parent-position} × {transform-shape}` matrix it is, ship a
  `runDecompose` CLI executor over `lifecycle-transition-core`'s primitives for the deterministic mechanics, and
  generalize the conservation gate to hold under partial extraction and heterogeneous-home distribution — leaving
  the cut-map judgment in the rewritten workflow.

---

## Introduction / Context

`decompose` turns one work unit into a cohort of self-contained member WUs. It is a `{parent-position} ×
{transform-shape}` matrix, but only one cell is realized today, and the realized cell is markdown-orchestrated
while every sibling lifecycle verb has migrated to a CLI executor.

**What exists.** The parent-position axis is complete in `decompose-work-unit.md` (standalone → top-level cohort;
in-cohort → sub-cohort; at-cap → lateral fan-out), with the four-step conservation gate and the
predicted-vs-emergent arm distinction. The transition table reserves the `decompose` edges: `lifecycle-transitions.ts`
declares `decompose` as a terminal verb (`to: null`, `inverse: null`) for the `provisional`, `planned`, and
`planning` source positions — the `planning` edge fires the teardown legs (`artifacts: remove`,
`reconcileBranch: delete`, `reconcileWorktree: teardown`); the `provisional` / `planned` edges fire
`artifacts: remove` only. The table comment is explicit: *"matrix owned by decompose-matrix."* `arc stub --cohort`
(single member) shipped, and `lifecycle-mechanics-tail` explicitly carved out the **batch N-member cohort scaffold**
and the **`decompose` workflow rewrite / park-exit teardown migration** as this member's work.

**What forces the design now.** Three of the four transform shapes have no path and get hand-rolled (all three hit
live during the 2026-06-12 `arc-plan-conductor` decomposition); the conservation gate assumes the whole origin
draft is consumed, so it doesn't cover partial extraction or atomic-edit homes; and `decompose` is the lone
markdown-orchestrated lifecycle holdout after `runStub` / `runArchive` / `runPark` shipped as verb functions.
Leaving it that way violates the cohort's **consistency-on-exit standard** — a documented-but-half-migrated core.
The whole cohort upstream has shipped (`lifecycle-state-resolver`, `lifecycle-transition-core`,
`planning-pipeline-readiness`, `lifecycle-mechanics-tail`, `errand-lattice`, all in `completed/2026-q2/`); the
`Depends On: lifecycle-transition-core` gate is discharged. Every consumed contract shipped **as named**.

## Goals

- Model `decompose` as the complete `{parent-position} × {transform-shape}` matrix — four transform shapes across
  the three existing parent-position arms — with every cell having a named, reachable path.
- Ship a `runDecompose` CLI executor over `lifecycle-transition-core`'s primitives, carrying the deterministic
  mechanics (a structured cut-map input, batch N-member scaffold, origin teardown via the reserved edges, the new
  incoming-edge re-point sweep, ROADMAP regen) — bringing `decompose` to parity with the migrated sibling verbs.
- Generalize the four-step conservation gate so it holds under **partial extraction** (only the extracted subset
  is consumed) and **atomic-edit homes** (a destination that is a standing doc, not a member).
- Extend `assess-cohort-fit`'s cut-map with the two entry kinds the new shapes require (surviving-origin;
  existing/atomic-home) — a data-shape change only.
- Make **extraction-from-Active** first-class (the common realized-scope mid-implementation case), and document
  the **full-split-from-Active escape hatch** as recognized-and-routed guidance rather than a blessed automated
  transform.
- Rewrite `decompose-work-unit.md` to carry the cut-map judgment and call `runDecompose` for the mechanics,
  structured forward-compatibly with `composable-workflows`.

## Non-Goals

- **Automated full-split-from-Active** — no `decompose@active` table edge, no code/commit-allocation executor, no
  git-history-surgery orchestration. The genuine multi-member-built case routes to a documented manual procedure
  (see Proposed Design § Active-state decomposition). Blessing it with ARC mechanics would bless a commit-atomicity
  smell.
- **The cohort-cut-coherence decision rail** — `cohort-cut-coherence` (planned) adds a consistency-on-exit
  *decision heuristic* to `assess-cohort-fit`; this WU adds *cut-map entry kinds* (a data-shape change). Distinct
  concerns held separate by concern-identity; that WU rebases its rail onto the shape shipped here.
- **Ownership-distribution doctrine** — decomposing to distribute pieces across single-owner developers is
  team-scale doctrine owned by `single-owner-wu-model` (a parked `concurrent-work-conventions` member). This WU
  carries a pointer, not the design.
- **A dedicated `decomposition` commit-footer category** — `park` / `resume` / `abandon` / `promote` / `demote`
  all bucket to `(maintenance)`; completing the ceremony-category set is a separate commit-footer-vocabulary
  concern.
- **A relocate-the-origin primitive** — `decompose` never `git mv`-relocates the origin. When an extraction's
  surviving origin must return to backlog, that is `park@Planning(origin)` composing on, owned by `park` and
  **sequenced by the workflow** (`arc decompose` then `arc park`), not a `runDecompose` flag.
- **zod / execa / neverthrow adoption** — none are CLI dependencies yet; they arrive with `cli-substrate-adoption`
  downstream. The cut-map validator is **hand-rolled now**, shaped to become a CSA migration target (see § Proposed
  Design — the cut-map input contract). This WU adds no substrate library.
- **The `composable-workflows` fragment/composition mechanism** — design-toward only (whole-block arms, named
  cores, mechanics/judgment split), no dependency taken and no fragment substrate built here.

## Proposed Design

### The matrix — two orthogonal axes over shared cores

`decompose` is `{parent-position} × {transform-shape}`. The two axes are orthogonal and compose over shared cores
— it is **not** a 4×3 = 12-procedure explosion:

- **Parent position** (realized today) governs **cohort-minting** (the `cohort-scaffold` block): standalone →
  top-level cohort; in-cohort → sub-cohort; at-cap → lateral fan-out (no cohort node, provenance note).
- **Transform shape** (this WU) governs **origin disposition** (retire / keep), **distribution** (whole / partial /
  heterogeneous), and **teardown** (whether a branch existed to tear down).

The mechanical invariant across every cell: the origin is either **retired** (`git rm`) or **kept in place** —
**never `git mv`-relocated**. So `decompose` composes the origin's `{retire | keep}` with `scaffold×N` (or a
fold / atomic-edit), `distribute-design`, and `reconcile-branch/worktree` teardown when a branch existed. It is
not a `relocate-artifacts` caller; it shares only the **teardown legs** with `park`.

### The four transform shapes

| Shape | Origin | Distribution | Table edge | Teardown |
| --- | --- | --- | --- | --- |
| **symmetric** (covered today) | retired (`git rm`) | whole draft → N new members | `decompose@planning` (`artifacts: remove` only) | branch + worktree — **post-merge `arc teardown`**, not in-verb ([§ revision](#teardown-is-out-of-band-phase-4r-revision)) |
| **extraction / origin-survives** | **kept** (disposition fork: keep-active or `park@Planning`) | only the *extracted* subset; adds origin→member `Depends On` | none fires (origin not retired) | none (or `park`'s, if parked) |
| **backlog-stub-source** | retired from backlog | whole stub → N members, in place | `decompose@planned` (`artifacts: remove`, no branch) | none (no branch) |
| **heterogeneous-home** | retired per its position (reuses symmetric / stub-source edge) | members route to mixed destinations: new stub, fold into existing artifact, or atomic edit to a standing doc | per origin position | per origin position |

- **symmetric** — live `plan/<name>` origin, cut-map in hand; origin retired, all members newly minted in
  `backlog/planned/`, whole draft distributed. The realized cell.
- **extraction / origin-survives** — the origin sheds one orthogonal sub-concern as a new sibling and **survives**.
  No origin-retire edge fires; table participation is only the extracted member's scaffold. The surviving (thinned)
  origin takes a disposition fork: **keep-active** (stays in `active/`, a valid terminal state) or **park**
  (`park@Planning` relocates it to `backlog/`). Park is a **separate workflow step** — `arc decompose` then
  `arc park <origin> --reason …` — two orthogonal primitives in sequence, the relocate owned by `park`, *not* a
  `runDecompose` flag. Safe because keep-active is already terminal, so the park is purely additive (no partial
  state if it is skipped or deferred).
- **backlog-stub-source** — decompose a `planned/` stub **in place**: no activation, no `plan/` branch; origin
  retired from backlog, members minted in backlog. The `artifacts: remove` leg **reuses the shipped emptied-subdir
  prune** (`relocate-artifacts`'s `pruneEmptyBacklogSource`) so a retired stub doesn't orphan its cohort subdir.
- **heterogeneous-home** — the origin-retire side reuses the symmetric or stub-source edge per the origin's
  position; what is novel is the **destination handling** (fold into a sibling stub / `draft-design` block; atomic
  edit to a standing doc) plus the conservation-gate generalization below. Orchestration, not a new table edge. The
  fold / atomic-edit destinations are **workflow-authored direct edits** (the executor has no content-editing leg —
  see `runDecompose`, below), not executor mechanics. They are **same-concern** (redistributing the origin's design
  *is* the decompose concern), the home is **already known** (the cut-map decided it), and the conservation gate
  **requires** each to land before the origin retires — so they **ride the decompose PR, recorded in the allocation
  map; they are never inbox-captured.** (Contrast a *foreign*-concern note that surfaces during a decompose — e.g.
  a CSA migration target — which does route to capture; concern-identity is the discriminator, per DEV-RULES.ARC
  § Anti-rider.)

### `runDecompose` — the CLI executor (mechanics)

`runDecompose` is a verb function in the `lifecycle-transition-core` executor family (the `run<Verb>` pattern
`runStub` / `runArchive` / `runPark` established), surfaced as an `arc decompose` command. It is **fan-out
orchestration over primitives — not a single `executeTransition` edge** (you cannot move one source into N
destinations through one transition call). It consumes the resolved cut-map plus the origin's resolved
`(phase, location)` and selected arm/shape, and performs the deterministic legs:

1. **Batch N-member cohort scaffold** — generalize the shipped single-member `arc stub --cohort` to N members:
   scaffold N member dirs under `backlog/planned/<cohort>[/<subcohort>]/<member>/`, each carrying
   `meta-<member>.md` + `draft-<member>.md`, with fields set from the cut-map and origin:
    - **`Origin`** — inherited from the origin WU (shared provenance, known at decomposition time).
    - **`Design`** — the member's own `draft-<member>.md`.
    - **`Cohort`** — the path-set value, **dual-placed** (meta + member draft header).
    - **`Class`** — the member's own resolved weight (not inherited).
    - **`State`** — `Planning`.
    - **`Depends On`** — distributed by *actual need*, never blanket-inherited (outgoing edges inherited only where
      a member genuinely depends; internal edges authored from the cut's delivery order; incoming edges re-pointed
      in the sweep).
2. **Origin retirement** — fire the reserved table edge's `artifacts: remove` leg for the origin's position
   (`decompose@planning` / `decompose@planned`), staged and committed with the transform, or skip entirely on the
   extraction shape (origin survives). The leg prunes the emptied backlog subdir the same way the `relocate` leg
   already does. **The branch + worktree teardown is *not* an in-verb leg** — see
   [§ Teardown is out-of-band](#teardown-is-out-of-band-phase-4r-revision); `decompose@planning` no longer fires
   `reconcileBranch` / `reconcileWorktree`.
3. **Incoming-edge re-point sweep** — scan **every** meta whose `Depends On` names the origin across `active/**`
   and `backlog/planned/**` (broader than the cut-map's named dependents — a direct scan catches dependents the
   cut-map didn't enumerate) and re-point each to the delivering member(s).
4. **ROADMAP regen** — decomposition is a regen fire-point: the origin drops out of In Flight; members appear in
   `backlog/planned/**` (Blocked or Ready per their distributed `Depends On`). Reuses the shipped `reconcile-roadmap`
   side-effect.

`runDecompose` performs **only** these four legs — homogeneous member-scaffolds, origin *retirement* (file
removal, staged), the re-point sweep, and ROADMAP regen. It does **not** edit existing artifacts (the
heterogeneous shape's fold / atomic-edit homes are workflow-authored — the executor has no content-editing leg by
design, mirroring its no-fabricate-content contract), it does **not** relocate the surviving origin (the
extraction-park is a separate `arc park` workflow step), and it does **not** tear down the origin's branch or
worktree (post-merge `arc teardown`, below). It returns a structured result describing what it did (members
scaffolded, edges re-pointed, origin disposition) — the substrate the workflow renders into the allocation-map PR
description.

The legs resolve state from **logical `(phase, location)` + meta fields**, never `git branch` / `git log`
inference — the arc-backend design guard (ADR-022) the whole cohort honors.

### Teardown is out-of-band (Phase 4.R revision)

The shipped `decompose@planning` edge fired branch + worktree teardown **in-verb**
(`reconcileBranch: delete` + `reconcileWorktree: teardown`), before the transform commits. This is broken for a
started origin, and the executor's unit tests (git driven through spies) plus the integration tests (which hand-fed
**cross-worktree** inputs the CLI never generates) never exercised the real path:

- **Dirty-tree refusal.** The verb stages the scaffolds + origin removal + re-points into the run-cwd, then the
  teardown leg's `worktree-clean` guard checks that same tree → dirty → `reconcileWorktree` throws. The verb stages
  but never commits before teardown, so the guard trips every time the run-cwd *is* the teardown target.
- **In-place primary removal.** Under `arc start --here` (no linked worktree) the teardown target resolves to the
  **primary** worktree; `git worktree remove <primary>` is refused by git outright.
- **Dangling locus.** The verb's `process.chdir` locus-hop moves only the CLI subprocess, not the agent's shell —
  the next command lands in a deleted directory.

**The fix: teardown moves out-of-band, post-merge, onto the existing `arc teardown` verb** (shipped by
`lifecycle-mechanics-tail`), which already does it correctly — post-merge from the primary on a *committed* tree,
in-place vs. linked dispatched (`git switch <base>` vs. `git worktree remove`), self-teardown locus-hopped,
constraint-safe ordering, stale-ref prune. `decompose@planning` drops its `reconcileBranch` / `reconcileWorktree`
legs (keeping `artifacts: remove`); the workflow runs `arc teardown <origin>` after the decompose PR merges.

`arc teardown` is **generalized** to fit, because the origin is *retired* (not shipped to `completed/`) and its
`plan/<name>` branch is *unmerged* (the design was redistributed into members, not git-merged): a new un-shipped /
force (**"abandoned"**) mode swaps the `isShipped` arc-state gate and the `delete-merged` containment delete for the
retired-origin case — the **conservation gate** is the upstream safety here, not git-containment. All other
mechanics are reused unchanged.

**Cross-charter fold-in.** `park@Planning` (archived `lifecycle-transition-core`) carries the *identical* in-verb
self-teardown defect and is corrected the same way in this WU — a deliberate extension recorded here per the
cohort's consistency-on-exit standard: shipping the generalized teardown surface while leaving a known-broken twin
on the old path would be the half-migrated core the standard says to absorb. `abandon@{Planning,Active}` is the
same family; it adopts the generalized surface as a scoped follow-up (captured to `USER-INBOX`), not folded here.

### The cut-map input contract

`runDecompose`'s judgment input is the cut-map (members, internal edges, distribution, dispositions) — authored by
the agent, which the executor refuses to fabricate. Since the cut-map is richer than the single-WU flag surface the
sibling verbs take (`runStub` builds `StubParams` from flags for *one* WU; decompose is the first **batch/fan-out**
verb), it reaches `arc decompose` as a **structured cut-map file** — `arc decompose <origin> --cut-map <file>` —
parsed and validated into a `DecomposeParams` at the command boundary. A file transport is non-interactive by
nature (no TTY prompt), and the same artifact is the conservation gate's concrete check target.

**Hand-rolled now, CSA-migratable later.** zod is not yet a CLI dependency (it arrives with
`cli-substrate-adoption`, downstream of this WU), so the cut-map validator is a **bespoke boundary parser-validator**
returning a discriminated result — the same `{status: "rejected"} | {status: …}` shape the shipped verbs
(`StubResult` / `ArchiveResult`) use. To make CSA's later zod migration a drop-in rather than a rewrite, it is
authored as:

- **a single boundary entry point** (one parse/validate surface, not scattered ad-hoc parsing),
- **co-located** under `lib/work-unit/` where CSA's provisional `lib/<subsystem>/schemas.ts` convention expects
  subsystem contracts, and
- **a versionable top-level shape** (a `schemaVersion`-ready object), so it slots into CSA's per-schema versioning
  model and `schema-introspection-layer`'s `arc schema` registry with zero reshape — at which point a future agent
  could validate the cut-map it authors against the published contract.

The incoming-edge **re-point sweep is greenfield** — `lifecycle-deps.ts` exposes only the read side
(`resolveDepStates`), so the sweep mutator is new code this WU builds.

### The conservation gate generalizes (judgment, stays in the workflow)

The four-step allocation gate — map every origin section *and* dependency edge to exactly one destination or
dropped-with-reason; conserve; retire only after green — is **judgment** (mapping origin sections to destinations),
which the north star deliberately keeps in the workflow. It generalizes along two axes:

- **Partial extraction** — only the *extracted subset* is mapped and conserved; the rest stays on the surviving
  origin (which is itself a cut-map entry, below). Conservation is asserted over the extracted subset, not the
  whole draft.
- **Atomic-edit homes** — a destination may be a **standing doc** (an existing artifact edited in place), not a
  newly-minted member. The gate treats such a destination as a valid home and asserts the edit lands.

### `assess-cohort-fit` cut-map — two new entry kinds

`assess-cohort-fit`'s cut-map carries `members` / `internal dependency edges` / `deliverable boundaries` today. It
gains two entry kinds (data-shape change; the *decision* of when to use them stays the method's existing judgment):

- **surviving-origin** — an entry naming the *retained* origin as a member (the extraction shape), with its
  disposition (keep-active / park).
- **existing/atomic-home** — entries naming *existing or atomic destinations* (the heterogeneous shape): a sibling
  stub, a `draft-design` block, or a standing-doc atomic edit.

### Active-state decomposition

The shipped model treats decomposition as a **Planning-state terminal act** ("a decomposing WU never activates").
Mid-implementation (Active-state) decomposition splits into two cases with different dispositions:

- **(a) Extraction-from-Active — first-class.** You are mid-implementation and realize a not-yet-built sub-concern
  is separable. This maps directly onto the **extraction / origin-survives** shape: the origin **stays Active** (its
  branch and committed code untouched), the extracted member(s) mint as `Planning` stubs, `Depends On` edges are
  added, and only the *extracted (unbuilt) subset* is distributed — covered by the partial-extraction gate. The
  one added boundary: **extraction-from-Active extracts only unbuilt scope** (built code stays with the surviving
  origin; you cannot extract code already written without the full-split machinery this WU does not build).
- **(b) Full-split-from-Active — documented escape hatch, not automated.** Genuine multi-member-built code (the
  origin retired and its committed code redistributed across several members) is rare under ARC's atomicity
  discipline and is largely a symptom of having decomposed too late or committed too coarsely. It is **recognized
  and routed**, never executed:
    - **Workflow recognition** — a whole-block precondition guard near the top of `decompose-work-unit.md`: when the
      origin is `Active` with committed code, the workflow detects the situation and routes — extraction-from-Active
      if the built code belongs to one member, or a **pointer to the guidance section** for genuine
      multi-member-built. It directs; it never runs git surgery.
    - **Guidance** — a short escape-hatch subsection in `strategy-work-organization § Decomposition`, in **general
      git terms** (no `arc decompose --active` verb): extraction-from-Active as first resort → manual `cherry-pick`
      of atomic commits onto member branches for multi-member-built → needing interleaved-commit surgery is a
      **commit-atomicity smell** (and a signal to decompose at the maturity gate next time). Adopter-appropriate —
      decomposition is a general capability.

  This keeps the lifecycle model **complete** (every Active-state path has a named destination) without **blessing**
  the smell — consistency-on-exit satisfied honestly.

### errand-character of the act

The `decompose` workflow stays a **lifecycle ceremony** (a state transition with the conservation gate). But its
backlog-stub-source and heterogeneous-home arms are **errand-character** (pure relocation, no design authored) and
run as a bounded few in-session increments — no live `plan/<name>` branch required. The symmetric and extraction
arms, on a live planning branch, remain WU-lifecycle ceremonies. `errand-lattice`'s character gate confirms the
split; this is a framing the workflow states, not a new mechanism.

### Workflow rewrite — structured forward-compat with `composable-workflows`

`decompose-work-unit.md` is rewritten to carry the **judgment half** (cut-map, conservation gate, shape-selection)
and call `runDecompose` for the **mechanics half**. The structure anticipates `composable-workflows` without
depending on it (CW is still backlog and design-heavy):

- **One workflow**, with the transform-shape arms authored as **whole conditional blocks** atop the existing
  parent-position arms (the way the workflow already authors its named `cohort-scaffold` and `park-exit` blocks).
  Whole blocks lift cleanly into CW fragments later; intra-step branches do not, so shape conditionals stay
  block-level, not scattered through every step.
- **Mechanics → `runDecompose`** (the code-tier mutator — CW's eventual `public+fixed` method); **judgment → the
  workflow** (CW's eventual `private+fixed` orchestration fragment). This *is* the cohort's north-star
  mechanics/judgment split, authored so CW hoists it with no rewrite.
- The commit `Context` footer uses `(maintenance)` (the `decomposition` token is not in the meta-`*` parenthetical
  allowlist; precedent already uses `(maintenance)` for decomposition commits).

## Alternatives & Rationale

- **Leave `decompose` markdown-orchestrated (status quo) vs. build `runDecompose`.** Rejected status quo: it is the
  lone unmigrated lifecycle verb after `runStub` / `runArchive` / `runPark` shipped, and the reserved table edges +
  `lifecycle-mechanics-tail`'s explicit carve-out + the cohort's "deterministic mechanics in the CLI" north star
  all point to the executor. Leaving it markdown-only fails the consistency-on-exit standard.
- **Separate workflow entry points per transform shape vs. one workflow with whole-block branching.** Rejected
  separate entry points: they fragment the shared conservation gate and the `cohort-scaffold` / teardown cores
  across files. One workflow with whole-block arms keeps one judgment home, composes the two orthogonal axes over
  shared cores, and is the cleaner CW-fragment seam.
- **Automated full-split-from-Active (`decompose@active` edge + code-allocation gate + cherry-pick orchestration)
  vs. documented escape hatch.** Rejected the automated path: in industry terms it is "retroactively split a branch
  with committed work into N branches" — the clean case (cherry-pick atomic commits) is normal but the
  interleaved-commit case is a recognized smell whose industry answer is *prevention* (commit atomically; stack
  prospectively), not a tool. Nobody ships a "split my branch" button. ARC's own atomicity discipline makes the
  clean case dominant and the smell case rare, and the common realized-scope case collapses into
  extraction-from-Active anyway. Documenting the manual path + naming the smell is the honest, complete answer;
  automating it would bless the wrong thing and tip `Class` to `Novel`.
- **New `decompose@active` edge vs. generalize the extraction shape.** Rejected a new edge: the safe Active-state
  case (shed unbuilt scope, origin survives) needs no origin-retire edge at all — it is the extraction shape with
  the origin already Active. A new edge would exist only to serve the rejected full-split case.
- **A dedicated `decomposition` commit-footer category vs. `(maintenance)`.** Rejected a dedicated category: it
  would create an asymmetry (`park` / `resume` / `abandon` / `promote` / `demote` all bucket to `(maintenance)`);
  completing the ceremony-category set is a separate vocabulary concern.
- **Cut-map transport — structured file vs. repeated flags vs. a workflow loop over `arc stub`.** Rejected repeated
  flags: N members × (Class + Design + per-member `Depends On` + distribution) becomes a fragile mini-language.
  Rejected the workflow loop (call `arc stub --cohort` per member, orchestrate teardown / re-point in markdown): it
  walks back the single-executor decision and re-fragments the fan-out, and the re-point sweep still needs a home.
  The structured **cut-map file** is the right transport precisely because decompose is the first batch verb — a
  richer input than the single-WU flag surface is justified, not a smell — and it is non-interactive by nature
  (no TTY prompt to later migrate to CSA's prompting substrate) and doubles as the conservation gate's check target.
- **Adopt zod for the cut-map validator now vs. hand-roll.** Rejected pulling zod in early: it is not a CLI
  dependency until `cli-substrate-adoption`, which sits *downstream* of this WU, so a dependency would invert the
  sequencing and block this active WU on a multi-week future one. Hand-rolling a bespoke boundary validator — shaped
  as a single co-located, versionable surface — is the cohort's stated "hand-roll now, CSA migrates later" posture
  and makes the eventual zod swap a drop-in.
- **Extraction-park as a `runDecompose` flag vs. a separate `arc park` step.** Rejected the flag: the cohort frames
  the relocate as `park` composing on, never a decompose mechanic, and the spec mints no relocate-the-origin
  primitive. Sequencing two orthogonal primitives in the workflow (`arc decompose` then `arc park`) keeps the
  composition visible and auditable, and is safe because keep-active is already terminal (the park is purely
  additive).
- **Heterogeneous fold / atomic-edit homes encoded by the executor vs. workflow-authored.** Rejected an executor
  fold/atomic-edit disposition: it would push content authorship into the mechanics tier, against the executor's
  no-fabricate-content contract, and add a large new surface. The edits are same-concern, known-home, and
  conservation-required, so they are direct edits riding the decompose PR — judgment the workflow authors, recorded
  in the allocation map.

## Cross-cutting Considerations

- **Testing.** Unit tests for `runDecompose`'s legs (batch scaffold field-inheritance, the new edge re-point sweep
  mutator, emptied-subdir prune) and the cut-map parse/validate boundary (well-formed accept, malformed reject),
  following the executor family's existing unit-test pattern; integration tests for each transform shape end-to-end
  (origin disposition + member scaffold + ROADMAP delta); a regression test that the symmetric shape reproduces the
  prior hand-rolled result. The conservation gate is workflow judgment (not code), validated by the workflow's
  interlock surface, not a unit test.

  **Teardown coverage (Phase 4.R) — close the gap that hid the self-teardown defect.** The shipped tests missed it
  by testing imagined behavior: they drove the verb **cores** with hand-fed *cross-worktree* inputs the CLI never
  generates, and there is no E2E tier exercising the destructive verbs through the actual command. Per
  `strategy-testing-methodology` (test behavior through public interfaces; E2E = full CLI invocation, no mocking
  git), 4.R adds:
    - **E2E** invoking `arc decompose` (and `arc teardown`) via `child_process` in real temp repos, in **both**
      worktree models — **in-place (`--here`)** and **spawned/linked** — asserting on-disk + git outcomes (origin
      retired, members scaffolded, branch gone, worktree gone or primary switched to `base`).
    - **Integration tests reworked onto the handler's real run-context** (`handleDecompose` resolution, not
      hand-fed cross-worktree inputs), so the self-teardown configuration the CLI actually produces is in the
      tested path.
    - **The generalized `arc teardown` is test-first** — unit for the gate + delete-variant selection
      (shipped/merged vs. un-shipped/force), then real-git integration for the force + un-shipped mode across
      in-place and linked, asserting the four behaviors that silently broke: dirty-tree refusal, self-teardown
      locus-hop, in-place primary-switch (no removal), and unmerged force-delete.

  Structural lesson recorded for the testing-standards follow-up: the bug class is *a test constructs inputs the
  production code path never generates* — guarded against by driving destructive verbs through the CLI seam.
- **Migration / rollout.** The `runDecompose` build, the `assess-cohort-fit` cut-map extension, the workflow
  rewrite, and the `strategy-work-organization` guidance land together as one WU. No data migration — existing
  decomposed cohorts are unaffected (decomposition is a one-time transform). The symmetric arm's behavior is
  preserved (regression-tested).
- **arc-backend safety (ADR-022).** All `runDecompose` legs resolve state from logical `(phase, location)` + meta
  fields, never git inference — so the executor lifts onto OSD's eventual record substrate with zero reshape.
- **User-facing surface.** A new `arc decompose <origin> --cut-map <file>` command in the CLI's Orchestration
  category (consistent with TECHNICAL-OVERVIEW § 2). The cut-map judgment is authored by the agent in the workflow
  and reaches the command as the structured cut-map file. The escape-hatch guidance in `strategy-work-organization`
  is the user-facing documentation deliverable.
- **Forward-compat seams.** `composable-workflows` (whole-block arms + named cores, hoistable later);
  `cohort-cut-coherence` (rebases its decision rail onto the cut-map shape shipped here); `cli-substrate-adoption`
  (migrates the hand-rolled cut-map validator to a zod schema — captured as a CSA migration target via `arc-inbox`
  with a `cli-substrate-adoption` target, the precedent CSA's inbound buffer already uses; not a body edit to CSA's
  draft now); `schema-introspection-layer` (publishes the cut-map contract via `arc schema` once CSA schematizes
  it); `single-owner-wu-model` (cross-cohort pointer for ownership-distribution motivation). No edge gates this WU
  on any of them.

## Success Criteria

Validated at work-unit completion:

- `arc decompose` exists and executes the **symmetric** shape end-to-end (origin retired, N members scaffolded with
  correct field inheritance, incoming edges re-pointed, ROADMAP regenerated), reproducing the prior hand-rolled
  result on a regression fixture.
- **All four transform shapes** have a named, reachable path: symmetric / extraction / backlog-stub-source executed
  by `runDecompose`; heterogeneous-home orchestrated by the workflow over the executor, with its fold / atomic-edit
  destinations authored as **direct edits that ride the decompose PR and appear in the allocation map** — not inbox
  captures.
- `arc decompose <origin> --cut-map <file>` consumes a **structured cut-map file** parsed and validated at the
  command boundary — a malformed cut-map is rejected before any mutation. The validator is a **single co-located
  boundary surface** (`lib/work-unit/`), hand-rolled and versionable so CSA's later zod migration is a drop-in.
- The **batch N-member scaffold** produces N members (N ≥ 2) with `Origin` inherited, `Design` / `Cohort`
  (dual-placed) / `Class` / `State` set, and `Depends On` distributed by actual need — verified across the three
  parent-position arms.
- The extraction shape's optional origin-park is a **separate `arc park` step** sequenced by the workflow, not a
  `runDecompose` flag; keep-active (no park) is a valid terminal outcome.
- The **conservation gate** (workflow) asserts conservation under partial extraction (extracted subset only) and
  atomic-edit homes (standing-doc destination), with the allocation map rendered into the PR description.
- `assess-cohort-fit`'s cut-map carries the **surviving-origin** and **existing/atomic-home** entry kinds, exercised
  by the extraction and heterogeneous shapes respectively.
- **Extraction-from-Active** runs first-class (origin stays Active, only unbuilt scope extracted); **full-split-from-
  Active** is recognized by the workflow guard and routed to the `strategy-work-organization` guidance — no
  automated edge exists.
- The rewritten `decompose-work-unit.md` calls `runDecompose` for the scaffold / retire / re-point mechanics and
  `arc teardown` for the post-merge branch + worktree teardown; it contains no hand-rolled relocation or teardown
  logic; its commit `Context` footer uses `(maintenance)`.
- The emptied-subdir prune fires on a retired backlog-stub-source origin (no orphaned cohort subdir).
- **(Phase 4.R)** A started origin's branch + worktree teardown runs **out-of-band, post-merge** via a generalized
  `arc teardown` (un-shipped / force mode), not an in-verb leg — proven by real-git E2E across in-place and linked
  worktrees. `park@Planning` is corrected onto the same surface; `decompose@planning` no longer fires
  `reconcileBranch` / `reconcileWorktree`.

## Open Questions

The three forks that shaped the executor's contract are settled into Proposed Design above (cut-map file input;
extraction-park as a separate `arc park` step; fold / atomic-edit homes workflow-authored, not executor-encoded).
What remains is genuine implementation detail, resolved during the work — not deferred design:

- **Exact cut-map file schema, and whether it unifies with the allocation map.** The field-level encoding of the
  cut-map object (member records, edge lists, disposition tags, the `schemaVersion` envelope) settles at
  implementation. Open sub-question, leaning **unify**: whether the structured cut-map file *is* the same artifact
  the workflow renders into the allocation-map PR description (one source, two views) or a related-but-distinct one
  — decided when the validator and the allocation-map render are built together.

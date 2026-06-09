# Task List: Decomposition Machinery

- **Design:** `spec-decomposition-machinery.md`

---

## **Phase 1:** Constitutional foundation, concept introduction & invented-model rationale

_Purpose:_ Establish the normative contract the rest of the WU consumes — introduce the cohort concept into the
always-loaded surface, promote its constitutive rules, author the grouping-taxonomy semantics into their durable
strategy home, add `cohort-*` to the movable-artifact enumeration, and record the invented model's cross-cutting
rationale in a companion ADR. This phase leads because it sets the contract every later surface references.

_Design decisions:_ Document-tier discipline drives the split (mirroring how `class-model-foundation` seated the
`Class` model). AGENT-BRIEF.ARC § Vocabulary _introduces_ the term and its two constitutive rules; always-loaded
DEV-RULES.ARC carries only the `cohort-*` movable-artifact addition (the rules are enforced by the
cohort-consistency invariant, not restated as DEV-RULES prose); `strategy-work-organization` carries the
taxonomy elaboration and the consumed WU-sizing standard; the companion ADR carries the durable invented-model
rationale (internal-only, single-copy, referenced by no shipped surface — adopters have their own ADRs). Shipped
surfaces (brief, rules, strategy) are two-copy — edit the package source, then sync the `.arc/` mirror.

_Anchors:_ B1–B6, C5 (movable-enum addition), F1, F2, A6 (sizing co-home), I; SC3, SC7, SC9 (partial), SC10.

### `[x]` **1.1 Introduce the `Cohort` concept in AGENT-BRIEF.ARC § Vocabulary**

- _Goal:_ AGENT-BRIEF.ARC § Vocabulary carries a `Cohort` entry so an agent knows the concept exists and what it
  means without loading the method, strategy, or workflow — a deliberate grouping of sibling WUs with a
  constitutive `cohort-{name}.md`, the nested-cohort / sub-cohort framing (path-valued, ≤2 segments), and the
  WU-leaf relationship.
- _Outcome:_ Entry added between `Class` and `Atomic` (both copies). It is now the **sole always-loaded surface**
  carrying the two constitutive rules — the standalone DEV-RULES § Cohorts promotion was dropped as duplicative
  (see 1.2; spec F2/SC7 amended).

### `[x]` **1.2 Enumerate `cohort-*` as a movable artifact in DEV-RULES.ARC**

- _Goal:_ `cohort-*` is added to the movable-artifact enumeration in DEV-RULES.ARC § Artifact relocatability +
  § `.arc/` artifact references, so the existing relocatability + reference-hygiene rules cover the new record
  type. The two constitutive rules are _not_ promoted as standalone DEV-RULES behavior — the brief glossary (1.1)
  introduces them on the always-loaded surface and the cohort-consistency invariant (Phase 5) enforces them, so
  restating them in DEV-RULES would add no coverage (the brief loads every session too).
- _Outcome:_ `cohort-*` added to both enumerations (both copies); framing broadened to "movable `.arc/`
  artifacts — a WU's …, plus `cohort-*`" (the structure keeps the cohort-scoped vs. WU-scoped distinction that
  3.3.a must not flatten), and § Artifact relocatability softened to lifecycle-state-neutral phrasing. Scope
  narrowed mid-task: the original standalone rule-promotion (1.2.a) was cut as duplicative of 1.1; spec F2/SC7
  and the Phase 1 preamble amended to match.
- **Strategies:** strategy-package-project-sync.md

### `[x]` **1.3 Author the grouping-taxonomy semantics + WU-sizing standard into `strategy-work-organization`**

- _Goal:_ `strategy-work-organization` becomes the shippable home for the cohort grouping taxonomy — one grouping
  kind with coordination-by-degree, the WU leaf, the one-level nesting cap, the path-valued `Cohort` semantics +
  dir-path mirroring, and the three decomposition arms — and co-homes the WU-sizing standard the
  `assess-cohort-fit` method consumes, with § Task Lists and Branches reconciled so the strategy describes one
  model.
- **Strategies:** strategy-work-organization.md, strategy-package-project-sync.md

    - `[x]` **1.3.a Author the cohort taxonomy semantics**
        - One grouping kind (the cohort), coordination as a content continuum by degree, the WU leaf, the
          one-level nesting cap, the path-valued `Cohort` semantics + on-disk dir-path mirroring; "theme" survives
          as informal prose only, never a schema kind. (B1–B4)

    - `[x]` **1.3.b Author the three decomposition arms + the at-cap provenance model**
        - The three arms by parent position (standalone → top-level cohort; in-cohort → sub-cohort; at-cap →
          lateral fan-out), name-preservation across arms 1–2, and the at-cap grouping-as-provenance design (the
          write-once fan-out note, slugs content-legible / never ordinal, order in `Depends On`). (B5, B6)

    - `[x]` **1.3.c Co-home the WU-sizing standard the method consumes**
        - The sizing heuristics as a standard: distinct deliverables / reviewable surfaces, the LOC + file-count
          heads-up, stack-vs-cohort (sequential → stack, independent-ish → cohort). (A6 home; the cohort≈epic /
          WU≈story analogy routed to `adr-024` as known-practice grounding rather than the shipped strategy.)

    - `[x]` **1.3.d Locally neutralize § Task Lists and Branches where this WU's edits leave it self-contradicting**
        - Reconcile the section's multi-branch-per-one-task-list framing (stacked-PRs / phased / team-sub-branches)
          to the cohort taxonomy's model — decomposition yields a cohort of self-contained one-branch WUs — insofar
          as the new taxonomy + sizing standard render it self-contradicting (Open Question 2: local-neutralize yes,
          bounded). The broad cross-surface tier reconciliation stays `doc-cascade-sweep`'s regardless.

- _Outcome:_ New top-level `## Cohorts` section authored in `strategy-work-organization` (both copies), between
  § Class Model and § Task Lists and Branches: one grouping kind with coordination-by-degree, the one-level
  nesting cap + path-valued `Cohort` semantics / dir-path mirroring, the three decomposition arms + at-cap
  provenance, and the WU-sizing standard (the named contract `assess-cohort-fit` consumes in 2.1.c). § Task Lists
  and Branches reconciled to the cohort model (default 1:1; oversize → cohort/stack of one-branch WUs; team
  sub-branches reframed as a collaboration mechanism) — bounded local neutralization; the cross-surface sweep
  stays `doc-cascade-sweep`'s.

### `[x]` **1.4 Author the companion ADR for the invented model**

- _Goal:_ An internal-only companion ADR (`adr-024`) records the invented model's durable, cross-cutting
  rationale — Model B over A; orthogonality over size; one grouping kind with coordination-by-degree; the
  one-level nesting cap with at-cap lateral fan-out + provenance; the method/workflow split with the cut-map as
  the DRY interface; and no coordinator/DRI — joining and extending the ADR-019/021/022 line.
- **Strategies:** strategy-adr-methodology.md

    - `[x]` **1.4.a Draft adr-024 (context / decision / consequences)**
        - The invented model and its grounds, mirroring adr-023's decided-here / ratifies-downstream pattern;
          cites ADR-019/021/022.

    - `[x]` **1.4.b Record risks / alternatives and wire ADR cross-references**
        - Alternatives (Model A; size-as-discriminator; categorical theme/cohort tier set; maintained roster;
          cohort-owner role; unbounded nesting) as rejected, with the chosen rationale; confirm anchors resolve.

- _Outcome:_ `adr-024-cohort-decomposition-model.md` authored (Proposed; promote to Accepted when this WU
  integrates), citing ADR-019/020/021/022/023 — all anchors resolve; no README index to register (ADRs are
  filesystem-browsed). The epic/story analogy lands here as known-practice grounding, explicitly kept out of the
  normative surfaces. Also corrected a stale § Cross-cutting "User-facing impact" line left by the 1.2 collapse
  (DEV-RULES gains the `cohort-*` enumeration entry, not the two rules).

## **Phase 2:** The `assess-cohort-fit` decide method + acceptance test

_Purpose:_ Author the planning-time decomposition method as a paired sibling of `classify-work-unit`, co-located
with it and declared at its design-stage fire-points, then validate its discriminator empirically by re-deriving
Concurrent Work Conventions's decomposition from CWC's one settled draft.

_Design decisions:_ The method uses the existing loadable-method mechanism (declared via the `arc.methods`
frontmatter bundle alongside `resolve-planning-depth` / `classify-work-unit`; no `composable-workflows`
dependency), authored as a self-contained extractable block. It consumes the WU-sizing standard co-homed in
`strategy-work-organization` (Phase 1) rather than re-authoring it. The acceptance test is read-only dogfood —
the verdict stays in the primary context (sub-agent-scope rule), as `class-model-foundation`'s triage gates ran.

_Anchors:_ A1–A9, H (method declaration); SC1, SC2.

### `[x]` **2.1 Author the `assess-cohort-fit` method**

- _Goal:_ A loadable `assess-cohort-fit` method states the upper-bound WU-vs-cohort decision once, co-located with
  `classify-work-unit` as its paired sibling: the orthogonality-not-size discriminator, the two guard rails,
  design-maturity timing, plan-vs-delivery grouping, Model-B-only, the member-slug naming heuristic, the sizing
  heuristics (consuming the strategy standard), and the cut-map output — so the decision logic has one DRY home.

    - `[x]` **2.1.a Author the discriminator + two guard rails + maturity-gated timing**
        - `§ The discriminator — orthogonality, not size` (concern multiplicity as trigger, LOC as heads-up),
          `§ Two guard rails` (lower: don't split below WU-warrant; upper: don't split coupled one-design work for
          size), and `§ Timing — gated on design maturity` (the cut is firm at the maturity gate; what stays open
          is each member's ordinary spec-time openness). (A1–A3)

    - `[x]` **2.1.b Author Model-B-only, plan-vs-delivery grouping, and the cut-map output**
        - `§ When it fires affirmative — a cohort of self-contained WUs` (Model B only; "stacked PRs" survives
          solely as the cohort's dependency-ordered delivery mode; plan-as-one-draft / deliver-as-N-WUs) and
          `§ Output — the cut-map` (members + slugs + internal edges + deliverable boundaries, the DRY interface
          `decompose-work-unit` consumes). (A4, A5, A8)

    - `[x]` **2.1.c Author the sizing heuristics + the member-slug naming heuristic**
        - `§ Sizing heuristics` consuming the `strategy-work-organization` § WU sizing standard (not re-authored —
          count deliverables/surfaces, LOC/file count as heads-up, stack vs. cohort) and `§ Member-slug naming`
          (slugs read legibly out of context, never order-encoding ordinals — order lives in `Depends On`). (A6, A7)

- _Outcome:_ Authored `system/methods/assess-cohort-fit.md` (two-copy, byte-identical) as `classify-work-unit`'s
  paired sibling — `override-active: false` frontmatter, a `> Contract:` blockquote naming the two design-stage
  fire-points (`draft-design` / `create-spec`, not depth-gated), the `.override` placeholder, and the `.default`
  decide procedure. Authored as a self-contained extractable block (no `composable-workflows` dependency), so the
  method declares via the existing `arc.methods` bundle. Fire-point declaration + README registration deferred to
  Task 2.2.

### `[x]` **2.2 Declare the method at its fire-points and register it**

- _Goal:_ `assess-cohort-fit` fires at the two derivation stages where design is the live artifact —
  `draft-design` and `create-spec` — declared via each stage's `arc.methods` frontmatter bundle (not depth-gated),
  and is registered in the methods README index, so the cheap decompose-candidacy check runs at every design-stage
  read without restating the method.

    - `[x]` **2.2.a Declare the method in `draft-design` and `create-spec` and add the fire-point steps**
        - Added `assess-cohort-fit` to the `arc.methods` frontmatter of both workflows (two-copy), each with a
          fire-point at the "Resolve depth & Class" design-axis read — predicted-decomposition framing in
          `draft-design`, emergent in `create-spec` — referenced via the `[assess-cohort-fit]` heading-slug link,
          never the `#name` extension marker.

    - `[x]` **2.2.b Register the method in the methods README index**
        - Index entry placed next to `classify-work-unit`, plus two bidirectional coupling rows
          (`assess-cohort-fit ↔ classify-work-unit` — "Upper/lower WU-boundary tests").

- _Outcome:_ `lint:arc:triggers` now passes — the method has its declaring workflows, so the cheap
  decompose-candidacy confirm runs at every design-stage read without the method restating itself. The two
  fire-points read the same design-axis input `classify-work-unit` already keys on, making the upper/lower
  boundary tests a true paired sibling at one read.

### `[ ]` **2.3 Acceptance test — re-derive CWC's D1–D4 from CWC's settled draft**

- _Goal:_ Applying the `assess-cohort-fit` discriminator + the two guard rails to Concurrent Work Conventions's
  one settled draft cleanly re-derives CWC's actual decomposition (its D1–D4 members) without strain — confirming
  the procedure works (if it strains, the rule is wrong, not the cut).
- _Approach:_ Read-only dogfood; the verdict stays in the primary context (sub-agent-scope rule), as
  `class-model-foundation`'s 5.2 / 5.R.2 triage gates ran. Surface the re-derivation against CWC's actual D1–D4
  for confirmation; a clean match passes, a strained one routes back to the method (2.1).
- _Note:_ CWC = Concurrent Work Conventions; the input is its settled draft at
  `draft-concurrent-work-conventions.md` § Delivery plan / Decomposition table (the D1–D4 four-WU cut).
- _Note:_ The draft already _states_ D1–D4 as a settled cut, so keep the dogfood honest — apply the discriminator +
  rails to CWC's scope / problem structure and _compare_ to the stated D1–D4, rather than reading the answer off
  the table.

## **Phase 3:** The `cohort-{name}.md` record + `template-cohort.md`

_Purpose:_ Establish the constitutive cohort record — its Purpose floor, coordination-by-degree body, per-member
partition, and the design-vs-coordination forcing function — plus the template generalized from the live
prototype, and route the cohort doc's concurrency seam to Concurrent Work Conventions.

_Design decisions:_ `template-cohort.md` is generalized from the live prototype (`cohort-agile-wu-lifecycle.md`)
at execution, field set explicitly marked prototype-iterate (the rare legitimate deferral; Open Question 1) —
not designed top-down. `cohort-*` adopts the WU-artifact relocatability + reference-hygiene invariant wholesale;
the movable-artifact _enumeration_ addition lands in Phase 1, the per-doc hygiene application here. The cohort doc
is the one shared-mutable planning artifact — the per-member partition is its concurrency mechanism; the two CWC
seam notes route out (runtime concurrency safety is CWC's).

_Anchors:_ C1–C6, G; SC4, SC9.

### `[ ]` **3.1 Define the `cohort-{name}.md` record shape and the design-vs-coordination forcing function**

- _Goal:_ The `cohort-{name}.md` record is defined as constitutive of every cohort (ADR-022 family): a required
  one-paragraph Purpose floor scaling up to full coordination by degree, per-member sections keyed by slug (a
  partitioned coordination surface, not a roster — membership stays derived), no coordinator/DRI, and the
  design-vs-coordination boundary _forced_ by the per-member partition.
- _Rationale:_ The forcing function is the design: a contract that drives a member's task list must live in that
  member's spec, so the doc holds only a pointer + consumer list; a per-member section that fills with
  task-driving design is the visible smell that the content belongs in the spec. The shape is documented in the
  cohort taxonomy home (alongside 1.3) and realized in `template-cohort.md` (3.2).
- _Note:_ Pre-existing cohort docs predate this shape and diverge (esp. `cohort-agile-parallelism.md` — prose H1 +
  a roster-style "Membership and ownership map" against C2); bringing them into conformance is `doc-cascade-sweep`'s
  broad cross-surface sweep (Non-Goals), routed there directly. This WU conforms only its own authored / edited docs.

    - `[ ]` **3.1.a Define the constitutive-record shape**
        - Purpose floor (the slug expanded; the grouping's reality check), coordination-by-degree body, per-member
          sections keyed by slug as a partitioned surface, membership derived (no roster / status table), no
          DRI — the partition _is_ the coordination mechanism in place of an owner. (C1, C2, C4)

    - `[ ]` **3.1.b State the design-vs-coordination forcing function**
        - Cohort-level (ownerless shared material) vs per-member (exposes/consumes) coordination; an owned
          contract → owner's spec + a pointer in the doc; the partition as a deliberate forcing function. (C3)

### `[ ]` **3.2 Author `template-cohort.md` from the live prototype (field set prototype-iterate)**

- _Goal:_ `template-cohort.md` exists at `reference/templates/arc/work-unit/`, generalized from the live prototype
  (`cohort-agile-wu-lifecycle.md`) — H1 + uniform preamble, the Purpose floor, the optional coordination scaffold
  (shared contracts, closeout criteria, per-member sections) — with its coordination field set explicitly marked
  prototype-iterate, so `decompose-work-unit` scaffolds a convention-correct cohort doc.
- _Rationale:_ The exact field set is the rare legitimate by-method deferral (cf. the spec templates) —
  generalized from the prototype at execution, not designed top-down; marked prototype-iterate, not design debt
  (Open Question 1).
- _Note:_ Generalize from the prototype's _actual_ sections (Shared contracts / Soft coordination / Cross-cohort /
  ADR anchors), treating spec-named-but-absent slots (e.g. closeout criteria, C1) as optional scaffold rather than
  copying or omitting wholesale — the prototype-iterate latitude covers exactly this reconciliation.
- _Note:_ While the prototype is open, correct this WU's own member section in `cohort-agile-wu-lifecycle.md`
  (`### decomposition-machinery` § Exposes): the stale `assess-decomposition` → `assess-cohort-fit` (single live
  reference; in-scope as a per-member-partition edit, not a downstream sweep).
- **Strategies:** strategy-package-project-sync.md, strategy-file-classification.md

    - `[ ]` **3.2.a Author the template from the prototype**
        - H1 + uniform preamble, Purpose floor, the coordination scaffold (shared contracts, closeout criteria,
          per-member-by-slug sections); two-copy.

    - `[ ]` **3.2.b Mark the field set prototype-iterate and register the template**
        - The prototype-iterate marker on the coordination field set; register in `reference/templates/arc/README.md`
          § Contents (extend the `work-unit/` bullet alongside `template-meta` / `template-draft` / `template-tasks`),
          both copies — there is no work-unit-level README.

### `[ ]` **3.3 Apply relocatability + reference hygiene to `cohort-*`; route the concurrency seam to CWC**

- _Goal:_ `cohort-{name}.md` adopts the WU-artifact relocatability + reference-hygiene invariant wholesale —
  inbound references backticked-filename-only, outbound no relative-path links, relocating
  `backlog/planned/<cohort>[/<subcohort>]/ → completed/` when the cohort's last member ships as a pure `git mv` —
  and the cohort doc's concurrency seam is routed to Concurrent Work Conventions with the partition-first /
  serialize-via-main fallback recorded.
- _Context:_ The movable-artifact _enumeration_ addition lands in 1.2; this applies the per-doc hygiene
  (satisfiable by construction — sibling drafts/specs named by backticked filename, the parent-cohort pointer
  derivable from the `Cohort` path). Routing only — runtime concurrency safety is CWC's.

    - `[ ]` **3.3.a Apply the relocatability + reference-hygiene invariant to `cohort-*`**
        - Confirm inbound-filename-only / outbound-no-relative-path hygiene on the record shape + template; the
          `backlog/ → completed/` pure-`git mv` relocation. (C5, SC9)

    - `[ ]` **3.3.b Route the concurrency seam to Concurrent Work Conventions**
        - The two notes (the advisory cross-cutting gate's blind spot on the cohort-owned doc; the escape hatch if
          the partition proves insufficient) routed to CWC's inbound buffer; partition-first lean recorded. (G)

## **Phase 4:** The `decompose-work-unit` lifecycle workflow

_Purpose:_ Author the park-shaped WU→cohort execute workflow — its step sequence, field-inheritance and
dependency-edge-by-need distribution, the four-step distribution-discipline gate with its conservation check and
incoming-`Depends On` sweep, worktree-kind teardown, the predicted/emergent arms, the shared-primitive factoring,
and the manual bootstrapping checks — written for clean future composition.

_Design decisions:_ A separate workflow from `integrate-work-unit` (keeping `integrate` code-shipping-focused),
reusing the **park** _pattern_'s mechanics rather than an integrate ceremony. There is no `park-work-unit.md`
workflow yet (park/resume are the planning conductor's, §20) — so decompose authors the shared
`active/ → backlog/` + park-PR + worktree-kind-teardown choreography here, single-source, as named extractable
blocks; `park-work-unit.md` / `resume-work-unit.md` reuse them when the conductor ships (a coordination note is
routed to its §20). Shared steps are named, extractable blocks with stable-heading-slug cross-references (the
`composable-workflows` forward-compat constraint, H) — never ordinals, never the extension-reserved `#name`
marker. The manual three-check bootstrapping version (E3) lives in the workflow until Phase 5 automates it.
Codified against this cohort's own
manual run (D9); the full codification-against-the-run reconciliation is `doc-cascade-sweep`'s.

_Anchors:_ D1–D9, E3, H; SC5, SC8.

### `[ ]` **4.1 Author `decompose-work-unit` — park-shaped exit, the step sequence, teardown**

- _Goal:_ `system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md` exists as a genuine lifecycle
  transition (a WU changing what it is) — a park-shaped exit running on the originating planning branch as its
  terminal act, the D2 step sequence, and worktree-kind-branched teardown.
- _Approach:_ Author the `active/ → backlog/` + PR-to-`main` + branch/worktree-teardown choreography inline (the
  park _pattern_ — no shipped `park-work-unit.md` to delegate to), as named extractable blocks; not an integrate
  (no code deliverable, no `completed/` archive). No new State value; the origin meta is deleted (the WU ceases to
  be a WU). Two-copy.
- **Strategies:** strategy-workflow-authoring.md, strategy-work-organization.md

    - `[ ]` **4.1.a Author the park-shaped exit + the D2 step sequence**
        - Mint cohort → backfill parent doc if absent → scaffold N member stubs → distribute design → re-point
          incoming deps → verify (the three consistency conditions) → retire origin `meta-*` + `draft-*` → regen
          ROADMAP → park PR → teardown. (D1, D2, D4)
        - ROADMAP regen mirrors `archive-work-unit` step 4 ("re-render per strategy § ROADMAP"); decompose is a
          _new_ regen fire-point (a WU leaving `active/` → becoming a cohort changes the render) — add it to
          strategy § Regeneration fire-points here, or leave the fire-point-list reconciliation to
          `doc-cascade-sweep` if it bulks scope.

    - `[ ]` **4.1.b Specify worktree-kind-branched teardown**
        - primary → switch back to `branch.base` + delete local/remote `plan/<name>`, no worktree removal; linked
          → delete branch + `git worktree remove <path>`. (D6)

    - `[ ]` **4.1.c State the at-cap arm variant**
        - No cohort minted; scaffold the members under the existing parent and write the fan-out provenance note
          into the parent cohort doc — every other step unchanged. (D2 at-cap parenthetical)

### `[ ]` **4.2 Specify field inheritance + dependency-edge-by-need distribution on minted stubs**

- _Goal:_ The workflow specifies how minted member stubs inherit fields — shared `Origin`, own
  `Design: draft-<member>.md`, path-set `Cohort` (meta + dual-placed in the draft header), own `Class` — and
  distributes `Depends On` by _actual need_: outgoing ancestor edges inherited only where the member genuinely
  depends; internal edges authored fresh from delivery order; incoming edges re-pointed to the delivering
  member(s).
- _Rationale:_ Blanket-inheriting outgoing edges manufactures artificial serialization. Edge distribution authors
  `Depends On` as live gates among members — consistent with the live-gate semantics `operational-state-docs`
  settles (a coordination seam, not a blocker). (D3)

### `[ ]` **4.3 Specify the four-step distribution discipline — conservation gate + incoming-`Depends On` sweep**

- _Goal:_ The workflow carries the emergent-arm distribution discipline as a four-step gate and the
  incoming-`Depends On` sweep, so no origin content or edge is silently lost when a monolith is split.
- _Note:_ The allocation map is not throwaway — it becomes the decomposition PR description (the "here's where
  everything went" audit trail). The sweep is broader than the cut-map — this cohort's own decomposition found
  three incoming edges where the cut-map listed one.

    - `[ ]` **4.3.a Specify the four-step distribution gate**
        - Allocation map (every section / design-point + every dependency edge → destination, or
          dropped-with-reason) → classify by the design-vs-coordination boundary → conservation gate (each lands
          in exactly one destination or is explicitly dropped-with-reason; gates retirement) → retire the origin
          only after the gate passes. (D5)

    - `[ ]` **4.3.b Specify the incoming-`Depends On` sweep**
        - Sweep every meta whose `Depends On` names the origin and re-point to the delivering member(s), not only
          the cut-map's named dependents. (D2 sweep, SC8)

### `[ ]` **4.4 Factor shared primitives + the predicted/emergent arms + manual bootstrapping checks + PR variant**

- _Goal:_ The workflow's shared steps are factored for reuse and forward composition — the cohort-scaffold
  primitive shared with the predicted arm (both arms live in this WU), and the `active/ → backlog/` + park-PR +
  worktree-kind-teardown block authored single-source here for `integrate` / `park-work-unit` to adopt later
  (forward-compat, H — no present-tense integrate refactor) — the predicted-vs-emergent arms are distinguished, the
  manual three-check bootstrapping version is documented, and the decomposition-PR description variant is specified.
- _Approach:_ Shared steps as named, extractable blocks referenced by stable heading slug (forward-compat, H).
  Layering: `decompose-work-unit = [distribution-discipline + retire-origin] ∘ cohort-scaffold ∘ PR-cleanup`; the
  predicted arm = `cohort-scaffold` alone (no monolith-split). `integrate-work-unit` adopting the PR-cleanup block
  is deferred — it stops before merge and owns no teardown today (teardown is session-init's sweep); adopting it
  eagerly is a behavior change rippling to `archive` + the sweep, routed to CWC's inbound buffer as its own
  question. Codified against this cohort's own manual run (D9, PR #55).
- **Strategies:** strategy-workflow-authoring.md

    - `[ ]` **4.4.a Factor the cohort-scaffold + PR-cleanup primitives as named extractable blocks**
        - Both authored single-source as stable-heading-slug-referenced blocks: cohort-scaffold reused by the
          predicted arm now; the PR-cleanup block authored for `integrate` / `park-work-unit` to adopt when
          `composable-workflows` lands (no integrate edit here). (D8, H)

    - `[ ]` **4.4.b Distinguish the predicted vs emergent arms**
        - Predicted (affirmative during draft-design; author directly into the cohort structure, no monolith, no
          `decompose-work-unit` run) vs emergent (a matured monolith split at create-spec — the arm the
          distribution discipline serves). (D7)

    - `[ ]` **4.4.c Document the manual bootstrapping checks + the decomposition-PR description variant**
        - The manual three-condition checks for the pre-automation run (E3), superseded once Phase 5 ships; the
          lightweight decomposition-PR description variant (the allocation-map-as-PR-story). (E3, D9)

## **Phase 5:** The cohort-consistency invariant + enforcement

_Purpose:_ Ship the three-condition cohort-consistency guard as a backlog-scoped structural validator with
pre-commit wiring, co-located with the invariant it enforces so the invariant is never defined-but-unenforced,
and doubling as the cohort doc's schema validator.

_Design decisions:_ Test-first — a validator with clear, enumerable behaviors. Follows the existing
`validate-meta-spec.ts` validator pattern (`validateFiles(paths, readFile, …) → { pass, diagnostics }`) and
consumes the shipped `cohort-path.ts` / `meta-reader.ts` helpers; a new `validate-cohort-consistency.ts`
script plus a supporting lib module, wired as a new pre-commit CHECK alongside `quality-gate-hooks`' source-side
ref-enforcement (same hook-file family, different invariant). Backlog-scoped (`active/` is flat, `completed/`
ordinal — neither applies). Hook script is two-copy (package source + `.arc/` mirror).

_Anchors:_ E1, E2; SC6.

### `[ ]` **5.1 Build the cohort-consistency validator (the three conditions)**

- _Goal:_ A `validate-cohort-consistency` validator implements the three-condition invariant over
  `backlog/planned/**` — (a) a WU's `Cohort` path-matches its parent dir-path; (b) every grouping dir carries a
  `cohort-{name}.md` with at least a Purpose floor; (c) a cohort doc's per-member section slugs are a subset of
  derived members — returning structured diagnostics and doubling as the cohort doc's schema validator.
- _Approach:_ A new `src/scripts/validate-cohort-consistency.ts` (the `validateFiles` shape) plus a supporting
  `src/lib/active/` module for the cross-file checks, consuming `cohort-path.ts` (`validateCohortPath` /
  `cohortLeaf` / `COHORT_SEGMENT_CAP`) and `meta-reader.ts` (`parseMetaRecord` / `parseIdentifierList`).
- _Note:_ Complements — does not duplicate — `validate-meta-spec.ts`'s existing `validateCohort` (CHECK 16), which
  validates the single-meta `Cohort` field _shape_ (≤2-segment path). This validator assumes shape-validity and
  checks _cross-file_ consistency (field↔dir, doc presence, orphan sections), reusing the same `cohort-path.ts`
  helpers.
- **Strategies:** strategy-testing-methodology.md

    - `[ ]` **5.1.a `Cohort` field↔dir path-match (nested + drift cases)**

        - Build `test-first` (one behavior at a time):
            - passes when a WU's `Cohort` equals its `backlog/planned/<cohort>[/<subcohort>]/` parent dir-path
            - nested `<cohort>/<subcohort>` path-matches the two-segment dir
            - drift fails — a WU assigned to one cohort but filed under another
            - a `[none]` / standalone WU (no cohort dir) passes

    - `[ ]` **5.1.b Cohort-doc schema checks — constitutive-doc presence, Purpose floor, orphan sections**

        - Build `test-first` (one behavior at a time):
            - every grouping dir carries a `cohort-{name}.md`; a missing doc fails
            - a cohort doc without a Purpose paragraph fails (the schema-validator role)
            - an orphan per-member section (slug ∉ derived members) fails
            - a derived member with no section passes (sections are a subset, not a roster)

### `[ ]` **5.2 Wire the validator into pre-commit + integration coverage**

- _Goal:_ The validator runs as a new backlog-scoped pre-commit CHECK (staged `backlog/**` meta + cohort-doc paths
  → validator), wired in both hook copies, with integration coverage in the hook-family harness — so cohort drift
  is caught at commit time.
- _Approach:_ Append the CHECK block after the current last CHECK in
  `.arc/system/.internal/githooks/pre-commit` (and the package-source counterpart); filter staged candidates by
  the backlog meta + cohort-doc path pattern; invoke via `npx tsx …/validate-cohort-consistency.ts`. Integration
  test mirrors the existing hook-invocation fixtures.
- _Note:_ The CHECK is staged-scoped and the integration test fixture-based — it never evaluates the live backlog,
  so pre-existing divergent cohort docs (the 3.1 note) don't break this WU's gates; their conformance is
  `doc-cascade-sweep`'s.
- **Strategies:** strategy-package-project-sync.md, strategy-testing-methodology.md

    - `[ ]` **5.2.a Wire the pre-commit CHECK (both hook copies) with backlog-scoped candidate filtering**
        - The new CHECK block + path-pattern candidate filter; package source + `.arc/` mirror byte-identical.

    - `[ ]` **5.2.b Add integration coverage in the hook-family harness**
        - A hook-invocation integration test exercising a passing and a drift fixture under real paths.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` **Acceptance test passes** — applying the `assess-cohort-fit` discriminator + two guard rails to
  Concurrent Work Conventions's one settled draft cleanly re-derives CWC's actual decomposition (its D1–D4
  members) without strain (SC1)
- `[ ]` **`assess-cohort-fit` method exists** as a paired sibling of `classify-work-unit`, co-located and declared
  via the `arc.methods` bundle: the orthogonality discriminator, two rails, maturity timing,
  plan-vs-delivery grouping, Model-B-only, member-slug naming, the sizing heuristics (consuming the
  `strategy-work-organization` sizing standard), and the cut-map + fire-point model (SC2)
- `[ ]` **The grouping taxonomy is defined** — one kind (cohort), coordination by degree, WU leaf, the one-level
  nesting cap (≤2 segments), the path-valued `Cohort` semantics + dir-path mirroring, and the three decomposition
  arms (standalone → top-level, in-cohort → sub-cohort, at-cap → lateral fan-out with provenance) (SC3)
- `[ ]` **The `cohort-{name}.md` record exists** (ADR-022 family) — Purpose floor / optional coordination /
  per-member-by-slug shape, membership derived, no DRI, the design-vs-coordination forcing function; `cohort-*`
  added to the DEV-RULES.ARC movable-artifact enumeration; `template-cohort.md` authored from the live prototype
  with its field set marked prototype-iterate (SC4)
- `[ ]` **The `decompose-work-unit` workflow exists** (park-shaped exit; WU → cohort) — the step sequence, field
  inheritance, dependency-edge-by-need distribution, the four-step distribution discipline, the predicted/emergent
  arms, the cohort-scaffold + PR-cleanup primitive factoring (named extractable blocks), worktree-kind teardown,
  and the decomposition-PR description variant, codified against this cohort's own manual run (SC5)
- `[ ]` **The cohort-consistency invariant + enforcement ships** — the three conditions as a backlog-scoped
  structural guard with pre-commit wiring, co-located with the invariant definition and serving as the cohort
  doc's schema validator; the manual bootstrapping version documented in `decompose-work-unit` (SC6)
- `[ ]` **The concept is introduced** — AGENT-BRIEF.ARC § Vocabulary carries a Cohort entry; the two constitutive
  rules (every grouping dir carries a doc; the one-level nesting cap) are promoted to DEV-RULES.ARC (SC7)
- `[ ]` **No silent loss on any decomposition** — the conservation gate asserts every origin section + outgoing
  dependency edge lands in exactly one destination or is dropped-with-reason before the origin is retired; the
  incoming-`Depends On` sweep re-points every meta naming the origin, not only the cut-map's named dependents (SC8)
- `[ ]` **Reference hygiene holds** — `cohort-{name}.md` carries position-independent references (inbound
  filename-only; outbound no relative paths) and relocates `backlog/ → completed/` as a pure `git mv` (SC9)
- `[ ]` **A companion ADR exists** under `reference/adr/` (parallel to `class-model-foundation`'s), recording the
  invented model's durable cross-cutting rationale; it is a non-moving, internal-only artifact (SC10)
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md

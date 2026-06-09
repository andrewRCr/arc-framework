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

### `[x]` **2.3 Acceptance test — re-derive CWC's D1–D4 from CWC's settled draft**

- _Goal:_ Applying the `assess-cohort-fit` discriminator + the two guard rails to Concurrent Work Conventions's
  one settled draft cleanly re-derives CWC's actual decomposition (its D1–D4 members) without strain — confirming
  the procedure works (if it strains, the rule is wrong, not the cut).
- _Outcome:_ **PASS.** Deriving from CWC's scope / design structure — In-scope item 1 (the `strategy-concurrent-work.md`
  doctrine), the compose-shipped-primitives merge-safety thread, In-scope item 2 + the errand merge-gate drain
  corrections (async-merge lifecycle), and the single-owner-WU "one DRI" design decision — the orthogonality
  discriminator cuts four orthogonal deliverable-type seams that match the stated D1–D4 exactly (spine D1 →
  D2/D3/D4; D2 before D3). Both rails are load-bearing, not rubber-stamped: the lower rail folds the sub-WU pieces
  (awaiting-review state semantics; the `arc start` create-new / subdir-removal / cohort-discovery plumbing) into
  D3 rather than minting micro-WUs, and the upper rail keeps D2's detector + extensions + hook as one coupled
  mechanism instead of three, and holds doctrine (D1) apart from the ownership-model rewrite (D4) rather than
  lumping them as "all the docs." No strain → the discriminator + rails reproduce the cut (SC1). Read-only
  dogfood; verdict stayed in primary context.

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

### `[x]` **3.1 Define the `cohort-{name}.md` record shape and the design-vs-coordination forcing function**

- _Goal:_ The `cohort-{name}.md` record is defined as constitutive of every cohort (ADR-022 family): a required
  one-paragraph Purpose floor scaling up to full coordination by degree, per-member sections keyed by slug (a
  partitioned coordination surface, not a roster — membership stays derived), no coordinator/DRI, and the
  design-vs-coordination boundary _forced_ by the per-member partition.
- _Note:_ Pre-existing cohort docs predate this shape and diverge (esp. `cohort-agile-parallelism.md` — prose H1 +
  a roster-style "Membership and ownership map" against C2); bringing them into conformance is `doc-cascade-sweep`'s
  broad cross-surface sweep (Non-Goals), routed there directly. This WU conforms only its own authored / edited docs.

    - `[x]` **3.1.a Define the constitutive-record shape**
        - New `cohort-{name}.md`-record subsection in `strategy-work-organization` § Cohorts: the record anatomy
          (H1+preamble, Purpose floor, optional accreting coordination content, per-member slug-keyed partitioned
          surface), membership-derived (no roster/status), no DRI. (C1, C2, C4)

    - `[x]` **3.1.b State the design-vs-coordination forcing function**
        - The "Design vs. coordination — forced, not chosen" block: coordination-only / never task-driving design;
          owned contract → member's spec + a pointer + consumer list; cohort-level vs per-member exposes/consumes;
          the partition as the forcing function (a section filling with task-driving design is the smell). (C3)

- _Outcome:_ Authored as one `cohort-{name}.md`-record subsection (both copies), placed after
  § One grouping kind so the doc's anatomy follows the coordination-by-degree framing it elaborates. The forcing
  function lands as a bolded block within it rather than a peer heading — keeping "what the record is" and "how it
  disciplines its own content" cohesive, and matching the section's flat-`###` convention. ADR-free per
  adopter-facing strategy rules (the ADR-022-family grounding stays in `adr-024`).

### `[x]` **3.2 Author `template-cohort.md` from the live prototype (field set prototype-iterate)**

- _Goal:_ `template-cohort.md` exists at `reference/templates/arc/work-unit/`, generalized from the live prototype
  (`cohort-agile-wu-lifecycle.md`) — H1 + uniform preamble, the Purpose floor, the optional coordination scaffold
  (shared contracts, closeout criteria, per-member sections) — with its coordination field set explicitly marked
  prototype-iterate, so `decompose-work-unit` scaffolds a convention-correct cohort doc.
- **Strategies:** strategy-package-project-sync.md, strategy-file-classification.md

    - `[x]` **3.2.a Author the template from the prototype**
        - H1 + preamble blockquote, required Purpose floor, and the optional coordination scaffold (Coordination
          with Sequencing, Shared contracts, Soft coordination, Cross-cohort, Closeout criteria; Members with
          per-slug exposes/consumes; ADR anchors) — generalized from the prototype's actual sections, with the
          spec-named-but-absent Closeout-criteria slot folded in as optional scaffold. Spec-template `{prose-slot}`
          convention; ADR-free / neutral voice per adopter-facing template rules. Two-copy.

    - `[x]` **3.2.b Mark the field set prototype-iterate and register the template**
        - Prototype-iterate marker carried in the scaffold's lead HTML comment (optional-scaffold + "expected to
          iterate, not design debt" + the coordination-only forcing-function discipline); registered in the
          `work-unit/` bullet of `reference/templates/arc/README.md` (both copies — no work-unit-level README).

- _Outcome:_ `template-cohort.md` authored (both copies) as a spec-family planning-artifact template: required
  H1 + Purpose floor above the `---`, optional coordination scaffold below it with the prototype-iterate +
  forcing-function discipline in the lead HTML comment. Also corrected this WU's own member section in
  `cohort-agile-wu-lifecycle.md` (`### decomposition-machinery` § Exposes: `assess-decomposition` →
  `assess-cohort-fit`, the single live stale reference). Template-cohort body (Open Question 1) is now settled.

### `[x]` **3.3 Apply relocatability + reference hygiene to `cohort-*`; route the concurrency seam to CWC**

- _Goal:_ `cohort-{name}.md` adopts the WU-artifact relocatability + reference-hygiene invariant wholesale —
  inbound references backticked-filename-only, outbound no relative-path links, relocating
  `backlog/planned/<cohort>[/<subcohort>]/ → completed/` when the cohort's last member ships as a pure `git mv` —
  and the cohort doc's concurrency seam is routed to Concurrent Work Conventions with the partition-first /
  serialize-via-main fallback recorded.

    - `[x]` **3.3.a Apply the relocatability + reference-hygiene invariant to `cohort-*`**
        - Added a **Relocatability and reference hygiene** block to the § Cohorts record subsection (both copies):
          movable artifact, `backlog/planned/<cohort>[/<subcohort>]/ → completed/` pure-`git mv` relocation,
          inbound-filename-only / outbound-no-relative-path hygiene, satisfiable by construction. References the
          movable-artifact invariant (DEV-RULES, added in 1.2) without restating it. Audited the template +
          prototype: both carry zero outbound relative-path links — instances are position-independent by
          construction. (C5, SC9)

    - `[x]` **3.3.b Route the concurrency seam to Concurrent Work Conventions**
        - Routed both seams as one entry into `draft-concurrent-work-conventions.md` § Inbound Buffer: the advisory
          cross-cutting gate's blind spot on the cohort-owned doc (behind-base detector is the net that applies),
          and the serialize-via-`main` escape hatch; partition-first lean recorded. (G)

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

### `[x]` **4.1 Author `decompose-work-unit` — park-shaped exit, the step sequence, teardown**

- _Goal:_ `system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md` exists as a genuine lifecycle
  transition (a WU changing what it is) — a park-shaped exit running on the originating planning branch as its
  terminal act, the D2 step sequence, and worktree-kind-branched teardown.

    - `[x]` **4.1.a Author the park-shaped exit + the D2 step sequence**
        - Authored the spine: frontmatter (`pre-push-review`) + intro + when-to-use (emergent arm at create-spec,
          `plan/<name>` terminal act) + the 11-step sequence — pre-conditions/arm-selection, mint cohort, backfill
          parent doc, scaffold member stubs, distribute design, re-point incoming deps, verify consistency, retire
          origin (`workflow-interlock`-gated on the conservation check), ROADMAP regen, park PR
          (`integration-interlock` before merge), teardown. Steps 4–7 carry D2-level detail for 4.2–4.4 to deepen
          in place. Also added a **Decomposition** bullet to strategy § Regeneration fire-points (the fold-in, not
          deferred to `doc-cascade-sweep` — single bullet, keeps strategy ↔ workflow consistent).

    - `[x]` **4.1.b Specify worktree-kind-branched teardown**
        - Teardown dispatches on worktree kind: primary → `git switch main` + delete local/remote `plan/<name>`,
          no worktree removal; linked → `git worktree remove` + branch delete run from the primary worktree, and
          the session terminates (prior cwd gone). Destructive branch-delete flags kept literal/raw. (D6)

    - `[x]` **4.1.c State the at-cap arm variant**
        - Authored as a dedicated `## At-cap arm` section: Step 2 skipped (no cohort minted), members scaffolded as
          siblings under the existing parent, Step 3 replaced by a write-once greppable fan-out provenance note in
          the parent cohort doc, plus the mis-scope reality-check (judgment, not a gate). (D2 at-cap parenthetical)

- _Outcome:_ `decompose-work-unit.md` exists in both copies (Framework file, byte-identical) as the park-shaped
  spine — a transform-and-park exit distinct from `integrate`'s code-shipping exit. The cut-map is consumed, never
  re-derived; the origin is `git rm`'d with no `completed/` entry. Field inheritance, the four-step distribution
  gate, and the manual bootstrapping checks are named at D2 granularity and deepen in 4.2–4.4.

### `[x]` **4.2 Specify field inheritance + dependency-edge-by-need distribution on minted stubs**

- _Goal:_ The workflow specifies how minted member stubs inherit fields — shared `Origin`, own
  `Design: draft-<member>.md`, path-set `Cohort` (meta + dual-placed in the draft header), own `Class` — and
  distributes `Depends On` by _actual need_: outgoing ancestor edges inherited only where the member genuinely
  depends; internal edges authored fresh from delivery order; incoming edges re-pointed to the delivering
  member(s).
- _Outcome:_ Step 4 now carries a **Field inheritance** block (per-field: inherited `Origin`, own `Design`,
  dual-placed `Cohort`, own `Class`, `State: Planning`) and a three-kind `Depends On` distribution
  (outgoing-by-need / internal-from-delivery-order / incoming-swept), each edge framed as a live gate discharged
  at the depended-on member's activation — not a hard blocker. (D3)

### `[x]` **4.3 Specify the four-step distribution discipline — conservation gate + incoming-`Depends On` sweep**

- _Goal:_ The workflow carries the emergent-arm distribution discipline as a four-step gate and the
  incoming-`Depends On` sweep, so no origin content or edge is silently lost when a monolith is split.

    - `[x]` **4.3.a Specify the four-step distribution gate**
        - Step 5 rewritten as the four-step gate: allocation map (every section / design-point + every dependency
          edge → one destination, or dropped-with-reason) → classify by the design-vs-coordination boundary →
          conservation gate (no silent loss; precondition for retirement) → retire only after the gate passes
          (Step 8). The allocation map carries forward as the Step 10 PR description. (D5)

    - `[x]` **4.3.b Specify the incoming-`Depends On` sweep**
        - Step 6 deepened: a concrete `grep` sweep over `active/**` + `backlog/planned/**` metas naming the
          origin, re-pointed to the delivering member(s) — explicitly broader than the cut-map's named dependents
          (this cohort's run found three incoming edges where the cut-map listed one). (D2 sweep, SC8)

- _Outcome:_ The conservation discipline now spans Steps 5–6 and gates Step 8's retirement — every origin section
  and every dependency edge (outgoing in the draft, incoming swept from foreign metas) lands in exactly one
  destination or is dropped-with-reason before the origin is deleted.

### `[x]` **4.4 Factor shared primitives + the predicted/emergent arms + manual bootstrapping checks + PR variant**

- _Goal:_ The workflow's shared steps are factored for reuse and forward composition — the cohort-scaffold
  primitive shared with the predicted arm (both arms live in this WU), and the `active/ → backlog/` + park-PR +
  worktree-kind-teardown block authored single-source here for `integrate` / `park-work-unit` to adopt later
  (forward-compat, H — no present-tense integrate refactor) — the predicted-vs-emergent arms are distinguished, the
  manual three-check bootstrapping version is documented, and the decomposition-PR description variant is specified.

    - `[x]` **4.4.a Factor the cohort-scaffold + PR-cleanup primitives as named extractable blocks**
        - Added `## Composition and reuse` with the layering formula and two stable-heading-slug blocks —
          `### The cohort-scaffold block` (Steps 2–4, 7; reused by the predicted arm) and `### The park-exit block`
          (the `active/ → backlog/` + park-PR + teardown, Steps 10–11). Both named single-source for a future
          composition mechanism to hoist; no present-tense `integrate` edit. (D8, H)

    - `[x]` **4.4.b Distinguish the predicted vs emergent arms**
        - `### Predicted vs. emergent arms` subsection: emergent (a matured monolith split at create-spec — the arm
          this workflow + the distribution discipline serve) vs predicted (affirmative during draft-design; author
          straight into the cohort structure via the cohort-scaffold block alone — no monolith, this workflow does
          not run). (D7)

    - `[x]` **4.4.c Document the manual bootstrapping checks + the decomposition-PR description variant**
        - Step 7 frames the three conditions as the by-hand pre-commit verification (surfaced at the Step 8
          interlock) with the cohort-consistency structural guard as the commit-time backstop; Step 10 carries the
          **Decomposition PR description** variant (allocation-map-as-PR-story, plain-prose register). (E3, D9)

- _Outcome:_ `decompose-work-unit.md` is complete and adopter-clean — forward-compat material expressed without
  naming internal backlog WUs (the `composable-workflows` / `park-work-unit` / CWC routing stays in the spec).
  Named extractable blocks make the spine composable later without a rewrite. The pre-push-review-on-doc-only-PRs
  question was routed to `review-method-family` via `USER-INBOX` rather than settled here.

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

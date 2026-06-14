# Draft: Composable Workflows

- **Origin:** [internal] — surfaced during scalable-core deliberation while examining how workflows scale
  across modes and tiers.
- **Purpose:** Capture the idea of scaling workflows by **resolve-then-load composition** — loading only the
  fragments that apply to the resolved configuration — rather than carrying every branch inline and telling
  the agent to skip the inapplicable ones. This is the mechanism `adr-020` §9 names as a requirement and
  defers here for design.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Stable-anchor convention for cross-file workflow step references (ordinals → anchors)**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: composable-workflows`), work-routing-discipline housekeep
  drain (2026-06-01).
- *Concern:* cross-file citations of workflow *step numbers* are silently brittle — a target renumber breaks the
  citer with no error (`session-init.md` carries 23 `Step N` refs, `2_generate-tasks.md` 19;
  `extensions/post-context-load.md` + `extensions/README.md` are already stale).
- *Two concepts to separate:* (i) *anchor* — a stable cross-file reference target (pointed-at, no backing file);
  (ii) *fire-point* — a validated load-point where an extension's actions execute (today's `· #name` marker,
  `point-scanner`-validated against `system/extensions/<name>.md`). The `#name` marker reads generic but is
  extension-reserved (a WF session tripped the validator reaching for it as an anchor).
- *Convention:* cross-file refs target a stable anchor, never an ordinal; intra-file "see Step N" can stay. Two
  orthogonal axes: disambiguate the extension marker (e.g. `#ext:name`, validated) AND/OR give anchors an
  explicit form (the freed plain `#name`, a new sigil, or formalize the existing `§ SectionName` prose
  convention — likely lowest-friction). Heading slugs are the zero-marker fallback (what WF used).
- *Coupling:* includes fixing the stale extension-doc refs + the DEV-RULES.ARC "item 10" ref; coupled to this
  WU's named-fire-point design (ADR-020 §9 defers the marker mechanism here).

### `[ ]` **Codify how to reference external / harness skills from ARC content**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: TBD`), work-routing-discipline housekeep drain (2026-06-01).
- *Concern:* a user wanting to invoke a non-ARC harness skill (a team's own `code-review`, or `research` /
  `optimize-doc`) from a project workflow / method / extension *can* — by name, in prose — and ARC needs no
  awareness (the harness owns skill discovery; ARC references its own skills the same way). There is just no
  documented convention, so users guess.
- *Codify:* (a) prose, not frontmatter (`arc.methods` / `arc.extensions` resolve to ARC files, not harness
  skills — declaring one there fails the loader); (b) project-level only, never adopter-facing (a named ref
  resolves only where that skill is installed under that name on that harness — fine for project surfaces, wrong
  for shipped `system/**` / `strategies/arc/**`); (c) author for graceful degradation ("if available, invoke X;
  otherwise fall back"). Doc-only; pairs with the PR-review case (teams swapping in their own review skill).
- *Note:* home may instead be `strategy-workflow-authoring` (body conventions) or
  `strategy-configurability-architecture` (customization framing) — landing here as the adjacent
  workflow-reference owner; decide at integration.

### `[ ]` **Reserve `lane` as extraction jargon (`path` vs `lane`)**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: composable-workflows`), housekeep drain (2026-06-08);
  captured at `scalable-authoring-pipeline` Phase 5.R (Task 5.R.1).
- *Concern:* SAP Phase 5.R settled `path` as the single term for the depth-selected alternative block across the
  three authoring workflows, retiring stray `lane` / `variant` usages. `lane` is reserved, not killed — a latent
  principled distinction worth keeping available: `path` = the route the agent runs (execution view); `lane` =
  the parallel extractable whole-block (authoring / structure view), which is exactly what an extraction model
  trades in.
- *Proposed:* at this WU's planning iteration, decide whether the execution-vs-structure distinction earns two
  terms — adopt `lane` for the structural / whole-block fragment concept, or reject it and keep `path`
  throughout. Don't reintroduce `lane` into workflow bodies before that call. Pairs with this WU's whole-block
  extraction-rule design.

### `[ ]` **Use SAP `generate-tasks` (5.R.2, D-shaped) as a worked example for the core/fragment boundary**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: composable-workflows`), housekeep drain (2026-06-08);
  captured at `scalable-authoring-pipeline` Phase 5.R (Task 5.R.2).
- *Concern:* SAP Task 5.R.2 resolved `generate-tasks`' depth differentiation structurally, exposing an unnamed
  composition pattern. The depth axis (`low`/`medium`/`high`) there is **not** three procedures — it is one
  shared pipeline (decompose → fill → audit) sliced into a different number of review increments, with stops
  placed differently. The clean cut: separate **procedure-identity** (invariant, depth-agnostic, stopless) from
  **increment-cadence** (a "Pass" = a depth-selected grouping of procedures + its stop).
- *Proposed:* fold into the core/fragment boundary design. Two takeaways: (1) a second extractable shape beyond
  mode-gated whole steps — **procedure fragments + thin orchestration/path fragments that sequence procedures
  into review increments** (hub/spoke: library = procedures, spokes = depth paths). (2) it challenges the draft's
  extraction rule ("extract whole conditional blocks; keep intra-step branches inline"): a thin orchestration
  fragment that *references* procedure fragments is *more* DRY-aligned than a fat self-contained block, because
  self-contained only "lifts unchanged" by duplicating the shared detail composition exists to eliminate.
  `generate-tasks` shipped D-shaped (depth paths as spine, procedures as a referenced library) — concrete input
  for where the cut falls.
- *Scope:* pairs with the `lane`-reservation note above (same WU) — the structural / whole-block extraction view
  is exactly where a `path` vs `lane` distinction would land.

### `[ ]` **Conditional (arm/`sessionType`-gated) method declaration in workflow frontmatter**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: composable-workflows`), housekeep drain (2026-06-11);
  captured during `concurrent-work-doctrine` generate-tasks.
- *Concern:* `arc.methods` frontmatter loads every declared method unconditionally at workflow start, and the only
  alternative is a prose on-demand load mid-body that the point-scanner can't validate. Surfaced in
  `concurrent-work-doctrine`: `assess-parallel-fit` is needed only on session-init's discovery / cold-start arms,
  so it is wired as a prose on-demand load — correct, but invisible to validation and easy to forget.
- *Proposed:* a declarative conditional-load mechanism (arm- or `sessionType`-gated `arc.methods` entries) so
  arm-gated method needs are expressed in frontmatter and checked by the point-scanner, instead of hand-written
  prose loads. Updates `strategy-workflow-authoring` (frontmatter schema) + the `DEV-RULES.ARC` method-loading
  rule; not `operational-state-docs` (a different subsystem).

### `[ ]` **`index.md` hub pattern as input to the `system/workflows/` navigability question**

- *Routed from:* OKF / LLM-wiki idiomatic-alignment exploration (2026-06-13); coordinates with
  `idiomatic-alignment`.
- *Concern:* this WU's central open design question is *"`system/workflows/` navigability — decomposing into core +
  fragments risks death-by-a-thousand-includes and harms locality."* Both Google's OKF and Karpathy's LLM-wiki
  converge on the same answer for a decomposed markdown tree: a reserved **`index.md`** hub per directory level —
  a content-oriented catalog of the entries beneath it, each a link plus a one-line summary (OKF: "entries SHOULD
  include the description from the linked concept's frontmatter"). That is a concrete, battle-tested navigability
  device for a core + fragment library: a hub restores the "see the whole behavior in one place" locality that
  inline currently provides, without re-bloating the core.
- *Proposed:* evaluate an `index.md`-style hub (or ARC's README-per-dir equivalent — same role under a different
  name) for the fragment library if the directory reshape proceeds. Don't rename README → `index.md`; the question
  is the hub *pattern* (catalog + one-line summaries), not the filename.
- *Coupling:* pairs with `idiomatic-alignment` (which owns the `index.md`/`log.md` ↔ ARC correspondence) and the
  navigability open question in § Open Design Questions.

### `[ ]` **Model fragments as a point in the existing method space, not a separate subsystem**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: composable-workflows`), housekeep drain (2026-06-14);
  captured during `lifecycle-state-machine` forward-compat alignment.
- *Concern:* this WU is poised to invent a separate "workflow-fragment" subsystem, but ARC already has no `final`
  — every method is **public + overridable** (the methods README defines method-hood *by* the
  contract/default/`.override` structure). Fragments are cheaper to recognize as a point in the *existing* method
  space: ARC occupies one cell of a 2×2 it could occupy four of.
- *Proposed:* give the method concept two orthogonal properties — **visibility** (public = many callers via
  `arc.methods`; private = callable only by one owning workflow, point-scanner-enforced, exempt from the corpus
  "declared by ≥1 workflow" coverage audit) and **override-policy** (`overridable | fixed`, a frontmatter field).
  Decouple overridability from method-hood (method-hood becomes "a procedure with a contract"). Populates the
  empty cells: `public+fixed` = a shared invariant procedure projects must NOT redefine; `private+fixed` =
  this WU's fragments.
- *Critique to feed the open question:* a workflow spoke is **pulled** by its workflow ("load this block if
  tier=X"), not **fired** by the framework at a fire-point — so fragments are **method-shaped (call), not
  extension-shaped (hook)**. Model them on the method surface + a visibility axis, borrowing only the
  config-resolution mechanism from extensions. The current "anchor on the extension/active-set surface" lean is
  subtly the wrong surface.
- *Worked example:* `lifecycle-state-machine`'s relocation mutator bundle is the canonical `public+fixed` shared
  procedure (non-overridable *because* three-encoding consistency requires identical behavior everywhere),
  implemented in the code tier — the north-star "mechanics → CLI" is literally "a fixed public method, code-tier";
  the ceremonies' judgment halves are the `private+fixed` orchestration fragments.
- *Cautions:* visibility in markdown is convention + tooling, not enforcement; don't force the near-empty
  `private+overridable` cell; "method" would overload — needs a qualifier (pairs with the `path`/`lane`
  reservation item above).

---

## Problem / Motivation

ARC's lifecycle workflows scale across modes and tiers today via **carry-and-skip**: inline conditionals
(`arc-in-git only`, `skip under none/external`) that every reader parses even when inapplicable. This works
and is DRY, but it imposes a **judgment tax** — simple cases carry the instruction load of complex ones,
and they cannot be fully isolated without duplicating documents.

That framing is a false dilemma. A third option — **composition** — lets a fragment live once and load only
when its condition holds: as DRY as an inline block, but with real isolation (the simple case never *sees*
the complex-case instructions). ARC already runs this pattern: extensions/methods are declared in workflow
frontmatter and the session-init probe resolves the active set, loading fragment actions at named
fire-points only when active. The scalable-core traces confirmed the surfaces that already use this
(extensions, fired by active-set membership) are the clean, orthogonal ones; the inline-gated backlog steps
are the seam-y ones.

## Design Sketch

- **Resolve-then-load over carry-and-skip.** The probe resolves the active configuration (tier, Planning
  Module on/off, tracker present); workflows load only the applicable fragments.
- **Hub/spoke, within bounds.** A lean core (invariant, tier/mode-agnostic spine) plus conditionally-loaded
  spokes for mode/tier-specific steps. Anchor the spoke mechanism on the existing extension/active-set
  surface rather than inventing new machinery.
- **Extraction rule.** Extract *whole conditional steps/blocks* to fragments; keep fine-grained
  *intra-step* branches inline (they don't extract without ugly seams).
- **The conductor's depth-selection is the tier-axis instance** of the same principle (minimum / standard /
  expanded as selectable depth) — unify, don't duplicate.

## Open Design Questions

- **`system/workflows/` navigability.** Decomposing into core + fragments risks death-by-a-thousand-includes
  and harms locality for maintainers (inline shows the whole behavior in one place). The directory likely
  needs a structural reshape — this is the central design problem, not a detail.
- **Core/fragment boundary.** Where the cut falls determines whether the core re-bloats (judgment tax
  remains) or over-fragments (composition overhead). Get it wrong in either direction and the win evaporates.
- **Maintainer locality vs. agent execution-load.** The trade is real; the priority here is execution-time
  load, but the maintainer cost must stay bounded.

## Relationship to other work

- **`adr-020` §9** establishes the requirement and direction; this WU owns the mechanism design.
- **`plan-workflow-template-loads.md`** is adjacent (an `arc.templates` frontmatter-load category) — same
  declared-load family, narrower scope. Coordinate so the two don't design overlapping load machinery.
- **agent-context-optimization cohort** (`plan-loadset-composition.md`, `plan-instruction-optimization.md`,
  `plan-documentation-surface-routing.md`) shares the north star of reducing agent context/instruction load.
  Considerable goal-overlap — coordinate to avoid designing the same thing twice; this may belong in or
  beside that cohort once sequenced.
- **`plan-arc-plan-conductor.md`** already implements the depth-selection instance of resolve-then-load for
  the planning entry; the lifecycle-workflow extension of that model (per ADR-020's conductor steer) is the
  natural integration point.

## Scope Estimate

Medium–Large, and design-heavy — the navigability/reshape question needs resolution before implementation.
Graduation trigger: when scalable-core's workflow reform (or a conductor lifecycle pass) forces the
inline-gated steps to be touched at scale, this mechanism should land first so they move to fragments rather
than accreting more inline branches.

---

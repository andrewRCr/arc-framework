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

### `[ ]` **Consider a thin CLI surface for the shared post-merge teardown block**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: composable-workflows`), housekeep drain (2026-06-17); captured
  during `lifecycle-transition-core` Task 6.6.c (2026-06-17).
- *Concern:* the post-merge teardown block — reap the merged branch + remove the worktree, worktree-kind
  dispatched, presence-guarded — appears single-source in `integrate-work-unit.md` Step 13 and
  `decompose-work-unit.md`'s park-exit. When hoisting it, weigh factoring it as a **thin CLI surface**, not only a
  markdown fragment.
- *Proposed:* a command reusing `lifecycle-transition-core`'s executor `reconcile-worktree:teardown` leg plus a
  **new merged-safe (`git branch -d`) branch-delete variant** — distinct from the existing force
  `reconcile-branch:delete` (`-D`) that park / abandon use — DRYing both workflows' teardown to one mutator-tier
  invocation.
- *Context:* Task 6.6.c deliberately un-bundled teardown from the `arc archive` verb (archive = the mergeable sweep
  riding the ship PR, incl. logical `Branch → [none]`; physical teardown stays the integration tail's post-merge
  cleanup). Option 1a was chosen then (keep teardown markdown; defer the DRY factoring here); this records the
  CLI-surface option (1b) explicitly.
- *Dogfood note (2026-06-17, PR #106):* attended integration still required a deterministic shell tail after merge:
  `gh pr merge`, `arc user close`, switch/pull base, `git branch -d`, and `git fetch --prune`. The workflow was
  clear, but the branch/user/worktree cleanup portion is mechanical and presence-guarded. Preserve the archive
  boundary (no physical teardown in `arc archive`), but evaluate a thin post-merge finalize/teardown command that
  consumes the already-settled merge result and runs the safe cleanup legs.

### `[ ]` **Should the workflow-composition mechanism expose a `slug → artifact` resolver?**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: composable-workflows`), housekeep drain (2026-06-19);
  captured during `lifecycle-mechanics-tail` PR #114 review cycle (2026-06-19).
- *Concern:* resolving a workflow by bare slug (no carrying context) currently means a `grep`/`find` — hit when a
  workflow was named in conversation (`address-pr-review`) rather than reached via a link. A standalone
  `arc load-workflow <slug>` was considered but **rejected as marginal**: a CLI command can't load into agent
  context (it only resolves `slug → path`, then the agent still `Read`s — ≈ zero token win), and in-system
  reference cases already carry the path (workflow→workflow ref-style links, skills name the path,
  methods/extensions load via frontmatter declaration). A general md-file loader would also be a second load
  mechanism competing with that convention.
- *Scope (kernel worth keeping):* if CW's fragment/composition substrate needs a canonical `slug → artifact`
  resolver anyway (to include/compose fragments), the bare-slug-loading case folds into it for free — the only
  framing under which this earns its keep. As a standalone verb it doesn't; as a property of CW's composition
  substrate it might. Decide at CW's design.

### `[ ]` **Design `override-mode` resolution as machine-resolvable input to resolve-then-load**

- *Routed from:* `testing-guidance-apparatus` planning init (2026-06-22).
- *Concern:* `testing-guidance-apparatus` adds an `override-mode: replace | extend` flag to method frontmatter
  (`extend` = the default applies, then the override appends). Resolving a declared method — fragment selection,
  override-vs-default, and replace-vs-extend composition order — is fully deterministic, and that is exactly CW's
  resolve-then-load territory; only *applying* the loaded guidance stays agent judgment.
- *Forward-compat:* keep `override-mode` clean machine-resolvable data so a future `arc method resolve <name>`
  (CW's resolver) can compose the method markdown as a pure function over frontmatter — zero agent reasoning about
  which fragments to emit or in what order. Sibling of this buffer's existing `slug → artifact` resolver kernel.

### `[ ]` **Consolidate config-variation mechanisms onto one resolve-then-load substrate**

- *Routed from:* USER-INBOX housekeep drain (2026-06-24); captured at `lifecycle-closeout` create-spec
  (2026-06-23). Coordinate with `plan-workflow-template-loads.md` (the `arc.templates` declared-load sibling) —
  possibly the sharper home for the template-specific angle; decide at this WU's design.
- *Concern:* ARC carries ~3 distinct config-variation mechanisms: (1) `arc:if` install-time `.template.md`
  conditionals stripped by `render.ts` at `arc init` / `update` (5 workflows); (2) in-body carry-and-skip prose
  (this WU's named judgment-tax target); (3) frontmatter declared-loads (`arc.methods` / `arc.extensions` + the
  proposed `arc.templates`). The resolve-then-load thesis already targets (2); the additive question is whether
  (1) folds in too, collapsing three mechanisms to one substrate.
- *Viability:* the config-conditional **workflow** slice of `arc:if` is a clean subsumption candidate (same
  resolve-config→emit-applicable family). Deprecate `arc:if`-for-behavior-variation in favor of composition.
- *Caveats (not a blanket deprecate):* (a) `.template` also serves adopter-customization scaffolding
  (token-substituted starter files) — composition does **not** subsume that, so `.template` survives for
  scaffolding. (b) Binding time — `arc:if` resolves at install → a concrete, legible installed file; a
  runtime-compose model trades away the "whole behavior in one place" locality that is this WU's central open
  question — prefer install-time composition. (c) Overhead threshold — `arc:if` is cheap for ~2-3 arms;
  composition earns its keep as variation axes multiply (tier × mode × tracker). Consolidate where inline
  conditional load is high, not blanket-replace.
- *Scope:* the `.template` + `render.ts` conditional mechanism, the 5 templated workflows,
  `strategy-workflow-authoring`, and the boundary with `plan-workflow-template-loads`'s `arc.templates`; both
  copies. Design fork (subsume vs. keep `arc:if`; binding-time model) → reviewed lane.

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

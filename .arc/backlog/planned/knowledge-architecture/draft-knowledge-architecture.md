# Draft: Knowledge Architecture

- **Origin:** [internal] — captured 2026-07-03 from an exploratory framing session auditing ARC's
  non-procedural content architecture.
- **Purpose:** Audit and re-architect ARC's non-procedural knowledge layer — strategies above all, plus
  briefs, rules, QUICK-REFERENCE, PROJECT-PRD, TECHNICAL-OVERVIEW — as one unified model: what surfaces
  exist and why, what belongs in each, how files are classified and named, and how an agent becomes aware
  of and loads not-always-loaded content. Where the unified model is the better owner of a concern a
  sibling WU currently carries, extract it here and sharpen the sibling's charter.

---

## Problem / Motivation

ARC's *procedural* content (workflows, methods, extensions) has a heavily developed — partly still
pending — architecture: deterministic loading (`loadSet` manifest), fragment composition
(`composable-workflows`), instruction-budget discipline (`instruction-optimization`), and a principled
always-loaded boundary (`loadset-composition`). The *non-procedural* knowledge layer grew by accretion
and has had no equivalent pass. Four axes of concern:

1. **Taxonomy & semantic boundaries.** What each artifact type is *for* is under-specified, so content
   placement is judgment-call-heavy and boundaries blur. Strategies are the sharpest case: "authoritative,
   canonical deep-dive on a domain" in intent, loose buckets in practice — the holding pen for anything
   on-demand-worthy that doesn't earn an always-loaded slot.
2. **Layer justification.** Strategies function as an internal docs layer *between* always-loaded session
   context and any actual docs layer (external site, organizational wiki). Does that layer deserve to
   exist as a first-class concept — or only as an optional tier for teams without a docs site? The
   settled line ("rationale goes to the docs site; strategies carry operational context, easier frontline
   access for agents/humans") feels weak and arbitrary. The agent-native convenience (in-repo, no tooling)
   is real; the boundary rule is not.
3. **Classification & naming.** File classification and the naming scheme across the family
   (`strategy-*`, `AGENT-BRIEF.*`, `DEV-RULES.*`, ALL-CAPS hubs, `STRATEGY-INDEX`) predate the newer
   thinking in `strategy-file-classification.md`, `naming-conventions`, and `idiomatic-alignment`
   (frontmatter `type`, path-is-ID). "QUICK-REFERENCE" doesn't name what the artifact actually is.
4. **Awareness & access.** How does an agent learn that not-always-loaded content exists and load it at
   the right moment? Today: an index with implicit awareness (`STRATEGY-INDEX`, the 60–75% recognition
   tier), a partial always-load (QUICK-REFERENCE's env section), scattered "consult X" pointers, and
   intent without mechanism — on-demand briefs and domain rules are *designed for* but have no loading
   machinery, and the task-list `Additional context:` field could feed one but nothing tells the writing
   agent to populate it. The every-session vs on-demand boundary is ad hoc where it should be a decision
   rule.

The prize: a unified progressive-disclosure model for non-procedural content that is mechanical, testable,
and DRY — to whatever degree the procedural side's determinism transfers to content that is *consulted*
rather than *executed*.

## Surface inventory (the audit object)

Non-procedural, agent-facing, in-repo:

- `reference/strategies/arc/**` (13 shipped strategies) + `strategies/project/**` (user-authored) +
  `STRATEGY-INDEX.md`
- `reference/briefs/` — `AGENT-BRIEF.ARC`, `AGENT-BRIEF.PROJECT`, `AGENT-BRIEF.CONTRIBUTOR`; design intent
  allows additional on-demand briefs (no mechanism yet)
- `system/rules/` — `DEV-RULES.ARC`, `DEV-RULES.PROJECT`, plus the designed `DEV-RULES.{DOMAIN}` /
  `DOMAIN-RULES.*` class (`rules-restructure`)
- `reference/QUICK-REFERENCE.md` — really *command lookup*: ensure the agent knows authoritative command
  reference exists and loads sections on demand; the always-loaded env slice is already half-demoted
- `reference/PROJECT-PRD.md`, `reference/TECHNICAL-OVERVIEW.md`
- Excluded: `adr/` and `supplemental/` (own methodologies), `templates/` (authoring inputs), procedural
  `system/**` content, WU planning artifacts, and task-adjacent record surfaces
  (`documentation-surface-routing`'s axis).

## Working framing

### Cross-domain lessons from the procedural side (candidate imports)

- **The determinism chain** (`agent-context-optimization` cohort thesis): if the CLI can compute it, the
  CLI computes it; if computed, no document restates it; if conditional, it doesn't load until its
  condition is true. What is this chain's analogue for knowledge content, where the "condition" is
  *relevance to the work in hand* rather than a probe-computable state?
- **Recognition-reliability spectrum** (`loadset-composition`): always-present ~100% / explicit trigger
  85–95% / indexed-implicit awareness 60–75% / search 20–40%. `STRATEGY-INDEX` sits squarely in the
  weakest deliberate tier. Any redesign of strategy awareness should move access to explicit triggers —
  the question is what the trigger surface for non-procedural content *is* (workflow steps? task-list
  fields? probe-emitted domain hints à la `domainRules`?).
- **Resolve-then-load / manifest** (`composable-workflows`, `loadSet`): the load set as a testable
  projection rather than prose enumeration. A knowledge-layer equivalent could make "what loads when" a
  parity-tested artifact instead of scattered instructions.
- **Precedent for the fix shape** (`documentation-surface-routing`): root cause split as *content failure*
  (rules scattered, no canonical home) + *mechanism failure* (guidance not salient at the moment of use);
  fix both or drift continues. The same diagnosis plausibly applies to strategy consultation.

### External idiom pool (adopt / adapt / inform)

Stance: never slavish to idiom, never bucking it without principled reason. First-line inputs are ARC's own
shipped/planned machinery; these external idioms inform, and are adopted or adapted where they compose:

- **Diátaxis** — the reference-vs-explanation cut is the principled basis the "operational in strategies /
  rationale on the docs site" line has lacked; the failure mode it names (explanation mixed into reference
  degrades both) is a candidate diagnosis for the loose-bucket feel of today's strategies.
- **Cursor rules** — a shipped trigger vocabulary (`alwaysApply` / glob-attached / description-requested /
  manual); practitioner consensus that deterministic attachment outperforms description-requested supports
  mechanical-where-structural.
- **Agent skills (Claude Code)** — three-level progressive disclosure. The load-bearing insight: descriptions
  are authored as *firing conditions* and are *persistently re-presented* by the harness each turn. ARC is
  harness-agnostic and cannot assume persistent re-presentation — its analogue must be fire-site
  re-presentation (workflow steps, CLI-emitted manifests/agendas). Adapt, not adopt.
- **llms.txt / OKF** — index-as-spec-shaped-artifact; path-is-ID + type-in-frontmatter (the latter now forced
  here — see § Relationship to other work).

### Placement principle (working synthesis, 2026-07-03 pass)

Two axes place every non-procedural artifact; the two on-demand tiers coexist by principle, not hedging:

- **Miss-cost.** What does a session lose if this content fails to load at its moment? High miss-cost —
  constraints, safety, non-negotiables — earns `always` or a hard trigger, never the indexed tier. (Extends
  `loadset-composition`'s "never demote a constraint.")
- **Trigger-knowability.** Is the moment of relevance *structural* — identifiable at authoring time by a
  computable condition (workflow step, lifecycle stage, path/domain match, config state) — or *emergent* —
  arising from the content of the work in ways no pre-computed condition captures?
    - Structural → **hard trigger**, mechanically evaluated (probe/manifest) — parity with the procedural side.
    - Emergent → **indexed**, where the index entry is authored as a *firing condition* ("when X, load Y"),
      never a title or summary. So understood, the indexed tier is not implicit awareness — it is an explicit
      trigger relocated into context with the body left on disk. Its reliability is a function of
      firing-condition authoring discipline plus the condition's *persistence* in context; both are designable
      (tiny index, fire-site re-presentation) and lintable (`knowledge-lint`).

Mismatches are the failure modes: hard triggers on emergent-relevance content go brittle (glob/condition
sprawl, false negatives, maintenance drag); judgment firing on structural content wastes reliability the
machine could supply. `STRATEGY-INDEX`'s existing "Consult when:" lines show the index is already
half-shaped for this; its weaknesses are thin conditions, the one-shot init read (salience decays
mid-session), and no mechanical standing or testability.

**Research grounding (2026-07-03 light pass — the principle held, with sharpenings):**

- **Directive, not merely condition-shaped.** Passive "use when X" descriptions activate ~77–87%;
  directive phrasing ("ALWAYS invoke when {triggers}; do not {default action} directly") reached ~100%
  (20.6× odds ratio — single 650-trial practitioner study, directional not load-bearing, but
  cross-validated by Cursor-ecosystem experience where description-requested rules are the tier that
  silently never fires). Firing conditions name the trigger *and* the default behavior to suppress.
- **Index-awareness is strictly weaker than fire-site re-presentation.** llms.txt is the cautionary tale:
  a passively-available index shows near-zero measured effect even on crawlers. An index earns
  reliability only when something actively surfaces its entries into the live instruction stream (a
  workflow step, a CLI emission, a lint). Lost-in-the-middle findings independently support re-presenting
  instructions near the point of use as an empirical mitigation, not just a design preference.
- **ARC already ships the validated pattern — generalize it, don't invent beside it.** The procedural side
  runs a three-tier hybrid today: rules (always) / **methods (deterministic fire-site attachment via
  workflow-frontmatter declarations)** / skills (semantic firing, harness-native, Claude-Code-only). The
  methods mechanism sidesteps the entire semantic-firing failure catalog because the workflow step *is*
  the trigger, restated in its own text — simultaneously the lost-in-the-middle mitigation. The knowledge
  layer's hard-trigger leg is plausibly an `arc.methods`-style declaration generalized to knowledge
  content (`arc.knowledge`?), not new machinery.
- **Lean-always pressure is now quantified.** Instruction-following peaks around 150–200 simultaneous
  instructions and degrades toward ~68% at 500 (IFScale), with measurable early-position bias — numeric
  backing for the instruction-budget thesis and for a minimal `always` tier.
- Evidence honesty: no published study cleanly quantifies recall *by loading tier*; the tier percentages
  in `research-instruction-reliability.md` remain experience-calibrated, backed by adjacent
  (instruction-count and position) findings.

Pending: the corpus walk classifying each artifact on the two axes (running 2026-07-03).

### Unified model & extraction posture

This WU's deliverable is the **unified model**, owned in one place. Where a sibling WU currently carries a
piece of that model, prefer **extracting the concern here** over drawing a seam around it — when doing so
gives both WUs a sharper charter. Not everything piles in: siblings keep what they can own crisply
(mechanisms, domain-scoped execution); this WU owns the cross-surface taxonomy, boundary rules, and the
awareness/access model. Splits are agreed at each sibling's planning touchpoint, mirroring the
`idiomatic-alignment` ↔ `naming-conventions` arrangement ("pulls the question out if that lands with
cleaner boundaries; agree the split at planning time").

Extraction candidates (leans, to be negotiated — see § Relationship to other work):

- **QUICK-REFERENCE's role and end-state** — currently `loadset-composition` Layer 3 decides its T1
  residual; the artifact's *identity* (command-lookup role, name, shape) is arguably this WU's taxonomy
  question. Lean: LC keeps the T1-membership call (it's a load-set decision); this WU owns the artifact's
  redefinition/renaming.
- **Domain-rules vs strategies boundary** — `rules-restructure` owns the `DOMAIN-RULES.*` split + wiring;
  the *boundary semantics* (what content is a domain rule vs a strategy section) is unified-model
  territory. Lean: RR keeps the rename + wiring mechanism; this WU owns the content-boundary rule — or RR
  is absorbed wholesale if grooming shows the wiring is just one instance of the general awareness
  mechanism. Open.
- **Placement thresholds** — LC integrated a buffer item landing "DEV-RULES minimal operational /
  strategies deep-dive / docs-site rationale" thresholds in `strategy-session-operations.md`. That is
  exactly the boundary this WU interrogates (and finds weak). Coordinate: LC's demotion rule stands; the
  *content-placement* half may belong to this WU's model, with LC deferring or co-landing. Open.
- **Frontmatter `type` / classification layer** — `idiomatic-alignment` owns the OKF-alignment read;
  `naming-conventions` owns hub renames. This WU consumes both rather than extracting — unless the unified
  taxonomy turns out to *be* the natural home for the classification codification. Open.

## Concern-by-concern starting positions

- **Strategies.** Sharpen or overhaul — renaming and restructuring are both on the table. Design intent to
  interrogate: an in-repo, agent-native, internal-facing deep-dive layer whose audience is the teams using
  ARC (not end-product users). Key questions: does it survive as a distinct category; is it optional when
  a real docs layer exists; what's the principled content boundary against (a) always-loaded surfaces and
  (b) the external docs layer; is one flat `strategy-*` bucket the right granularity (vs domain-scoped
  rules, method-adjacent references, or fragments).
- **QUICK-REFERENCE.** The "tiny always-loaded subset + look up the rest" model underperforms; the name
  misdescribes the artifact (it's command lookup / authoritative command reference). Needs role
  sharpening at minimum; possibly rename + reshape, coordinated with LC's T1 decision.
- **Briefs and rules.** The always-loaded set (ARC + PROJECT pairs) is settled and cheap; the *on-demand
  extension* of both families (additional briefs, domain rules) has design intent but no mechanism — no
  loading trigger, no authoring-side prompt to declare relevance (`Additional context:` exists as a field
  but nothing instructs the writing agent to use it, and nothing instructs a reading agent to honor it).
  Unify with the general awareness model rather than solving per-family.
- **Every-session vs on-demand boundary.** Adopt LC's decision rule (demote only to explicit trigger;
  never demote constraints) as the load-side half; author the content-side half (what *kind* of content
  belongs at which tier) as part of the unified model, superseding the ad-hoc line.

## Corpus walk — findings (2026-07-03)

Full-corpus profile (content-kind mix + consumption moments for all 16 strategies) plus the procedural
reference graph (references to each strategy from `system/**`). Four findings:

1. **The bucket is less loose than it feels — the head of the corpus is method-shaped.** Seven of 13 ARC
   strategies are 65–80% operational reference with clear structural consumption moments
   (`adr-methodology`, `file-classification`, `quality-gates`, `task-list-formatting`,
   `workflow-authoring`, `configurability-architecture`, `planning-module`; `package-project-sync` on the
   project side). For these, hard-trigger formalization is *mechanization of existing practice*, not
   redesign. The reference graph corroborates: consultation is already fire-site-shaped at the head
   (`work-organization` 43 procedural references, `task-list-formatting` 12, `session-operations` 9) with
   a long tail at ≤1 reference.
2. **Four files are explanation-heavy** — `concurrent-work` (~45% explanation incl. philosophy
   checkpoints), `interlock-release-wrappers` (~55%, self-described architectural reference),
   `storage-evolution` (~40%, self-labeled direction doc), `testing-methodology` (~45%). The Diátaxis
   reference-vs-explanation violation is concentrated here — **except** `testing-methodology`, which is
   *deliberately* the rationale layer over its two operational methods (`test-first`,
   `testing-standards`): not a violation but the validated two-layer pattern, and the template for how
   kind-C content (below) coexists with operational methods.
3. **Buried constraints are the sharpest defect.** Hard invariants sit mid-document in on-demand files:
   append-only-until-integration (`concurrent-work`); cut→occupy, the one-level nesting cap, spec-flow
   invariants, single-branch-per-WU (`work-organization`); the integration-interlock and push-ordering
   invariants (`session-operations`); the nine forward-compat principles (`storage-evolution`);
   destructive-flag rules (`interlock-release-wrappers`, `workflow-authoring`). By the miss-cost axis this
   is exactly the placement the principle forbids — highest-miss-cost content in the lowest-reliability
   position. Deliverable: a constraint-relocation list (targets: always-loaded rules surfaces, or the
   fire-sites gating the operations). Seam: relocation-list authorship is this WU's; execution ownership
   is negotiated with `rules-restructure` at its touchpoint.
4. **The classification unit is the section, not the file.** The two giants (`work-organization` 1426
   lines, `session-operations` 1091) are bundles of many distinct structural moments, and procedural
   references already target sections (`§ Errand Work Class`, `§ Render standard`). Awareness contracts
   attach at fragment granularity — the same conclusion `composable-workflows` reached for procedural
   content, which strengthens the shared-substrate case. The genuinely emergent-relevance residue is
   small (`concurrent-work`'s judgment doctrine, `testing-methodology`'s content-driven relevance, the
   strategic-awareness passages) — the mechanical share of the corpus is large.

### Strategies-layer verdict (leaning, pending ratification)

"Strategy" as a category conflates four content kinds that the placement principle separates:

- **(A) Operational reference with structural triggers** → hard-trigger tier (fire-site declaration via
  the generalized methods mechanism). The bulk of the corpus by volume.
- **(B) Hard constraints** → `always` tier or gate-site placement; never mid-document on-demand. Small
  volume, highest miss-cost.
- **(C) Explanation / rationale / direction** → the one kind whose *location* is legitimately variable:
  docs site when one exists and is maintained, an explicitly-labeled in-repo explanation surface when
  not. The architecture is identical either way; only the storage differs — this dissolves the
  "strategies layer: mandatory or optional?" question (the layer isn't optional; its location is).
- **(D) Emergent-relevance doctrine** → directive firing-condition index.

Under this verdict the strategies layer as a *category* dissolves into per-fragment awareness contracts;
the "strategies vs docs site" line stops being fiat ("rationale there, operational here") and becomes the
reference-vs-explanation cut enforced by miss-cost × trigger-knowability. Whether the *name* "strategy"
survives — and for which kind — is a naming decision for the redesign, coordinated with
`naming-conventions`.

## Architecture directions (working — verdict ratified 2026-07-03)

### Author for humans, address for agents

Operational reference must be lean and composable at consumption time — never "load the whole domain doc
for one relevant section" — but knowledge content, even more than procedural, must stay coherently
human-readable; blind sharding into agent-sized chunks fails the human half of the audience. Treat
fragmenting as an *addressing* concern, not necessarily a *storage* concern. Two realization shapes,
likely mixed per artifact, designed jointly with `composable-workflows` (which faces the same tension
procedurally):

- **Fragment-addressable monoliths** — files stay whole and readable; stable section anchors +
  partial-read machinery give agents section-level loads (already ARC practice: session-init's
  section-level reads, the one-grep-offset-compute rule).
- **Physically split fragments + composed human views** — storage is fragment-shaped; hubs or projections
  reassemble the readable whole.

### The on-demand boundary — two orthogonal axes (refined 2026-07-03; crispness is a design requirement)

A unified `arc.knowledge`-style fire-site declaration invites the question: what belongs in knowledge vs
a method vs the workflow body/fragments themselves? Refined cut, aligned with `composable-workflows`'
OO-flavored direction — two orthogonal axes, with overridability reclassified as a capability flag
(methods *can* be virtual; that is not what makes them methods):

- **Kind axis** — *procedure* (imperative: executed or applied) vs *knowledge* (declarative: consulted to
  inform judgment).
- **Visibility / fan-in axis** — *private* (single consumer; lives inline in its owner) vs *public*
  (multiple consumers; extracted into a contract-shaped unit, declared at fire sites).

The mapping: **methods** = public procedure (multiple callers; virtual when marked); **workflow
fragments** = private procedure ("private methods" of their owning workflow); **knowledge units** =
public knowledge (extracted, declared); a workflow's own inline reference material = private knowledge
(stays in the body). The analogy should extend cleanly precisely because workflow fragments *are*
procedure.

**Extraction rule (answers "what goes in the base vs a unit"):** extraction is forced by fan-in (a second
consumer) or by an orthogonal surface need (projection/audience, lint target) — never by content-kind
aesthetics. The DRY discipline from code (don't extract before the second caller), applied to
instruction content.

**Transitive declaration (encapsulation applied to loading):** each artifact declares only what its own
body consumes. A workflow declares the knowledge its body reads; a method declares its own knowledge
dependencies in its own frontmatter; a workflow never re-declares what its declared methods need.
Loading resolves the transitive closure, deduped (a unit shared by two declared methods loads once).
The closure is CLI-computable — deterministic, manifest-emittable, parity-testable — and extends the
existing author-side declaration rule (`strategy-workflow-authoring`) unchanged in spirit. Analogy note:
the *mechanics* are a module/import graph (declare at point of use, resolve transitively) more than OO;
the *rationale* is OO encapsulation — a caller depends on the method's contract, never its
implementation, and the method's knowledge deps are implementation.

Schema-time questions: closure-depth policy (may knowledge declare knowledge? lean — cross-references
freely, load-bearing declarations depth-capped to keep closures bounded); the decision-model blur
(`classify-work-unit`-like methods whose boundary tests read as knowledge and triage as procedure — the
two-axis cut suggests splitting the contract from the model where the model gains a second consumer, and
not before). Validate against the corpus in both directions (strategies that should become methods;
methods that are knowledge in method clothing).

### Naming the knowledge unit (candidates + leans; final call with `naming-conventions`)

The extracted public-knowledge unit needs a family name — "strategy" doesn't survive the verdict as that
name (it conflated four kinds). Candidates, with leans:

- **`reference`** (reference units; `arc.reference:`) — *primary lean.* Names what the content is
  (Diátaxis: reference), matches the already-shipped `.arc/reference/` directory, and is human-legible
  without OO literacy. Costs: generic; mild prose overload with git refs.
- **`statics`** (`arc.statics:`) — *declaration-surface runner-up*, from the static-readonly-data
  intuition. `arc.methods` / `arc.statics` reads as a natural pair, which is its real strength. Costs:
  in web tooling "statics" means static assets; and in OO, `static` modifies procedures too (static
  *methods*), so the noun alone doesn't say *data* — the contrast carries the meaning only next to
  `arc.methods`.
- **`canon`** (`arc.canon:`) — distinctive, collision-free, echoes the original "authoritative,
  canonical deep-dive" strategy intent. Cost: slightly precious; unfamiliar as an artifact-family noun.
- **`knowledge`** (`arc.knowledge:`) — the safe self-describing default; bulky in declarations and prose.
- **`data`** (`arc.data:`) — *strong late entry.* The canonical OO bundle is literally "data + methods" —
  a more fundamental symmetry than `statics`, without the static-*methods* flaw. Costs: modern usage
  connotes structured/machine data, so prose doctrine as "data" reads oddly at first; very generic for
  grep/prose.
- **`attributes`** — the UML class-compartment pair (attributes + operations/methods); textbook symmetry.
  Costs: HTML/XML-attribute and frontmatter-key collisions in a markdown-heavy system. (`fields` and
  `properties` share the symmetry but collide worse: meta-file fields; properties/config files.)

**Anti-conflation principle (2026-07-03):** the primitive's name must not encode structural position —
`reference/` is a directory (where some units happen to live), not the primitive. This weakens
`reference` as the *primitive* name while leaving it intact as *kind* vocabulary: kind A remains
"reference-kind content" (Diátaxis) regardless of what the declaration key is called. Two naming slots,
solved separately: the kind vocabulary (Diátaxis terms, descriptive) and the primitive/declaration key
(`arc.<X>:`, structural).

Kind-C (explanation) content is deliberately *not* this family — it is the projected/relocatable layer
and may carry a separate name (Diátaxis "explanation", or plain docs vocabulary). Final naming
coordinates with `naming-conventions` (`TYPE.QUALIFIER`, prefix scheme) and the forced
frontmatter-`type` layer.

### Awareness-contract schema (first sketch — iterate)

Unit-side frontmatter, strawman:

```yaml
type: reference                      # the forced frontmatter-type layer
name: concurrent-work/append-only    # stable ID (path-is-ID candidate — see open question)
tier: triggered | indexed            # `always` may live only in the loadSet manifest, not per-unit
trigger:                             # triggered: machine-evaluable structural condition
  workflow: integrate-work-unit      #   …or a path / domain / config-state condition
fire: >-                             # indexed: the directive firing condition the index emits
  ALWAYS load before {operation}; do not {default action} directly.
audience: team | agent               # projection tag (single-source projection direction)
```

Consumer side: workflows *and methods* declare their own units (key name pending § Naming); the CLI
resolves the deduped transitive closure and emits it in the manifest; indexed units' `fire` lines
compose the generated index surface (the `STRATEGY-INDEX` successor). Lintable (`knowledge-lint` seam):
schema validity, directive-form `fire` lines, orphaned units (no consumer and no index presence),
buried-constraint heuristics.

**Tier question resolved by corpus pressure-test (2026-07-03): tier is *derived*, not declared — on
either side.** Running the schema against concrete units dissolved the per-unit vs per-edge fork:

- The motivating "wants both tiers" example (append-only-until-integration) turned out to be a **kind-B
  constraint mislabeled as a unit** — constraints relocate to always-loaded/gate surfaces; they never get
  unit contracts. The model self-corrected: when a unit seems to need both a hard trigger and index
  presence for safety, that's the miss-cost axis saying it isn't a unit at all.
- Genuine kind-A units tested tier-stable once triggers anchor to **operations, not workflows**: the
  render standard fires on "rendering ROADMAP" wherever that occurs (any ceremony, or ad-hoc); the errand
  decision matrix fires on "routing discovered work." Workflows are *sites where operations occur* —
  operation-anchored conditions cover ad-hoc invocation for free.
- Remaining resolution: **no `tier` field anywhere.** Access paths are derived from structure — a unit is
  fire-site-loaded iff ≥1 consumer declares it; index-present iff it carries a `fire` line; always-loaded
  iff in the loadSet manifest. These are independent facts, combinations legal, all CLI-computable. A
  unit with no consumer and no `fire` line is an **orphan** (lint). The miss-cost axis governs authoring
  (constraint content must never be index-only) as a lintable heuristic, not a schema field.

Still open in the sketch:

- **ID scheme** — path-is-ID (OKF) vs an explicit `name` field; interacts with the forced `type` layer
  and relocatability rules.
- **Operation vocabulary** — operation-anchored triggers need a modest named-operation set ("render
  ROADMAP", "route discovered work") for conditions to reference; where that enum lives and how it stays
  honest (probe-emitted? convention?) is schema-time design.

### Command reference — the index-native case (2026-07-03)

Command-reference content (QUICK-REFERENCE's actual role) looks like a grey-area tier problem —
always-loaded is unjustified when no command fires that session; on-demand risks the expensive
awareness failure (an agent burning enormous manual effort on what one known command resolves, e.g.
MD060 table alignment vs `markdown-table-formatter`). The model dissolves it via a property unique to
this content kind: **the awareness/body split is extreme, and awareness ≈ payload.** "Symptom/operation
→ command" fits in a fire line; for many commands the fire line *is* the full useful content. Command
reference is **index-native knowledge**: not a document needing a tier, but a collection of
fire-line-sized **capability cards**, grouped into card *sets* (quality-gate set, formatting set, ARC
CLI set), most of them project-owned content in framework-shaped slots.

Layered awareness model (most→least deterministic):

1. **Emitted remedies** — the sharpest trigger is the symptom itself: gates, hooks, and CLI output carry
   the fix command at failure time (MD060 failure output names the formatter invocation). No loading at
   all; the determinism chain applied to command awareness. Idiom: Rust diagnostics (error → suggested
   fix), shell command-not-found handlers.
2. **Hard-triggered card sets** at operations — the gate-running step loads the gate cards; commit
   compose loads the commit set. Largely exists today via workflow/method wiring.
3. **Index fire lines** for the emergent residue — awareness ≈ payload makes cards the index's
   best-value occupants.
4. **Self-describing CLI backstop** — one taught pattern (`npm run` listing, `arc --help`) covers the
   tail at search-tier reliability. Idiom: uniform script namespaces.
5. **Harness-native persistent surfaces** as progressive enhancement — CLAUDE.md-style command sections,
   MCP tool definitions for the highest-value few, where the harness provides them (same
   adapt-not-adopt posture as skills).

**Blur-case evidence banked:** `quality-gate-commands` is a "method" with no contract (no given-X-
resolve-Y) — an info fetch, i.e. *knowledge in method clothing*, exactly the corpus-validation
direction-2 case the two-axis cut predicted. What it borrows from methodhood is the override mechanic,
which under this model dissolves into **project ownership of card content** (the framework ships the
slot, the project fills it — Configurable-class, like `DEV-RULES.PROJECT`, which already duplicates the
gate commands today; the duplication is itself a finding). QUICK-REFERENCE's end state: dissolves into
card sets + index emission — its naming problem evaporates with the artifact; the always-loaded env
slice remains `loadset-composition`'s T1 call (coordinate).

### Single-source projection (the no-drift direction)

Kind C (explanation) points at a larger possibility: knowledge authored once and **projected** to both
the in-repo agent-native surface and the external human-facing docs layer — drift impossible by
construction. Under that model the in-repo layer's pitch sharpens from a redundancy apology to a feature:
agent-native, no MCP or network required, and *composed* rather than duplicated. Audience keeps it
honest:

- **Composes:** team-facing methodology/domain knowledge — ARC's own docs site for adopters, an org's
  engineering wiki; same audience family as the in-repo layer, so one source can serve both.
- **Does not compose:** end-product user documentation — different audience, different content; already
  excluded by § Scope boundary.

Forward-compat: convergent with — not additional to — ARC's standing direction: ADR-022
record/projection, `arc-backend`'s record→markdown materialization model, `strategy-storage-evolution`'s
tracked-vs-materialized line (the knowledge source need not live in the code repo), and
`idiomatic-alignment`'s OKF projection-readiness thread. **Scope guard:** this WU designs the knowledge
model to be projection-*compatible* (source-of-truth shape, fragment addressing, audience tags); building
the projection pipeline is `arc-backend` / docs-tooling territory, not here.

## Relationship to other work

- `loadset-composition` — closest sibling; owns T1 boundary + demotion rule + QUICK-REFERENCE T1 call +
  placement thresholds. Extraction negotiation above. Sequencing note: LC is Ready/P2 and may run first —
  if so, this WU inherits its landed rule and thresholds as inputs to re-anchor against.
- `rules-restructure` — owns `DOMAIN-RULES.*` rename + auto-load wiring; candidate for partial extraction
  or wholesale absorption (open). Its trigger-model alternatives (extension declaration / path heuristics /
  user-invoked) are a concrete design input to the general awareness mechanism.
- `idiomatic-alignment` — **extraction agreed (2026-07-03): this WU forces the frontmatter-`type`
  decision** — the awareness contract rides frontmatter, so the type layer is settled here as its enabling
  substrate. IA keeps the OKF correspondence documentation and projection-readiness threads; seam to be
  confirmed at IA's planning touchpoint.
- `naming-conventions` (doc-conventions) — `TYPE.QUALIFIER` hub renames + file-classification
  codification; any renames this WU proposes (QUICK-REFERENCE, strategy prefix) coordinate there.
- `composable-workflows` — fragment/resolve-then-load substrate; the mechanized form of any
  progressive-disclosure design likely lands on its mechanism. Design-settles-first dependency if this WU
  reaches mechanism build.
- `documentation-surface-routing` — different axis (task-adjacent record surfaces), but shared fix-shape
  precedent (content + mechanism) and shared "canonical home + thin per-site alignment" architecture.
- `knowledge-lint` — enforcement-side sibling; whatever taxonomy/boundary rules this WU codifies become
  lintable surface.
- `skill-infrastructure-cleanup` — ARC's skills are the live *semantic-firing* tier (harness-native,
  Claude-Code-only today); their descriptions belong to the same firing-condition authoring discipline as
  the knowledge index, even though skill bodies are procedural. Actionable insight surfaced 2026-07-03,
  routing there: current `SKILL.md` descriptions are passive/summary-style — the weakest firing style per
  the research; rewrite in directive firing-condition form. Lean on the seam: this WU owns the
  cross-family description-authoring *standard*; SIC owns the skill-file mechanics and the rewrite pass.
- `docs-site-refresh` / `docs-content-sweep` — the external docs layer whose existence drives the
  layer-justification question; the strategies-vs-docs-site line must be settled jointly (ARC's own site
  is stale, which is itself evidence about the two-layer model's maintenance economics).
- Cohort: standalone at mint; `doc-conventions` (theme bucket) remains a candidate home;
  `agent-context-optimization` rejected as a member home (its thesis is the runtime instruction surface —
  this WU consumes its lessons, doesn't extend its layers). Revisit via `assess-cohort-fit` as the draft
  matures.

## Scope boundary

- **In scope:** the non-procedural surface inventory above — taxonomy, boundaries, naming/classification,
  awareness/access model; extraction negotiations with siblings; the audit itself (what works, what
  doesn't, why) as the first deliverable.
- **Out of scope:** procedural content architecture (owned by the `agent-context-optimization` cohort);
  task-adjacent record surfaces (`documentation-surface-routing`); ADR and supplemental methodologies;
  the docs site's own content (owned by `docs-site-refresh` / `docs-content-sweep`), beyond settling the
  boundary against it; end-product-user documentation.

## Unknowns and Assumptions

- Whether the strategies layer survives as a category, becomes optional-when-docs-site-exists, or is
  restructured into something else entirely — the central open design question.
- How far the mechanical share extends in practice — which content proves structural vs emergent on the
  trigger-knowability axis; answered by the corpus walk, not a priori. Working stance: mechanical where
  possible/viable, judgment-fired where the relevance is genuinely emergent.
- Whether firing-condition persistence can be made reliable harness-agnostically — without the
  skills-style per-turn re-presentation, fire-site re-presentation and manifest emission must carry the
  salience load; unvalidated.
- How much of the awareness mechanism is probe-computable (à la `domainRules` slot) vs authored
  (declarations in workflows/task lists) vs indexed (a sharper successor to `STRATEGY-INDEX`).
- Assumption: audit-first is the right shape — evaluate the current architecture before committing to an
  overhaul; the WU may split (audit → design → execution cascade or cohort) once findings land.
  `assess-cohort-fit` re-fires as this matures.
- Assumption (canonical-vs-instance honesty, per LC): ARC's own repo is the motivating instance; the
  deliverable is the canonical model that ships — templates, placement guidance, loading policy — not a
  local content shuffle.

## Scope Estimate

Large (week+), design-led, likely multi-session grooming before spec. Audit deliverable may be Medium on
its own; the redesign cascade depends on findings and extraction negotiations. No hard dependencies to
start grooming; mechanism build (if any) lands behind `composable-workflows` design-settle, and several
threads coordinate with `loadset-composition` (whichever runs first re-anchors the other).

---

## Continuity

- **Readiness:** rough, moving toward maturing — the mechanism-side fundamentals now have a working shape
  (placement principle); the taxonomy-side fundamentals (strategies-layer justification) remain open.
- **Resolved:** scope framing (four axes + surface inventory); extraction posture (unified model owns the
  cross-surface concerns, siblings keep crisp mechanisms, splits agreed at planning touchpoints);
  standalone at mint; audit-first shape; **ordering** — mechanism first, taxonomy against it, extraction
  falls out (the spine test: an artifact type earns existence by a distinct awareness contract, not a
  distinct name); **frontmatter-`type` decision forced here** (extraction from `idiomatic-alignment`);
  **placement principle** (miss-cost × trigger-knowability; both on-demand tiers legitimate — hard
  triggers where structural, firing-condition index where emergent; working, pending research grounding);
  idiom stance (adopt/adapt/inform, never slavish, never bucked without reason).
- **Open:** strategies-layer justification and end-state; trigger-evaluator mechanism shape (probe slot vs
  manifest vs both); harness-agnostic firing-condition persistence design; extraction calls per sibling
  (QUICK-REFERENCE identity, rules-restructure partial vs wholesale, placement-thresholds ownership);
  cohort home; whether this WU decomposes after the audit.
- **Resolved (research pass, 2026-07-03):** placement principle held and sharpened — directive firing
  conditions; index-awareness strictly weaker than fire-site re-presentation; the hard-trigger leg
  generalizes the shipped methods mechanism rather than inventing parallel machinery; skills identified
  as the live semantic tier, description-standard seam routed to `skill-infrastructure-cleanup`.
- **Resolved (corpus walk, 2026-07-03):** findings 1–4 in § Corpus walk — head of corpus is
  method-shaped (mechanize, don't redesign); explanation concentration in four files with
  `testing-methodology` as the validated two-layer template; buried-constraints defect list identified;
  fragment-granularity conclusion (contracts attach to sections, not files).
- **Resolved (pass 3, 2026-07-03):** four-kind verdict **ratified**; author-for-humans /
  address-for-agents adopted as a design constraint (fragmenting is addressing, not necessarily
  storage); three-way on-demand boundary working cut (do / apply / know) with crispness a first-class
  requirement; projection direction adopted as a *compatibility* target, pipeline out of scope;
  skill-description firing-condition seam landed in `draft-skill-infrastructure-cleanup.md` (direct
  edit sanctioned on this grooming branch).
- **Resolved (pass 4, 2026-07-03):** boundary model refined to two orthogonal axes (kind ×
  visibility/fan-in) per the CW OO direction — overridability is a capability flag, not a definition;
  fan-in extraction rule adopted (second consumer forces extraction); transitive declaration adopted
  (methods declare their own knowledge deps; loading resolves the deduped closure, CLI-computable).
- **Open (new):** realization shape per artifact (addressable monolith vs split-plus-composed-view);
  closure-depth policy for knowledge-declaring-knowledge; the decision-model-method blur cases
  (`classify-work-unit`-like — split contract from model at the second consumer, not before);
  audience/projection tags in the contract schema.
- **Resolved (pass 5, 2026-07-03):** unit-naming candidates recorded with leans (`reference` primary,
  `statics` runner-up on declaration-surface symmetry, `canon`, `knowledge`); awareness-contract schema
  first sketch drafted (unit frontmatter + consumer-side declaration + CLI closure/index emission +
  lint surface).
- **Resolved (pass 6, 2026-07-03):** tier question dissolved — no `tier` field; access paths derived
  from structure (consumers → fire-site load; `fire` line → index presence; loadSet → always), orphan
  lint, miss-cost as authoring heuristic; triggers anchor to *operations*, not workflows; naming
  candidates extended (`data` strong late entry on the canonical OO bundle symmetry; `attributes` UML
  pair) plus the anti-conflation principle (primitive name ≠ structural position; kind vocabulary and
  declaration key are separate naming slots).
- **Resolved (pass 7, 2026-07-03):** command reference identified as index-native knowledge
  (awareness ≈ payload; capability cards in project-owned sets); five-layer command-awareness model
  (emitted remedies → triggered card sets → index fire lines → self-describing CLI backstop →
  harness-native surfaces); `quality-gate-commands` banked as the predicted knowledge-in-method-clothing
  blur case, its override mechanic dissolving into project ownership of card content; QUICK-REFERENCE
  end state = dissolution into card sets (naming problem evaporates; env-slice T1 call stays with
  `loadset-composition`).
- **Next:** settle the ID scheme and the operation-vocabulary home; full corpus validation of the
  schema (both directions); author the constraint-relocation list; take the extraction negotiations
  (rules-restructure, placement thresholds — QUICK-REFERENCE resolved above) with the ratified verdict
  in hand. Draft is approaching **maturing** — consolidation rewrite queued as the immediate next move
  (the passes are accreting; per draft-design's interim-softcap lean).

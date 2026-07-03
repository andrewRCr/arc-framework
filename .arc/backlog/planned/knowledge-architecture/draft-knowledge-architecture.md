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

## Relationship to other work

- `loadset-composition` — closest sibling; owns T1 boundary + demotion rule + QUICK-REFERENCE T1 call +
  placement thresholds. Extraction negotiation above. Sequencing note: LC is Ready/P2 and may run first —
  if so, this WU inherits its landed rule and thresholds as inputs to re-anchor against.
- `rules-restructure` — owns `DOMAIN-RULES.*` rename + auto-load wiring; candidate for partial extraction
  or wholesale absorption (open). Its trigger-model alternatives (extension declaration / path heuristics /
  user-invoked) are a concrete design input to the general awareness mechanism.
- `idiomatic-alignment` — frontmatter-`type` / path-is-ID / index-correspondence; consumed as
  classification-layer input.
- `naming-conventions` (doc-conventions) — `TYPE.QUALIFIER` hub renames + file-classification
  codification; any renames this WU proposes (QUICK-REFERENCE, strategy prefix) coordinate there.
- `composable-workflows` — fragment/resolve-then-load substrate; the mechanized form of any
  progressive-disclosure design likely lands on its mechanism. Design-settles-first dependency if this WU
  reaches mechanism build.
- `documentation-surface-routing` — different axis (task-adjacent record surfaces), but shared fix-shape
  precedent (content + mechanism) and shared "canonical home + thin per-site alignment" architecture.
- `knowledge-lint` — enforcement-side sibling; whatever taxonomy/boundary rules this WU codifies become
  lintable surface.
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
- Whether a unified mechanical progressive-disclosure model is *viable* for knowledge content, or whether
  relevance-triggered loading irreducibly needs judgment (making explicit-trigger authoring discipline,
  not mechanism, the real deliverable).
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

- **Readiness:** rough — first-pass capture from the framing session; direction real, fundamentals open.
- **Resolved:** scope framing (four axes + surface inventory); extraction posture (unified model owns the
  cross-surface concerns, siblings keep crisp mechanisms, splits agreed at planning touchpoints);
  standalone at mint; audit-first shape.
- **Open:** strategies-layer justification and end-state; the awareness/access mechanism's shape and how
  mechanical it can be; extraction calls per sibling (QUICK-REFERENCE identity, rules-restructure partial
  vs wholesale, placement-thresholds ownership); classification-layer ownership; cohort home; whether this
  WU stays one unit or decomposes after the audit.
- **Next:** iterate § Concern-by-concern into evaluated findings (walk the actual strategy corpus against
  the intended taxonomy; inventory every awareness path an agent has today); then work the
  strategies-layer justification question to a leaning.

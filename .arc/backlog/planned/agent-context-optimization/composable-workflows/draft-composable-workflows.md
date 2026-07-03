# Draft: Composable Workflows

- **Origin:** [internal] — surfaced during scalable-core deliberation while examining how workflows scale
  across modes and tiers; `adr-020` §9 names the resolve-then-load requirement and defers the mechanism here.
- **Purpose:** Design the substrate that bounds ARC's runtime instruction surface: the **workflow contract
  shape** (how workflows are authored), the **fragment substrate** (how conditional content exists and
  loads), and the **session-agenda compiler** (how the probe selects what a session reads). The cohort
  keystone — every `agent-context-optimization` sibling consumes this WU's pattern or mechanism.
- **State:** Draft — consolidated 2026-07-02 (grooming session). The 2026-05→06 inbound buffer is integrated
  into the body (§ Buffer dispositions maps every item); the design re-centered on the session-agenda model
  after `compaction-recovery` shipped the `loadSet` probe slice. Relocated from `principle-anchored-core`
  to `agent-context-optimization` the same session (in ADR-020 spirit; mechanically this cohort's
  deliverable) — see `cohort-agent-context-optimization.md` for the layers model and sequencing.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Consume `adversarial-review`'s method invocation-contract prototype**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: composable-workflows`), housekeep drain (2026-07-03);
  captured during `adversarial-review` design.
- _Concern:_ `adversarial-review` has produced the first rich method-as-function prototype: valid-YAML contract
  blocks, callsite YAML whose single top-level key is the method name, return-schema fields, and a rendered
  control-point grammar that keeps alert type separate from method identity.
- _Fold-in:_ use the prototype as evidence for D1/D2's resolver and visibility model. Decide which parts belong
  in `strategy-workflow-authoring`'s marker inventory, and keep the extension fire-point `#name` marker reserved
  for extensions rather than generic callsites.

## Problem / Motivation

ARC's workflows scale across modes, tiers, and session states via **carry-and-skip**: inline conditionals
every session parses even when inapplicable. This is DRY but imposes a judgment tax — simple cases carry
the instruction load of complex ones. Composition — a fragment lives once and loads only when its condition
holds — keeps the DRY property while giving real isolation.

Since the original capture, the problem has sharpened from a tax into a **growth-rate disease**. Under the
current shape, every new probe surface or conditional arm adds three always-read costs to a core workflow:
a schema-table row (what the slot means), dispatch prose (what to do per state), and a conditional rendering
template (what to emit when it fires) — paid by every session forever, whether or not the surface fires.
`session-init.md` is the terminal case: 910 lines and ~31k tokens as actually metered at read time (its
dense table cells tokenize ~2.5× worse per word than prose), making the orchestrator the single largest
item in the ~100k-token first-prompt load it exists to manage. A typical session acts on a small fraction
of what it reads.

The cohort's sibling drafts each named a slice of the same mechanism — `instruction-optimization` Pillar 4's
"routing card," `loadset-composition`'s explicit-trigger demotion, `handoff-optimization`'s
resolve-then-load lightweight paths — and `compaction-recovery` shipped a working proto: the probe's
`loadSet` slice (ordered entries with read-modes) and `taskCursor`. The design is no longer greenfield;
this WU generalizes a mechanism already in production and owns the target: **a new surface adds O(1) to
any always-read core** — new behavior lands as CLI slots and fragments, never as core lines.

## Design center

The governing test (cohort thesis, held in `cohort-agent-context-optimization.md`): every line an agent
reads at runtime either changes behavior this session or is the bounded cost of discovering it doesn't.
The corollary chain: if the CLI can compute it, the CLI computes it; if the CLI computed it, no document
restates it; if it's conditional, it doesn't load until true.

The industry idiom this absorbs — the structured-prompting strain (typed signatures, schema-constrained
outputs, frontmatter-gated progressive disclosure) — reduces to one separation: **contract** (YAML,
declared, machine-checkable), **guidance** (prose, minimal, natural), **data** (emitted at runtime, never
restated statically). ARC has all three layers but blends them inside workflow bodies. The
`adversarial-review` method reshape (signature-led: one-line signature, named-input contract with
code-variable discipline, YAML callsite, return schema) is the settled in-house instance; this WU
generalizes it from methods to workflows. Three deliverables:

### D1 — The workflow contract shape (authoring pattern)

A workflow is authored as a signature-led contract plus a bounded spine:

- **Frontmatter is the contract**: `purpose`, `audience`, `arc.methods` / `arc.extensions` — extended with
  **conditional declaration** (arm- or `sessionType`-gated entries), so on-demand method needs are declared
  and point-scanner-validated instead of hand-written prose loads (surfaced by `assess-parallel-fit`'s
  prose-load wiring in session-init). Candidate addition: declared probe inputs — which envelope slots the
  workflow consumes. **D1 settles the whole declaration family's schema** — eager `methods`,
  fire-point-gated `extensions`, arm-gated conditional entries, and the authored-from `templates` key
  (`draft-workflow-template-loads.md` re-scopes as that key's executor; its eager-vs-gated wording fix
  rides this strategy rewrite).
- **One-line signature** in a leading blockquote, `adversarial-review`-style:
  `session-init(probe) → oriented session`.
- **Bounded spine**: the invariant step sequence, with a hard structural budget (CI-checkable — ARC already
  runs zero-tolerance markdown lint; a core-size check is the same discipline). A conditional arm appears in
  the spine as **one line**: gate expression + fragment pointer. No arm bodies inline.
- **Schema out-of-band**: no workflow documents an envelope slot's shape inline; it cites the slot name.
  The envelope schema lives in one reference surface — ideally **generated from the TypeScript types**
  (single source, cannot drift; ADR-022's managed-records philosophy applied to documentation).
- **Emitted text precomposed**: anything rendered verbatim comes from the CLI (`recommended*Text` /
  `recommended*Prompt` pattern), not from templates in prose.

Lands in `strategy-workflow-authoring.md` (new section alongside Prose economy) + `template-workflow.md`.
Two absorbed conventions ride along: referencing **external/harness skills** from ARC content (prose not
frontmatter; project-level only, never shipped surfaces; author for graceful degradation), and the
**stable-anchor rule** for cross-file references (below, D2).

Human readability is served, not traded: prose stays natural _within_ each unit; a maintainer reads the
spine plus an index hub for the whole picture, or one fragment for one arm — better locality than a
910-line monolith, not worse.

**The shape recurses.** A fragment is authored under the same discipline scaled down: a signature line
(gate / fires-when, envelope inputs consumed, exit state — including a recompile exit), a bounded body
under the same structural-budget check (per-file, so CI covers fragments for free), and the prose-economy
test. Workflow → fragment → method is one self-similar pattern, not three conventions; the fragment
authoring guidance lands in the same strategy section.

**Adoption ladder (compliance scope).** Not every workflow earns every layer. **Level 1 — contract
shape** (signature, frontmatter contract, prose economy): every workflow, unconditionally. **Level 2 —
fragment extraction**: workflows with real conditional arms. **Level 3 — agenda compilation**: only
probe-backed session ceremonies (init, recover, handoff). This WU lands the pattern + session-init;
`handoff-optimization` and `loadset-composition` take their own surfaces; `instruction-optimization` runs
the Level 1–2 sweep across the remaining corpus. Loop-style workflows cap at Level 2 by design — see the
D3 note.

### D2 — The fragment substrate (mechanism)

**Fragments are method-shaped, not extension-shaped.** A fragment is _pulled_ by its workflow ("load this
block when gate X holds"), not _fired_ by the framework at a fire-point. Model fragments as a point in the
existing method space by giving methods two orthogonal properties:

- **visibility**: `public` (many callers via `arc.methods`) | `private` (callable only by one owning
  workflow; point-scanner-enforced; exempt from the corpus coverage audit);
- **override-policy**: `overridable` | `fixed` (frontmatter field; decouples overridability from
  method-hood — a method is "a procedure with a contract").

This populates the empty cells of the existing 2×2: `public+fixed` = shared invariant procedures projects
must not redefine (canonical worked example: `lifecycle-state-machine`'s relocation mutator bundle,
implemented code-tier — "mechanics → CLI" is literally a fixed public method in code); `private+fixed` =
this WU's fragments. Cautions carried: visibility in markdown is convention + tooling, not enforcement;
don't force the near-empty `private+overridable` cell; "method" overloads — the qualifier vocabulary needs
settling (pairs with `lane`, below).

**Sharpening (2026-07-02): fragment vs. private method.** Two kinds of would-be fragment exist, and only
one is method-shaped. A **procedural** fragment has inputs and an outcome (branch-gone recovery: given
candidates, recover the checkout and recompile) — that _is_ a private method and takes the full contract
shape. A **referential** slice (a conditional guidance passage, a schema excerpt) has no call semantics —
forcing contract/override blocks onto it is ceremony without meaning; it stays gated content with an
owner. The test: **does it have inputs and an outcome?** The worked example (below) suggests the
referential class mostly _dissolves into `render`/`note` steps_ — the CLI precomposes state-derived
surfaces — so what survives as loadable fragments is overwhelmingly procedural, and the private-method
model may cover nearly everything real. Keep the OO analogy where it pays (visibility ≈ private/public,
override-policy ≈ final/virtual); don't force call semantics onto content.

**Two extraction shapes**, revising the original "whole blocks only" rule:

1. **Whole conditional arms** — mode/state-gated steps extract as self-contained fragments (session-init's
   branch-gone recovery, materialize, cold-start, signal-leaf spine; the Step 6 conditional surfaces).
2. **Procedure library + thin orchestration paths** — from the `generate-tasks` 5.R.2 worked example: depth
   axes are often _one_ shared pipeline sliced into different review-increment cadences, not N procedures.
   Separate procedure-identity (invariant, stopless) from increment-cadence (a depth-selected grouping of
   procedures + its stop). A thin orchestration fragment referencing procedure fragments is _more_
   DRY-aligned than a fat self-contained block. `generate-tasks` shipped D-shaped (depth paths as spine,
   procedures as referenced library) — concrete input for where the cut falls.

**Terminology**: `path` = the route the agent runs (execution view); `lane` = the parallel extractable
whole-block (authoring/structure view) — reserved at SAP 5.R.1, and the structural fragment concept is
exactly where it would land. Adopt-or-reject at spec time; don't reintroduce `lane` into bodies before
that call.

**Stable anchors.** Cross-file references target a stable anchor, never a step ordinal (renumbering breaks
citers silently; `session-init.md` carries ~23 `Step N` refs, `generate-tasks` ~19; extension docs are
already stale). Two orthogonal axes: disambiguate the extension fire-point marker (today's `· #name`,
point-scanner-validated, reads generic but is extension-reserved — e.g. `#ext:name`) AND/OR give anchors an
explicit form (the freed `#name`, a new sigil, or formalize the `§ SectionName` prose convention — likely
lowest-friction). Heading slugs remain the zero-marker fallback. Includes fixing the stale extension-doc
refs + the DEV-RULES.ARC "item 10" ref. Intra-file "see Step N" may stay.

**Navigability is a maintainer concern only.** The original central open question — "decomposing into
core + fragments risks death-by-a-thousand-includes" — assumed the _agent_ navigates the fragment tree.
Under D3 it doesn't: the compiler selects fragments; the agent reads what the agenda lists. For
maintainers, adopt the **index hub** pattern (OKF / LLM-wiki convergence): a per-directory catalog of
entries, each a link + one-line summary (ARC's README-per-dir is the same role; the question is the
pattern, not the filename). Coordinates with `idiomatic-alignment`.

**Decomposed-workflow layout (comprehension model).** The spine doubles as the map: every fragment is
reachable from exactly one gate line in it, so opening the spine shows the whole behavior's shape — the
role a monolith's inline text serves today, at a fraction of the length. Candidate layout: one directory
per decomposed workflow, the spine carrying the workflow's name at the root
(`session-init/session-init.md`), fragments namespaced beneath (`session-init/arms/branch-gone.md`), the
hub cataloging them — base-is-evident by naming convention, not by reading. A relationship diagram is
_derivable_ from the structured gate lines (generated graph, never hand-maintained) — the same
managed-artifact philosophy as the schema doc.

**`slug → artifact` resolver.** The composition substrate needs a canonical resolver (fragment includes,
method resolution); the bare-slug-loading convenience case folds into it for free — the only framing under
which that earns its keep (a standalone `arc load-workflow` verb was rejected as marginal). Absorbs and
extends `out-of-wu-entry`'s minimal backlog-stub resolver (its recorded seam).

**Code-tier fragments.** Where a shared block is deterministic and presence-guarded, prefer a thin CLI
surface over a markdown fragment — candidate: the post-merge teardown block (`integrate-work-unit` Step 13 /
`decompose-work-unit` park-exit), reusing `lifecycle-transition-core`'s `reconcile-worktree:teardown` leg
plus a new merged-safe (`git branch -d`) delete variant, distinct from the force `reconcile-branch:delete`
(`-D`) park/abandon use. Dogfood evidence (2026-06-17, PR #106): attended integration still ends in a
deterministic shell tail (`gh pr merge`, `arc user close`, switch/pull base, `git branch -d`,
`git fetch --prune`). Preserve the archive boundary (no physical teardown in `arc archive`).

### D3 — The session-agenda compiler (mechanism)

The probe stops describing state and starts emitting an **agenda**: an ordered list of step instances the
session executes. The shipped `loadSet` slice (`entries: [{path, readMode}]`) _is_ the seed — extend the
family toward a small, stable **step-type vocabulary** (order ~8–10: read, pull, prompt-with-text,
load-fragment, render-precomposed, dispatch-to-locus, …). The core workflow then documents the
_vocabulary_ — how to execute each step type, the failure fallback, output discipline, orientation format —
and stops documenting the _branching_, which is unbounded and growing. The probe-failure prose fallback
stays, by design (the resilience path can't depend on the thing that failed).

- **First consumer: the `session-init` Step 3 rewire** — already this WU's recorded deliverable from the
  `compaction-recovery` seam (replace the inline load enumeration with a loop over `loadSet` entries,
  across canonical + `.template` + `.contributor` copies; the interim parity test pins the two until then).
  The invariant relied on: the projection resolves membership from shared policy (`loadset-composition`'s
  domain), never a consumer-specific hardcoded list — subsumption stays a fork-free lift-and-shift, and
  recovery remains a policy _consumer_. The temporary duplication to DRY at rewire: `session-recover`'s
  inline copy of the `partial-strategic` read-mode contract factors into one shared source both consumers
  load.
- **Deterministic method resolution.** Resolving a declared method — fragment selection,
  override-vs-default, `replace`/`extend` composition order (`override-mode`, minted by
  `testing-guidance-apparatus`) — is a pure function over frontmatter. A future `arc method resolve <name>`
  composes the method markdown with zero agent reasoning about which fragments to emit in what order; keep
  `override-mode` clean machine-resolvable data.
- **Early consumers to subsume**: the `--plan` gate-suppression hand-roll ("approach A" from
  `out-of-wu-entry` — the signal-dispatch leaf and gate-suppressed `draft-design` entry become a
  conditional-fragment skip), and `handoff-optimization`'s lightweight errand/housekeep handoff paths.

**Invocation shape (settled 2026-07-02).** Three decisions, one residue:

1. **The agenda rides the envelope** — one probe run returns state + agenda; no second call, no double
   probe cost. (The `loadSet` slice already lives there.)
2. **The call accepts invocation signals** — repeated `--signal k=v` (e.g. `plan=<stub>`, `next`,
   `start=<slug>`, and finding-5 overrides like `session-type=planning`); the skill invocation templates
   pass them through. Signal-absent remains the default compile.
3. **Recompile = re-invoke the same call with accumulated signals** — the arm-mutation and invalidation
   patterns need no second mechanism.

Residue: the spelling. Lean: a dedicated `arc agenda <ceremony>` verb over the _same handler_ — compile
is a first-class, repeated operation once recompile exists, and signals on a `status` verb are semantic
drift — with `arc status --session-init` retained unchanged as the signal-less read and the degradation
path. Acceptable fallback: flags on the existing verb. Final call at spec; nothing downstream depends on
the spelling.

**`offer` encoding (settled 2026-07-02).** Fixture: the combined sync prompt. Shape:

```yaml
- offer:
    id: sync-combined
    text:            # precomposed (recommendedCombinedPrompt); the agent never writes offer prose
    choices:
      - {label: pull both,     exec: "git pull --ff-only && arc user pull"}
      - {label: worktree only, exec: "git pull --ff-only", recompile: true}
      - {label: notes only,    exec: "arc user pull", recompile: true}
      - {label: skip}          # bare choice = no-op; decline is always an explicit choice
```

Rules: choices are a flat closed set; a choice carries **zero or one step** as payload, reusing the step
vocabulary (`exec`, occasionally `fragment` — branch-gone recovery's accept enters the recovery
fragment); no offer-in-offer nesting — a follow-up interaction means the payload is a fragment.
`recompile: true` on a choice encodes today's "re-probe when post-state ambiguity matters" judgment as a
compile-time decision (the combined-accept case omits it, matching the current skip-re-probe rule).
Free-text elicitation (bare `--errand`) is **not** an offer — closed choices only; elicitation lives
fragment-interior. The same offer shape is reusable _inside_ fragments (source differs — compiler-emitted
vs. fragment-rendered — encoding doesn't).

**Loops don't compile agendas.** A loop-style workflow (`process-task-loop`) is a _resident_ grounding
procedure plus event-triggered sub-protocols, not a once-through sequence — there is no session-time
instance to compile. Loops take D1 + D2 only: a thin resident core (small _because_ it stays in context
all session) with sub-protocols as event-handler fragments loaded at their trigger point. The interlocks
and stops stay in the core unconditionally — they are constraints, and the demotion rule already forbids
demoting constraints. (`loadset-composition` owns the canonical loop's content split.)

**Binding-time rule** (resolves the `arc:if` consolidation question): two binding times, each principled —

- **Install-time** (`arc:if` conditionals stripped by `render.ts`) for **config-static** variation: cheap
  for ~2–3 arms, yields a concrete legible installed file. Survives. `.template` also survives
  independently for adopter-customization scaffolding, which composition does not subsume.
- **Session-time** (agenda / fragment gates) for **state-dependent** variation: entry arms, sync states,
  `sessionType`, active-extension sets — anything only the probe can know.

Consolidate `arc:if`-for-behavior onto composition only where the variation is actually state-dependent or
the axes have multiplied past the inline threshold; no blanket deprecation.

The binding-time rule also places **template loads** (`draft-workflow-template-loads.md`): an
authored-from template is _workflow-static_ (generate-tasks always authors from `template-tasks`), so it
binds as a frontmatter declaration (D1), never a session-time agenda decision — and for agenda-compiled
ceremonies the compiler simply projects declared template loads into `read` steps, same as everything
else. Its motivation is also worth naming: the slip it captures is a _recognition-reliability_ failure
(an inline "see template" pointer missed at authoring time), and a frontmatter declaration is precisely
the ~T1-grade explicit trigger from `loadset-composition`'s spectrum. Resolution: **this WU's D1 owns the
declaration-family schema; workflow-template-loads stays its own small WU, re-scoped as the executor**
(add the key, audit authoring workflows, retire body-prose load directives), now dependent on D1
settling — its former graduation triggers are superseded by that sequencing.

## Worked example — hand-compiling session-init (2026-07-02)

The forcing exercise for the agenda schema: take the current `session-init.md` (910 lines) plus two real
probe outputs — a plain resume session and a `--plan` signal-leaf session — and hand-place every line of
the file into exactly one of: agenda step, spine vocabulary, fragment, or delete. The compiled sketches
below are the schema's first fixtures.

**Vocabulary v1 (confirmed — nothing in the file needed an eighth type):**

| Step       | Args (sketch)                                 | Session-init instances                               |
|------------|-----------------------------------------------|------------------------------------------------------|
| `read`     | path/id, read-mode, parallel-group, on-fail   | the 11 Step-3 items (already shipped as `loadSet`)   |
| `exec`     | command, rationale                            | channel pulls, `arc user load`, relocate, base fetch |
| `offer`    | precomposed text, choices, per-choice payload | sync prompts, combined prompt, displacement guard    |
| `fragment` | id (via resolver), args                       | entry arms, locus workflows, mismatch handling       |
| `render`   | surface id, precomposed text                  | Step-6 conditional surfaces, orientation header      |
| `note`     | text                                          | advisories (workload, notes lag, drift)              |
| `gate`     | interlock type, prompt                        | final proceed prompt, displacement confirm           |

**Case A — plain resume (the common case):** ~12 `read` steps (the shipped `loadSet` plus
parallel-group data replacing the parallelism prose), **zero** sync steps (every channel compiled to a
no-op), one `render` (header), one `gate`. Nearly the entire 910-line file compiles away for the session
that needs none of it.

**Case B — `--plan` signal-leaf:** `gate` (displacement confirm, computable prompt) → `exec` (relocate,
computable via `resolveWriteContext`) → universal `read` set → `fragment: draft-design {stub,
grooming: true}` → locus-scoped `render`. Elicitation and stub disambiguation stay inside the fragment
(judgment + interaction).

**Findings — design requirements the exercise surfaced:**

1. **Signals must reach the compiler.** `--plan` / `--errand` / `--next` arrive via skill args the probe
   never sees; compiling the signal-leaf spine requires the probe invocation to accept them. This decides
   half of the envelope-slice-vs-separate-call question: whichever shape, the call takes invocation
   signals.
2. **Recompile is the arm-mutation pattern.** Arms that mutate state (cold-start, materialize,
   branch-gone recovery) already end in "re-run the Step 1 probe"; under the agenda they end in a
   recompile and a fresh agenda. No nested control flow in the schema.
3. **Emission order is the ordering contract** (e.g. notes-pull before SESSION-NOTES reads). The compiler
   owns sequencing; no `after`/dependency fields.
4. **Two render classes.** State-derived surfaces precompose CLI-side (`render` steps); thought-state
   sections (Last completed / Blockers — from meta + SESSION-NOTES the agent reads) compose agent-side
   per a spine format. The orientation format stays spine vocabulary.
5. **An invalidation rule is required.** Agent-side reads can supersede compiler inputs — today,
   SESSION-NOTES `Session Type:` overrides the envelope `sessionType`, which drives the load set. Spine
   rule: contradiction between read content and a compiler input → recompile with the override passed as
   a signal. This shrinks as `operational-state-docs` makes those fields CLI-readable (the override
   becomes a compiler input) — a real dependency edge.
6. **A residual envelope-literacy set survives.** A few slots are judgment _inputs_ carried forward
   (`config` settings, `releaseRouting` prefix mapping), not agenda-compilable; the spine points at them
   and the schema doc stays out-of-band.
7. **Probe folding earns its place** (IO's D3.1): without a freshness slot, the agenda regresses to
   emitting raw git `exec` steps for a deterministic check.
8. **The CLI never injects content.** Every "load" is the agent's Read tool against a compiler-resolved
   reference + read-mode — the `loadSet` model. What's mechanized is _selection and order_, never
   ingestion; no other mechanism exists, and none is needed.

**Spine estimate:** ~120–150 lines (~4–5k tokens): step-type execution semantics, ordering + failure
defaults (`skip-and-surface` default, per-step override), the invalidation rule, probe-failure fallback,
orientation assembly format, authority boundaries. Against today's ~31k, a resume session reads the
spine, its agenda, and only the fragments it actually enters.

## Resolved design questions (formerly open)

- **`system/workflows/` navigability** — dissolved: agents follow the agenda, not the tree; maintainers get
  index hubs + the spine. Residual: the directory reshape's concrete layout (below).
- **Core/fragment boundary** — two extraction shapes (whole arms; procedure library + orchestration paths)
  plus the structural budget give the cut a test instead of a vibe.
- **Binding time** — the two-binding-times rule above.

## Open questions

- **Agenda schema residuals** — the worked example settled vocabulary, ordering contract, and
  control-flow posture; the invocation shape and `offer` encoding are settled in D3. Residual: the
  remaining per-step arg schemas (`read` beyond the shipped read-modes, `fragment` args, `render`/`note`
  surfaces) and the `arc agenda` verb spelling (lean recorded in D3; final call at spec).
- **Fragment granularity + directory layout** — per-arm files vs. anchored sections loaded by range; the
  concrete `system/workflows/` reshape (candidate layout in D2); hub placement. Fragment _identity_ is
  settled by lean (2026-07-02): agenda steps reference fragment ids through the D2 resolver; paths are an
  implementation detail behind it.
- **Structural budget enforcement** — line cap vs. token-estimate cap; lint-tier vs. advisory; where the
  number comes from.
- **Envelope schema generation** — generated-from-types reference doc. Lean (2026-07-02): **pilot the
  shape here** (the agenda schema needs it first) and lift to `schema-introspection-layer`
  (`architecture-remediation`) if implementation order favors it; final home decided at spec.
- **`lane` adoption**, and the "method" naming overload qualifier (one vocabulary decision, taken
  together) — the D2 fragment-vs-private-method sharpening narrows what needs naming: procedural
  fragments are private methods; only the referential-slice residue needs a distinct term, if any of it
  survives compilation into `render`/`note` steps.
- ~~Dangling consumer~~ — _resolved 2026-07-02:_ arc-plan-conductor was decomposed and abandoned in favor
  of the three structured planning-stage workflows; the loop canon's live consumers are re-derived in
  `draft-loadset-composition.md` § The Loop Canon (Conductor disposition). Its depth-selection idea
  survives _inside_ those stages — still the tier-axis instance of resolve-then-load, now consumed via D1
  rather than a conductor surface.

## Buffer dispositions (consolidated 2026-07-02)

Every former inbound-buffer item, integrated or consciously rejected — content lives in the body above;
this map records that nothing dropped silently:

| Former buffer item (origin)                              | Disposition                                          |
|----------------------------------------------------------|------------------------------------------------------|
| Recovery load-set emitter (`compaction-recovery`, 06-28) | Integrated — D3 seed + first-consumer rewire         |
| Stable-anchor convention (housekeep 06-01)               | Integrated — D2 § Stable anchors                     |
| External/harness skill references (housekeep 06-01)      | Integrated — D1 landing surface (authoring strategy) |
| `lane` reservation (SAP 5.R.1, 06-08)                    | Integrated — D2 terminology + open question          |
| SAP `generate-tasks` worked example (SAP 5.R.2, 06-08)   | Integrated — D2 extraction shape 2                   |
| Conditional `arc.methods` declaration (06-11)            | Integrated — D1 frontmatter contract                 |
| `index.md` hub pattern (OKF/LLM-wiki, 06-13)             | Integrated — D2 navigability                         |
| Fragments as methods, 2×2 (06-14)                        | Integrated — D2 fragment model                       |
| Thin CLI post-merge teardown (06-17)                     | Integrated — D2 code-tier fragments                  |
| `slug → artifact` resolver (06-19)                       | Integrated — D2 resolver kernel                      |
| `override-mode` machine resolution (06-22)               | Integrated — D3 deterministic method resolution      |
| Consolidate config-variation mechanisms (06-24)          | Integrated — D3 binding-time rule                    |
| `--plan` gate-suppression subsumption (06-25)            | Integrated — D3 early consumers                      |

## Relationship to other work

- **`adr-020` §9** establishes the resolve-then-load requirement; this WU owns the mechanism. The move out
  of `principle-anchored-core` is cohort mechanics, not thesis divergence — the work still serves "scale
  grammar, never scale discipline."
- **`draft-scalable-core.md`** — first declared _consumer_ of the mechanism (its § Open questions defers the
  core/extension cut here). Its two named workflow seams arrive as config-static gates: session-init Step 5's
  next-work discovery (unconditional `backlog/ROADMAP.md` read needs the Planning-Module guard) and the
  archive sweep (`archive.preserve`). Both sit squarely under the binding-time rule — config-static, so
  install-time unless the axes multiply; if session-init is agenda-compiled by then, the compiler carries the
  gate. Its install-time surface (the `01_verify-and-configure` guided walkthrough) is out of this WU's scope.
- **`cohort-agent-context-optimization.md`** — layers model, keystone sequencing, cohort rename decision.
  Siblings: `draft-loadset-composition.md` (loop canon = D1/D2 instance, designed jointly; load-set policy
  stays its domain), `draft-handoff-optimization.md` (lightweight paths consume D3; CLI items independent),
  `draft-instruction-optimization.md` (its Pillar 4 is subsumed by D3; it applies D1 across the remaining
  corpus as the cohort execution tail).
- **`draft-workflow-template-loads.md`** — declared-load sibling; coordinate at D3's binding-time boundary.
- **`compaction-recovery`** (shipped) — `loadSet` + parity invariant; `session-recover` becomes the second
  agenda consumer.

## Scope Estimate

Large, design-heavy — but now **staged rather than monolithic**: D1 (pattern codification: strategy +
template edits, small) → D2 (fragment model + anchors + hubs + reshape, the design core) → D3 (agenda
schema + session-init rewire, CLI + workflow). Each stage lands value alone; D1 is consumable by siblings
as soon as it settles. Graduation trigger: before any at-scale touch of the inline-gated lifecycle
workflows, and before `instruction-optimization` activates.

---

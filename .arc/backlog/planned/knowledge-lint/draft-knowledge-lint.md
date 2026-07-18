# Draft: Knowledge-Base Lint

- **Origin:** [internal] — surfaced during an OKF / LLM-wiki idiomatic-alignment exploration (2026-06-13).
- **State:** Planned — groomed 2026-07-02 (charter, dispatch vehicle, cohort question, and sweep cadence settled;
  inbound buffer drained). Formalization-ready.
- **Purpose:** Establish "Lint" as a named, first-class ARC operation — standing knowledge-base health checks over
  the `.arc/` doc tree — fronted by an `arc lint` umbrella command (mechanical tier) plus an agent-run semantic
  sweep (discovery tier).
- **Success signal:** a retired-verb token, broken cross-reference, or path-style movable-artifact ref introduced
  anywhere in the durable corpus fails `arc lint` deterministically; the semantic sweep, run between work units,
  surfaces contradiction / stale-claim candidates with proposed routes rather than silent drift accumulating until
  the next one-shot reconciliation WU.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Refresh the stale `user/README.md` template**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: knowledge-lint`), housekeep drain (2026-07-07); captured
  during `finalize-parallelism` Task 2.6.d (linked-worktree signpost) design discussion, 2026-07-05.
- *Concern:* The tracked `.arc/user/README.md` (the user-dir template that ships to adopters) is out of date — it
  predates the identity-global vs. per-WU surface split and the resolver-backed materialization binding, so a
  direct reader (human or agent) opening it gets a stale picture of what lives under `user/{identity}/`.
- *Approach:* Reconcile it to the current user-surface model (per-WU `SESSION-NOTES` vs. identity-global
  `WORKING-MEMORY` / `USER-INBOX` / `STATUS.USER`, canonical materialization via the resolver). Adopter-facing
  doc-drift is the class `knowledge-lint` exists to catch, so route it here rather than a one-off hand-edit a later
  lint/regenerate pass would redo.

### `[ ]` **Align with the knowledge-architecture model: orphan semantics, incoming families, registry posture**

- *Routed from:* `knowledge-architecture` grooming (2026-07-03), direct-edit routing on its grooming branch.
- *Concern:* `knowledge-architecture` redefines the knowledge corpus's awareness/loading model in ways that touch
  three points of this charter. (1) **Family 4's orphan semantics:** that model derives access paths from
  structure — a knowledge unit is an orphan iff no consumer declares it *and* it carries no `fire` line — which
  dissolves the link-graph root-set open question for the knowledge corpus; a link-graph orphan check specced now
  would be replaced by the structural definition. (2) **Incoming families:** it hands this WU new check families
  (awareness-contract schema validity, directive-form `fire` lines, buried-constraint heuristics) through the same
  family-registration seam minted for `operational-state-docs`. (3) **Family 5 shrinkage:** its index surface is
  generated from `fire` lines, removing the `STRATEGY-INDEX` successor from the parity surface (consistent with
  this WU's ditch-or-generate posture).
- *Fold-in:* spec `arc lint` as a family **registry** (already the OSD seam's direction) so those families slot in
  without reshaping the umbrella; scope family 4 to the non-knowledge doc tree, or defer it pending the
  awareness-contract schema.
- *Soft ordering (deliberately not a `Depends On` edge — too coarse; it would block standing hygiene value):* most
  of this charter is knowledge-architecture-independent and proceeds freely (families 1–3, the umbrella, the
  semantic sweep). If this WU specs first, family 4 defers or scopes down and the registry posture covers the
  rest; if `knowledge-architecture` settles its schema first, family 4 adopts the structural orphan definition
  outright. Recorded in both drafts.

### `[ ]` **Evaluate coupling-audit primitives as a Knowledge Lint prototype**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: knowledge-lint`), housekeep drain (2026-07-18); captured
  during `coupling-blast-radius-audit` task generation, final suite review, 2026-07-18.
- *Concern:* the coupling-blast-radius audit is designing project-internal primitives that overlap Knowledge
  Lint's standing mechanical and semantic tiers: tracked-corpus enumeration, literal/regex pattern manifests,
  catch-all residue, explicit exact/bulk dispositions, canonical evidence, deterministic projection, and
  captured finding routing. The audit intentionally stops short of a reusable subsystem, so the shipped seam may
  be useful as a prototype without warranting a dependency or shared abstraction now.
- *Fold-in:* at spec time, inspect the audit's landed code and artifacts and reuse or extract only the
  enumeration, matching, evidence, and disposition pieces that fit the recurring check-family contract. Do not
  inherit audit-specific volatility, fan-out ranking, corpus boundaries, or hard-consumer views; treat this as
  coordination evidence, not a pre-committed composition edge.

---

## Problem / Motivation

Karpathy's LLM-wiki and Google's OKF both name three operations over a markdown knowledge base: ingest, query, and
**lint**. ARC has the first two richly built (session-lifecycle + housekeep + handoff = ingest/curate; session-init
load + on-demand strategy/method loading = query) but **no standing Lint operation at all**. The closest standing
machinery is `markdownlint` (format only), `point-scanner` (extension fire-points only), and the package-sync
hooks. `doc-cascade-sweep` was a *one-shot* reconciliation work unit, not a recurring mechanism — so nothing
periodically checks the knowledge base for consistency, and the `lifecycle-closeout` certifying audit had to catch
a re-entered retired verb by hand.

Karpathy's lint flags six things: contradictions between pages, stale claims newer sources supersede, orphan pages
with no inbound links, concepts mentioned but lacking their own page, missing cross-references, and data gaps
fillable by web search. He frames lint as a **discovery tool, not an autofixer** — it surfaces, the human/agent
decides. That framing maps onto the two-tier split below. Two of his checks don't apply here
(concepts-without-page and web-gap-fill assume an accreting research wiki; ARC's doc set is bounded and curated),
and giving Lint a first-class identity mirroring ingest/query is itself the organizing win — it turns "assorted
doc hooks" into a coherent capability with a clear charter.

## Charter — the three-way enforcement boundary

Standing consistency enforcement over `.arc/` splits by **document class** (ADR-022's taxonomy), with dispatch
plumbing as a third, orthogonal concern:

- **This WU — the durable knowledge corpus.** Strategies, workflows, methods, rules, briefs, templates,
  reference docs: prose-canonical content no schema governs. Both consistency tiers below are its remit.
- **`operational-state-docs` — the managed record class.** Meta files, session/user surfaces, the `STATUS.*`
  views: schema-governed records with rendered projections. Structural conformance there is OSD's round-trip
  harness + corpus conformance gate, not lint. OSD also *shrinks this WU's surface by construction*:
  resolve-don't-store means a rendered projection cannot carry a stale claim, so lint targets only what stays
  prose-canonical. OSD's conformance gate may surface as a check family under the same `arc lint` umbrella —
  the family-registration seam is coordinated at spec time.
- **`quality-gate-hooks` — dispatch plumbing.** Tier ↔ hook-stage mapping and adopter-command dispatch (when and
  where checks run); it stays free of knowledge-base check *content*. Its gates invoke `arc lint` exactly as they
  invoke the adopter's configured linters. The four knowledge-base content checks parked in its inbound buffer
  (enhanced link validation, forbidden-pattern adopter-language + path-style refs, relocatability link-defs, the
  adopter-facing transitional-framing sweep) migrate here — settled at this grooming.

Adjacent, not overlapping: `roadmap-tooling`'s lifecycle link-*reanchoring* is write-time repair at artifact
moves; this WU's cross-reference check is standing detection — complementary halves, no shared machinery.
`markdown-formatting` and `markdownlint` remain the format-only layer, out of scope here.

## Design

### Mechanical tier — `arc lint` check families

One umbrella command hosting named, individually-runnable check families — deterministic, allowlist-bearing,
covering both copies (package source and `.arc/` instance) per the two-copy discipline:

1. **Cross-references** — whole-tree broken-link scan (not staged-files-only, closing the moved-file blind spot),
   anchor validation for `file.md#section`, and duplicate link-definition detection. Absorbs the hook-hardening
   lobe of the migrated link-validation entry; the reference-style compliance sweep rides along as its one-time
   companion fix. Once `composable-workflows` codifies its stable-anchor convention, anchor validation asserts
   against that grammar, and step-ordinal cross-references (`see Step N` across files) become a flaggable
   pattern.
2. **Forbidden patterns** — the content-rule family: `adopter`-language in adopter-facing surface globs,
   path-style refs to movable WU artifacts, adopter-facing transitional / historical framing ("under the old
   model", "formerly"), and the **lifecycle verb-register guard** — retired transition-verb tokens (`graduate` /
   `graduation` as-transition, the `--lifecycle` flag spelling, slug-matched-drain language) flagged in durable
   surfaces. Each pattern carries a curated allowlist (fenced code blocks, historical completion notes, ADR
   snapshots; for the verb register: `graduated lookup`, the `draft-* → notes-*` content-promotion colloquial,
   the `src/` internal `graduate` arm name). A richer verb-register variant — asserting doc verb-mentions against
   the code transition table — is a possible later upgrade; the token denylist + allowlist is the shipping shape.
   The *rules* are owned where they live today (DEV-RULES, `naming-conventions`); this WU owns their enforcement.
3. **Relocatability** — source-side path-style link-defs inside movable artifacts (the dual of the target-side
   reference rule), plus the one-time sweep of the ~38 known offending link-defs.
4. **Orphan detection** — durable docs unreachable from the doc graph's roots (no inbound links). Needs a
   deliberate root set: methods, strategies, and templates are loaded on-demand via indexes, so the roots must
   include the index/README layer or everything on-demand reads as an orphan (see Open questions).
5. **Index / hub parity** — hand-maintained directory listings asserted against actual contents. Posture per the
   methods-README disposition (2026-07-02, superseding this WU's original buffer entry): a listing that merely
   mirrors the directory + frontmatter descriptions is **ditched or generated**, never parity-checked — a parity
   check taxes every addition and still misses description drift. This family covers only the hand-maintained
   listings that earn their keep (curation or coupling content not derivable from the directory), and
   `composable-workflows`' index hubs if any land hand-authored — a hub stays trustworthy only under generation
   or a standing parity check; prefer generation.

Gate wiring is decided **per family at spec time** — staged-scope pre-commit, whole-tree CI step, or
on-demand-only — composing with `quality-gate-hooks`' dispatch rather than hard-coding a stage here.

### Semantic tier — agent-run sweep

Contradiction and semantic stale-claim detection across artifacts — the standing, recurring sibling that
`doc-cascade-sweep` was a one-shot instance of. Judgment work, so it is an agent workflow (housekeep-style
skill/workflow), not CLI code. **Discovery, never autofix:** the sweep surfaces candidates with proposed
dispositions; findings route per DEV-RULES § Discovered Work Routing (inline fix / errand / capture), never
auto-edit. **Cadence: on-demand, with a soft nudge at natural between-WU boundaries** (housekeep-adjacent) —
never blocking, never a scheduled ceremony. The nudge keeps the doc-cascade-sweep gap from recurring without
adding standing process weight.

## Decisions (grooming, 2026-07-02)

- **Dispatch vehicle:** mint `arc lint` as the operation's front door, hosting named check families; gates invoke
  it. (Name confirmed as the working title; final CLI shape at spec.)
- **Migration:** all four knowledge-base content entries move from `quality-gate-hooks`' inbound buffer into this
  charter (including the transitional-framing sweep, beyond the three originally identified).
- **Cohort question: standalone siblings.** The `quality-gate-hooks` coordination is a one-time buffer migration
  plus a charter boundary — no sustained cross-member sequencing — so it doesn't earn a cohort dir + `cohort-*.md`
  ceremony. The boundary is recorded in both drafts instead.
- **Sweep cadence:** on-demand + boundary nudge (above).
- **Class: Heavy** — derivation fired (the sweep design, charter boundary, and umbrella composition had to be
  authored), composed from existing ARC patterns rather than invented, so not `Novel`. Scale alone would not have
  fired.

## Relationship to other work

- **`quality-gate-hooks`** — standalone sibling: it owns *when/where* checks run (tier ↔ stage dispatch), this WU
  owns *what is checked* over the knowledge corpus. Its four migrated buffer entries land here; its format-layer
  and code-stack entries (table-align gates, TSDoc rule, actionlint, MD013 hook pass, E2E guards) stay put.
- **`operational-state-docs`** — the record-conformance complement (see Charter). Coordinate the `arc lint`
  family-registration seam and the durable-vs-managed class boundary at both WUs' spec time.
- **`composable-workflows`** — three inbound seams from its 2026-07-02 grooming: (a) its **structural budget**
  (the CI-checkable core-size cap on workflow spines and fragments — "the same discipline as zero-tolerance
  markdown lint") is a candidate `arc lint` family: that WU owns the rule and the number, this WU is the natural
  enforcement vehicle; (b) its **stable-anchor convention** gives family 1's anchor validation a target grammar;
  (c) its **index-hub pattern** widens family 5's remit. Fragment *reachability* (agenda/resolver-based, not
  link-based) stays on its side of the line — see Open questions.
- **`naming-conventions`** — owns the forbidden-pattern *rules* this WU enforces; token-set changes flow
  rule-side → enforcement-side.
- **`idiomatic-alignment`** — the convention-side sibling of the same OKF / LLM-wiki convergence; coordinate
  framing. Verb-register token-set ownership needs an explicit owner (idiomatic-alignment excludes internal-vocab
  renaming) — see Open questions.
- **`roadmap-tooling`** — adjacent only (write-time reanchoring vs standing detection, per Charter).

## Open questions (spec-time)

- **Per-family gate wiring** — which families run staged at pre-commit, whole-tree in CI, or on-demand-only; the
  speed budget for any pre-commit placement.
- **Orphan-check root set** — which docs constitute the inbound-link graph roots (READMEs, indexes,
  STRATEGY-INDEX, workflow frontmatter references), and whether "orphan" is an error or an advisory given
  on-demand-loaded docs are reached through indexes by design. `composable-workflows` adds a wrinkle: fragments
  are reached via spine gate lines and the fragment resolver, not markdown links — fragment-orphan detection is
  resolver-registry work and may belong to that WU's tooling (or point-scanner) rather than the link graph;
  settle ownership at whichever WU specs first, alongside the structural-budget family question.
- **Verb-register token-set ownership** — who curates the retired-token list as the lifecycle vocabulary evolves;
  coordinate across `idiomatic-alignment` / `naming-conventions`.
- **Semantic-sweep surfacing shape** — a report artifact reviewed then discarded, versus direct capture routing
  per finding; and whether sweep scope is whole-corpus or delta-since-last-sweep.
- **CLI shape** — `arc lint [--family <name>]` vs subcommands; exit-code contract for advisory-only families.

## Scope estimate

Medium. The mechanical tier is mostly relocation of already-designed checks plus a few new ones under one
command; the semantic sweep is the design-heavier, genuinely new part (workflow + surfacing contract), and the
one-time sweeps (reference-style, relocatability link-defs, index parity) ride as bounded companion fixes.

---

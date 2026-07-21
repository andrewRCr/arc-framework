# Draft: pr-decomposition

- **Origin:** [internal] — surfaced 2026-06-23 during `lifecycle-closeout` planning, reflecting on why ARC's
  work units run broader than the industry small-PR norm and whether that is a coupling artifact rather than a
  deliberate stance.
- **Purpose:** Make a large but coherent single-concern change **actually reviewable and coherent at the merge
  boundary** — decoupling the _review_ boundary from the _concern_ boundary. The concern boundary (the work unit)
  stays right: ARC's WU / decompose / cohort model groups work logically well. The gap is narrow — a
  logically-coherent WU **sometimes** (not always) emits a review surface too large to review well. The settled
  mechanism (grooming, 2026-07-20) is **review chunking**: decompose the change into ordered, bounded-diff review
  units so each review invocation faces a tractable surface. This is **reviewer-agnostic** — the small-PR doctrine,
  strongly evidenced for human review quality, with **AI review as the acute forcing case** (it cannot navigate a
  large diff and is often a solo developer's only reviewer). Chunking is held **separate from merge topology**:
  chunk-PRs merge to a WU-scoped integration branch by default (WU → `main` once), or optionally stack to `main` for
  bisectable work — so "emit ≥ 1 PR" (amending `1 WU = 1 branch = 1 PR` to `1 WU = 1 branch, emitting ≥ 1 PR`)
  describes the review surface, not a forced merge stack. Two modes: **(A) up-front** (plan chunks at
  `generate-tasks`) and **(B) retrofit** (review-only decomposition of an already-built WU). **Maturing draft under
  active grooming.** Grounding research lives in `research-pr-decomposition.md`.

---

## Grooming status (continuity)

> _Updated each `--plan pr-decomposition` pass — see `draft-design` § Re-synthesize. This is the resume anchor._

- **Readiness:** `maturing` — the frame, core mechanism, and `Class` (Heavy) are settled; open items are
  detail-design (config posture, terminology, orchestration surface). Not yet formalization-ready.
- **Resolved (through 2026-07-21):**
    - **Goal** = _reviewability / merge-coherence of large coherent changes_, **reviewer-agnostic** (human + AI; AI
      review is the acute forcing case, esp. for solo devs). Not "emit multiple PRs" as an end.
    - **Chunking ⊥ stacking (the core unlock).** _Review chunking_ — decomposing the review surface into
      bounded-diff units — is the primary mechanism. _Stacking_ (bottom-up merge to `main`, each unit
      green-on-`main`) is only one **merge topology**, and carries all the flagged fragility (not-GA-native,
      tool-lock, rebase cascade, squash-identity, ~3–4 depth ceiling). Chunking requires none of it.
    - **Two axes.** Axis 1 (this WU's core): review chunking at `generate-tasks`. Axis 2 (separate, per work-type):
      merge topology — **default** chunk-PRs target a **WU-scoped integration branch** (WU → `main` once; no
      per-chunk green-on-`main`, no rebase-cascade / squash-identity against `main`); **optional** stack to `main`
      for genuinely bisectable work wanting incremental landing.
    - **Two modes.** (A) up-front — plan chunks at `generate-tasks`. (B) retrofit (secondary) — _review-only_: carve
      an already-built branch's commits into bounded review-PRs against an integration branch, WU merges once; no
      re-architecting, no bisectability. Distinct from the _merge_-retrofit the research rejects. Serves the live
      driving case (heavy WUs mid-impl).
    - **Cover letter / reviewer's guide is deferred, out of this WU** — a human-_navigation_ aid (doesn't reduce
      surface, so it doesn't help AI review), and storage-sensitive (reads `meta` / `spec` / `cohort`, which
      `strategy-storage-evolution` moves to a separate backing store). Coordinate PR-side composition later.
    - **Algebra (item 4):** the _core_ (terminal aggregation + membership / tree-exact proof) is likely
      **v1-needed** even without stacking — the WU → `main` merge must prove it equals the sum of reviewed chunks
      with no unreviewed delta; the elaborate group / seam / series **coalescing** machinery stays **provisional
      v2**. The research validated the commit-identity / tree-exact core.
    - Idiom re-examination **ran** (heavy-research, 2026-07-20; `research-pr-decomposition.md` § Idiom
      re-examination). Cohort-fit: stays **one work unit**.
    - **Class = Heavy** (settled 2026-07-20) — v1 is composition from mature prior art; the invented-feeling
      assurance algebra is deferred to provisional v2.
    - **gh-stack is the forward-compat north star (2026-07-21).** GitHub-native stacked PRs (private preview):
      chain-of-PRs model, native stack-map UI with focused per-layer diffs, branch protection evaluated against
      the _final_ target, and atomic merge-down — merging any PR merges it and every unmerged PR below in one
      operation, which is this WU's terminal-aggregation semantics on native rails (a chunk chain that never
      partial-merges + one atomic top merge ≡ "WU → `main` once, as the sum of reviewed chunks"). At GA it may
      subsume the custom integration-branch mechanic. Posture: never design against the preview API; keep chunk
      identity/order data in ARC artifacts with topology as a projection; keep the orchestration verb thin so it
      can later drive `gh stack init/add/submit`. The flagged stacking fragilities (tool-lock, rebase cascade,
      per-chunk green-on-`main`) are precisely what first-party support absorbs — the tool-lock objection
      inverts for host-native tooling.
    - **Chunk refs carry no ARC state (2026-07-21).** The append-only rule protects SHA-keyed user notes on
      _pushed_ branches; host-tool stacking rebases (gh-stack cascades) rewrite chunk branches by design.
      Reconcile by construction: chunk/review refs are disposable review-surface projections — no notes
      anchoring, no meta state, no lifecycle records — while ARC state anchors only to the WU branch /
      integration ref, which merges append-only. Rebase-freedom where no state lives; append-only where it does.
- **Open (developer calls):**
    - **PR-surface naming** — the group key is the WU slug (the deliverable/branch name, already public in
      `feat/<slug>`, legible without ARC context — not a planning-ID leak), lean
      `<slug> [n/N]: <chunk title>`. Grouping _identity_ rides structure (base branch + a label), never title
      parsing — titles are a list-scanning courtesy, disposable once native stack UI exists. The WU → `main` PR
      keeps the canonical conventional title (the cover-letter / `[0/N]` slot). `[n/N]` drift under Mode A
      (kernel-style series re-versioning vs. bare `[n]`) settles with the terminology call below.
    - **Config posture** — default-on with opt-out vs. opt-in (§ Alternatives).
    - **Terminology** — the review unit is **not** a "deliverable" under the integration-branch default (it doesn't
      ship to `main` alone); candidates `slice` / `segment` / `chunk`, with `deliverable` / `stack` reserved for the
      optional ship-to-`main` variant (§ Alternatives).
    - **Merge-orchestration surface** — an `arc` verb driving the integration-branch mechanic vs. leaning on host
      tooling; the `integration-lane` seam (a WU that integrates once composes cleanly with its single exclusive
      window).
    - Inbound-buffer items 1 & 2 (review / verify cardinality) — fold at the mechanism-detail pass.
- **Next:** mechanism-detail (task-list chunk-tagging, orchestration surface, config posture), fold items 1 & 2
  plus the first-run field-evidence entry (chunk-cohesion boundaries, pre-triage type check, test inclusion);
  settle terminology + PR-surface naming together; reconcile the `session-locus-model` / `review-architecture`
  seams at planning close.
- **Coordination seams (checked 2026-07-20; route at planning close):**
    - `review-architecture` (**hard `Depends On`**, impl phase 5 — imminent): both rewrite `integrate-work-unit`;
      consume its _shipped_ integration reshape + Review-Increment Invariant + review-obligation contract as the
      baseline (sequential layering, not a concurrent collision — pr-decomp impl hasn't started).
    - `session-locus-model` (**coordination**, Planning / P1): no collision on this WU's core workflows
      (`generate-tasks` / `integrate-work-unit` / task-list — SLM edits none). Two seams: (i) both edit
      `strategy-work-organization` (SLM: free-primary-lane / role; here: § Single branch per work unit — likely
      different sections, coordinate); (ii) `routingLane` / reviewed-lane vocabulary — SLM says a WU's PR is
      "classified by strictest lane, never splits into per-lane PRs"; reconcile with chunk-splitting (chunk ⊥ lane).
    - `integration-lane` (chunk-PRs ↔ final-integration window); `strategy-storage-evolution` / `arc-backend`
      (deferred cover-letter composition).

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Fold first-run field evidence into the review-chunking design**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: pr-decomposition`), direct route during the
  decomposition-program grooming session (2026-07-21); captured during `review-architecture` pre-integration
  review (2026-07-21).
- _Observation:_ Mode B (review-only retrofit) ran ad hoc against `review-architecture`'s 307-file / ~24.4k-
  insertion change set. Eight path-scoped passes covered 10,789 lines and produced 37 findings: 12 real,
  7 advisory, 13 false, 5 unresolved. The mechanism works — but its cost profile is specific enough to design
  against rather than rediscover.
- _Observation:_ **chunk cohesion predicts accuracy far better than chunk size.** The smallest, most
  self-contained chunk (372 lines, provider adapters) scored 5 real / 1 false. False positives concentrated in
  chunks that cross-reference other chunks — decisively in the _critical_ band: all three Criticals were false,
  each asserting a symbol undeclared when its declaration sat in a different chunk. Draw boundaries on contract
  cohesion, not line budget; a boundary splitting a declaration from its consumers manufactures high-severity
  noise.
- _Observation:_ a full type check refutes that entire class in seconds — run one before triage and discard
  compile-error claims wholesale (three Criticals became three dismissals at near-zero cost). Excluding test
  directories from the chunk set makes every verification-dimension finding unreliable: a reviewer blind to the
  tests reports proven behavior as unproven.
- _Observation:_ injected review guidance bled into the judgement — the rubric was applied as a specification
  the _code_ must satisfy, producing a finding that a baseline constant lacked a dimension actually contributed
  by a separate augmentation layer. Guidance injection and code criteria need to read as distinct to the
  reviewer.
- _Approach:_ the only bounded scoping axis available today is path-shaped (a directory plus a base ref); the
  commit-range flag scopes a suffix to HEAD, not a bounded range, so a chunk is effectively one directory.
  Provider rate limiting (five reviews per hour) is a real planning constraint on chunk count. Weigh whether
  the design should emit chunk boundaries a reviewer invocation can consume directly, rather than leaving
  operators to approximate them with directory paths.
- _Observation:_ the run corroborates the research's retrofit conclusion — a review decomposition with no
  merge-topology change. One branch, one PR, merging once; only the review surface was carved. No stacking, no
  integration branch, nothing rewritten.

### `[ ]` **Coordinate multi-PR review cardinality with the reviewed-lane gate contract**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); captured during
  `reviewed-lane-review-gate` task-generation reviewability assessment.
- _Concern:_ each deliverable can reuse the proven per-change-request review contract, but stack-level review
  cardinality and usage policy remain unsettled. More PRs must not automatically multiply expensive review passes.
- _Approach:_ settle which deliverables auto-admit versus wait for checkpoints, where independent/adversarial
  review runs, and how findings and approvals compose without one PR erasing another's evidence. Preserve each
  deliverable's truthful `merge-ok` while keeping WU-terminal aggregation outside `ReviewCore`. Sequence this
  WU's design behind `review-architecture` so the settled, topology-neutral review-obligation contract is an
  input rather than a duplicated decision; record that dependency at the next grooming pass.

### `[ ]` **Coordinate adversarial verify cardinality and partition criteria**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: pr-decomposition`), housekeep drain (2026-07-03);
  captured during `adversarial-review` create-spec.
- _Concern:_ `adversarial-review` wires an adversarial pass at `verify-work-unit`; this WU owns whether that
  verify runs once at the terminal deliverable or per deliverable in a multi-PR WU. It also owns the distinction
  between WU/cohort orthogonality and PR-stack bisectability: the same seam can be "do not cut here" for PRs but
  "cover carefully" for review.
- _Fold-in:_ decide terminal-vs-per-deliverable adversarial verify and integrate the
  orthogonality-vs-bisectability distinction into this WU's partition/coherency pass.

### `[x]` **Add `assess-cohort-fit.md` to the multi-PR coherency-pass touchpoint list**

- _Routed from:_ `single-owner-wu-model` Task 3.2 (Phase 3 PR-cardinality de-weld), via USER-INBOX drain
  (2026-06-24).
- _Concern:_ `assess-cohort-fit.md`'s cohort/stack/delivery framing — "cohort ≈ epic, WU ≈ story", the
  stack-vs-cohort sizing bullet, and "delivers as a stack of WUs along natural deliverable/phase boundaries" —
  treats the WU as the delivery/merge unit. When this WU lands `1 WU = 1 branch, emitting ≥ 1 PR`, that framing
  needs a coherency pass so WU-vs-cohort sizing and the multi-PR delivery axis read cleanly together. Add the
  method to this WU's touchpoint list (the "Amended invariant" set currently names `§ Single branch per work
  unit`, the spec form, `generate-tasks`, and integration — but omits this method).
- _Disposition (grooming 2026-07-20):_ **Folded** into § Unknowns and Assumptions → Amended invariant (the
  touchpoint set now names `assess-cohort-fit.md`).

---

### `[x]` **Carry the assurance-group contract into PR decomposition (own the full seam algebra)**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: pr-decomposition`), housekeep drain (2026-07-19); captured
  during `review-architecture` draft-design joint reconciliation (2026-07-18), then re-scoped and enriched at
  `review-architecture`'s `create-spec` re-examination (2026-07-19).
- _Concern (ownership corrected 2026-07-19):_ `review-architecture` separates PR cardinality from independent-review
  cardinality and, at its `create-spec` re-examination, judged the full multi-PR assurance-group / seam /
  series-membership algebra overengineered _for that WU_ and ahead of this WU's settled delivery shape — so it
  **extracted the algebra and routed it here as inherited input**, inverting the 2026-07-18 ownership. This WU now
  owns the full **assurance-group / seam / series-membership algebra** (group target/evidence derivation, generated
  seam ownership/proof semantics, terminal aggregation) plus its own delivery mechanics (delivery refs,
  cumulative-carrier shape, merge-consumption proof, assurance-plan placement, frontline placement, stack
  orchestration). `review-architecture` retains only the single-deliverable obligation contract, the no-weakening
  principle, and the per-requirement projection seam.
- _Fold-in:_ at draft-design, author the ordered assurance plan at the same `generate-tasks` boundary as merge
  seams. **Consume the inherited algebra — do not re-derive it** — validating each rule against this WU's settled
  delivery mechanics rather than adopting it wholesale. The full verbatim algebra (joint assurance plan +
  gate-projection group/member/seam contract) is preserved in `notes-pr-decomposition.md`. Add
  `Depends On: review-architecture` before launch.
- _Disposition (grooming 2026-07-20):_ **Accepted as inherited input — consume-not-adopt.** Settle this WU's own v1
  delivery mechanics + the simplest industry-aligned reviewability mechanism first, then measure the algebra against
  that v1. If a simpler solution meets v1 needs, **park the full algebra as a durable provisional v2 (someday /
  maybe, not committed)** — preserving its `review-architecture` provenance — rather than adopting it wholesale or
  discarding it; if v1's settled mechanics in fact need it, adopt it then. The verbatim algebra stays in
  `notes-pr-decomposition.md` until that call is made. **Refined by the 2026-07-20 idiom re-examination:** the
  research corroborates the algebra's _commit-identity / tree-exact_ core (squash / rebase merge genuinely breaks
  cross-stack commit identity) — that part is validated, not over-engineered; the elaborate coalescing
  group / seam / series machinery is the part to weigh against v1 need. `Depends On: review-architecture` recorded at
  launch (that WU is at impl phase 5, shipping imminently — the inherited contract is effectively settled).

## Problem / Motivation

**The live driving case.** Several `Heavy` work units are mid-implementation right now that, for good reason, did
**not** decompose into sibling WUs — each is correctly one concern. But by size alone they will be hard to review
meaningfully when they reach integration. The concrete hope motivating this WU: let those WUs reach integration and,
once `pr-decomposition` ships, become **reviewable at that point** — an **integration-time retrofit**, not only
up-front planning. The WU / decompose / cohort model works well for _logical grouping_; the gap is narrow — that
logical grouping **sometimes** (not always) emits a review surface too large to review well.

ARC currently **welds two separable boundaries together**: the _concern_ boundary (the work unit — correctly broad
for one uniform concern) and the _review / merge_ boundary (the PR — currently forced to equal the WU). Industry
separates them: one concern (an epic, or a patch-series cover letter) ships as **many** small, individually-
reviewable parts — or, when it cannot be split, ships whole but is made reviewable by a cover letter and guided
review. The instinct that groups work into a broad WU is right; only the review surface it emits is sometimes too
large.

The cost of the coupling shows up on cross-cutting WUs. `lifecycle-closeout` is the trigger case: one WU bundling a
~20-file two-mirror doc sweep + several code-wiring legs + a new ceremony + a CLI removal + a terminal audit. By
ARC's own criteria it is correctly _one concern_ — but it lands as _one large diff_ at integration, and review
quality degrades with diff size (the research is strong on this — for **review thoroughness / defect detection**,
not merge speed; and the degradation applies to AI review as much as human, since attention dilutes across a large
diff). So the problem is not "WUs are scoped too broadly" — it is that the review / merge boundary is welded to the
concern boundary, when it is a separate axis.

**Reframed goal (grooming, 2026-07-20).** The goal of this WU is **reviewability and merge-coherence of large
coherent changes** — _not_ "emit multiple PRs" as an end in itself. The settled mechanism is **review chunking**:
decompose the change into bounded-diff review units so each review invocation faces a tractable surface. This is
**reviewer-agnostic** — smaller review surface is the small-PR doctrine (strongly evidenced for human review
quality), and **AI review is the acute forcing case**: a large diff can't be navigated, only diluted, and adding
supporting docs _increases_ surface — so the only thing that helps is _less surface per invocation_, decisive for a
solo developer whose only reviewer is an AI. Crucially, chunking (the review surface) is held **separate from merge
topology** (how chunks land) — which keeps the design clear of stacking's fragility and admits the two delivery
modes (up-front vs. retrofit).

**Why now:** the cohort lifecycle work (`lifecycle-state-machine`) has just made transitions first-class CLI
mechanics, and native stacked-PR tooling has begun to arrive in the ecosystem (GitHub `gh-stack`, private preview
April 2026 — not yet GA) — so the substrate to express this is closer than before, though not yet stable.

## Proposed direction

**Three nested levels (concern / review / impl):**

- **Work unit = the concern unit** — planning, ownership, the spec. Unchanged. This draft does **not** narrow WUs
  or push toward more sibling decomposition (that is `decompose` / `assess-cohort-fit`'s separate question).
- **Chunk = the review unit** — a bounded-diff PR reviewed in isolation. The new level this WU introduces. Whether
  a chunk is _also_ an independent merge-to-`main` unit is a separate axis (below), not part of its definition.
- **Phase = the impl increment** — unchanged from today's task-list model; the natural source of chunk boundaries.

**Axis 1 — review chunking (the core).** Plan the change into ordered chunks at `generate-tasks`; each becomes a
bounded-diff PR. This is the original "logical chunks at task-gen" idea, decoupled from stacking. Both mature
precedents decompose up front — Google's splitting strategies + implementation-plan grid, the Linux kernel's
patch-series — so the chunk boundary belongs where ARC already decomposes.

**Axis 2 — merge topology (separate, per work-type).** Where chunk-PRs merge is independent of how the review
surface is chunked:

- **Default — WU-scoped integration branch.** Chunk-PRs target a WU integration branch, not `main`; each PR's diff
  is just its chunk (bounded → reviewable); the chunks accumulate; the **WU integrates to `main` once**. No
  per-chunk green-on-`main` requirement, no rebase cascade against `main`, no squash-identity breakage —
  intermediate states never touch `main`. (The research's "long-lived integration branch, review incrementally"
  alternative; dovetails with the `integration-lane` single-exclusive-window model.) The WU → `main` merge is the
  sum of already-reviewed chunks — exactly what the assurance-algebra's terminal-aggregation core proves.
- **Optional — stack to `main`.** For genuinely bisectable work that _wants_ incremental landing, chunk-PRs stack
  bottom-up to `main`. Opt-in, gated by the eligibility test below, a depth cap (~3–4), tool-neutrality, and
  squash-merge awareness (the flagged stacking costs apply only here).

**Stack-eligibility test (gates only the _optional_ stack variant, not chunking):** a chunk can land independently
to `main` iff it leaves the tree **green + semantically consistent** on its own.

- **Additive / layered / vertical** work → stack-eligible (most feature work; the additive parts of a mixed WU).
- **Atomic consistency sweep with no consistency-preserving intermediate** → not stack-eligible; it still _chunks_
  for review (bounded review-PRs against the integration branch), it just merges once. A doc verb-rename is the
  clean example: no "both names coexist" intermediate, so it cannot land half-renamed on `main` — but its review
  surface can still be carved into tractable pieces. (Resolves the `lifecycle-closeout` tension: genuinely atomic
  _to merge_, still chunkable _to review_.)
- **Mixed WU** (e.g. `lifecycle-closeout`) → chunk for review throughout; land the additive legs as an optional
  stack and the atomic core as one merge, with the **audit as the terminal review chunk** (it sees the whole).

**Two modes:**

- **(A) Up-front** — plan chunks at `generate-tasks` before implementation; where wanted, bisectability is designed
  in.
- **(B) Retrofit (secondary) — review-only.** Carve an already-built branch's existing commits into bounded
  review-PRs against a WU integration branch; the WU still merges once. No re-architecting and no bisectability
  requirement — this is _review_ scoping, not the _merge_-retrofit (re-splitting into independently-mergeable parts)
  that industry rejects. Serves the live driving case: heavy WUs already mid-impl.

**Deferred — the cover letter / reviewer's guide.** Composing `meta` / `spec` / `cohort` into a PR-side guide is a
human-_navigation_ aid, not a surface reducer (so it does not help AI review), and it is storage-sensitive
(`strategy-storage-evolution` moves those artifacts to a separate backing store). Out of this WU; coordinate later.

## Alternatives (open)

- **Task-list structure for chunk boundaries** (when consecutive phases form one chunk but stay separate phases for
  impl granularity):
    - **(A) Thin orthogonal annotation** _(lean)_ — phases carry a `Chunk: N` tag; consecutive phases sharing a tag
      form one review chunk. Keeps the phase axis untouched; adds chunk-grouping as a separate axis — the same
      decouple move as the feature itself. An added `Land: stack | integration` marker can carry the Axis-2 topology
      per chunk.
    - **(B) `Phase 3A / 3B`** — a chunk-level grouping renaming above the phase.
    - **(C) Subphase level** — keep `Phase 3`, add a `Subphase 3A / 3B` level above the parent task.
    - Default assumption either way: **phase = chunk**, barring the always-present verification phase.
- **Config posture:** ARC default-**on** with a project-level opt-out toggle _(lean)_ vs. opt-in. Weaker risk now
  that the default topology is the low-cost integration-branch mechanic (not fragile stacking), so "always-on"
  carries less downside. Toggle existence + placement weighs `principle-anchored-core` / `scalable-core` and the
  configuration cohort.
- **Terminology:** the review unit needs a name that does **not** imply independent delivery to `main` (the
  integration-branch default doesn't give that). Candidates for the review unit — `slice`, `segment`, `chunk`;
  reserve `deliverable` / `stack` for the optional ship-to-`main` variant. TBD — follows the mechanism.

## Unknowns and Assumptions

- **Spec-time structure** — does the spec form need a design-element → chunk mapping so a reviewer (or the chunk-PR
  description generator) can scope one chunk? Lighter now that the cover-letter composition is deferred; the minimum
  is that `generate-tasks` can derive chunk boundaries and per-chunk PR descriptions from the task list. Revisit at
  create-spec.
- **Integration-branch mechanic** — what drives it: an `arc` verb that opens the WU integration branch, targets
  chunk-PRs at it, and performs the single WU → `main` integration? How does it compose with `integrate-work-unit`
  and the `integration-lane` exclusive window? Lower fragility than stacking, but a new orchestration surface.
- **Mechanical stack-eligibility** (optional-variant only) — can "leaves the tree green + semantically consistent"
  be derived automatically (build-green is checkable; semantic consistency is the hard half)? Gates only whether a
  chunk _may_ stack to `main`; chunking-for-review needs no such test.
- **Assurance-core minimum** — the slim terminal-aggregation + membership / tree-exact proof needed to show
  WU → `main` = sum of reviewed chunks (v1); the elaborate coalescing machinery deferred to provisional v2 (Inbound
  Buffer item 4).
- **Amended invariant** — this rewrites `strategy-work-organization` § Single branch per work unit and touches the
  integration ceremony (`integrate-work-unit`), `generate-tasks`, the task-list strategy/template, the spec form,
  and `assess-cohort-fit.md` (its cohort / stack / delivery framing needs a coherency pass once
  `1 WU = 1 branch, emitting ≥ 1 PR` lands). Deep change; an enhancement, not a bug-fix.
- **Class:** **Heavy** (settled 2026-07-20) — v1 is composition from mature prior art (integration-branch, kernel
  patch-series, small-PR doctrine); the invented-feeling assurance algebra is deferred to provisional v2. (The
  two-axis synthesis + review-only retrofit gave a momentary Novel pull, but the invented piece is out of v1.)
- **Relationships:** standalone (`Parent: [none]`); `Depends On: review-architecture` (record at launch). Likely
  coordinations — `session-locus-model` (`strategy-work-organization` § branching-model + `routingLane` / lane
  coherence), `integration-lane` (merge-window composition), `strategy-storage-evolution` / `arc-backend`
  (deferred cover-letter composition), `principle-anchored-core` / `scalable-core` + the configuration cohort
  (toggle architecture), `composable-workflows` (workflow-shell), `roadmap-tooling` (a review / merge-topology
  column, if added).

## Scope Estimate

**Large** (week+). Spans methodology (the amended invariant + a new DEV-RULES / strategy section), the task-list
model (`generate-tasks`, task-list strategy + template — chunk tagging), the spec form, the integration ceremony
(the WU integration-branch mechanic + the single WU → `main` merge), the slim assurance-core, and a config axis —
across both the package source and the `.arc/` copy. The elaborate assurance-group algebra is **out of v1** (parked
provisional v2) and the cover-letter composition is deferred, which bounds the surface. Sequencing depends on the
`Class`, terminology, and config-posture calls.

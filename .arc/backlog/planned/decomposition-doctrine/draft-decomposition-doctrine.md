# Draft: decomposition-doctrine — govern when a concern decomposes

- **Origin:** [internal] — minted on the decomposition-program grooming branch (2026-07-21); captured from the
  `review-architecture` integration postmortem discussion at session-init.
- **Purpose:** Close the planning-pipeline gap that let a 307-file / ~24.7k-insertion change ship as one work
  unit with no recorded decomposition decision: rebalance the size-vs-orthogonality discriminator, make the
  cohort-fit verdict a recorded artifact, force a re-read when task-generation materializes scale evidence, and
  codify the stack-vs-coupling test.

- **State:** Draft — pre-spec capture (2026-07-21). Iterate before promotion.

---

## Problem / Motivation

`review-architecture` reached integration as one WU at 307 files / ~24.7k insertions — a surface its own notes
record as exceeding what any single review invocation can navigate, requiring an ad-hoc eight-pass chunked
review. The planning record shows four distinct failure points, each a doctrine or pipeline gap rather than an
execution mistake:

1. **The doctrine licenses unbounded single-WU size.** `assess-cohort-fit` and `strategy-work-organization`
   § WU sizing standard say one coherent concern "stays one WU, however large," justified by the per-task
   review grain — which covers _execution_ review only. The integration-time review surface has no owner in the
   sizing standard, and the stance is only safe once `pr-decomposition` ships; today it presumes a mechanism
   that does not exist yet.
2. **Coupling was never tested against the stack shape.** The recorded keep-whole rationale ("one
   forward-contract cutover; splitting would create an unusable intermediate contract") describes _sequential
   dependency_ — which the sizing standard itself delivers as a stack of dependency-ordered WUs. Sequential
   coupling read as design-coupling, and the alternative was never weighed on the record. Verification proved
   the seams were real: the local channel, the rubric overlay, and enforcement scope were all carved off to
   other owners after the fact.
3. **The primary signal fired with no forced re-read.** Deliverable count is the standard's stated primary
   signal; at generate-tasks it materialized as 8 phases / ~111 leaf tasks / 5 new methods / two review
   channels. The sizing review that ran trimmed edge scope but never re-opened the WU-count question — the
   re-entry valve relies on spontaneous noticing, and Heavy-WU momentum beat it.
4. **No verdict artifact exists.** Cohort-fit produces no recorded output when it answers "stays one WU," so
   there is nothing to audit, nothing a later gate can challenge, and no way to tell whether the method ran at
   all. `Class`, by contrast, is a recorded, ratcheted field.

The case is not isolated: `session-locus-model` sits at 187 files / ~26.4k insertions mid-implementation, and
the two completed `cli-substrate-adoption` members each integrate at ~7.5k. Where decomposition _was_ applied
(that cohort), it worked — two reviewable members instead of one ~40k monolith.

## Proposed direction

Four deliverables, all edits to existing surfaces — no new machinery, no new always-loaded context:

1. **Discriminator rebalance** — `assess-cohort-fit` + `strategy-work-organization` § WU sizing standard.
   Orthogonality stays the trigger, but "one coherent concern stays one WU, however large" gains an
   integration-reviewability bound: past a stated scale, coherence alone no longer settles the question and the
   decision must be made (and recorded) rather than defaulted. `pr-decomposition` raises that bound — chunked
   review makes a larger coherent WU tractable — but does not remove it; even chunked review of ~24k lines is a
   week-scale cost the plan should have priced.
2. **Recorded verdict** — cohort-fit's answer becomes a written artifact at the design-stage reads that already
   invoke it (`draft-design`, `create-spec`): "stays one WU because X" or the cut-map, landing in the draft /
   spec alongside `Class`. Auditable, challengeable, and proof the method ran.
3. **Generate-tasks tripwire** — thresholds over materialized plan evidence (phase count, leaf count, estimated
   file surface) that force a cohort-fit re-run _with a recorded outcome_ when crossed. Wires into the existing
   sizing review at generate-tasks so it can trigger decomposition, not only edge-trimming; the re-entry valve
   stops relying on spontaneous noticing. The same materialized evidence admits a second, _prior_ reading —
   proportionality ("should this shrink?") before decomposition ("should this split?"): decomposing an
   overdesigned plan institutionalizes the excess across N members. The shrink reading is owned by the
   solution-proportionality concern (see § Coordination); this WU owns the split reading and honors the
   ordering.
4. **Stack-vs-coupling test** — codify that a sequential forward-contract chain is a _stack signal_, not a
   keep-whole signal: an "unusable intermediate contract" claim must be tested against dependency-ordered
   delivery (each member shipping a usable contract to the next) before it justifies one WU. Lands beside the
   stack-vs-cohort bullet the standard already carries.

## Coordination

- **`pr-decomposition`** — shares the `assess-cohort-fit` touchpoint (its amended-invariant coherency pass names
  the method), and the reviewability bound calibrates against chunking's existence. Until it ships, doctrine
  text references the bound neutrally — no forward-pointer to unshipped mechanism in adopter-facing surfaces.
- **`cohortless-decomposition`** (intended retitle: `decomposition-machinery`) — this WU increases decomposition
  frequency; the machinery must be parallel-safe concurrently or first. Soft precedence, not a `Depends On` edge.
- **`cohort-cut-coherence`** — adjacent rail on the same two surfaces (`assess-cohort-fit`,
  `strategy-work-organization` § Decomposition). Open question below: absorb it here or keep it separate.
- **`planning-iteration-mechanics`** — owns the planning-closeout gate shape; the recorded verdict may land as
  part of its closeout checklist rather than a freestanding rule. Coordinate placement at grooming.
- **Solution proportionality** (captured to `USER-INBOX § Work Unit`, `WU_Target: solution-proportionality`) —
  the sibling scale-governance concern: whether the designed solution is right-sized for the chartered problem
  at all, ex ante. Shares the generate-tasks fire-point with deliverable 3 under a strict order — shrink-reading
  before split-reading — and relates to `planning-iteration-mechanics`' buffered appetite/continuation tripwire
  (the in-flight half of the same family). Wrapper decision (paired siblings vs. one WU vs. stay with PIM) is
  that capture's grooming call, not this WU's.
- **Deliberately out of scope:** the unwired-ports guard (`USER-INBOX § Work Unit`, `WU_Target: TBD` —
  layer-decomposition shipping zero-caller contracts). Different failure class (delivery integrity, not
  scoping); it splits across `quality-gate-hooks` / `planning-iteration-mechanics` per its own capture.

## Unknowns and Assumptions

- **Where the verdict lives** — a draft/spec section vs. a meta field; whichever is chosen must survive artifact
  relocation and read naturally at the next grooming pass.
- **Tripwire calibration** — thresholds are heads-up-grade, not gates; settle values against the live corpus
  (the five in-flight WUs span 44–307 files) and whether the check stays prose-first or compiles into a CLI
  check later (procedure-evolution north star: deterministic logic migrates to the CLI).
- **Bound survival post-`pr-decomposition`** — whether the integration-reviewability bound converts to a
  chunk-count bound once chunked review exists, or stays LOC/file-shaped.
- **`cohort-cut-coherence` absorption** — same surfaces, same altitude, both small; folding it in may beat two
  passes over one method. Decide at grooming.
- **Class expectation:** Light — composition from settled analysis; no invention. Resolve via
  `classify-work-unit` at grooming.
- **Knowledge-placement check** (per `strategy-knowledge-evolution`): all four deliverables declare at existing
  fire-sites (method body, strategy section, generate-tasks step); no new always-loaded surface, no new doc
  family.

## Scope Estimate

**Small–Medium.** One method + one strategy section + one workflow step, package-synced across both copies.
Rules text, not machinery; the tripwire's CLI compilation, if any, is deferred to the procedure-evolution
owners.

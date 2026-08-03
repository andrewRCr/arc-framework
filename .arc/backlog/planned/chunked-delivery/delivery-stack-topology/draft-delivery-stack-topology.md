# Draft: delivery-stack-topology — the stack-to-base projection and its host adapters

- **Cohort:** `chunked-delivery` — see `cohort-chunked-delivery.md` for the shared canonical model,
  the problem framing, the field evidence the design rests on, and the cut that produced this member.
- **Purpose:** Own the stack-to-base reducer, the stack-eligibility test, the GitHub reference
  delivery-host adapter, and the lifecycle-artifact exclusion with its non-regression criteria.
- **Position:** the cohort's last member. It depends on `delivery-plan-record` and
  `delivery-integration-target`, and externally on `session-locus-model` for mid-delivery session
  position and on a typed delivery-slice review vehicle for exact-head clearance. Four independent
  constraints land on this member and none on the integration-target one; that asymmetry is the cut.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Cover retained-control closeout in the stack lifecycle-artifact contract**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-08-03); captured during the
  `session-locus-model` hand-run stack closeout.
- _Concern:_ the terminal stack member must atomically replace the planned-on-base generation with the completed
  generation while a retained control checkout owns the active artifacts, without producing an abandonment
  receipt, a ROADMAP repair, or an unresolved durable locus.
- _Fold-in:_ extend the topology contract and interruption matrix through retained-control transfer or the core
  terminal-frame capability; keep generic recovery semantics outside this member.

### `[ ]` **Validate an authored stack cut before it becomes externally binding**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-08-03); captured during
  `delivery-plan-record` draft design from the `session-locus-model` field run.
- _Concern:_ a retrofit author can otherwise commit to a cut before learning that independently green member heads
  are semantically incoherent or require costly compatibility caps.
- _Fold-in:_ make stack eligibility admit a non-binding dry run over author-drawn boundaries: construct and test
  candidate heads, evaluate semantic landability and compatibility cost, then discard them before any pushed ref
  or change request binds the plan. Do not derive cuts language-agnostically.

## Stack-to-`main` projection and delivery-host adapters

**Stack-to-`main` reducer.** The lowest unmerged member directly targets the current stack base; each higher member
directly targets its predecessor's ref. The whole remaining suffix may be materialized, but every observation must
prove that exact linear order and one final target.

- Editing or rebasing `Dj` advances the generation of `Dj … Dn`; the rewritten suffix is not ready again until each
  current target's checks and review qualification settle.
- Every landing set is an exact prefix `{D(k+1) … Dj}` from the lowest unmerged member. Three closed adapter
  capabilities preserve one core rule:
    - `single` lands only `D(k+1)` and is the complete generic Git / PR fallback;
    - `atomic-prefix` lands the authorized prefix all-or-none; and
    - `ordered-prefix` may land only a leading subprefix before a reported failure, as with a merge queue.
- The generic adapter never simulates `atomic-prefix` by looping several merges under one operation. An
  `ordered-prefix` result records the exact landed subprefix; descendants remain unlanded and no member outside the
  authorized prefix may move.
- Any partial landing retargets / rebases the remaining suffix onto the new base. Reconciliation advances those
  generations and blocks another landing until their current checks and review qualification settle.

Every stack landing touches `main`, so each exact landing request reaches an integration interlock. Authorization of
an `ordered-prefix` operation permits only the named prefix and its documented leading-subprefix failure outcome; it
never grants authority over later members.

**GitHub reference delivery-host adapter.** GitHub Stacked PRs is concrete enough in public preview to serve as the
first delivery-host adapter: official public documentation defines final-target rules / CI, focused per-layer diffs,
linear stack requirements, cascading rebase, partial and atomic merge-down, merge-queue behavior, REST stack
resources, read-only GraphQL membership, webhooks, and the public `github/gh-stack` extension. The ARC core defines
provider-neutral delivery capabilities and proofs; a GitHub adapter maps those semantics when preview access is
available, while ordinary Git / PR orchestration remains a complete fallback. Preview API / CLI details never enter
the canonical plan or acquire review-source authority.

As of 2026-07-30 the feature entered **public preview**, rolling out to all repositories, and two recorded facts
changed. The stack REST resources are now public at `/repos/{owner}/{repo}/stacks` — list, read, create from an
ordered bottom-to-top pull-request array, append, and unstack — replacing the earlier internal endpoints; every
pull-request resource carries a `stack` object with membership, one-based position, size, and base ref / sha, and
the same object is delivered on `pull_request` webhook events, so the adapter can observe rather than poll. And
`gh stack merge` is now implemented, so automated prefix merge no longer necessarily routes through the host UI.
Auto-merge and merge-queue support remain incomplete and are rolling out separately, so the prepare-bind-hand-off
path above stays the safe default until a capability probe proves otherwise.

Three constraints follow, and none is a direction change. A create or append carries **at least two and at most one
hundred** pull requests, so a single-member plan cannot be expressed as a stack at all and the projection reducer
must degenerate it to an ordinary pull request rather than emitting a one-member stack. All three merge methods are
permitted, which sharpens rather than settles the identity question: the capability contract must **select** a
method that preserves commit identity, not merely confirm that stacking is allowed, and the selection can be taken
away at runtime because merge queues override it. Finally, `stack.position` and `stack.size` are a second ordering
authority over membership the plan already owns — an observation to reconcile, never a source of truth, under the
existing rule that no control-bearing verdict trusts copied provider status.

Sources disagree on atomicity: the release note and the extension both describe merging a chosen pull request and
every unmerged layer below it as one all-or-nothing operation, while the feature documentation states merging is
not fully atomic and must proceed bottom-up. No resolution is needed — the three closed adapter capabilities
already span both readings, with `atomic-prefix` and `ordered-prefix` covering the disagreement and `single` as the
complete fallback. Probe the capability; never infer it from the marketing surface.

**Interim constraint — append-only merge versus automatic rebase.** ARC currently forbids rebasing a pushed branch,
because user notes are SHA-keyed and rewriting published commits orphans them from the ancestor walk that loads
them. GitHub stacking rebases every higher member automatically as each lower one lands, which is exactly the
forbidden operation. The two do not actually collide, and the reason is the boundary already settled above:
delivery refs are materialized projections of the plan, not work-unit branches. Authoring happens on the work-unit
branch, which is never rebased and where the notes live; the host rewrites projections, and tree-exactness rather
than commit identity is what the terminal proof requires.

One real exposure survives that argument. A review-driven fix authored **directly on a member ref** attaches notes
to a commit the next landing will rewrite, and the state contract does contemplate editing a member in place
(editing or rebasing a member advances its generation and every generation above it). For the interim, the stack
projection should therefore treat member refs as **write-through projections rather than authoring surfaces** —
land the fix on the work-unit branch and re-materialize — and say so, rather than relying on the discipline going
unstated. Where that cannot hold, the cost is orphaned note reachability, recoverable from the notes ref by hand
but not automatically.

This constraint retires on its own when operational state stops being SHA-keyed, so it earns a recorded rule and no
machinery. It is also the fourth independent reason the stack projection sequences after the integration-target
one: that projection merges the base in append-only and never rebases a member, so the conflict never arises there.

**Stack-eligibility test** (gates only the stack projection, never chunking): a deliverable can land independently
to `main` iff it leaves the tree **green + semantically consistent** on its own.

- **Additive / layered / vertical** work → stack-eligible (most feature work; the additive parts of a mixed unit).
- **Atomic consistency sweep with no consistency-preserving intermediate** → not stack-eligible; it still _chunks_
  for review, it just merges once. A doc verb-rename is the clean example: no "both names coexist" intermediate, so
  it cannot land half-renamed on `main` — but its review surface can still be carved into tractable pieces.
- **Mixed work unit** → always chunk for review; choose the integration-target projection when the complete concern
  cannot land safely in increments. Do not introduce mixed projection segments or split the concern into sibling
  work units merely to obtain incremental landing.

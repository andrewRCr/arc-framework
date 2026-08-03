# Spec (`outline`): errand-transient-lifecycle

- **Origin:** `[internal]` — decomposed from `session-locus-model` on 2026-07-25, which built and proved this
  scope before its delivery stack was carved. The implementation is inherited rather than authored here.

- **Purpose:** Let a full-protection Errand's identity outlive its local checkout and return to a fresh one —
  `arc errand leave` persists the departing state, `arc errand materialize` brings a remote-only claim onto a
  machine.

---

## Problem / Context

`session-locus-model` separates two authorities that used to be one: an Errand's **identity** is ref-backed and
machine-agnostic, while its **locus** — the checkout it occupies — is machine-local and disposable. That
separation is what makes an Errand survivable across a pause, a review wait, or a different machine.

It ships only half of the consequence. The base deliverable carries the `paused` and `awaiting-merge` state
vocabulary, the transitions that write them, the reader projection that renders such a claim as an
`identity-only` row, and the recovery and in-flight-identity handling that offers resume, wait, finalize, and
abandon over it. No verb in that deliverable **produces** either state, and none brings a remote-only claim onto
a machine that lacks it. An ordinary Errand there is `open` or nothing: it runs to completion in one sitting, or
it is abandoned.

The two verbs below close that gap. They are the reason the state vocabulary exists, and the reason a review
tail is a supported shape rather than a session the operator must hold open.

## Decision(s)

**We will add `arc errand leave <slug> --state paused|awaiting-merge`**, which persists identity state and then
closes the local locus without retiring identity. It follows the base deliverable's leave/close ordering
contract exactly: finish and verify the work, persist the departing state and its exact head, return the primary
to base or tear down the spawned worktree, pop the role with its expected generation, then rederive and report
the restored parent frame. Local work that completes while cleanup fails is surfaced as recoverable residue and
never rewritten.

**Each departing state requires its own proof, taken before the locus closes.** `paused` requires the WIP head
committed and pushed — `savedHead` must equal the terminal branch head and be a proven ancestor of the fetched
remote tip. `awaiting-merge` requires the exact change request, with its recorded coordinates matching both the
configured repository/base and the observed host object. A claim whose head is not preserved on the remote does
not get to leave: the identity would then name a generation no other machine could reach.

**We will not let `leave` judge whether work is promotion-worthy.** Crossing the wrapper floor is
`arc errand promote`'s explicit decision in the base deliverable, made by the workflow rather than inferred from
how long an Errand has run. `leave` records a departure; it never reclassifies the concern.

**We will add full-protection `arc errand materialize <slug>`**, replacing session-init's raw `git worktree add`
path with a verb that writes ARC ownership provenance and an `errand` role beside the checkout it creates. It
accepts exactly two shapes: an identity-only `paused` claim at its `savedHead`, or an `awaiting-merge` claim at
its `changeRequest.headSha` whose change request is verified still open. It refuses `open` identities,
branch-derived legacy candidates, changed or missing remote heads, and incomplete identity snapshots. Partial
protection has no remote branch and therefore no materialize path.

**We will add no resume command.** Resume stays a reader verdict that dispatches to the subject's own open
driver in the base deliverable, which revalidates identity state before allocating a fresh locus. This work
supplies the states that make that verdict reachable; it does not add a second entry point to it.

## Scope boundary (No-gos)

- **The v3 identity schema, the state transform, and the reader projection.** All three ship with
  `session-locus-model` and are consumed here unchanged. `paused` and `awaiting-merge` are its vocabulary; this
  work is their producer, not their owner.
- **Partial-protection pause.** A partial Errand has no shared identity ref to persist state into, and partial
  handoff stays forbidden until completion, promotion, or abandonment.
- **`abandon` and `partial-settle`.** Both belong to the base deliverable: abandon is close's counterpart and the
  only driver behind its residue exit, and partial settlement is called by close and abandon alike.
- **The generation-capability contract.** What exact generation capability every mutator carries, and where it is
  revalidated under lock, is `locus-generation-binding`'s deliverable. Nothing here introduces a shared capability
  type or extends revalidation beyond the two verbs added.
- **Cross-machine arbitration of simultaneous claims.** Unchanged from the origin: identity claims are
  first-writer-wins with explicit conflict surfacing.

## Consequences & Risks

**The base deliverable merges with an unreachable state pair, deliberately.** Between its merge and this one, no
production path writes `paused` or `awaiting-merge` for an ordinary Errand, while the schema, transform arms,
`provePauseHead`, reader rendering, and recovery handling all carry them. That is a stated cost of cutting the
stack where the code's dependency direction actually cuts, not an oversight — the base spec records the same
boundary from its side. The alternative, dragging `leave` into the base to make its own vocabulary reachable,
would pull the whole transient lifecycle back and defeat the split.

**Dedicated coverage is thinner than the source share suggests.** The identity-core tests that prove most of this
state machine live in `session-locus-model` and stay there, because they exercise substrate this work only
consumes. Review of this deliverable leans on that suite. Standalone proof, if wanted, is new test work rather
than relocated test work.

**Four inherited test files need per-stop editing rather than wholesale moves** — three e2e files that cut at `it`
boundaries, plus one handler test that mixes this scope with the base deliverable's at `describe` granularity.
That was measured on a throwaway carve, not estimated.

## Success Criteria

1. A full-mode Errand leaves its local locus in `paused` state only after its WIP head is committed and proven an
   ancestor of the fetched remote tip, and in `awaiting-merge` state only with change-request coordinates matching
   both configured and observed host state. Neither departure retires identity.
2. A left Errand resumes through the base deliverable's open driver into a newly allocated locus, returning
   identity state to `open`, without this work adding a resume command.
3. Leaving never converts operational re-entry into a durable plan: no WU meta, task list, or session notes is
   created, and no unleased transient role is reclassified as normal waiting.
4. `arc errand materialize` accepts only an exact paused v3 identity at `savedHead` or an awaiting-merge identity
   at `changeRequest.headSha` whose change request is verified still open. It refuses `open` identities,
   branch-derived legacy candidates, changed or missing remote heads, and incomplete snapshots.
5. Materialization writes ARC ownership provenance and a role record, leaving session-init with no raw
   materialization path that can create a markerless ARC-owned worktree.
6. Materialize carries owned end-to-end coverage for both success and failed-open rollback, replacing the seeded
   legacy records the origin's suite used to assert this path.
7. Package-source and self-hosted workflow copies stay synchronized, and all Tier 1–3 quality gates pass.

## Open items

- **Materialize e2e coverage** is the one piece of remaining implementation work, carried from the origin's
  review as the materialize half of its `E5-V1` finding. Everything else in this deliverable is built and green;
  this path is asserted today against seeded legacy records rather than a real v3 Errand.

---

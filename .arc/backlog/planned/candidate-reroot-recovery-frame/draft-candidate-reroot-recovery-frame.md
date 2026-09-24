# Draft: candidate-reroot-recovery-frame

- **Origin:** [internal]
- **Purpose:** Keep an Active prepublication checkout deterministically resumable while an approved Candidate-changing
  correction awaits full verification and a new root, without recognizing the changed Candidate prematurely.

---

## Problem / Motivation

An approved prepublication review fix can change the Candidate subject legitimately. `arc attest` then requires
`establish-new-root`, but the locus reader has historically treated the same checkout as unresolved. If compaction
lands in that interval, recovery cannot derive a frame or load set and the mandatory recovery marker prevents the
owning session from reaching the verification and re-root action that would resolve it.

The immediate diagnostic repair landed in PR #591. It aligns the refusal with the actual Candidate transition and
returns an exact guarded continuation, but a diagnostic is not a recovery frame: the checkout still needs durable,
non-recognizing authority to resume the owning workflow across compaction.

The live `evidence-applicability` failure adds the concrete recovery contract. Its seed names the prior ceremony-only
path set while the current tree also contains the approved fix paths; without a resolved fresh frame, the audit cannot
classify that movement, derive the current load set, or match the locus hint.

## Design Direction

- Define a durable-baseline frame for an Active prepublication Candidate whose exact subject transition is known to
  require `establish-new-root`. The frame authorizes recovery and workflow continuation only; it does not recognize
  the changed Candidate or satisfy applicability.
- Carry the exact prior Candidate identity, current target, transition reason, verification obligation, and allowed
  continuation through subject projection, derived locus state, compaction seeding, and recovery audit.
- Let recovery distinguish the approved correction delta from unrelated worktree drift and retain the pending marker
  until the owning workflow has verified the changed target and established the new root.
- Make sibling-session guidance describe the checkout as a resumable Candidate transition rather than cleanup residue.
- Converge after re-root: the durable-baseline frame disappears, ordinary Candidate projection resumes, and a repeated
  audit observes the newly established root without a parallel recovery authority.

## Required Scenarios

1. An approved review fix changes an Active prepublication Candidate and `arc attest` selects
   `establish-new-root`.
2. Compaction occurs before full verification; recovery derives the non-recognizing frame, current load set, and exact
   continuation from durable evidence.
3. The owning session completes the required verification and new-root attestation; recovery then projects the
   ordinary current Candidate.
4. Missing, stale, rewritten, or mismatched transition evidence remains a typed stop.
5. An unrelated session inspecting the same checkout receives actionable transition guidance without being invited
   to clean it up or mutate its Candidate.

## Scope Boundaries

- Do not weaken full-verification or new-root authority, infer state from branch shape, or treat the changed target as
  recognized before the owning attestation succeeds.
- Do not absorb the general recovery forcing function, marker-delivery reliability, intentional unmerged-index
  recovery, or broad drift calibration from `draft-recovery-hardening.md`.
- Do not introduce generic cross-version Candidate compatibility. Cross-worktree vocabulary skew remains a separate
  recovery-hardening concern; this work may expose the typed local continuation it should point to.
- Do not redesign review-fix disposition authority or Candidate lineage outside the recovery interval.

## Likely Surface

Candidate effective-target and subject-meta projection; derived locus and session guidance; compaction-seed and
recovery-audit projection; prepublication verification workflow continuations; focused integration and real-CLI
coverage over the complete compaction-to-re-root transition.

---

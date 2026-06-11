# Draft: Merge-Safety Mechanism

- **Cohort:** `agile-parallelism/concurrent-work-conventions`
- **Origin:** [internal] — the merge-safety mechanism half of the decomposed Concurrent Work Conventions concern.
  Makes `concurrent-work-doctrine`'s conventions real: nothing detects or disciplines "main moved under me" today.
- **Purpose:** Ship the merge-safety mechanism that backs the concurrent-work conventions — the advisory
  behind-base detector (a ref-parameterized `origin/<base>`-distance primitive + a session-init probe slot),
  write-context extensions (path-surface dimension + chore-awareness + a pre-commit backstop), the merge-commit
  hook/footer exemption, and the append-only-until-integration detection backstop. The guiding constraint:
  **compose shipped primitives, don't rebuild** — refactor each primitive for all known consumers under the
  reuse-clean (SOLID / DRY) principle, never bolt-on.

---

## Problem / Motivation

Worktree Foundation + Errand Enablement + In-Flight Awareness made parallel WUs and errands mechanically possible,
but the **integration-time discipline** for them is not yet enforced by any mechanism. Parallel WUs + errands run
mechanically today, but nothing detects or disciplines "main moved under me." `concurrent-work-doctrine` codifies
the conventions (append-only-until-integration, reconcile-on-contact, the all-owner gate); this member ships the
mechanism that makes those conventions *real* rather than advisory prose:

- When `main` moves under an in-flight branch, what surfaces the drift and what discipline reconciles it? Today
  nothing computes behind-*base* — session-init's `remote-ahead` only detects behind-own-upstream.
- How is a force-push that orphaned another machine's pre-rebase tip detected and recovered cheaply?
- What stops a merge commit's two-parent shape from tripping the conventional-commit + footer hooks?
- How does write-context classification cover the path-surface and `chore/` dimensions concurrent work introduces?

This is the **closeout-critical mechanism cluster** the parent cohort flagged: the CLI buildables were homeless
and carry mechanism (not conventions) character. They land here.

---

## Buildables

### Behind-base detector — the ref-parameterized primitive + probe slot

The "main moved under me" target is **(a) a convention in the strategy doc (`concurrent-work-doctrine`) + (b) an
advisory behind-base detector (this member)** — explicitly **not** a blocking guard. The integration-conflict
research is unambiguous that overlap signals stay advisory (false positives; industry detects at merge time, not
before).

- **The detector:** at session-init resume, compute behind-base drift + path overlap ("main moved K, you're N
  behind, these paths overlap → reconcile?"). O(1) per resume (your one branch vs. base); advisory, never gates.
- **Build it general:** a ref-parameterized `origin/<base>`-distance **primitive** + a session-init **probe slot**
  (worktree-channel-shaped: `state` / `ahead` / `behind` / `recommendedAction` / `recommendedPromptText`), so
  `cross-machine-sync-coherence`'s `baseBranchSync` *extends* it (local-base-ref subject,
  `session.init_pull.main`, and the cross-machine layer) rather than double-building. This is the *same mechanism*
  as the reconcile-triage convention's advisory detector — one buildable, spec'd once.
- `research-integration-conflict-handling.md` is **sufficient** here — no new external pass.

This primitive is the sub-cohort's central **shared contract**: `async-merge-lifecycle`'s in-flight completion
sweep reuses it for behind-base classification, and `concurrent-work-doctrine`'s reconcile-triage convention
narrates it.

### Append-only-until-integration — the detection backstop

`concurrent-work-doctrine` owns the *convention* (mid-flight only add commits + ff-push; integration is the single
sanctioned rewrite point). This member owns the **detection backstop**, secondary to prevention:

- In session-init's `diverged` handler, when local-ahead commits are patch-equal to a remote prefix (patch-id /
  range-diff), downgrade the generic "manual rebase or merge needed" to "local commits are superseded by rebased
  equivalents on the remote — reset is lossless" and offer the reset; optionally warn before force-pushing an
  in-flight WU branch.
- Composes with the behind-base detector above.
- **Open seam:** this member may own the patch-equal supersession detection, or hand it to
  `cross-machine-sync-coherence` — decide at this member's spec. Grounded in the live 2026-06-10 incident (a
  laptop-scaffolded branch rebased + force-pushed from the primary orphaned the laptop's pre-rebase tip; recovered
  via `reset --hard origin/<branch>`).

### Write-context extensions

**Compose, don't rebuild.** `lib/git/write-context.ts` (`classifyWriteContext` / `resolveWriteContext`) and
`errand-branch.ts` (`chore/` detection) are shipped. Net-new:

- the **path-surface dimension** (which path surface a write targets);
- **chore-awareness** (composes the two shipped primitives);
- a **pre-commit backstop hook**;
- broader command wiring.

**Entry-level re-homing** of foreign-owned atomics folds into `concurrent-work-doctrine`'s all-owner gate doctrine
— this member surfaces the entry-level (not just file-level) write context the doctrine keys on.

### Merge-commit exemption

Do **both**:

- a **hook exemption** (`MERGE_HEAD` / 2-parent skip of the conventional-commit + footer rules), and
- an **`integration` footer kind**.

A merge commit's two-parent shape otherwise trips the conventional-commit and footer hooks; this is a correctness
fix.

---

## Design Decisions carried into the spec

### Compose shipped primitives, don't rebuild (the reuse-clean principle)

The merge-safety buildables compose shipped primitives under SOLID / DRY — refactor the primitive for all known
consumers, never bolt-on. The four standing drift constraints the spec must honor before building:

- The write-context classifier is **shipped** (`lib/git/write-context.ts`, `errand-branch.ts`) — net-new is the
  path-surface dimension, chore-awareness, the pre-commit backstop, and wiring.
- The at-branch-creation base-staleness check is **shipped** (per `cross-machine-sync-coherence`) — the behind-base
  detector composes with it.
- In-Flight Awareness shipped the activation-check *mechanism*, not just the oracle — this member adds none of
  that, only the merge-safety net.
- Async-merge touchpoints are largely shipped — but those are `async-merge-lifecycle`'s, not this member's.

### Cohort-doc coverage

The cohort doc is the most-shared planning artifact and the deliberate exception to per-worktree isolation. The
Errand matrix's advisory "owning-WU-in-flight" gate keys on a *single* owning WU, so it is ill-defined for a
cohort-owned doc — **the behind-base detector is the net that does apply.** This member confirms the detector
covers the cohort doc; `concurrent-work-doctrine` records the partition-first lean and the serialize-via-`main`
fallback.

---

## Scope Estimate

**Medium — TS + hooks, mostly composition.** Real but lighter than the pre-sweep framing because most buildables
compose shipped primitives (`lib/git/write-context.ts`, the `origin/<base>` substrate) rather than build from
scratch: behind-base detector (ref-parameterized primitive + probe slot), merge-commit exemption, write-context
path-surface / chore extensions + pre-commit backstop, append-only detection backstop.

### Dependencies

- **Internal:** `concurrent-work-doctrine` (the conventions these mechanisms enforce). Ideally precedes
  `async-merge-lifecycle` (which reuses the behind-base primitive in its completion sweep) — soft, not hard.
- **Substrate (shipped):** `lib/git/write-context.ts`, `errand-branch.ts`, the `origin/<base>` substrate, the
  at-branch-creation base-staleness check.
- **Extended by:** `cross-machine-sync-coherence` (its `baseBranchSync` extends the ref-parameterized primitive +
  probe slot — explicitly the next WU's, not this one's).

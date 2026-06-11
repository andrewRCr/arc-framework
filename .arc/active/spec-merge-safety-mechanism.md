# Spec (`detailed` · `RFC`): merge-safety-mechanism

- **Origin:** [internal] — the merge-safety mechanism half of the decomposed Concurrent Work Conventions concern.

- **Purpose:** Ship the enforcement backstop for the concurrent-work conventions — an advisory behind-base detector
  (a ref-parameterized `origin/<base>`-distance primitive + session-init probe slot), an append-only supersession
  backstop, write-context extensions with a pre-commit foreign-write check, and a merge-commit hook exemption. The
  guiding constraint: **compose shipped primitives, don't rebuild.**

---

## Introduction / Context

`concurrent-work-doctrine` shipped the conventions that govern running more than one work unit at a time —
append-only-until-integration (the one hard invariant), reconcile-on-contact, the all-owner gate — as
adopter-facing doctrine (`strategy-concurrent-work`) plus the advisory `assess-parallel-fit` read. The worktree
substrate that makes parallel work mechanically possible also shipped earlier: per-WU worktrees, session-init
worktree-awareness, branch-gone recovery, the in-flight activation check.

What does not exist is the **mechanism that makes those conventions real rather than advisory prose**. Nothing
detects or disciplines "main moved under me": session-init computes behind-*own-upstream* (`remote-ahead`) but
never behind-*base*. Nothing surfaces that a force-push orphaned another machine's pre-rebase tip. Nothing stops a
merge commit's two-parent shape from tripping the conventional-commit and footer hooks. Write-context
classification covers neither the path-surface nor the `chore/` dimensions concurrent work introduces.

`ADR-025` (Govern Concurrent Work by Convention, Not Mechanism) names this work unit explicitly as the home of two
of those gaps: *"the enforcement of the conventions it states ships with the sibling cohort members — the
behind-base detector and the foreign-write backstop (`merge-safety-mechanism`)."* The doctrine owns the
convention; this WU is the enforcement backstop.

A live incident on **2026-06-10** sharpened the stakes: a laptop-scaffolded branch was rebased and force-pushed
from the primary worktree, orphaning the laptop's pre-rebase tip; it was recovered losslessly via
`git reset --hard origin/<branch>`. The failure mode the append-only invariant guards against is silent and lossy,
which is precisely why it warrants a detection backstop even though enforcement stays advisory.

## Goals

- **Surface behind-base drift at resume, advisorily.** At session-init resume, compute how far the current branch
  trails its base and whether their changed paths overlap, and offer reconciliation — never gate.
- **Build the distance primitive general.** A ref-parameterized `origin/<base>`-distance primitive plus a
  session-init probe slot shaped like the existing worktree channel, so `cross-machine-sync-coherence` extends it
  and `async-merge-lifecycle`'s completion sweep reuses it — one buildable, not three.
- **Catch the lossy case.** Detect patch-equal supersession in the diverged handler (local commits superseded by
  rebased equivalents on the remote) and offer the lossless reset; warn before force-pushing a shared in-flight
  branch.
- **Extend write-context for concurrency.** Add the path-surface dimension and `chore/`-awareness to the
  classifier, and a pre-commit backstop that surfaces a foreign-owned write before it lands.
- **Stop merge commits tripping the hooks.** Exempt two-parent / `MERGE_HEAD` commits from the conventional-commit
  and footer rules, and add an `integration` footer kind.
- **Advisory throughout.** Every surface informs and offers; none blocks. The one hard invariant lives in the
  doctrine, enforced by an advisory net here.

## Non-Goals

- **The cross-machine layer.** The local-base-ref subject, `session.init_pull.main`, and the cross-machine sync
  semantics extend the behind-base primitive — that extension is `cross-machine-sync-coherence`'s, not this WU's.
  This WU ships the primitive built general; the sibling consumes it.
- **The conventions themselves.** Append-only, reconcile-on-contact, and the all-owner gate are
  `concurrent-work-doctrine`'s, already shipped. This WU enforces; it does not re-state.
- **The single-owner model and the awaiting-review seam.** `single-owner-wu-model` owns the single-owner
  apparatus; `async-merge-lifecycle` owns the `Integrating`-state completion sweep (it *reuses* the behind-base
  primitive but does not build it).
- **Hard gating.** No blocking guard, no `--force` refusal beyond what the release wrapper already does, no
  overlap-prediction tooling (`ADR-025` rejected the latter as O(n²), false-positive-prone, and likely not
  reliably computable — meta files don't declare file-scope).

## Proposed Design

Five components. Each composes a shipped primitive under SOLID / DRY — refactor the primitive for all known
consumers, never bolt on a parallel copy — and each enforces a named section of `strategy-concurrent-work`.

### 1. Ref-parameterized behind-base primitive + probe slot

*Enforces: § Append-only ("the net") and § Branch and rebase discipline (drift surfacing).*

Today `countAheadBehind` (`lib/git/worktree-sync.ts`) is private and hardcoded to
`git rev-list --left-right --count HEAD...origin/<current-branch>` — it can only compare HEAD against the branch's
own upstream. Extract it into an exported, ref-parameterized primitive:

```ts
export async function countAheadBehindRef(
  exec: GitExec,
  localRef: string,
  remoteRef: string,
): Promise<{ ahead: number; behind: number; state: WorktreeSyncState }>
```

`runWorktreeSyncStatus`'s existing path consumes the extracted primitive (the `origin/<branch>` case becomes one
caller, not a duplicated body) — DRY refactor, not a second implementation.

Add a **base-distance probe slot** to the session-init envelope, shaped like the worktree channel
(`state` / `ahead` / `behind` / `recommendedAction` / `recommendedPromptText`), computing HEAD vs `origin/<base>`.
It follows the established probe pattern: a `Probe<T>` field on `SessionInitProbeResult` (`commands/status/types.ts`),
a `SessionInitProbes` entry, fan-out wiring in `runSessionInitStatus` (`commands/status/run.ts`), and an I/O
binding in `handlers/status.ts`. Paired with a path-overlap read, the resume surface reads: "main moved K, you're N
behind, these paths overlap → reconcile?" O(1) per resume (your one branch vs. base); advisory, never gates.

This primitive is the sub-cohort's central **shared contract**: `cross-machine-sync-coherence`'s `baseBranchSync`
extends it (local-base subject + cross-machine layer), and `async-merge-lifecycle`'s completion sweep reuses it for
behind-base classification.

### 2. Append-only supersession backstop — owned here

*Enforces: § Append-only (the one hard invariant). Detection backstop, secondary to prevention.*

In session-init's `diverged` handler, when local-ahead commits are patch-equal to a remote prefix, downgrade the
generic "manual rebase or merge needed" to "local commits are superseded by rebased equivalents on the remote —
reset is lossless," and offer `git reset --hard origin/<branch>` (offer, never auto-run). This is the recovery the
2026-06-10 incident needed, generalized into a detector.

Pair it with an advisory **force-push warning**, fired at push time: when force-pushing a shared in-flight WU
branch whose remote tip is not an ancestor of the local tip, warn first. A pre-push hook is the natural home
because it catches raw `git push --force`, not only the release-wrapper path. The append-only invariant is hard,
but its enforcement is an advisory backstop (`ADR-025`) — this warns, it never blocks.

This component owns the patch-equal supersession detection (resolved open seam): the diverged-handler mechanism
stays coherent in one WU, it is grounded in the incident, and `ADR-025` names the backstop as this WU's. It
composes with component 1's distance primitive.

### 3. Write-context extensions — the foreign-write backstop

*Enforces: § Foreign-owned work and the all-owner gate (file- and entry-level).*

`classifyWriteContext` (`lib/git/write-context.ts`) is a pure function with a single decision axis today
(`currentBranch === baseBranch` → `proceed` / `relocate` / `refuse`). Extend it with:

- a **path-surface dimension** — which path surface a write targets — added to `WriteContextInput` and the verdict;
- **`chore/`-awareness** — call `errandSlugOf(currentBranch)` (`lib/session-init/errand-branch.ts`, pure, already
  receives the branch string) inside the classifier; zero new I/O, pure composition.

Add a **pre-commit backstop** as a new pre-commit CHECK (after CHECK 18, cohort-consistency; before the Summary
block) that surfaces a foreign-owned write among staged files before it lands. It reuses
`detectForeignArtifactOverlap` (`lib/git/foreign-artifact-detection.ts`) behind a new hook-side `npx tsx`
entrypoint — the detection logic exists; the hook-level call path does not yet. Advisory: it surfaces, it does not
refuse the commit.

Entry-level re-homing of foreign-owned atomics folds into the doctrine's all-owner gate — this WU surfaces the
entry-level (not just file-level) write context the doctrine keys on.

### 4. Merge-commit exemption

*Enforces: § Branch and rebase discipline (merging the base in mid-flight — a platform "Update branch" — creates
the merge commits that otherwise trip the hooks).*

A merge commit's two-parent shape trips both the conventional-commit subject rule and the `Context:` footer rule.
Do both:

- **Hook exemption** — in the `commit-msg` hook, detect `MERGE_HEAD` / a two-parent commit immediately after the
  `hook_enabled` early-exit and exit 0 before any rule runs.
- **`integration` footer kind** — add a standalone `Context: integration (...)` kind (a new branch in the footer
  rule). Today `integration` exists only inside the `meta-*.md` lifecycle-marker set, not as a standalone kind; the
  new kind covers single-parent integration ceremony commits (a squash-merge result, an archival move) that the
  two-parent `MERGE_HEAD` exemption does not catch.

The hooks are bash, mirrored under `.arc/system/.internal/githooks/` and the package source
(`packages/arc-framework/arc/system/.internal/githooks/`); both copies change under the two-copy package-project
sync discipline. This is a correctness fix, not a policy change.

### 5. Cohort-doc coverage (confirm, not net-new)

*Enforces: § Shared files (cohort partition, behind-base as the net).*

A `cohort-{name}.md` is the most-shared planning artifact and the deliberate exception to per-worktree isolation.
The Errand matrix's advisory gate keys on a *single* owning WU, so it is ill-defined for a cohort-owned doc — the
behind-base detector (component 1) is the net that applies. This component confirms the detector covers the cohort
doc; it builds nothing new. `concurrent-work-doctrine` already records the partition-first lean and the
serialize-via-`main` fallback.

## Alternatives & Rationale

- **Advisory detector vs. blocking guard.** The behind-base / overlap surface is advisory and never gates. The
  integration-conflict research `concurrent-work-doctrine` relied on is unambiguous that overlap signals stay
  advisory: industry detects conflicts at merge time, not before, and pre-emptive prediction is false-positive-prone.
  A blocking guard would also be non-idiomatic against ARC's "inform rather than restrict" posture.
- **General primitive vs. narrow one.** Building the distance check narrowly (only this WU's resume surface) is
  rejected: `cross-machine-sync-coherence` and `async-merge-lifecycle` both consume it, so a narrow build forces a
  second implementation later — a DRY violation and the exact "bolt-on" the cohort's reuse-clean principle forbids.
  Cost of building general now is one parameter and one exported symbol.
- **Own patch-equal supersession here vs. defer to `cross-machine-sync-coherence`.** Owned here: the
  diverged-handler mechanism is coherent as one unit, it is grounded in the live incident, and `ADR-025` assigns
  the append-only backstop to this WU. Deferring would split a single coherent detector across two WUs. The
  *cross-machine* extension (local-base subject, `session.init_pull.main`) still belongs to the sibling — the cut
  is detector-here / cross-machine-layer-there.
- **Force-push: advisory warn vs. hard block vs. nothing.** Advisory warn. "Nothing" leaves the incident's failure
  mode undetected; a hard block contradicts `ADR-025`'s advisory-enforcement decision and would fight legitimate
  history cleanup at integration (the one sanctioned rewrite point).
- **Merge-commit: hook exemption vs. reformatting merge messages.** Exemption. A merge commit is structurally
  exempt by its two-parent shape; reformatting git's generated merge message to satisfy the conventional-commit
  and footer rules would fight git's own convention and add per-merge friction for no correctness gain.

## Cross-cutting Considerations

- **Security.** None material. Every git operation is read-only introspection (`rev-list`, `patch-id` / `range-diff`,
  parent counts) or an *offered* command (`reset --hard origin/<branch>`); nothing is auto-executed against the
  working tree.
- **Performance.** The behind-base read is O(1) per resume (one branch vs. base). The patch-equal check is bounded
  to the local-ahead commit set. The probe slot adds no cost to the clean common path beyond one ref-distance
  count. No added latency to non-diverged resumes.
- **Testing.** Unit: `countAheadBehindRef`, the `classifyWriteContext` path-surface + `chore/` extensions, the
  `errandSlugOf` composition, patch-equal detection. Integration: probe-slot assembly into the session-init
  envelope, the diverged-handler downgrade. E2E (real temp git repos): the `commit-msg` merge exemption against an
  actual two-parent commit, the pre-commit foreign-write backstop against staged foreign paths. Bash hooks add
  shellcheck coverage.
- **Migration / rollout.** Purely additive. The probe slot is new; the merge exemption is permissive (it can only
  *relax* validation, never break an existing passing commit); the write-context extensions augment a single-caller
  pure function. Hook edits ride the two-copy package-project sync.
- **User-facing impact.** Three new advisory surfaces at session-init resume (behind-base reconcile, supersession
  downgrade) and one at push time (force-push warning). All informational; none gate the operator.

## Success Criteria

- `countAheadBehindRef` is exported and ref-parameterized; `runWorktreeSyncStatus` consumes it with no duplicated
  distance logic remaining.
- The session-init envelope carries a base-distance probe slot, worktree-channel-shaped. A resume with `main`
  advanced under the branch surfaces the advisory reconcile prompt; a base at parity produces no surface.
- A diverged state whose local commits are patch-equal to a remote prefix surfaces the "superseded — reset is
  lossless" downgrade and offers the reset; a genuinely-diverged state still surfaces the generic reconcile.
- Force-pushing a shared in-flight branch whose remote tip is not an ancestor surfaces the advisory warning and
  never blocks.
- `classifyWriteContext` classifies the path-surface and `chore/`-awareness dimensions; the pre-commit backstop
  flags a staged foreign-owned write (advisory) and passes a clean self-write.
- A two-parent / `MERGE_HEAD` commit passes `commit-msg` with no conventional-format or `Context:`-footer error;
  `Context: integration (...)` validates as a recognized kind.
- No new hard gate or block is introduced anywhere — every added surface is advisory.
- All quality gates green (`lint:md`, `lint:ts`, `lint:sh`, `typecheck:all`, `test`, `build`); package-project sync
  clean for the hook edits.

## Open Questions

Genuine implementation detail, resolved during the work — none is a masked design decision:

- **Patch-equality mechanism.** `git patch-id` vs. `git cherry` vs. `git range-diff` for the supersession check —
  which is most robust across real rebase shapes. The *detection* is decided; the git plumbing is detail.
- **Path-surface taxonomy cardinality.** The minimal useful enum of path surfaces the classifier distinguishes
  (e.g. `active/` vs. `backlog/` vs. cohort-doc vs. code). The dimension's existence and purpose are decided; its
  exact cardinality settles against the real surfaces at build.
- **Pre-commit reuse shape.** Whether the pre-commit backstop calls `detectForeignArtifactOverlap` directly or a
  thinner staged-files analog, depending on roster-assembly cost at hook time.
- **Force-push warning placement.** A new pre-push hook (complete coverage, including raw `git push --force`) vs.
  release-wrapper-only (simpler, but bypassed by off-workflow and errand raw pushes). The advisory *intent* is
  decided; the coverage/placement tradeoff settles at build.

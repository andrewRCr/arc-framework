# Draft: review-checkout-lifecycle

- **Origin:** [internal] — extracted from `draft-review-protocol-alignment.md` (concern 3) at its 2026-07-26
  formalization-readiness read, where the concern proved orthogonal to that work unit's protocol-content subject.
- **Purpose:** Make a failed review leave usable evidence behind, and stop ephemeral review checkouts from
  registering themselves in the primary repository — two defects of one lifecycle, the ephemeral checkout the
  frontline review path materializes and tears down.

- **State:** maturing — direction settled and twice re-grounded against source; the implementation mechanisms and
  two-member decomposition cut are closed. Paused at the pre-decomposition boundary pending the preferred transform
  machinery. Pre-PRD.
- **Class:** `Heavy` (a real design was authored before extraction; scale is moderate).

---

## Problem / Motivation

Two CodeRabbit CLI attempts on a 10,867-line target returned typed `execution-timeout` with no findings and no
partial result. Investigating cost a second costly review rather than a log read. **A typed failure outcome with
no retained diagnostic is not actionable.**

### Two independent losses, not one

The originating capture described a single "evidence destroyed" failure. The adapter and its host actually lose the
evidence twice, by unrelated mechanisms, and the fixes are separable. Neither is quite what the capture assumed:

1. **In-process — output is discarded before disk is ever involved.** On the abort path the frontline execution
   adapter returns a `timed-out` outcome without ever assigning its process result. The mechanism is the
   signal-race helper wrapping each provider call: it rejects on abort ahead of the underlying process promise,
   discarding a result the process port would have delivered — that port runs non-rejecting under a cancel signal,
   so the partial stdout and stderr are buffered and available at the moment they are thrown away. Fixing this needs
   no port-contract change; the abort path must await the operation it currently races past. There is a second path
   that synthesizes empty stdout and stderr, but it is not a second instance of this loss: it is reached only when
   the process port rejects, which under a non-rejecting runner means a spawn failure — where no output exists to
   preserve. Recovering anything there would require the port-contract change this fix avoids, and there is nothing
   to recover.
2. **On-disk — the artifacts survive, but nothing records where.** The provider does not write into the checkout at
   all. It persists per-run state under its own directory in the user's home, which teardown never touches. The
   originating incident's run is still on disk — a run bucket holding the diff the provider saw, its incremental
   diff, and its internal analysis state, with zero findings recorded, at roughly 128 KB. What the ephemeral
   lifecycle destroys is not the evidence but the **correlation**: no record ties a pass to the bucket the provider
   wrote, so recovering it means scanning a directory that accumulates a bucket per run. The provider's own record
   even carries the ephemeral checkout path, so the key exists — it is simply legible only from inside the artifact
   you are trying to find.

Correcting the second reading shrinks that half of the work from an export-and-retain subsystem to a small copy at
teardown. It does not make the half unnecessary: the artifacts sit in a third-party tool's private directory, on an
undocumented layout, subject to that tool's own reaping. And fixing only the second would still not have explained
the originating incident, because the in-process loss discards provider output before disk is ever involved. Both
remain in scope.

### The second defect — registration leakage

The same lifecycle carries a defect that is independently annoying: every ephemeral review checkout is registered in
the repository's common Git directory, so it appears in `git worktree list` from every worktree until released.

On the frontline path this is one transient checkout per review, which on its own would justify little. The binding
case is the crash: teardown runs in a `finally`, and a killed process runs neither, leaving a registered worktree
that pollutes the primary's worktree list and needs an explicit `git worktree remove` to clear. Whatever isolation
this work unit picks has to survive a process that never gets to clean up after itself — that is the frontline
justification, and it stands alone.

Parallel review cycles make the same defect sharply worse, leaving several temporary checkouts visible alongside
real work units at once. That is the chunk-projection path's evidence and `chunk-scope-binding` owns it; it is
recorded here as corroboration, not as this work unit's reason.

### Success signal

The work succeeded when, after a frontline review returns an execution-backed non-success outcome, the developer
can read that pass's retained diagnostic — partial provider output plus the provider's own per-run record — without
re-running the review, and when an ARC-owned frontline checkout whose root remains available for cleanup does not
stay registered in the primary repository once its review has ended, including a review killed mid-run. A checkout
root deleted by an external actor before ARC can reap it remains an ordinary Git-prune condition rather than
grounds for a repository-wide prune here. Checkouts belonging to the chunk-projection path are outside this signal;
that surface is `chunk-scope-binding`'s.

## Resolved design decisions

- **Trigger — failure-only.** Preserve on outcomes where the provider actually executed and did not succeed:
  timeout, failure, and malformed-result parses. Exclude outcomes where nothing ran (unsupported capability,
  unbound source) — there is no execution to explain. Green runs produce artifacts nobody reads. No configuration
  surface: the policy is fixed, so there is nothing to expose.
- **Destination — a new namespace under the repository's Git common directory, keyed by head and pass.** The review
  gate already publishes its durable state there through a locked, atomically-replacing common-directory publisher
  with a fixed namespace set, so diagnostics become one more namespace rather than a second storage location. That
  inherits worktree-aware path resolution, advisory locking — which the ring buffer needs, since concurrent passes
  would otherwise race on eviction — and atomic replacement, and it scopes per repository by construction. Keying
  by head **and pass** is what makes two attempts on one target distinguishable, precisely the originating case
  where two timeouts were indistinguishable after the fact. Record the run's operation identifier alongside them:
  every other durable frontline record is keyed by it, it is what the run envelope hands the developer, and head
  plus pass alone is strictly coarser — two reviews of one head against different bases, or under different
  sources, would otherwise be indistinguishable in exactly the design meant to restore correlation. Never in the
  working tree, never committed, never carried by notes sync. What lands there is the pass's captured stdout and
  stderr, `internalState.json`, and the per-file finding payloads. Omit `git.json` and `incrementalDiff.json`: they
  dominate size with source material reconstructible from the retained head and base. The selected diagnostic
  outputs stand alone after collection, so reading them later depends on nothing the provider still holds.
  **Why persist at all,** rather than surface the diagnostic inline when the failure is reported: the provider's
  retained analysis and findings are a six-figure byte count of structured JSON, far past what a failure report can
  carry, and the outcome reaches the developer through a typed record read later rather than an attended terminal.
  Captured stdout and stderr alone would fit inline; the provider record is what forces storage.
  **Shape — one record holding the whole ring, not one record per diagnostic.** The publisher addresses records by
  name and offers neither listing nor deletion, so a ring spread across individually-named records could not evict
  without widening the publisher. A single record carrying the bounded entry list sidesteps that: its
  read-modify-write update path is ring semantics exactly, already serialized by the advisory lock and already
  atomic, so eviction needs no new publisher capability and no cross-record consistency story. Each entry embeds
  the pass's captured streams and selected provider files as string fields. Keep four entries, each capped at four
  mebibytes of serialized UTF-8. Cap stdout and stderr at 256 KiB apiece, retaining equal head and tail with an
  explicit omitted-byte marker. If the complete selected provider files still exceed the entry budget, preserve
  complete per-file finding payloads ahead of `internalState.json`, omit whole files until the serialized entry
  fits, and record each omitted path and byte count; never retain malformed partial JSON. Across 128 measured runs
  the selected provider set is 158 KB at the median, 875 KB at the 90th percentile, and 2.3 MB at the maximum, so
  the ordinary case stays well below the hard bound.
- **Retention — a four-entry per-repository ring buffer over failure diagnostics.** The oldest drops as a fifth
  failed pass lands. Four retains both attempts from the originating incident plus two adjacent failures without
  prepaying for historical analysis nobody has asked for. The entry cap bounds the serialized diagnostic record to
  roughly 16 MiB plus its small schema envelope. No clock, no reaping schedule, no sweep integration, and no growth
  for a surface to report.
- **Ownership — the adapter collects, and returns what it collected.** The adapter owns the process handles, so
  threading partial stdout and stderr into the timed-out outcome is its responsibility. It also owns the one piece
  of provider-specific knowledge the work needs — where that provider persists its artifacts — which must not
  escape into provider-neutral code. Both halves therefore land in the same place, and the existing call graph
  already sequences it correctly: the execution boundary awaits the adapter's return before the run command's
  `finally` releases the materialization, so an adapter that collects before returning is already collecting before
  teardown. No new provider capability, no ordering contract to state across two nested `finally` levels, and no
  second locus to make failure-tolerant.
  **Shape:** widen the adapter's existing execution result with an optional diagnostics field, alongside the
  outcome and executable identity it already returns. Do not attempt to carry a collection hook on the source
  descriptor — that value is parsed into a frozen strict object, canonically compared for identity, and hashed into
  the source binding, so it cannot hold a function.
  **Persistence:** `executeAndPersistFrontlineRun` already holds the exact generation-specific operation identifier
  when it awaits the adapter. Give its execution dependencies a diagnostics store and persist the optional
  diagnostic there before publishing the terminal outcome. Persisting in the command layer after
  `executeFrontlineRun` returns is too late: failed outcomes admit a fresh generation under a different identifier.
  **Failure tolerance:** the adapter guards collection and the policy layer guards persistence. Either failure
  degrades to a recorded absence and never propagates — an unsuccessful review must still return its outcome,
  publish its ordinary durable record, and tear down.
- **Trust boundary — inherited from the destination, and it needs no argument of its own.** The collected artifacts
  embed source excerpts and findings. Storing them under the repository's own Git common directory means the
  audience that can read a diagnostic is exactly the audience that can already read the source it was derived from,
  so the destination carries no exposure the repository does not carry already, and no permissions design is owed.
  Preserved diagnostics stay **local-only: never synced, never committed, never written to the working tree.** No
  claim is made here about temporary-directory permissions — the directories in question are created owner-only, so
  exposure was never the discriminator between destinations.

### Worktree registration isolation

**Reap the leak; do not relocate the registration.** The binding problem is the leaked checkout, not the live one.
A review that completes already cleans up; a killed one leaves a registered worktree behind because both cleanup
paths sit in a `finally` that a killed process never runs. So the fix is to make the _next_ materialization reap
what a previous one abandoned: read the repository-common ownership leases, drop any leased checkout that cannot
still be in use, then create the new one. Self-healing, and it stays inside the file that already owns the temporary
root, using the forced removal it already performs at teardown.

**Lease and liveness bound.** Reaping on the temp-path prefix alone would delete a concurrently running review's
checkout — frontline operations lock per operation, so two reviews of different targets can overlap. Before
`git worktree add`, write an entry to one locked repository-common materialization record with a minted lease
identifier, checkout path, owner process identifier, creation time, phase, and reap time. The `preparing` phase
stays live while its process exists and its conservative hard ceiling has not elapsed; that ceiling is the maximum
accepted frontline timeout plus kill slack from creation, not the ten-minute default. A normal dead-process result
therefore reaps a preparation crash promptly, while process-identifier reuse can delay cleanup only to the hard
ceiling.

When the bounded provider clock begins, have the execution boundary publish its exact absolute deadline through a
lifecycle callback; atomically replace the lease phase with `running` and its reap time with that deadline plus the
fixed process-kill slack. A running lease becomes removable only after that time. Reuse the existing
repository-common review sweep lock to serialize reap, registration, and normal release. The next materialization
examines only entries in the ownership record, never every path with a matching temporary prefix. For each expired
entry whose root still exists, force-remove the worktree registration, remove the temporary root, and delete the
lease; if cleanup fails, retain the lease so a later materialization retries it. A lease created before a failed
`worktree add` follows the same path, with an unregistered root requiring only directory removal.

Normal release follows the same ordering: remove the registration first, and remove the root and lease only after
that succeeds. This deliberately replaces the current unconditional root deletion after a failed
`git worktree remove`; retaining the root preserves the targeted cleanup handle for the next reap.

If an external actor has already deleted the leased root, remove the spent lease but do not invoke repository-wide
`git worktree prune`: that command cannot target the one registration and may remove unrelated missing worktrees.
The stale registration stays on Git's existing prune or administrator path. ARC's own normal lifecycle never
deletes the root without first removing the registration, so this exclusion preserves the killed-provider case
without adding a general worktree-repair subsystem.

**What this does not fix, deliberately.** A review checkout stays registered while its review is actually running.
That is visible in `git worktree list`, and session-init's sweep will classify it as externally managed and offer
manual removal to a session running elsewhere — noise, and a live checkout the developer is invited to delete. The
cost is real but small: the offer is a suggestion rather than an action, and the worst outcome is a failed review
that can be re-run. Buying transient invisibility means relocating the registration out of the primary, which costs
far more than the problem (see § Alternatives), and the case that would justify it belongs to the chunk-projection
path rather than this one.

Two supporting observations, recorded so they are not re-derived:

- **Checkout count is a parallelism choice, not a requirement.** The observed chunk checkouts all sat at one head
  with scope carried separately, so sequential review needs exactly one. Recorded as a bound on what the isolation
  has to support — not as a call for a concurrency control, which nothing has asked for on this path.

- **Dirty review scratch is indistinguishable from unsaved work, so cleanup escalates to the human.** Observed at a
  sibling work unit's integration: four chunk checkouts survived the merge, and the closing report surfaced them to
  the developer with a note that removal would require force-discarding staged and untracked content. That was the
  right call on the evidence available — but the content was entirely review projection of work that had just
  merged, so nothing was at risk and the developer had no decision to make. On the frontline path the lease-bounded
  reap sidesteps the judgment: a frontline temp checkout past the execution deadline is spent by construction, so
  its removal needs no adjudication. The general problem — telling reproducible scratch from real unsaved work —
  remains open wherever checkouts outlive a bounded deadline, which is the chunk-projection path's concern.

## Alternatives

- **Retain the ephemeral temporary root instead of exporting diagnostics.** Rejected because the provider's
  artifacts are not in the temporary root to begin with, so retaining it would preserve a checkout and none of the
  evidence. An exposure argument was originally offered alongside this and is withdrawn: the temporary root is
  created owner-only, so retaining it would not have widened who can read the source.
- **Record a pointer to the provider's own artifact bucket instead of copying it.** Cheaper still — nothing is
  duplicated — but rejected: it couples ARC to an undocumented third-party directory layout indefinitely, and
  breaks silently when that tool reorganizes or reaps its own state. A copy pays the coupling once, at collection
  time, after which the retained artifact stands alone.
- **Preserve on every outcome, whether as the default or as an opt-in.** Rejected in both forms. Green runs produce
  artifacts nobody reads, so an always-on default only consumes disk; and the opt-in that initially survived that
  rejection existed for comparative investigation against a green baseline, which nothing has asked for and which
  was the only thing in the design requiring a user-facing control surface. Failure-only needs no configuration at
  all.
- **Age-based retention, sized to support investigation days after the fact.** Rejected as unevidenced, and with it
  the count-based rejection it originally justified. The originating incident was investigated in the moment, by
  re-running the review; nothing has asked to read a diagnostic days later. The premise arrived with the extraction
  rather than being specified, and it was the sole upstream of an age policy, a retention default value, a reaping
  schedule, and a sweep integration — none of which the demonstrated need requires. Recorded rather than deleted so
  it is not re-derived: if cross-run pattern analysis (`why does this target keep timing out`) becomes a real need,
  this is the decision to revisit. The ring buffer already covers the incidental case where the run is still
  resident.
- **A per-user state root outside the repository.** Rejected. It would have been ARC's first out-of-repo write,
  needing platform-specific path resolution across four supported systems plus an explicit owner-only creation mode
  to sustain its own security argument — all to place one artifact class away from the subsystem whose other
  durable state already lives under the Git common directory. Conforming to the existing location costs nothing and
  dissolves both problems, along with the separate repository-identity key component it would have required.
- **Fix only the on-disk loss.** Rejected — it would not have explained the originating incident, because the
  in-process abort path discards provider output before disk is ever involved.
- **Relocate the registration by materializing inside a throwaway local clone.** Rejected. It buys only transient
  invisibility, and it breaks the surrounding contract in two independent ways, because the code materializes a
  checkout **and independently re-derives** the review target from inside it. Repository identity resolves through
  the checkout's own Git common directory, so a clone would mint a fresh identity per run; identity is part of the
  target preimage, and the run command canonically compares the re-derived target against the requested one, so
  every review would return a stale-target outcome and the provider would never execute. Base resolution requires a
  literal local branch ref for the base, which a clone maps into a remote-tracking namespace instead, so the
  ordinary head-on-branch-against-base case would fail to derive at all — and it would throw outside the run
  transaction, escaping as an untyped error rather than an outcome. Repairing both means either abandoning the
  independent re-derivation the code deliberately implements or splitting derivation from materialization, plus
  specifying a refspec. A hardlinking local clone was also assumed fast and cheap, which holds only when the
  temporary directory shares a filesystem with the repository; it commonly does not, and git then copies the whole
  object store. That is a large price for a problem the age-bounded reap solves at the leak.
- **A rule teaching the sweep to distinguish review scratch from real unsaved work.** Rejected as unnecessary on
  this path: a frontline temp checkout older than the execution deadline is spent by construction, so the reap
  needs no judgment about its contents. The general rule remains unwritten and unneeded here.

## Unknowns and Assumptions

- **Resolved — the destination is the existing Git-common-directory state location, not a new one.** The question
  was how a per-user state root would resolve across Windows, WSL, Linux, and macOS and at what permission mode.
  It does not arise: the review gate already publishes durable state under the repository's Git common directory,
  so diagnostics conform to that rather than introducing ARC's first out-of-repo write. Platform resolution and
  permission mode both disappear with it.
- **Resolved — the reap needs no _sweep-surface_ stamp, but it does need private ownership and lease state.**
  Extending the typed session-init sweep and its orientation rendering to recognize an ephemeral, reproducible
  checkout stays rejected. The materialization host owns the state and the next materialization consumes it.
  The state lives in one repository-common lease record: placing it only inside the temporary root would erase the
  ownership proof in the one exceptional case the reap cannot safely repair. An earlier revision claimed no marker
  at all was needed, reasoning that the execution deadline bounds liveness; the pre-boundary materialization window
  makes that false. Whether the chunk-projection surfaces want a sweep-visible stamp is that work's call; their
  checkouts outlive any single deadline, so nothing here transfers.

  The lease/reap mechanism is expected to add about 120–220 production lines and 180–320 test lines: roughly 35–60
  for the lease record, 40–80 for the ownership/liveness decision, 20–40 for orchestration, and 25–40 for cleanup
  and failure handling. Excluding absent-root repair avoids the additional targeted-prune subsystem.

### Resolved work-unit boundary

- **Decompose into two work units.** The diagnostics and checkout-reap legs share the frontline run command and
  repository-common state substrate, but they correct independent failures, are independently deliverable, and each
  warrants a work unit on its own. The mature design therefore becomes a `review-checkout-lifecycle` cohort with
  `review-failure-diagnostics` and `review-checkout-reaping` members, no semantic dependency edge, and the shared
  lifecycle/storage coordination held at the cohort. The exact cut map, source evidence, and pause/resume boundary
  are preserved in `notes-review-checkout-lifecycle.md`.

### Decisions closed by source grounding

- **Persistence locus — the generation loop's policy layer.** `executeAndPersistFrontlineRun` has the exact
  operation identifier when the adapter returns, so it persists there through an injected diagnostics store before
  publishing the terminal outcome. The command layer is too late because a retryable failure may already have
  advanced to another generation.
- **Collected subset — analysis state plus actual finding payloads.** Keep `internalState.json` and every per-file
  finding record; omit `git.json` and `incrementalDiff.json`. The latter two are reconstructible source payloads and
  dominate size. The per-file records are not expendable analysis cache: one inspected timed-out run held seven
  completed findings across three categories, while its internal state held 85 detailed summary ranges. Across 128
  runs the selected set measured 158 KB median / 875 KB p90 / 2.3 MB maximum, versus 676 KB / 3.3 MB / 8.6 MB for
  whole buckets.
- **Record shape — one bounded ring survives.** The selected subset makes its low-frequency rewrite tolerable, and
  the existing publisher has neither listing nor deletion. One record avoids widening that boundary solely to
  implement eviction.
- **Provider log — exclude until it is bindable.** The measured logs are only 253–1,357 bytes and do carry phase
  timing plus termination, but their filename UUID appears nowhere in the review store and their content carries no
  repository, working-directory, process, or run identifier. Concurrent provider runs make time-window matching
  unsafe across repositories. Do not guess; add the log only if a later provider version exposes a trustworthy
  correlation seam.
- **Collection compatibility — report absence, do not emulate old layouts.** The adapter pins one provider version.
  When its undocumented layout shifts, retain captured stdout and stderr, record that provider artifacts were
  unavailable, and do not build a multi-version compatibility shim. Collection or persistence failure must never
  fail the review or block cleanup.
- **Ref reachability and refspecs — moot.** Those questions existed only while materialization moved into a clone.
  Keeping the checkout in the primary preserves target derivation and the ref namespace unchanged.

## Composition / Coordination

- **`chunk-scope-binding` — should adopt the registration-isolation pattern.** It owns the chunk-projection
  machinery, where a parallel review cycle registers several temporary checkouts in the primary repository. This work
  unit settles the pattern and applies it to the frontline ephemeral checkout; applying it to chunk projections
  belongs there. No dependency edge in either direction — the pattern is legible from this draft.
- **`review-protocol-alignment` — the extraction source, sibling.** It retains the review protocol's content
  concerns; nothing here depends on them and nothing there depends on this. The two touch different files.

## Scope Estimate

Two moderate, independently deliverable implementation legs. The evidence leg spans the execution adapter,
provider collector, generation-loop policy layer, and one bounded Git-common-directory diagnostic record — no new
resolver, reaping schedule, sweep integration, configuration surface, or provider capability. The registration leg
adds one common-state lease record plus bounded reaping inside the materialization host and one execution-boundary
deadline callback, leaving target derivation untouched and declining absent-root repair. Their shared command and
state seams are coordination points, not yet evidence that the two legs need one delivery boundary.

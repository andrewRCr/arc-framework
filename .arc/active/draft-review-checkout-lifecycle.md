# Draft: review-checkout-lifecycle

- **Origin:** [internal] — extracted from `draft-review-protocol-alignment.md` (concern 3) at its 2026-07-26
  formalization-readiness read, where the concern proved orthogonal to that work unit's protocol-content subject.
- **Purpose:** Make a failed review leave usable evidence behind, and stop ephemeral review checkouts from
  registering themselves in the primary repository — two defects of one lifecycle, the ephemeral checkout the
  frontline review path materializes and tears down.

- **State:** maturing — direction settled and twice re-grounded against source; the retention and reap mechanics
  carry open decisions that two adversarial passes surfaced. Pre-PRD.
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

The work succeeded when, after a frontline review returns a non-success outcome, the developer can read that pass's
retained diagnostic — partial provider output plus the provider's own per-run record — without re-running the
review, and when no frontline review checkout remains registered in the primary repository once its review has
ended, including a review killed mid-run. Checkouts belonging to the chunk-projection path are outside this
signal; that surface is `chunk-scope-binding`'s.

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
  stderr plus a copy of the provider's own per-run record — self-contained, so reading it later depends on nothing
  the provider still holds.
  **Why persist at all,** rather than surface the diagnostic inline when the failure is reported: the provider's
  record is a six-figure byte count of structured JSON, far past what a failure report can carry, and the outcome
  reaches the developer through a typed record read later rather than an attended terminal. Captured stdout and
  stderr alone would fit inline; the provider record is what forces storage.
  **Shape — one record holding the whole ring, not one record per diagnostic.** The publisher addresses records by
  name and offers no listing operation, so a ring spread across individually-named records could not enumerate
  itself to evict. A single record carrying the bounded entry list sidesteps that: its read-modify-write update
  path is ring semantics exactly, already serialized by the advisory lock and already atomic, so eviction needs no
  new publisher capability and no cross-record consistency story. Each entry embeds the pass's captured streams and
  the copied provider files as string fields. Captured output is truncated to a per-entry bound with an explicit
  marker, so one pathological run cannot crowd the ring.
- **Retention — a per-repository ring buffer over failure diagnostics.** Keep the last N failed passes; the oldest
  drops as a new one lands. No clock, no reaping schedule, no sweep integration, and no growth for a surface to
  report — the structure cannot grow. At the observed artifact size a useful N costs single-digit megabytes, so
  retention is not the disk-management problem the pre-grounding design sized it against, and N is an
  implementation constant rather than a policy surface.
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
  **Failure tolerance:** the adapter guards its own collection. A collect that throws must degrade to a recorded
  absence, never propagate — an unsuccessful review must still return its outcome and still tear down.
- **Trust boundary — inherited from the destination, and it needs no argument of its own.** The collected artifacts
  embed source: the provider's per-run record contains the full diff it reviewed. Storing them under the
  repository's own Git common directory means the audience that can read a diagnostic is exactly the audience that
  can already read the source it was derived from, so the destination carries no exposure the repository does not
  carry already, and no permissions design is owed. Preserved diagnostics stay **local-only: never synced, never
  committed, never written to the working tree.** No claim is made here about temporary-directory permissions —
  the directories in question are created owner-only, so exposure was never the discriminator between destinations.

### Worktree registration isolation

**Reap the leak; do not relocate the registration.** The binding problem is the leaked checkout, not the live one.
A review that completes already cleans up; a killed one leaves a registered worktree behind because both cleanup
paths sit in a `finally` that a killed process never runs. So the fix is to make the _next_ materialization reap
what a previous one abandoned: enumerate worktrees, drop any frontline temp checkout that cannot still be in use,
then create the new one. Self-healing, and it stays inside the file that already owns the temporary root, using the
forced removal it already performs at teardown.

**Liveness bound.** Reaping on the temp-path prefix alone would delete a concurrently running review's checkout —
frontline operations lock per operation, so two reviews of different targets can overlap. Discriminate on age
against the execution deadline the carrier already enforces: the boundary aborts at its timeout and force-kills
shortly after, so a frontline temp root older than that deadline plus slack cannot belong to a live run, while a
live run's root cannot be that old. The bound derives from the existing timeout constant rather than introducing a
tunable of its own.

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
  merged, so nothing was at risk and the developer had no decision to make. On the frontline path the age-bounded
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
- **Resolved — the reap needs no _sweep-surface_ stamp, but it does need a private marker.** Extending the typed
  session-init sweep and its orientation rendering to recognize an ephemeral, reproducible checkout stays rejected.
  What replaces it is smaller and local: a marker the materialization host writes into the temporary root it
  already creates, read only by the next materialization. An earlier revision claimed no marker at all was needed,
  reasoning that the execution deadline bounds liveness — see the liveness decision below for why that is false.
  Whether the chunk-projection surfaces want a sweep-visible stamp is that work's call; their checkouts outlive any
  single deadline, so nothing here transfers.

### Open decisions

Four decisions remain, each surfaced by an adversarial pass against a settled-looking revision. The first three are
coupled through the collected subset; the fourth rides with them. All are design divergence rather than spec
detail: two competent engineers handed the draft as it stands would build materially different things.

- **Open — how the reap tells a live checkout from an abandoned one.** The execution timeout is a caller-supplied
  request field with a multi-week ceiling, not a fixed constant; the constant is only its default. A separate
  process cannot observe another run's requested timeout, so a threshold built on the constant would reap a live
  review started with a longer deadline — the natural response to the originating incident — and force-remove the
  directory the provider is running in. The existing code only derives its own analogous bound because it holds the
  request. **Proposed:** the materialization host writes the run's absolute deadline into the temporary root it
  creates, and the reap reads that rather than inferring one. This also has to answer the case where the root is
  gone but its registration survives, where there is no marker to read and forced removal fails.
- **Open — which component persists a collected diagnostic, and under which operation identifier.** The adapter
  collecting and returning is settled; nothing yet moves that value into storage. The execution port takes no
  arguments, and the operation identifier is minted inside the run's generation loop — where a single command
  invocation may execute under several identifiers, since the retained failure classes are exactly the ones that
  admit a fresh generation. Persisting after the run returns would therefore misattribute or drop entries.
  **Proposed:** a diagnostics store reached through the execution dependencies and written where the exact
  identifier is in hand, which also gives the write its own failure-tolerance boundary — one the earlier "no second
  locus" framing assumed away.
- **Open — what subset is collected, and whether one ring record survives it.** Measured across the provider's
  own store, a per-run artifact set runs to a median of 680 KB, a 90th percentile of 3.2 MB, and a maximum of
  8.4 MB; size tracks diff size, and the runs closest to the originating target sit in the 4–5 MB range. An earlier
  revision generalized from a 128 KB sample that turned out to be a run which died early — the least representative
  case. A single record holding the ring is read, parsed, re-escaped and rewritten whole on every failed pass, so
  the shape and the collected subset have to be settled together. **Proposed:** collect selectively rather than
  whole. Dropping the per-file analysis payloads takes the median to 183 KB; additionally dropping the stored copy
  of the diff — reconstructible, since the head and base commits are retained and present in the repository —
  reaches a 77 KB median against the provider's analysis state, which is where the confirmed diagnostic value sits.
  Neither step settles the record shape on its own: a ring of any useful depth is still large enough that one
  record per pass with directory-level eviction deserves comparison, which the host layer can do even though the
  record publisher exposes no listing operation.
- **Open — whether the provider's per-run log joins the collected set.** It carries phase timings and the
  termination event at roughly a kilobyte, answering "why did it stop" more directly than the analysis state does,
  and its correlation is the most fragile of the artifacts: its filename carries only a run identifier, with
  nothing tying it to a repository, head, or working directory. Cheap to collect in the same window with knowledge
  the adapter already holds; excluded so far only by omission.
- **Settled minimally — collection reports what it could not find, and nothing more.** Collection has to locate an
  undocumented third-party directory structure, and the adapter pins one provider CLI version today. When the
  layout shifts, record that the provider artifacts were unavailable and keep the captured stdout and stderr; do
  not build a compatibility shim across layout versions for a case that has not happened. A failed collect must
  never fail the review or block cleanup.
- **Moot — ref-reachability and refspec design.** Both were open only while materialization moved into a clone.
  Keeping the checkout in the primary preserves the current derivation contract untouched, so object reachability
  and ref-namespace mapping stop being this work unit's questions. Recorded because the reasoning is the same
  reasoning that rejected the clone, and it should not be re-derived if relocation is ever revisited.
- **Confirmed — the provider's retained record is diagnostic, and is the higher-value half.** The originating
  timeout's record carries completed per-file analysis for multiple files, a dozen detailed code-block ranges, and
  the target head among its reviewed commit ids. The run therefore reached substantive analysis before the deadline
  fired rather than stalling on the size of the diff — which is the explanation the incident went looking for, and
  it points at the return phase rather than the target. Collect the record whole: the value is in how far the run
  demonstrably got, which no subset of it preserves.

## Composition / Coordination

- **`chunk-scope-binding` — should adopt the registration-isolation pattern.** It owns the chunk-projection
  machinery, where a parallel review cycle registers several temporary checkouts in the primary repository. This work
  unit settles the pattern and applies it to the frontline ephemeral checkout; applying it to chunk projections
  belongs there. No dependency edge in either direction — the pattern is legible from this draft.
- **`review-protocol-alignment` — the extraction source, sibling.** It retains the review protocol's content
  concerns; nothing here depends on them and nothing there depends on this. The two touch different files.

## Scope Estimate

Medium, and materially smaller after grounding than at extraction. The execution adapter carries both halves of the
evidence work: awaiting the operation the abort path currently races past, and collecting the provider's record
before it returns. Storage is a new namespace on the existing Git-common-directory publisher holding one bounded
ring record — no new resolver, no reaping schedule, no sweep integration, no configuration surface, no new provider
capability. Registration leakage is an age-bounded reap inside the materialization host, leaving the current
worktree materialization and its derivation contract untouched. No unrun measurement sits on the critical path.

---
purpose: Drain the personal capture inbox to authoritative homes via a gated, phased pass — classify with no writes, confirm the routing plan, route to homes, and hand committed atomic execution to run-errand, leaving no un-triaged entries.
audience: agent
arc:
  methods:
    - route-discovered-work
    - assess-parallel-fit
---

# Workflow: Drain Inbox

Routing body for the `arc-housekeep` skill, and the shared logic the `session-handoff` between-WUs path
dispatches — one workflow, two doors. It reads the personal capture inbox (`USER-INBOX`) and, in a **gated,
phased** pass, classifies each entry, **confirms the routing plan before any write**, routes every entry to its
authoritative home, and hands any committed atomic execution to `run-errand` — leaving `USER-INBOX` with **no
un-triaged entries**.

The drain **routes**; routing is not execution. Writing a multi-step note into its stub _is_ routing — the
content moves inbox → stub in a single write. Atomic _execution_ is never run inside the drain: a committed
atomic is handed to the [`run-errand`][run-errand] lifecycle as an explicit, opt-in transition _after_ routing
(`arc-session` is the sole top-level execution entrypoint). See
[DEV-RULES.ARC § Discovered Work Routing][dev-rules-arc] for the capture-vs-execution boundary this mechanism
enforces.

**Mode/tier-agnostic spine.** The phases below are the routing spine; they do not vary by protection mode or
tier. Only the **write mechanics** differ by protection mode, and they are isolated to one block (§ 5) that
defers to [strategy-work-organization § Cheap-branch path][cheap-branch] / [§ Auto-Merge Lane][auto-lane] —
never scattered through the spine.

## When This Workflow Applies

- **Between work units** (the primary sweep) — the lowest-isolation-cost moment, when the base branch makes
  shared-planning writes native.
- **Mid-WU on demand** — invoked deliberately to clear accumulated captures without waiting for the next
  between-WUs boundary. The precondition below governs _where_ the drain may write, not _when_ it runs.

## Precondition: base-branch write context

The drain writes shared base-branch paths — stub edits, freshly scaffolded `provisional/` stubs, and homeless
flushes to the shared inbox. Those writes must originate from a **base-branch write context**, never a work-unit
worktree's branch, or they land on the wrong branch and tangle an unrelated WU's PR with grooming.

This is a **machine-checked guard, not prose discipline**. Resolve the write context first:

```bash
arc housekeep check --json
```

The check resolves the current worktree path, the current branch, the configured base branch (`branch.base`),
and `branchProtection` (`full` or `partial`) — the same context `arc errand check` resolves — and classifies the
invocation:

- **Base-branch write context** → proceed to the drain steps. Under full protection, § 5 relocates onto a
  short-lived grooming branch cut from here before any shared-path write — the base context is the fork
  point, not the write target.
- **Work-unit branch** → **refuse and offer to relocate**: hop to a base-branch write context, run the sweep
  there, and return. The relocation mechanics follow protection mode — see
  [strategy-work-organization § Cheap-branch path][cheap-branch] and [§ Branch Protection Modes][branch-modes].
  Launching from any worktree is not a blocker; only _writing_ shared paths from a WU branch is.
- **Degenerate context** (detached HEAD, or no resolvable base) → **safe refusal**, never a silent write.

The guard is **guidance keyed on write context, not a gate on having an active WU**: the precondition is a
base-branch write context, _not_ "no active work unit." Housekeep is therefore invokable mid-WU — hop to the
primary worktree, sweep as a batched errand, and return. Let captures stack before a mid-WU sweep rather than
thrashing the drain per item.

## Drain steps

The drain is **gated and phased**: classify with no writes, **stop at the confirmation interlock**, then route,
then optionally transition to execution. The interlock is unconditional — the drain never routes straight from
classification.

### 1. Read the inbox

Read `USER-INBOX` in full — both `§ Errand` (errand-class captures) and `§ Work Unit` (spec-worthy captures).
These are the entries to route; the shared inbox (`ATOMIC-INBOX`) is a _destination_, not a source.

### 2. First-pass classification — no writes

Classify every entry against the **logical model** — _entry · character · home_ — not its markdown shape, so a
later structured-record swap leaves the routing intact. This pass **makes no writes**; it produces the routing
plan the interlock (§ 3) confirms. Resolve, per entry:

**Method fire-point** · [route-discovered-work][route-discovered-work], for each capture:

```yaml
route-discovered-work:
  entry: each capture, with its WU_Target and _Shapes_ when present
  door: drain, routing a capture
```

For held entries in a backlog stub picked at § 3, run the same method at this re-triage fire-point:

```yaml
route-discovered-work:
  entry: each held entry in the picked backlog stub
  door: drain, re-triaging a backlog stub
  host: the picked backlog stub
```

- **Disposition and home.** Use the method's ordered gate and homing: verify against the current tree, re-assess
  the record floor regardless of capture-time character, and validate coupling and scope boundaries. `WU_Target`
  is the first candidate to check, never a destination decided by existence. Retain any unclear Errand pair with
  all four record answers for the Owner at § 3.
- **In-flight target adoption.** Only a gated `hold` into a started work unit takes the method binding's
  owner-adoption route. Leave it in `USER-INBOX` with `_Hold: true`, re-stamp `_Created:` to the adoption date,
  and carry the target and `_Shapes:_` for its owning session. Surface the handoff or the binding's named wait at
  § 3; never write to the base branch's stale backlog copy. A failed or ambiguous status lookup stops with its
  diagnostic, never with a checkout-local path guess.
- **Group by concern.** Consolidate `new-stub` outcomes sharing one logical concern into one stub, and propose the
  grouping with its rationale. Entry count alone never establishes concern identity.
- **Commitment (new stubs).** Propose `provisional` unless the Owner commits to sequencing the work unit at § 3,
  which warrants `planned`. Commitment is distinct from maturity; the Owner decides.
- **Execute-now bias.** For an `errand` outcome, prefer execute-now when it is a quick win cheaper than routing
  plus a later session. If this session cannot carry it, defer or propose fresh-session execution through § 6.
- **Atomic disposition.** An `errand` outcome takes execute-now or defer; retain remains the Owner's escape hatch.
  Carry the disposition to § 5 or § 6.
- **Destination-path overlap (advisory).** After destinations resolve and **before** the § 3 confirmation
  interlock, collect the write paths the plan will touch (backlog stub drafts, shared inbox, errand targets when
  execute-now). Run the existing overlap read over those paths:

  ```bash
  arc errand check --target <path>... --json
  ```

  Apply [`assess-parallel-fit`][assess-parallel-fit] (overlap read only — no design-load). Include any shared-
  surface advisory in the routing plan presented at § 3 so sequencing and coordination are visible **before**
  edits land. **Non-gating:** never block the drain on overlap; surface and let the operator reorder, retain, or
  proceed. Do not build a second overlap oracle.

### 3. Confirmation interlock

> [!IMPORTANT]
> `workflow-interlock`: Stop before any write. Present the full routing plan — each concern's outcome or unclear
> Errand pair with its four record answers, `_Shapes:_` for each fold or hold, the coupled target's CLI horizon
> advisory verbatim, and any wait named by the binding. Include groupings, new-stub commitment levels, owner-adoption
> handoffs, atomic dispositions, destination-path overlap advisories, and any split plan (§ 4). Await explicit
> confirmation before routing (§ 5).

For each routed-into backlog stub already holding entries, show one line with its held count, oldest entry's date,
and an offer to re-triage it this sweep. The Owner picks targets; return their held entries to § 2's re-triage
fire-point, with the picked stub as `host`, and present the revised routing plan at this same stop before any write.

The Owner may adjust proposals within the method's door and writer bounds: regroup, change a commitment level,
choose an unclear pair, flip an Errand between execute-now and defer, or retain an entry. A confirmed plan also
confirms each named wait; it never licenses another writer or a write to a stale backlog copy.

### 4. Split if the sweep is large

Default a single routing batch. When the confirmed plan exceeds **one reviewable batch**, split by
**concern-coherence + review-reachability** — split only when one unit would exceed a reviewer's reach. The split
shape follows protection mode (§ 5): under full, one auto-merge PR per lane; under partial, coherent commit
boundaries (there are no routing PRs to split). Surface the split plan at the interlock; never silently truncate.

### 5. Route — write to homes

Carry out each confirmed concern's outcome. For a capture, routing **moves** its source out of `USER-INBOX`:
complete every split concern's route before removing the original entry, and keep any retained or execute-bound
residual rewritten in place. For a fully routed capture,
`arc user inbox-remove <entry-title>` drops it (matched on the title in v1; idempotent); use
`--inbox-entry-file <path>` (`-` reads stdin) for Markdown- or shell-active titles. Pair the removal with its
routing writes. Held entries in a picked stub take the re-triage routes below instead of inbox removal.

- **Existing-stub home** — a gated `fold` or `hold` into a backlog stub's `draft-*`. Follow the method's integration
  modes: the drain folds only a trivially additive, on-topic note; otherwise append the entry to the draft's
  `## Inbound Buffer — Pending Integration` section, with `routed from <origin>, <date>` and `_Shapes:_`. Create
  the section after Origin/Purpose, set off by `---`, when absent. The owner folds or dispositions every held entry
  before the draft is ready, at drafting's readiness exit and spec entry; the drain never performs that owner's pass.
- **In-flight owner adoption** — only a gated `hold` into a started target. Make no routing write; set `_Hold: true`,
  re-stamp `_Created:` to the adoption date, and keep the target and `_Shapes:_` in the capture for its owning session.
  Follow the method binding's named gap for another person's started target, with the wait confirmed at § 3.
  Never append to the base branch's stale backlog copy.
- **New stub** — carry out a `new-stub` outcome, or one grouped set sharing a concern, through `arc stub` at the
  confirmed commitment level. Always write a `draft-*` beside the meta, carrying the concern and opening with a
  one-sentence Purpose; name it through `arc stub --design`. A provisional stub carries no design authority.
- **Homeless atomic — defer** — every deferred `errand` outcome takes this route; an Errand-shaped concern has no
  work-unit home. Flush it to the shared inbox (`ATOMIC-INBOX` under `pm.mode: arc-in-git`; the project's convention
  otherwise), which is atomic-only.
- **Retain (escape-hatch)** — an atomic the user explicitly keeps in `USER-INBOX` (private-until-vetted, or
  imminent self-execution). **Never the default, never agent-suggested.** Set the managed field _Hold:_ to
  `true` and **re-stamp** _Created:_ to the retain date (both values backtick-delimited per the managed-field
  grammar), so the reminder floor (never same-day) applies from now. A retained entry is _triaged_ — it does not
  count toward `inboxState.housekeepNeeded`, and the reminder sweep keeps it from rotting.
- **Execute-now atomic** — held aside here; executed in § 6, not written by the drain.

**Picked-stub re-triage.** Carry out the confirmed outcomes in the drain's grooming change:

- `dismiss` removes the held entry.
- `hold <other>` moves it to another backlog stub's draft with provenance and `_Shapes:_`. For a started target,
  follow the method binding's in-flight new-home rule: the runner's own target takes a pre-routed `_Hold` capture
  for owner adoption after removal here; another person's target waits, rewritten here as `hold <host>` naming
  the decided destination.
- `new-stub` takes the new-stub route above and removes the old entry.
- `errand` takes the homeless-atomic route and removes the old entry.
- `hold <host>` keeps the entry, or rewrites only the residual of a split in place.

Record what moved where in the grooming PR body under full protection or the commit message under partial,
never as a dispositions table in the target's draft.

**Write mechanics (protection-mode block).** This is the only mode-dependent step; it defers to
[§ Cheap-branch path][cheap-branch] / [§ Auto-Merge Lane][auto-lane]:

- **Fully protected** — **relocate first, then write.** Before any routing write, `arc errand open <slug>`
  cuts the short-lived grooming branch `chore/<slug>` off the configured base branch and occupies it in place
  (folding cut→occupy, as [run-errand][run-errand] § Launch step 3 does), so the routing writes never land on
  the launch branch; idempotent — re-running reuses an existing branch. The base context the precondition
  established is the fork point, not the write target: full protection forbids committing the shared paths to
  the base branch itself. The planning-routing writes (existing-stub edits, new provisional stubs, the
  homeless-atomic flush) are then **one coherent concern** and batch into a **single auto-merge PR** per lane
  off that branch (split per § 4 if large). Open it with a **lean grooming-PR body** — a one-line Summary
  plus the § 3 routing plan (what routed where); no Spec / Out-of-Scope / Follow-Up sections, mirroring
  [run-errand][run-errand] § Ship step 3.

  Before creating each routing PR, invoke `arc review planning-grooming resolve -` with its exact base ref,
  diff-base SHA, head SHA, and only the caller-owned content kind, risk, determinacy, ownership, and surface
  authority judgments. The command derives repository identity, immutable target trees, planning-lane eligibility,
  transient assurance, method activity, and the standard-review obligation. Follow its typed result:

    - `exempt / none` — skip both review lanes and continue to PR creation.
    - `review-required / continue-review` — reuse its exact target, routing, and obligation payload in the
      reviewed-lane settlement from [run-errand][run-errand]; do not retype those projections.
    - `not-eligible / continue-review` — enter that reviewed-lane settlement through ordinary fact composition.
    - A command error carries no action; stop.

  Never infer exemption from `arc review planning-lane`, path intuition, or absence of a work unit. The later
  planning-lane call still classifies merge presentation only. Immediately before creating the PR, invoke
  `arc merge lock resolve -` with
  the exact tree root and create on its typed action: `locked / open-locked` opens the PR locked, `none /
  open-plain` opens it plain, and `blocked / stop` halts creation before any PR exists. A write touching a
  **foreign owner's** artifact is reviewed-lane and ships on its own.

  On both newly-created and reused-open paths, recompose the PR's exact current base ref, diff-base SHA, and head
  SHA, then re-invoke `arc review planning-grooming resolve -` with the same caller-owned judgments. This
  opened-target result supersedes the pre-create result; follow the typed dispatch above and settle any ordinary
  review it requires. Any head movement invalidates the exemption and returns here before the integration
  interlock, including after a review fix or base reconciliation. Continue only when the current PR head, adapter
  target, and settled review all name the same exact head.

  > [!IMPORTANT]
  > `integration-interlock`: Stop before arming auto-merge or merging the grooming PR. Surface PR status
  > (exact settled head, matching adapter target, checks, resolved lane) and await explicit integration approval —
  > never infer it from the § 3 routing confirmation, which approved the _routing_, not the merge.

  After approval, re-read the PR's exact base and head SHAs. If the head differs from the adapter target surfaced
  at the interlock, invalidate approval and return to the opened-target adapter resolution and integration
  interlock. Otherwise run `arc review planning-lane <base-sha> <head-sha>`. Only literal `planning` permits arming
  auto-merge; `reviewed` follows the reviewed-lane settlement in [`run-errand`][run-errand], while command failure
  or malformed output stops. Foreign ownership or another confidently recognized review condition may still move
  a planning result to reviewed without another permission stop, but never the reverse. For a literal `planning`
  result, invoke `arc review merge-method resolve` and continue only from `validated / use-method`. Retain the
  returned `method` as the sole merge-method input; `blocked / stop` stops with the lock still held. Immediately
  before arming, invoke
  `arc merge lock release -` for the exact target — as on the errand grooming lane, auto-merge cannot be armed on a
  locked PR. `released / proceed` and `no-lock / none` both continue by invoking
  `gh pr merge <pr-number> --auto --<method> --match-head-commit <head-sha>` with that exact returned method and the
  release payload's head; `blocked / stop` invalidates approval.

  **A released PR is not a head-authorized PR.** Draft is a property of the pull request rather than of a commit,
  so the release says the lock came off — never that it came off for one head. Both continuing actions carry the
  exact `headSha` in their payload, and the grooming lane's arming matches that head explicitly: a head arriving
  after the release inherits nothing. Every way out of the released window that is not armed auto-merge re-locks
  first, per that lane.
- **Partially protected** — every routing write is a **direct base-branch commit** with no PR or merge-wait;
  keep coherent commit boundaries (the § 4 split shape). No lanes, no review-chunking.

### 6. Execution transition — committed atomics → `run-errand`

Persist the complete execute-bound set once before dispatch. Invoke
`arc user inbox-mark-execute-bound <file | ->` with every already-marked and newly approved Errand title in its
final file order:

```json
{"schemaVersion":1,"orderedTitles":["First exact inner bold title","Second exact inner bold title"]}
```

Continue only from `applied | unchanged / none`; `invalid-input / correct-input` corrects and retries the request,
while `refused / stop` surfaces the diagnostic and halts before any Errand opens. The verb owns the identity-global
notes lock, exact-title validation, all-or-nothing marking, and physical ordering — never add or reorder
`_Disposition:_` fields by hand.

For each **execute-now** atomic, hand off to the [`run-errand`][run-errand] lifecycle — the drain never executes
atomic work itself. The atomic's `USER-INBOX` entry is the errand's **originating capture**: pass it to
`run-errand` so `arc errand open` mints an `inbox`-origin record, using `--from-inbox <entry-title>` or
`--inbox-entry-file <path>` / `--inbox-entry-file -` for a shell-active title. The entry drops at the errand's
`close` off that back-pointer rather than being orphaned. Two explicit paths, the user's choice by context budget
(never a structural gate):

- **Same session** — transition into `run-errand`, then **return here for the next**. Run the committed atomics
  **one at a time, sequentially** (batch only when they are genuinely one concern). `run-errand`'s Launch
  resolves and relocates its own execution locus off the base via the shared write-context primitive (the same
  `arc housekeep check` resolution this drain used); the isolation shape — a separate worktree where spawning is
  available, otherwise an in-place `chore/<slug>` branch in the primary base checkout — follows protection mode
  and worktree availability (see `run-errand`). Either way the errand never executes on the drain's launching
  branch, and control returns to the base context after each. No dependency on having entered through
  session-init's errand arm.
- **Fresh session** — leave the execute-now atomics in place and resume each via `arc-session --errand` later;
  the drain still closes (§ 7) with those entries triaged-but-pending.

**The drain does not block on merges.** `run-errand` commits and opens/arms the PR, but the `USER-INBOX` line
the errand record back-points to is removed at the errand's **completion** (merge) — asynchronous on the
auto-merge lane, review-gated on the reviewed lane. So a dispatched atomic's line legitimately lingers; session-init's
in-flight-errand sweep is the backstop against orphaning (an abandoned errand keeps both its line and its pushed
branch — both swept). On an _unattended_ merge (auto-merge lane), `run-errand`'s completion does not fire
in-session; teardown and line-removal are replayed from base context by the same-session finalize pass or, next
session, by this sweep — idempotent backstops to the authoritative removal in [`run-errand`][run-errand]
§ Complete.

### 7. Confirm the drain is complete

The drain **closes on dispositions, not on a physically empty file.** Verify every entry has a terminal
disposition — **routed** / **dismissed** / **flushed** (line removed with the write), **retained** (`_Hold:_`,
line stays), **owner-adoption** (live target; line stays for its owning session), or **execute-bound** (dispatched
in-flight, or pending a fresh `--errand` — line stays until the errand completes). No entry is left
**un-triaged**. The lines that remain are only the retained, owner-adoption, and execute-bound entries; their async
tail is owned by the target's session or by `run-errand` plus session-init's in-flight sweep, not the drain. Report
what routed where, which entries were retained or handed to live owners, and which errands are in flight. Surface
shared-inbox (`ATOMIC-INBOX`) aging as an advisory while there — reminder nudges for personal captures and
in-flight-errand staleness belong to session-init orientation, not the drain.

---

[run-errand]: run-errand.md
[route-discovered-work]: ../../../methods/route-discovered-work.md
[assess-parallel-fit]: ../../../methods/assess-parallel-fit.md
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
[cheap-branch]: ../../../../reference/strategies/arc/strategy-work-organization.md#cheap-branch-path
[branch-modes]: ../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[auto-lane]: ../../../../reference/strategies/arc/strategy-work-organization.md#auto-merge-lane

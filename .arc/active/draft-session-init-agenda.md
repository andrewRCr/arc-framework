# Draft: Session-Init Agenda

- **Origin:** [internal] — the Gate B session-init overhaul (`RELEASE-GATES.md` § `gate-b-public-visibility`, Must),
  carved by the Owner on 2026-10-31 as its own work unit: the session-init slice of `composable-workflows`' D3 with
  `loadset-composition`'s always-loaded trims. The PM brief that seeded it lives in this unit's SESSION-NOTES.
- **Purpose:** Make the CLI decide what a starting session reads and how it orients, so an agent reads a short spine
  plus the one arm it is on instead of every arm of `session-init.md`, and cut the always-loaded set's no-longer-needed
  text, measured against the done-signal below.
- **State:** formalization-ready — consolidated 2026-10-31. Three review passes and an author parity sweep found gaps,
  all folded the same day; the third pass, over the cap, found eight minor ones, and three fix-check rounds over their
  folds, the last with no material finding, closed the review loop. Every fork the Owner was asked is decided
  (§ Decision log); two small items remain open (§ Open), neither a design decision.

---

## Problem / Motivation

A new session reads the whole of `session-init.md` before it says anything, and every arm of it — branch-gone
recovery, four signal arms, cold-start, materialize, three sync channels, some thirty conditional orientation
surfaces — whether or not it applies. The workflow is the largest single item in the first-prompt load, and it grows
by three always-read costs per new probe surface (a slot description, dispatch prose, a rendering rule). An agent can
also trip over the instructions straight away: the Owner names this the project's most visible wart for a public
beta.

**Baseline (2026-10-31, bytes ÷ 4; a rough proxy — dense table cells tokenize worse than prose).**

| Item before the first user-facing line         | Fresh install     | This repository   |
| ---------------------------------------------- | ----------------- | ----------------- |
| `session-init.md`                              | 73.6 KB           | 73.6 KB           |
| `AGENT-BRIEF.ARC`                              | 9.9 KB            | 9.9 KB            |
| `DEV-RULES.ARC`                                | 33.9 KB           | 33.9 KB           |
| `DEV-RULES.PROJECT`                            | 5.1 KB            | 24.3 KB           |
| `STRATEGY-INDEX`                               | 5.7 KB            | 7.2 KB            |
| `AGENT-BRIEF.PROJECT`                          | 2.0 KB            | 1.8 KB            |
| `QUICK-REFERENCE` § Environment & Path Context | 1.3 KB            | 1.4 KB            |
| `WORKING-MEMORY`                               | absent            | 20.6 KB           |
| `arc status --session-init --json` envelope    | ~12 KB            | 42.6 KB           |
| `arc-session` skill text                       | 3.0 KB            | 3.0 KB            |
| **Total**                                      | **~147 KB ≈ 37k** | **~218 KB ≈ 55k** |

The six always-read documents (`AGENT-BRIEF.ARC` to `QUICK-REFERENCE`) are 58.0 KB fresh and 78.4 KB here; the
universal reads add WORKING-MEMORY where an identity resolves (§ What the compiler emits per entering row).
The table stops before any arm-specific workflow; a resume adds its lifecycle workflow, meta, and SESSION-NOTES
(26.6 KB for this session's `draft-design` resume).

**Where `session-init.md`'s bytes sit.** Step 2 (dispatch and sync) 25.2 KB and Step 5 (orientation) 25.6 KB are 69%
of the file; Step 3 (load) 10.4 KB, Steps 1/4/6 together 11.2 KB. Most of Steps 2 and 5 is dispatch over slots whose
text the CLI already composes — `inferSessionInitRecommendations` builds each channel's `recommendedPromptText` and
the `recommendedCombinedPrompt`, `composeBaseDriftRegister` the base-drift text, `deriveDerivedLocusSessionGuidance`
the locus narration, `readDeliveryPositionView` the delivery line — so the prose restates conditions and then says
"render the CLI's text verbatim". A plain resume (this session) acted on Step 1, the sync channels (all `skip` but one
`surface`), Step 3's load set, and one Step 5 surface: well under a fifth of the file.

**The envelope is a lever here too.** In this repository the envelope is 42.6 KB, larger than any single document but
`DEV-RULES.ARC`; `derivedLocusState.value.roster` repeats the full `context.loadSet` of every registered checkout that
resolves a context (13 of 24 rows, and 32.9 KB of a 45.5 KB envelope, on a later 2026-10-31 read).

## Inputs and what other work owns

- **`draft-composable-workflows.md`** — D3 (the step vocabulary v1 this unit uses; invocation by signals; recompile;
  `offer` encoding, departing where § Agenda contract's choices and § Methods' `discover-next-work` say), § Worked
  example (hand-compiling session-init), and its session-init inbound items (§ Inbound dispositions). Its D1 and D2 in
  general follow after the deadline. Cited, not edited from this branch.
- **`draft-loadset-composition.md`** — § Working Framing's decision rule: demote only to an explicit trigger, never to
  implicit awareness, and never demote a constraint.
- **`analysis-load-set-scoping.md`** — the demotion precondition and its unresolved irrelevance defect, the
  unsafe-versus-pointless distinction, the `QUICK-REFERENCE` / `AGENT-BRIEF.PROJECT` mutual exclusion, the comparator
  constraints, and that init and recovery are not parity-identical consumers.
- **Neighbours** (overlap mapped 2026-10-31): `instruction-optimization` defers its agenda work to D3 (its items are
  dispositioned below); `operational-advisory-registers` owns the advisory register vocabulary and cadence;
  `cli-output-contract` co-owns the `render` / `offer` argument types after the cutover (its live draft is on
  `plan/cli-output-contract`, ahead of the backlog copy); `orientation-surface-compression` and `rules-restructure` own
  the design tier inside the always-loaded documents; `session-init-performance` owns probe speed in the same
  `handlers/status.ts`; `session-roles` and `stub-mint-to-launch` later consume agenda arms.

## Goals and done-signal

Two parts, each a reduction against a baseline measured by the same instruments before the build starts (Owner,
2026-10-31; restated the same day from absolute bytes-over-four figures, which a metered read puts about 60% higher for
`session-init.md` — the planning review's first pass):

1. the session-init text an agent reads at init — the spine, `read-load-set`, and the method of the arm it enters, if
   any — falls to at most ~28% of today's `session-init.md` (the original ~5k-of-~18k target);
2. a fresh install's load before the first user-facing line, less an empty session's load on the same harness, falls
   to at most ~60% of its baseline (the original ~22k-of-~37k target).

**Measured both ways**, baseline and result by the same instruments. Itemized: headless Claude Code runs
(`claude -p --output-format json`), each reading one item, their reported input-token usage compared against an
empty run — the real tokenizer, the Read tool's formatting included, and no API key needed on a subscription (the
usage field to be confirmed at first use). End to end: one real session on a fresh install from the rehearsal kit
(`cinexplorer-migration/kit/`), read through the harness's context report before the first line, less the same
report for an empty session.

The brief's strawman (a fresh start under ~10k) is out of reach by selection and cheap cuts: the rule and vocabulary
text that stays always-loaded is ~10.5k on its own, and cutting it is placement design `rules-restructure` and
`orientation-surface-compression` own (§ Evidence). With the cheap tier, a fresh start lands near ~20k (the six
documents ~50 KB, spine plus `read-load-set` plus an arm method ~16.5–20 KB at the spine's budget, envelope-sized
agenda output ~12 KB, skill ~0.5 KB).

## Design

### Shape

A dedicated verb compiles an **agenda** — an ordered list of typed steps — from the same state the probe reads;
`session-init.md` becomes a **spine** that says how to execute each step type and how to orient; each arm that needs
agent judgment becomes a **method** the agenda names. The CLI never injects content: a `fragment` step is the agent
loading a declared method, or an existing workflow at a path the CLI derives from the subject, as recovery maps a
transient subject to its workflow (`transientWorkflow`) and appends that path to the load set
(`appendRecoveryWorkflow`) — the `loadSet` model extended — or names for an arm, as cold-start's
`in-flight-scope-check`.

| Today (`session-init.md` at `9eea962ce5`)          | Becomes                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| Step 1 frame resolution, unavailable / unresolved  | `render` the `locusGuidance` text, then `gate stop`                       |
| Step 2 branch-gone recovery                        | `exec` / `offer` / `render` from the `recovery` slot and worktree list    |
| Step 2 signal spine (`--errand`, `--housekeep`,    | the CLI selects from signals; `fragment` = the owning workflow            |
| `--plan`), transient resume arms                   | (`run-errand`, `drain-inbox`, `draft-design`) with its arguments          |
| Step 2 `--start` focused recon                     | `fragment` (a method), consuming the CLI facts that exist                 |
| Step 2 cold-start, materialize                     | cold-start: `fragment` (scope check), then `offer`; accept                |
|                                                    | → `exec`, then recompile; materialize: `offer`, accept → `exec`,          |
|                                                    | then recompile in place or hand off                                       |
| Step 2 sync channels, base-branch sync, notes load | `exec` / `offer` steps: the channel's `recommendedPromptText` where one   |
|                                                    | exists; the compiler composes every argv and the notes-load text          |
|                                                    | (§ The cutover module)                                                    |
| Step 3 load list and read rules                    | `read` steps (the `loadSet`), executed by the shared read-contract method |
| Step 4 freshness                                   | CLI-computed from SESSION-NOTES; a `note` step only when a gap exists     |
| Step 4 next-work discovery                         | `fragment` (a method): discovery, parallel-fit, seed pre-focus            |
| Step 5 orientation format                          | spine (agent-composed lines: Last completed, Current task, Blockers)      |
| Step 5 conditional surfaces                        | `render` / `note` steps carrying CLI-composed lines, in order             |
| Step 6 mismatch handling                           | spine (judgment)                                                          |

### The agenda verb

`arc agenda session-init` (Owner, 2026-10-31) takes the skill's signals as flags — the positional seed, `--plan`,
`--errand`, `--next`, `--isolate`, `--start`, `--housekeep`, and `--context` — and prints the agenda. It is built in
its own module beside the probe composer, reusing the slot readers `runSessionInitStatus` calls.

- **Precedence and flag validity** keep today's order: the rows that stop at once (an unavailable or unresolved locus, a
  contextless work unit that is not a husk), then branch-gone recovery, then a signal (`--errand`, `--housekeep`,
  `--plan`, `--context`), then `--start`, then the entry rows, with `--next` the resume row's terminal shortcut. A
  `--start` or `--next` the winning row does not consume becomes a `note`, as an unconsumed seed does. Two signals at
  once, `--errand --next` with a seed, and `--isolate` without `--errand` refuse with a typed error.

- **What it prints:** the ceremony, the accumulated signals, a `recompile` argv that re-invokes the verb with them, the
  residual judgment inputs the spine and rules read (`config`, `releaseRouting`, `domainRules`, and `inboxState`, at the
  same field paths the envelope uses; `domainRules.warnings` also become a `note`), and `steps`. The spine always
  invokes it with `--json`, so one output form carries the agenda; without the flag it prints the same agenda for a
  person to read, as `arc status` and `arc plan check` do. Its schema registers beside `session-init-envelope` in
  `SESSION_ENVELOPE_SCHEMAS`, which `registerSessionEnvelopeSchemas` adds to `createProductionSchemaRegistry()`, and the
  spine cites `arc schema get` rather than restating shapes.
- **What it writes:** nothing. Like the probe it is non-destructive (`strategy-session-operations.md` § Probe
  pattern), so compiling, recompiling, or running it by hand to inspect an agenda changes no state. The once-per-day
  nudge markers (compaction advisory, Errand reminder, stale in-flight) stay agent-written: the `render` or `note` step
  that surfaces each carries the marker's path and value, and the agent writes it after the orientation carrying that
  step is emitted, as today.
- **What stays:** `arc status --session-init --json` remains the full read for the PreCompact seed hook, recovery's
  state basis, `init-work-unit`'s inbox backstop when no agenda is held, and diagnosis.
- **`--context`** (Owner, 2026-10-31, from `instruction-optimization`'s inbound): universal reads, the checkout
  `render`s, and `gate stop`, with no discovery and no work-unit artifact or surface, even on a Resume checkout — the
  steering-session entry `session-roles` would later generalize, built as one signal.

### Agenda contract (draft depth; exact types at spec)

| Step       | Payload                                              | Agent does                                             |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------ |
| `read`     | path, `readMode`, `group`; cursor anchors on a       | reads it; one tool message per group                   |
|            | `partial-strategic` read                             |                                                        |
| `exec`     | an ordered list of `SessionAction`s (each an `argv`, | runs each argv there, in order; on `handoff`, relays   |
|            | optional `checkout`); `recompile` or `handoff`       | its result text and stops                              |
| `offer`    | `id`, precomposed `text`, closed `choices` (`label`; | shows text and choices, recommends with a reason, runs |
|            | no payload, actions, a signal with its compile-known | the chosen actions in order or asks for the `elicit`   |
|            | value, or an `elicit` signal with an optional        | value; decline is always a choice                      |
|            | carried value; `recompile` or `handoff`)             |                                                        |
| `fragment` | declared method name or CLI-resolved workflow path,  | loads it and follows it with the arguments             |
|            | named arguments                                      |                                                        |
| `render`   | surface id, CLI-composed text, optional marker       | emits the text verbatim, once, in order; writes any    |
|            |                                                      | marker once the orientation is emitted                 |
| `note`     | text, optional register, optional marker             | carries it into orientation's advisory lines; writes   |
|            |                                                      | any marker once the orientation is emitted             |
| `gate`     | kind (`proceed`, `launch`, `stop`), `autoProceed`    | ends: prompts, auto-proceeds, or awaits direction      |

- **Emission order is execution order.** The compiler sequences sync operations before the reads that depend on them;
  no `after` fields (`composable-workflows` § Worked example, finding 3).
- **Actions and choices** depart from D3's `offer` encoding, which gives a choice zero or one step, leaves the combined
  accept unrecompiled, and keeps free-text elicitation inside fragments. An `exec` or a choice runs its actions in
  order, a failure stopping for direction, and then its `recompile` or `handoff` applies. An argv cannot chain commands
  as D3's `&&` did, and only the compiler composes a sequence — the branch-gone switch (a fetch, then `git switch`), the
  combined accept, and the pre-flip in-place materialize each run two. A published `actions` array is never a sequence:
  every shipped one is a menu of alternatives (`exitActions`' materialize-here or release, `markPausedWorkItem`'s resume
  or abandon), so each entry maps to its own choice, as the materialize row maps them. Every sync choice recompiles, the
  combined accept included ("Compilation follows sync"). A choice may instead carry a signal, with its value known at
  compile (a flagged capture's seed, a route's signal) or `elicit`ed (`seed` or `stub`, optionally carrying a value such
  as an unmatched seed), which the agent asks the person for; a signal choice recompiles with it, its value replacing
  any the argv already carries. A bare choice carries nothing and the agenda continues, as branch-gone's held path and
  D3's `skip` do. Today's arm workflows carry no elicitation, and the CLI knows the closed part of the set — the
  `§ Errand` captures `extractReminderEntries` returns, flagged `_Remind:_` or `_Hold:_`, and a seed's stub from
  `resolveBacklogStub`, which matches exact slugs — so bare `--errand` and `--plan` resolve at compile.
- **Read groups are bounded.** The compiler partitions reads into groups whose estimated aggregate size stays under a
  per-group budget (a constant, not a configuration key), answering the inbound truncation report (nine reads,
  ~21,400 tokens, silently cut by the harness's result cap). The read contract says what to do when a result reports
  truncation.
- **The compiler emits only reads that exist.** An expected file that is absent becomes a `note` at compile time, so
  failure defaults are per step type rather than a per-step field: a failed `read` is surfaced and skipped; a failed
  `exec` stops for direction. Two absences keep today's handling: an absent WORKING-MEMORY is normal on a fresh
  repository and stays silent, and an absent SESSION-NOTES becomes a `render` of the CLI's `git log --oneline -10`,
  today's fallback once `arc user load` (the notes channel's `loadNeeded`) finds nothing.
- **A failed slot degrades; it never acts.** Only a failed `derivedLocusState` stops (the unavailable row). Any other
  slot the compiler reads that fails becomes a CLI-composed degraded-slot `render` (its error kind and message),
  counted as a surface for `autoProceed`, and supplies no `exec`, `offer`, relation, or cleanup authority; the rest
  compiles from healthy slots, as today's per-slot failure rule says. A missing identity is not one of these:
  `runSessionInitStatus` fails `derivedLocusState` itself with `SessionIdentityMissingError` when no identity resolves,
  so the session stops at the unavailable row, whose CLI message names `identity-missing`, as it does today.
- **Recompile replaces the rest of the agenda.** An `offer` choice or `exec` marked `recompile` re-invokes the
  `recompile` argv (plus any signal the choice adds) and starts the fresh agenda from its top. These carry over:
    - **Reads.** A `read` step counts as done when the session already read that file — the same checkout and path — and
      no sync since could have written it: a notes pull or load writes the user documents (SESSION-NOTES,
      WORKING-MEMORY, USER-INBOX), a worktree pull, the superseded reset, or a materialize into the session's own
      checkout (`--here`) the checkout's tracked files. A housekeep route chosen at Orient repeats no read; before the
      flip an in-place materialize also runs `arc user pull` before it recompiles, so the resume re-reads the user
      documents.
    - **Fragments.** A `fragment` the session already followed with the same arguments counts as done, as a read
      does, so cold-start's scope check runs once though its decline path recompiles.
    - **Answers.** An `offer`'s `id` names its question: the slot and the action it offers. An answer carries over to
      the same question only — the same `id`, or a sync offer whose channel and action an earlier answer decided (a
      partial "worktree only" answers the notes pull). A notes load is a different question from a notes pull, and a
      refresh that changes the question (branch-gone's `pending` refreshed to `resolved` or `surface`) carries a new
      `id`, so each is asked. A session answers each question once, as today.
    - **The `apply`.** A user-reference `apply` the session already ran counts as done, so a recommendation that
      persists after it cannot loop.
- **Handoff ends the agenda** (Owner, 2026-10-31, planning review). An `exec` or `offer` choice marked `handoff` runs a
  command that leaves the work in another checkout. The agent relays the command's own result text, which names that
  checkout (`arc materialize`'s report, `arc errand materialize`'s `recommendedPromptText`), and stops; the work
  resumes in a fresh session there, whose init derives its frame from recorded state. The running session moves into
  that checkout only on the person's explicit opt-in after hearing that their terminal stays on the current checkout,
  and then runs the spine afresh from there: `--start`'s soft guard against in-session continuation today, shared.
- **Compilation follows sync.** A worktree pull, a notes pull or load, a base-branch sync, and the superseded reset
  change what the compiler reads: SESSION-NOTES, USER-INBOX, WORKING-MEMORY, the meta, the task list, the local base ref
  `readLocalBaseOid` reads for `baseBranchSync`, and whether the advertised base object is present locally, which
  `analyzeBaseDistanceSnapshot` checks for base drift. Every sync `exec` therefore carries `recompile` and ends its
  agenda, and every `offer` choice that runs a sync carries it too, the combined accept included. The superseded reset
  is an `offer` ahead of the reads on the rows whose prefix runs the worktree channel (the resumes and Orient): its
  `git reset --hard origin/<branch>` is composed from `worktree.branch`, and accepting it recompiles. Its text is the
  reset's own, composed by `composeSupersessionPromptText` (a CLI change that reaches today's envelope text too): the
  head "Local commits are superseded by rebased equivalents on `origin/<branch>`; dropping them loses nothing.", on a
  dirty tree "Working tree dirty — the reset discards uncommitted changes; stash them first (a commit made now would be
  dropped too).", then the question. The pull's `DIRTY_TREE_WARNING` is not reused: its "commit before accepting" is
  safe before a pull and loses a commit made before the reset. On the other rows, and once declined, the superseded
  state renders as the head alone, with no warning and no question. The user-reference `apply`
  (`arc user reconcile-references --apply`) compiles whenever the slot recommends `apply`, after the agenda's sync
  steps, so it runs on synced state: today's "after any notes pull/load" read as sequencing, which needs no signal and
  survives the flip unchanged. It carries `recompile` too, since it writes USER-INBOX's `WU_Target` fields and, with
  state off branch, moves the personal per-work-unit scratch folders that hold SESSION-NOTES, and it runs once per
  session (the carry-over above). A declined sync offer leaves state as compiled, and the agenda continues; the
  channel's state still renders in orientation, as today's "sync states other than `clean`" line does. Each recompile
  costs one compile — a combined accept runs two syncs under one — where today a clean pull skips the re-probe and a
  partial one re-probes.
- **Withheld actions keep their limits.** Each surface's remedy becomes the step today's rule for that surface
  implies, and the spec enumerates the mapping surface by surface, classifying each unmarked rule under `DEV-RULES.ARC`
  § Rule Authority and checking each row against every remedy shape that surface's CLI composer publishes — one
  recommendation can carry several. Two invariants bind every row:
    - Nothing today's prose withholds from automatic execution becomes an `exec`: the offer-only `git reset --hard`, a
      teardown never run automatically, and the rename-move's `git worktree move -f -f` stay `offer`s.
    - Nothing withheld at init, forbidden, or left to an owner becomes an action; it renders as text: detection-only
      tracked edits, a channel whose pull is never offered, a `blocked` entry, a husk left to manual cleanup, an
      unmerged, non-shipped orphan branch (never `-D`), an adopted orphan kept for its owner, and a locked registration
      whose unlock belongs to the lock's owner.

  A command a step offers or runs is the argv the CLI published, unchanged, or one the compiler composes from the
  slot's fields and the git facts it reads (a branch-gone switch to a free destination, whose remedy today is text;
  § What the compiler emits per entering row); the compiler adds no flag a surface's rule
  forbids. Only today's merged-orphan line (`git branch -d`) is stale: `withOrphanActions` offers `git branch -D`
  once `orphanWorkLanded` finds every patch landed in base (strict `git cherry` on the probe's path) and no merge commit
  on the branch, which `-d` would refuse after a squash landing.
- **No invalidation rule.** The compiler reads SESSION-NOTES' `**Session Type:**` override and `**Commit at
  Handoff:**` itself, with `extractField` over `stripHtmlComments` output as the store import's `foldImportSession`
  already reads both. Because compilation follows sync, it reads them after any pull, so nothing the agent reads later
  can contradict a compiler input. This retires the spine rule `composable-workflows`' worked example needed (finding
  5) and moves Step 4's freshness `git log` commands into the CLI. The override keeps today's limits: it applies only
  to `planning | execution`, `prepublication` and `integration` stay state-determined, and a conflicting or invalid
  value becomes a warning `note`. At the flip both fields come from the meta's session-context section: a code change.
- **`autoProceed`** carries `--next`: the CLI sets it when nothing it knows of would block a bare-clean orientation (no
  surfaces fired, a sync `offer` among them, clean tree, no freshness gap, no unconsumed seed, and no meta
  `**Blockers:**` value, which `parseMetaRecord` reads as `blockers`). The agent still withholds it on a Step 6 mismatch
  or a blocker its composed Blockers line carries from SESSION-NOTES, which the CLI does not parse: today's gate
  requires no blockers.
- **Payload types reuse what exists:** `recommendedPromptText` text and `SessionAction` for each action an `exec` or a
  choice runs. No new `recommended*Text` names; unification with `cli-output-contract`'s `report` / `offer` waits for
  the post-cutover co-design.

### What the compiler emits per entering row

A row that cites the **entry prefix** starts with it: the sync channels today's arm runs (the notes channel alone on the
signal arms, `--start`, and `--context`; every channel on resumes and Orient), then the **universal reads** — both
briefs, both `DEV-RULES`, `STRATEGY-INDEX`, and `QUICK-REFERENCE` § Environment & Path Context, plus WORKING-MEMORY
whenever an identity resolves (as `resolveLoadSetManifest` adds it) and `AGENT-BRIEF.CONTRIBUTOR` when `identity.role`
is `contributor`. By the sync rule, a pull in the prefix ends the first agenda, and the recompile compiles the row from
fresh state.

**Branch-gone recovery compiles by where each switch destination is checked out.** A switch destination is a
candidate proposed `switch` that a `resolved` or `surface` result offers, or `main-fallback`'s base. `pending`'s and
`unproven`'s candidates are not: today's prose offers only the refresh or manual recovery for `pending`, and
`recommendBranchGoneRecovery` renders `unproven`'s for a manual choice. The compiler locates a destination from the
candidate's `worktreePath`, else from its own worktree-list read (`resolveWorktreePathsByBranchResult`), and checks
whether its branch has a local ref. A missing `worktreePath` never means the branch is free: `runBranchGoneRecovery`
builds recent-branch candidates without one, `resolveCascade` gives `main-fallback` only a `baseBranch`, the roster
`runWorktreeRoster` builds is empty before the flip when no checkout's `active/` holds a meta, and
`filterRosterByIdentity` drops other identities' checkouts in team mode.

- A **free** destination, checked out nowhere, becomes an `exec` — a fetch when the branch has no local ref, then
  `git switch` — and a recompile, run automatically or on an offer's accept as the recommendation says.
- A destination **checked out elsewhere** is never switched to. Automatically, or as an offer's bare choice, it takes
  the **held path**, the same one a declined, deferred, or surface-only recovery takes: the row's load set read
  without sync (the universal reads, plus the work unit's load set when the entering row selects one, as today), a
  branch-gone `render` carrying the manual-recovery guidance or "Continue recovery in checkout `<path>`", the
  orientation's `render`s, and `gate stop`.
- A choice carrying a **published argv** — a removable candidate's `arc teardown <name>`, `pending`'s refresh — stays
  an offered `exec` of that argv, unchanged, and a recompile, as "Withheld actions keep their limits" requires. Any
  other choice, such as an external candidate or manual recovery, is a bare choice into the held path.

The spec enumerates each recovery kind's rows (`resolved`, `surface`, `main-fallback`, `pending`, `unproven`) under
these rules, including how a bare choice's checkout text reaches the branch-gone render.

| Row / signal                 | Steps                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------- |
| unavailable or unresolved    | `render` the locus message, `gate stop`                                           |
| branch-gone                  | by the rule above: a free switch destination → `exec` (fetch if no local ref,     |
|                              | then `git switch`) + recompile; checked out elsewhere, declined, deferred, or     |
|                              | `surface` → the held path; a published argv (teardown, refresh) → an offered      |
|                              | `exec` + recompile; `prompt` → `offer` whose choices follow the same rule         |
| `--errand --next`            | prefix; `arc errand next` resolves the queue head at compile: a `render` of its   |
|                              | `recommendedPromptText`, checkout `render`s, and `fragment run-errand` (launch,   |
|                              | key); or `render` + `gate stop`                                                   |
| `--errand [<seed>]`          | prefix; a seed → checkout `render`s and `fragment run-errand`, a seed naming a    |
|                              | flagged capture adopting it as the origin; bare → `offer`: one choice per         |
|                              | `§ Errand` capture flagged `_Remind:_` or `_Hold:_` and an `elicit` choice for a  |
|                              | new concern, each recompiling with its seed, and after it, for a decline, a       |
|                              | `note` and the normal arm                                                         |
| `--plan [<stub>]`            | prefix; a seed `resolveBacklogStub` finds → checkout `render`s and                |
|                              | `fragment draft-design`, whose entry check runs unless the checkout is already on |
|                              | a grooming branch; bare, or a seed it does not find → `offer` of one `elicit`     |
|                              | choice for the stub, carrying any unmatched seed, whose answer replaces it in the |
|                              | recompile (an answer still not found is asked again under a fresh `id` keyed on   |
|                              | it), and after it, for a decline, a `note` and the normal arm, as an unresolved   |
|                              | `--start` target takes                                                            |
| `--housekeep`                | prefix, checkout `render`s, `fragment drain-inbox`                                |
| `--start <slug>`             | prefix, target meta and task-list (when present) `read`s, readiness `render`s     |
|                              | (dirty tree, freshness, the worktree and base channels as readiness input, never  |
|                              | a pull), `fragment` (recon), `gate launch`; a target that does not resolve →      |
|                              | `note` and the normal arm                                                         |
| `--context`                  | prefix, checkout `render`s, `gate stop`                                           |
| transient resume             | prefix, checkout `render`s, `fragment` (the owning workflow, with subject and     |
|                              | generation)                                                                       |
| work-unit resume             | prefix, the rest of the `loadSet` `read`s, `render`s, `gate proceed`              |
| Orient (no active work unit) | prefix, `fragment` (discovery), route `offer`s, `render`s, `gate`                 |
| cold-start                   | `fragment in-flight-scope-check` (advisory, never gates), then `offer` scaffold   |
|                              | (seed disposition shown) → `exec` + recompile; decline → Orient                   |
| materialize candidates       | `offer`, one choice per published action, plus before the flip one in-place       |
|                              | choice per legacy candidate (§ The cutover module): a choice whose `checkout` is  |
|                              | the session's own (on the store path, `arc materialize --here`,                   |
|                              | `arc start --new --here`, `arc locus release`) → `exec` + recompile; a            |
|                              | materialize into another checkout → `exec` + `handoff`                            |
| contextless work unit        | a current husk → prefix, cleanup `render`s, `gate`; any other → `render` the      |
|                              | `locusGuidance` text, `gate stop`                                                 |

The prefix absorbs `instruction-optimization`'s guard that the always-loaded set loads however `arc-session` is invoked:
every row carries it but those that stop at once (unavailable, unresolved, a contextless work unit that is not a husk)
and those that end in a recompile or a hand-off, whose next agenda carries it. An unconsumed positional seed or `--next`
on a non-consuming arm becomes a `note`.

**Checkout `render`s** are the orientation's checkout-local surfaces — hooks path, the worktree channel's
`Reconcile required:` divergence and superseded state, dirty tree, sync and notes state, base drift, and the
degraded-slot lines of the slots these draw on — which today's signal-leaf mode still shows. The spine frames them on
the subject (the Errand, drain, or grooming target), and signal and transient rows emit no discovery routes and no
reminders about the active work unit, as today. `currentWuReconcile` and the other work-unit surfaces are never checkout
renders.

The work-unit resume row's task-list `read` keeps today's skips: none in planning, and none when the cursor is `missing`
or `no-open-task`. A malformed cursor or a failed cursor probe skips the read with a diagnostic `note`; a located cursor
whose section cannot be found is a mismatch (§ Methods, `read-load-set`); a null workflow on a selected role is a
mismatch `note`.

An Errand materialize no longer runs today's in-session checks (outcome, identity, allocation, and the re-probed
checkout): they guard a continuation in this session, which the hand-off removes, and the fresh session's init resolves
the materialized checkout from recorded state. A refused or failed command stops as any failed `exec` does, and
`locus-methodology-contracts.test.ts` re-pins its materialization test to the hand-off.

### Orientation surfaces

Every surface is composed CLI-side (Owner, 2026-10-31), the cleanup-residue lists included; the agent composes only the
thought-state lines (Last completed, Current task, Blockers, Next action) from the meta and SESSION-NOTES, and, when it
bears on the current task, a cohort-coordination line from the cohort document the load set read. This is the unit's
largest CLI piece. Of the ~32 conditional surfaces, about eleven already carry composed text
(`deliveryPosition.value.line`, `locusGuidance`, base drift, base-branch sync, both reconciles, hooks path, superseded
divergence, rename-move remedies, materialize refresh). About twenty are prose templates the agent fills from slot
fields today (local-ahead, no-upstream, detached HEAD, no-remote, dirty, the notes surfaces, husk, the cleanup-residue
lists, in-flight work units, materialize candidates, housekeep offer); their fields (`teardown.text` and `argv`,
`remedy.text`, typed reasons) already exist. `note` steps carry an optional register field for
`operational-advisory-registers` to fill; this unit classifies no advisory. The concurrent-workload advisory becomes a
CLI-composed `note`.

### The cutover module

Land before the flip (Owner, 2026-10-31): the build is expected to take about a week, and the flip is further out. The
notes pull/load dispatch and the notes surfaces (notes-lag, compaction, partial-push, notes-drift, notes reconciling,
local-ahead notes) therefore still exist when this lands. They compile in one CLI module, so the flip deletes that
module. Two of its pieces are new composition:

- **The notes load.** One `arc user load` when `loadNeeded` is true or `retiredSubdirs` recommends `pull` or `prompt`.
  `loadNeeded` is a bare boolean, so the compiler composes the argv and any offer text the retired-subdir slot does not
  carry. Under `always` it is an `exec` with no degrade: `resolveCleanArmNotesVerdict` sets `loadNeeded` only when the
  load overwrites nothing local, and today's porcelain test can never fire, since `.gitignore` ignores `.arc/user/*/`;
  `arc user load`'s pre-load backup stays the safety net for the retired-subdir reconcile. Under `prompt` it is an
  `offer`, and under `manual` a `render`, as today.
- **The pre-flip in-place materialize.** Before the flip `findLegacyMaterializableWorkUnits` publishes only a spawning
  `arc materialize <name>`, so the offer adds one choice per candidate whose two actions run
  `arc materialize <name> --here` in the session's own checkout and then `arc user pull`, and which recompiles, as
  today's explicit in-place materialize does. On the store path the published `--here` actions recompile with no pull.

The prose the flip still rewrites is the consumer map's remainder (`notes-storage-contract.md`): the spine's
SESSION-NOTES authority boundary, since session notes come from the meta's session context (D5), and
`discover-next-work`'s `.arc/backlog/` and `.arc/active/` reads, since discovery reads the projected backlog or `list`.
`storage-cutover` has a capture saying so.

### Methods

Fragments are methods (Owner, 2026-10-31), the minimum of D2 this unit builds; an arm that enters an existing workflow
(`run-errand`, `drain-inbox`, `draft-design`, cold-start's `in-flight-scope-check`) names it by path instead. Three new
methods (names provisional), each declared in the spine's `arc.methods`, named by a `fragment` step, installed by an
`init-recipe.json` `include_files` entry, classified Configurable in `CONFIGURABLE_FILES` (`classification.ts`), and
added to `strategy-session-operations.md` § Method Classification by Trigger:

- **`read-load-set`** — the read contract: executing `full`, `partial-section`, and `partial-strategic` reads, read
  groups, manifest order, and truncation continuation. `partial-strategic` has one procedure for both consumers:
  today's recovery slicing (header, current phase preamble, current task section) from the task cursor's anchors
  (`section` id and `lineHint`, `leaf`), moved. Recovery takes the anchors from the audit report's `taskCursor`; an
  init `read` step carries the same anchors, which the compiler already holds. `session-recover` shares it (Owner,
  2026-10-31): its Step 3 read-mode mechanics become a fire-point to this method, its frontmatter declares it, and
  `locus-methodology-contracts.test.ts` re-pins its wording. Its stop rules (no verified anchor, an unlocatable task
  section) stay in `session-recover.md`: recovery is the weakest adherence position and has no agenda to load the
  method exactly when an arm fires. No recover-side CLI change. Init therefore anchors on the cursor alone, as
  recovery does, no longer on the meta's `**Next Task:**` triple; at init an unlocatable task section skips the read
  and is surfaced as a mismatch (the spine's mismatch handling), where recovery stops.
- **`recon-start-target`** — the `--start` readiness vet and launch (Owner, 2026-10-31: stays agent-side). It consumes
  the CLI facts that already exist (dependency status by slug, the probe's `Class` advisory); compiling it from
  `arc start`'s concrete preflight waits for `stub-mint-to-launch`'s shared start core, so until then the recon can
  still report ready where `arc start` refuses.
- **`discover-next-work`** — Orient's discovery, the parallel-fit read, and the seed pre-focus. Today's discovery list
  is the only rendered content in the shipped `session-init.template.md`: two `<!-- arc:if pm.mode ... -->` arms. The
  `fragment` step passes `pm.mode` as an argument and the method follows the matching arm, so no method needs
  install-time rendering. This departs from D3's binding-time rule, which keeps install-time `arc:if` for
  config-static variation such as `pm.mode`: no shipped method is a template, the method follows a `pm.mode` change
  without a re-render, and the arm that does not apply costs about 0.4 KB per Orient. It fires `assess-parallel-fit`,
  which ships nowhere today: neither `init-recipe.json` nor `CONFIGURABLE_FILES` lists it, nor
  `in-flight-scope-check.md`, which cold-start names. This unit adds both files' entries (§ Constraints).

Accepted interim costs: until D2's visibility and `fixed` override-policy exist, these methods are public and
project-overridable like any other; they carry the method shape; and session-init's arms sit in the flat methods
directory rather than beside the spine. No general `slug → artifact` resolver, anchors, or visibility in this unit. D2's
candidate layout (`draft-composable-workflows.md` § D2, one directory per decomposed workflow with its arms beneath the
spine) would move `discover-next-work` and `recon-start-target` there as `private` and `fixed` methods, a mechanical
move behind its resolver, since `fragment` steps name methods rather than paths; `read-load-set` stays public, since
`session-recover` calls it too. Making them `fixed` retracts an override surface: a change in place before ARC's first
public release, a compatibility change for any project that overrode them after it.

### The spine (`session-init.md`, budget ~13 KB, about 120–150 lines)

1. Signature line and purpose; definitions of agenda, step, spine, and fragment.
2. Output discipline (kept from today).
3. Run the agenda: the verb with the skill's arguments as flags. If the verb fails, surface the failure and stop —
   the probe-failure fallback, which cannot depend on an agenda.
4. Executing each step type, per the contract; the recompile rule. The `fragment` step is the fire-point for the
   declared methods.
5. Orientation: the header and conditional sections come from `render` steps; the agent composes Last completed, Current
   task, Blockers, and Next action within today's bounds, and, when actionable, cohort coordination bearing on the
   current task from the cohort document it read, or frames the summary on the subject on a signal or transient row;
   under `--context`, orientation is the header and checkout surfaces, with no thought-state lines and no subject; it
   reports any `exec` the session ran without an offer (a branch-gone switch); the never-include list; the restating
   anti-pattern.
6. The SESSION-NOTES authority boundary; WORKING-MEMORY entries bind as active constraints until each one's
   `_Remove when:_` trigger is met.
7. Mismatch handling (today's Step 6, both axes); a freshness gap that suggests an interrupted session runs
   `process-task-loop` § Crash Recovery.
8. Frontmatter: `arc.methods` declares the three methods and keeps today's `session-state` with its override pointer;
   that method's retirement stays with `loadset-composition`. The arms' existing workflows keep their own
   declarations.

With the `pm.mode` arms gone to `discover-next-work`, the spine has nothing for the render engine, so it ships as a
plain `session-init.md` and its `init-recipe.json` entry drops the `.template.md` suffix
(`strategy-file-classification.md` § Template suffix: the suffix marks render-engine input).

The `arc-session` skill shrinks to a hand-off: run the spine, passing its arguments as the verb's flags. Today it
restates the flags' handling the workflow also carries (~2.4 KB). The phrases a test pins there re-pin with the spine's
(§ Constraints), so the cut stays in the cheap tier.

### Removals

- **`session-init.contributor.md`.** `spec-storage-contract.md` § Fork contributors (D14) retires the contributor's
  separate layout: a contributor's work unit becomes an ordinary record in their own store, so the separate
  `.arc/user/<identity>/active/` scan the variant exists to read goes away, and the consumer map records "contributor
  scope collapses" for the file. Deleted with its recipe entry and the role branch, under the pre-public-release
  posture; until the flip a contributor takes the maintainer path, and none exists today. The one load the variant
  adds survives: the entry prefix reads `AGENT-BRIEF.CONTRIBUTOR` for the `contributor` role, so
  `reference/briefs/README.md` and `user/README.md`, which promise that load, stay true, and the contribution footer's
  check enforces itself (`commit-check/policy.ts`). Whether the probe resolves a contributor's active root, which the
  variant scanned by hand (`commands/active/status.ts`), is checked at spec. `AGENT-BRIEF.CONTRIBUTOR` and the
  contribution ceremony stay with `contributor-path`.
- **`probe-envelope.md`** (Owner, 2026-10-31), both copies and its recipe entry. Only `session-init.md`'s Step 1
  pointer references it in shipped content; `session-init-delivery-position-workflow.test.ts` and
  `locus-methodology-contracts.test.ts` re-pin. Its 55 KB hand-writes shapes `SessionInitProbeResultSchema` already
  declares, which `arc schema get session-init-envelope` serves, plus per-field presence and provenance notes. The notes
  a remaining shipped reader relies on (the `inboxState` routable count `init-work-unit.md` reads and
  `locus-methodology-contracts.test.ts` pins) move into `.describe()` on those fields, which `z.toJSONSchema` projects;
  the rest go with the file. The flip has one fewer file to rewrite.

### The always-loaded cheap tier

In scope (Owner, 2026-10-31), both copies of each shipped file; the design tier stays with its owners
(`orientation-surface-compression` has a capture). From the cut audit:

- **`DEV-RULES.ARC`** (~1.5 KB): § When to Load's stale clause (process-task-loop "loads when the meta shows task
  work", where the workflow is projected from the task cursor) — keep its operative "load before beginning any task";
  the duplicate `STRATEGY-INDEX`, workflow-authoring, and methods bullets with their link definitions; the preamble's
  `DEV-RULES.PROJECT` pointer; § Discovered Work Routing's Errand-vs-Work-Unit pointer; § Method loading's
  "declare what your own body fires" sentence (restated in `strategy-workflow-authoring.md`, which the index always
  loads for workflow authoring); § Artifact relocatability's narrative (the CLI performs the move). Wording fixes, not
  cuts: § Commit control's envelope field path for the commit interlock, and `arc.role` where the probe reads
  `identity.role`.
- **`AGENT-BRIEF.ARC`:** correct the PRD → tasks pipeline line and the release-push "no target argument" claim
  (`arg-grammar.ts` accepts a matching `-u origin <branch>` pair); cut the stale one-level backlog-nesting line and the
  footer. The Methods line stays: fresh reviewers read the briefs but not `DEV-RULES.ARC` (§ Evidence).
- **`STRATEGY-INDEX`:** the purpose sentence (duplicated in `DEV-RULES.ARC`); the "create project strategies" prose
  and example list (scaffolding repeated in `strategies/project/README.md`); the "these ship with the framework" line.
- **`QUICK-REFERENCE.template` § Environment & Path Context:** the duplicate `.arc/` row; the fill-time comments. The
  heading stays: `resolveLoadSetManifest` keys the partial read on it.
- **`AGENT-BRIEF.PROJECT.template`:** fill-time comments, their examples moved to `02_define-project`'s step; the
  footer.
- **`DEV-RULES.PROJECT` (shipped):** the domain-rules paragraph's stale `constitution/` path, corrected rather than cut
  (`constitutionDir` reads `system/rules/`): its load-on-demand trigger is the only always-loaded statement of when to
  read the files `domainRules` lists; duplicate pointers; the capture-routing default text (it duplicates
  `DEV-RULES.ARC` and its first bullet contradicts it) down to its heading and a placeholder line, since
  `03_configure-external-integration` targets that section; the quality-gates definition sentence; fill-time comments;
  the self-description.
- **`arc-session` skill:** the hand-off above.

Every destination for moved text is checked against `init-recipe.json` in both directions.

### Propagation

Shipped readers that assume the session holds the init envelope or describe the bulk load, to retarget:

- `DEV-RULES.ARC` § Commit control — the prefix mapping and `releaseRouting` lookups name "the session-init
  envelope"; they read the agenda's residual inputs (same field paths) or the envelope.
- `strategy-session-operations.md` — § Probe pattern and § Extension contract (the agenda verb is a second
  non-destructive reader beside the probe, not a slot resolver), § Loading Mechanisms § Session initialization
  (agenda-driven, not a prescribed bulk load), § Method Classification by Trigger (the three methods), and
  § Session-Init Consumption's "Methods — no init read" (the spine fires three methods at `fragment` steps).
- `system/methods/README.md`'s loading model — "Session-init does not read methods", false for the same reason.
- `assess-parallel-fit.md` — its consuming workflows name `session-init.md`; the fire-point moves to
  `discover-next-work`, and `in-flight-scope-check.md` keeps its own.
- `strategy-configurability-architecture.md` — the agent learns the active configuration from the session-init probe;
  it now reads it from the agenda's residual `config`.
- `template-dev-rules.md` — malformed domain-rules frontmatter surfaces in `domainRules.warnings` at session-init; it
  now arrives as a `note`.
- `draft-design.md`'s grooming-entry skip says session-init's signal-leaf relocate moves a `--plan` session onto
  `chore/groom-<slug>`; session-init defers to the workflow, and no command creates that branch. The skip now applies
  only when the checkout is already on a grooming branch, so `arc plan check` runs on every other `--plan` entry and a
  grooming draft is never written on a protected base; the missing relocation has its own capture (§ Coordination).
- `init-work-unit.md`'s inbox backstop reads `inboxState` "from the current session-init probe if available, otherwise a
  fresh read-only probe"; it reads the agenda's residual `inboxState` instead, keeping the fresh probe as the fallback,
  so a start the agenda routes to loads no full envelope.
- `session-handoff.template.md`'s Next Task field says its triple-anchor format "enables graduated lookup at session
  init"; init anchors on the task cursor (§ Methods, `read-load-set`), so that clause goes and the field stays a pointer
  for the reader.
- `run-errand.md`'s Resume mode runs `arc errand materialize` for a remote-only generation and continues from the path
  it returns; session-init's materialize offer hands that off (§ What the compiler emits per entering row), so Resume
  mode consumes only the checkout session-init selected.
- The four integration tests that read session-init wording (§ Constraints), plus the hook test that pins the seed
  command (which does not change).

## Decision log

All Owner, 2026-10-31; each is stated in full where the design uses it.

| Decision                                                                    | Where                          |
| --------------------------------------------------------------------------- | ------------------------------ |
| Land before the flip; isolate cutover-retiring behavior in one module       | § The cutover module           |
| The two-part done-signal; measure both ways                                 | § Goals and done-signal        |
| Take the cheap tier of always-loaded cuts; leave the design tier            | § The always-loaded cheap tier |
| `session-recover` shares the read contract only                             | § Methods                      |
| A dedicated agenda verb; the status probe stays the full read               | § The agenda verb              |
| Compose every orientation surface CLI-side                                  | § Orientation surfaces         |
| `--start` recon stays agent-side for now                                    | § Methods                      |
| Fragments are methods                                                       | § Methods                      |
| No load-set membership change                                               | § Evidence                     |
| Delete `probe-envelope.md`                                                  | § Removals                     |
| The verb writes nothing; nudge markers stay agent-written (planning review) | § The agenda verb              |
| Done-signal restated as measured reductions (planning review)               | § Goals and done-signal        |
| A `--context` signal                                                        | § The agenda verb              |
| Materialize elsewhere hands off; moving in-session takes an informed opt-in | § Agenda contract              |
| Bare `--errand` / `--plan` resolve at compile (planning review)             | § What the compiler emits      |
| Stay on the right side of the procedure and knowledge check-docs, unit-wide | § Strategy check               |

The contributor variant's removal follows `spec-storage-contract.md` D14 rather than a fresh Owner call; the Owner
raised it.

## Proportionality (loop exit, 2026-10-31)

`assess-design-proportionality` over the settled design returned `revise` with one finding, applied: a fourth method,
`recover-branch-gone`, was unsupported machinery — today's branch-gone arm is `switch` (an `exec` to a free destination,
the held path when it is checked out elsewhere), `prompt` (an `offer` of precomposed text, its choices the switch
destinations and any published teardown or refresh argv), or `surface` ("render the pre-composed manual-recovery
guidance and do not act"), all compilable, leaving no judgment for a method to hold. On re-run the rest traces to a
goal, an observed failure, or a decision: the step vocabulary's seven types each carry an arm today's prose has;
read-group bounding answers an observed truncation; recompile replaces today's "re-run the Step 1 probe", and the
recompile after sync reuses that rule rather than having the verb pull (planning review, first pass); the read-group
budget is a constant, not a new configuration axis. Purpose-built slots remain the recorded minimal alternative
(§ Alternatives considered).

## Strategy check

`strategy-procedure-evolution`, `strategy-knowledge-evolution`, and `strategy-session-operations` all fire on this
unit. Read against the design:

- **Procedure P1 (the CLI computes) and P6 (emitted text precomposed).** The agenda and CLI-composed surfaces are the
  target shape. P1's second paragraph binds the `offer` steps: where a choice needs judgment (the housekeep soft-offer,
  a materialize pick), the CLI emits the closed choice set and the facts; the recommendation stays with the agent and
  the decision with the Owner.
- **Procedure P2 (no control flow in markup).** The agenda is a flat list; arm mutation recompiles rather than nesting.
  Methods carry judgment and interaction, dispatching only on fields the CLI computed. `recon-start-target` is the
  known residual (§ Methods).
- **Procedure P3 (verbs over mechanics).** `exec` steps carry CLI argv; the spine narrates no Git mechanics (today's
  `git fetch origin <base>:<base>` and `git pull --ff-only` lines move into emitted argv).
- **Procedure P4 (schemas generated).** The agenda schema is registered and cited through `arc schema get`; the
  hand-written `probe-envelope.md` goes.
- **Procedure P5 (evals gate prose).** No eval instrument exists (`workflow-eval-harness`). Verification leans on
  rehearsal sessions over fixed fixtures (plain resume, `--plan`, `--errand`, branch-gone, Orient discovery,
  `--context`) on a kit install — a proxy, named as such.
- **Procedure P7 (controlled vocabulary).** "Agenda", "step", "spine", and "fragment" become load-bearing in shipped
  prose. Their only consumer is session-init, so the spine defines them (knowledge P6, extract on fan-in) rather than
  `AGENT-BRIEF.ARC`'s vocabulary (knowledge P10).
- **Knowledge P1 (constraints never on-demand).** An arm's constraints may live in its method, because the agenda
  loads it exactly when the arm fires — fire-site placement. Constraints spanning arms stay in the spine.
- **Knowledge P4 and P5 (derived access paths; declare at point of use).** No per-fragment tier or loading field; the
  methods are declared in the spine's `arc.methods`, so no bespoke loading path exists. An arm entering an existing
  workflow reads it at a path the CLI supplies — the subject's own workflow, derived as recovery's load set already
  derives it, or the one workflow a row runs today, as cold-start runs `in-flight-scope-check` — a load-set read, not
  a new loading path.
- **Knowledge P8 (author for humans; don't blind-shard).** The arms are procedural units with their own entry
  conditions and outcomes, not shards cut for size, and `analysis-load-set-scoping.md` § Why workflow range-addressing
  needs an authoring contract found range addressing on a monolith needs machinery that recovers undeclared
  structure. The spine's `arc.methods` list is the map a maintainer reads to see the whole behavior.
- **Session operations' tiers.** The spine is read at every session start (T1-like for the ceremony); `read` steps
  carry the T1 and T2 documents; the three methods are T3, loaded at their agenda fire-point. Its § Classification
  Criteria rule "when uncertain, prefer T1" is honored: no membership demotion.

## Constraints

- **The storage cutover changes process once, at the flip.** `draft-storage-cutover.md` rewrites each affected
  workflow step from the consumer map (`notes-storage-contract.md`); for `session-init.md` that removes the notes
  dispatch and surfaces, moves the freshness anchor to the store state version, and reads session notes from the meta.
  The register (`cohort-state-storage.md`) sequences this agenda after the seam's locus and session-init work, which
  has landed. This unit lands first (§ The cutover module).
- **The envelope schema is strict.** `SessionInitEnvelopeObjectSchema` is a `z.strictObject`, asserted by
  `assertSessionInitProbeResult` before emission; the agenda is a separate registered schema, so the envelope does not
  change shape.
- **`loadSet` compatibility.** `LOAD_SET_MANIFEST_VERSION` is a literal `1` and `auditLoadSetManifest` treats a
  version mismatch as drift. Stay additive at v1, keep any position marker out of `ReadMode`
  (`analysis-load-set-scoping.md` § Comparator constraints), and take paths from the layout resolver the seam is
  moving `loadSet` onto. The `group` field and the task-cursor anchors live on the agenda's `read` step, not on
  `LoadSetEntry`.
- **Ship evidence is the recipe.** New methods take `init-recipe.json` entries, and so does every file a new or moved
  fire-point names: `assess-parallel-fit.md` (with its `CONFIGURABLE_FILES` entry) and `in-flight-scope-check.md`,
  which ship nowhere today. Removed files lose their entries; moved text is checked against the recipe in both
  directions.
- **Size gate.** `handleSessionInitStatus` (about 730 lines) and `runSessionInitStatus` (about 430) already run under
  suppressions, and `src/handlers/status.ts` sits near the 1,000-line file gate; the agenda verb lives in its own
  module.
- **Wording pins.** `locus-methodology-contracts.test.ts`, `session-init-delivery-position-workflow.test.ts`,
  `session-init-reconcile-workflow.test.ts`, and `review-gate-workflows.test.ts` read session-init and
  `probe-envelope.md` wording; the last pins the Session Type override's limits and names the `.template.md` path.
  `locus-methodology-contracts.test.ts` also pins the `arc-session` skill's `--errand --next` restatement ("Combined
  with a bare `--errand`", `arc errand next --json`, "terminal `nextOffer` continues to own sibling continuation"),
  which the skill's hand-off removes, and its Errand materialization checks, which the hand-off replaces; both re-pin.
  No test pins Step 3 to `resolveLoadSetManifest`.
- **Removal remedies follow the worktree lock.** `projection-substrate` locks every checkout ARC spawns for a work unit
  or an Errand, so a plain `git worktree remove` refuses (`spec-projection-substrate.md` § 12.6). It passes each
  registration's lock reason into the missing-folder composers (`missingRegistrationActions`,
  `readStoreMissingFolderActions`, branch-gone recovery's `buildWorktreeCandidate`): a missing-folder registration under
  its lock keeps a typed `arc teardown <name>` where the sweep offers one, since teardown removes that lock itself, and
  every other locked missing-folder registration takes `git worktree unlock` first. Session-init's stale-worktree
  fallback prose, a plain `git worktree remove`, becomes `arc teardown <name>`; branch-gone recovery's shipped-worktree
  prompt already composes `arc teardown <name>` (`recommendBranchGoneRecovery`), with no unlock. The composed cleanup
  lists therefore show each report's own remedy (`teardown`, `actions`, or a `missingFolders` remedy), each entry mapped
  to a choice or a step under § Agenda contract's invariants, and compose no removal command of their own. Whichever of
  the two units lands second carries the other's text.

## Entry read and boundary

- **Depth: `high`.** Most of the mechanism composes settled pieces, but the decisions were substantial and interlocked
  (done-signal, cutover sequencing, emission, fragment model, scope of cuts). Multi-session, Owner-interactive.
- **Class: `Heavy`, not `Novel`.** Derivation fires (a real design had to be authored); scale fires (two copies of a
  1,078-line workflow, a 55 KB envelope reference, a new CLI module beside an oversized composer, four wording-pinned
  integration tests, the recover read path). Invent-vs-compose lands on compose: the step vocabulary, `offer`
  encoding, `loadSet`, precomposed `recommended*` text, `SessionAction`, and arm-result verbs (`arc errand next`,
  `arc plan check`, `arc housekeep check`) already exist.
- **Boundary: stays one work unit.** One concern — what a starting session reads — designed as a whole. Forecast after
  the scope decisions: a change set of roughly 7–8k lines (Markdown ~3.8k, about half of it deletion across both
  copies; CLI ~1.7k; tests ~2–2.5k) and a spec well under 1,500 lines — below the project's marks, though a task list
  could reach the six-phase mark. The cheap tier is the separable seam (independently landable, a different layer);
  re-check at create-spec and generate-tasks.

## Alternatives considered

- **An agenda slot in the existing envelope** — rejected for the dedicated verb: the agent would still ingest the full
  envelope, and signal flags on a `status` verb are semantic drift.
- **Purpose-built slots, no step vocabulary** (an entry-fragment slot plus an ordered surfaces array) — less machinery,
  but the sync offers, materialize and cold-start mutations, and the final gate would each re-invent a shape the step
  list gives once.
- **Split the file without CLI selection** — cuts the read but keeps the agent doing dispatch the CLI can compute, the
  trip-over failure the Owner names.
- **Compress the monolith in place** — bounded yield; the growth rate stays.
- **Fragments as plain files with a CLI id → path map**, or under a new frontmatter key — rejected for methods:
  bespoke loading (knowledge P5), or a declaration key minted ahead of D1. A workflow path the CLI supplies is not
  such a map: it names an existing workflow by its shipped path — the subject's own, as recovery derives it, or the
  one a row runs today, as cold-start's scope check — and adds no fragment namespace.
- **Compose the simple surfaces only, leaving cleanup residues as a method** — rejected: residue sessions would still
  read ~6 KB of field-dispatch prose.
- **Compile `--start` recon from the start preflight now** — deferred to `stub-mint-to-launch`.
- **A full agenda for `session-recover`** — small extra saving, off the first-line budget, and it touches
  `handlers/recover.ts`, the seed schema, the PreCompact hook path, and adherence-sensitive text (`recovery-hardening`).
- **Keep the <10k target and widen into the design tier** — the cut audit showed that tier is placement design owned
  elsewhere, often test-pinned or deliberately placed.
- **Demote `STRATEGY-INDEX` or `QUICK-REFERENCE` § Env** — see § Evidence.

## Evidence

### The always-loaded cut audit (2026-10-31)

Two read-only passes over the shipped copies, spot-checked at source. The Owner's rule for the scope call: widen if
much can be cut as no longer necessary with little design; otherwise take the two-part target.

| Tier                   | Bytes  | ~Tokens | What                                                                    |
| ---------------------- | ------ | ------- | ----------------------------------------------------------------------- |
| Cheap: `DEV-RULES.ARC` | 1.5 KB | ~360    | § When to Load's stale clause and duplicate bullets; two duplicate      |
|                        |        |         | pointers; artifact-relocatability narrative                             |
| Cheap: other documents | 8.7 KB | ~2,200  | the skill's restatement of session-init's flags (2.4 KB), template      |
|                        |        |         | fill-time comments (3.3 KB, mostly a fresh-install cost), duplicates in |
|                        |        |         | the `DEV-RULES.PROJECT` template, ~1 KB of stale text                   |
| Needs design           | 7.3 KB | ~1,800  | test-pinned or deliberately placed passages, several claimed elsewhere  |
| Keep                   | ~42 KB | ~10,500 | constraint and vocabulary text                                          |

`judgment-authority-model` already ran a constraint-first audit of `DEV-RULES.ARC` (`notes-judgment-authority-model.md`
§ The always-loaded ledger, closed) and reversed several cuts under review, so its cheap tier was mostly taken. The
briefs have a second consumer a session audit cannot see: `adversarial-review`, `planning-review`, and
`verification-review` hand both briefs to fresh reviewers as their fixed orientation, so a passage that duplicates
`DEV-RULES.ARC` is redundant only for the session agent.

### Load-set membership (no change)

Read against `analysis-load-set-scoping.md` § Per-position candidate audit and the cut audit: `QUICK-REFERENCE`
§ Env and `AGENT-BRIEF.PROJECT` stay (their demotions are mutually exclusive, reviewers read the brief, and ~200
tokens remain at stake after the cheap tier); the cohort doc stays (constraint, no trigger); `STRATEGY-INDEX` stays
(reachable, but of unmeasured value — and this session loaded it and still reached the two project check-docs only on
the Owner's prompt, so awareness is already the weak band). The always-loaded saving comes from the cheap tier.

## Inbound dispositions

| Inbound item                                                 | Disposition                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| IO: always-loaded set loads however `arc-session` is invoked | Absorbed — the entry prefix (§ What the compiler emits)           |
| IO: a `--context` arm (load, skip discovery, orient)         | Absorbed — the `--context` signal                                 |
| IO D3.1: a freshness slot from `Commit at Handoff`           | Absorbed — the compiler reads it; the flip moves the anchor       |
| IO D3.2: phase-preamble offsets as a read-mode entry         | Out — both consumers slice from the cursor anchors in one         |
|                                                              | procedure; precomputed offsets would split it                     |
| IO D3.4: a precomposed orientation prelude                   | Absorbed — every surface is CLI-composed                          |
| IO D3.5: a `mismatches` slot                                 | Out — mismatch handling stays judgment in the spine               |
| CW: bound read groups by aggregate output                    | Absorbed — `read` groups                                          |
| CW: dispatch published remedy argv, not prompt text          | Absorbed — `exec` steps and `offer` choices carry `SessionAction` |
| CW: `--start` recon from the concrete start preflight        | Deferred to `stub-mint-to-launch`'s shared start core             |
| CW: release-wrapper mechanics as a config-selected fragment  | Out — `DEV-RULES.ARC` placement, design tier                      |
| CW: re-run rule classification where a step replaces prose   | Absorbed — withheld actions keep their limits (§ Agenda           |
|                                                              | contract); each such unmarked rule is classified at spec          |
| CW: lift the envelope schema reference onto `arc schema get` | Absorbed — agenda schema registered; `probe-envelope.md` deleted  |

## Open

- **Advisory registers.** Share one Step 5 surface census with `operational-advisory-registers` (two earlier counts
  gave 31 and 32); the `note` register field stays optional and unfilled here.
- **Method names** — provisional; settle at spec with `naming-conventions`' decided terms in view.

## Unknowns and Assumptions

- **The fresh envelope size** (~12 KB) is the brief's figure, not re-measured on a fresh install; the agenda output's
  size is unmeasured until built.
- **The spine estimate** (120–150 lines, ~4–5k tokens) is `composable-workflows`' 2026-07-02 estimate against a
  910-line file; the spine now defines its terms and keeps the mismatch section, so the high end is likelier, and the
  measured projection below puts it near 16 KB, about 3 KB over its budget.
- **The part-1 projection** (bytes, from today's text each piece keeps): spine ~16 KB (output discipline, orientation
  format, the SESSION-NOTES boundary, mismatch handling, step rules, and about 1.5 KB the planning review restored:
  subject framing, the `--context` and cohort lines, the hand-off and its opt-in, WORKING-MEMORY binding, the
  crash-recovery trigger), `read-load-set` ~3.5 KB, `discover-next-work` ~2.5 KB, `recon-start-target` ~3.1–3.8 KB.
  Unbudgeted, a plain resume lands near 27% of today's `session-init.md`, Orient near 31%, and `--start` near 31–32%,
  over the ~28% target. At the spine's ~13 KB budget they land near 22%, 26%, and 27–28%, so the budget is the
  constraint that holds part 1 on every arm (§ The spine), and the spine rewrite must compress today's kept text by
  about 3 KB, most of it from the orientation rules, with mismatch handling (~2.3 KB of prose) contributing.
- **Arm usage frequency** is assumed skewed toward plain resume; no session-arm telemetry exists.
- **The build estimate** (about a week) is the Owner's; the forecast change set above suggests it is tight.
- New prose uses "work unit"; the visible rename to "design unit" (`naming-conventions`) sweeps after the cutover.

## Scope boundary (Won't Do)

- D1's workflow contract shape and D2's general fragment substrate (visibility, override-policy, anchors, resolver)
  for other workflows — after the deadline.
- Agenda compilation for `session-handoff` or `session-recover` (recover shares only the read contract).
- The design tier of always-loaded content: placement of rule and vocabulary text, brief passages reviewers read as
  orientation, `STRATEGY-INDEX`'s maintenance rule (`orientation-surface-compression`, `rules-restructure`,
  `loadset-composition`). The stale `constitution/` references outside the load path are an Errand capture.
- Load-set membership changes, and `loadset-composition`'s decision-rule codification and loop canon.
- Probe performance (`session-init-performance`), the advisory register vocabulary and cadence
  (`operational-advisory-registers`), the `report` / `offer` type unification (`cli-output-contract`, post-cutover).
- Session roles (`session-roles`, provisional) — the arm set is not hard-coded against a later role dimension.

## Coordination

Captured to `USER-INBOX` on 2026-10-31: `§ Work Unit` → `storage-cutover` (retarget the flip's session-init rewrite at
the spine and the cutover module); `§ Work Unit` → `orientation-surface-compression` (it keeps only the design tier);
`§ Errand` (the stale `constitution/` references in the shipped README tree and the configurability strategy);
`§ Work Unit` → `operational-advisory-registers` (decide whether the session-start reminder nudges survive before
building cadence on their markers; this unit keeps them as they are); `§ Work Unit` → `TBD` (a command that moves a
`--plan` grooming session onto its grooming branch, which none does today); `§ Errand`, held until the flip (rename this
cohort to `instruction-discipline` with `cohort-identity-verbs`' `arc rename`, as the cohort document's kickoff
trigger has fired).

## Continuity

- **Readiness:** formalization-ready (`assess-draft-readiness`, 2026-10-31): no open design decision, the two-part
  done-signal stands, and no inbound buffer remains. Three review passes, an author parity sweep, and their fix-check
  rounds found the gaps (the second pass's three majors each dropped a step today's prose runs; the sweep found eight
  material more; the rounds after pass 3 two majors, both in the superseded reset's offer), all folded the same day.
- **Resolved:** depth `high`; Class `Heavy` (estimate, written at capture); stays one work unit; every decision in the
  log.
- **Open:** § Open's two items.
- **Next:** the capture interlock (Class `Heavy`, Priority `P1`, Cohort `agent-context-optimization`, Depends On
  `seam-locus` proposed for the meta write), then `create-spec`. The cohort's recorded rename to
  `instruction-discipline` waits for the flip (§ Coordination), so the meta keeps the current name.

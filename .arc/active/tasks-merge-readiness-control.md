# Task List: Merge Readiness Control

- **Design:** `spec-merge-readiness-control.md`

---

## **Phase 1:** `merge.lock` config axis

_Purpose:_ Register the opt-in axis the lock verbs resolve against, so the control has a validated key to read
before anything consumes it. Foundation phase — Phases 2 and 4 both depend on it.

### `[x]` **1.1 Register `merge.lock` in the config catalog**

- _Goal:_ `arc config status` reports `merge.lock`, and `arc config validate` rejects any value outside
  `draft | none`.

    - `[x]` **1.1.a Register the field in the catalog**
        - Added `enumField("merge.lock", ["draft", "none"], "none")` immediately after `merge.strategy` in
          `src/lib/config/schema.ts` — the catalog index the packaged template mirrors.

    - `[x]` **1.1.b Register the field in the validate domain order**
        - _Goal:_ `arc config validate` actually gates the key, rather than passing it over in silence.
        - Added to `VALIDATION_DOMAIN_ORDER` in `src/commands/config/validate.ts` after `merge.strategy` —
          where that list's own domain grouping puts it, which happens to agree with the catalog here.

    - `[x]` **1.1.c Update the settings fixtures the new key breaks**
        - The seven type-checked full-settings literals took `"merge.lock": "none"`, exactly as predicted:
          `config-format.test.ts`, `status-format.test.ts`, `handlers/release/push.test.ts`,
          `status/run.test.ts`, `release/interlock-validation.test.ts`, `release-push-upstream-init.test.ts`,
          and `handlers/release/commit.test.ts`.
        - The compiler-invisible set was **not** the predicted one. `config/schema.test.ts`,
          `config/inventory.test.ts`, and `config/status-reader.test.ts` broke as expected, but
          `integration/config.test.ts` and `user-handlers.test.ts` did not. The shared fixture corpus
          `__tests__/fixtures/config/cases.ts` did instead — seven validator pass counts, consumed through
          `config/compatibility-validator.test.ts`.

    - `[x]` **1.1.d Extend the validate-output assertion**
        - `commands/config/validate.test.ts` took the new line at its validate-order position. All four
          hard-coded pass counts moved, not only the empty-file summary/total pair.

- _Outcome:_ The key is live on both surfaces — `arc config status` exposes it, `arc config validate` gates it.
  `AGENT_CONSUMABLE_KEYS` went 29 → 30, which two tests assert by bare count
  (`config/status-reader.test.ts`, `status-format.test.ts`); together with the shared fixture corpus above,
  a single new config key costs edits in twelve test files, several of which name no key at all.

### `[x]` **1.2 Ship the key in the `arc-config.yml` template and project instance**

- _Goal:_ A project installing ARC receives `merge.lock: none` with a comment block that explains both modes
  and what enabling costs.

    - `[x]` **1.2.a Add the key and its comment block to the package source**
        - Added after `merge.strategy`, with the section heading widened to `# --- Merge ---`.
        - The comment prices both modes in project terms: `draft` holds every pull request unmergeable until
          release — the cost being a release step before each merge, plus review automation that skips drafts
          staying quiet until then; `none` leaves interlocks and harness permissions as the only guard. It
          names no verb, since the command surface does not exist until Phase 2.

    - `[x]` **1.2.b Mirror the edit into this repository's instance**
        - Applied the same diff by hand, heading included. `diff` between the copies leaves only the
          pre-existing project overrides — no schema, key, or comment delta.

### `[x]` **1.3 Classify the axis in `strategy-configurability-architecture.md`**

- _Goal:_ Someone reading the configurability model meets `merge.lock` everywhere they already meet
  `merge.strategy`, rather than discovering it only in the config file.

    - Added to the runtime-settings list as a host-side hold on merging an open pull request.
    - Added to the behavioral-implications section under **Merge lock**, pricing both values: `none` leaves
      interlocks and harness permissions as the only guard, `draft` makes the hold structural rather than
      procedural at the cost of a release step and quiet draft-skipping review automation.
    - Added to the sample `arc-config.yml` block after `merge.strategy`.
    - Both copies edited package-source-first and verified byte-identical by `diff`. The project-only scope
      list needed no edit, as expected — `merge.*` is classified wholesale.

## **Phase 2:** The merge-lock verbs

_Purpose:_ Retarget the clearance unlock path into `resolve` / `hold` / `release`, so the control's dispatch is
a typed CLI contract before any workflow invokes it.

_Design decisions:_ Retarget rather than rebuild — the existing module already carries the fire site, the
exact-head preflight, the readiness gate, and the host port. The required-status mechanism inside it (workflow
inspection, repository dispatch) is what dies. The command surface moves out of `review` to `merge lock`, so
the envelope registrations move with it while the modules stay under the review-gate tree they draw contracts
from.

### `[x]` **2.1 Retarget the lock resolution module**

- _Goal:_ One module answers every lock question — how a pull request should open, and whether a hold or
  release applies to a live one — and performs the two transitions behind the exact-head preflight.

    - `[x]` **2.1.a Request schemas for the three verbs**
        - `merge-lock.ts` opens with the request contracts: `MergeLockResolveRequestSchema` carries the tree root
          alone, and `MergeLockTransitionRequestSchema` carries the guarded target plus the vehicle. Two schemas
          rather than three — `hold` and `release` take an identical shape, so a duplicated third strict object
          would state the same contract twice; each verb's command registration names the shared one.
        - Result envelopes stay out, per the 2.3 split.

    - `[x]` **2.1.b Opening disposition for `resolve`**
        - _Goal:_ A workflow about to open a pull request learns how to open it without reading configuration
          itself.

        - `resolveMergeLock` reads the key through the injected tri-state collaborator, resolved against the
          request's tree root. `draft` opens locked, `none` and an absent key open plain, and unreadable,
          out-of-domain, or a throwing read all block — the three ways the control could otherwise be
          disabled by silence.
        - The collaborator's concrete reader is deferred to 2.4, where the handler composes its default
          dependencies; the contract and its fail-closed resolution live here.

    - `[x]` **2.1.c `hold` and `release` transitions**
        - _Goal:_ A caller can invoke either unconditionally at its fire site and act only on what comes back.

        - One shared transition path runs both verbs, parameterized by the lock state each moves the pull
          request into and by whether it gates on readiness. Each verb validates the result against its own
          registered contract, so the two envelope families stay separable despite the shared body.
        - The config read precedes every host call, so a disabled lock answers `no-lock / lock-disabled`
          without touching the host at all. Reaching the requested state already is the other `no-lock`, and
          only that distinction separates the two.
        - The port's widened pull-request payload is narrowed back to the shared shape before the readiness
          request is composed — parsing the wide shape into a strict schema that never declared `locked`
          would have produced a control that always blocks and misreports why.

- _Outcome:_ `merge-lock.ts` carries the guards, the readiness gate, and the exact-head preflight forward from
  the unlock orchestrator; the workflow inspection, the repository dispatch, and the clearance constants have
  no successor in it. The config read is the deliberate third precedent the design called for — injected like
  the chunking command's, but strict where the shared reader is fail-soft, because a fail-soft read of this key
  disables the control it guards. The host port it depends on is still the clearance one until 2.2.

### `[ ]` **2.2 Retarget the GitHub host port to draft-state transitions**

- _Goal:_ The port reports live lock state and performs both transitions through `gh`, leaving no
  clearance-workflow surface behind it.

- _Context:_ `resolveRepository` and `resolvePullRequest` stay as they are. `inspectWorkflow` and `dispatch`
  are the clearance-specific pair, and both go.

    - `[ ]` **2.2.a Replace workflow inspection with a live lock-state read**
        - The pull-request read already in the port returns the lock state in the same payload, so no second
          round trip is needed.
        - _Note:_ Widen the **port's own** return type, not the shared live-pull-request schema. That schema is a
          strict object embedded in the public readiness request, which is hand-composed from workflow prose and
          from the merge-gate template the corpus retirement deliberately keeps — a new required field there
          would break every hand-built request.
        - The orchestrator then has to **narrow back**: it strict-parses the port's payload against the shared
          schema today, and forwards that same object into the readiness request, which strict-parses it again.
          Parse against the port-local shape, then narrow to the shared schema before composing that request.
          Skipping this produces a control that always blocks, reporting a cause that is not the real one.

    - `[ ]` **2.2.b Replace repository dispatch with the transition calls**

        - Build `test-first` (one behavior at a time):
            - The port reports a locked pull request as locked and an open one as unlocked
            - A release issues the ready transition and a hold issues its inverse
            - A failed transition surfaces as a blocked outcome rather than an exception escaping the port

### `[ ]` **2.3 Stand up the `merge-lock` envelope family**

- _Goal:_ The three verbs' results validate as registered kernel contracts, and the review command mode enum no
  longer names a lock command.

- _Rationale:_ The command family moves out of `review`, so its envelopes move with it — leaving
  `merge-lock-*` modes inside a `ReviewCommandMode` enum would misfile them permanently.

- _Note:_ This task owns the result envelopes outright, including the round-trip coverage for them. Run it
  before 2.1's envelope-dependent work: the variants are keyed by mode literals this module defines.

    - `[x]` **2.3.a New envelope module with its own mode schema**
        - `merge-lock-command-envelope.ts` owns `merge-lock-resolve` / `-hold` / `-release`, their result
          envelopes, and the shared error envelope, registered into the review domain's registry as four
          strict-current contracts. It sits beside `merge-lock.ts` rather than under `core/`, which is held
          host-agnostic by a corpus scan — the pull-request vocabulary these payloads carry is exactly what
          that scan bans, and the retired unlock envelope sat outside `core/` for the same reason.
        - The blocked-reason enum keeps the repository / pull-request / stale-head / readiness reasons, drops
          the clearance-workflow ones, and adds `config-unresolved` (unreadable or out-of-domain) plus
          `transition-failed`, the successor to the retired dispatch failure that 2.2.b needs. `resolve`'s
          blocked payload carries the config reason alone — no pull request exists to name.
        - A `no-lock` result names its cause (`lock-disabled` / `already-in-state`), preserving the retired
          envelope's habit of saying why a verb was a no-op; only the first never reaches the host.
        - The module builds its own variant helper rather than borrowing the review one, so a blocked result
          can require at least one diagnostic the way the retired envelope did.

    - `[ ]` **2.3.b Excise the unlock registration from the review envelope module**
        - Drop the mode entry, the schema import, and the registry line together — a stale import is the
          failure mode here, and the type checker catches it only if all three go.
        - _Sequencing:_ lands with 2.4, which retires the handler and command path that still emit the mode.

### `[ ]` **2.4 Wire the `arc merge lock` command group and handlers**

- _Goal:_ `arc merge lock <verb> -` accepts a versioned JSON request on stdin and emits exactly one envelope
  per invocation, matching how every sibling review verb is invoked.

- _Approach:_ The handlers are thin delegations over the shared execute-and-emit helper, following the existing
  unlock handler's shape. That helper is typed to the review mode enum the lock modes deliberately leave (2.3),
  so it is generified over a mode union and its error-envelope selection parameterized — the helper is already
  generic over request and result schemas, so widening the mode is smaller than a second helper and avoids two
  divergent emit paths.

    - `[ ]` **2.4.a Generify the shared handler helper and add the three lock handlers**
        - Keep them in the existing review handler module: the modules stay under the review-gate tree for the
          same reason 2.1 gives, and the registrations that module exports are already wired into the
          composition root. The command namespace moving does not move the code.

    - `[ ]` **2.4.b `arc merge` command group with the `lock` subgroup**
        - Register `merge` as a new top-level group whose only child is `lock`; no bare `merge` verb exists,
          and none should be added here.

        - Build `test-first` (one behavior at a time):
            - Each verb is reachable and accepts `-` for stdin
            - `arc review unlock` no longer resolves

    - `[ ]` **2.4.c Declare the three commands in the command-input registry**
        - _Goal:_ The repository's command-input inventory reconciles, rather than failing on three
          undeclared operand sites.
        - Every live operand must carry a matching registration; an inventory test scans the real source tree
          and asserts the counts line up exactly. Each of the three verbs needs one.
        - The stdin side is **group-level, not per-verb**: the review family declares a single `explicit-stdin`
          interaction site at its group path, shared by all fourteen of its verbs, with one matching row in the
          no-input matrix. The matrix rows and the declared interaction paths are asserted as an exact set, so
          three declarations would need three matrix rows and three real-process cases. Because 2.4.a keeps the
          handlers in the existing module reusing its stdin reader, decide which command path owns the
          declaration and add exactly one row for it.
        - Follow the existing review-command registrations — same shape, already composed into the composition
          root.

    - `[ ]` **2.4.d Rekey the handoff-critical rule to the lock verbs**
        - The rule keys on the **immediate** parent, which for `arc merge lock <verb>` is `lock`, not `merge` —
          the nested-group precedent beside it keys on `hosted`, itself a child of `review`. Keying on `merge`
          would silently never match and degrade the guard from refuse to warn.
        - The rule, its module comment, and the matching assertion move together.

### `[ ]` **2.5 Retire and retarget the clearance test surface**

- _Goal:_ Every assertion that names the retired command, mode, or status is gone or repointed, so the suite
  certifies the new contract rather than the old one.

- _Context:_ This is the largest single change in the phase and it is spread across eight files. Nothing here
  is optional cleanup — each assertion fails the moment its subject changes, so the work lands with the
  increment that breaks it rather than as a sweep afterwards.

- _Note:_ Two assertions look in scope and are not: the ones pinning the technical-overview sentence and the
  decompose-workflow absence track documentation the corpus retirement removes, and they move with it.

    - `[ ]` **2.5.a Retarget the unlock unit tests onto the three verbs**
        - Cover each typed action and each blocked reason, including the new config-unreadable reason.

    - `[ ]` **2.5.b Rewrite the review-gate workflow flow coverage**
        - The heaviest single excision — the file carries roughly thirty clearance references, including a case
          asserting that clearance is not inherited across heads and that a stale unlock cannot clear its
          replacement. That case has a direct successor under the new contract: a release does not carry across
          a head change. Port the intent rather than deleting it.

    - `[ ]` **2.5.c Repoint the CLI-surface and schema-registration assertions**
        - The review help-text and command-path assertions, the schema-registration mapping, and two exhaustive
          sorted envelope-ID lists all name the retired mode; the ID lists are order-sensitive.

    - `[ ]` **2.5.d Retarget the review handler tests and drop the clearance fixture**
        - The handler import and describe block move to the lock handlers; the clearance status-history fixture
          has no consumer once they do.

## **Phase 3:** Fire-site substitution

_Purpose:_ Put the verbs at their fire sites in the three lifecycle workflows that open pull requests against
the base branch, replacing the clearance invocation and adding the calls the open-locked rule needs, so the
control is live end to end.

_Design decisions:_ Park and resume also open pull requests and are deliberately left unlocked — mechanical
lifecycle rotations carrying no code content, opened and merged inside one authorized session. The exclusion is
priced in the design, not an omission.

### `[ ]` **3.1 Substitute the fire sites in `integrate-work-unit.md`**

- _Goal:_ The integration workflow opens its pull request locked and releases inside explicit merge
  authorization, dispatching on returned actions rather than reading config or pull-request state itself.

- _Note:_ The terminal sequence stays direct-merge, never auto-merge — see `notes-merge-readiness-control.md`
  § Auto-merge disarm semantics for why arming-time guards cannot substitute for it.

- _Note:_ Every edit below lands in both the package source and this repository's instance.

    - `[ ]` **3.1.a Resolve before `gh pr create` and dispatch on all three actions**
        - `locked / open-locked` creates the pull request locked; `none / open-plain` creates it as today.
        - `blocked / stop` halts creation. This is a new behavior for the workflow — an unreadable or
          out-of-domain config now aborts before a pull request exists, which is the fail-closed property the
          verb is built for and the only place it can be honored.

    - `[ ]` **3.1.b Replace the unlock invocation at the integration interlock**
        - The gate's structure and authority are unchanged; its **text** is not. The interlock block itself
          instructs the agent to state that approval "invokes the exact-head unlock" and authorizes merge only
          if "the required status" rechecks succeed — both name machinery this work unit retires, inside the
          very gate being retargeted.
        - Update the driver-lifecycle assertion that pins the retired verb name to this workflow's text, in the
          same increment — it fails the moment the prose changes.

    - `[ ]` **3.1.c Move the provenance update ahead of the release**
        - _Goal:_ A human opening a released pull request sees the complete record of what was done, rather
          than a summary that lands after the lock is already off.
        - The review-record replacement currently sits after the release, two steps before the merge. The
          errand workflow already orders it correctly; only this one is out of order.
        - _Note:_ This is the single resequencing the design sanctions, against a Non-Goal that otherwise
          forbids reordering steps — it is a named fire site, not an opportunistic tidy.

    - `[ ]` **3.1.d Re-lock on any non-merge exit after the release**
        - _Goal:_ A released pull request that is not about to merge is locked again, whatever ends the
          sequence.
        - Between release and merge the workflow re-reads required checks, replaces the review record, and
          re-reads base drift — and the drift read alone has three outcomes, only one of which merges. Any exit
          that is not the merge command leaves the pull request released and open with no return path that
          re-locks it, so the re-lock is scoped to every such exit rather than enumerated per check.
        - Review and triage run before the integration interlock, so findings always arrive while the pull
          request is still locked; this window is the only one that needs the re-lock.

### `[ ]` **3.2 Substitute the fire sites in `run-errand.md`**

- _Goal:_ Both errand lanes route through the lock verbs — the pull request opens locked whichever lane it
  turns out to belong to, the reviewed lane releases at its owner-review hand-off, and the grooming lane
  releases immediately before arming auto-merge.

- _Rationale:_ The errand merge lane is deliberately undetermined at PR-open — this workflow says not to select
  one there, and it first resolves two steps later. So the pull request opens locked either way, which is why
  the resolve call needs no lane input and why the escalation reroute needs no transition: an escalating pull
  request was never released.

- _Note:_ Every edit below lands in both the package source and this repository's instance.

    - `[ ]` **3.2.a Resolve before `gh pr create` and dispatch on all three actions**
        - Same three-way mapping as the integration lane, including the `blocked / stop` halt.

    - `[ ]` 3.2.b Replace the reviewed-lane unlock invocation with a release

    - `[ ]` **3.2.c Release on the grooming lane before arming auto-merge**
        - Structurally required rather than a courtesy: auto-merge cannot be armed on a locked pull request.
        - Place it after the lane action's own exact-head recheck, so the unlocked window stays as narrow as
          the arming sequence itself.
        - Leave the escalation reroute alone — it needs no lock transition, and adding one would be the bug.

    - `[ ]` **3.2.d Correct the lane-closing paragraph and the interlock text**
        - The paragraph closing the lane section states that the auto-merge lane invokes no unlock because a
          trusted CI poster supplies the status — it becomes false the moment 3.2.c lands, two lines above it.
          Rewrite it to describe the release the lane now performs and the gate that still verifies it.
        - The step-5 interlock text also names the exact-head unlock for the reviewed lane; repoint it.

    - `[ ]` **3.2.e Re-lock when a head change restarts the reviewed lane**
        - _Goal:_ A fix pushed in response to owner review re-enters review locked, not released.
        - The reviewed lane leaves the pull request open and released for owner review, and a head change
          returns it to the review loop — the one place in this workflow where a released pull request starts
          accepting commits again.

### `[ ]` **3.3 Substitute the fire sites in `drain-inbox.md`**

- _Goal:_ The inbox drain's auto-merge pull requests open locked and release before arming, so the one
  remaining lane with nothing human in the loop is covered like the errand grooming lane it mirrors.

- _Rationale:_ This lane batches captures into an auto-merge pull request per lane and arms after its own
  classification — the same shape as the errand grooming lane, and the same absence of a human at the merge.
  Leaving it unlocked while locking its twin would read as an oversight rather than a decision.

- _Note:_ Every edit below lands in both the package source and this repository's instance.

    - `[ ]` **3.3.a Resolve before the grooming pull request is created**
        - Same three-way mapping as the other two lanes, including the `blocked / stop` halt.

    - `[ ]` **3.3.b Release before auto-merge is armed**
        - Structurally required, as on the errand lane: auto-merge cannot be armed on a locked pull request.

## **Phase 4:** Host-side cutover and decision record

_Purpose:_ Retire this repository's clearance producer and required status together with the dispatch removal,
switch the repository onto the new control, and record the decision — so the work unit's own integration PR is
the first to run the draft-first lifecycle.

_Design decisions:_ The required-status drop, the CI workflow deletion, and Phase 2's dispatch removal are one
unit — a deleted producer with a live required context blocks every pull request permanently, this work unit's
own included. That coupling is what forced the corpus retirement into its own follow-on rather than allowing a
new-versus-old split.

### `[ ]` **4.1 Retire this repository's clearance CI workflow and required status**

- _Goal:_ Nothing produces or requires the clearance status on this repository, and no pull request waits on a
  context that will never post.

- **Additional Context:** `notes-merge-readiness-control.md` § Base-branch enforcement surfaces — the recorded
  baseline and the coverage comparison 4.1.d depends on.

    - `[ ]` **4.1.a Extract the lane-classification gate into its own workflow, as attestation**
        - _Goal:_ The grooming lane keeps a server-side classification of the exact head, recorded where a
          later reader can check it against what the lane actually did.

        - _Context:_ The clearance workflow holds two unrelated mechanisms. Its dispatch-triggered jobs are the
          producer this work unit retires; its pull-request-triggered job is the grooming lane's gate — it posts
          pending on every pull request, classifies, confirms the live pull-request pair, and posts success only
          for a planning-lane change.

        - _Approach:_ Move that job to its own workflow, rename the context it posts, and make it terminal on
          **both** classifier arms. Preserved verbatim it strands every reviewed-lane pull request on a required
          context nothing resolves — the single-producer trap the design turns on. Carry the classifier verdict
          and the live-pair result in the status description, so the check that is genuinely independent of the
          lane's own classification survives even though the veto does not.

        - Rename the step names too, not just the posted context — they name the retired machinery and the
          verification criterion greps for it.
        - _Note:_ The renamed context is **not** added to any required-check list. A `pull_request_target`
          workflow runs from the base branch, so requiring it would outrun its own producer until this change
          merges; and the job skips fork pull requests by design, so a required context nothing posts would
          strand the contributor path. The attestation is observational.
        - Keep the trigger set and permissions otherwise as they are: the job's value is that it runs where the
          agent's token does not.

    - `[ ]` **4.1.b Delete the remaining clearance workflow**
        - Only the dispatch-triggered producer is left by this point; confirm that before deleting.

    - `[ ]` **4.1.c Re-assert the extracted workflow's security properties**
        - _Goal:_ The properties that make the gate trustworthy are pinned by tests in its new home, rather
          than surviving the move by luck.
        - The host-workflow suite pins the clearance file by name in more than a dozen places, including this
          job's trusted checkout, its target resolution, and its status reset — all asserted against the old
          filename. Those assertions move with the job or die with the dispatch producer; decide which per
          assertion rather than deleting the block.
        - The properties worth re-asserting are the ones extraction could silently lose: the trusted checkout
          pinned to the workflow SHA rather than the pull-request head, file-level permissions, and that
          nothing executes out of the pull-request data checkout.
        - The assertion that the retired file is the only workflow surviving its family needs rewriting, not
          deleting — the extracted workflow is its successor.

    - `[ ]` **4.1.d Retire classic branch protection, which holds the requirement**
        - _Goal:_ Nothing requires the clearance status, and `main` is left under one enforcement surface
          instead of two.

        - _Approach:_ Two surfaces are live on `main` at once — classic branch protection and the
          `main-protection` ruleset. The clearance status sits in the classic required-checks list beside the CI
          roll-up alias; the ruleset requires the alias alone. Deleting classic protection removes the
          requirement in one act rather than surgically editing a two-element list, and leaves no redundant
          surface for the next reader to trip over.

        - _Rationale:_ The ruleset covers every protection classic provides — deletion, force-push, required
          pull request, the CI alias — and is stricter on two axes: it requires review-thread resolution, and it
          admits no bypass actors where classic permits admin bypass. Verify that comparison against both
          surfaces at implementation rather than trusting it; the whole act rests on it.

        - Re-read both surfaces and refresh the recorded baseline **before** deleting. Branch protection is not
          versioned and no diff records its removal, so the recovery path has to be a file in the repository,
          and the recorded state reflects one point in time.
        - A host-side act against repository settings — re-read both surfaces afterwards rather than assuming
          the change took, and confirm the ruleset is still `active`.
        - Do this before the work unit's own pull request needs to merge; the status has no producer from
          Phase 2 onward, so the requirement can never be satisfied again.

### `[ ]` **4.2 Enable `merge.lock: draft` for this repository**

- _Goal:_ This repository runs the control it ships, so the work unit's own integration is the first live
  exercise of it.

### `[ ]` **4.3 Record ADR-031 and amend ADR-029**

- _Goal:_ A reader who asks why ARC stopped using a required status finds the threat model, the alternatives,
  and the priced boundaries in one place rather than reconstructing them from the change.

    - `[ ]` **4.3.a Author ADR-031**
        - Cover the settled threat model, the alternatives weighed and why each lost, the three narrowed
          boundaries as priced trades, the config axis, and the command naming.
        - Record the retained-property honesty the design already carries: the retired mechanism was better on
          push re-lock and on fail-closed installation, and the trade was made anyway.

    - `[ ]` **4.3.b Amend ADR-029**
        - _Goal:_ A reader of the older decision is routed to the newer one without either record being
          rewritten.

        - Scope the amendment to Decision #4 alone. Decision #1 already assigns the CLI exact-head lock and
          unlock operations, which is what the new verbs do — the design lands inside authority that decision
          already granted, so it needs no amendment and claiming otherwise would overstate the change.
        - Follow the amendment convention: append-only, placed in the Consequences section, opening with a
          dated annotation, and mentioned in the commit message.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A work-unit integration PR on this repository is unmergeable by any single accidental act — UI click,
  `gh pr merge`, `gh pr merge --admin` — from open through review, triage, and composition, until the
  authorized terminal sequence releases the lock and exact-head merges it

- `[ ]` No `arc-cleared` producer or enforcement point survives: `grep -riE "arc.cleared|arc.clearance"` over
  `packages/arc-framework/src/` and `.github/workflows/` returns nothing, and no base-branch enforcement surface
  requires the context — `__tests__/` and `.github/CODEOWNERS` are the corpus retirement's and stay out of scope

- `[ ]` The lane-classification gate still runs on every pull request under its renamed context, posts a
  terminal state on both classifier arms, and records its verdict and live-pair result; no required-check list
  gained an entry

- `[ ]` `arc merge lock resolve`, `arc merge lock hold`, and `arc merge lock release` exist with the specified
  typed actions, registered as `merge-lock-*` envelope modes, and covered per action and per blocked reason

- `[ ]` `merge.lock` is exposed by `arc config status`, accepted by `arc config validate`, and present in the
  shipped `arc-config.yml` template

- `[ ]` Every fire site in `integrate-work-unit.md`, `run-errand.md`, and `drain-inbox.md` invokes a lock verb
  and dispatches on its returned action; no workflow prose reads `merge.lock`, classifies a lane, or reads
  pull-request lock state

- `[ ]` ADR-031 exists and ADR-029 carries the dated Tier-2 amendment

- `[ ]` This repository has no `arc-clearance.yml` workflow, no `arc-cleared` required status on any
  base-branch enforcement surface, `merge.lock: draft` set, and `main` protected by the ruleset alone

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

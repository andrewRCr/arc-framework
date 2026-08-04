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

### `[x]` **2.2 Retarget the GitHub host port to draft-state transitions**

- _Goal:_ The port reports live lock state and performs both transitions through `gh`, leaving no
  clearance-workflow surface behind it.

    - `[x]` **2.2.a Replace workflow inspection with a live lock-state read**
        - `GhMergeLockPort.resolvePullRequest` returns the lock state alongside the fields it already read,
          from the same call — the payload carried it all along. A payload with no readable lock state is
          refused at the boundary rather than defaulted.
        - The widening is the port's own return type; the shared live-pull-request schema is untouched, so
          every hand-composed readiness request still validates.

    - `[x]` **2.2.b Replace repository dispatch with the transition calls**
        - A release flips the pull request ready and a hold flips it back, both through the same `gh`
          subcommand pair. The clearance dispatch and its payload builder have no successor.
        - Config and readiness stay injected collaborators, as they were on the retired port, so the class
          satisfies the whole lock boundary while owning only the host half of it.
        - A failed transition is proven blocked through the real port composed with the release verb, not
          only through a fake — the port raises, and the orchestrator is what converts it.

- _Outcome:_ Both clearance-specific methods are gone from the host surface. The two that survive are
  unchanged, which is what let the exact-head preflight carry over without re-verification.

### `[x]` **2.3 Stand up the `merge-lock` envelope family**

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

    - `[x]` **2.3.b Excise the unlock registration from the review envelope module**
        - Mode entry, schema import, and registry line dropped together, landed with 2.4 alongside the
          handler and command path that still emitted the mode. `ReviewCommandMode` names only review
          commands again, and the retired orchestrator and host port are deleted.

### `[x]` **2.4 Wire the `arc merge lock` command group and handlers**

- _Goal:_ `arc merge lock <verb> -` accepts a versioned JSON request on stdin and emits exactly one envelope
  per invocation, matching how every sibling review verb is invoked.

- _Approach:_ The handlers are thin delegations over the shared execute-and-emit helper, following the existing
  unlock handler's shape. That helper is typed to the review mode enum the lock modes deliberately leave (2.3),
  so it is generified over a mode union and its error-envelope selection parameterized — the helper is already
  generic over request and result schemas, so widening the mode is smaller than a second helper and avoids two
  divergent emit paths.

    - `[x]` **2.4.a Generify the shared handler helper and add the three lock handlers**
        - The shared helper now takes a mode union spanning both families and an error envelope selected per
          call, defaulting to the review family's. One emit path still serves every verb.
        - The three handlers live in the existing review handler module, and the two transitions share one
          internal delegation differing only by mode, result schema, and verb. `readMergeLockSetting` — the
          strict tri-state reader the 2.1 contract deferred to here — composes into the default port beside
          the readiness evaluator.

    - `[x]` **2.4.b `arc merge` command group with the `lock` subgroup**
        - `merge` is a group with `lock` as its only child and no bare verb of its own; the three verbs hang
          off `lock` and each takes the same JSON request operand. `arc review unlock` no longer resolves.

    - `[x]` **2.4.c Declare the three commands in the command-input registry**
        - _Goal:_ The repository's command-input inventory reconciles, rather than failing on three
          undeclared operand sites.
        - Three operand registrations, same shape as the review family's and composed through the same export.
        - No new interaction declaration and no new matrix row: the inventory keys interaction ownership by
          **source site**, not by command path, and the one `process.stdin` site the lock verbs reuse is
          already declared under `review`. Declaring it a second time is what the inventory rejects, so the
          "one row for it" the plan anticipated resolves to the row that already exists.

    - `[x]` **2.4.d Rekey the handoff-critical rule to the lock verbs**
        - Keyed on `lock`, the immediate parent, with the rule, its module comment, and the assertion moving
          together. The assertion also pins that the `lock` group itself is not handoff-critical, which is
          what would silently be true if the key had landed on `merge`.

### `[x]` **2.5 Retire and retarget the clearance test surface**

- _Goal:_ Every assertion that names the retired command, mode, or status is gone or repointed, so the suite
  certifies the new contract rather than the old one.

- _Context:_ This is the largest single change in the phase and it is spread across eight files. Nothing here
  is optional cleanup — each assertion fails the moment its subject changes, so the work lands with the
  increment that breaks it rather than as a sweep afterwards.

- _Note:_ Two assertions look in scope and are not: the ones pinning the technical-overview sentence and the
  decompose-workflow absence track documentation the corpus retirement removes, and they move with it.

    - `[x]` **2.5.a Retarget the unlock unit tests onto the three verbs**
        - The unlock orchestrator and host-port tests are gone with their subjects; `merge-lock.test.ts` and
          `hosts/github/merge-lock.test.ts` carry every typed action and every blocked reason, landed with
          2.1 and 2.2 rather than as a sweep afterwards.

    - `[~]` **2.5.b Rewrite the review-gate workflow flow coverage** — deferred to Task 4.1.c
        - The half whose subject this phase retired is done: the stale-unlock case and its fixture helper are
          gone, their intent ported to the stale-head block both transition verbs now carry.
        - The rest pins `arc-clearance.yml`, which still runs on every pull request until Phase 4 retires it —
          excising those assertions here would drop coverage of a live workflow. Task 4.1.c already owns them
          by name and decides per assertion whether each moves with the extracted gate or dies with the
          dispatch producer, so the remainder belongs there rather than in a new task.

    - `[x]` **2.5.c Repoint the CLI-surface and schema-registration assertions**
        - The malformed-contract cases cover the three lock verbs, the review help text now asserts the
          retired verb's absence, and a new case proves `arc review unlock` does not resolve. The
          registration mapping and both sorted ID lists carry the four merge-lock contracts and no longer
          carry the retired one.

    - `[x]` **2.5.d Retarget the review handler tests and drop the clearance fixture**
        - The describe block became three: the opening disposition, the two transitions, and a case proving
          each verb emits its **own** error envelope rather than the review family's — the thing
          parameterizing the emit path could have gotten wrong. The fixture is deleted along with its last
          consumer.

## **Phase 3:** Fire-site substitution

_Purpose:_ Put the verbs at their fire sites in the three lifecycle workflows that open pull requests against
the base branch, replacing the clearance invocation and adding the calls the open-locked rule needs, so the
control is live end to end.

_Design decisions:_ Park and resume also open pull requests and are deliberately left unlocked — mechanical
lifecycle rotations carrying no code content, opened and merged inside one authorized session. The exclusion is
priced in the design, not an omission.

### `[x]` **3.1 Substitute the fire sites in `integrate-work-unit.md`**

- _Goal:_ The integration workflow opens its pull request locked and releases inside explicit merge
  authorization, dispatching on returned actions rather than reading config or pull-request state itself.

    - `[x]` **3.1.a Resolve before `gh pr create` and dispatch on all three actions**
        - The resolve call sits with the pre-open composition, and the creation block carries both arms —
          plain and `--draft` — selected by the returned action, so the only thing the action changes about
          the call is whether the pull request opens locked.
        - `blocked / stop` halts creation, the new behavior the verb's fail-closed config read exists for.

    - `[x]` **3.1.b Replace the unlock invocation at the integration interlock**
        - `arc merge lock release -` takes the site, dispatching `released / proceed`, `no-lock / none`, and
          `blocked / stop`. The interlock's own text now states the exact-head release and drops the required
          status from what approval authorizes; the gate's structure and authority are untouched.
        - The driver-lifecycle assertion pins all three verbs rather than the one it replaced — the resolve and
          hold sites are as load-bearing as the release, and pinning only the release would let either of the
          other two disappear silently.

    - `[x]` **3.1.c Move the provenance update ahead of the release**
        - _Goal:_ A human opening a released pull request sees the complete record of what was done, rather
          than a summary that lands after the lock is already off.
        - The review-record replacement now precedes the release rather than following it.

    - `[x]` **3.1.d Re-lock on any non-merge exit after the release**
        - _Goal:_ A released pull request that is not about to merge is locked again, whatever ends the
          sequence.
        - Scoped as a standing rule over the release-to-merge window rather than enumerated per check, so the
          drift read's non-clean verdicts and any stop the rechecks surface are all covered. A `blocked / stop`
          hold is surfaced with the exit that prompted it rather than in place of it — a failed re-lock must
          not swallow the reason the workflow was leaving.

- _Outcome:_ The lock verbs bracket the whole live-pull-request window: locked at creation, released only
  inside merge authorization, and re-locked on every exit that is not the merge command. Sequencing the record
  replacement ahead of the release is what makes the released window safe to hand to a human, and it is the one
  resequencing the design sanctions.

### `[x]` **3.2 Substitute the fire sites in `run-errand.md`**

- _Goal:_ Both errand lanes route through the lock verbs — the pull request opens locked whichever lane it
  turns out to belong to, the reviewed lane releases at its owner-review hand-off, and the grooming lane
  releases immediately before arming auto-merge.

- _Rationale:_ The errand merge lane is deliberately undetermined at PR-open — this workflow says not to select
  one there, and it first resolves two steps later. So the pull request opens locked either way, which is why
  the resolve call needs no lane input and why the escalation reroute needs no transition: an escalating pull
  request was never released.

    - `[x]` **3.2.a Resolve before `gh pr create` and dispatch on all three actions**
        - Sits after the exact-head remote recheck the lane already performs, so the resolve is the last thing
          before creation. The prose states outright that the lane is unresolved here and that no lane input
          reaches the call — the reason the verb takes none.

    - `[x]` **3.2.b Replace the reviewed-lane unlock invocation with a release**
        - The three-action dispatch is stated once for both lanes rather than twice, since 3.2.c gave the
          grooming lane the same verb two paragraphs above.

    - `[x]` **3.2.c Release on the grooming lane before arming auto-merge**
        - Placed after the classifier recheck and before the config probe, so an escalating change returns to
          Step 5 while still locked and the released window is exactly the arming sequence.

    - `[x]` **3.2.d Correct the lane-closing paragraph and the interlock text**
        - The paragraph now says both lanes release and that the release ends the lock rather than the gate:
          the grooming lane must release to arm at all, and the server-side classifier still reruns over the
          exact base/head pair and records its own verdict.
        - The step-5 interlock text names the exact-head release on whichever lane resolves, replacing the
          reviewed-lane-only unlock.

    - `[x]` **3.2.e Re-lock when a head change restarts the reviewed lane**
        - _Goal:_ A fix pushed in response to owner review re-enters review locked, not released.
        - The re-lock and the escalation exemption are stated together — the one place a released pull request
          starts accepting commits again, next to the one reroute that needs no transition because it was
          never released. Separating them invites adding the transition the design calls a bug.

- _Outcome:_ The open-locked rule is what makes the lane-undetermined PR-open safe, and both lanes now carry
  the release their own landing mechanics require. The auto-merge lane's is structural — arming is impossible
  otherwise — so the lock costs it only the window between the two commands.

### `[x]` **3.3 Substitute the fire sites in `drain-inbox.md`**

- _Goal:_ The inbox drain's auto-merge pull requests open locked and release before arming, so the one
  remaining lane with nothing human in the loop is covered like the errand grooming lane it mirrors.

- _Rationale:_ This lane batches captures into an auto-merge pull request per lane and arms after its own
  classification — the same shape as the errand grooming lane, and the same absence of a human at the merge.
  Leaving it unlocked while locking its twin would read as an oversight rather than a decision.

    - `[x]` **3.3.a Resolve before the grooming pull request is created**
        - The lane has no literal `gh pr create` block to hang the call beside, so the dispatch rides the
          PR-open sentence itself — the point where the workflow says the pull request is created.

    - `[x]` **3.3.b Release before auto-merge is armed**
        - Placed after the lane classification and before arming, matching the errand grooming lane's
          ordering, and naming that lane so the two read as one decision rather than a coincidence.

## **Phase 4:** Host-side cutover and decision record

_Purpose:_ Retire this repository's clearance producer and required status together with the dispatch removal,
switch the repository onto the new control, and record the decision — so the work unit's own integration PR is
the first to run the draft-first lifecycle.

_Design decisions:_ The required-status drop, the CI workflow deletion, and Phase 2's dispatch removal are one
unit — a deleted producer with a live required context blocks every pull request permanently, this work unit's
own included. That coupling is what forced the corpus retirement into its own follow-on rather than allowing a
new-versus-old split.

### `[x]` **4.1 Retire this repository's clearance CI workflow and required status**

- _Goal:_ Nothing produces or requires the clearance status on this repository, and no pull request waits on a
  context that will never post.

- **Additional Context:** `notes-merge-readiness-control.md` § Base-branch enforcement surfaces — the recorded
  baseline and the coverage comparison 4.1.d depends on.

- _Outcome:_ `grep -riE "arc.cleared|arc.clearance"` over the CLI source and the host workflows returns
  nothing, and no base-branch enforcement surface requires the context. The producer and the requirement left
  together, as the design's coupling demanded: between the two acts this repository could not have merged
  anything, which is why they belong to one phase rather than two.

    - `[x]` **4.1.a Extract the lane-classification gate into its own workflow, as attestation**
        - _Goal:_ The grooming lane keeps a server-side classification of the exact head, recorded where a
          later reader can check it against what the lane actually did.

        - `arc-lane-attestation.yml` carries the pull-request-triggered job under the `arc-lane` context,
          keeping the trusted-checkout / reset / inert-data-checkout / publish sequence intact. Its trigger set
          narrows to `pull_request_target` alone — the dispatch trigger belonged to the producer.
        - Both classifier arms now reach one terminal `success` write and the verdict rides the description:
          the planning arm confirms the live pair and says so, the reviewed arm records that no auto-merge
          eligibility was asserted. A failing state was available and rejected — the context is required
          nowhere, so a red mark on an ordinary reviewed-lane change would report a problem that does not
          exist, and pending-forever is what the extraction exists to end.
        - _Note:_ The renamed context is **not** added to any required-check list. A `pull_request_target`
          workflow runs from the base branch, so requiring it would outrun its own producer until this change
          merges; and the job skips fork pull requests by design, so a required context nothing posts would
          strand the contributor path. The attestation is observational.

    - `[x]` **4.1.b Delete the remaining clearance workflow**
        - Confirmed before deleting: only the dispatch-triggered `validate` / `write-status` pair was left.
        - The coupling audit's checked-in corpus inventory pins repository-root paths exactly, so the rename
          had to land there too — a second inventory the plan did not name, found by Tier 2 rather than by
          reading the task text.

    - `[x]` **4.1.c Re-assert the extracted workflow's security properties**
        - _Goal:_ The properties that make the gate trustworthy are pinned by tests in its new home, rather
          than surviving the move by luck.
        - Per assertion: the two dispatch-producer blocks died with their subject; the extracted job's block
          moved and absorbed the file-level `permissions: {}`, the path-less trusted checkout, and the
          nothing-executes-from-the-data-checkout sweep the producer's block had owned. The family-survivor
          assertion was rewritten onto the successor and now also pins the retired file's absence.
        - A second block covers what extraction newly has to prove: exactly one pending reset and one terminal
          write on the same head, no failing state, and both arms reaching the write.
        - Closes the half of Task 2.5.b deferred here.

    - `[x]` **4.1.d Retire classic branch protection, which holds the requirement**
        - _Goal:_ Nothing requires the clearance status, and `main` is left under one enforcement surface
          instead of two.

        - Classic protection deleted outright rather than edited down to one context, so the redundant surface
          goes with the requirement.
        - The coverage comparison was re-verified against both live surfaces before acting, and came back
          wider than recorded: the ruleset is stricter on four axes, not two — it also pins the required
          check's producer to an integration ID where classic accepted any writer, and restricts merge methods
          where classic did not.
        - Baseline refreshed from the live API before the deletion and the post-state recorded after it.
          Nothing else in the repository records what classic carried, so the note is the whole recovery path.
        - Verified after: classic returns `404 Branch not protected`, `main` is still `protected: true`, and
          all four ruleset rules resolve for `main` at `enforcement: active` with no bypass actors. Required
          checks are `merge-ok` alone.

### `[x]` **4.2 Enable `merge.lock: draft` for this repository**

- _Goal:_ This repository runs the control it ships, so the work unit's own integration is the first live
  exercise of it.

- _Outcome:_ `merge.lock: draft` in this instance's `arc-config.yml`; `arc config validate` passes and
  `arc merge lock resolve -` returns `locked / open-locked` against the live tree. Verified by running the verb
  rather than by reading the key back, since the strict read is the half that could fail silently.

### `[x]` **4.3 Record ADR-031 and amend ADR-029**

- _Goal:_ A reader who asks why ARC stopped using a required status finds the threat model, the alternatives,
  and the priced boundaries in one place rather than reconstructing them from the change.

    - `[x]` **4.3.a Author ADR-031**
        - `adr-031-lock-merges-with-draft-state.md` carries the settled threat model, the two limits the
          verification exposed, the six decisions, and the boundaries as priced trades rather than as
          consequences that happened to fall out.
        - The retained-property honesty leads the Negative section outright — push re-lock and fail-closed
          installation were both better on the retired mechanism, and the trade was made anyway.
        - The producer-identity limit is recorded as proportionality rather than as a defect, and the
          admin-bypass one as configuration-conditional. Overstating either would make the decision look
          forced when it was a cost judgment.

    - `[x]` **4.3.b Amend ADR-029**
        - _Goal:_ A reader of the older decision is routed to the newer one without either record being
          rewritten.

        - Scoped to Decision #4's mechanism: the lock's purpose, its exact-current-candidate scope, and its
          refusal to claim evidence or merge authority are stated as unchanged, so only the host mechanism
          reads as replaced. The amendment names Decision #1 as the authority the new verbs land inside
          rather than as something amended.
        - Append-only, dated, at the head of Consequences.

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

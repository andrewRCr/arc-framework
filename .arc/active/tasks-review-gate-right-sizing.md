# Task List: Review Gate Right-Sizing

- **Design:** `spec-review-gate-right-sizing.md`

---

## **Phase 1:** Standard-review choreography and hosted-PR adapters

_Purpose:_ Establish the uniform standard-review driver and surviving hosted-PR source paths before deleting the
shadow runtime that currently contains their reusable pieces.

### `[x]` **1.1 Establish hosted request, await, and thread-settlement verbs**

- _Goal:_ Every mechanical hosted-review action has one strict, resumable JSON contract whose returned
  `state -> nextAction` pair is sufficient to drive the next step without prose interpreting provider state.

    - `[x]` **1.1.a Define and register the hosted-request contract**

        - Added the strict hosted request envelope, self-contained GitHub-artifact handle, typed safe-unavailability
          and ambiguous-delivery outcomes, and the public `arc review hosted request` handler/CLI surface without
          introducing controller, receipt, or local operation state.

    - `[x]` **1.1.b Re-home bounded hosted-review observation behind the await verb**

        - Added the exact-head-aware `arc review hosted await` contract with bounded exponential backoff, immediate
          terminal normalization, safe read-side unavailability, and resumable timeout results that preserve the
          durable request handle across repeated calls.

    - `[x]` **1.1.c Re-home direct thread replies and resolution behind the settlement verb**

        - Added `arc review hosted settle` with exact actor/head validation, direct replies at the originating
          comment, canonical reply and thread-resolution confirmation, idempotent already-settled handling, and
          explicit missing-thread/comment outcomes without receipt or relay state.

### `[x]` **1.2 Re-home both hosted adapters behind deterministic ordered failover**

- _Goal:_ Both hosted providers remain independently selectable production paths, and a typed availability failure
  from the preferred source moves automatically to the next configured source without weakening real failures.

    - `[x]` **1.2.a Re-home the CodeRabbit hosted path behind the new verbs**

        - Re-homed CodeRabbit request and exact-head observation behind the lean hosted contracts and a shared
          developer-authenticated `gh api` port, retaining immutable provider identity, normalized finding loci,
          and distinct rate-limit/transient/terminal outcomes without receipt qualification or frontline changes.

    - `[x]` **1.2.b Re-home the Codex hosted path behind the same contract**

        - Re-homed Codex as an independently selectable hosted source that creates `@codex review`, observes the
          immutable App/bot identities through the common exact-head contract, and normalizes clean/findings and
          availability outcomes without carrying guidance-evidence qualification into the lean path.

    - `[x]` **1.2.c Make provider preference and fallback total**

        - Added a narrow ordered selector that falls through only on `rate-limited` or `transient-unavailable`,
          preserves pending observation, stops on ambiguous/terminal outcomes, consumes a pass only on completion,
          and returns the full attempted-provider history for selected, exhausted, and invalid source lists.

### `[x]` **1.3 Bind standard-review policy, ordered sources, pass ceilings, and opt-out**

- _Goal:_ Configuration selects one source per review role and bounds its cycles, while an installation with no
  standard source reaches a clean no-op despite the change-shaped obligation.

    - `[x]` **1.3.a Add typed ordered-source and pass-ceiling settings**

        - Added ordered frontline and standard source settings plus positive safe-integer ceilings across typed
          config status, validation, and both config copies; generalized frontline pass contracts beyond the
          former two-pass domain while preserving exact allowance checks.

    - `[x]` **1.3.b Build the typed review-policy driver**

        - Added the strict `arc review resolve` transition contract for independent frontline and standard lanes,
          ordered capability-aware fallback, target-bound whole/chunked scope, logical pass accounting, terminal
          and disposition consequences, and idempotent exact one-pass ceiling overrides without persistent state.

    - `[x]` **1.3.c Prove the public CLI surface and default-install contract**

        - Added handler-contract and built-artifact integration coverage for help-visible `review resolve` and
          hosted verbs, strict JSON rejection, config hydration, and a credential-free package-default no-op.

- _Outcome:_ The landed standard-review projection now drives two independently configured review lanes through
  one strict public transition surface; ordered source fallback and pass ceilings remain dormant by default, so an
  unconfigured installation reaches a clean terminal without invoking any local or hosted carrier.

## **Phase 2:** Exact-head merge guard

_Purpose:_ Build the single readiness authority and its two authorized status posters so every guarded reviewed
head is born locked while planning-only changes retain their existing lane.

### `[x]` **2.1 Implement the vehicle-aware readiness authority and unlock dispatch**

- _Goal:_ Local preflight and host-side unlock accept or reject a head by the same lifecycle-readiness definition,
  and dispatch can never clear a different SHA than the one explicitly authorized.

    - `[x]` **2.1.a Define vehicle readiness once in the CLI**

        - Added one strict readiness evaluator and handler envelope over exact live PR/head identity and the closed
          WU/Errand vehicle union. Cadence-specific WU checks validate secure supplied-tree artifacts, archive and
          cohort closeout, Completion Notes, optional Release Notes, and the rendered project-readiness view;
          Errands remain explicitly exempt from WU products.

    - `[x]` **2.1.b Add exact-head unlock preflight and dispatch**

        - Added strict unlock orchestration over injected repository, PR, default-branch workflow, readiness, and
          dispatch ports. Only an exact open head with determinate workflow presence and ready products emits the
          SHA-bound `arc-clearance` payload; absence no-ops and every unreadable, stale, or failed path stops.

    - `[x]` **2.1.c Lock the command contract into CLI and integration coverage**

        - Registered public `arc review readiness` and `arc review unlock` commands, strict handler envelopes, and
          the developer-authenticated GitHub adapter. Handler tests inject filesystem/effect ports, while packaged
          CLI coverage proves help visibility and strict malformed-input behavior without live network access.

- _Outcome:_ Local and hosted unlock callers now share one exact-head lifecycle definition; default-branch workflow
  presence controls dispatch availability, while absent or indeterminate host state cannot create clearance.

### `[x]` **2.2 Build the pinned exact-head unlock workflow and status poster**

- _Goal:_ The default branch independently re-runs readiness against PR files as inert data and posts
  `arc-cleared` only to the dispatched exact head through a least-privilege, environment-gated writer.

    - `[x]` **2.2.a Author the pinned unlock workflow from the repair trust boundary**

        - Added `.github/workflows/arc-clearance.yml` with one exact dispatch type, SHA-pinned actions, a trusted
          workflow-SHA checkout, and a detached PR-head data checkout with credentials disabled. Trusted source
          installs dependencies without scripts and invokes the shared readiness CLI against the data root.

    - `[x]` **2.2.b Isolate exact-head status publication**

        - The secretless `arc-clearance` environment contains the only status-writing job. It receives only the
          validated SHA and readiness envelope, revalidates repository/PR/head identity from live host data, and
          posts `arc-cleared` only to that full SHA with pull-request read and status-write permissions.

    - `[x]` **2.2.c Add workflow contract and trust-boundary fixtures**

        - Extended parsed-workflow coverage across the dispatch, action pins, split job permissions, detached data
          checkout, shared readiness invocation, environment isolation, and exact-SHA writer. A status-history
          fixture proves success remains scoped to its original head and a stale unlock cannot clear a replacement.

- _Outcome:_ The reviewed lane is born locked per SHA and can be cleared only by trusted default-branch code after
  lifecycle readiness succeeds against inert PR data and the requested head remains live at publication time.

### `[x]` **2.3 Add the base-derived planning-lane `arc-cleared` stamp**

- _Goal:_ Planning-only PRs receive the same required status without review choreography, while reviewed changes
  remain born locked and cannot redefine the classifier used to stamp themselves.

    - `[x]` **2.3.a Bind planning stamping to the canonical exact-ref classifier**

        - Extended the canonical raw-diff projection with an exact-ref planning lane covering all movable planning
          families plus the exact generated ROADMAP. Dual endpoints are classified, mode/type changes fail
          reviewed, and the shell boundary evaluates explicit coordinates in a caller-selected data repository.
        - Reconciled the package recipe, setup workflow, and this repository's CODEOWNERS projection to the same
          planning family without adding a second public ARC command.

    - `[x]` **2.3.b Post the planning status from an always-running CI step**

        - Added an always-running base-pinned classifier job and a separate status-only writer. Same-repository
          planning changes receive `arc-cleared` on the event's full head SHA; reviewed, fork, non-PR, and
          indeterminate inputs complete without a status, while a synchronized head requires its own publication.

    - `[x]` **2.3.c Cover the two-poster invariant in CI fixtures**

        - Workflow fixtures identify exactly the planning stamp and reviewed unlock as `arc-cleared` writers, bind
          them to distinct lane conditions, and preserve `ci-ok`, `merge-ok`, and CODEOWNERS as independent merge
          conditions. The legacy repair audit now scopes exclusivity to its own status context.

- _Outcome:_ Both lanes converge on one per-SHA context without sharing authority: trusted base code classifies and
  stamps planning changes, while reviewed changes remain locked until the explicit lifecycle-ready unlock path.

### `[x]` **2.4 Add the opt-in merge-guard setup path**

- _Goal:_ A team can idempotently install or verify the guard without changing default installation behavior or
  replacing existing protection settings.

    - `[x]` **2.4.a Ship a drop-in clearance workflow with trusted CLI acquisition**

        - Added the inventoried clearance template with fixed protocol identities, exact manifest-version package
          acquisition, detached PR data checkout, and the same readiness/exact-head publication contract as the
          source-pinned repository workflow.

    - `[x]` **2.4.b Author, project, and offer the supplemental setup path**

        - Added and projected the detect-first setup workflow, including version agreement, default-branch
          prerequisite, secretless environment constraints, additive protection update, and guided manual fallback.
          Initial setup now presents frontline, standard-review, planning-lane, and ARC guard choices independently.

    - `[x]` **2.4.c Verify idempotency and default-install neutrality**

        - Integration coverage proves exact package acquisition, PR-data isolation, inventory/projection,
          detect-before-mutate idempotency, default-off selection, harmless workflow-only state, blocked inverse
          partial state, additive protection, and the missing-admin fallback.

- _Outcome:_ The guard is a reversible opt-in: installation adds only inert recipe material, and activation cannot
  require `arc-cleared` until the exact-version workflow and constrained secretless environment are live.

## **Phase 3:** Lifecycle review driver

_Purpose:_ Replace repository-only library choreography with a thin typed-dispatch loop at the two shipped
integration callers, leaving judgment only at disposition and convergence.

### `[x]` **3.1 Wire work-unit integration through disposition, convergence, and unlock**

- _Goal:_ One execution of `integrate-work-unit.md` follows CLI-decided review actions across the existing PR and
  candidate boundaries, and only the reviewed final candidate head can receive combined release/integration
  authorization.

    - `[x]` **3.1.a Insert the typed review-driver entry, binding normalization, and mechanical action loop**

        - Composed frontline, delegated, and hosted review through typed CLI envelopes; runtime normalization now
          injects immutable bindings, and each changed target refreshes chunking and base-drift inputs.

    - `[x]` **3.1.b Author disposition, review applicability, pass continuation, and latency overlap**

        - Kept bounded applicability and review-strength choices with the operating agent, disclosed confident
          in-scope choices without a permission turn, and retained human stops for mutations and exceptional bounds.

    - `[x]` **3.1.c Re-enter review and make convergence the final integration interlock**

        - Made the base-clean, lifecycle-ready candidate the only unlockable target and combined disposition,
          exact-head unlock, mechanical rechecks, and integration authority in the final structured gate.

    - `[x]` **3.1.d Publish the final public PR review record**

        - Added the content-gated `## Review` record to both PR-template copies with local/hosted attribution,
          triage identity and disposition counts, plus carried-coverage disclosure.

    - `[x]` **3.1.e Prove the workflow driver across configured and empty source sets**

        - Added lifecycle and policy-driver coverage for typed dispatch, hosted fallback, empty source sets,
          moved-head applicability, exact override handling, and the combined release boundary.

- _Outcome:_ Work-unit integration now consumes one typed review loop while preserving bounded agent judgment and
  concentrating every mutation, clearance, and integration commitment at its intended human authority boundary.

### `[x]` **3.2 Wire Errand integration through the same typed review driver**

- _Goal:_ Errands consume the same review obligation without letting merge-lane presentation rewrite policy;
  reviewed heads use exact-head clearance and planning heads retain their native trusted CI stamp and auto-merge.

    - `[x]` **3.2.a Add the shared typed segment at the Errand review boundary**

        - Reused the typed driver, applicability posture, public review record, and combined gate while preserving
          Errand-specific cleanup and unattended planning-lane behavior.

    - `[x]` **3.2.b Keep review obligation and merge lane orthogonal**

        - Kept change-shaped review resolution independent of merge-lane classification: trusted CI stamps the
          auto lane, while only the reviewed lane invokes exact-head unlock at its final gate.

- _Outcome:_ Errands and work units now share the same review contract without conflating review policy with
  downstream lane presentation.

### `[x]` **3.3 Retire the project review coordinator while preserving extension seams**

- _Goal:_ No lifecycle path invokes the deleted controller vocabulary, while the generic post-PR-open and
  pre-merge extension points remain valid dormant attachment seams.

    - `[x]` **3.3.a Remove the project-only coordinator**

        - Deleted the coordinator workflow and every live invocation.

    - `[x]` **3.3.b Reduce both shipped extensions to reserved seams**

        - Preserved inactive package defaults and the configurable project fire points after removing their
          coordinator actions.

    - `[x]` **3.3.c Reconcile extension and workflow coverage**

        - Updated extension, packaging, and workflow coverage to prove the seams remain valid and inactive.

## **Phase 4:** Shadow-tier removal and documentation closure

_Purpose:_ Apply the confirmed salvage/residue partition, remove the controller and evidence machinery left with
no consumer, and make every surviving description match the smaller operating model.

### `[x]` **4.1 Remove the shadow source and test graph outside the preserved seam**

- _Goal:_ Every production entry point reaches only the RSB-owned review closure and consume surface plus newly
  re-homed hosted-PR/guard code; all unconsumed shadow machinery and subject-bound tests are absent.

    - `[x]` **4.1.a Freeze the post-salvage keep/delete inventory against imports**

        - Walked production, schema, launcher, and workflow roots to partition the live CLI closure, hosted/guard
          salvage, temporary retirement claims, and unconsumed residue.

    - `[x]` **4.1.b Delete controller, App, GitHub-host, and runtime residue with subjects**

        - Removed the shadow controller, App/GitHub host, runtime machinery, and subject-bound tests, retaining only
          the public CLI closure, exact-head unlock, and temporary claim-bearing residues.

    - `[x]` **4.1.c Delete provider residue without damaging surviving closures**

        - Removed the old provider router and hosted adapters while preserving hosted verbs, frontline execution,
          standard-review modules, and the two residues still claimed by the planned retirement batch.

    - `[x]` **4.1.d Prove the surviving import and schema graph is closed**

        - Reconciled packaging tests to the surviving closure and confirmed the source/test graph has no dangling
          imports into removed directories.

- _Outcome:_ The review subsystem now closes over the shipped CLI, hosted-PR adapters, local/frontline contracts,
  and exact-head guard; only explicitly claim-bound retirement residues remain outside that closure.

### `[x]` **4.2 Remove controller workflows, launch scripts, and dangling prose references**

- _Goal:_ The repository no longer schedules, packages, documents, or invokes any entrypoint from the discarded
  controller tier, and `arc-clearance.yml` is the only surviving pinned review/clearance workflow.

    - `[x]` **4.2.a Remove workflow and launcher entrypoints after replacement coverage is green**

        - Deleted the five legacy workflows, ten launchers, runtime operation registry, obsolete App runbook, and
          their launcher-only fixtures; `arc-clearance.yml` is the sole review/clearance workflow.

    - `[x]` **4.2.b Remove the eight root npm launch commands and tests**

        - Removed all root `review-gate:*` scripts and retired the controller enumeration tests with their subjects.

    - `[x]` **4.2.c Sweep living prose and configuration for dead vocabulary**

        - Removed live controller/App setup and invocation references while retaining the registered and reachable
          standard-review, local, frontline, hosted, and suspension contracts.

### `[x]` **4.3 Reconcile the self-hosting technical overview with the post-cut architecture**

- _Goal:_ The project-owned architecture narrative describes the executable CLI loop and deliberate commit-status
  lock, with no controller/App story or claim of autonomous host-side review authority.

    - `[x]` **4.3.a Rewrite the self-hosting review-gate overview**

        - Reframed the project instance around the configured typed CLI loop, bounded operating-agent judgment,
          human authority, and `arc-cleared` as a deliberate exact-head lifecycle lock.

    - `[x]` **4.3.b Verify the project-owned architecture narrative**

        - Added instance-specific assertions and exact vocabulary sweeps while leaving the generic package template
          unchanged.

## **Phase 5:** Program retirement and dogfood rollout

_Purpose:_ Turn on only the self-hosting choices, retire the superseded backlog program with durable authority,
exercise standard review through a hosted-PR source against a live PR carrying this branch, and leave exact guard
activation ready for its immediate post-merge Errand.

### `[x]` **5.1 Activate the self-hosting review sources without changing package defaults**

- _Goal:_ This repository selects the frontline order and standard-source fallback order it intends to dogfood,
  while a freshly installed project retains an entirely opt-in review and guard posture.

    - `[x]` **5.1.a Enable frontline only in the project method override**

        - Enabled `frontline-review` through the landed `active` contract in the project instance, retained
          `override-active: false` because no override body exists, and preserved the inactive package default.

    - `[x]` **5.1.b Configure the self-hosting standard-source order and ceilings**

        - Selected `coderabbit-pr,codex-pr,delegated-agent` after the existing `coderabbit-cli` frontline source,
          retained two-pass ceilings, and verified package defaults remain empty and inactive.

- _Outcome:_ Self-hosting now resolves its intended ordered review sources while new installations remain fully
  opt-in.

### `[x]` **5.2 Abandon the three superseded gate work units and re-cut the backlog**

- _Goal:_ No live planning or architecture authority continues to promise the declined evidence-grade gate; each
  removed lifecycle identity has a finalized receipt, and the backlog and identity-global captures name only work
  that still exists.

    - `[x]` **5.2.a Supersede the App-owned evidence-gate decision**

        - Accepted ADR-029 with the CLI/agent/human authority split and thin-lock posture; changed only ADR-028's
          status so its App-gate decision and amendments remain intact as history.

    - `[x]` **5.2.b Preflight and authorize the closed abandonment batch**

        - Verified all three slugs are unoccupied planned stubs with the expected dependency chain and generated
          each safe-default impact plan. No live identity-global capture still targets these slugs.

    - `[x]` **5.2.c Abandon the three planned stubs and close their capture claims**

        - Abandoned the three stubs downstream-first in serialized atomic commits, preserving a finalized discard
          receipt for each. The clean-index authority guard required each transition to commit before the next;
          no live identity-global capture targeted the retired slugs.

    - `[x]` **5.2.d Remove the two residues whose claims just retired**

        - Deleted the two named residues, their four helper-only source modules, and their subject-only tests and
          registrations. The surviving import/schema graph preserves RSB's landed `core/` removals and reaches no
          retired controller module.

    - `[x]` **5.2.e Regenerate and validate the backlog view**

        - Regenerated the staged readiness view after the serialized retirement commits and residue deletion. All
          three slugs resolve nonexistent, their finalized receipts remain committed, and no live dependency,
          ownership, cohort, capture, or planning authority claims the removed program.

- _Outcome:_ The superseded evidence-gate program now survives only as historical design and finalized retirement
  authority; its planned identities, claim-bound implementation residue, and live backlog claims are gone.

### `[ ]` **5.3 Exercise hosted-PR standard review on a live fixture and stage guard activation**

- _Goal:_ A real GitHub PR containing this branch's implementation demonstrates the configured frontline and
  hosted-PR standard-review paths plus their human judgment surfaces, while evidence for the not-yet-default-branch
  guard remains explicit and the post-merge activation run is ready to execute.

- _Note:_ This proof does not claim live `main` protection: `repository_dispatch` resolves workflow code from the
  default branch, so the exact planning/reviewed guard matrix belongs to the captured immediate post-merge Errand.

    - `[ ]` **5.3.a Open a disposable reviewed-lane fixture from this WU head**

        - Cut a temporary branch from the completed WU head, add only a neutral fixture change if GitHub needs a
          distinct head, push it, and open a draft PR against `main` so the reviewed diff contains this WU's code.
        - Record the exact base/head and keep the fixture unmergeable; do not add `arc-cleared` to branch protection
          or treat the branch copy of the unlock workflow as default-branch authority.

    - `[ ]` **5.3.b Drive the live review loop to convergence**

        - Run configured frontline resolution, standard-source selection, hosted request, bounded await, any safe
          availability fallback, complete finding disposition, thread-only settlement, and the combined
          convergence/release presentation against the fixture, withholding approval because this disposable proof
          must not integrate. Review-body nitpick and outside-diff findings receive no host reply, resolution, or
          compensating disposition comment.
        - Verify the session never asks whether to review, which source to select next, or whether an in-ceiling
          pass is authorized. Exercise at least one post-review narrow fixture delta so the operating agent selects,
          discloses, and proceeds with proportionate follow-up without asking permission; do not fire a production
          unlock whose default-branch workflow is not installed.

    - `[ ]` **5.3.c Close the pre-merge proof and hand off activation inputs**

        - Record the fixture PR URL, exact base/head, selected standard source, and typed hosted-PR outcomes in this
          task's completion note, including the narrow-delta applicability judgment and targeted verification; keep
          born-lock, push-relock, planning-stamp, head-as-data readiness, and exact-head-unlock contract/fixture
          results explicitly separate from the live hosted facts. The closed PR and task outcome are the durable
          record—do not introduce an evidence ledger or new fixture artifact.
        - Confirm the existing identity-global capture `Activate and dogfood arc-cleared after review-gate right-
          sizing lands` still names both disposable planning- and reviewed-lane PRs, setup from updated `main`,
          exact-head unlock, result recording, and branch/PR cleanup; update it in place only if an identity changed.
        - After the hosted proof succeeds, remove the adopted `Enable the frontline-review method in the self-hosting
          repo` capture, then close the fixture PR and remove its disposable branch. Preserve the activation capture
          as the immediate post-merge Errand seed.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A single session drives a real fixture PR carrying this WU's code through configured frontline and
  hosted-PR standard review without asking whether, which source, or whether it may review.

- `[ ]` Human stops are limited to structured disposition when a finding-driven mutation or commitment needs
  authority, the combined convergence/unlock/integration approval, the exceptional pass-ceiling decision, material
  uncertainty or new authority, and destructive lifecycle actions. Confident bounded applicability,
  review-strength, and supplemental-review judgments proceed without a permission turn and remain visible.

- `[ ]` Contract and fixture coverage proves that a reviewed head is born locked, every push re-locks it, and only
  an exact-head unlock clears it through the pinned default-branch workflow.

- `[ ]` The base-derived planning-lane stamp and the reviewed-lane unlock share one `arc-cleared` assertion, with
  their exact live matrix routed to the immediate post-merge activation Errand.

- `[ ]` Lifecycle readiness has one CLI definition used by both local preflight and the pinned unlock workflow,
  binds the WU slug to the guarded PR, and leaves Release Notes applicability to composition judgment.

- `[ ]` Both hosted-PR adapters remain live as standard sources; ordered fallback advances only on the two safe
  availability outcomes, consumes no pass for those attempts, and never fans out or replays ambiguity.

- `[ ]` `delegated-agent` and each hosted-PR source can independently complete the one standard-review stream;
  exactly one source runs per pass, and frontline remains independent of standard-source selection and opt-out.

- `[ ]` Evaluators author only evaluator-owned result content; the runtime injects immutable target/source/rubric/
  guidance bindings during normalization and rejects any accepted compatibility binding that is not exact.

- `[ ]` A changed head always invalidates clearance and merge authorization but does not mechanically discard prior
  review coverage: the operating agent discloses and selects targeted verification, focused supplementation, or
  complete review based on the exact delta and interaction risk, with no fix-carry ledger or eligibility oracle.

- `[ ]` The shadow workflows, launchers, scripts, controller/App machinery, residue modules, and their tests are
  absent with no surviving import or prose reference.

- `[ ]` RSB's coordinated rename and ordered-frontline increment lands first; its consume-set, re-entry retirement
  cluster, live closure, and standard-review boundary modules remain outside this cut afterward.

- `[ ]` The three superseded gate work units are abandoned through the direct planned-stub transition with
  finalized receipts; their seams are re-homed, the two claim-bound residues then retire, and the three ownerless
  `WU_Target` captures are removed.

- `[ ]` ADR-028 is superseded by the accepted replacement authority decision without rewriting its historical body.

- `[ ]` Shipped lifecycle prose and the self-hosting technical overview describe only the typed CLI loop and thin
  merge guard.

- `[ ]` Every reviewed WU and reviewed Errand PR publishes a final `## Review` section that separately attributes
  local and hosted-PR activity, identifies the GitHub triage approver, summarizes final material-finding
  dispositions, discloses targeted verification when review coverage carried across a later narrow delta, and
  remains disclosure rather than merge evidence; no-review PRs omit it.

- `[ ]` Self-hosting enables its ordered frontline and standard sources, while a default installation with neither
  list configured still completes integration despite change-shaped `standardReview`; the merge guard remains
  absent or cleanly skipped.

- `[ ]` All quality gates pass (tests, linting, type checking, build, and projected-copy checks).

- `[ ]` Ready for integration.

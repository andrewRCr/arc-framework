# Task List: Review Gate Right-Sizing

- **Design:** `spec-review-gate-right-sizing.md`

---

## **Phase 1:** Standard-review choreography and hosted-PR adapters

_Purpose:_ Establish the uniform standard-review driver and surviving hosted-PR source paths before deleting the
shadow runtime that currently contains their reusable pieces.

### `[ ]` **1.1 Establish hosted request, await, and thread-settlement verbs**

- _Goal:_ Every mechanical hosted-review action has one strict, resumable JSON contract whose returned
  `state -> nextAction` pair is sufficient to drive the next step without prose interpreting provider state.

    - `[ ]` **1.1.a Define and register the hosted-request contract**

        - Create the lean hosted contract under `packages/arc-framework/src/scripts/review-gate/hosted/`, then
          register `arc review hosted request` through `src/handlers/review.ts` and `src/cli.ts` with a versioned
          request envelope and exactly one command-specific result envelope.
        - Return a self-contained request handle bound to repository, pull request, exact head, provider, and the
          durable GitHub request artifact. Keep validation, identity, and provider dispatch inside the CLI; use the
          host artifact for resumption rather than introducing a local ledger or operation store.
        - Build `test-first` (one behavior at a time):
            - a valid request returns a deterministic `state` and `nextAction`;
            - malformed, unsupported-version, and unavailable-source inputs return typed failures;
            - one invocation emits exactly one JSON envelope and the documented exit status;
            - the returned handle round-trips without depending on controller or receipt state.

    - `[ ]` **1.1.b Re-home bounded hosted-review observation behind the await verb**

        - Salvage bounded deadline, backoff, and exact-head staleness behavior from `runtime/await.ts`, the
          developer-authenticated process-read boundary from `runtime/gh-action-port.ts`, and provider-specific
          observation parsers. Do not retain `hosts/github/await-observation.ts` or its aggregate check-run state.
        - Accept a bounded per-invocation timeout, return completed observations immediately, and return a typed,
          resumable pending state on timeout without an agent-side polling loop.
        - Build `test-first` (one behavior at a time):
            - pending review reaches a resumable timeout state;
            - terminal provider observations normalize into findings, clean, or unavailable outcomes;
            - repeated bounded calls preserve request identity without creating a second review request.

    - `[ ]` **1.1.c Re-home direct thread replies and resolution behind the settlement verb**

        - Re-home direct replies, exact actor/head checks, canonical confirmation, and thread resolution from
          `runtime/settlement-runtime.ts`, `runtime/gh-action-port.ts`, and `hosts/github/settlement.ts` without the
          receipt-backed closure sequences in `runtime/finding-settlement.ts`.
        - Return missing or deleted comment state as one explicit typed settlement outcome; do not retain the
          relay-specific deleted-comment polling behavior.
        - Build `test-first` (one behavior at a time):
            - defer and reject dispositions reply to the originating thread rather than a null relation;
            - resolution targets the requested live thread and reports already-settled state idempotently;
            - missing or deleted comment state returns one explicit typed outcome.

### `[ ]` **1.2 Re-home both hosted adapters behind deterministic ordered failover**

- _Goal:_ Both hosted providers remain independently selectable production paths, and a typed availability failure
  from the preferred source moves automatically to the next configured source without weakening real failures.

    - `[ ]` **1.2.a Re-home the CodeRabbit hosted path behind the new verbs**

        - Ground the salvage boundary across `providers/coderabbit/{adapter,github-trigger,github-observation,
          locators}.ts`; move reusable request, locator, and observation behavior into the lean hosted adapter
          contract while leaving receipt and evidence qualification behind.
        - Register `coderabbit-pr` with its request command and immutable provider identities in the built-in
          hosted registry; issue requests through the developer-authenticated `gh` boundary rather than App auth.
        - Preserve the live `frontline-execution.ts` and `frontline-agent.ts` closure unchanged, and do not pull
          `frontline-plain.ts` into the hosted replacement.
        - Build `test-first` (one behavior at a time):
            - request, observation, and normalized finding identity survive the re-home;
            - rate limiting and transient provider failures retain the distinct `rate-limited` and
              `transient-unavailable` outcomes;
            - provider-specific malformed or terminal failures do not masquerade as availability failures.

    - `[ ]` **1.2.b Re-home the Codex hosted path behind the same contract**

        - Ground the salvage boundary across `providers/codex/{adapter,github-trigger,github-observation,git-object,
          guidance,locators}.ts`; retain only behavior consumed by request, await, and settlement.
        - Register `codex-pr` with its request command and immutable provider identities in the built-in registry;
          make request create the command comment rather than merely acknowledging a pre-existing user comment.
        - Normalize Codex output into the same hosted result vocabulary without erasing provider-specific source
          loci or review identity, and leave guidance-evidence qualification behind.
        - Build `test-first` (one behavior at a time):
            - Codex is directly selectable as the first configured provider;
            - request and observation round-trip through the common envelopes;
            - rate-limited and transient-unavailable outcomes remain distinguishable from terminal failures.

    - `[ ]` **1.2.c Make provider preference and fallback total**

        - Implement a new narrow fallback rule rather than reusing receipt-backed `core/provider-fallback.ts` or
          `providers/router.ts`: advance only on a proven pre-effect `rate-limited` or `transient-unavailable`
          outcome, mapping only read-side network failures and read-side retry exhaustion into the latter. Keep a
          hosted observation timeout resumable pending rather than turning it into fallback.
        - Treat a request-side transport failure, timeout, or retry exhaustion as ambiguous unless the adapter
          proves no effect occurred. Stop on that ambiguity, malformed output, or terminal failure so a request
          that may have taken effect is never replayed against the same or next provider.
        - Return the attempted-provider history in the typed result so exhaustion is observable without asking the
          operator which source to try.
        - Build `test-first` (one behavior at a time):
            - the preferred available provider wins;
            - an unavailable preferred provider selects the next configured provider;
            - a pre-effect read failure may fall through, while an observation timeout remains resumable pending;
            - a request-write timeout or other ambiguous delivery stops the chain without a duplicate request;
            - a terminal failure stops the chain, and an exhausted or unknown list fails explicitly.

### `[ ]` **1.3 Bind standard-review policy, ordered sources, pass ceilings, and opt-out**

- _Goal:_ Configuration selects one source per review role and bounds its cycles, while an installation with no
  standard source reaches a clean no-op despite the change-shaped obligation.

- _Note:_ RSB owns the coordinated live-closure rename and plural frontline resolver. Begin this task only after
  that increment is integrated and reconciled into the branch; consume it without recreating or editing it here.

    - `[ ]` **1.3.a Add typed ordered-source and pass-ceiling settings**

        - Extend `packages/arc-framework/src/commands/config/types.ts`, `src/lib/config/status-reader.ts`,
          `arc/system/.internal/scripts/validate-config.sh`, and both `arc-config.yml` copies with the flat string
          keys `review.frontline_sources`, `review.standard_sources`, `review.frontline_max_passes`, and
          `review.standard_max_passes`; expose the developer override as `arc.frontlineSources`.
        - Parse both source settings as ordered comma-separated built-in registry IDs and keep both empty by
          default. Frontline accepts its compatible source IDs; standard accepts `delegated-agent`,
          `coderabbit-pr`, and `codex-pr`. Parse both ceilings as positive safe integers with default `2`,
          generalizing the current frontline schemas beyond their literal `1 | 2` domain.
        - Apply the clean pre-GA forward rename only: do not dual-read, alias, deprecate, or migrate
          `frontline_source`, `frontlineSource`, `hosted_providers`, or `hosted_max_passes`.
        - Build `test-first` (one behavior at a time):
            - absent keys resolve to the documented default-off/default-ceiling values;
            - both ordered source configurations retain order through `arc config status`, including the
              `arc.frontlineSources` override;
            - source IDs incompatible with a role, malformed lists, and ceiling values fail with actionable
              diagnostics.

    - `[ ]` **1.3.b Build the typed review-policy driver**

        - Register `arc review resolve` as the pure transition driver. Consume RSB's renamed `standardReview`
          obligation projection, then resolve frontline and standard source order, source capability/eligibility,
          current pass counts, terminal state, precomposed disposition/pass-ceiling surfaces, and the next allowed
          action in CLI code.
        - Treat each ordered list as fallback, never fan-out: one source completes a pass. Fall through without
          consuming a pass only on `rate-limited` or `transient-unavailable`; partial, ambiguous, malformed,
          timed-out, stale-target, capability-unsupported, source-unbound, and other terminal outcomes stop with
          their typed consequence.
        - Keep `standardReview` change-shaped. When `review.standard_sources` is empty, return a clean no-op
          regardless of the obligation; when it is non-empty but no source can satisfy the target, return
          `unavailable`. Keep frontline independent of that predicate and do not auto-schedule supplemental review.
        - Dispatch `delegated-agent` through RSB's local prepare/attest/respond/reduce verbs and hosted-PR source IDs
          through this WU's adapters. Treat every output and receipt as advisory and human-disposition-anchored;
          standard review settles through completed review plus approved dispositions/convergence, not
          evidence-grade proof.
        - Make ceiling exhaustion the single driver-level `approval-required` state requiring exceptional approval,
          not a provider outcome.
        - Accept a one-pass ceiling override only on the next resolve call, bound to repository, pull request, exact
          head, lane, exhausted pass count, and next pass number. Repeating the identical pure resolve call before
          that pass advances is idempotent; reject reuse after the bound pass starts or state advances, plus every
          stale or mismatched override, without raising the configured ceiling or persisting approval state.
        - Build `test-first` (one behavior at a time):
            - an empty standard-source list cleanly no-ops for a non-exempt `standardReview`;
            - a configured list with no source able to satisfy the target returns `unavailable`;
            - frontline activation is independent of standard opt-out, and each role selects exactly one source
              per pass within its own ceiling;
            - `delegated-agent` and each hosted-PR source can independently satisfy a standard pass;
            - only the two safe availability outcomes fall through, consume no pass, and preserve attempt history;
              non-fall-through outcomes never invoke the next source;
            - ceiling exhaustion cannot silently request another pass and carries the approval consequence;
            - an exact one-pass override selects only the bound next pass, an identical pre-advance resolve is
              idempotent, and stale post-advance, wrong-target, and wrong-lane reuse fails.

    - `[ ]` **1.3.c Prove the public CLI surface and default-install contract**

        - Extend the review handler/CLI contract tests and add a durable `review-cli-surfaces.test.ts` integration
          test so each new verb is packaged, help-visible, strict on JSON input, and callable with no shadow
          launcher. Leave `review-gate-operation-surfaces.test.ts` to retire with `runtime/operations.ts`.
        - Exercise a package-default config with empty frontline and standard lists and no guard to prove the
          driver exits cleanly without host credentials, delegated-agent work, or network activity.

## **Phase 2:** Exact-head merge guard

_Purpose:_ Build the single readiness authority and its two authorized status posters so every guarded reviewed
head is born locked while planning-only changes retain their existing lane.

### `[ ]` **2.1 Implement the vehicle-aware readiness authority and unlock dispatch**

- _Goal:_ Local preflight and host-side unlock accept or reject a head by the same lifecycle-readiness definition,
  and dispatch can never clear a different SHA than the one explicitly authorized.

    - `[ ]` **2.1.a Define vehicle readiness once in the CLI**

        - Add one narrow readiness module under `src/scripts/review-gate/` over the closed request union
          `work-unit { slug, archiveCadence } | errand { slug }`.
        - For a WU, bind the requested slug to the guarded PR before validating products: require its slug to match
          the live PR head branch and its SHA to remain the exact head; under `with-integration`, also require the
          archived meta's `PR URL` to name that repository and PR; under `manual`, require the active meta's branch
          to match the PR head.
        - Validate the exact cadence-specific products already required by `integrate-work-unit.md`:
          `with-integration` requires the completed `Shipped` meta, Completion Notes, any present Release Notes to
          be well-formed, archive/cohort closeout, and coherent project-readiness view; `manual` requires the active
          `Integrating` meta, Completion Notes, and any present Release Notes to be well-formed, with archive/
          readiness products remaining post-merge. Leave Release Notes applicability as the workflow's composition
          judgment; do not add a marker or re-infer it in the guard. For an Errand, validate strict
          slug/branch/PR/head identity and apply its explicit exemption from WU composition products.
        - Reuse `parseMetaRecord`, `resolveLifecyclePosition`, and the narrow project-readiness render/compare
          primitives. Do not use the fail-soft lifecycle/status indexes as guard authority or create a generalized
          readiness engine.
        - Resolve only required paths inside the supplied root; reject missing, duplicate, malformed,
          wrong-cadence, non-regular, symlinked, or out-of-root inputs. Return structured invalid facts rather than
          a boolean, and expose the check through the review handler for local preflight and pinned-workflow use.
        - Build `test-first` (one behavior at a time):
            - each WU cadence accepts only its required integration products, validates Release Notes when present,
              and does not invent an applicability signal when they are absent;
            - a wrong WU slug, mismatched PR head branch, wrong archived PR URL, or stale SHA blocks;
            - an exact Errand identity is ready without WU artifacts, while missing or contradictory identity
              blocks;
            - each absent, duplicate, malformed, mismatched, symlinked, non-regular, or escaping input blocks with
              its exact fact;
            - unrelated files, fail-soft index behavior, and the caller's current checkout do not influence the
              supplied tree.

    - `[ ]` **2.1.b Add exact-head unlock preflight and dispatch**

        - Add `arc review unlock` as strict JSON-in/JSON-out orchestration: resolve the authenticated repository and
          PR, compare the requested SHA with the live PR head, and inspect the canonical default branch for the
          pinned `arc-clearance.yml`. An installed workflow proceeds through shared readiness and dispatch; an
          absent workflow returns typed no-unlock; an unreadable or ambiguous lookup stops.
        - Treat workflow presence only as action availability. Final PR required-check settlement remains the
          enforcement authority, so partial setup cannot turn absence into clearance and the command needs neither
          a new guard config axis nor privileged branch-protection inspection.
        - Treat the structured combined convergence/release integration approval as the fire-site authorization;
          the command performs no inference from approval counts, CI green state, or provider output.
        - Build `test-first` (one behavior at a time):
            - exact live head, installed default-branch workflow, and ready artifacts dispatch once;
            - absent workflow returns no-unlock, while unreadable lookup, stale head, closed PR, failed readiness,
              or malformed repository identity dispatches nothing;
            - the dispatched payload binds repository, PR number, full head SHA, vehicle, slug, and WU cadence
              when applicable.

    - `[ ]` **2.1.c Lock the command contract into CLI and integration coverage**

        - Register the readiness and unlock surfaces in `src/cli.ts` and `handlers/review.ts`, preserving the existing
          review envelope conventions and one-envelope output guarantee.
        - Add handler/integration tests that invoke the public CLI boundary with injected GitHub and filesystem
          ports rather than testing Commander or live network behavior.

### `[ ]` **2.2 Build the pinned exact-head unlock workflow and status poster**

- _Goal:_ The default branch independently re-runs readiness against PR files as inert data and posts
  `arc-cleared` only to the dispatched exact head through a least-privilege, environment-gated writer.

    - `[ ]` **2.2.a Author the pinned unlock workflow from the repair trust boundary**

        - Derive `.github/workflows/arc-clearance.yml` from `review-gate-repair.yml`: accept only the
          `arc-clearance` `repository_dispatch` type, pin actions, disable persisted credentials, and check out
          trusted workflow/CLI code separately from the requested PR tree.
        - Run the pinned CLI readiness command over the PR-head checkout as data; never execute the PR's scripts,
          dependencies, workflow, or build output.

    - `[ ]` **2.2.b Isolate exact-head status publication**

        - Pass the validated full SHA and readiness result into a separate job using the secretless
          `arc-clearance` environment and only the permissions needed to create the `arc-cleared` commit status.
          The environment uses a default-branch deployment policy and no required reviewer; writer isolation is
          least-privilege containment, not a second authorization gate.
        - Re-fetch the live PR head before publication, refuse a stale payload, and never post success to a branch
          name, merge ref, workflow SHA, or replacement head.
        - Build `test-first` (one behavior at a time):
            - ready and still-current payload posts success to the requested SHA;
            - failed readiness or head movement posts no success;
            - the writer receives no PR-supplied executable input.

    - `[ ]` **2.2.c Add workflow contract and trust-boundary fixtures**

        - Extend `packages/arc-framework/__tests__/integration/review-gate-workflows.test.ts` with parsed-workflow
          assertions for the exact dispatch type, pinned actions, split permissions/jobs, `arc-clearance`
          environment policy, detached data checkout, shared CLI readiness, exact-SHA publication, and absence of
          a duplicate YAML artifact list or PR-supplied executable input.
        - Add fixture-backed status-history cases proving a new SHA has no inherited `arc-cleared` success and an
          unlock for the preceding SHA cannot clear it.

### `[ ]` **2.3 Add the base-derived planning-lane `arc-cleared` stamp**

- _Goal:_ Planning-only PRs receive the same required status without review choreography, while reviewed changes
  remain born locked and cannot redefine the classifier used to stamp themselves.

    - `[ ]` **2.3.a Bind planning stamping to the canonical exact-ref classifier**

        - Extend `isPlanningArtifactPath`'s existing lane projection in `src/lib/change-facts.ts` and
          `scripts/classify-change.sh` with an exact-ref form over the canonical raw-diff `ChangeSet`; do not add a
          second classifier, copy rules from workflow templates, or introduce a new public ARC verb.
        - Classify both rename/copy endpoints and mode/type changes. Empty, unreadable, malformed, ambiguous,
          unknown, or cross-repository inputs fail to the reviewed lane.
        - Run the classifier from a separate trusted checkout at the PR base SHA against explicit base/head
          coordinates; never import classifier code from the PR head.
        - Build `test-first` (one behavior at a time):
            - planning-only paths classify as planning;
            - mixed, code, workflow, rename/copy endpoint, mode/type, unreadable, empty, or unknown changes fail
              safely to reviewed;
            - a PR that edits the classifier cannot use its edited copy for its own decision;
            - fork/cross-repository PRs remain reviewed.

    - `[ ]` **2.3.b Post the planning status from an always-running CI step**

        - Add `statuses: write` only where needed and post `arc-cleared` success to the exact PR head when the
          trusted classifier returns planning for a same-repository PR; on reviewed or fork/cross-repository lanes,
          complete successfully without posting the context.
        - Avoid a conditionally skipped job/check-run and keep `ci-ok`/`merge-ok` semantics unchanged.
        - Build `test-first` (one behavior at a time):
            - planning lane posts once to the exact head;
            - reviewed lane posts nothing and remains expected/locked;
            - synchronization to a new head requires a new status.

    - `[ ]` **2.3.c Cover the two-poster invariant in CI fixtures**

        - Add integration fixtures showing that planning stamp and reviewed unlock are the only successful writers
          of the identical `arc-cleared` context and that neither can satisfy the other's lane accidentally.
        - Retain the current CI rollup and CODEOWNERS behavior as independent merge conditions.

### `[ ]` **2.4 Add the opt-in merge-guard setup path**

- _Goal:_ A team can idempotently install or verify the guard without changing default installation behavior or
  replacing existing protection settings.

    - `[ ]` **2.4.a Ship a drop-in clearance workflow with trusted CLI acquisition**

        - Add `arc-clearance.yml` to the packaged `reference/templates/arc/merge-gate/` recipe and install
          inventory. Keep its workflow, dispatch, environment, and status identities fixed.
        - Make the installed template execute an exact `@arc-framework/cli` package version rendered from the
          project's framework manifest, never a dist-tag, PR-head package, or repository-local build.
        - Keep this repository's `.github/workflows/arc-clearance.yml` source-pinned for pre-release dogfooding;
          both forms check out the PR head only as data and share the same readiness and status-publication
          contract.

    - `[ ]` **2.4.b Author, project, and offer the supplemental setup path**

        - Add `setup-arc-clearance.md` beside `setup-merge-gate.md` in the package source, following its
          detect-before-mutate and guided-manual-fallback shape, then project it to `.arc/`.
        - Require the framework manifest version to match the executing `arc --version`, render or reconcile the
          packaged workflow at `.github/workflows/arc-clearance.yml`, and stop before protection mutation until the
          workflow is present on the default branch.
        - Provision or verify the secretless `arc-clearance` environment with default-branch deployment policy and
          no required reviewer, then add `arc-cleared` without replacing the CI rollup, CODEOWNERS, or other
          branch-protection requirements. Keep the protocol names fixed; add no new configuration axes.
        - Extend both copies of
          `01_verify-and-configure.md` § Optional with independently selectable frontline sources, standard
          sources, and merge-guard choices.
        - State the default-off behavior and prerequisites in executing-session prose; do not embed internal rollout
          history or movable planning references in shipped content.

    - `[ ]` **2.4.c Verify idempotency and default-install neutrality**

        - Extend workflow/configuration integration tests to prove a second setup run detects the workflow,
          environment policy, and context; missing admin authority yields a guided path; and an untouched
          installation gains no required context.
        - Prove a manifest/CLI version mismatch blocks rendering, the installed template names an exact package
          version, and neither acquisition form executes PR-head code or policy.
        - Exercise partial setup: workflow present without a required context remains harmless, while a required
          context without the workflow stays blocked at final required-check settlement.
        - Verify package projection and packaged-file inventories include the setup workflow and clearance template
          with no repository-specific branch-protection mutation.

## **Phase 3:** Lifecycle review driver

_Purpose:_ Replace repository-only library choreography with a thin typed-dispatch loop at the two shipped
integration callers, leaving judgment only at disposition and convergence.

### `[ ]` **3.1 Wire work-unit integration through disposition, convergence, and unlock**

- _Goal:_ One execution of `integrate-work-unit.md` follows CLI-decided review actions across the existing PR and
  candidate boundaries, and only the reviewed final candidate head can receive combined release/integration
  authorization.

- _Note:_ RSB integrates its standard-review/local/frontline rewrite first. Reconcile this branch with that landed
  contract, then append this WU's hosted-PR and guard segment to the current package-source workflow without
  replacing RSB-owned behavior; project the composed result to `.arc/`.

    - `[ ]` **3.1.a Insert the typed review-driver entry and mechanical action loop**

        - Preserve the existing lifecycle boundaries: invoke the driver for frontline and any pre-PR
          `delegated-agent` standard pass, open or reuse the PR without a new authorization stop, then re-invoke it
          with the opened change request when the selected standard source is hosted-PR. The driver does not own PR
          creation.
        - At each boundary, dispatch only on the returned `nextAction` and feed each verb's envelope into the next
          call.
        - Cover frontline resolution, delegated-agent verbs, hosted request/await, ordered safe fallback, and
          thread settlement without prose comparisons, source-selection questions, fan-out, or agent-authored
          polling loops.

    - `[ ]` **3.1.b Author disposition, pass continuation, and latency overlap**

        - At the judgment leaf, require each finding's reviewer severity, ARC re-grade, source locus, and a discrete
          labeled recommended disposition line; precompose fixed report/prompts CLI-side where possible.
        - Permit an explicitly user- or project-directed supplemental review to enter the same disposition and
          convergence loop. Do not create a profile registry, config axis, or automatic scheduler, and do not let
          supplemental output settle `standardReview` unless that invocation ran the standard-review contract.
        - Make the same turn carry the recommended next-pass action on an opt-out basis; approved fixes remain
          atomic and produce a fresh review target with no carried finding ledger.
        - Represent ceiling exhaustion as its own explicit approval consequence, not a routine pass-selection ask.
          On approval, pass the exact one-pass override to the next driver call; never reinterpret assent as a
          persistent ceiling change or reuse it after the bound head/lane/pass advances.
        - While a hosted await is live and the harness permits useful parallel progress, allow speculative drafting
          of Completion/Release Notes and the cleanup plan. Refresh it after fixes, but do not commit, push, archive,
          regenerate readiness, or destructively clean before `review-settled`; require no concurrency mechanism or
          persisted draft when the opportunity is unavailable.

    - `[ ]` **3.1.c Re-enter review and make convergence the final integration interlock**

        - Reduce the implementation head to `review-settled` without prospective clearance, validate/update any
          speculative draft, and run the existing composition, archive/readiness, and candidate-push tail.
        - Treat the pushed candidate and every head-changing base reconcile as new exact targets; re-run the
          applicable configured review roles and never carry an earlier convergence or unlock across either
          mutation.
        - Only after the candidate is base-clean and lifecycle-ready, render the existing final integration
          interlock as one marked convergence/release gate. Surface its exact head, complete candidate-tail diff, PR
          state, requirements, merge method, lifecycle readiness, and clean base-drift result; state that approval
          applies final dispositions, ends review, invokes `arc review unlock` when available, and authorizes merge
          only if the resulting required status and ordinary exact-head mechanical rechecks succeed unchanged.
        - Close with `Approve (or redirect)?`. Await the unlock/status result and perform the existing post-approval
          exact-head, PR-state, and base-drift reads mechanically; do not add a second convergence, unlock, or merge
          stop. Any failure, drift, or mutation invalidates approval and returns through review or the interlock.
          Informal assent outside the structured gate grants no clearance or integration authority.

    - `[ ]` **3.1.d Publish the final public PR review record**

        - Extend the package-source `template-pull-request.md` and its projected copy with one content-gated
          `## Review` section. Replace the current blanket prohibition on local-review narration with the narrow
          normalized record while continuing to reject informal self-review meta-narration.
        - At the combined final gate, preview the exact record that approval will publish. After approval and the
          unchanged exact-head mechanical checks, update the PR body immediately before merge; if the head changes,
          treat the prior record as stale and replace it only after the new head converges.
        - Render `Local` and `Hosted PR` source lines whenever any review ran, using `None` for an empty category.
          Aggregate completed review activity by human-readable product or exposed model identity and pass/review
          count, with no ARC role names or pre-/post-PR timing qualifiers. Omit the whole section when the review
          loop ran no review.
        - Render `Triage` with the GitHub identity that approved the final disposition set and counts of distinct
          material findings across completed review passes by their final approved disposition: addressed,
          declined, deferred, and unresolved. Omit zero-valued categories except `0 unresolved`; render
          `no material findings` for a clean cycle. Default to the authenticated developer only when that person
          supplied the approval, never mechanically to the PR author.
        - Add template/workflow fixtures for local-only, hosted-only, mixed, clean, disposition-bearing, and
          no-review records, plus refresh after head mutation. Keep this as PR disclosure: add no receipt, model
          registry, fix-carry ledger, state/schema, public ARC verb, or `arc-cleared` validation.

    - `[ ]` **3.1.e Prove the workflow driver across configured and empty source sets**

        - Extend integration/workflow tests with envelope fixtures for no standard source, frontline-only,
          delegated-agent standard review, hosted-PR standard review, safe ordered fallback, non-fall-through
          failure, explicitly requested supplemental review, findings/fix/new-head, combined convergence/unlock/
          integration, ceiling-exceeded, exact override-resume, idempotent pre-advance resolve, and stale
          post-advance override paths.
        - Assert a standard pass invokes exactly one source, an empty standard list no-ops despite non-exempt
          `standardReview`, a configured-but-unsatisfiable list returns `unavailable`, and frontline execution does
          not depend on either result.
        - Prove a pre-composition head cannot unlock, the candidate push re-enters review, and only the ready,
          base-clean, still-current candidate head reaches the combined gate; speculative local drafting never
          changes the reviewed target. After approval, unlock failure, changed status, head drift, or base drift
          prevents merge without converting the approval into prospective authority.
        - Assert the prose contains only typed dispatch plus the two judgment leaves and retains existing extension
          seams and the final integration interlock as the combined release gate.

### `[ ]` **3.2 Wire Errand integration through the same typed review driver**

- _Goal:_ Errands consume the same review obligation without letting merge-lane presentation rewrite policy;
  reviewed heads use exact-head clearance and planning heads retain their native trusted CI stamp and auto-merge.

- _Note:_ This is the second shared surface with RSB; after its first integration is reconciled, append this WU's
  hosted-PR and guard behavior to the current package-source `run-errand.md` and project the composed result.

    - `[ ]` **3.2.a Add the shared typed segment at the Errand review boundary**

        - Reuse the same CLI envelopes, disposition format, combined convergence/release gate, and pass-ceiling
          exception; do not fork a second policy or duplicate provider logic in workflow prose.
        - Reuse the same final public PR review record, including local/hosted attribution, final finding counts,
          human GitHub triage identity, content gating, and stale-head replacement; do not create an Errand-specific
          summary vocabulary.
        - Preserve Errand-specific PR, cleanup, unattended planning-lane, and integration-interlock behavior around
          the inserted segment; on the reviewed lane, the combined gate occupies that integration interlock rather
          than preceding it as another stop.

    - `[ ]` **3.2.b Keep review obligation and merge lane orthogonal**

        - Keep RSB's `standardReview` projection change-shaped and let the driver own opt-out: an empty standard
          list no-ops, while a configured-but-unsatisfiable list returns `unavailable`. Do not derive either the
          obligation or source selection from the downstream auto/reviewed merge lane.
        - After review settlement, preserve the existing lane classification. The auto-merge lane invokes no
          unlock because the trusted CI stamp supplies `arc-cleared`; the reviewed lane invokes the unlock verb at
          its final gate, and an absent default-branch clearance workflow returns a typed no-unlock terminal rather
          than a dead action. Final required-check settlement remains authoritative for enforcement.
        - Add workflow fixtures for reviewed Errand convergence/unlock, planning Errand stamp/auto-merge,
          change-shaped obligation with empty standard sources, delegated-agent and hosted-PR standard sources,
          and configured-but-unsatisfiable review; assert parity with the WU driver's shared contract without
          coupling source policy to merge-lane classification.

### `[ ]` **3.3 Retire the project review coordinator while preserving extension seams**

- _Goal:_ No lifecycle path invokes the deleted controller vocabulary, while the generic post-PR-open and
  pre-merge extension points remain valid dormant attachment seams.

    - `[ ]` **3.3.a Remove the project-only coordinator**

        - Delete `.arc/system/workflows/project/coordinate-pr-review.md` after the two inline drivers cover its live
          findings, closure, and settlement responsibilities.
        - Remove every surviving invocation or index entry rather than leaving a redirect or historical note.

    - `[ ]` **3.3.b Reduce both shipped extensions to reserved seams**

        - The package-source `post-pr-open.md` and `pre-merge.md` already carry empty `active: false` defaults;
          preserve them as the shipped reserved seams.
        - In the configurable `.arc/` instances, remove only the coordinator actions and dangling link definitions;
          retain their fire-point identity and future-actions placeholders. Do not project the empty package file
          over project-specific configuration.
        - Preserve the matching `· #post-pr-open` and `· #pre-merge` fire points in both lifecycle workflows.

    - `[ ]` **3.3.c Reconcile extension and workflow coverage**

        - Update `pr-open-extensions.test.ts`, `review-gate-packaging.test.ts`, review workflow integration tests,
          and extension-point validation so they prove the packaged and project seams still resolve and no
          coordinator/controller action remains reachable.

## **Phase 4:** Shadow-tier removal and documentation closure

_Purpose:_ Apply the confirmed salvage/residue partition, remove the controller and evidence machinery left with
no consumer, and make every surviving description match the smaller operating model.

### `[ ]` **4.1 Remove the shadow source and test graph outside the preserved seam**

- _Goal:_ Every production entry point reaches only the RSB-owned review closure and consume surface plus newly
  re-homed hosted-PR/guard code; all unconsumed shadow machinery and subject-bound tests are absent.

- _Note:_ The spec's D4 partition is authoritative. Preserve RSB-owned state as found: do not mutate its D14
  consume-set, re-entry retirement cluster, `runtime/local-attestation.ts`, standard-review boundary modules, or
  the live closure after its coordinated first increment; never restore re-entry modules RSB has already removed.

    - `[ ]` **4.1.a Freeze the post-salvage keep/delete inventory against imports**

        - Walk production entries from `src/cli.ts`, npm scripts, and surviving workflows after Phases 1–3; map
          each `review-gate/` module to live closure, RSB ownership, hosted/guard salvage, or residue.
        - Confirm `policy/self-hosting/routing.ts` against its recorded cut disposition. Preserve RSB-owned
          `policy/standard-review.ts` and `policy/standard-review-guidance.ts`; fail closed on any other module with
          an unresolved consumer.

    - `[ ]` **4.1.b Delete controller, App, GitHub-host, and runtime residue with subjects**

        - Remove `hosts/github/**`, `policy/self-hosting/**`, the App/check-run/controller implementation, and
          `runtime/**` except RSB-owned modules still present, code re-homed behind the new verbs, and
          `runtime/qualification-activation.ts` while its retiring-WU claim remains live.
        - Remove the corresponding unit and integration tests in the same changes; retain behavior tests only for
          code that remains reachable under the new architecture.

    - `[ ]` **4.1.c Delete provider residue without damaging surviving closures**

        - Remove the old `providers/router.ts`, `providers/codex/**`, and non-frontline CodeRabbit files only after
          their hosted behavior is covered at the re-homed boundary; delete `frontline-plain.ts` while preserving
          `frontline-execution.ts` and `frontline-agent.ts`.
        - Preserve `providers/coderabbit/config.ts` and `runtime/qualification-activation.ts` while their retiring
          WU claims remain live; Task 5.2.d - `tasks-review-gate-right-sizing.md` removes them only after those
          claims are authoritatively abandoned. Leave RSB-owned `core/contract-version-dispatch.ts` and
          `core/forward-evidence-eligibility.ts` untouched.

    - `[ ]` **4.1.d Prove the surviving import and schema graph is closed**

        - Re-run source/test import walks from every production entry, schema registration, and package entrypoint;
          remove dangling exports, registered schemas, fixtures, and tests whose subjects were deleted, without
          treating RSB-owned registered contracts as launcher residue.
        - Update the integration coverage/packaging tests to assert the explicit surviving closure and absence of
          imports into deleted directories rather than preserving the old subsystem size.

### `[ ]` **4.2 Remove controller workflows, launch scripts, and dangling prose references**

- _Goal:_ The repository no longer schedules, packages, documents, or invokes any entrypoint from the discarded
  controller tier, and `arc-clearance.yml` is the only surviving pinned review/clearance workflow.

    - `[ ]` **4.2.a Remove workflow and launcher entrypoints after replacement coverage is green**

        - Delete the five legacy `.github/workflows/review-gate*.yml` files after using the repair workflow as the
          pinned unlock template, retaining only the new unlock workflow.
        - Delete all ten top-level `run-*.ts` launchers and `runtime/operations.ts`, then remove their root-script,
          workflow, and subject-test references. They have no tsup entry or package export; retain schema
          registration except where the explicit post-RSB inventory proves a registered subject retired.

    - `[ ]` **4.2.b Remove the eight root npm launch commands and tests**

        - Delete every `review-gate:*` script from the root `package.json` and any helper that exists only to launch
          them; the package manifest has no corresponding commands.
        - Delete `review-gate-operation-surfaces.test.ts` with `runtime/operations.ts` and retire launcher-only
          assertions with their subjects. Use Phase 1's `review-cli-surfaces.test.ts` as the single durable public
          `arc review` surface test rather than recreating the controller enumeration.

    - `[ ]` **4.2.c Sweep living prose and configuration for dead vocabulary**

        - Remove surviving references to deleted `review-gate:*` commands, wakeup relay, hosted-suspension
          reconstruction/choreography, controller reconciliation, App identity, qualification, and check-run
          projection from project and package-source content.
        - Preserve references and tests for deliberately retained standard-review/local/frontline or RSB-owned
          contracts, including the registered `review-suspension` variant; use an exact repository-wide search to
          distinguish those from dangling residue.

### `[ ]` **4.3 Reconcile the self-hosting technical overview with the post-cut architecture**

- _Goal:_ The project-owned architecture narrative describes the executable CLI loop and deliberate commit-status
  lock, with no controller/App story or claim of autonomous host-side review authority.

- _Note:_ `.arc/reference/TECHNICAL-OVERVIEW.md` § 2 is a Scaffolded, project-owned surface shared with RSB's D15
  correction; preserve whichever accurate CLI-boundary wording has already landed and compose the post-cut model
  onto it. Do not project it from the generic package template.

    - `[ ]` **4.3.a Rewrite the self-hosting review-gate overview**

        - Update `.arc/reference/TECHNICAL-OVERVIEW.md` § 2 to cover the configured frontline and standard-review
          CLI loop, delegated-agent/hosted-PR source choice, typed dispatch, human disposition/convergence anchor,
          and thin `arc-cleared` guard; state plainly that no App or resident controller exists.
        - Reconcile § 3's infrastructure/merge-gating description so commit status is a deliberate lock, not proof
          of provider evidence or autonomous merge authority.

    - `[ ]` **4.3.b Verify the project-owned architecture narrative**

        - Leave `packages/arc-framework/arc/reference/TECHNICAL-OVERVIEW.template.md` generic and unchanged; its
          Scaffolded instance intentionally diverges after one-time rendering.
        - Update the existing project-overview assertion in `pr-open-extensions.test.ts` and targeted grep checks to
          prove the instance describes the executable surface and contains no deleted controller vocabulary or
          internal planning references. Do not add a Framework projection/equality test for Scaffolded content.

## **Phase 5:** Program retirement and dogfood rollout

_Purpose:_ Turn on only the self-hosting choices, retire the superseded backlog program with durable authority,
exercise standard review through a hosted-PR source against a live PR carrying this branch, and leave exact guard
activation ready for its immediate post-merge Errand.

### `[ ]` **5.1 Activate the self-hosting review sources without changing package defaults**

- _Goal:_ This repository selects the frontline order and standard-source fallback order it intends to dogfood,
  while a freshly installed project retains an entirely opt-in review and guard posture.

    - `[ ]` **5.1.a Enable frontline only in the project method override**

        - Set `override-active: true` in `.arc/system/methods/frontline-review.md`; leave the package-source method's
          `active: false` and override default unchanged.
        - Set `review.frontline_sources: coderabbit-cli`; verify the ordered setting resolves through the live
          frontline registry and package/project sync does not treat the intentional override as drift.

    - `[ ]` **5.1.b Configure the self-hosting standard-source order and ceilings**

        - Set the project-instance `arc-config.yml` standard order to
          `coderabbit-pr,codex-pr,delegated-agent` and configure the self-hosting frontline/standard pass ceilings;
          leave both package-source lists empty and their defaults unchanged.
        - Run config-status/validation fixtures for both project and package defaults, proving self-hosting selects
          the ordered sources while a fresh install performs no frontline, delegated-agent, or hosted-PR call.

### `[ ]` **5.2 Abandon the three superseded gate work units and re-cut the backlog**

- _Goal:_ No live planning or architecture authority continues to promise the declined evidence-grade gate; each
  removed lifecycle identity has a finalized receipt, and the backlog and identity-global captures name only work
  that still exists.

    - `[ ]` **5.2.a Supersede the App-owned evidence-gate decision**

        - Allocate the next unused ADR number at execution time and write the replacement decision: the configured
          CLI review loop remains human-disposition-anchored, while `arc-cleared` is a thin deliberate lifecycle
          lock rather than evidence-grade merge truth.
        - Change only ADR-028's status to `Superseded by ADR-…`; preserve its Decision, Consequences, and existing
          amendments as the historical record. Link the new ADR back to ADR-028 and include the proportionality
          rationale for declining the App/controller authority model.

    - `[ ]` **5.2.b Preflight and authorize the closed abandonment batch**

        - Re-query all three exact slugs with `arc status <slug> --json`; require `state: planned`, no branch or
          occupied worktree, and the expected qualification → promotion → adapter dependency chain.
        - Invoke each `arc abandon <slug>` impact-plan path without `--yes`, surface the complete three-slug
          destructive batch and planned capture cleanup, and stop for one explicit authorization of that closed
          batch before any artifact removal.

    - `[ ]` **5.2.c Abandon the three planned stubs and close their capture claims**

        - Under the bounded authorization from 5.2.b, run `arc abandon <slug> --yes` downstream-first:
          `review-gate-github-adapter`, `review-gate-enforcement-promotion`, then
          `review-gate-enforcement-qualification`. Require each invocation to stage a finalized `abandon` receipt;
          stop on the first refusal or rollback.
        - Confirm the harvested lifecycle-readiness, add-before-remove, and direct-reply behaviors already live in
          Phases 1–2, and do not mint a replacement product WU without a real setup-kit consumer.
        - Remove the three identity-global `USER-INBOX` entries whose `WU_Target` names the abandoned slugs; their
          grooming concerns dissolve with the program rather than becoming homeless work.

    - `[ ]` **5.2.d Remove the two residues whose claims just retired**

        - After all three abandon transitions succeed, delete `providers/coderabbit/config.ts` and
          `runtime/qualification-activation.ts` with their now-subjectless tests, exports, and registrations.
        - Re-run the production-entry import/schema walk from Task 4.1.d - `tasks-review-gate-right-sizing.md` and
          confirm the removal neither reaches RSB-owned `core/contract-version-dispatch.ts` /
          `core/forward-evidence-eligibility.ts` nor reintroduces deleted controller code.

    - `[ ]` **5.2.e Regenerate and validate the backlog view**

        - After staging all three transitions and the now-authorized residue deletion, run
          `arc status --project --staged > .arc/backlog/ROADMAP.md` and stage the resulting readiness view.
        - Verify each slug resolves `state: nonexistent`, its finalized receipt remains staged, and no live
          `Depends On`, owner, cohort, or planning authority claims the removed rung-4 program. Preserve historical
          mentions in completed artifacts and the superseded ADR.

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
          availability fallback, finding disposition/thread settlement, and the combined convergence/release
          presentation against the fixture, withholding approval because this disposable proof must not integrate.
        - Verify the session never asks whether to review, which source to select next, or whether an in-ceiling
          pass is authorized; do not fire a production unlock whose default-branch workflow is not installed.

    - `[ ]` **5.3.c Close the pre-merge proof and hand off activation inputs**

        - Record the fixture PR URL, exact base/head, selected standard source, and typed hosted-PR outcomes in this
          task's completion note; keep born-lock, push-relock, planning-stamp, head-as-data readiness, and
          exact-head-unlock contract/fixture results explicitly separate from the live hosted facts. The closed PR
          and task outcome are the durable record—do not introduce an evidence ledger or new fixture artifact.
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

- `[ ]` Human stops are limited to structured disposition, the combined convergence/unlock/integration approval,
  and the exceptional pass-ceiling decision.

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
  dispositions, and remains disclosure rather than merge evidence; no-review PRs omit it.

- `[ ]` Self-hosting enables its ordered frontline and standard sources, while a default installation with neither
  list configured still completes integration despite change-shaped `standardReview`; the merge guard remains
  absent or cleanly skipped.

- `[ ]` All quality gates pass (tests, linting, type checking, build, and projected-copy checks).

- `[ ]` Ready for integration.

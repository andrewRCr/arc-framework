# Task List: Pull-request surface policy

- **Design:** `spec-pull-request-surface-policy.md`

---

## **Phase 1:** Establish the installed method and Errand path

_Purpose:_ Prove that one configurable policy reaches both pull-request composition and commit decisions before
replicating its use across the remaining workflows.

_Mode:_ `slice` — install the policy, preserve a project override, and exercise the Errand composition and fix paths.

_Exit criterion:_ A fresh install exposes the configurable method, an update preserves its populated override, and
the Errand's creation, commit, and approved-fix steps consume the same policy without changing review authority.

### `[ ]` **1.1 Introduce the method and Errand consumers — M1–M3, M5–M6, R5, R8**

- _Goal:_ The installed policy governs an Errand's authored title, body, and commit decisions, honors project
  prescriptions and overrides, and leaves publication and review authority intact.

- _Note:_ See `notes-pull-request-surface-policy.md` § Installation and § Method reachability for the coupled
  shipment surfaces and the distinction between method declarations and actual load points. The policy covers
  S1–S4, T1–T5, B1–B7, H1, and D1.

    - `[ ]` **1.1.a Author the policy and wire the Errand composition paths**
        - Add `packages/arc-framework/arc/system/methods/pull-request-format.md` and its `.arc/` counterpart in the
          standard method shape. Declare only `commit-format` under `arc.methods`; use the operation-anchored
          `When:` and put both squash validity and the multi-member terminal-title restriction in `Contract:`.
        - Open the default with its scope and planning/lifecycle-only exclusions, while retaining every Errand
          pull request. State the change/process boundary, subject-matter exception, target-project prescriptions,
          inherited GitHub defaults, and security-policy treatment of undisclosed vulnerabilities.
        - Carry the title grammar and its cross-strategy justification, the five ordered body sections and their
          gates, qualifying decision selection, pinned single/layered design links, verification-only Test Plan,
          length heuristic, no default metadata, and composition from the change rather than release notes.
        - Include the copy-ready five-heading block with omission instructions on every conditional section and
          the non-terminal presentation guidance. Preserve prescribed template structure and required disclosures.
        - In `run-errand.md`, declare and explicitly load the method at Execute's commit step and Ship's creation
          arm. Replace its inline body and title instructions with the policy reference; record only qualifying
          decisions in plain-prose commit bullets in both protection modes, including its message example.
        - Add the one-line decision-guide citation to `commit-format` and its `related` list without adding a
          reverse `arc.methods` edge. Reconcile both related-method rows in `system/methods/README.md`.
        - Sync framework sections to `.arc/` while preserving overrides. Retarget the template-content test in
          `review-driver-lifecycle.test.ts` to the method contract and the Errand assertions in
          `review-gate-workflows.test.ts`; keep unrelated review assertions.

    - `[ ]` **1.1.b Install the configurable method and prove override preservation**
        - Add the method path to `CONFIGURABLE_FILES` in `src/lib/classification.ts` and to unconditional
          `include_files` in `init-recipe.json`; introduce no configuration key or runtime override parser.
        - Exercise `classifyFile`, `resolveFileList`, and actual installation through `__tests__/unit/init.test.ts`,
          `__tests__/integration/init.test.ts`, and `__tests__/e2e/init.e2e.test.ts`. Update their installed-method
          inventories and verify the method installs for core use without an optional PM feature.
        - Extend `__tests__/integration/update.test.ts` with a populated method override surviving `runUpdate`;
          assert retained override bytes, `Configurable` classification, and the package pristine hash.
        - Align `.arc/system/.internal/manifest.json` and the configurable inventory and derived counts in
          `strategy-package-project-sync.md` with `resolveFileList` and `buildManifestFiles`. Extend the existing
          `framework-sync.test.ts` shipment checks rather than hard-coding a new inventory source.
        - Add recipe inclusion and method-link resolution coverage to `prepublication-workflow.test.ts`. Keep the
          old template's recipe entry until its last consumer is migrated in Phase 3.
        - Run the affected init, update, framework-sync, and method/workflow contract tests, plus
          `npm run -s lint:arc:triggers`; the method must be reachable through its Errand consumer.

### `[ ]` **1.2 Keep the Errand description current after review fixes — K1**

- _Goal:_ An approved pushed review fix leaves the open Errand description accurate, including any decision the
  fix changed and any design link it carries.

- _Note:_ See `notes-pull-request-surface-policy.md` § Keep-current scenarios for the Git checks and their bounded
  place in the existing review-fix round.

    - In `run-errand.md` Ship step 4, after an approved fix is pushed, load the declared format method when editing
      the description and update every section and qualifying decision the fix made inaccurate.
    - For each linked design path, use `git diff --quiet <pinned> HEAD -- <paths>` and test ancestry with
      `git merge-base --is-ancestor <pinned> HEAD`; re-pin when either test fails. Omit design-link work when no
      design document is linked, and preserve the surrounding settlement and exact-head continuation.
    - Sync the project copy and extend the Errand workflow contract assertions in `review-gate-workflows.test.ts`
      to locate this instruction after the approved-fix push, including both Git tests and all linked paths.

### `[ ]` **1.3 Exercise the installed Errand path** — validate exit criterion at segment scope

- _Goal:_ Installation, override preservation, Errand composition, and its approved-fix update path form a usable
  first instance of the policy.

    - Run the focused init/update and affected workflow contract tests and `arc check segment`.
    - Inspect a disposable install to confirm the method is available, its references resolve, and its populated
      override survives an update. Reuse the integration-test fixture rather than writing into this checkout.
    - Walk the Errand's commit, creation, and pushed-fix instructions against the method. Check both protection
      modes, a target-prescribed template/disclosure, no qualifying decision, and multiple qualifying decisions.
    - Exercise the Git re-pin predicates in a disposable repository for unchanged, changed, layered, and
      non-ancestor design pins. Record what ran and what the source checks prove; do not claim a hosted PR ran.

## **Phase 2:** Adopt the policy in work-unit and delivery workflows

_Purpose:_ Apply the proven composition policy to the remaining publication and review-fix consumers.

_Mode:_ `replication` through Phase 3 — exhaust the named consumers and reconciliations, then remove the old template.

### `[ ]` **2.1 Unify work-unit creation and review-fix guidance — M6, B7, K1, R9**

- _Goal:_ Ordinary work-unit and terminal delivery requests use the same authored title/body policy, and their
  descriptions remain accurate after approved pushed corrections.

- _Note:_ See `notes-pull-request-surface-policy.md` § Keep-current scenarios and § Regression ownership for the
  delivery continuation and existing assertions that must change.

    - In package `integrate-work-unit.md`, declare `pull-request-format` and load it in step 1 before composing
      the title or body. Replace the section inventory, template link, review-carrier field, and independent title
      instruction with the method reference. Compose from the diff, design, and verification, not release notes.
    - In step 2, load the method at description edits after an approved fix is pushed; update inaccurate sections
      and decisions, and apply both Git re-pin tests to every linked design path.
    - Cover the terminal request when a correction publishes through `arc delivery review-fix continue`; place
      the update after its pushed correction and before review re-entry without replacing its typed continuation.
    - Sync `.arc/` and retarget the integration creation assertion in `review-gate-workflows.test.ts`. Extend
      source-level coverage for the load points, keep-current placement, layered pins, and delivery correction;
      preserve the existing resolver, settlement, re-entry, and exact-head assertions.

### `[ ]` **2.2 Delegate delivery presentation guidance to the method — M6, T5, D1–D2**

- _Goal:_ Authored delivery presentations follow the shared policy while the existing publisher remains the
  authority for composed member titles and bodies.

- _Note:_ `DeliveryMemberReviewerPresentation`, `resolveDeliveryPublicationPresentations`, and
  `composeDeliveryRequestTitle` in `src/lib/delivery/materialization.ts` define the unchanged presentation and
  composition behavior. See `notes-pull-request-surface-policy.md` § Delivery constraints.

    - In package `deliver-stack.md` Validate and publish, declare and load `pull-request-format` in place of the
      ordinary/member template forms; route terminal and non-terminal content to its respective guidance.
    - Remove `designReference` from the presentation example and instruct authors not to supply it. Retain
      `deliverableId`, `summary`, optional `changes`, and the complete `terminalPresentation` input.
    - Scope the admitted Conventional Commits terminal-title constraint to multi-member deliveries and cite the
      method contract; keep the one-member authored title under the ordinary title policy.
    - Correct the title-composition account: `deriveDeliveryTitleIdentity` supplies the type from the authored
      terminal title, while `composeDeliveryRequestTitle` uses the work-unit ID as scope and the plan's position.
      Do not add an authored member-title field or change publication code, validation, or existing-request adoption.
    - Sync `.arc/` and extend `prepublication-workflow.test.ts` for the method load and revised example. Preserve
      `__tests__/unit/delivery/materialization.test.ts` coverage of single/multi-member titles and refusal behavior.

## **Phase 3:** Retire the template and reconcile policy

_Purpose:_ Leave one coherent composition policy across rules, decisions, installation, and regression checks.

_Exit criterion:_ All named consumers load the method, no installed file references the removed template, and
installation, override preservation, method dependencies, and package/project synchronization checks pass.

### `[ ]` **3.1 Reconcile the surface boundary and squash wording — R1–R4**

- _Goal:_ Universal rules and this repository's local guidance agree on the pull-request boundary and its sole
  design-link exception, without changing commit subject or traceability policy.

    - `[ ]` **3.1.a Replace the pull-request rule and add the design-link exception**
        - In package `DEV-RULES.ARC.md` Commit and PR surface language, retain the commit half and replace the
          pull-request half with an operation-anchored directive to load `pull-request-format` before composing or
          editing any in-scope title or body, inside or outside a workflow. State its default boundary and the
          subject-matter exception without duplicating the body's shape.
        - In the artifact-reference rule, add one clause exempting the commit-pinned link to the design document
          in the request's diff from both the published-reference ban and the filename-only/no-links rule.
        - Sync the universal rule. Add at most two sentences to `.arc/system/rules/DEV-RULES.PROJECT.md`: ARC
          concepts are domain vocabulary when they are the change's subject; work-unit/Errand identities used to
          narrate how the change was made remain process.
        - Inspect the final rules against the method's scope, prescribed-template precedence, and override
          contract. Keep this repository's own domain reading out of the package's project-rule defaults.

    - `[ ]` **3.1.b Correct the squash traceability guidance in both copies**
        - In `strategy-configurability-architecture.md`'s squash bullet and the `merge.strategy` comment in
          `arc-config.yml`, say the title becomes the commit subject; remove the claim that descriptions carry
          individual-commit traceability.
        - Apply the same targeted comment change to `.arc/system/arc-config.yml`, preserving all project settings.
          Sync the strategy and verify the remaining configuration differences are project overrides.

### `[ ]` **3.2 Align the decision record and standalone grooming guidance — R6–R7**

- _Goal:_ The Errand decision record names the new presentation and qualification tests, and the excluded
  grooming flow retains its own self-contained body guidance.

    - Append a dated forward amendment to `.arc/reference/adr/adr-037-decide-errand-boundary-by-record-test.md`:
      qualifying pull-request decisions appear in Notes for Reviewers, and both the request and commit record each
      qualifying decision. Preserve the original decision and earlier amendment verbatim.
    - In package `drain-inbox.md`, retain its lean grooming body and routing-plan content on their own terms;
      remove the dependency on mirroring `run-errand.md`'s retired inline body. Sync the project copy.
    - Check the amendment against the choice/alternative/reason form and inclusion/exclusion tests. Confirm no
      unrelated planning/lifecycle body is migrated to the new method.

### `[ ]` **3.3 Remove the template and reconcile shipment evidence — M4, R8–R9**

- _Goal:_ Install and update deliver one composition policy, remove the old framework template, and leave no
  shipped reference or regression assertion depending on its retired guidance.

- _Note:_ See `notes-pull-request-surface-policy.md` § Installation and § Regression ownership for manifest,
  update-removal, and test retargeting boundaries.

    - `[ ]` **3.3.a Remove the template and align installed membership**
        - Delete `reference/templates/arc/work-unit/template-pull-request.md` from package source and `.arc/`,
          remove its recipe entry and templates README listing, and remove the remaining workflow link definitions.
        - Refresh the self-hosting manifest and inventory from the final recipe/classifier result. Keep the new
          method's related rows and the configurable inventory synchronized; derive final counts rather than
          carrying forward the intermediate addition-only values.
        - In `__tests__/integration/update.test.ts`, exercise an installation carrying the old Framework template,
          then update using the new recipe. Check removal from disk, pristine storage, and manifest, alongside
          installation of the configurable method. Reuse the existing generic update machinery; add no alias.
        - Confirm `resolveFileList` excludes the old path and includes the new one in every applicable recipe arm.

    - `[ ]` **3.3.b Complete the retirement and policy regression checks**
        - Finish retargeting `review-driver-lifecycle.test.ts`, `prepublication-workflow.test.ts`, and
          `review-gate-workflows.test.ts` to the method, its consumers, and contextual absence of retired guidance.
          Follow the method's actual links in its reference-resolution test, without the template's four-link count.
        - Assert both template copies and its recipe entry are gone, and search the shipped package corpus for
          its basename. Keep historical planning/ADR records outside that shipped-content prohibition.
        - Check that no shipped instruction prescribes pull-request Design/Local review field lines, a Decisions
          heading, or Follow-Up Work. Permit explanatory absence rules and the excluded grooming workflow's own
          shape; do not ban field names in unrelated artifact metadata.
        - Run the affected workflow, init/update, and framework-sync tests. Preserve unrelated protocol coverage
          and existing delivery publication tests; add no title/body runtime gate.

### `[ ]` **3.4 Check the complete adopted surface** — validate exit criterion at segment scope

- _Goal:_ The entire enumerated surface uses one reachable installed method, with coherent rules and no dangling
  template references or conflicting pull-request instructions.

    - Run `arc check segment`, the affected contract tests, and the method-trigger and link audits. Confirm
      package/project framework equality and preservation of configurable project sections.
    - Inspect a fresh installed corpus and an upgraded old-template installation, using recipe-derived membership
      rather than package-file presence as evidence. Verify the method's references resolve after installation.
    - Walk ordinary Errand/work-unit composition, prescribed-template precedence, squash override constraints,
      multi-member terminal and non-terminal guidance, one-member titles, layered designs, and pushed-fix updates.
    - Confirm the title publisher, template scaffold behavior, review-disposition commit bodies, review-projection
      script, and excluded planning/lifecycle bodies remain within the specification's non-goals.
    - Record executed scenarios and their results. Keep the later pull-request sampling distinct from source and
      installation evidence; see `notes-pull-request-surface-policy.md` § Verification timing.

## **Phase 4:** Verification

### `[ ]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ Quality gates, source and installation evidence, and the explicitly post-landing observations have
  truthful dispositions before integration.

---

## Success Criteria

- `[ ]` After landing, sampled Errand and work-unit requests use titles valid under `commit.format`, under the
  default policy and without a prescribed template; exclude composed multi-member titles.

- `[ ]` After landing, sampled authored bodies use only the applicable sections in Summary, Changes, Notes for
  Reviewers, Test Plan, and Out of Scope order, without empty placeholders.

- `[ ]` After landing, sampled requests carry no process vocabulary, artifact references, or review metadata,
  apart from their subject matter and applicable commit-pinned design links.

- `[ ]` After landing, sampled bodies fit the method's one-screen heuristic; work-unit decisions remain selected
  and Errands retain every qualifying decision.

- `[ ]` After landing, sampled request decisions use the same question/choice/alternative/reason form and their
  corresponding commit decisions retain the content as plain-prose bullets.

- `[ ]` `classifyFile` reports the installed method as `Configurable`, and a real `runUpdate` preserves a populated
  override with the correct pristine baseline and no new configuration key.

- `[ ]` Fresh installs omit the retired template, updates remove its former Framework installation, both source
  copies are absent, and no shipped file references it.

- `[ ]` `commit-format` cites the decision guide through `related` only, the method fires the commit grammar, and
  both Errand protection modes load the guide when composing qualifying commit decisions without a dependency cycle.

- `[ ]` Shipped creation guidance prescribes no Design/Local review field line, Decisions heading, or Follow-Up
  Work section in an in-scope authored body, and the default adds no disclosure or provenance metadata.

- `[ ]` All three publication workflows declare and load the method at composition; Errand and integration fix
  rounds update descriptions after approved pushed fixes and re-pin on either Git test, for every design path and
  terminal delivery corrections.

- `[ ]` The universal rules, repository-specific domain reading, squash guidance, forward ADR amendment, grooming
  body guidance, indexes, and self-hosting inventory agree with the format policy and preserve its scope exclusions.

- `[ ]` The retargeted workflow and install/update tests pass; existing delivery tests still prove unchanged
  single/multi-member title behavior, while trigger, reference, and framework-sync checks remain green.

- `[ ]` All quality gates pass.

- `[ ]` Ready for integration.

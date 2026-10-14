# Task List: Pull-request surface policy

- **Design:** `spec-pull-request-surface-policy.md`

---

## **Phase 1:** Establish the installed method and Errand path

_Purpose:_ Prove that one configurable policy reaches both pull-request composition and commit decisions before
replicating its use across the remaining workflows.

_Mode:_ `slice` — install the policy, preserve a project override, and exercise the Errand composition and fix paths.

_Exit criterion:_ A fresh install exposes the configurable method, an update preserves its populated override, and
the Errand's creation, commit, and approved-fix steps consume the same policy without changing review authority.

### `[x]` **1.1 Introduce the method and Errand consumers — M1–M3, M5–M6, R5, R8**

- _Goal:_ The installed policy governs an Errand's authored title, body, and commit decisions, honors project
  prescriptions and overrides, and leaves publication and review authority intact.

    - `[x]` **1.1.a Author the policy and wire the Errand composition paths**
        - Added the shared policy and title contracts, Errand commit/creation load points, and qualifying-decision
          guidance. Commit-format cites the guide without a reverse dependency; method indexes and workflow contract
          tests follow the new surface.

    - `[x]` **1.1.b Install the configurable method and prove override preservation**
        - Registered and installed the core Configurable method; real init/update fixtures cover populated override
          bytes and pristine content. Recipe-derived manifest and inventory include the method.

### `[x]` **1.2 Keep the Errand description current after review fixes — K1**

- _Goal:_ An approved pushed review fix leaves the open Errand description accurate, including any decision the
  fix changed and any design link it carries.

- _Outcome:_ After an approved pushed fix, the Errand loads the policy, corrects inaccurate sections and decisions, and
  checks all linked design paths plus pin ancestry before review re-entry.

### `[x]` **1.3 Exercise the installed Errand path** — validate exit criterion at segment scope

- _Goal:_ Installation, override preservation, Errand composition, and its approved-fix update path form a usable
  first instance of the policy.

- _Outcome:_ Disposable core installations resolve the method links and preserve populated overrides. The Errand
  walkthrough covers both protection modes, prescribed structure/disclosure, and zero or multiple qualifying decisions;
  disposable Git scenarios cover unchanged, single/layered changes, and equal-content non-ancestor pins. These are
  source/install checks, not observed hosted requests.

## **Phase 2:** Adopt the policy in work-unit and delivery workflows

_Purpose:_ Apply the proven composition policy to the remaining publication and review-fix consumers.

_Mode:_ `replication` through Phase 3 — exhaust the named consumers and reconciliations, then remove the old template.

### `[x]` **2.1 Unify work-unit creation and review-fix guidance — M6, B7, K1, R9**

- _Goal:_ Ordinary work-unit and terminal delivery requests use the same authored title/body policy, and their
  descriptions remain accurate after approved pushed corrections.

- _Outcome:_ Work-unit creation loads the shared policy; pushed fixes refresh inaccurate sections and layered design
  pins. Delivery correction resumes description upkeep for its canonically bound terminal request before status
  re-entry, preserving typed authoring and settlement authority.

### `[x]` **2.2 Delegate delivery presentation guidance to the method — M6, T5, D1–D2**

- _Goal:_ Authored delivery presentations follow the shared policy while the existing publisher remains the
  authority for composed member titles and bodies.

- _Outcome:_ Terminal and non-terminal presentations use the method; the example omits designReference. The guidance
  distinguishes one-member titles from multi-member type admission and correctly assigns scope to the work-unit ID;
  publisher code and adoption behavior are unchanged.

## **Phase 3:** Retire the template and reconcile policy

_Purpose:_ Leave one coherent composition policy across rules, decisions, installation, and regression checks.

_Exit criterion:_ All named consumers load the method, no installed file references the removed template, and
installation, override preservation, method dependencies, and package/project synchronization checks pass.

### `[x]` **3.1 Reconcile the surface boundary and squash wording — R1–R4**

- _Goal:_ Universal rules and this repository's local guidance agree on the pull-request boundary and its sole
  design-link exception, without changing commit subject or traceability policy.

    - `[x]` **3.1.a Replace the pull-request rule and add the design-link exception**
        - Replaced the pull-request half with the operation trigger and surface boundary, preserving commit prose. One
          design-link exception covers the published-reference and filename-only rules; the project rule distinguishes
          ARC domain concepts from process narration.

    - `[x]` **3.1.b Correct the squash traceability guidance in both copies**
        - Squash guidance now states that the title becomes the commit subject. Both configuration comments changed
          without altering project settings.

### `[x]` **3.2 Align the decision record and standalone grooming guidance — R6–R7**

- _Goal:_ The Errand decision record names the new presentation and qualification tests, and the excluded
  grooming flow retains its own self-contained body guidance.

- _Outcome:_ Appended the forward amendment for qualifying decisions under Notes for Reviewers and in commit prose,
  preserving the original record. Grooming body guidance stands on its own routing-plan content.

### `[x]` **3.3 Remove the template and reconcile shipment evidence — M4, R8–R9**

- _Goal:_ Install and update deliver one composition policy, remove the old framework template, and leave no
  shipped reference or regression assertion depending on its retired guidance.

    - `[x]` **3.3.a Remove the template and align installed membership**
        - Removed both template copies, recipe membership, and index entries. Recipe-derived shipment counts are 102
          Framework and 36 Configurable files; real update coverage removes the legacy file, pristine entry, and
          manifest entry while adding the method.

    - `[x]` **3.3.b Complete the retirement and policy regression checks**
        - Retargeted the workflow and reference checks to the method, with no fixed link count. Regression coverage
          proves both template copies and recipe membership are absent, scans the package corpus for dangling
          references, and distinguishes PR-body instructions from unrelated metadata fields.

### `[x]` **3.4 Check the complete adopted surface** — validate exit criterion at segment scope

- _Goal:_ The entire enumerated surface uses one reachable installed method, with coherent rules and no dangling
  template references or conflicting pull-request instructions.

- _Outcome:_ The installed and upgraded corpora, live reference resolution, method graph, package/project parity, and
  composition walkthrough cover the enumerated surface. Source checks cover template/disclosure precedence, squash and
  stack title contracts, layered pins, and post-push updates; disposable Git scenarios exercise both pin predicates.
  Hosted post-landing sampling remains unperformed for terminal verification.

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

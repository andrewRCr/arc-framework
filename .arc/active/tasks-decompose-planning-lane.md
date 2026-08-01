# Task List: Decompose Planning Lane

- **Design:** `spec-decompose-planning-lane.md`

---

## **Phase 1:** Exact-ref planning classification

_Purpose:_ Admit only one canonical current receipt beside otherwise planning-only endpoints.

### `[ ]` **1.1 Add repository evidence beside the pure policy**

- _Goal:_ Existing planning grammar remains pure while receipt authority is resolved asynchronously.

    - `[ ]` **1.1.a Build the exact-ref adapter**
        - Resolve canonical change facts and blobs for the exact base/head pair, detect retirement endpoints, and
          consume core validation plus base-mobility descendant verdicts.
        - Return `planning | reviewed | invalid-retirement` with an optional stable locus.

    - `[ ]` **1.1.b Preserve the narrow endpoint exception**
        - Admit one current canonical v3 receipt path only; independently apply existing planning path/mode grammar
          to every other endpoint.
        - Refuse legacy, malformed, multiple, existing-in-base, historical-only, unrelated-record, code, rule,
          strategy, foreign-owner, rename/copy/mode/type, and rider cases.

### `[ ]` **1.2 Wire the exact review command**

- _Goal:_ Purported invalid authority fails rather than downgrading.

    - `[ ]` **1.2.a Make `handleReviewPlanningLane()` the sole host owner**
        - Print `planning` only for complete validation, `reviewed` for ordinary noneligible/unknown changes, and
          exit nonzero for `invalid-retirement`.

    - `[ ]` **1.2.b Bind immutable candidate authority**
        - Preserve exact base/head SHAs through validation and clearance publication and reread before action.
        - Publish no success for stale head, fork ambiguity, unreadable facts, or an unbindable host.

## **Phase 2:** Opt-in host security coupling

_Purpose:_ Change receipt ownership only when exact-head clearance and base currency are structurally enforced.

### `[ ]` **2.1 Couple the ownership exception to prerequisites**

- _Goal:_ Default installation remains reviewed and fail-safe.

    - `[ ]` **2.1.a Keep every host feature default-off**
        - Verify ordinary ARC installation does not install planning auto-merge, require `arc-cleared`, or unown the
          receipt namespace.

    - `[ ]` **2.1.b Install prerequisites before CODEOWNERS**
        - In the explicit recipe, install and verify the exact-head `arc-cleared` context and up-to-date-base rule
          before adding only the receipt namespace to the final unowned block.
        - If workflow, context, base-current rule, or admin verification is unavailable, retain ownership and report
          reviewed behavior.

    - `[ ]` **2.1.c Preserve one-way coupling**
        - Permit independent `arc-cleared` installation without enabling planning auto-merge or changing ownership.

### `[ ]` **2.2 Project package-source host assets**

- _Goal:_ Setup guidance, recipes, workflow, and ownership never drift across installed/project copies.

    - `[ ]` **2.2.a Update the authoritative asset family**
        - Edit package-source CODEOWNERS, clearance workflow, merge-gate recipe/readme, setup guidance, and initial
          setup together.

    - `[ ]` **2.2.b Render and verify project parity**
        - Use the established Framework projection; never dual-edit package and project copies.

## **Phase 3:** Security and workflow acceptance

_Purpose:_ Prove the complete opt-in boundary without re-testing transform internals.

### `[ ]` **3.1 Cover classifier and host failure matrices**

- _Goal:_ Every malformed or stale authority remains reviewed or fails closed.

    - `[ ]` **3.1.a Extend exact-ref command tests**
        - Cover zero/one/multiple receipt paths, add/modify/delete, ID mismatch, patch/source/base/target/dependency
          mismatch, refreshed ancestry, fork, and stale-head behavior.

    - `[ ]` **3.1.b Extend recipe and CODEOWNERS contracts**
        - Prove last-match ownership, prerequisite order, required exact-head context, base-current enforcement,
          default-off posture, and package/project parity.

    - `[ ]` **3.1.c Keep semantic approval separate**
        - Assert mechanical lane eligibility never substitutes for the distribution interlock.

## **Phase 4:** Verification

### `[ ]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Exactly one canonical current v3 receipt may accompany otherwise planning-only endpoints.
- `[ ]` Purported invalid retirement evidence fails nonzero and never downgrades permissively.
- `[ ]` Clearance binds one exact live base/head pair and publishes nothing after movement or ambiguity.
- `[ ]` New installs remain reviewed/default-off.
- `[ ]` The ownership exception requires verified `arc-cleared` exact-head and base-current enforcement.
- `[ ]` Package/project host-policy assets remain projection-identical.
- `[ ]` No semantic classifier, approval token, duplicate receipt validator, or transform behavior is added.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.

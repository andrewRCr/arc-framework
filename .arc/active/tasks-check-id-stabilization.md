# Task List: Check ID Stabilization

- **Design:** `spec-check-id-stabilization.md`

---

## **Phase 1:** Stabilize check identity across the live surface

_Purpose:_ Give every current pre-commit check and its live consumers one stable identity, with source tests that
remain valid when neighboring checks change.

_Mode:_ `replication` — closes on the complete live-reference migration with position-independent test targeting.

_Exit criterion:_ All enumerated live references name their intended stable check, source-selection regressions pass,
and the two hook copies match with comment-only production changes.

### `[x]` **1.1 Add exact-ID source-block selection**

- _Goal:_ Source assertions select only the requested check's block and reject ambiguous or incomplete boundaries.

- _Outcome:_ Added a test-local exact-ID selector with generic next-heading and final Summary boundaries.
  Synthetic fixtures cover neighbor insertion/reordering, prefix and description decoys, and explicit missing-ID,
  duplicate-ID, and missing-Summary failures.

### `[x]` **1.2 Assign stable IDs to the hook and its source assertions**

- _Goal:_ Every current hook block has its intended stable identity, and existing wiring assertions inspect that
  block without depending on its neighbors' identities.

- _Outcome:_ Applied all 19 specified IDs and documented their preservation convention in matching hook copies;
  non-comment lines remain unchanged. Replaced all five positional slices with exact-ID selection, preserving the
  behavior assertions and adding heading-grammar and uniqueness coverage.

### `[x]` **1.3 Correct validator references and their unit-test labels**

- _Goal:_ Validator comments and test descriptions identify the concern that actually owns each validation result.

    - `[x]` **1.3.a Align extension-point and neutrality references**
        - Corrected validator and unit-test comments to name `CHECK[extension-point-references]` and its
          complementary `CHECK[package-source-neutrality]` gate.

    - `[x]` **1.3.b Align malformed-frontmatter ownership references**
        - Corrected the neutrality validator's suppressed-parse-error comment and unit-test label/comment to name
          `CHECK[frontmatter-schema]`; validator behavior and test assertions remain unchanged.

### `[x]` **1.4 Migrate integration-test references**

- _Goal:_ Integration-test descriptions refer to the same stable checks they exercise.

- _Outcome:_ Migrated all three integration-test comments and their ordinal suite labels to the matching stable
  check IDs; fixture setup and behavior assertions remain unchanged.

### `[x]` **1.5 Migrate integrity-check references**

- _Goal:_ Integrity diagnostics accurately distinguish the current frontmatter hook from the post-hoc audit.

    - `[x]` **1.5.a Align integrity-script comments**
        - Updated the frontmatter reference to `CHECK[frontmatter-schema]` in both integrity scripts through
          targeted comment edits.

    - `[x]` **1.5.b Align integrity-workflow guidance**
        - Updated the packaged workflow to use backticked `CHECK[frontmatter-schema]` and projected the installed
          copy with the framework renderer; integrity-check scope and behavior remain unchanged.

### `[x]` **1.6 Migrate customization guidance and the extension-marker precedent**

- _Goal:_ Current customization guidance and durable extension-marker analysis point to the intended stable checks.

- _Outcome:_ Migrated both customization references through package source and framework rendering, and corrected
  the durable extension-marker precedent. The final live-reference census contains no ordinal pre-commit citations;
  historical audit text and unrelated PR-number fixtures remain unchanged.

## **Phase 2:** Verification

_Purpose:_ Validate the complete migration against its acceptance criteria and project quality gates.

### `[ ]` **2.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ The complete migration meets its acceptance criteria with recorded behavior, reference, and quality evidence.

---

## Success Criteria

- `[ ]` Each current hook check has its specified stable ID; all headings satisfy the grammar and are unique.

- `[ ]` A case-insensitive scan of live code, scripts, tests, and durable documentation finds no ordinal references
  to current pre-commit checks; both READMEs and the known schema, neutrality, and extension corrections are covered.

- `[ ]` Source-block selection survives neighboring insertion and reordering, including final-block selection.

- `[ ]` Missing or duplicate requested IDs and a missing final Summary boundary fail explicitly.

- `[ ]` Package and project hook copies match, production edits are comments only, and behavior assertions pass.

- `[ ]` Historical records and excluded planning artifacts remain untouched.

- `[ ]` All quality gates pass.

- `[ ]` Ready for integration.

# Task List: Check ID Stabilization

- **Design:** `spec-check-id-stabilization.md`

---

## **Phase 1:** Stabilize check identity across the live surface

_Purpose:_ Give every current pre-commit check and its live consumers one stable identity, with source tests that
remain valid when neighboring checks change.

_Mode:_ `replication` — closes on the complete live-reference migration with position-independent test targeting.

_Exit criterion:_ All enumerated live references name their intended stable check, source-selection regressions pass,
and the two hook copies match with comment-only production changes.

### `[ ]` **1.1 Add exact-ID source-block selection**

- _Goal:_ Source assertions select only the requested check's block and reject ambiguous or incomplete boundaries.

- _Approach:_ Keep the selector local to `pre-commit-shell-invocation.test.ts`; prove its contract with synthetic
  source before connecting it to the live hook.

    - Implement the spec's `Position-independent source-block tests` decision: match the exact heading ID, end at
      the next generic check heading, and use `# Summary` for the final block. Do not add a production parser.
    - Build `test-first` (one behavior at a time):
        - A selected block excludes its neighbors; similar ID prefixes and marker text in descriptions do not
          select another heading.
        - Inserting or reordering neighboring checks preserves the selected body and existing IDs, including when
          the selected block becomes the final block.
        - Missing or duplicate requested IDs and a missing final-block Summary boundary fail explicitly.

### `[ ]` **1.2 Assign stable IDs to the hook and its source assertions**

- _Goal:_ Every current hook block has its intended stable identity, and existing wiring assertions inspect that
  block without depending on its neighbors' identities.

- _Context:_ The hook headings and the existing `preCommitSource.slice` callsites must change together so the
  migrated hook retains meaningful passing source assertions.

    - Apply the full initial map in `spec-check-id-stabilization.md` § Stable check identities to the packaged
      `system/.internal/githooks/pre-commit`; migrate its internal references and state the convention in its prologue.
    - Propagate the same comment edits to `.arc/system/.internal/githooks/pre-commit` through targeted edits from
      package source. Preserve human descriptions, execution order, filtering, configuration, diagnostics, and policy.
    - Replace all five ordinal-based `preCommitSource.slice` callsites in `pre-commit-shell-invocation.test.ts` with
      the selector from Task 1.1; migrate its module comment and preserve every existing behavior assertion.
    - Build `test-first` (one behavior at a time):
        - Every live hook heading has a lowercase kebab-case ID matching `[a-z][a-z0-9]*(-[a-z0-9]+)*` and no duplicate.
        - The migrated lookups still prove foreign-write warnings, conflict-remedy ordering and errors, and ROADMAP
          assertion behavior; retain `projectPreCommitSource` equality with `preCommitSource`.
    - Review the production hook diff for comment-only changes and compare the resulting IDs against the initial map.

### `[ ]` **1.3 Correct validator references and their unit-test labels**

- _Goal:_ Validator comments and test descriptions identify the concern that actually owns each validation result.

    - `[ ]` **1.3.a Align extension-point and neutrality references**
        - In `packages/arc-framework/src/scripts/validate-extension-points.ts` and its
          `__tests__/unit/scripts/validate-extension-points.test.ts`, use `CHECK[extension-point-references]` for the
          extension validator and `CHECK[package-source-neutrality]` for its complementary gate. The hook's
          `extension_point_candidates` and `neutrality_candidates` name those blocks.

    - `[ ]` **1.3.b Align malformed-frontmatter ownership references**
        - In `packages/arc-framework/src/scripts/validate-package-neutrality.ts`'s `validateFiles` comment and its
          `__tests__/unit/scripts/validate-package-neutrality.test.ts`, use `CHECK[frontmatter-schema]` for suppressed
          parse errors, whose hook owner is `frontmatter_candidates`; retain all validator behavior and assertions.

### `[ ]` **1.4 Migrate integration-test references**

- _Goal:_ Integration-test descriptions refer to the same stable checks they exercise.

    - Migrate comments and suite labels in `integration/pre-commit-meta-ref.test.ts`,
      `integration/validate-cohort-consistency.test.ts`, and `integration/validate-links.test.ts` under
      `packages/arc-framework/__tests__/` to `CHECK[meta-project-references]`, `CHECK[cohort-consistency]`, and
      `CHECK[markdown-links]`, respectively. Preserve the existing test setup and assertions.

### `[ ]` **1.5 Migrate integrity-check references**

- _Goal:_ Integrity diagnostics accurately distinguish the current frontmatter hook from the post-hoc audit.

    - `[ ]` **1.5.a Align integrity-script comments**
        - Migrate the frontmatter reference in packaged `system/.internal/scripts/verify-integrity.sh` to
          `CHECK[frontmatter-schema]`, then propagate that comment to its `.arc/` counterpart with targeted edits.

    - `[ ]` **1.5.b Align integrity-workflow guidance**
        - Migrate the same reference in packaged `system/workflows/arc/supplemental/verify-arc-integrity.md`, backtick
          the marker, and project its installed copy with `npm run -s render:framework -- <package-source-path>`.
          Preserve the scope and behavior of the integrity checks.

### `[ ]` **1.6 Migrate customization guidance and the extension-marker precedent**

- _Goal:_ Current customization guidance and durable extension-marker analysis point to the intended stable checks.

    - In packaged `system/.internal/githooks/README.md`, replace the sensitive-file and debug-statement customization
      references with `CHECK[sensitive-files]` and `CHECK[debug-statements]`; backtick both Markdown markers and
      project the installed copy with `npm run -s render:framework -- <package-source-path>`.
    - In `.arc/reference/supplemental/analysis/analysis-load-set-scoping.md`, identify the `point-scanner.ts` precedent
      with `CHECK[extension-point-references]`. Preserve the dated `analysis-beta-readiness-audit.md` and other
      historical records and planning artifacts.

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

# Spec (`outline`): Check ID Stabilization

- **Origin:** [internal]
- **Purpose:** Give pre-commit checks stable, descriptive identities and migrate their live references so adding,
  removing, or moving a check never requires renaming other checks or repairing positional citations.

---

## Problem / Context

The packaged `pre-commit` hook and its project copy have 19 checks numbered 1–20 with 10 absent. The
`extension_point_candidates` block is numbered 15, while its validator's module comment and test say 16. The
`neutrality_candidates` block is 14, while that validator's comment calls it 15. `validate-package-neutrality.ts`'s
`validateFiles` comment and its malformed-frontmatter test attribute schema errors to 12, while the responsible
`frontmatter_candidates` block is 11. In `pre-commit-shell-invocation.test.ts`, `preCommitSource.slice` addresses
blocks through ordinal headings and particular neighboring headings.

These disagreements come from using placement as identity. A case-insensitive census on 2026-10-03 identified
75 live ordinal-reference lines across 17 files, including both hook READMEs. The migration must identify each
reference's intended check rather than substitute numbers blindly.

## Decision(s)

### Stable check identities

Use `# CHECK[slug]: Human description` for check headings and `CHECK[slug]` for references, backticked in Markdown.
Slugs are lowercase kebab-case, begin with a letter, and contain nonempty alphanumeric segments: the grammar is
`[a-z][a-z0-9]*(-[a-z0-9]+)*`. They are unique within the pre-commit hook and name the concern being checked.
Keep an ID when its block moves or its description changes while the concern remains; assign a different concern
its own ID and do not recycle an old ID for unrelated work.

Use flat IDs. Navigation headings remain independent of identity, and this migration preserves the existing order.
Document the convention briefly in the packaged hook's prologue and sync its project counterpart. The hook headings
are the definition site; no separate maintained catalog is introduced.

This follows [pre-commit][pre-commit]'s separation of hook ID and displayed name. The bracket spelling is a local
convention, with descriptive names providing meaning directly rather than requiring a numeric-code lookup.

The initial migration assigns the following IDs; old ordinals are locators for their current blocks only:

| Existing heading | Stable identifier              |
| ---------------- | ------------------------------ |
| 1                | `base-branch-protection`       |
| 2                | `large-files`                  |
| 3                | `sensitive-files`              |
| 4                | `merge-conflict-markers`       |
| 5                | `debug-statements`             |
| 6                | `contributor-protected-files`  |
| 7                | `task-list-staging`            |
| 8                | `task-numbering`               |
| 9                | `meta-project-references`      |
| 11               | `frontmatter-schema`           |
| 12               | `domain-rules-frontmatter`     |
| 13               | `markdown-links`               |
| 14               | `package-source-neutrality`    |
| 15               | `extension-point-references`   |
| 16               | `meta-file-shape`              |
| 17               | `roadmap-regeneration-trigger` |
| 18               | `cohort-consistency`           |
| 19               | `roadmap-regeneration-assert`  |
| 20               | `foreign-write-advisory`       |

### One complete live migration

Migrate all live consumers once, with no ordinal aliases or dual labels. Edit package-source Framework files first
and sync their project counterparts through the existing sync path. The surface is:

- Both `pre-commit` copies, their headers, and internal references.
- Both `githooks/README.md` copies; their `Check 3` and `Check 5` customization references become
  `CHECK[sensitive-files]` and `CHECK[debug-statements]`.
- Both `verify-integrity.sh` copies and both `verify-arc-integrity.md` copies.
- The comments in `validate-extension-points.ts` and `validate-package-neutrality.ts`.
- The references and lookups in `pre-commit-meta-ref.test.ts`, `validate-cohort-consistency.test.ts`,
  `validate-links.test.ts`, `pre-commit-shell-invocation.test.ts`, `validate-extension-points.test.ts`, and
  `validate-package-neutrality.test.ts`.
- The extension-marker precedent in `analysis-load-set-scoping.md`.

Resolve inconsistent references by their meaning: the extension validator's old 16 means
`CHECK[extension-point-references]`, its old neutrality reference 15 means `CHECK[package-source-neutrality]`, and
the neutrality validator's old schema reference 12 means `CHECK[frontmatter-schema]`.

Preserve historical records and planning artifacts. In particular, `analysis-beta-readiness-audit.md` records its
2026-03-25 audit against that version and remains historical. The census is a migration baseline, not a permanent
count constraint. This remains one work unit because all affected surfaces consume the same identity convention.

### Position-independent source-block tests

Replace ordinal-based source slicing with test-local selection of the exact requested heading ID. End the block
at the next generic check heading; the final block ends before the existing `# Summary` section. Missing or
duplicate requested IDs, and a missing terminal Summary boundary when selecting the final block, fail explicitly.
Preserve the existing assertions about command wiring, errors, warnings, and other hook behavior.

Verify ID syntax and uniqueness across all hook headings. Exercise insertion and reordering around a selected
block, including selection of the final block, so a changed neighbor does not change which body is inspected.
This source extraction stays in tests and introduces no production parser or dispatch behavior.

## Scope boundary (No-gos)

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

The work changes check identity and live references. Production hook changes are comments only: execution order,
filtering, configuration, diagnostics, and failure policy are preserved. It does not redesign hook dispatch, add
structured diagnostics, introduce a global registry or corpus-wide reference linter, rename checks outside this
pre-commit hook, or repair unrelated validator behavior. Archived planning artifacts, dated historical records,
commit messages, and other work units' planning documents retain their recorded vocabulary.

## Consequences & Risks

- A one-time coordinated edit replaces ongoing renumber churn. Unpublished comment labels gain no compatibility
  aliases; readers use the migrated live documentation.
- Existing wrong labels make mechanical numeric substitution unsafe. Migration review resolves each reference's
  intended concern, with the known mismatches above as concrete checks.
- Case-sensitive searching can miss customization guidance. Acceptance uses a case-insensitive search over live
  code, scripts, tests, and durable documentation, classifying actual pre-commit references separately from
  unrelated text, regular-expression syntax, planning artifacts, and historical records.
- Marker mistakes can invalidate source-based assertions. Explicit selection failures, all-heading syntax and
  uniqueness checks, insertion/reordering coverage, and the existing two-copy equality assertion address that risk.

## Success Criteria

- Every current hook check has the specified stable ID, and every heading follows the syntax with no duplicates.
- Every live reference names its intended check. The migration includes both READMEs and corrects the known
  mislabeled schema, neutrality, and extension-point references; a case-insensitive acceptance scan finds no
  remaining ordinal references to current pre-commit checks.
- Inserting or reordering neighboring checks changes no existing ID or reference, and source-block tests still
  select the intended body, including when that body is last.
- Missing or duplicate requested IDs and a missing final-block Summary boundary produce explicit test failures.
- Package and project hook copies remain identical. Review of the hook diff confirms that execution and
  diagnostic semantics are unchanged, and the existing behavior assertions still pass.
- The historical exclusions remain untouched, and the project-required quality gates pass for the resulting change.

## Open items

None requiring design before implementation. Test-helper names and local code organization are implementation details.

## Amendments

None.

---

[pre-commit]: https://pre-commit.com/#creating-new-hooks

# Draft: check-id-stabilization

- **Origin:** [internal] — routed from a USER-INBOX capture at the `single-owner-wu-model` housekeep drain
  (2026-06-24); the root-cause follow-up to that WU's Task 4.2, which deliberately left a numbering gap at
  CHECK 10 (Option B) rather than trigger a renumber cascade.
- **Purpose:** Replace the pre-commit hooks' positional `CHECK N` ordinals with stable slug identifiers so check
  identity decouples from position — adding or removing a check never forces a renumber cascade — and correct the
  live off-by-one drift the ordinal scheme has already accumulated.

---

## Problem / Motivation

The packaged `pre-commit` hook and its project copy contain 19 check headings numbered 1–20, with 10 absent.
A case-insensitive source scan on 2026-10-03 found 75 ordinal-reference lines across 17 live files: both hooks,
both hook READMEs, both integrity scripts and workflow documents, two validator sources, six test files, and one
supplemental analysis document. The dated `analysis-beta-readiness-audit.md` records its March audit and is excluded
as historical; references in that record describe the audited version rather than the current hook.
The ordinals couple identity to placement even though a check's purpose survives insertion, removal, or reordering.

The source already disagrees about which check a number identifies:

- The `extension_point_candidates` block invokes `validate-extension-points.ts` under heading 15; that validator's
  module comment and dispatcher test label it 16. Its comment also calls package-source neutrality 15, while the
  hook's `neutrality_candidates` block is headed 14.
- The `frontmatter_candidates` block invokes method/extension schema validation under heading 11. The comment on
  `validate-package-neutrality.ts`'s `validateFiles` and its malformed-frontmatter test attribute those errors to
  12, which labels the separate `domain_rules_candidates` block.
- In `pre-commit-shell-invocation.test.ts`, `preCommitSource.slice` locates check blocks through numbered headings
  and specific neighboring headings. Updating labels alone would break these source-boundary assertions.

## Direction

Use meaning-based identifiers in `CHECK[slug]` markers and migrate the complete live reference surface once.
The convention is shared by headings, source comments, test descriptions, test lookups, and documentation.
Check execution, order, filtering, diagnostics, and failure policy remain the current hook's behavior.

The concern stays one WU: every changed surface consumes the same identity convention; none supplies an independent
capability requiring separate ownership or delivery. The design remains bounded and supports the current `Light`
classification.

## Identifier convention

- A check heading is `# CHECK[frontmatter-schema]: Frontmatter schema validation (methods / extensions)`.
  Preserve the human description separately from the identifier.
- Slugs use lowercase kebab-case, beginning with a letter, with nonempty alphanumeric segments. Name the enforced
  concern, never its source position, phase, or planned implementation order.
- An identifier is unique within the pre-commit hook. Preserve it when moving the block or editing its description
  while the same concern remains. Give a different concern its own ID; do not recycle an old ID for unrelated work.
- Use flat IDs within this hook. Any navigation headings remain independent of check identity; this migration
  preserves the current order rather than rearranging blocks into categories.
- Cross-references use the same `CHECK[frontmatter-schema]` spelling, backticked in Markdown. No ordinal aliases or
  dual labels are retained in live references.
- State the convention briefly in the packaged hook's prologue and sync it to the project copy. The hook headings
  remain the definition site; a separate runtime registry or maintained check catalog is unnecessary.

### Initial name map

The old ordinal below is a migration locator, not part of the new identity or a permanent registry.

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

## Alternatives and prior art

A bounded Luna research pass on 2026-10-03 checked official documentation for three relevant tooling families.
It supports the identity model, without establishing a universal spelling for Bash comment markers:

- [pre-commit][pre-commit] separates a hook's `id`, used for configuration and selection, from its displayed `name`.
  That is a close precedent for an identity that stays stable when its descriptive heading changes.
- [ESLint][eslint-rules] uses rule identifiers as configuration keys; [plugin rule IDs][eslint-plugins] add a
  namespace where multiple providers share the naming surface. These local hook blocks need no provider namespace.
- [ShellCheck][shellcheck-codes] uses numeric diagnostic codes such as `SC1010` with defined meanings. Numbers can
  be stable identifiers; the defect here is treating source order as identity, not using digits in principle.

`CHECK[slug]` is an intentional local convention, not a claimed industry standard. Semantic names follow the
tooling idiom; brackets make the marker distinct and searchable in comments and prose. The cited tools do not
prescribe how tests should delimit Bash source blocks.

Considered alternatives:

- **Renumber or preserve positional ordinals:** retains the source-order coupling that caused the drift.
- **Stable numeric codes:** viable prior art, but would require a code-to-meaning lookup where descriptive names
  already provide the meaning. They add no value for these comment labels.
- **Another semantic spelling, such as `CHECK: frontmatter-schema`:** satisfies the identity goal too. Brackets
  clearly delimit the identifier from the trailing description; there is no external compatibility contract
  requiring a different spelling.
- **Heal-on-touch migration:** prolongs mixed conventions and known wrong references across a small, enumerable
  surface. A single migration gives the next check addition one convention to follow.

## Migration and verification

Change package-source Framework files first and sync their project counterparts through the normal sync path.
Resolve each old reference by its intended concern, not a blind numeric substitution: the known mismatches point
at the wrong currently numbered block.

The migration covers:

- Both `pre-commit` copies, including their headers and internal cross-references.
- Both `githooks/README.md` copies, whose customization guidance names the sensitive-file and debug-statement
  checks as `Check 3` and `Check 5`; migrate these to `CHECK[sensitive-files]` and `CHECK[debug-statements]`.
- Both `verify-integrity.sh` copies and both `verify-arc-integrity.md` copies.
- `validate-extension-points.ts` and `validate-package-neutrality.ts` comments.
- The six test files found by the live-reference scan: `pre-commit-meta-ref.test.ts`,
  `validate-cohort-consistency.test.ts`, `validate-links.test.ts`, `pre-commit-shell-invocation.test.ts`,
  `validate-extension-points.test.ts`, and `validate-package-neutrality.test.ts`.
- The extension-marker precedent in `analysis-load-set-scoping.md`, whose ordinal also misidentifies the check.

For source-block assertions, select the requested exact heading ID and end at the next generic check heading;
the last block ends before the existing `# Summary` section. A missing or duplicate requested heading, or a missing
terminal Summary boundary for the last block, fails explicitly rather than producing a misleading slice. This is
test-local source extraction, not a production hook parser.

Verification checks identifier syntax and uniqueness across all hook headings, preserves the existing behavior
assertions, and exercises insertion and reordering around an addressed block, including the final block. These
changes must preserve its selected body without changing another check's ID.
Also verify clear rejection of missing and duplicate requested IDs and the missing last-block boundary. Inspect the
hook diff to confirm that the production changes are comments only, and retain the existing two-copy equality check.
Search the live code, scripts, tests, and durable documentation case-insensitively for remaining ordinal references,
including forms such as `CHECK 3` and `Check 3`. Classify matches by whether they address a current pre-commit check;
unrelated text and regular-expression syntax do not constitute check references. Planning artifacts and historical
records, including the dated `analysis-beta-readiness-audit.md`, are outside that search's acceptance boundary.

**Success signal:** every live check reference names its intended stable check; changing the position of a check
requires no changes to other IDs or references, and source-block tests still address the intended block. Existing
hook behavior tests pass with unchanged execution and diagnostic semantics.

## Scope boundary

The migration owns identifier conventions and their live consumers. It does not redesign hook dispatch, add a
machine-readable diagnostic protocol, create a global registry or a corpus-wide reference linter, rename checks
outside the pre-commit hook, or repair unrelated validator behavior. Archived planning artifacts, historical commit
messages, and other WUs' planning documents retain their recorded vocabulary.

## Coordination and readiness

Slug-resolved status on 2026-10-03 shows `cli-test-hardening` shipped and `quality-gate-hooks` unstarted in the
planned backlog. `draft-quality-gate-hooks.md` adds gate dispatch and excludes rewriting existing structural checks;
it shares hook files but supplies no prerequisite for this migration. `cohort-architecture-remediation.md` records
independent members without shared sequencing. No dependency is added.

The syntax, identity rules, one-time migration, and position-independent test targeting were agreed during planning.
The concrete name map and boundary cases above complete that direction for review. No further design uncertainty is
identified; the draft can proceed to spec creation after the capture review. Keep `P2`: the wrong live references
remain an active inconsistency, though this work changes reference identity rather than runtime hook correctness.

---

[pre-commit]: https://pre-commit.com/#creating-new-hooks
[eslint-rules]: https://eslint.org/docs/latest/use/configure/rules
[eslint-plugins]: https://eslint.org/docs/latest/extend/plugins
[shellcheck-codes]: https://www.shellcheck.net/wiki/index.html

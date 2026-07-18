# Coupling blast-radius audit notes

## Corpus boundary

The authoritative corpus is the tracked package tree selected by:

```text
git ls-files packages/arc-framework
```

At baseline commit `449d764d3`, that is 1,148 UTF-8 files. No tracked file requires a binary exclusion.

### Package families

| Family | Files |
| --- | ---: |
| `src/` | 481 |
| `__tests__/` | 499 |
| `arc/` | 156 |
| `templates/` | 3 |
| Package-local configuration and metadata | 9 |

The package-local remainder is `package.json`, `init-recipe.json`, `changelog`, `.gitignore`, `eslint.config.js`,
`tsup.config.ts`, `vitest.config.ts`, `tsconfig.json`, and `tsconfig.test.json`. The tracked extension distribution is
980 TypeScript, 140 Markdown, 7 JSON, 6 MJS, 5 shell, 4 extensionless hooks/templates, 2 `.gitkeep`, and one each
of YAML, TOML, JavaScript, and `.gitignore`.

The code family is 263 `src/lib/**`, 129 `src/scripts/**`, 49 `src/commands/**`, 34 `src/handlers/**`, five
`src/prompts/**`, and `src/cli.ts`. Tests are 388 unit, 70 integration, 29 end-to-end, 11 helpers, and one fixture.
Shipped ARC content is 108 `arc/system/**`, 43 `arc/reference/**`, two `arc/backlog/**`, and one each under
`arc/completed/**`, `arc/user/**`, and the ARC root.

Generated output, dependencies, and the installed `.arc/` mirror are excluded from this primary root because
tracked-file discovery does not select them. Hidden tracked package files, including `arc/system/.internal/**`, are
included without an extension filter.

### Self-hosting package/project delta

Every tracked `packages/arc-framework/arc/**` path maps to `.arc/**` by stripping `.template` immediately before
the final extension. Of 156 package ARC files, 140 mapped live files are byte-identical, 15 mapped live files differ,
and the one absent output is the expected external-PM-only workflow. The exact additional live-copy scan set is:

- `.arc/backlog/ATOMIC-INBOX.md`
- `.arc/backlog/ROADMAP.md`
- `.arc/reference/PROJECT-PRD.md`
- `.arc/reference/QUICK-REFERENCE.md`
- `.arc/reference/TECHNICAL-OVERVIEW.md`
- `.arc/reference/briefs/AGENT-BRIEF.PROJECT.md`
- `.arc/reference/strategies/STRATEGY-INDEX.md`
- `.arc/system/arc-config.yml`
- `.arc/system/extensions/post-pr-open.md`
- `.arc/system/extensions/pre-merge.md`
- `.arc/system/extensions/pre-pr-open.md`
- `.arc/system/methods/testing-standards.md`
- `.arc/system/rules/DEV-RULES.PROJECT.md`
- `.arc/system/workflows/arc/initial-setup/02_define-project.md`
- `.arc/system/workflows/arc/session-lifecycle/session-init.md`

`packages/arc-framework/arc/system/workflows/arc/initial-setup/03_configure-external-integration.md` has no live
counterpart because the current project uses `pm.mode: arc-in-git`; it remains covered by the authoritative package
root and is not a delta omission.

### Repo-root self-hosting delta

The exact 28-file repo-root delta is all 11 tracked `.github/**` files, all three tracked `.husky/**` hooks, all four
tracked `scripts/**` files, plus these root package, configuration, and harness files:

- `.coderabbit.yaml`
- `.editorconfig`
- `.gitattributes`
- `.gitignore`
- `.markdownlint-cli2.jsonc`
- `AGENTS.md`
- `CLAUDE.md`
- `mkdocs.yml`
- `package-lock.json`
- `package.json`

All 28 files are valid UTF-8. Root `README.md`, `CONTRIBUTING.md`, and `LICENSE` are excluded: they are public
project prose/legal material, not self-hosting tooling or harness configuration, and package-side shipped prose is
already the authoritative documentation corpus. Untracked/ignored `.husky/_/**` scaffolding is excluded by the
tracked-file boundary.

### Recipe, classifier, and installed-manifest diagnostics

These surfaces are reconciliation evidence only; none narrows the corpus:

- The package ARC tree has 156 tracked files. The current recipe recognizes 122 paths across all conditions and
  resolves 120 for this project's configuration. Thirty-four tracked package ARC files are absent from the recipe:
  three strategies, seven templates, two internal scripts, four skills, eight methods, and ten workflows.
- The installed manifest records 102 outputs. Twenty-three currently resolved recipe outputs are absent, spanning
  the scaffolded atomic inbox, contributor/template content, hooks and harness recovery files, four extensions, one
  skill, and four workflows.
- Five installed-manifest outputs are outside the current resolved recipe: retired `active/WORK-STATUS.md` and
  feature/technical backlog files, the team-only coordination strategy, and `deactivate-work-unit.md` (tracked but
  omitted from the recipe).
- Every manifest entry that still maps to a tracked package ARC file agrees with the live `classifyFile()` result;
  there are no classification mismatches.

These discrepancies are diagnostics for later installer/reconciliation owners. The coupling audit scans the live
tracked package and explicit self-hosting delta even when the recipe or installed manifest omits a path.

## Artifact homes and rerun contract

The audit is project-internal repository tooling, not a product CLI surface:

- Pure contract, classification, scan, and projection logic lives under
  `packages/arc-framework/src/lib/coupling-audit/`.
- The executable repository-audit entry point is
  `packages/arc-framework/src/scripts/audit-coupling-blast-radius.ts`, exposed from the root package as
  `npm run audit:coupling`.
- Checked-in machine inputs and results live under
  `packages/arc-framework/audits/coupling-blast-radius/`: `manifest.json`, `scan-result.json`, and
  `routing-ledger.json`. This stable package-local directory survives WU archival and travels with the audit code.
- The human projection is `report-coupling-blast-radius-audit.md` beside the WU's other movable artifacts. Its
  slug-matched companion name makes lifecycle relocation a pure move into the completed WU directory.

The executable accepts manifest, result, ledger, and report paths explicitly. The package-local files are command
defaults for normal repository reruns; the report path has no active-directory default and must always be supplied,
so archiving the WU cannot redirect a later run into a stale `.arc/active/**` location. Scan mode writes canonical
JSON to the requested result path (or stdout when requested); report mode reads the canonical result and ledger and
writes the explicitly requested Markdown projection.

## Machine-contract decisions

- Manifest, scan-result, and routing-ledger formats start at integer version `1` and parse from `unknown` through
  strict boundary validators. Closed enums cover surface kind, corpus locus, coupling idiom, volatility, predicates,
  and quadrant verdicts; malformed paths report their exact artifact field.
- Name-keyed classes require source citations. Every coupling idiom requires catch-all coverage, regexes may not
  match the empty string, and exact/bulk dispositions bind to lowercase SHA-256 evidence/member-set digests.
- A scan result retains classified, dismissed, and unresolved candidates separately. Residue is therefore valid
  scan output rather than a scan failure; unresolved volatility is the distinct state that blocks report projection.
- The routing ledger accepts only lexicographically ordered unique class IDs and binds every packet to the canonical
  scan-result digest. Packet state is closed to `captured-awaiting-housekeep` for this audit.
- Canonical JSON reuses the repository trust-core serializer, repository paths reuse the shared forward-slash helper,
  artifact-specific collection ordering runs before serialization, and persisted output adds one trailing newline.
  Exit `2` means malformed input, `3` stale bulk membership, and `4` scan/I/O failure; successful residue-bearing
  output remains exit `0`.

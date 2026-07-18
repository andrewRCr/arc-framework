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

The executable accepts manifest and result paths explicitly; the later report mode likewise receives ledger and
report paths explicitly. The package-local files are the conventional checked-in paths, not implicit command
defaults. Requiring the report path means archiving the WU cannot redirect a later run into a stale `.arc/active/**`
location. Scan mode writes canonical JSON to the requested result path (or stdout when requested); report mode reads
the canonical result and ledger and writes the explicitly requested Markdown projection.

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

## Pattern derivation

The name layer was derived from the storage, knowledge, and procedure target-shape records named by Task 2.1, then
augmented by a recorded tracked-text query over planned/provisional drafts and project strategies for `→`, `rename`,
`renamed`, `relocat`, `becomes`, and `supersed`. The broad query produced 808 candidate lines; focused inspection
confirmed live rename movers for `ROADMAP.md`, the personal/project state-document names, `team.mode`, `pm.mode`, the
`strategy-` family, and domain-rule naming. `npx arc status --project` plus slug probes verified every manifest
citation's mover is planned/provisional and both hard consumers remain blocked on this audit.

The populated v1 manifest contains 30 name-keyed classes, one standalone idiom class, and seven catch-all vectors.
Current shipped spellings are the scan patterns; target spellings appear only through source/mover citations. Alias
grouping is name-keyed (`feat|fix|chore|plan` is one typed-branch family; `loadSet|load-set` is one load-set family),
while independently moving state-document names stay separate.

Behavioral fixture tokens for Task 3.2.c are:

| Idiom | Unknown-name fixture |
| --- | --- |
| `path-literal` | `mystery/state-ledger.json` |
| `directory-state` | `readdir("mystery-state")` |
| `git-tracked-path` | `git log mystery/state-ledger.json` |
| `filename-prefix` | `name.startsWith("mystery-")` |
| `branch-pattern` | `mystery/{slug}` |
| `config-key` | `mystery.storage_root` |
| `doc-name` | `MYSTERY-STATE.md` |

Catch-all precision is deliberately deferred to recorded residue dispositions. Presence validation already requires
all seven mechanisms, source/mover-complete name classes, non-empty patterns, and non-empty-string regexes.

## Initial enumeration and code calibration

The settled pre-disposition scan used commit `a9b0ec4b5`, manifest version 1, and this command:

```text
npm run audit:coupling -- --manifest packages/arc-framework/audits/coupling-blast-radius/manifest.json \
  --output /tmp/coupling-audit-phase4-initial.json
```

Its manifest digest is `60c97f75400807ead7b5fc8ebccb733bd876234832ac3c80905fd1c5e3141f5d`; the canonical
output SHA-256 is `f15bd09164cb8fa6f8db55b9e78f3460a18d62dfe43845bf7e9073e1c3ed6148`. The corpus contains
1,207 files: 1,164 package files, 15 exact installed-delta files, and 28 exact repo-root delta files. The files digest
is `0d849b38d42555fb66dd001fe461bf12363985ac6a15c533cef92fbe62aad8b0`. Before dispositions, the scan
contained 7,699 classified and 90,285 unresolved candidates across 32 classes.

Code fan-out spans 0–107 files per class, with median 7 and upper quartile 13. The per-class code sample cap is 5:
for each class, select the first canonical hit for each distinct idiom, then fill remaining slots in canonical
path/location order. Five covers the largest four-idiom class plus one independent path check. The rule selected 146
hits. Review showed that the artifact-prefix literals conflated lifecycle/status tokens; their patterns now require
artifact-shaped continuations, and catch-span attribution now assigns only idioms mechanically evidenced at the
name occurrence. The same review added the omitted live `reference/briefs` → `reference/agent-briefs` mover as
`agent-briefs-root`. No remediation was performed.

## Residue review bound

The refined pre-disposition result has 90,285 unresolved candidates across 32 nonempty capture-vector ×
surface-kind strata. The global item cap is 64: sort strata by vector ID then surface kind, allocate one canonical
candidate to each stratum, and continue in the same round-robin order for a second candidate per stratum. This is
the smallest even-depth review that tests both the first member and within-stratum recurrence everywhere.

Candidates beyond the cap may be grouped only by the closed `vectorId equals <ID>` predicate. The allowed bulk
reasons are correspondingly closed:

- path/branch token: generic path-shaped syntax with no unmatched direction-owned name;
- dotted token: generic property, filename, or doc syntax with no unmatched direction-owned configuration name;
- Markdown doc token: a document name outside the direction-derived name classes;
- directory-state call: a generic filesystem operation with no mechanically linked volatile name span;
- Git-path call: a generic Git mention/invocation with no mechanically linked tracked-planning span;
- prefix operation: a generic string operation with no mechanically linked governed filename prefix.

Every group stores the digest of its exact post-item-review member set. Escalate instead of bulk-dismissing when a
sample exposes a live mover omitted from the manifest, when one candidate does not share its vector's allowed
reason, when a new nonempty stratum appears, or when any recorded member set changes or expands on rerun.

## Residue closure

All 64 item-level candidates were reviewed and recorded as exact digest dispositions. The review found no additional
direction-owned name after `agent-briefs-root`; stable names and generic syntactic captures received the applicable
closed reason above. The seven vector groups bind the remaining 90,227 candidates: 54,620 dotted tokens, 16,724
branch-shaped tokens, 14,951 path-shaped tokens, 2,151 document names, 932 prefix operations, 618 Git calls, and 231
directory-state calls.

The settled manifest digest is `b54251a257f6bc805f7a7231ad223ff3b67ac1811238b81aae93d4694b65e4fb`.
Its canonical result contains 7,699 classified candidates, 90,291 preserved dismissals, and zero unresolved residue;
the result SHA-256 is `ac88163beb6c8ddcbd2a05718a07c8c48732a45965131ad6d2d6bca5b303edc6`.
Generated result and ledger paths are explicit manifest exclusions, preventing checked-in outputs from recursively
entering the authoritative package corpus.

## Complete-corpus reproducibility

At clean commit `e689e892a`, the settled manifest digest remained
`b54251a257f6bc805f7a7231ad223ff3b67ac1811238b81aae93d4694b65e4fb`. Two consecutive authoritative
runs wrote `/tmp/coupling-audit-repro-{a,b}.json`; `cmp` found them byte-identical and both SHA-256 values were
`ac88163beb6c8ddcbd2a05718a07c8c48732a45965131ad6d2d6bca5b303edc6`. Each run reported 1,207 files,
32 classes, and zero unresolved residue. `git status --porcelain` was empty before and after both runs. All counts,
file lists, and disposition totals in these notes are projections from that canonical result.

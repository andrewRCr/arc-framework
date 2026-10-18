# Notes: projected-markdown-checks

## Contents

- [Suppliers](#suppliers)
- [Neighbors](#neighbors)
- [Framework synchronization](#framework-synchronization)
- [Record-check grounding](#record-check-grounding)
- [Check-runner grounding](#check-runner-grounding)
- [Ceremony coverage](#ceremony-coverage)
- [Fixer grounding](#fixer-grounding)
- [Verification evidence](#verification-evidence)
- [Private standard review](#private-standard-review)

## Suppliers

- **The selection and write-back** — `storage-projection`, whose specification sits on `plan/storage-projection`
  (`spec-storage-projection.md`). The selection's shape in § 1.4 of `spec-projected-markdown-checks.md`, `--changed`
  and its mark rules included, was agreed with that work unit's session on 2026-10-17. Its forward amendment fixes the
  command's name and lands in its pre-activation verification, once `seam-locus` and `storage-ref-backend` ship; the
  `selection` mode takes that name. Its § 7.2 sets the write check's inputs at write-back, and its base stamp and
  notice lines sit in the projected file, never in the stored content.
- **The ref backend** — `storage-ref-backend`, whose specification sits on `feat/storage-ref-backend`
  (`spec-storage-ref-backend.md`). Its write and batch paths refuse a breaking write with `record-malformed`; its merge
  after fetch reports a `rule-broken` notice and never gates ("Checks report; they never gate a merge"). It also keys a
  companion whose file is not `<key>-<slug>.md` by its path.
- **The flip** — `storage-cutover` rewrites the ceremony steps whose commits carried only state, the relocatability
  rule, and the flip's notice. The movable set, the `arc check increment` requests its rewrite keeps, and the notice
  were handed to it at draft close (`USER-INBOX § Work Unit`).

## Neighbors

- `knowledge-lint` (planned) plans to absorb `lint:arc:links` and `validate-links.sh` into its cross-reference and
  relocatability families; ARC's link rules here are the minimal form it absorbs.
- `adopter-markdown-contract` (provisional) defines what ARC requires of a project's Markdown linter and keeps the text
  ARC writes clean under common defaults.
- `operational-state-docs` owns record conformance.
- The `USER-INBOX § Errand` capture "Merge aligned Markdown tables without clashing on column padding" removes the
  table-merge clash the specification accepts for on-demand fixing.

## Framework synchronization

`prepareFrameworkProjection` calls `validateExplicitMarkdownPaths`, which maps `validateMarkdownPath` before reading
content (`lib/markdown/format-plan.ts`, `selection.ts`, and `authority.ts`). The validator requires a `.md` suffix, so
`render:framework` accepts Markdown sources and templates, not `validate-links.sh` or the extensionless `pre-commit`.
Both non-Markdown counterparts are Framework-classified in the installed manifest. Task 2.1 in
`tasks-projected-markdown-checks.md` applies the matching targeted edits to source and installed copies, preserves
executable modes, and verifies agreement; Task 2.3 reserves rendering for Markdown sources/templates.

`integration/validate-links.test.ts` executes the installed `.arc/` script, while
`integration/scripts/validate-links.test.ts` executes the package source. Synchronization belongs with Task 2.1's
implementation so both test homes can pass. `integration/framework-sync.test.ts` compares Framework counterparts
with rendered package sources; no broader update or renderer change is needed.

## Record-check grounding

`WriteCheckInput` carries content and parsed fields independently (`lib/store/write-check.ts`), so a malformed
`prior.fields` is no reason to drop `prior.content`. `createKindRegistry` rejects duplicate registrations and retains
parser/check/anchor slots from its one registration (`lib/store/registry.ts`); compose once at
`PRODUCTION_REGISTRATIONS`, not once per backend or per kind module. `checkPreparedWrites` is the reference backend's
write/batch check path (`__tests__/helpers/store/write-checks.ts`).

`companionArtifactName` maps conventional companion keys, including `spec-prd` and `spec-rfc`, to Markdown filenames
(`lib/store/companion-name.ts`). A path-keyed companion instead declares its extension in its key. Personal document
keys are managed paths below the identity root (`personalFileReference`, `lib/store/in-repo/personal-paths.ts`); use
that semantic key without importing its checkout-bound lookup helpers into the pure check. Fixed known personal and
project-inbox paths come from `resolveArcPath` (`lib/layout/projection.ts`).

`audit-links.ts`'s `parse` and `LINK_NODE_TYPES` supply the parser/node precedent, not a store dependency on a script.
The record check scans full-reference source spans, not decoded text values: escaping and source positions must survive.
No store check resolves targets through the filesystem, checks anchors, or gates a fetch merge.

## Check-runner grounding

`GitExecInput` currently accepts only `cwd` and `objectAccess` (`lib/git/exec.ts`); it cannot be handed alternate-index
options by assumption. `RawGitExec` already supports stdin bytes, `indexFile`, and `removeEnvironment`, implemented
by `createExecaRawGitExec` (`lib/git/process-executor.ts`). Reuse that seam for the path-list matcher instead of mutating
the agent process environment or widening the generic executor solely for one caller. Compute the empty-blob identity
for the repository's object format without writing it; NUL-frame pathnames and release temporary indexes on failures.

`resolveCheckSelection` skips selection declarations before building the ordinary checks' own-input observations and
shared coverage (`lib/checks/selection.ts`), so selection inputs never change ordinary checks' widening. Its
`namedPathChange` accepts directory selectors; `runProjectedCheck` keeps those descendant semantics while intersecting
named paths with the provider's list.

`executeResolvedRequest` awaits `runRequestedCheck` without isolating a rejected pre-execution read
(`handlers/check/run.ts`), and `runDeclaredCliRequest` converts an escaping rejection into a request-level error
(`handlers/check/run-cli.ts`). The new matcher's success/unavailable result stays inside per-check reporting: matching
failure is not an empty selection, does not discard completed results, and does not stop ordinary checks from running.
Tasks 3.2–3.4 in `tasks-projected-markdown-checks.md` define this boundary, and its Task 3.6 proves serial execution and
recovery at the command boundary.

`runDeclaredRequest` is the injectable orchestration entry; the public handlers construct dependencies inside private
`runDeclaredCliRequest` and accept a narrow selection-reader override (`handlers/check/run.ts`, `run-cli.ts`). This
follows the handler override pattern in `handleSchemaInstall` (`handlers/schema.ts`). Public-handler tests retain real
Git and child processes; subprocess CLI tests use the empty production adapter until its supplier connects, without
a test-only production environment flag. Request coordinate resolution remains shared; selection-specific tree
evidence is skipped.

`handleSchemaInstall` invokes `writeEditorDocuments` to regenerate all registered editor documents with
`npx arc schema install --json` (`handlers/schema.ts`, `lib/schema-command/editor-documents.ts`). The outputs under
`.arc/system/.internal/schemas/` are ignored checkout artifacts, not a package-source schema copy. Build source changes
before regenerating and inspect both runtime defaults and emitted input-schema behavior.

The production `readProjectedSelection` empty result is the specified pre-connection contract, not temporary test
scaffolding. No phase builds a substitute index, marks changes, or guesses the supplier command's final name.

## Ceremony coverage

Workflow paths below are relative to package `arc/system/workflows/arc/`. Render their installed counterparts with
`npm run render:framework -- <package-source paths...>`; `render-framework.ts` delegates to `markdown-write-command`
and handles template counterparts. Requests are single `arc check increment` instructions in shipped-content register.

| Row | Workflow and boundary                                                                                        | Task |
| --- | ------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | `draft-design.md`: readiness approval; capture after changed post-settle text                                | 4.1  |
| 2   | `create-spec.md`: Gate 1; final capture after notes migration and post-Gate-2 text                           | 4.1  |
| 3   | `generate-tasks.template.md`: after the settled reread, immediately before final pre-save approval           | 4.2  |
| 4   | `supplemental/amend-design.md`: grounded capture; shared task/review caller request                          | 4.2  |
| 5   | `work-unit-lifecycle/decompose-work-unit.md`: distribution approval and finish-release owner reconciliation  | 4.3  |
| 6   | `work-unit-lifecycle/planning/init-work-unit.md`: in-place and resumed init commits                          | 4.3  |
| 7   | `supplemental/drain-inbox.md`: grooming routing commit or each direct base commit                            | 4.3  |
| 8   | `session-lifecycle/session-handoff.template.md`: after staged-meta lint, before commit                       | 4.4  |
| 9   | `work-unit-lifecycle/activate-work-unit.md`: Step 3 commit carrying a fold's authored spec/task text         | 4.4  |
| 10  | `work-unit-lifecycle/integrate-work-unit.md`: preserve Step 7 completion-content increment                   | 4.5  |
| 11  | `work-unit-lifecycle/integrate-work-unit.md`: eligible merged-PR missing-notes repair; completed-only exempt | 4.5  |
| 12  | `work-unit-lifecycle/integrate-work-unit.md`: eligible composition correction; completed-only exempt         | 4.5  |
| 13  | `work-unit-lifecycle/integrate-work-unit.md`: Step 10 pending reconcile, after correction and before retry   | 4.5  |
| 14  | `work-unit-lifecycle/prepare-work-unit.md`: advisory correction before retrying publish                      | 4.6  |
| 15  | `work-unit-lifecycle/resume-work-unit.md`: Step 5 pending reconcile correction before retry                  | 4.6  |
| 16  | `work-unit-lifecycle/deactivate-work-unit.md`: Case C commit over reversed fields                            | 4.6  |
| 17  | `work-unit-lifecycle/prepare-work-unit.md`: authored-state review fix, ordinary correction or amendment      | 4.6  |
| 18  | `work-unit-lifecycle/integrate-work-unit.md`: authored-state review fix, ordinary correction or amendment    | 4.5  |

### Ceremony verification

Each row's scenario is the authored-text branch and its existing stop/commit/retry ordering, including a second write
after approval where the row names one. Read the source and rendered containing step and record its request locus;
the invocation's executable changed/empty/failed/unavailable behavior is proved at the public check handler in Phase 3
and with the real project recipes in Phase 5. Text-presence tests alone do not demonstrate agent execution. This change
adds no workflow interpreter, eval framework, or schema for the inventory.

For task generation, `generate-tasks.template.md` places the descriptor checklist before adversarial folds, delivery
rendering, and the final coherence reread. The request belongs after that reread and immediately before the final
interlock; an earlier report cannot cover a later edit. Preserve the existing descriptor lint rather than treating its
earlier textual position as the new request's required insertion point.

For integration, `integrate-work-unit.md`'s Step 8 archives the meta under `with-integration` before a later composition
redirect can correct it; the merged-PR guard also recognizes shipped metadata under completed placement. Under `manual`,
the meta stays active until the separate archive. Both paths obey the specification's completed-only exemption:
verify that a covered edited file reaches feedback, or record the exemption, rather than counting any increment
invocation as proof that it checked an archived edit. Selection and script exclusions remain unchanged.

For handoff, distinguish failure in unfinished work (capture remaining work, no additional stop) from failure in its
own meta edit (correct before commit); retain its later explicit SESSION-NOTES lint.

`review-response.md`'s `ready-to-fix` leaf delegates checks to its caller. The package `prepare-work-unit.md` and
`integrate-work-unit.md` currently request gate checks there; `amend-design.md`'s Entry gate steps 1–2 can return an
ordinary fix without a spec-changing amendment. Rows 17–18 therefore place feedback in those callers whenever a fix
includes authored state text the checks read, preserving every existing gate request. An ordinary active notes-only
correction and a spec-changing amendment each use that same request before commit. Row 4's review-site amendment
instruction points to the caller's request rather than adding a second one; task-site amendments retain the existing
task increment. Task 4.7 in `tasks-projected-markdown-checks.md` walks both kinds at each review site, using the public
handler fixtures to prove feedback over the edited projected file. `run-errand` already requests increment feedback,
and delivery corrections close through task work; those paths keep their existing requests.

The exclusions are part of the same coverage read: rendered-option-only writes, including free-text options; manually
selected closed-vocabulary Class; moves/deletions; rendered ROADMAP; spawned/graduate start scaffolds; completed-only
cohort Closeout; ordinary rendered transitions; applied reconcile; integration records, boundaries, attestations, and
base merge. Existing `run-errand` and `process-task-loop` increments remain sufficient for their own paths.

### Ceremony inventory result

Read each containing source step and its rendered counterpart. Row identities and package paths are in Ceremony
coverage above; the corresponding `.arc/` path drops the package prefix and template suffix. Framework-sync covers
the recipe-derived counterparts, including the two A2 installs. These are placement findings, not an agent eval.

| Row | Source locus                         | Placement result in source and rendered step                                      |
| --- | ------------------------------------ | --------------------------------------------------------------------------------- |
| 1   | Capture the draft, lines 243 and 284 | Before readiness; repeat after a changed final reread; low exempt.                |
| 2   | Finalize, lines 297 and 344          | Before Gate 1; repeat after notes migration or later text; Gate 2 retained.       |
| 3   | Finalize, lines 595 and 607          | After final coherence reread; repeat for later text before commit.                |
| 4   | Capture commit, lines 277–297        | Grounding precedes capture; task/review callers supply their one request.         |
| 5   | Steps 5 and 7, lines 132 and 302     | Before distribution approval in both modes; after finish reconciliation.          |
| 6   | Step 4, line 223                     | After in-place/resumed authored reconciliation; spawned scaffolds skip Step 4.    |
| 7   | Route, lines 212 and 264             | Each grooming-lane commit and each partial-protection direct commit.              |
| 8   | Active-WU format, line 230           | After staged-meta lint; fix own edit, note unfinished failures; later notes lint. |
| 9   | Step 3, line 105                     | Before activation commit only when a fold edits spec/task prose.                  |
| 10  | Step 7, line 519                     | Existing completion-content request retained before commit.                       |
| 11  | Merged-PR guard, line 102            | Before eligible repair commit; completed-only repairs exempt.                     |
| 12  | Step 10 redirect, line 748           | Before eligible correction commit; affected gates/routing still follow.           |
| 13  | Step 10 pending, line 576            | After checked authored correction, before retry; completed-only exempt.           |
| 14  | Schedule publication, line 253       | After hand correction, before publish retry; retain-advisories arm intact.        |
| 15  | Step 5 pending, line 138             | After hand correction, before retry; clean/applied and retain arms unchanged.     |
| 16  | Case C, line 220                     | Before committing reversed fields for the PR; Case A transitions unchanged.       |
| 17  | Review iteration, line 219           | One caller request before either ordinary or amendment fix; gates retained.       |
| 18  | Review iteration, line 359           | One caller request before either fix kind; commit/push/merge gates retained.      |

The public-handler disposable probe used the production check handlers with the existing declared-check repository
fixture, real Git, and a real file-reading child process. Preparation and integration each exercised an active
notes-only correction and a spec-plus-notes amendment: bad live text returned failed feedback, and the corrected
same paths passed on retry without recordable evidence. A task-list edit after an earlier pass failed on the next
request and passed after correction. Completed-only input was not selected. Existing handler integration scenarios
also cover empty and unavailable selections and successful retry; Phase 5 exercises the actual project recipes.

Read integration Step 8 beside the guard and redirect: `with-integration` archives before later corrections, while
`manual` leaves the meta active. The edited-file condition and completed-only exemption apply in both; no check or
supplier exclusion was widened. Handoff retains staged-meta lint and the later explicit SESSION-NOTES lint, and its
own-edit versus unfinished-work failure handling remains distinct.

The branch diff adds no requests to exempt-only workflow files. Within the edited workflows, closed-vocabulary
Class, rendered free-text options, moves/deletions, ROADMAP output, spawned/graduate scaffolds, ordinary transitions,
applied reconcile, decomposition base advancement, integration records/boundaries/attestations, and base merge keep
their original paths. Completed-only cohort Closeout remains outside the corpus. `run-errand` still checks every
pass and approved fix; the task-loop template still selects increment or segment at its existing boundary.

### Repository declaration admission

The twenty-one-path matrix in `integration/markdown-selection-admission.test.ts` reads the actual project YAML,
parses `CheckDeclarationSchema`, uses `matchPathList`, and compares each admitted set with the script's real admission
predicate. It includes every exclusion class, dot directories, nested personal basenames, case variants, and `.venv`
as a filename. The distinct markdownlint and underwrap policies remain intentional: markdownlint admits a
`.venv-probe.md` filename but excludes nested personal WORKING-MEMORY/USER-INBOX basenames; underwrap does the inverse.

A real Git probe found `ls-files` with positive `.arc/**/*.md` and exclusions `**/*.template.md` / `**/template-*.md`
returned those templates on Git 2.55.0. Qualifying the exclusions as `.arc/**/*.template.md` and
`.arc/**/template-*.md` excludes them and preserves the intended audit domain. The declaration uses those qualified
forms; the shared matcher retains native Git semantics. Increment/segment feedback and gate exclusion remain covered
by the existing mode tests; this matrix also checks the actual project entries' ungated defaults and gate exclusion.

## Fixer grounding

`validateExplicitMarkdownPaths` accepts `allowIgnoredPaths`, a named set bypassing Git membership while retaining
physical and Git-directory checks (`lib/markdown/selection.ts`). `runExplicitMarkdownlint` applies the shared
`selectMarkdownlintPaths` Git-pathspec matcher before that validation (`lib/markdown/worktree-lint.ts`), keeping its
admission aligned with the declaration without loosening the canonical selection. `isMarkdownPathExcluded` rejects
any `.venv`-prefixed segment, filename included (`lib/markdown/authority.ts`); the underwrap declaration excludes that
class alongside the existing directory patterns.

`enumerateTrackedMarkdownPaths` selects the index plus nonignored untracked worktree files in worktree mode;
`resolveMarkdownFixCorpus` filters absent entries and acquires the full tracked-plus-projected corpus before fixing.
`prepareExplicitMarkdownFormat` supplies the named ignored-path mutation precedent (`lib/markdown/format-plan.ts`).
`prepareMarkdownFix` validates membership and availability before mutation, reports listed files whose write authority
fails as skips, and calls `loadWorktreeMarkdownConfigurations` (`lib/markdown/configuration.ts`). Real process fixtures
prove that literal filenames survive markdownlint's own selection settings.

`enumerateTrackedMarkdownPaths` throws `markdown.empty-selection` when its Git contribution has no Markdown
(`lib/markdown/selection.ts`). `resolveMarkdownFixCorpus` treats only that result as an empty contribution; other Git
read failures remain failures, and a projected-only corpus stays valid. `runMarkdownFix` invokes no tool for an empty
union.

`checkArgumentBudget` and `batchCheckPaths` bound literal command lines, including Windows shim escaping
(`lib/checks/batching.ts`). A read-only enumeration during task generation returned 783 Git-selected Markdown paths,
56,624 bytes of literal `:path` operands, and nine batches under that helper's Windows budget. `runMarkdownFix` batches
after complete corpus and explicit-membership validation, write-authority checks, and configuration validation,
preserving each admitted path exactly once and retaining nonzero batch results. Tasks 5.4 and 5.6 in
`tasks-projected-markdown-checks.md` cover large corpora, projected-only and empty corpora, and batch failure reporting.

## Verification evidence

The complete work-unit implementation was walked against `spec-projected-markdown-checks.md` and all 22 immutable
criteria in `tasks-projected-markdown-checks.md`. There is no Delivery Plan. The production empty selection adapter is
the agreed pre-connection behavior; live supplier integration belongs to whichever member lands second.

### Subject and attention scope

The walk's base is `94d0ee7e187026a9bddc8a695f50a5e1b11af9d1`; the source head is
`5c97a470ce31458b8f4ce36048b62cc4f10442d8`. The resolver included the local notes cleanup as a worktree snapshot:
`c596fb99ad9324c6321c7527a1bdb3c783374705`, tree `3735a2900901552d32c1bd77b2741f773d63a67b`,
target `sha256:4d11bd3aff37ce4018c67174e290b78958f754f192c6d2f766b4d5d51fd33e5d`.
It returned `below-threshold / continue-review`: 4,880 lines and 100 files, against thresholds of 5,000 and 150.
The disposition was a whole-target criteria walk and fresh whole-target reviewer. Subsequent report, checkbox and
Candidate projection edits are closeout evidence rather than new implementation.

Closeout staging returned `consider-chunks / select-review-scope` at 5,060 lines and 100 files for snapshot
`dcf40fda5ee67d3612956584114a4d4126956814`, tree `e20c4d1fc2cde00dae0bf00cc315d0af081bfbdf`,
target `sha256:ddbb5a1ddafe02a4f4d0da6fd9b6684835902a227c96cdd7af93cf5c12a1beb5`.
The verification disposition is an explicit whole-target route: the implementation is unchanged from the fresh
4,880-line pass, while the added report and markers carry its evidence. The primary checked report coherence and
unchanged criterion identities; Candidate preparation retains its own review-scope selection.

### Adversarial findings and responses

These were advisory criteria passes, separate from Candidate frontline/standard lanes. Each used fresh context,
the full spec and unmarked task list, and the complete implementation target. Author verification conclusions were
withheld. Each finding was independently checked against source before complete-set approval and implementation.

| Pass   | Verified finding and action                                                                                     | Response and continuation                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1 of 2 | Major: Git drive-form roots disagreed with shell physical roots; FIX in both validators.                        | Approved; `4491d4884` canonicalizes with `pwd -P`; pass 2 authorized.                            |
| 2 of 2 | Major: private index population inherited split-index cleanup; FIX in the shared matcher.                       | Approved; `7e44c6afb` disables split index; pass 3 explicitly authorized beyond the default cap. |
| 3 of 3 | Major: unquoted staged Markdown filenames bypassed hook link checks; FIX in both hooks.                         | Approved; `5c6092ec8` preserves NUL-framed literal operands; pass 4 explicitly authorized.       |
| 4 of 4 | Major: bracketed full-reference text was missed and escaped labels were truncated; FIX the source-span scanner. | Approved; `ce6e8dd05` scans balanced/escaped brackets and complete labels.                       |
| 4 of 4 | Major: hook source reads used worktree prose instead of the index; FIX both callers and validators.             | Approved; `5c97a470c` uses explicit staged reads; pass 5 explicitly authorized.                  |

Pass 1's root correction had three behavioral failures before repair; both validator suites then passed 35 tests.
Pass 2's aged shared-index cases failed under SHA-1 and SHA-256 before repair; the four matcher, selection, fixer and
recipe integration suites then passed 59 tests. Pass 3's eight full-hook cases failed before repair; both hook
copies and both validator suites then passed 43 tests, covering movable/ignored targets and successful correction.
These first three response increments passed their required checks and committed only the approved fixes.

The first three passes examined record registration/admission, selection/schema/request behavior, ceremony placement,
and fixer/recipe behavior without another finding in those regions. Pass 2 re-examined the root repair; pass 3 also
probed real index preservation under split indexes and case distinctions under `core.ignoreCase=true`.
Native Windows execution was not performed locally; the drive-form fixture exercises the Git/shell spelling seam.

Pass 4's reference correction had seven behavioral failures before repair; four parser, rule, admission and
registration suites then passed 69 tests. Its staged-source correction had six full-hook failures before repair;
two additional staged-read refusal cases failed under a narrow worktree-read reconstruction. The four hook,
validator and recipe integration suites then passed 52 tests. The fixes retained the existing text-node boundaries,
historical-count policy and selection recipe's default worktree reads, and needed no design amendment. Both response
increments passed their required checks and committed separately.

The default Heavy allowance ended at pass 2. Passes 3, 4 and 5 each had explicit continuation authorization;
cap exhaustion resolved no finding. Pass 4's remaining examined regions, including all eighteen ceremony rows,
rendered counterparts, schemas, recipes and fixer boundaries, produced no additional finding. Record admission
was exercised through the reference backend with production registrations, not through the in-repo backend that
performs no write check before the supplier lands.

Pass 5 of 5 returned no findings: stop reason `converged`, with the extended allowance exhausted. It independently
passed the complete 539-file tracked audit and disposable probes for nested/escaped full references, index/worktree
source disagreement with corrected retries, and aged split indexes with literal brackets, spaces, tabs and newlines.
Its remaining account covered criteria 1–20, including registration preservation, schemas and request recovery,
eighteen ceremony sites, recipe boundaries, and fixer acquisition/authority/batching. Criteria 21–22 remained for the
primary's live deadline and readiness evidence. No builds or broad suites ran in that read-only pass.

### Quality-gate evidence

The final `npx arc check gate merge --force --serial` ran on source head `5c97a470c`: 19 checks passed.
Both type checks, TypeScript/shell/Markdown lint, package/framework contracts, build, unit and integration checks
passed. Unit: 990 files and 15,998 tests passed; integration: 358 files and 3,869 tests passed. The declared skipped
cases remain reported by their test tiers. The three CI-only checks — E2E, portability and macOS portability —
were not selected locally and retain their CI deadlines. The configured remote runner's results are gate results.

The first concurrent forced gate had unit and integration timeouts; the targeted unit retry passed 26 tests, and
subsequent serial forced gates passed. The final result above covers both last repairs. Increment checks and related
feedback also passed for the approved fix commits; no declaration, gate or runner setting was bypassed.

### Criteria report

```yaml
criteria-slice: Success Criteria
span:
  diff: 94d0ee7e187026a9bddc8a695f50a5e1b11af9d1..c596fb99ad9324c6321c7527a1bdb3c783374705
  reachability: 3735a2900901552d32c1bd77b2741f773d63a67b
  boundary-order-deviation: null
criteria:
  - locus: Success Criteria > 1
    criterion-digest: sha256:20e71b8f29cd9787626b2078348ae25a38b77577a4e682a0a7d78b6177bc365c
    evidence: "Production registrations compose checkRecordLinks; record-links.test.ts, record-link-admission.test.ts and reference checkPreparedWrites cover introduced-only write/batch refusal, locations, historical content and repaired retries. A disposable production-harness probe additionally exercised atomic refusal and corrected batch retry for all three links.* rules. Bracket-aware source scanning preserves complete escaped labels, locations and historical count keys; seven regression cases failed before repair and 69 parser, rule, production-admission and registration tests passed afterward."
    state: "[x]"
  - locus: Success Criteria > 2
    criterion-digest: sha256:c587d1eb8842542d378601debd1cca47f502d66a397f01525953d6a0c557da62
    evidence: "RECORD_LINK_KINDS derives projecting stored kinds with the queue exception; kind-registrations.test.ts checks coverage, unique registration, parser/anchor preservation and own-check ordering."
    state: "[x]"
  - locus: Success Criteria > 3
    criterion-digest: sha256:d1ed53ccb322007fa9eecf7dd259f4ba6df0feb91db2139a9cf6701397ae31f7
    evidence: "validate-links.sh and audit-links.ts normalize root/relative targets and refuse movable or ignored ARC targets; validate-links.test.ts and audit-links.test.ts exercise failures, tracked user README and corrected retry. The drive-root regression failed for all three outcomes before the approved fix and both validator suites then passed 35 tests. Full-hook pre-commit-markdown-links.test.ts covers both shipped copies with literal space/tab/glob filenames, movable/ignored target refusal and corrected retries; all eight cases failed before the approved caller fix and the three validator/hook suites then passed 43 tests. Both hooks use explicit staged-source reads; six full-hook stage/worktree counterexamples failed before repair. Two staged-read refusal cases failed under a narrow reconstruction, then four integration suites passed 52 tests including restaging retry and the real selection recipes."
    state: "[x]"
  - locus: Success Criteria > 4
    criterion-digest: sha256:3225d7604a59b7fa4bcea5db7638483e22e82f4191b82761ae6e86166c80c48f
    evidence: "ADR 021 and both define-project copies carry filename/path references; lint:arc:links audited the complete 539-file tracked corpus."
    state: "[x]"
  - locus: Success Criteria > 5
    criterion-digest: sha256:e226175a6301e7c00d3ae01769300133d6147f665c36fd9b178fd8ed27bc4c3a
    evidence: "CheckDeclarationSchema preserves ordinary defaults and gives selection false cache/widen defaults with field-specific restrictions; declaration tests and the regenerated editor-schema probe cover runtime/input-schema agreement."
    state: "[x]"
  - locus: Success Criteria > 6
    criterion-digest: sha256:f5a8061e6520c22b951e82eacb258f2cadd2057fc3d07c2187c3f6a171efdc48
    evidence: "selectRequestChecks, requestProjectedSelection and runProjectedCheck implement changed/full/named scopes with gate/hook exclusion; gates.test.ts and check-projected-selection.test.ts cover the request matrix."
    state: "[x]"
  - locus: Success Criteria > 7
    criterion-digest: sha256:23be2fd0a8273feb69ed29be33dae7d7b9aa9b2660ed383265180ee4bbcfa603
    evidence: "matchPathList uses the shared native Git pathspecs in a disposable NUL-framed index; check-matching.test.ts covers declared inputs, dot paths, case, literals, SHA-1/SHA-256 isolation and cleanup. The SHA-1/SHA-256 preservation matrix now covers split indexes with expired backing files; --no-split-index prevents shared-file creation/expiry while preserving real staging and configuration."
    state: "[x]"
  - locus: Success Criteria > 8
    criterion-digest: sha256:451bbc9c99015effb828f31439ca433588140ed868ac3e95f3e226bb0b79e8ef
    evidence: "runProjectedCheck bypasses Git evidence filtering and selectedCheckKey returns no reusable key for uncached selection checks; handler integration tests cover empty, failed, unavailable and recovered runs with scoped remedies."
    state: "[x]"
  - locus: Success Criteria > 9
    criterion-digest: sha256:8a2cfac3673e261c923961c3ab2a2c47181ea2af30f3becc1a2620818027149b
    evidence: "matchPathList failure returns per-check unavailable; serial public-handler integration preserves ordinary results, reports exit 2 and the original remedy, and succeeds after temporary-directory repair."
    state: "[x]"
  - locus: Success Criteria > 10
    criterion-digest: sha256:07d28f3cba510867df08a6af54f3e3ab4be68cedbbb8a774e1a8f36f22ecdb8b
    evidence: "draft-design and create-spec source/rendered steps place increment before readiness/Gate 1 and repeat after authored post-settle or notes-migration edits, retaining rendered-only skips."
    state: "[x]"
  - locus: Success Criteria > 11
    criterion-digest: sha256:2cde039dc30b39dc9f67f97245cac4c8f18c620aedc0312a827c9c48b6bd8ad6
    evidence: "generate-tasks checks after its final coherence reread and again for later prose; amend-design checks after grounding and reuses task/review caller requests."
    state: "[x]"
  - locus: Success Criteria > 12
    criterion-digest: sha256:33fc799e928d8cae858a15129ce2f3b8ae8bbd6a242db9b9e9a984d8e70905be
    evidence: "decompose, init and drain-inbox source/rendered steps request feedback before distribution/finish-release, in-place/resumed initialization, and each protected-grooming or partial-protection direct routing commit."
    state: "[x]"
  - locus: Success Criteria > 13
    criterion-digest: sha256:7782a0f4d9519d968b674883b2daf3d94a371ea02be00f69ad56aa2a3ad03f22
    evidence: "handoff checks after staged-meta lint, preserves later SESSION-NOTES lint and distinct failure handling; activate checks authored folds before commit and exempts rendered-only transitions."
    state: "[x]"
  - locus: Success Criteria > 14
    criterion-digest: sha256:88afc1cb44c085aa33357fca141eb30efe35132886484b6ec4b2a9592b292e88
    evidence: "integrate retains Step 7 feedback and adds caller feedback before authored review fixes, eligible repairs/composition corrections and pending-reconcile retries; completed-only exemptions and merge authority remain intact."
    state: "[x]"
  - locus: Success Criteria > 15
    criterion-digest: sha256:807ba4406cff8b6ce2e03b71d065b8af3467849802151545c75aba1ddf92b5c9
    evidence: "prepare, resume and deactivate request feedback at authored correction/retry boundaries; the eighteen-row ceremony inventory is coherent in installed/package copies and exclusions remain intact."
    state: "[x]"
  - locus: Success Criteria > 16
    criterion-digest: sha256:3832abf6f5c39f200f24f76a5b8f4c4ff10f6326ee2e90ff7b6ff58e4cbb5eb2
    evidence: "markdown-selection-recipes.test.ts invokes the real three declared commands over per-clone ignored files and asserts findings for every admitted changed path, with unrequested/excluded paths absent."
    state: "[x]"
  - locus: Success Criteria > 17
    criterion-digest: sha256:1f8ab512966146d384a2686899fe08d4e933751ba1040753b12fcbdd79ebb9b3
    evidence: "resolveMarkdownFixCorpus and prepareMarkdownFix form the present Git-plus-projected union, canonical exclusions, exact subset membership and safe-write skips; real-tool integration verifies only admitted files change."
    state: "[x]"
  - locus: Success Criteria > 18
    criterion-digest: sha256:9bba7aaf1c3d99a832da74dbe290b61c51b854060f4a15be094988a6cd39eab7
    evidence: "Both fixer modes acquire selection before mutation and retain acquisition reasons; markdown-fix integration proves untouched failure, recovered same-corpus execution and literal operands."
    state: "[x]"
  - locus: Success Criteria > 19
    criterion-digest: sha256:81d00e28a1fc1545f6fd15d92c7f1326d287b0795ed08d31343f34267a791dcb
    evidence: "runMarkdownFix preflights membership/authority/configuration and all bounded batches before execution; integration proves exactly-once literal coverage, retained earlier failure, untouched exclusions, projected-only and empty-union behavior."
    state: "[x]"
  - locus: Success Criteria > 20
    criterion-digest: sha256:75f3a6715313113c52a1871b4f8fa05c6eeecbd276552f30a15ddd71092808b8
    evidence: "CLI scope help, regenerated check-declaration schema and rendered quality-gates strategy agree; readProjectedSelection remains a dependency-free empty adapter until its supplier connects."
    state: "[x]"
  - locus: Success Criteria > 21
    criterion-digest: sha256:8ed2eb3c19deeb7f7787fdfddf456648a63828bf4a6c794e2fbb8ee7abcb7caa
    evidence: "The fresh forced serial merge gate on source head 5c97a470c passed all 19 locally applicable checks, including both type checks, lint, build, unit, integration and ARC contracts. The three CI-only E2E/portability checks remain assigned to CI."
    state: "[x]"
  - locus: Success Criteria > 22
    criterion-digest: sha256:58db93fe39223454b81347ff1a639f8238086deb7e85ae3c3f70a2bbbc6c04d1
    evidence: "All 22 implementation criteria have evidence, with no unresolved adversarial finding. Structural task closure and the staged verification subject establish readiness for initial Candidate attestation; preparation owns the independent review lanes."
    state: "[x]"
summary: 22 met; 0 superseded; 0 unresolved. Ready for Candidate preparation.
```

## Private standard review

Standard pass 1 of 2 reviewed `94d0ee7e187026a9bddc8a695f50a5e1b11af9d1` through
`3216f82c14aa859eaff795cdcf3344630882c42c`, target
`sha256:0665fef50225eda1310dda24c0422e975b6ed8a9bdd5972dc42db9f08ab82ce4`. Six fresh closure reviews covered all
102 changed files, with shared changed declarations included in consuming closures, followed by a dedicated seam
review and a fresh non-author aggregate. The complete union had no missing or extra paths. Every scope considered
the standard rubric's five dimensions and repository contract coherence.

The aggregate returned two minor findings. Source verification confirmed both; the approved disposition set is
`sha256:9f33182adebf3824145246e9f03f5540ddda37b92d528335cf30749e160b9dae`, with full verification and both findings
marked `fix`. The source is the attested local producer
`local-936a1a4b5a1a084f0da72c5d57f6c52fb012234cacab1ef465875d4403dc50f5`.

- **F1 — draft text after readiness feedback.** `draft-design.md` repeated feedback only when its final reread
  itself changed text. A review amendment after the first request could therefore commit without fresh feedback.
  The repeat condition now covers any draft text changed since the first request, including review amendments.
- **F2 — generic integration review fixes.** `integrate-work-unit.md` placed feedback only inside its hosted
  findings branch. The conditional request now sits with the common review-fix verification instructions and
  covers both local and hosted fixes once, preserving gates and the completed-only exemption.

These findings qualify the ceremony coverage recorded at verification: the follow-up repairs the two missed paths
under the existing design. The source sweep also checked the sibling draft/spec/task capture sites and preparation's
review-fix route; no further instance was found. Both fixes preserve the original goals and criteria. Package and
installed workflow bytes match, `render:framework` reports both unchanged, and the exact diff has no whitespace errors.

The singleton landing bridge applies: land one work-unit branch with the meta Integrating under `.arc/active/`,
compose Completion Notes before landing, then archive through a separate post-merge PR and tear down after it merges.

---

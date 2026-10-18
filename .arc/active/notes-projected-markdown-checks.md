# Notes: projected-markdown-checks

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

`resolveCheckSelection` currently builds own-input observations for every declaration, then derives shared coverage
from them (`lib/checks/selection.ts`). Selection declarations must leave that loop entirely, not merely be filtered out
when one runs, or their inputs could still change ordinary checks' widening. Its `namedPathChange` accepts directory
selectors; selection path scope keeps those descendant semantics while intersecting with the provider's list.

`executeResolvedRequest` awaits `runRequestedCheck` without isolating a rejected pre-execution read
(`handlers/check/run.ts`), and `runDeclaredCliRequest` converts an escaping rejection into a request-level error
(`handlers/check/run-cli.ts`). The new matcher's success/unavailable result stays inside per-check reporting: matching
failure is not an empty selection, does not discard completed results, and does not stop ordinary checks from running.
Tasks 3.2–3.4 in `tasks-projected-markdown-checks.md` define this boundary, and its Task 3.6 proves serial execution and
recovery at the command boundary.

`runDeclaredRequest` is the existing injectable orchestration entry; the public handlers currently construct their
dependencies inside private `runDeclaredCliRequest` (`handlers/check/run.ts`, `run-cli.ts`). Nonempty command tests
therefore need the narrow selection-reader override in Task 3.3. `handleSchemaInstall` supplies an existing handler
override pattern (`handlers/schema.ts`). Test through public handlers with real Git and child processes; subprocess
CLI tests use the empty production adapter until its supplier connects. No test-only production environment flag is
needed. Request coordinate resolution remains shared; only the selection-specific tree evidence is skipped.

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

## Fixer grounding

`validateExplicitMarkdownPaths` already has `allowIgnoredPaths`, a named set bypassing Git membership while retaining
physical and Git-directory checks (`lib/markdown/selection.ts`). `runExplicitMarkdownlint` currently checks
`MARKDOWN_SELECTION.ignores` using `matchesGlob` before that validation (`lib/markdown/worktree-lint.ts`); replace that
matching with the pathspec matcher rather than loosening the canonical selection. `isMarkdownPathExcluded` rejects any
`.venv`-prefixed segment, filename included (`lib/markdown/authority.ts`); the underwrap declaration must exclude that
class as well as the existing directory patterns.

`enumerateTrackedMarkdownPaths` selects the index plus nonignored untracked worktree files in worktree mode; filter
out absent worktree entries before fixing. `prepareExplicitMarkdownFormat` is the existing named ignored-path mutation
precedent (`lib/markdown/format-plan.ts`), while the new fixer must first acquire its complete tracked-plus-projected
corpus. Validate explicit-list membership and selection availability before invoking a mutating tool; preserve the
separate reported-skip behavior for listed files whose mutation authority fails. `loadWorktreeMarkdownConfigurations`
validates worktree tool configuration (`lib/markdown/configuration.ts`). Real process fixtures must prove literal
filenames survive markdownlint's own selection settings, rather than relying only on command construction assertions.

`enumerateTrackedMarkdownPaths` throws `markdown.empty-selection` when its Git contribution has no Markdown
(`lib/markdown/selection.ts`). Treat that specific result as an empty contribution when forming the fixer's union;
do not suppress other Git read failures or reject a valid projected-only corpus. A wholly empty union must not reach
markdownlint as a no-operand invocation.

`checkArgumentBudget` and `batchCheckPaths` already bound literal command lines, including Windows shim escaping
(`lib/checks/batching.ts`). A read-only enumeration during task generation returned 783 Git-selected Markdown paths,
56,624 bytes of literal `:path` operands, and nine batches under that helper's Windows budget. Reuse the helper after
complete corpus and explicit-membership validation, write-authority checks, and configuration validation; preserve
each admitted path exactly once and aggregate nonzero batch results. Tasks 5.4 and 5.6 in
`tasks-projected-markdown-checks.md` cover large corpora, projected-only and empty corpora, and batch failure reporting.

---

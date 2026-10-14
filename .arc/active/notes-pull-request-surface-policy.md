# Notes: pull-request-surface-policy

**Local (2026-10-14).**

- **One composer.** `arc delivery publish` is the only CLI composer of a title or body. Errand and work-unit PRs are
  agent-composed from prose (`gh pr create` with no `--title` or `--body` in either workflow). No CI or hook checks a
  pull request's title or body.
- **No host template.** The repository has no `.github` PR template.
- **Merge settings.** `allow_squash_merge: false`, `merge_commit_title: MERGE_MESSAGE`,
  `merge_commit_message: PR_TITLE`. The commit-msg hook's merge exemption covers local merges only; the host's merge
  commit runs no local hook.
- **Review-record history.** A composed `## Review` record — local and hosted pass counts, and
  `Triage: @handle — addressed · deferred · unresolved` — shipped 2026-08-15 (`745e8e580`). It was cut to a
  carrier-only marker the next day (`42df72ccc`) after a precedent review found no convention for recording review
  in a pull-request body. The rationale is `integration-boundary-accuracy`'s G3–G7. G7's escape hatch, richer
  reporting through a `pre-merge` extension, retired with `retire-extension-points` (PR #981).
- **`Decisions` history.** It reached the Errand body as `Decided: X over Y — because Z` (ADR-037, 2026-10-09) and
  became a prose `## Decisions` section the next day (`c986146d9`).

**External (2026-10-14).** Five load-bearing claims were checked directly:

- commitlint's `config-conventional` sets `subject-case` to never sentence, start, pascal, or upper case.
- Kubernetes requires disclosure in the PR description and prohibits `assisted-by` and `co-developed` trailers, per the
  April 2026 dev-list announcement and the 2026-06-26 blog post.
- The Y-statement form is Zimmermann's, evolved from Fairbanks' architecture haiku. Cite the wording from
  `ozimmer.ch`; the check confirmed it only through secondary sources.
- `refs/pull/<n>/head` persists after branch deletion, as observed (B3).
- GitHub's stacked pull requests are generally available on all github.com plans, per the 2026-10-06 changelog;
  Enterprise Server support is announced for a later release, and stack auto-merge is still rolling out (T2).

The rest come from one unverified research pass (confidence medium):

- **Titles.**
    - No prevalence study of PR-title formats exists.
    - PR-title linters (`amannn/action-semantic-pull-request`) assume squash.
    - release-drafter and title-prefix labelers read titles under any merge strategy; release-please and
      semantic-release read commits.
    - Copilot's coding agent titles in prose.
    - Google's guidance asks for a short imperative first line and is compatible with a type prefix.
    - The ICSE 2025 Conventional Commits study reports type choice as the top pain, which sharpens the ambiguity of
      one type over a multi-commit PR.
- **Disclosure.**
    - `Assisted-by:` leads among trailers. The Linux kernel uses `Assisted-by: AGENT:MODEL [TOOLS]`, Fedora uses
      `Assisted-by:`, and OpenStack uses `Assisted-By`/`Generated-By`. `Co-authored-by` for a model is disfavored.
    - Kubernetes requires disclosure in the PR description and forbids AI trailers.
    - Ghostty asks for the tool and the extent of AI use.
    - LLVM (2026-01) requires a human in the loop and labelling substantial generated content.
    - Every policy puts accountability on the submitter. None asks for a per-pull-request triage statement, and none
      covers AI review disclosure.
- **Body.**
    - Pirouzkhah et al. 2026 (about 80K pull requests) find that stating the desired feedback type best predicts
      acceptance.
    - Xiao et al. (FSE 2024) find generated descriptions associate with faster review, with a caution against
      including every generated section.
    - The evidence on length is conflicting.
    - Kubernetes headings: "What this PR does / why we need it", "Special notes for your reviewer".
    - Phabricator: "Summary" and "Test Plan".
    - Maintainers object to verbose AI-written descriptions (Biopython, Godot, Autoware's policy).

---

Executor context for `tasks-pull-request-surface-policy.md`. The design authority is
`spec-pull-request-surface-policy.md`.

## Installation

`classifyFile` in `packages/arc-framework/src/lib/classification.ts` uses `CONFIGURABLE_FILES` to classify methods;
`resolveFileList` resolves `init-recipe.json`, and `buildManifestFiles` assigns installed classification and pristine
hashes. Register the new method unconditionally alongside `commit-format`; no new parser or setting is needed.

`runUpdate` in `src/commands/update.ts` uses `buildChangePlan` and `applyChangePlan` in `src/lib/manifest/`.
`applyChangePlan` three-way merges Configurable content through `mergeFileContents` and deletes removed Framework
files. Its generic behavior already supplies override preservation and template removal; prove those paths with
real-template update fixtures rather than adding migration code.

The self-hosting manifest is an installation record, not an independently authored inventory.
`__tests__/integration/framework-sync.test.ts` compares its membership and classification against `resolveFileList`;
its residual-evidence shipment test also derives the configurable count and installed total and compares them with
`strategy-package-project-sync.md`. Account for both the addition-only state and the final template-removal state.

`prepareFrameworkProjection` in `src/lib/markdown/format-plan.ts` accepts tracked, installed Framework sources with
existing project counterparts. It backs `npm run render:framework -- <package-source.md>`, which neither installs
methods nor regenerates the manifest. Use classification/manifest APIs for the installation record and targeted
section edits for configurable copies. Do not run a wholesale self-update or blindly copy `arc-config.yml`.

Installed-method lists also occur in `__tests__/unit/init.test.ts`, `__tests__/integration/init.test.ts`, and
`__tests__/e2e/init.e2e.test.ts`. Include their registration assertions rather than stopping at the three workflow
test files named in the specification.

## Method reachability

`audit-method-triggers.ts` backs `npm run -s lint:arc:triggers`: workflow declarations root the method graph, and
method dependencies must be reachable and acyclic. Establish an Errand declaration/load point with the new method;
the declaration alone does not load its content at execution.

The method fires `commit-format`. `commit-format` cites the decision guide through `related`, not `arc.methods`,
so no reverse dependency closes a cycle. Both squash-title validity and the admitted multi-member terminal title
belong in the header contract because a replace-mode override skips the default section.

Keep the detailed policy on demand. Replace the universal pull-request rule in place with its operation trigger
and boundary; keep the commit rule. The trigger covers ad-hoc edits and resumed review-fix paths as well as creation.
No session load-set change, new loading flag, or domain-rules mechanism is needed.

## Keep-current scenarios

The new step belongs after an approved fix has actually been pushed: Errand Ship step 4 and integration step 2,
including the terminal request after a delivery-owned correction. It changes the description, not the review gate,
settlement order, exact-head checks, or continuation authority. Load the method at the edit point so resumed paths
do not depend on having run the creation arm in the same session.

Use the command results specified by the design:

- `git diff --quiet <pinned> HEAD -- <paths>` checks whether the linked design content changed.
- `git merge-base --is-ancestor <pinned> HEAD` checks whether the pin remains in the current ancestry.

Re-pin when either predicate fails. Test every linked file of a layered design. A fix that changes only code can
still change the Summary or a listed decision without changing its design link. A request with no linked design
still needs those description edits. Execution errors must be diagnosed rather than reported as successful checks.

Useful disposable-repository scenarios:

| Scenario                                      | Description action                         | Design-link action                           |
| --------------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| No design link                                | Correct any inaccurate section or decision | No link work                                 |
| Append-only fix; design unchanged             | Correct affected prose                     | Keep the pin                                 |
| One linked design changed                     | Correct affected prose                     | Pin the current design commit                |
| Only the second layered file changed          | Correct affected prose                     | Refresh the design-link line with both paths |
| Old pin outside current ancestry; bytes equal | Correct affected prose                     | Re-pin despite equal content                 |

Exercise the Git predicates in a disposable repository; no hosted request or history rewrite in this checkout is
needed to check them. Existing workflow integration tests can verify instruction placement and command presence;
they do not prove agent compliance on a real pull request. No new title/body validator or re-pin CLI is in scope.

## Delivery constraints

`validateConventionalSubject` in `src/lib/commit-check/policy.ts` requires a lowercase scope and rejects `!` for
ordinary Conventional Commits subjects. `CONVENTIONAL_TYPES` holds the eight admitted types. Read those sources when
authoring the guidance; do not turn the new method into another title validator.

`resolveDeliveryPublicationPresentations` in `src/lib/delivery/materialization.ts` preserves a one-member authored
title. For a multi-member plan it uses `deriveDeliveryTitleIdentity` to admit the terminal type, then
`composeDeliveryRequestTitle` supplies the work-unit ID as scope and the plan's position. The parser's stack
identity admission is not the full ordinary commit policy. Existing tests also cover a terminal-only breaking
marker; the publication behavior remains unchanged.

`DeliveryMemberReviewerPresentation` still permits `designReference`; remove it from authored guidance and the
example, not from the interface, schema, renderer, or compatibility behavior. `describeDeliveryMemberPresentation`
composes non-terminal content from the presentation and plan; the terminal request receives the authored full body.
`publishDeliveryRequests` adopts an exact existing request without editing its presentation. Do not imply that these
guidance edits refresh publisher-composed titles.

## Regression ownership

All paths below are relative to `packages/arc-framework/`.

| Existing test surface                                   | Change ownership                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `__tests__/integration/review-driver-lifecycle.test.ts` | Replace the old template attestation/member-form test with method contract and policy coverage                     |
| `__tests__/integration/prepublication-workflow.test.ts` | Method recipe inclusion, real reference resolution, workflow parity, and delivery presentation example             |
| `__tests__/integration/review-gate-workflows.test.ts`   | Replace Errand/integration review-field assertions; retain exact-head/re-entry coverage and add fix-step placement |
| `__tests__/integration/framework-sync.test.ts`          | Installed membership, configurable classification, pristine hash, and inventory coherence                          |
| `__tests__/integration/update.test.ts`                  | Populated method override and old Framework-template removal through the real update path                          |
| `__tests__/unit/delivery/materialization.test.ts`       | Preserve existing single/multi-member composition and refusal behavior                                             |

The old template-link test asserts exactly four definitions. Follow the new method's actual references rather
than carrying over that count. For retirement checks, distinguish instructions prescribing metadata from rules
that say to omit it, and distinguish pull-request body fields from unrelated artifact headers. Historical ADR
text remains historical; its forward amendment supplies the revised decision.

These are prose/configuration and registration changes, so tests may follow the edits. Keep related source and
test changes in the same task. Use focused `npm run test:file -- <repository-relative-paths>` invocations when
running selected suites; the declared ARC gates still decide the required verification at execution boundaries.

## Verification timing

The specification deliberately checks its first five criteria on the next few real pull requests after landing.
The task list preserves that timing. At pre-merge verification, report those observations as not yet performed
and obtain their truthful deferred disposition through the existing criteria workflow; source checks or example
bodies do not count as observed hosted behavior. Do not invent a sample count or declare those criteria met from
the wording alone. The remaining criteria have source, installation, and test evidence available before landing.

Both plan segments carry implementation evidence. Neither adds a new delivery boundary: the method, all consumers,
and reconciled rules remain one cohesive change. The specification's existing hold-whole decision remains valid.

---

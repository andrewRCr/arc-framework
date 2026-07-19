# Spec (`detailed` · `RFC`): Classify Change Granularity

- **Origin:** [internal]

- **Purpose:** Make CI weight classification distinguish ordinary packaged-guidance content edits from changes to
  the packaged tree's membership or behavior, while keeping verified-tree reuse and light-lane contract coverage
  sound.

---

## Introduction / Context

The repository's CI classifier currently treats every path under `packages/arc-framework/arc/**` as code. That
conservative rule was justified by tests that consume the shipped ARC tree, but it conflates two materially different
change shapes: ordinary Markdown prose modifications and changes to files, modes, templates, extensions, or internal
machinery that can alter installation or runtime behavior. Because framework methodology edits must originate in the
package copy, the common prose-only shape unnecessarily launches the complete build, typecheck, unit, integration,
end-to-end, and portability path. The same legacy path classifier also gates frontline review, but review risk is a
separate policy axis and must remain conservative until its dedicated resolver ships.

The existing classifier only receives changed paths. It cannot distinguish a modification from an add, delete, rename,
copy, or type change, and its verified-tree hash includes the blob identity of every packaged ARC file. Relaxing only
the path predicate would therefore make classification disagree with the identity used to reuse prior heavy checks.
The classifier and verified-tree identity must instead share an explicit model of the state that heavy verification
protects.

This work lands that model in the repository shell classifier first. The dependent `review-architecture` work unit will
lift the same normalized change facts into the CLI for broader policy consumers; it must not redefine or narrow their
semantics.

## Goals

- Classify a content-only modification to ordinary packaged ARC Markdown as `light`.
- Keep packaged-tree membership, rename/copy endpoints, type/mode changes, executable or rendered content, malformed
  facts, and unknown change sets on the `heavy` path.
- Preserve the current classification rules outside the packaged ARC tree.
- Make verified-tree reuse invariant under ordinary packaged-prose content edits but sensitive to every final-tree
  state that can change a heavy-only check outcome.
- Run the package-sync and repository review-wiring contracts on every light CI run that skips the broad suites.
- Establish one status, endpoint, and mode vocabulary that `review-architecture` can consume without a lossy shared
  representation.

## Non-Goals

- Generalize content-aware CI policy for adopter repositories; `adopter-content-aware-ci` owns that later work.
- Move the canonical fact resolver into the CLI in this work unit; `review-architecture` owns that lift.
- Change the `auto` / `reviewed` merge lane, portability targeting, heavy-check names, or verified-check lookback
  admission rules.
- Change `pre-pr-open` frontline-review routing. The dependent `review-architecture` work unit owns the independent
  review-risk projection; this work keeps the current path-conservative review behavior until that replacement lands.
- Infer content sensitivity by scanning test source or dynamically discovering which files tests read.
- Treat arbitrary semantic prose changes as test-free. The focused ARC contract slice remains mandatory on the light
  path.

## Proposed Design

### 1. Normalize Git changes before applying CI policy

Resolve the change between two verified commit endpoints from Git's NUL-delimited raw diff, with rename and copy
detection enabled. Pull requests retain merge-base comparison semantics (`base...head`); pushes retain endpoint
comparison semantics (`base head`). Normalize the wire records into this policy-neutral logical shape:

```text
changeSet: known | unknown
changes[]:
  status: added | modified | deleted | renamed | copied | type-changed
  path: affected path; destination for renamed/copied
  previousPath?: required for renamed/copied
  oldMode: Git tree mode
  newMode: Git tree mode
```

Map Git status families `A`, `M`, `D`, `R<score>`, `C<score>`, and `T` to the six canonical values. Similarity scores
are detection metadata and do not change the normalized status. A rename or copy record is valid only with both source
and destination paths; every other record has exactly one path. Preserve the old and new tree modes exactly. A
mode-only change is `modified` with unequal modes; an explicit Git type change is `type-changed`.

The resolver returns `unknown` when either endpoint cannot be verified, the diff command fails, the result is empty,
a record is malformed or endpoint-incomplete, or Git reports an unsupported status such as an unmerged record. The CI
projection always maps `unknown` to `heavy`. Rename detection may conservatively degrade to delete plus add, and copy
detection may conservatively degrade to add; each degraded form remains `heavy` for packaged ARC paths.

Keep filenames NUL-safe throughout extraction and parsing. Do not pass path lists through newline-delimited shell
strings, `eval`, or word splitting. The logical record is the compatibility contract; Git's raw serialization and the
shell parser are implementation details, not an ABI for the later CLI resolver.

### 2. Project normalized facts into CI weight

Classification remains an all-changes reduction: the result is `light` only when every normalized change is
light-safe. One heavy or unknown fact makes the whole change set `heavy`.

Outside `packages/arc-framework/arc/**`, classify each affected path through the existing code-surface and
genuine-document predicates. Added or deleted genuine documentation remains light-safe; existing fail-safe behavior for
unclassified paths remains unchanged. Rename and copy facts classify the union of source and destination endpoints so a
boundary-crossing change cannot hide behind its destination.

Inside `packages/arc-framework/arc/**`, a fact is light-safe only when all of these conditions hold:

1. `status` is `modified`.
2. `oldMode` and `newMode` are both exactly `100644`. Executable (`100755`), symlink, gitlink, and other modes remain
   content-sensitive even when stable across the change.
3. The path ends in `.md`.
4. The path does not match the explicit content-sensitive registry. Its initial entries are
   `system/extensions/**`, `system/.internal/**`, `reference/templates/**`, and every `**/*.template.md` source;
   exact Markdown exceptions may be added as new contracts demand them.

All other packaged ARC facts are `heavy`, including adds, deletes, renames, copies, type changes, mode changes,
non-Markdown files, extensions, internal machinery, authored templates, and registered exceptions. Keep the registry
explicit and reviewed beside the packaged-ARC predicates. A new test that depends on ordinary packaged guidance
content must either join the focused ARC contract slice or add its exact content surface to this registry. Test-source
inspection never mutates classification policy.

The existing path-only `classify` entry point remains conservative: a packaged ARC path without status and mode facts
still classifies `heavy`. Do not reinterpret it as the status-aware CI projection; `pre-pr-open` continues to use it as
the interim conservative review-risk gate. The `decide` command resolves normalized facts internally and retains its
current `weight=` / `reason=` output contract. The lane and portability commands remain path-based because their
policies do not need content-modification proof.

Apply the status-aware projection only to CI weight:

- `.github/workflows/ci.yml` continues to call `decide`, whose internal change-set resolution becomes status-aware.
- The active project `pre-pr-open` extension keeps piping `git diff --name-only` to path-only `classify`. Packaged ARC
  guidance therefore continues to receive frontline review regardless of CI weight until `review-architecture`
  replaces this compatibility gate with its independent review-risk projection.

### 3. Separate content identity from packaged-tree shape

Replace the current all-code-surface serialization with a version-tagged identity containing two independently tagged
layers:

1. **Content-sensitive layer.** Include path, mode, object type, and object identity for every existing code-surface
   entry outside ordinary packaged ARC guidance. Within the packaged tree, include object identities for non-Markdown
   files, every entry in the explicit content-sensitive registry, and exact exceptions added to that registry.
2. **Packaged-tree shape layer.** Include path, mode, and object type for every tracked entry under
   `packages/arc-framework/arc/**`, but omit blob identity.

Serialize a schema/version tag, a layer tag, and each field with unambiguous boundaries before hashing. Sort entries by
path under `LC_ALL=C`; do not depend on locale order or a delimiter valid filenames may contain. Sensitive packaged
entries intentionally appear in both layers: their content affects the first, while their membership and mode/type
affect the second.

The resulting identity has these invariants:

- Editing only the blob content of ordinary packaged Markdown preserves the identity.
- Adding, deleting, renaming, or copying a packaged path changes the shape layer.
- Changing a packaged entry's mode or type changes the shape layer.
- Editing a content-sensitive entry changes the content layer.
- Editing `scripts/classify-change.sh` changes the content layer, so this algorithm change must first earn a heavy
  baseline before later prose-only heads can reuse it.

Hash construction remains fail-closed: an unreadable ref, malformed tree entry, or serialization failure produces no
identity. The existing lookback depth, check-run requirements, exact-tree comparison, and `verified` decision behavior
remain unchanged.

### 4. Preserve packaged guidance contracts on the light lane

Add `test:arc-contracts` scripts at the package and repository roots. The package command is
`vitest run --project integration framework-sync pr-open-extensions review-gate-workflows`; the repository command is
`npm run test:arc-contracts -w packages/arc-framework`. The package script runs exactly these existing integration
suites without requiring a build artifact:

- `framework-sync.test.ts`
- `pr-open-extensions.test.ts`
- `review-gate-workflows.test.ts`

The repository script delegates to the package workspace. In `.github/workflows/ci.yml`, the `lint-typecheck` job runs
`npm run test:arc-contracts` whenever classification weight is `light`, after dependency installation and the existing
documentation audits. Heavy runs retain coverage through the normal integration job, avoiding duplicate execution.

Extend `review-gate-workflows.test.ts` (or another suite in the focused slice) with a wiring assertion that pins the
three selected suite names, the root delegation, and the light-lane CI invocation. The focused command changes only
when these content contracts run; it does not duplicate or weaken their assertions.

### 5. Verify the status and identity matrix directly

Extend `classify-change.test.ts` with temporary-repository tests that exercise the public shell surface and create real
Git records. Cover at least:

- ordinary packaged Markdown modification → `light`;
- package extension, internal, authored-template, non-Markdown, and registered content-sensitive modification →
  `heavy`;
- packaged add, delete, rename within the tree, rename into the tree, rename out of the tree, copy, type change, and
  mode change → `heavy`;
- both rename/copy endpoints participate in path policy;
- delete-plus-add and add-only degradation remain `heavy`;
- empty, unreadable, malformed, unsupported, and endpoint-incomplete inputs → `heavy`;
- a mixed light-safe and heavy fact set → `heavy`;
- path-only classification of packaged ARC content remains `heavy`;
- ordinary packaged-prose content changes preserve the tree identity;
- package shape, mode/type, content-sensitive blobs, and classifier-script content perturb the identity.

Retain the existing tests for genuine docs, non-package code, project extensions, unknown paths, unusual filenames,
verified-tree lookback, and exact heavy-check requirements. Update assertions only where the new status-aware contract
intentionally changes behavior.

### 6. Publish the downstream fact contract

The finalized `spec-review-architecture.md` consumes the six-status record from this RFC: it includes `copied` and
`type-changed`, retains `oldMode` and `newMode`, and requires `previousPath` for both renamed and copied records.
Path-membership consumers may ignore modes after resolution, but the shared fact may not discard them.

A named compatibility adapter may project `copied` to `added` or `type-changed` to `modified` only after canonical
resolution and only for a consumer that declares the loss. The shared CLI fact resolver, CI-weight policy, code-surface
membership, sensitive-surface membership, and ownership/review routing must not create parallel status vocabularies.
Verified-tree check history, ownership reads, and policy mappings remain consumer-specific inputs rather than reusable
change facts.

## Alternatives & Rationale

### Keep every packaged ARC edit heavy

This is safe but preserves the recurring cost the work exists to remove. The broad suite is not necessary for ordinary
prose semantics once its actual package-sync and review-wiring contracts run in the focused slice.

### Exclude packaged Markdown by path alone

This would make modifications cheap, but it would also make additions, deletions, renames, mode changes, and copies
cheap because the classifier could not distinguish them. It would additionally disagree with the current all-blob
verified-tree identity. The optimization would be unsound.

### Parse `--name-status` without tree modes

Name/status records can distinguish membership changes, but they cannot prove mode stability or build an identity that
responds to file-type and executable-bit changes. Raw records provide the complete minimum fact set in one pass.

### Move the resolver directly into the CLI

The CLI is the right eventual shared home, but doing that here would merge this bounded CI optimization with the much
larger review-policy architecture. Landing the shell contract first unblocks the dependent work while giving its CLI
resolver a tested semantic target.

### Maintain separate classification and hash allowlists

Separate lists make local implementation easier but recreate the drift hazard that invalidates verified-tree reuse.
One packaged-content policy and one package-shape definition must drive both decisions.

## Cross-cutting Considerations

### Security and trust boundaries

Changed paths and Git output are untrusted inputs. Parsing remains NUL-safe, validates record cardinality and status,
and never executes filename content. Commit endpoints must resolve locally before classification. Any ambiguity fails
to `heavy`, which spends more CI rather than skipping protection.

### Performance

Raw diff resolution replaces the existing name-only diff over the same commit range. Tree identity still performs one
tracked-tree enumeration and one streaming hash. The focused ARC contract command currently completes in well under a
second locally and is intentionally much smaller than the setup/build and broad test graph it protects.

### Testing and rollout

Land the fact parser, policy matrix, identity change, focused command, and CI wiring together; partial rollout would let
classification and cache identity disagree. Existing fail-safe defaults stay in force during the transition. The
classifier script's own content change invalidates the old verified identity, naturally forcing the first post-change
head through heavy verification.

No adopter-facing CLI or packaged configuration contract changes in this work unit. The shell remains a repository CI
adapter, and the package scripts are development tooling.

### Architecture and project alignment

The design stays within `TECHNICAL-OVERVIEW.md` § 3 Infrastructure (CI & configuration) and § 4 Testing Infrastructure:
Bash remains the CI adapter, Git remains the source of change facts, GitHub Actions remains the scheduler, and Vitest
remains the test runner. It introduces no component, dependency, runtime, or infrastructure outside the recorded
architecture.

The work supports the PROJECT-PRD principle **Operational friction down, judgment friction up**: it removes broad,
deterministic verification cost only after preserving the contracts that can fail, and it does not weaken review or
quality gates for behavior-bearing changes. It also supports **Designed to evolve** by giving the dependent review
architecture a typed, forward-compatible fact boundary.

### Dependency and coordination

`classify-change-granularity` ships before `review-architecture`. This work unit owns the shell fact semantics, CI
projection, focused contract command, and verified-tree identity. `review-architecture` owns the CLI resolver and its
review-risk, ownership, and routing consumers, including replacement of `pre-pr-open`'s interim path-only risk gate. Its
finalized `spec-review-architecture.md` already records the canonical six-status contract; its implementation remains
sequenced behind this work unit through `Depends On: classify-change-granularity`.

## Success Criteria

1. A real Git diff containing only ordinary packaged ARC Markdown content modifications resolves `light`; every
   packaged membership, rename/copy, type/mode, content-sensitive, malformed, unknown, or mixed-heavy case in the
   specified matrix resolves `heavy`.
2. CI `decide` consumes the status-aware facts, while the active `pre-pr-open` extension remains path-conservative and
   continues routing packaged ARC guidance to frontline review.
3. Existing lane and portability behavior is unchanged.
4. Ordinary packaged-prose content edits preserve `tree-hash`; every heavy-relevant final-tree change in the matrix
   perturbs it or fails closed without an identity.
5. A light CI run executes `test:arc-contracts` while skipping setup/build, broad unit/integration/end-to-end, and
   portability work; the focused suites still fail on package/project drift and review-wiring violations.
6. Wiring tests pin the focused suite list, root script delegation, and light-lane workflow invocation.
7. Shell lint, TypeScript/test typecheck, the classifier tests, the focused ARC contracts, and the repository's
   applicable quality gates pass.
8. `spec-review-architecture.md` retains the canonical six-status, two-mode, two-endpoint record without redefining its
   semantics.

## Open Questions

None. Internal helper names and shell serialization mechanics may vary during implementation provided they preserve the
public command behavior, normalized fact contract, fail-safe rules, and identity invariants above.

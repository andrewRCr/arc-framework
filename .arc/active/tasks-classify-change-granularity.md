# Task List: Classify Change Granularity

- **Design:** `spec-classify-change-granularity.md`

---

## **Phase 1:** Canonical Change Facts and CI Weight

_Purpose:_ Establish the status- and mode-aware change model, then make CI weight consume it without changing the
independent path-only policies.

### `[ ]` **1.1 Resolve canonical Git change facts**

- _Goal:_ `decide` receives a validated, policy-neutral record of the exact Git change, with every uncertain or
  incomplete input represented as unknown rather than a permissive path set. Satisfies Proposed Design §§ 1, 5, 6.

    - `[ ]` **1.1.a Parse canonical raw-diff records**
        - Build `test-first` (one behavior at a time):
            - Map `A`, `M`, `D`, `R<score>`, `C<score>`, and `T` into the six canonical statuses while preserving
              exact old and new tree modes.
            - Require both paths for rename and copy records and exactly one affected path for every other status.
            - Keep whitespace, tabs, and newlines in valid filenames intact through NUL-delimited parsing.
        - Implement the policy-neutral parser in `scripts/classify-change.sh`; similarity scores remain detection
          metadata rather than part of the logical status vocabulary.

    - `[ ]` **1.1.b Resolve event-specific change sets**
        - Build `test-first` (one behavior at a time):
            - Pull requests compare merge base to head; pushes compare the supplied before and after endpoints.
            - Verified, non-empty diffs produce a known change set consumed internally by `decide`.
            - Missing or unreadable endpoints, failed or empty diffs, unsupported statuses, and endpoint-incomplete
              records resolve unknown.
        - Replace the name-only `_classify_diff_paths` seam with raw, rename/copy-aware fact resolution without
          changing `decide`'s `weight=` / `reason=` output shape.

    - `[ ]` **1.1.c Close the resolver failure matrix**
        - Exercise real temporary repositories through the public shell surface for adds, deletes, renames, copies,
          type and mode changes, unusual filenames, and endpoint semantics in `classify-change.test.ts`.
        - Add a private raw-diff fixture seam, following the existing environment-injection pattern used by check-run
          fixtures, so tests can supply malformed and unsupported bytes without adding a public subcommand or ABI.
        - Use that seam for bounded malformed and unsupported-input coverage; every ambiguity must spend more CI by
          resolving unknown rather than fabricating a partial change set.

### `[ ]` **1.2 Project normalized facts into CI weight**

- _Goal:_ A change set is light only when every fact is demonstrably light-safe, while ordinary packaged ARC prose
  modifications gain the cheaper lane. Satisfies Proposed Design §§ 2, 5.

    - `[ ]` **1.2.a Define packaged-content sensitivity once**
        - Build `test-first` (one behavior at a time):
            - A `100644` to `100644` modification of ordinary packaged ARC Markdown is light-safe.
            - Extensions, internal machinery, authored templates, `*.template.md`, exact registered exceptions, and
              non-Markdown packaged files remain content-sensitive.
            - Stable executable, symlink, gitlink, and other non-regular modes remain heavy even without a mode change.
        - Place the explicit content-sensitive registry beside the packaged-ARC predicates so status projection and
          tree identity share one reviewed policy.

    - `[ ]` **1.2.b Reduce normalized facts conservatively**
        - Build `test-first` (one behavior at a time):
            - Packaged adds, deletes, renames, copies, type changes, mode changes, and degraded delete-plus-add or
              add-only detection are heavy.
            - Rename and copy source and destination endpoints both participate in path policy, including moves into
              and out of the packaged tree.
            - Outside the packaged tree, existing code-surface, genuine-document, unknown-path, and all-changes
              reduction behavior remains unchanged.
            - A mixed light-safe and heavy fact set and every unknown change set resolve heavy.
        - Route only `decide` through the status-aware projection; retain the current `docs-only`, `verified`, and
          `unverified` reason vocabulary.

    - `[ ]` **1.2.c Prove the packaged status and mode matrix**
        - Extend `classify-change.test.ts` with real Git cases covering ordinary prose, every sensitive registry arm,
          membership changes, cross-boundary endpoints, copy degradation, type/mode changes, and mixed sets.
        - Retain the established genuine-docs, non-package code, project-extension, unknown-path, and unusual-filename
          coverage unless the reviewed design intentionally changes its status-aware result.

### `[ ]` **1.3 Preserve path-only policy behavior**

- _Goal:_ Consumers without normalized status and mode facts remain conservative, and the independent scheduling and
  review projections do not inherit the CI-weight optimization. Satisfies Proposed Design § 2.

    - `[ ]` **1.3.a Pin path-only compatibility**
        - Keep `classify` heavy for every packaged ARC path, including ordinary Markdown, rather than inferring a
          modification from a path alone.
        - Retain the path-based `lane` and `portability` commands and their current outputs.

    - `[ ]` **1.3.b Protect the interim review-risk gate**
        - Preserve the configured `pre-pr-open` action's name-only, path-conservative call to `classify`.
        - Extend `pr-open-extensions.test.ts` to pin `git diff --name-only -z` and `classify --stdin0` in the configured
          action without asserting or depending on the extension's volatile `active` state.
        - Keep the `classify-change.test.ts` compatibility assertion so packaged guidance continues receiving
          frontline review until its dedicated resolver replaces this gate.

## **Phase 2:** Verified-Tree Identity

_Purpose:_ Make verification reuse insensitive to ordinary packaged prose while retaining every tree-state input that
can change a heavy-check outcome.

### `[ ]` **2.1 Build the versioned content-and-shape tree identity**

- _Goal:_ The hash represents exactly the content and final-tree shape that can change a heavy-only check outcome,
  while ordinary packaged-prose blob edits leave it stable. Satisfies Proposed Design §§ 3, 5.

    - `[ ]` **2.1.a Separate content-sensitive and packaged-shape membership**
        - Build `test-first` (one behavior at a time):
            - Outside ordinary packaged guidance, code-surface entries contribute path, mode, object type, and object
              identity to the content-sensitive layer.
            - Every packaged entry contributes path, mode, and object type to the shape layer without blob identity.
            - Packaged non-Markdown and registered sensitive entries also contribute their object identity to the
              content layer, intentionally appearing in both layers.
        - Reuse the packaged-content registry from Task 1.2 so classification and verified-tree reuse cannot drift.

    - `[ ]` **2.1.b Serialize a deterministic versioned identity**
        - Add schema and layer tags, unambiguous field boundaries, and `LC_ALL=C` path ordering before hashing.
        - Keep tree enumeration and serialization filename-safe; unreadable refs, malformed entries, or serialization
          failures must emit no trusted identity.

    - `[ ]` **2.1.c Prove identity invariants and failures**
        - Build `test-first` (one behavior at a time):
            - Ordinary packaged Markdown content changes preserve `tree-hash`.
            - Packaged add, delete, rename/copy result, mode, and object-type changes perturb the shape layer.
            - Sensitive packaged content and `scripts/classify-change.sh` content perturb the content layer.
            - Valid code and packaged paths containing tabs or newlines remain distinct identity participants, and
              changing their content, mode, or path changes the hash when the relevant layer requires it.
            - Genuine documentation remains excluded and bad refs continue failing without a hash.
        - Add a private tree-enumeration fixture and failure seam so malformed records and serialization failures are
          testable without exposing a public subcommand or ABI.
        - Verify through `tree-hash` and `decide` that malformed enumeration emits no identity and that any head or
          candidate identity failure remains heavy.
        - Extend the existing `tree-hash` suite instead of creating a parallel identity harness.

### `[ ]` **2.2 Keep verified-tree lookback fail-closed**

- _Goal:_ A prior heavy run is reusable only when its commit carries the head's exact new identity and every established
  admission check still passes. Satisfies Proposed Design §§ 3, 5.

    - `[ ]` **2.2.a Apply the layered identity to reuse decisions**
        - Keep `_code_tree_hash` as the single identity used for both the head and lookback candidates.
        - Preserve pull-request-only reuse, exact heavy-check requirements, latest-rerun handling, and the bounded
          lookback depth; pushes and all identity failures remain heavy.

    - `[ ]` **2.2.b Extend verified-lookback regression coverage**
        - Build `test-first` (one behavior at a time):
            - A prior green packaged-prose tree remains reusable after another ordinary prose edit.
            - Package shape, sensitive content, and classifier-script changes prevent reuse until the new identity has
              earned the complete heavy check set.
            - Missing, failed, in-progress, stale-tree, beyond-cap, and push-event cases retain their heavy result.

## **Phase 3:** Focused Light-Lane Contracts

_Purpose:_ Keep package-sync and repository review-wiring guarantees active on light runs without duplicating the broad
heavy suite.

### `[ ]` **3.1 Define the focused ARC contract command**

- _Goal:_ One repository command runs the existing package-sync and review-wiring contract suites without requiring a
  build artifact or broad integration execution. Satisfies Proposed Design § 4.

    - `[ ]` **3.1.a Add the package command**
        - Add `test:arc-contracts` to `packages/arc-framework/package.json` with the reviewed integration project and
          exactly the `framework-sync`, `pr-open-extensions`, and `review-gate-workflows` file filters.
        - Run the command directly to confirm the selected suites execute without a prebuilt `dist/` artifact.

    - `[ ]` **3.1.b Add root workspace delegation**
        - Add the same script name to the root `package.json`, delegating to the package workspace in the established
          repository-script style.
        - Confirm the root command invokes the same focused slice and does not broaden or duplicate its coverage.

### `[ ]` **3.2 Run focused contracts on the light CI lane**

- _Goal:_ Every light run still exercises contracts whose outcomes depend on packaged guidance content, while reviewed
  heavy pull requests and manual full-suite runs retain them through integration. Satisfies Proposed Design §§ 4, 5.

    - `[ ]` **3.2.a Wire the light-only CI invocation**
        - Add `npm run test:arc-contracts` to `lint-typecheck` after dependency installation and the always-on
          documentation audits when `needs.classify.outputs.weight == 'light'`.
        - Preserve light runs' setup/build, unit, broad integration, end-to-end, and portability skips.

    - `[ ]` **3.2.b Avoid duplicate integration execution**
        - Keep the focused command light-only; reviewed heavy pull requests and `workflow_dispatch` already execute all
          three selected suites through the integration job, while existing heavy-push scheduling stays unchanged.
        - Preserve job dependencies and `ci-ok` rollup semantics so a failed focused command cannot appear green.

### `[ ]` **3.3 Pin the focused suite and workflow wiring contract**

- _Goal:_ Repository tests fail if the focused suite membership, root delegation, or light-lane invocation drifts from
  the contract that makes ordinary packaged prose safe to classify light. Satisfies Proposed Design §§ 4, 5.

    - `[ ]` **3.3.a Assert script and suite membership**
        - Extend `review-gate-workflows.test.ts` to parse both package manifests and require the exact three suite
          filters plus root workspace delegation.
        - Add a heavy-path guard in `classify-change.test.ts` that requires all three concrete integration files to
          exist and correspond to those filters. Test-path or manifest changes classify heavy, so the guard runs on a
          rename or removal instead of living only inside the focused slice it protects.

    - `[ ]` **3.3.b Assert light-lane workflow behavior**
        - Pin the `lint-typecheck` invocation and its light-only condition in `.github/workflows/ci.yml`.
        - Assert the focused command does not run on the heavy path and that existing broad-suite conditions remain
          intact.

## **Phase 4:** Verification

_Purpose:_ Verify the complete implementation against the reviewed design and repository quality standards.

### `[ ]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Real-Git matrix coverage and private malformed-input fixtures prove ordinary `100644` packaged Markdown
  modifications light and every packaged membership, endpoint, mode/type, sensitive-content, malformed, unknown, or
  mixed-heavy case heavy.
- `[ ]` `decide` consumes normalized facts while `classify`, `lane`, `portability`, and `pre-pr-open` retain their
  path-conservative contracts.
- `[ ]` `tree-hash` ignores only ordinary packaged-prose blob changes and changes or fails closed for every
  heavy-relevant final-tree state.
- `[ ]` Verified-tree lookback uses the layered identity without weakening exact-check, event, rerun, or depth-cap
  admission rules.
- `[ ]` Light CI runs exactly the focused ARC contract slice while continuing to skip setup/build and the broad test
  graph; reviewed heavy pull requests and manual full-suite runs do not duplicate it outside integration.
- `[ ]` Wiring tests pin the three focused suite filters and concrete files, root workspace delegation, and light-lane
  workflow invocation.
- `[ ]` `spec-review-architecture.md` retains the canonical six statuses, both tree modes, and both rename/copy
  endpoints without redefining their semantics.
- `[ ]` All quality gates pass (tests, shell and TypeScript linting, type checking, Markdown linting, and build).
- `[ ]` Ready for integration.

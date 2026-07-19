# Task List: Classify Change Granularity

- **Design:** `spec-classify-change-granularity.md`

---

## **Phase 1:** Canonical Change Facts and CI Weight

_Purpose:_ Establish the status- and mode-aware change model, then make CI weight consume it without changing the
independent path-only policies.

### `[x]` **1.1 Resolve canonical Git change facts**

- _Goal:_ `decide` receives a validated, policy-neutral record of the exact Git change, with every uncertain or
  incomplete input represented as unknown rather than a permissive path set. Satisfies Proposed Design §§ 1, 5, 6.

    - `[x]` **1.1.a Parse canonical raw-diff records**
        - Added a private NUL-safe raw-diff parser for the six canonical statuses, exact modes, and rename/copy
          endpoints; malformed status scores, object IDs, cardinality, or trailing bytes resolve unknown.

    - `[x]` **1.1.b Resolve event-specific change sets**
        - `decide` now resolves `--raw -z` facts with rename/copy detection, retaining PR merge-base and push endpoint
          semantics plus the existing public weight/reason output.

    - `[x]` **1.1.c Close the resolver failure matrix**
        - Real temporary repositories cover membership, rename/copy, mode/type, endpoint, and unusual-filename cases;
          a private raw-byte fixture seam covers unsupported and malformed records fail-closed.

- _Outcome:_ `decide` consumes a validated policy-neutral change set; no ambiguous or partial record can reach the
  light projection.

### `[x]` **1.2 Project normalized facts into CI weight**

- _Goal:_ A change set is light only when every fact is demonstrably light-safe, while ordinary packaged ARC prose
  modifications gain the cheaper lane. Satisfies Proposed Design §§ 2, 5.

    - `[x]` **1.2.a Define packaged-content sensitivity once**
        - Added one shared registry for extensions, internal machinery, authored templates, `*.template.md`, and
          non-Markdown packaged files; only ordinary `100644` Markdown modifications are light-safe.

    - `[x]` **1.2.b Reduce normalized facts conservatively**
        - The all-facts reducer checks both rename/copy endpoints, preserves existing non-package path policy, and maps
          every packaged membership/mode/type change, mixed-heavy set, and unknown set to heavy.

    - `[x]` **1.2.c Prove the packaged status and mode matrix**
        - Extended the classifier suite across every registry arm and real Git add/delete/rename/copy/mode/type cases,
          including cross-boundary and unusual-filename behavior.

- _Outcome:_ Ordinary packaged guidance modifications now receive `light` CI weight without relaxing any
  behavior-bearing packaged change or existing non-package policy.

### `[x]` **1.3 Preserve path-only policy behavior**

- _Goal:_ Consumers without normalized status and mode facts remain conservative, and the independent scheduling and
  review projections do not inherit the CI-weight optimization. Satisfies Proposed Design § 2.

    - `[x]` **1.3.a Pin path-only compatibility**
        - Retained conservative packaged-path behavior for `classify` and unchanged path-based `lane` and
          `portability` contracts.

    - `[x]` **1.3.b Protect the interim review-risk gate**
        - Pinned the active project extension's NUL-safe `git diff --name-only` → `classify --stdin0` wiring, including
          a guard against routing it through status-aware `decide`.

## **Phase 2:** Verified-Tree Identity

_Purpose:_ Make verification reuse insensitive to ordinary packaged prose while retaining every tree-state input that
can change a heavy-check outcome.

### `[x]` **2.1 Build the versioned content-and-shape tree identity**

- _Goal:_ The hash represents exactly the content and final-tree shape that can change a heavy-only check outcome,
  while ordinary packaged-prose blob edits leave it stable. Satisfies Proposed Design §§ 3, 5.

    - `[x]` **2.1.a Separate content-sensitive and packaged-shape membership**
        - Split the identity into content-sensitive and packaged-shape layers driven by the same packaged-content
          registry as CI weight; sensitive packaged entries participate in both layers.

    - `[x]` **2.1.b Serialize a deterministic versioned identity**
        - Added a `v2` schema, explicit layer/field tags, NUL boundaries, and C-locale path sorting; malformed tree
          records, unreadable refs, and injected serialization failures emit no trusted hash.

    - `[x]` **2.1.c Prove identity invariants and failures**
        - Extended `tree-hash` tests for ordinary prose stability; packaged shape, mode/type, sensitive-content, and
          classifier changes; unusual filenames; and malformed head/candidate enumerations.

- _Outcome:_ Verified-tree identity ignores only ordinary packaged-prose blob changes while retaining every final-tree
  input that can affect heavy verification.

### `[x]` **2.2 Keep verified-tree lookback fail-closed**

- _Goal:_ A prior heavy run is reusable only when its commit carries the head's exact new identity and every established
  admission check still passes. Satisfies Proposed Design §§ 3, 5.

    - `[x]` **2.2.a Apply the layered identity to reuse decisions**
        - Kept `_code_tree_hash` as the sole head/candidate identity without changing PR-only reuse, exact checks,
          rerun precedence, bounded lookback, or push behavior.

    - `[x]` **2.2.b Extend verified-lookback regression coverage**
        - Proved reuse across ordinary packaged prose and rejection after sensitive packaged/classifier changes or
          malformed head/candidate identities, alongside the existing admission-failure matrix.

## **Phase 3:** Focused Light-Lane Contracts

_Purpose:_ Keep package-sync and repository review-wiring guarantees active on light runs without duplicating the broad
heavy suite.

### `[x]` **3.1 Define the focused ARC contract command**

- _Goal:_ One repository command runs the existing package-sync and review-wiring contract suites without requiring a
  build artifact or broad integration execution. Satisfies Proposed Design § 4.

    - `[x]` **3.1.a Add the package command**
        - Added the exact integration-project command for `framework-sync`, `pr-open-extensions`, and
          `review-gate-workflows`; the slice runs directly without importing a build artifact.

    - `[x]` **3.1.b Add root workspace delegation**
        - Added matching root delegation to the package workspace and verified the three-suite focused run.

### `[x]` **3.2 Run focused contracts on the light CI lane**

- _Goal:_ Every light run still exercises contracts whose outcomes depend on packaged guidance content, while reviewed
  heavy pull requests and manual full-suite runs retain them through integration. Satisfies Proposed Design §§ 4, 5.

    - `[x]` **3.2.a Wire the light-only CI invocation**
        - Added the focused command to `lint-typecheck` after always-on audits under the exact `weight == 'light'`
          condition while retaining every broad-suite skip.

    - `[x]` **3.2.b Avoid duplicate integration execution**
        - Kept the focused invocation out of heavy paths and preserved reviewed-heavy/manual integration conditions,
          job dependencies, and the existing `ci-ok` rollup.

### `[x]` **3.3 Pin the focused suite and workflow wiring contract**

- _Goal:_ Repository tests fail if the focused suite membership, root delegation, or light-lane invocation drifts from
  the contract that makes ordinary packaged prose safe to classify light. Satisfies Proposed Design §§ 4, 5.

    - `[x]` **3.3.a Assert script and suite membership**
        - Manifest assertions pin exact package/root commands; a heavy-path classifier guard verifies all three
          concrete integration files exist, correspond to the filters, and remain heavy when changed.

    - `[x]` **3.3.b Assert light-lane workflow behavior**
        - Workflow assertions pin the single light-only invocation plus the unchanged unit, integration, E2E,
          portability, and manual-run conditions.

- _Outcome:_ Light CI now runs one pinned focused slice whose wiring fails closed if suite membership, delegation, or
  scheduling drifts.

## **Phase 4:** Verification

_Purpose:_ Verify the complete implementation against the reviewed design and repository quality standards.

### `[ ]` **4.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[x]` Real-Git matrix coverage and private malformed-input fixtures prove ordinary `100644` packaged Markdown
  modifications light and every packaged membership, endpoint, mode/type, sensitive-content, malformed, unknown, or
  mixed-heavy case heavy.
- `[x]` `decide` consumes normalized facts while `classify`, `lane`, `portability`, and `pre-pr-open` retain their
  path-conservative contracts.
- `[x]` `tree-hash` ignores only ordinary packaged-prose blob changes and changes or fails closed for every
  heavy-relevant final-tree state.
- `[x]` Verified-tree lookback uses the layered identity without weakening exact-check, event, rerun, or depth-cap
  admission rules.
- `[x]` Light CI runs exactly the focused ARC contract slice while continuing to skip setup/build and the broad test
  graph; reviewed heavy pull requests and manual full-suite runs do not duplicate it outside integration.
- `[x]` Wiring tests pin the three focused suite filters and concrete files, root workspace delegation, and light-lane
  workflow invocation.
- `[x]` `spec-review-architecture.md` retains the canonical six statuses, both tree modes, and both rename/copy
  endpoints without redefining their semantics.
- `[x]` All quality gates pass (tests, shell and TypeScript linting, type checking, Markdown linting, and build).
- `[ ]` Ready for integration.

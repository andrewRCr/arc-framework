# Draft: classify-change-granularity

- **Origin:** [internal] — `USER-INBOX § Work Unit`, housekeep drain (2026-07-18); captured during the
  `design-load-settle-point` errand integration, where a two-file markdown-only diff classified `heavy`.
- **Purpose:** Make `classify-change.sh` diff-status-aware so pure prose modifications to the shipped arc tree
  (`packages/arc-framework/arc/**`) stop riding the heavy CI lane, while add / delete / rename — the manifest
  contract the init/update suites actually guard — still classifies heavy.
- **Priority:** P2 — self-funding against every future shipped-guidance edit.

---

## Problem / Motivation

`classify-change.sh` claims all of `packages/arc-framework/arc/*` as code surface, path-based by design
(classify/tree-hash symmetry — tree-hash has no diff to inspect, only surface membership). The tests that
justify the claim assert file existence, manifest membership, content round-trips, and structural markers
(`.actions` headings, section anchors in `diff-review` / `review-triage`) — never prose. So a pure content edit
cannot change a test outcome, yet the two-copy rule routes every shipped-guidance edit through the package
source: every methodology prose change pays the heavy CI lane (integration / e2e / portability legs) plus the
`pre-pr-open` frontline review. Recurring cost on this repo's most common change shape; confirmed live on the
`design-load-settle-point` errand (2026-07-18).

## Approach

Diff-status-aware classification:

- Pure **modifications** to non-structure-asserted `arc/**` files → `light`.
- Any **add / delete / rename** under `arc/**` → `heavy` — the manifest contract the init/update tests guard.
  This also closes a live hole: a pure doc rename today classifies light while breaking integration tests, and
  `naming-conventions`' mass rename is on the board.
- `system/extensions/*` → always `heavy` (behavior-bearing `.actions` content, integration-asserted).

The design-bearing piece is classify/tree-hash symmetry: Checks-API lookback reuse keys off a path-defined tree
identity with no diff to inspect. Candidate shape: compose a narrowed content surface (structure-asserted files)
with a whole-tree file-list hash, so prose modifications leave the identity stable while membership changes
perturb it. Settle the cache-coherence semantics at spec. Keep the wiring tests as-is — they pin real contracts;
the classifier is the blunt part.

## Relationships

- `adopter-content-aware-ci` — the adopter-facing generalization of the shipped dev-repo mechanism; sharpening
  the dev-repo reference first means it inherits the improved shape. Cross-reference at its grooming; no edge.
- Interim relief (already shipped): the `ci-defer-heavy` label on prose-only PRs (integration / e2e /
  portability skip; `ci-ok` stays red while labeled, so nothing greens deferred).

## Scope estimate

Small–Medium — the classify change is mechanical; the tree-hash identity redesign and its tests are the real
work.

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
(classify/tree-hash symmetry — tree-hash has no diff to inspect, only surface membership). The tests that justify the
claim protect file/manifest membership, package↔project sync, rendering round-trips, and a bounded set of structural
markers (`.actions` headings, workflow anchors, method contracts) — not ordinary prose semantics. Those cheap
content contracts still need to run, but they do not justify the full build / typecheck / unit / integration / e2e /
portability lane. Yet the two-copy rule routes every shipped-guidance edit through the package source, so every
methodology prose change currently pays that whole lane plus the `pre-pr-open` frontline review. This is recurring
cost on the repo's most common change shape, confirmed live on the `design-load-settle-point` errand (2026-07-18).

The current path-only input cannot distinguish a prose modification from a membership-changing add, delete, or
rename. Loosening that predicate alone would also make the verified-tree lookback unsound: its identity currently
hashes every packaged ARC blob, while the desired classifier treats most of those blob changes as test-irrelevant.
The classification and identity therefore have to move together around one explicit model of test-relevant state.

## Approach

### Normalize change facts before assigning CI weight

Resolve a known change set from Git's raw diff into one closed record before classification:

```text
changeSet: known | unknown
changes[]:
  status: added | modified | deleted | renamed | copied | type-changed
  path: affected path; destination for renamed/copied
  previousPath?: required for renamed/copied
  oldMode: Git tree mode
  newMode: Git tree mode
```

Mode-only changes remain `modified` with differing modes; `type-changed` records Git's distinct type-change status.
An unreadable, empty, malformed, unsupported, or endpoint-incomplete fact set is `unknown` and fails safe to `heavy`.
Path-only entry points cannot prove that a packaged-ARC path is merely a content modification, so they remain
conservative; live CI and pre-PR callers move to the status-aware path. Keep this record independent of Git's
NUL-delimited wire format so the later CLI resolver can lift it without preserving a shell-parser ABI.

The facts are policy-neutral. `light` / `heavy` is the CI consumer's projection, not a second fact vocabulary:

- Outside `packages/arc-framework/arc/**`, retain the current code-surface / genuine-docs rules.
- Within the packaged ARC tree, an add, delete, rename, copy, type change, mode change, or unknown status is `heavy`.
  Both rename endpoints participate, so crossing into or out of the tree cannot disappear behind the destination.
  Rename-detection degradation is safe: delete + add remains `heavy`.
- A pure modification to ordinary packaged guidance is `light`: a plain Markdown file outside
  `system/extensions/**`, `system/.internal/**`, and `reference/templates/**`, and outside any explicit
  content-sensitive exception.
- `system/extensions/**` remains a named content-sensitive surface whose modifications are `heavy` by policy.
- Non-Markdown package content, internal scripts/hooks, and authored template surfaces remain content-sensitive and
  `heavy`; their contents can affect executable or rendering behavior.
- Any other packaged-ARC content contract must execute on the light lane before its file can safely classify light;
  otherwise that file remains in an explicit content-sensitive registry. Never infer the registry dynamically from
  test source.
- Project-local `.arc/system/extensions/**` remains content-sensitive and `heavy` under the existing rule.

The shell owns this first status-aware implementation and remains a compatibility / CI adapter. The later
`review-architecture` resolver lifts this canonical record into the CLI, widening its current four-status sketch to
retain `copied`, `type-changed`, modes, and both endpoints. Path-membership consumers may ignore modes; they classify
the affected path for added/modified/deleted/type-changed facts and the union of endpoints for rename/copy facts. A
compatibility adapter may project `copied → added` or `type-changed → modified` only at a named lossy boundary after
the canonical fact has been resolved — never as the shared record itself. CI weight, code-surface membership, and
named-surface membership therefore consume one fact contract without inventing parallel status semantics.

### Keep packaged-ARC contracts alive on the light lane

The current heavy-only suite carries two broad contracts that a file allowlist cannot represent safely:

- `framework-sync.test.ts` renders and compares every Framework-classified package source against the project copy;
- `pr-open-extensions.test.ts` scans the whole packaged Markdown tree for retired lifecycle-hook names.

A modification to any packaged guidance file can trip either check, so merely narrowing the classifier would create a
green-path hole. Add a focused `test:arc-contracts` Vitest command to the existing light lint/typecheck job, selecting
`framework-sync.test.ts`, `pr-open-extensions.test.ts`, and `review-gate-workflows.test.ts`. Those suites already own
the broad package-sync and live review-wiring assertions and run without the build artifact; reuse them rather than
duplicating their semantics in a new validator. Keep their current assertions; change when the small contract slice
runs, not what it proves.

The remaining direct package-tree readers either exercise non-Markdown/internal executable content, package
extensions, or install/update membership behavior, all of which stay on the heavy side of the classifier. The
maintenance rule follows: a new test whose outcome depends on ordinary packaged-guidance content joins the always-on
ARC-contract slice, or its exact path becomes an explicit content-sensitive exception. Cover the selected suite list
and its CI invocation with a wiring assertion so the contract cannot disappear silently.

### Make the verified-tree identity represent the same test-relevant state

Replace the single all-content hash with one tagged serialization composed from two layers:

1. **Content-sensitive identity:** path + mode/type + blob identity for the existing code surface, excluding ordinary
   packaged ARC prose, plus the explicit packaged-ARC surfaces that still require heavy-only verification.
2. **Packaged-tree shape identity:** path + mode/type for every tracked file under `packages/arc-framework/arc/**`,
   deliberately excluding ordinary prose blob identity.

This gives the lookback the invariant it needs: an ordinary prose-only modification preserves the identity; a
membership, type/mode, or structure-sensitive content change perturbs it. Reaching a previously verified identical
state may still reuse its successful checks, which is the intended exact-state optimization. Changing the classifier
script itself remains content-sensitive, so the new algorithm necessarily earns an initial heavy baseline before it
can fund later prose-only runs.

Keep the wiring assertions as-is — they pin real contracts — while moving their minimal packaged-content slice onto
the light lane. Add direct classifier/hash tests for every status arm, rename endpoint direction, fail-safe case, and
the identity-preserving / identity-perturbing pairs above.

## Success signal

A representative matrix of ordinary-prose modifications, content-sensitive modifications, adds, deletes, renames in
both directions, copies, type/mode changes, empty/unreadable changes, and mixed changes produces the documented
`light` / `heavy` result. Ordinary-prose modifications preserve the test-relevant tree identity; every final-state
change that can affect heavy-only verification perturbs it. On a light run, the focused ARC-contract suites still
catch package↔project drift and review-wiring violations without launching the build, broad test tiers, portability
matrix, or frontline review. The later shared resolver can reproduce the same projection from the normalized facts
without redefining status or path semantics.

## Dependency contract

`classify-change-granularity` lands first. It owns the shell's diff-status / rename-aware facts, the CI weight
projection, and the test-relevant tree identity. `review-architecture` owns the shared CLI fact resolver and its
additional review-risk / ownership / routing consumers; its shell adapter and resolver must consume these semantics
rather than re-cut them. Its create-spec pass must widen the draft's narrower
`added | modified | deleted | renamed` record to the canonical superset above. That WU already carries
`Depends On: classify-change-granularity`.

## Relationships

- `adopter-content-aware-ci` — the adopter-facing generalization of the shipped dev-repo mechanism; sharpening
  the dev-repo reference first means it inherits the improved shape. Cross-reference at its grooming; no edge.
- Interim relief (already shipped): the `ci-defer-heavy` label on prose-only PRs (integration / e2e /
  portability skip; `ci-ok` stays red while labeled, so nothing greens deferred).

## Scope estimate

Small–Medium implementation surface; **`Class: Heavy` by derivation**. Status extraction is mechanical, but the
normalized-fact boundary and the cache-coherent two-layer identity are a real design that must be authored before a
competent engineer can implement it safely. The design composes existing Git facts, path predicates, and hash/reuse
machinery rather than inventing a new domain model, so it is not `Novel`. Grounding is contained to the classifier,
its CI / pre-PR callers, and focused tests. Cohort fit: stays one WU — classification and identity are one coupled
correctness contract, not independently deliverable subsystems.

## Readiness

**State: formalization-ready.** The design is settled and the inbound coordination buffer is integrated. The spec can
now formalize the status-fact schema, path policy, identity serialization, focused contract command, and caller
migration as one correctness contract.

- **Resolved:** `Heavy` by derivation / not Novel; one-WU fit; policy-neutral status facts; both rename endpoints;
  unknown → `heavy`; ordinary packaged prose modification → `light`; membership/type/mode and structure-sensitive
  changes → `heavy`; canonical six-status + mode/endpoint record; two-layer test-relevant identity; focused
  three-suite ARC-contract command; live caller set; `review-architecture` consumption boundary.
- **Open:** no settle-able design decision. Exact helper/flag names and serialization functions are implementation
  details, provided they preserve the normalized facts and fail-safe behavior above.
- **Next:** review the settled draft at the workflow interlock; on approval, persist `Class: Heavy`, capture the draft,
  and advance to create-spec.

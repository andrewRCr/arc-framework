# Notes: review-architecture

## Contents

- Touched-surface map (task-gen scoping)
- Key implementation loci

## Touched-surface map

Framework edits land in **both** copies (`packages/arc-framework/arc/**` source + `.arc/**` instance) unless
marked project-only. Ripple is wide but individually small.

- **Methods** — mint `review-routing`, `implementation-audit`, `independent-analysis`, `frontline-review`,
  `review-response`; rename `diff-review` → `self-review`; upgrade `review-triage` (severity × disposition, plus the
  `nit` flag).
- **Rubric / standard** — `implementation-audit` rubric; `independent-analysis/v1` standard + its typed contract
  record.
- **Workflows** — `integrate-work-unit` interlock reshape (remove compose-begin interlock; single late reconcile;
  flow-autonomy; async suspend-and-reenter); Errand-creation path (frontline fire-point); project
  `coordinate-pr-review.md` (graduate reusable procedure, keep host mechanics — project-only).
- **Extensions** — reconcile `pre-pr-open` / `post-pr-open` / `pre-merge` callouts; `pre-commit-review` /
  `pre-push-review` retain names but lose any self/frontline/independent review role.
- **Config** — retire `review.pre_merge`; add the `self-review.active` and `frontline-review.active`
  method-activation axes (coordinated with `customization-arch-realign`).
- **DEV-RULES.ARC** — concise disposition-invariant anchor (verify findings against source; approve the disposition
  set before fixes land).
- **CLI** — shared changed-path fact resolver; the routing reducer (the total mapping); the gate-projection contract
  (forward-only version bump; v1-evidence invalidation); semantic review records register with the schema kernel.
- **Scripts** — `classify-change.sh` becomes a status/rename adapter over the CLI resolver.
- **Strategy docs** — review-channel posture, review overlay, and enforcement division where they surface.

## Key implementation loci

- `scripts/classify-change.sh` — path predicate moves behind the CLI resolver; shell becomes a compatibility / CI
  adapter supplying status + both rename endpoints.
- `packages/arc-framework/src/scripts/review-gate/runtime/composition.ts` — `derivesCodeSurface()` (TS/JS-only
  regex) retires in favor of the canonical predicate.
- `packages/arc-framework/src/scripts/review-gate/` — gate-contract forward-only version bump; current v1
  receipts/evidence become ineligible for the new requirement.
- `.arc/system/workflows/project/coordinate-pr-review.md` — stays the project binding; graduate the reusable
  procedure into `review-response` + the strengthened `review-triage` contract.
- `.arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md` — reconcile the doubled `pre-push-review`
  callouts; interlock reshape.
- `.arc/system/methods/review-triage.md`, `.arc/system/methods/diff-review.md` — upgrade / rename.
- `.arc/system/arc-config.yml` — `review.pre_merge` retires.
- `.arc/system/extensions/{pre-pr-open,post-pr-open,pre-merge,pre-commit-review,pre-push-review}.md`.

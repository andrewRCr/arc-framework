# Draft: parallel-surface-access — always-fresh access to common hub surfaces under parallelism

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit` at the housekeep drain (2026-07-07); captured
  during `finalize-parallelism` BI-6 UX review, 2026-07-05.
- **Purpose:** Dissolve per-worktree staleness of cross-WU / hub-authoritative surfaces (`USER-INBOX`,
  `STATUS.USER`, upcoming `VECTOR.USER`, tracked `ROADMAP`) so "look at it in a worktree" always means fresh.
- **Provisional:** design direction only; no design authority until committed.
- **Dependency note (recorded at drain):** the capture's own approach names the delivery mechanism as
  *materialize-on-demand from a backing store — the storage-evolution north star*, and lists `arc-backend` /
  `strategy-storage-evolution` as coordinates. As captured this is a **consumer of that substrate**, not
  independently deliverable before it; the pieces that could precede it (render-on-demand `ROADMAP`, the hub-window
  projection) belong to `operational-state-docs` / `roadmap-tooling`, themselves downstream. Kept **provisional**
  at drain for that reason. Promote to `planned` only if an independent interim slice is carved out.

---

## Inbound Buffer — Pending Integration

> *Routed-in concern pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`).*

### `[ ]` **Always-fresh access to common hub surfaces under parallelism**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: parallel-surface-access`), housekeep drain (2026-07-07).
- *Observation:* Cross-WU / hub-authoritative surfaces — `USER-INBOX`, `STATUS.USER`, upcoming `VECTOR.USER`, and
  tracked `ROADMAP` — materialize a stale copy in every worktree, so "look at it in a worktree" ≠ fresh. FP's BI-6
  only fixes CLI resolution + a not-present/signpost MVP for the gitignored user surfaces (FP Task 2.6.d); it does
  not (and should not) make these always-fresh everywhere, and cannot touch tracked `ROADMAP`.
- *Approach:* Materialize-on-demand from a backing store (the storage-evolution north star): one store, rendered
  fresh wherever opened, callers unchanged — dissolving per-worktree staleness for both the gitignored surfaces and
  `ROADMAP`. Plus the human DX: a hub-window (main pins inbox / `STATUS.USER` / `VECTOR.USER` / `ROADMAP`, always
  fresh) vs. worktree-window (that WU's task list + code) pinning model. Symlink was considered and rejected —
  cross-platform-fragile and cannot cover tracked `ROADMAP`; materialize-on-demand is the intended final form.
- *Coordinate with:* `operational-state-docs` (render / projection engine, STATUS.PROJECT / ROADMAP shape),
  `strategy-storage-evolution` + `arc-backend` (backing store / materialization substrate), `roadmap-tooling`
  (ROADMAP renderer), `goal-aware-direction` (`VECTOR.USER` is part of this surface set).

### `[ ]` **Use PSI's composer as the thin render-on-demand sink**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: parallel-surface-access`), housekeep drain
  (2026-07-10); surfaced during `project-state-integrity` design.
- *Concern:* PSI now supplies a pure readiness composer plus a live read-time project view. The remaining
  passively-opened-file gap can therefore be a gitignored render-on-demand sink rather than a second state engine.
- *Promotion test:* when this WU is next weighed, compare that thin independently deliverable slice with waiting
  for the backing-store substrate, and coordinate naming/render standards with `roadmap-tooling`.

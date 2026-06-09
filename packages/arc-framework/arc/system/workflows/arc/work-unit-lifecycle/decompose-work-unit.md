---
purpose: Transform a live work unit into a cohort of self-contained member WUs via a park-shaped exit on its planning branch.
audience: agent
arc:
  extensions:
    - pre-push-review
---

# Workflow: Decompose Work Unit

Turn a single work unit into a **cohort** of self-contained member WUs. This is a genuine lifecycle transition —
the WU changing *what it is* — not a code-shipping integration: nothing merges to `main` as a deliverable, no
`completed/` archive is written. The origin WU's design is split across newly-minted member stubs, the origin is
retired, and the result lands in `backlog/planned/` as future work.

The cut itself — members, slugs, dependency edges, deliverable boundaries — is **not decided here**. It arrives
as the **cut-map** produced by the [`assess-cohort-fit`][assess-cohort-fit] method at planning time. This
workflow *consumes* the cut-map and *executes* the transform; it never re-derives the decision.

**When to use:** `assess-cohort-fit` has returned an affirmative cut-map for a live WU whose holistic design has
matured and revealed itself as a cohort (the **emergent** arm — typically surfaced during
[`1_create-spec`][create-spec]). The WU is on its `plan/<name>` planning branch in `**State:** Planning`;
decomposition is the branch's **terminal act**. There is no fresh branch and no `Active` step — a decomposing WU
never activates, because it stops being a WU.

> [!NOTE]
> **Not an integration.** `decompose-work-unit` reuses the **park** pattern's mechanics (`active/ → backlog/`,
> PR to `main`, branch + worktree teardown) — *not* [`integrate-work-unit`][integrate-work-unit]'s. No code
> deliverable ships and no `completed/` entry is written for the origin; the **cohort** carries the eventual
> archive when its last member ships.

---

## Steps

### 1) Pre-conditions and arm selection

Verify the decomposition context:

- The current branch is the origin WU's `plan/<name>` planning branch, and `active/meta-<name>.md` shows
  `**State:** Planning`.
- A cut-map is in hand from [`assess-cohort-fit`][assess-cohort-fit]: the members (with slugs), the internal
  dependency edges, and the deliverable boundaries. If no cut-map exists, stop — run the method first; this
  workflow does not decide the cut.

Select the **arm** from the origin's position relative to the one-level nesting cap (see
[Work Organization Strategy § Decomposition][work-org-decomp]). The arm governs Steps 2–3 only; every other
step is identical across arms.

1. **Standalone WU → top-level cohort.** The origin is in no cohort. It becomes a new top-level cohort carrying
   its own name; members nest beneath. *Name preserved.*
2. **In-cohort WU → sub-cohort.** The origin is already in a single-segment cohort. It becomes a sub-cohort under
   that parent; members nest one level deeper. *Name preserved.*
3. **At-cap WU → lateral fan-out.** The origin is already at the cap (a two-segment `Cohort`). No legal nested
   target exists — minting a cohort beneath it would be a forbidden third segment — so it fans out *laterally*
   into sibling WUs under its existing parent. *No cohort is minted; the name is not preserved as a grouping
   node.* See [§ At-cap arm](#at-cap-arm) for how Steps 2–3 change.

### 2) Mint the cohort

> Skip on the **at-cap arm** — no cohort node is minted there (see [§ At-cap arm](#at-cap-arm)).

Create the (sub)cohort directory under `backlog/planned/<cohort>[/<subcohort>]/` and author its
`cohort-<name>.md` from [`template-cohort.md`][template-cohort], carrying forward the coordination content from
the origin draft (shared contracts, cross-member seams, closeout criteria). At minimum the doc carries the
required one-paragraph `Purpose` floor. Membership stays **derived** from each member's `Cohort` field — the doc
records coordination, never a roster.

For arms 1–2 the cohort takes the **origin's name** (a WU→cohort rename, swept in Step 6's reference handling).

### 3) Backfill the parent cohort doc if absent

When the minted (sub)cohort nests under a parent grouping directory that has no `cohort-<name>.md` yet, author
the parent's doc to its `Purpose`-floor minimum from [`template-cohort.md`][template-cohort]. Every grouping
directory is constitutive — no doc-less grouping may exist (the cohort-consistency invariant, Step 7). On the
at-cap arm this parent doc already exists (the origin was a member of it); backfill is a no-op there.

### 4) Scaffold the member stubs

For each member in the cut-map, scaffold a per-member subdir under
`backlog/planned/<cohort>[/<subcohort>]/<member>/` carrying `meta-<member>.md` (from
[`template-meta.md`][template-meta]) and `draft-<member>.md`. Members land uniformly in `backlog/planned/`; each
activates later as a separate, deliberate act via [`init-work-unit`][init-work-unit] Path A, in dependency order.

**Field inheritance.** Set each stub's meta fields from the cut-map and the origin:

- **`Origin`** — *inherited from the origin WU.* Members of a decomposed concern share its provenance
  (`[internal]`, or the external tracker the origin carried); it is known at decomposition time.
- **`Design`** — the member's own `draft-<member>.md`.
- **`Cohort`** — the path-set (sub)cohort value, **dual-placed**: in the meta *and* mirrored into the member
  draft's header, per the dual-placement convention.
- **`Class`** — the member's own weight, resolved per the cut — not inherited from the origin.
- **`State`** — `Planning`.

**`Depends On` — distributed by *actual need*, never blanket-inherited.** Blanket-inheriting the origin's
outgoing edges manufactures artificial serialization: a member that never touches `X` would be falsely gated
behind it. Distribute across three edge kinds:

- **Outgoing** (origin → `X`): a member inherits `Depends On: X` *only where it genuinely depends on `X`.*
- **Internal** (member → member): authored fresh from the cut's delivery order.
- **Incoming** (`Y` → origin): re-pointed to the delivering member(s) in Step 6.

Each authored edge is a **live gate** among members — a coordination seam discharged at the depended-on member's
activation, not a hard blocker — so parallel-able members carry no inter-edges and imply no sequencing.

### 5) Distribute the origin draft's design — the four-step gate

The origin draft's design is **split, not copied**, under a four-step gate that guarantees no silent loss:

1. **Allocation map.** Map *every* origin section and design-point — **and every dependency edge** — to exactly
   one destination: a member's `draft-<member>.md`, the cohort doc's cohort-level coordination, the cohort doc's
   per-member coordination, or *dropped-with-reason* (superseded, or satisfied internally by the cut).
2. **Classify** each item by the design-vs-coordination boundary: design that drives a member's task list → that
   member's draft; genuinely ownerless shared material → cohort-level coordination; a member's exposes/consumes
   surface → per-member coordination; an owned contract → its owner's draft, with a pointer + consumer list left
   in the cohort doc.
3. **Conservation gate.** Assert every origin section *and* outgoing dependency edge lands in exactly one
   destination, or is explicitly dropped-with-reason — no silent loss. This gate is the precondition for
   retirement.
4. **Retire only after the gate passes** (Step 8): the origin is not deleted until the conservation gate is green.

The allocation map is **not throwaway** — it becomes the decomposition PR description (Step 10), the
reader-facing "here is where everything went" audit trail.

### 6) Re-point incoming dependency edges — the sweep

Incoming edges belong to the Step 5 allocation, but they live *outside* the origin draft, so they take an
explicit sweep. Scan **every** meta whose `**Depends On:**` names the origin — across `active/**` and
`backlog/planned/**`:

```bash
grep -rl '<origin-name>' .arc/active .arc/backlog/planned --include='meta-*.md'
```

Confirm each hit is a `Depends On` edge, then re-point it to the specific member(s) that now deliver what the
dependent needs. The sweep is **broader than the cut-map's named dependents** — scan for the edge directly,
because a dependent the cut-map didn't enumerate is otherwise silently orphaned when the origin name disappears.
A real split routinely turns up more incoming edges than the cut-map named — the direct scan is what catches them.

A `**Cohort:**` rename of the origin (arms 1–2) is a render-field edit on the affected metas; stage those edits
with the rest of the transform.

### 7) Verify cohort consistency

Before retiring the origin, verify the three cohort-consistency conditions hold over the minted structure:

1. **Field ↔ dir path-match** — each member's path-valued `**Cohort:**` matches its
   `backlog/planned/<cohort>[/<subcohort>]/` parent directory path.
2. **Every grouping dir carries a doc** — each grouping directory has a `cohort-<name>.md` with at least a
   `Purpose` floor (Steps 2–3).
3. **No orphan per-member sections** — every per-member section in a cohort doc keys to a slug that is a derived
   member (its `Cohort` field points here).

Confirm these by hand before retiring the origin — the Step 8 interlock surfaces the result, so drift is caught
before the commit rather than after the origin is gone. The cohort-consistency structural guard enforces the same
three conditions at commit time as the backstop.

### 8) Retire the origin

> [!IMPORTANT]
> `workflow-interlock`: Stop before retiring the origin and committing the transform. Surface (a) the
> **allocation map** from Step 5 — where every origin section and dependency edge landed, or why it was dropped;
> (b) the Step 7 verification result; (c) the planned origin retirement (`meta-<name>.md` + `draft-<name>.md`
> deleted) and the ROADMAP delta the regen will produce. Await approval before deleting the origin or committing.

The conservation check (Step 5) having passed, retire the origin — it has been fully redistributed and ceases to
be a WU:

```bash
git rm .arc/active/meta-<name>.md .arc/active/draft-<name>.md
```

No `completed/` entry is written: the origin's outputs are *future* work now living in `backlog/`. The cohort
carries the eventual `completed/` archive when its last member ships.

### 9) Regenerate ROADMAP · `arc-in-git` only

> **Skip this step** under `pm.mode: none` or `external`.

A WU leaving `active/` to become a cohort changes the render set — decomposition is a regen fire-point. Re-render
per [Work Organization Strategy § ROADMAP][work-org-roadmap]: the origin drops out of In Flight, and its members
appear in `backlog/planned/**` (Blocked or Ready per their distributed `Depends On`).

### 10) Park-shaped PR to `main`

Bundle the transform — cohort mint (Steps 2–3), member stubs (Step 4), redistributed drafts (Step 5), re-pointed
edges (Step 6), origin retirement (Step 8), and ROADMAP regen (Step 9) — as the decomposition commit.

**Decomposition PR description.** The Step 5 allocation map is **not throwaway** — it *is* the PR description.
Lead with the operation ("decompose `<name>` into cohort `<cohort>`: `<m1>`, `<m2>`, `<m3>`"), then account for
where every origin section and dependency edge landed (member draft / cohort doc / dropped-with-reason) — the
"here is where everything went" audit trail a reviewer reads to confirm nothing was lost. Write it in the same
plain-prose register as any commit or PR surface: legible without ARC-internal knowledge, artifact references
kept as backticked filenames.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): decompose <name> into cohort

- Mint cohort <cohort> + member stubs in backlog/planned/
- Distribute origin design across member drafts (allocation map in PR)
- Re-point incoming Depends On to delivering members
- Retire origin meta + draft; regenerate ROADMAP

Context: meta-<name>.md (decomposition)
```

Push the planning branch and open the PR to `main`:

- **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list (established at
  session init), load and execute its `.actions` before the push. Halt-on-fail surfaces an actionable message;
  user fix-and-retries or explicit-invoke bypasses. Otherwise, skip.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin plan/<name>`.

```bash
gh pr create --base main --head plan/<name>
```

> [!IMPORTANT]
> `integration-interlock`: Stop before merge. Surface PR status (open threads, required approvals, checks); await
> explicit 'merge' direction before merging.

```bash
gh pr merge <pr-number> --merge   # or --squash / --rebase per merge.strategy
```

Post-merge, retire the origin's per-WU user workspace subdir (filesystem op only, contents gitignored):

```bash
arc user close <name>
```

### 11) Branch and worktree teardown

Under the pre-merge `integration-interlock` approval — no second prompt fires — tear down the origin's planning
branch and, when spawned, its worktree. Dispatch on the current worktree identity:

**Primary worktree (in-place WU):** the `plan/<name>` branch lived directly in the main worktree — no distinct
worktree exists to remove. Switch back to the base branch and delete the planning branch local + remote:

```bash
git switch main                       # branch.base
git branch -D plan/<name>             # raw — local planning branch, never activated
git push origin --delete plan/<name>  # raw — destructive flag stays literal
```

The workflow continues to [`## Next step`](#next-step) normally.

**Linked worktree (spawned WU):** delete the branch and remove the worktree. Run the cascade from another
worktree (typically the primary):

```bash
cd <primary-worktree-path>
git worktree remove <wu-worktree-path>
git branch -D plan/<name>
git push origin --delete plan/<name>  # raw — destructive flag stays literal
```

**Session terminates here on the linked arm.** The origin worktree is removed and the agent's prior cwd no
longer exists; start a fresh session in another worktree (typically the primary). `## Next step` does not apply
on this arm.

---

## At-cap arm

When the origin is already at the nesting cap (Step 1, arm 3), no cohort node can be minted — so Steps 2–3 change
and every other step is unchanged:

- **No cohort minted (Step 2 skipped).** The members are scaffolded (Step 4) as **siblings under the origin's
  existing parent cohort**, peers of its current siblings, rather than under a new node.
- **Fan-out provenance, not a grouping node (Step 3 replaced).** Because the cap denies a new grouping node, the
  "these came from one concern" fact is recorded as **provenance — a write-once, immutable past-event note** in
  the parent cohort doc, in greppable phrasing:

  ```text
  Fanned out from `<origin>`: `<m1>`, `<m2>`, `<m3>` (at-cap lateral decomposition).
  ```

  It records a past event, so it never drifts and needs no guard — stronger than any slug convention and
  invisible-safe to the cohort-consistency invariant (which keys on the shared `Cohort` path).

- **Reality check before fanning out (judgment, not a gate):** ask whether hitting the cap signals the *parent*
  cohort was mis-scoped — calling for a parent restructure — rather than a clean lateral split. A prompt only;
  the cap is never raised to rescue a member that legitimately outgrew itself.

Coordination for the new siblings rides the existing parent cohort doc — they are members of it now, each taking
a per-member section there when it has cross-cutting coordination to record.

---

## Composition and reuse

`decompose-work-unit` layers as `[distribute + retire-origin] ∘ cohort-scaffold ∘ park-exit` — a
monolith-splitting discipline wrapped around two reusable cores. The cores are authored here as named blocks so a
later workflow-composition mechanism can hoist them into shared steps without a rewrite; cross-workflow references
to them use the **stable heading slug**, never a step number.

### Predicted vs. emergent arms

Whether *this workflow* runs at all depends on whether a monolith ever formed — the relationship is not 1:1:

- **Emergent.** A holistic draft matures and *then* reveals itself as a cohort (the affirmative fires at
  [`1_create-spec`][create-spec]). A monolith exists to *split* — this is the arm `decompose-work-unit` and its
  distribution discipline (Steps 5–6) serve.
- **Predicted.** [`assess-cohort-fit`][assess-cohort-fit] fires affirmative *during* draft-design, while the
  design is still forming. You author directly into the cohort structure; no monolith is ever created, so
  **`decompose-work-unit` does not run.** The predicted arm reuses the
  [cohort-scaffold block](#the-cohort-scaffold-block) alone — minting the cohort and member stubs incrementally
  as the design forms — without the monolith-splitting Steps 5–6.

### The cohort-scaffold block

Mint the cohort (Step 2), backfill the parent doc (Step 3), scaffold the member stubs (Step 4), and verify cohort
consistency (Step 7). This is the core the **predicted arm** reuses directly: it builds cohort structure without
reference to an origin draft being split, so it composes cleanly on its own.

### The park-exit block

The `active/ → backlog/` relocation, the park-shaped PR to `main` (Step 10), and the worktree-kind teardown
(Step 11). It is authored single-source here so any lifecycle ceremony needing the same relocate-park-teardown
choreography can adopt it from one place rather than re-authoring it — a deliberate future composition step, not a
present-tense edit to those workflows.

---

## Next step

The origin is now a cohort of `backlog/planned/` members. Each is activated separately, in dependency order, via
[`init-work-unit`][init-work-unit] Path A when work on it begins — no member is auto-started by decomposition.

## Related workflows

- [`assess-cohort-fit`][assess-cohort-fit] — the planning-time method that produces the cut-map this workflow
  consumes.
- [`init-work-unit`][init-work-unit] — activates each member (`backlog/planned/ → active/`) when its work begins.
- [`integrate-work-unit`][integrate-work-unit] — the code-shipping lifecycle exit; contrast with this
  transform-and-park exit.

---

[assess-cohort-fit]: ../../../methods/assess-cohort-fit.md
[create-spec]: ../1_create-spec.md
[init-work-unit]: planning/init-work-unit.md
[integrate-work-unit]: integrate-work-unit.md
[template-cohort]: ../../../../reference/templates/arc/work-unit/template-cohort.md
[template-meta]: ../../../../reference/templates/arc/work-unit/template-meta.md
[work-org-decomp]: ../../../../reference/strategies/arc/strategy-work-organization.md#decomposition--three-arms-by-parent-position
[work-org-roadmap]: ../../../../reference/strategies/arc/strategy-work-organization.md#roadmap

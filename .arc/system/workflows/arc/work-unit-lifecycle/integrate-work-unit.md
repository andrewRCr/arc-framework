---
purpose: Ship a work unit — PR open, review iteration, post-approval composition + sweep, final push pre-merge.
audience: agent
arc:
  methods:
    - diff-review
    - review-triage
    - commit-footer
  extensions:
    - pre-pr-review
    - pre-push-review
    - pre-merge-review
---

# Workflow: Integrate Work Unit

Ship a WU via the single merge-to-main moment. The PR opens with code-only commits; review iteration churns only
code. Post-review-approval, compose Release Notes Entry + Completion Notes into the meta file's archive-phase
sections, sweep + ROADMAP regen, and push the final pre-merge state.

**When to use:** All tasks in `tasks-{name}.md` are marked `[x]`; `active/meta-{name}.md` shows `**State:** Active`.

> [!NOTE]
> **WU not Active?** If `**State:** Planning`, run [`activate-work-unit.md`](activate-work-unit.md) first.

**Two timing phases inside one PR:**

1. **Phase 1: Open + iterate** — code commits only. Composition / sweep / ROADMAP do **not** fire here.
   Rejected PRs touch only code; no archive churn.
2. **Phase 2: Compose + sweep + ship** — post-review-approval, content cleanup + final-form composition +
   sweep + ROADMAP regen land as the final push before merge.

**Per-worktree isolation invariant preserved** — sweep lands on the WU branch before merge.

---

## Phase 1: Open and iterate

### 1) Pre-conditions + State transition (Active → Integrating)

Verify the integration context:

- Currently on the WU branch (per [`branch-format`][branch-format])
- `active/meta-{name}.md` exists and shows `**State:** Active`

Edit `active/meta-{name}.md`: `**State:** Active` → `**State:** Integrating`. The `Integrating` state covers PR
open through review-response.

Stage the edit.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit` (subject `chore(arc):` per § Commit
> Discipline, meta-file commit shape):

```text
chore(arc): integrate {name}

- Flip State: Active → Integrating

Context: meta-{name}.md (integration)
```

### 2) Pre-PR review

If `review.pre_merge` is enabled in [`arc-config.yml`][arc-config]:

1. Execute the [`diff-review` method][diff-review] against the local aggregate diff vs the base branch.
   Classify findings per the [`review-triage` method][review-triage]; commit fixes per the
   [`commit-footer` method][commit-footer].
2. If `pre-pr-review` appears in the active-extensions list (established at session init), load and execute its
   `.actions`. Halt-on-fail surfaces an actionable message; user fix-and-retries or explicit-invoke bypasses.

When disabled, proceed directly to Step 3.

### 3) Open the PR

Push the WU branch upstream.

- **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list
  (established at session init), load and execute its `.actions` before the push. Halt-on-fail surfaces
  an actionable message; user fix-and-retries or explicit-invoke bypasses. Otherwise, skip.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin {type}/{name}`.

Open the PR:

```bash
gh pr create --base {base-branch} --head {type}/{name}
```

Single PR per WU. The PR title's Conventional Commits type carries the signal.

**PR body:** load [`template-pull-request.md`][template-pull-request] for the canonical shape (Spec / Summary /
Changes / optional Test Plan / Out of Scope / Follow-Up Work) and its anti-patterns. Do not add sections
describing post-merge workflow continuity or next actions — those route to the meta file and SESSION-NOTES per
[DEV-RULES.ARC][dev-rules-arc] § Write for the reader, not the author.

### 4) Review iteration

Process any reviewer findings per the [`review-triage` method][review-triage]; commit fixes per the
[`commit-footer` method][commit-footer]. Re-run Tier 1 quality gates on modified files after each review-driven
commit.

The WU stays in `**State:** Integrating` throughout this phase. Composition + sweep do not fire here.

---

## Phase 2: Compose, sweep, ship

### 5) WU content cleanup

**Always:** If `notes-{name}.md` exists, decide disposition:

- **keep + clean** — follow [`clean-work-unit.md`][clean] `§ Notes File Consolidation`.
- **keep as-is** — rare; only when the notes file is already reference-ready.
- **delete** — `git rm notes-{name}.md`; remove references from the task file.

**On signal:** Survey the task list for temporal markers, ad-hoc inline status, or accumulated scratchpad
content. If present, propose [`clean-work-unit.md`][clean] `§ Task List Temporal-Noise Pass` before proceeding
to Step 6.

### 6) Fire `pre-merge-review` extension

After review-response settles, fire the `pre-merge-review` extension. If active, load and execute its
`.actions`; halt-on-fail surfaces an actionable message. Default-inactive — when absent, this step is
a structural no-op.

### 7) Final alignment checks

> [!IMPORTANT]
> `workflow-interlock`: Stop before composition begins. Surface that review is settled (open threads resolved,
> required approvals received, checks green); await approval before proceeding to alignment + composition.

Both soft; rarely block if [`1_create-spec.md`][create-spec]'s alignment checks passed. Surface any conflicts
discovered against final reviewed scope.

#### PROJECT-PRD

Always evaluated. Surface conflicts between final reviewed scope and PROJECT-PRD Principles / Out of Scope.

#### TECHNICAL-OVERVIEW

Fires only when the PRD touched technical surfaces (tech stack, architecture, runtime, dependencies,
infrastructure). Independent of the PROJECT-PRD check — scope distinction is the trigger.

### 8) Compose Release Notes Entry — uncommitted

Compose a user-facing entry into `active/meta-{name}.md`'s archive-phase Release Notes section per
[`template-meta.md`][template-meta]'s schema, reflecting final reviewed scope.

Leave the edit uncommitted — Step 11's interlock surfaces it alongside the rest of the composition for review
before the commit fires.

### 9) Compose Completion Notes — uncommitted

Compose narrative Completion Notes into the meta file's archive-phase Completion Notes section per
[`template-meta.md`][template-meta]'s schema. Same uncommitted-surfacing pattern as Step 8.

### 10) Drain-write — uncommitted · `arc-in-git` only

> **Skip** under `pm.mode: none` or `external`.

If integration drains any shared inbox entries (entries absorbed into this WU's scope at activation that need
final deletion from the shared inbox), finalize the deletions now. See [DEV-RULES.ARC][dev-rules-arc] § Leave it
cleaner for the capture-routing table.

### 11) Commit completion content

> [!IMPORTANT]
> `workflow-interlock`: Stop before commit + sweep + push. Surface:
>
> 1. Composed Release Notes Entry + Completion Notes (Steps 8–9)
> 2. Planned sweep target: `active/meta-{name}.md` → `completed/<dated>/{NN}_{name}/meta-{name}.md` (Step 12 under
>    `with-integration`)
> 3. ROADMAP delta the upcoming regen will produce (Step 12 under `with-integration`)
>
> Await explicit "proceed to commit + sweep + push" direction.

Bundle composition + drain-write edits.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): compose archive-phase content for {name}

- Release Notes Entry: <one-line summary>
- Completion Notes
- Drain absorbed inbox entries: <list>     # arc-in-git only, if applicable

Context: meta-{name}.md (integration)
```

See [DEV-RULES.ARC][dev-rules-arc] § Commit format and the [`commit-footer` method][commit-footer].

### 12) Cadence dispatch — `archive.cadence`

Read `archive.cadence` from [`arc-config.yml`][arc-config]:

- **`with-integration`** (default): Invoke [`archive-work-unit.md`][archive-work-unit] inline. archive handles
  state flip `Integrating → Shipped`, sweep commits (`active/meta-{name}.md` →
  `completed/<dated>/{NN}_{name}/meta-{name}.md`), and ROADMAP regen per its cadence-invariant body. Returns; resume at
  Step 13.
- **`manual`**: Skip inline invocation. Archive runs separately post-merge via explicit `archive-work-unit.md`
  invocation. Step 13's push covers completion content only under this cadence.

### 13) Final push

What gets pushed varies by cadence:

- Under `with-integration`: completion content + sweep commits + ROADMAP regen commits.
- Under `manual`: completion content commit only. Sweep + ROADMAP fire later when `archive-work-unit.md` is
  invoked explicitly post-merge.

**Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list
(established at session init), load and execute its `.actions` before the push. Halt-on-fail surfaces
an actionable message; user fix-and-retries or explicit-invoke bypasses. Otherwise, skip.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `origin {type}/{name}`.

After push, the PR is ready for merge per `merge.strategy` in [`arc-config.yml`][arc-config].

> [!IMPORTANT]
> `integration-interlock`: Stop before merge. Surface PR status (open threads, required approvals, checks) and
> merge method; await explicit integration approval before merging.

```bash
gh pr merge {pr-number} --merge   # or --squash / --rebase per config
```

Post-merge, retire the per-WU user workspace subdir (filesystem op only, no git ops —
contents are gitignored):

```bash
arc user close {name}
```

---

## Next step

- **Under `with-integration` (default):** WU is fully shipped after merge — archive ceremony already landed in
  Step 12.
- **Under `manual`:** After merge, invoke [`archive-work-unit.md`][archive-work-unit] to complete archival
  post-merge.

## Related workflows

- [`activate-work-unit.md`](activate-work-unit.md) — preceding ceremony; Planning → Active.
- [`archive-work-unit.md`](archive-work-unit.md) — cadence-invariant archival; invoked inline under
  `with-integration` or explicitly under `manual`.
- [`clean-work-unit.md`][clean] — supplemental content-cleanup toolkit invoked from Step 5.

---

[branch-format]: ../../../methods/branch-format.md
[diff-review]: ../../../methods/diff-review.md
[review-triage]: ../../../methods/review-triage.md
[commit-footer]: ../../../methods/commit-footer.md
[template-pull-request]: ../../../../reference/templates/arc/work-unit/template-pull-request.md
[template-meta]: ../../../../reference/templates/arc/work-unit/template-meta.md
[archive-work-unit]: archive-work-unit.md
[clean]: ../supplemental/clean-work-unit.md
[create-spec]: ../1_create-spec.md
[arc-config]: ../../../arc-config.yml
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md

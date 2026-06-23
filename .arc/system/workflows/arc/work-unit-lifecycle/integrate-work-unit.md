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

### 1) Pre-conditions + entry mode (fresh vs. resume)

`Integrating` is a suspendable point: a session can enter it, hand off across the review wait, and a later
session — or machine — re-enters here. Resolve the entry mode from the resolver — `arc status {name} --json` —
before doing anything else: its derived `state` reads `active` for a fresh entry, `integrating` for a resume.

#### Fresh entry — resolver `state: active`

Verify the integration context:

- Currently on the WU branch (per [`branch-format`][branch-format])
- `active/meta-{name}.md` exists and shows `**State:** Active`

Compose the integration inputs (judgment — never fabricated):

- last completed — the WU's final completed work (the last `[x]` task / phase in `tasks-{name}.md`)
- next action — the integration pointer (`open the PR`)

```bash
arc integrate {name} --last-completed "{last completed}" --action "{next action}"
```

The executor fires the full `integrate` edge: flips `**State:** Active → Integrating`, writes `**Last Completed:**`
/ `**Next Action:**`, resets `**Next Task:** [none]`, and stages the meta. `{name}` defaults to the current
worktree's WU. The `Integrating` state covers PR open through review-response.

Hand-render `backlog/ROADMAP.md` into the same commit per the command's interim ROADMAP advisory, so the In Flight
table's rendered `State` column reflects `Integrating` (interim until `roadmap-tooling` ships the renderer). Stage
the ROADMAP edit alongside the meta.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit` (subject `chore(arc):` per § Commit
> Discipline, meta-file commit shape):

```text
chore(arc): integrate {name}

- Flip State: Active → Integrating

Context: meta-{name}.md (integration)
```

Proceed to Step 2.

#### Resume entry — resolver `state: integrating` (re-entry guard)

The transition already ran in a prior session (or the merge landed unattended). **Skip the state transition and
every pre-PR / PR-open step that already ran** — re-enter at the first incomplete tail step. Resolve the resume
point from observable state — PR open vs. merged, plus worktree/branch presence — never by redoing a completed
step:

| Observed state               | Demonstrably already ran   | Resume at                                              |
| ---------------------------- | -------------------------- | ------------------------------------------------------ |
| No PR open for the WU branch | transition                 | Step 2 (pre-PR review → open the PR)                   |
| PR open, not merged          | transition, PR open        | Step 4 (review iteration → Phase 2)                    |
| PR already merged            | transition, PR open, merge | post-merge tail — Step 12 close, then Step 13 teardown |

Resolve PR state with `gh pr view {type}/{name} --json state,mergedAt` (fall back to `gh pr list --head
{type}/{name}`); resolve worktree/branch presence with `git worktree list` and `git branch --list {type}/{name}`.
Within Phase 2, pick up at the first step whose product isn't already present — composition already written into
the meta's archive-phase sections, a sweep already committed — observe, don't redo. The tail steps (Steps 12–13
below) are individually re-runnable and no-op when their target is already gone, so an over-eager resume costs
nothing.

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

### 7) Spec-presence + alignment checks

> [!IMPORTANT]
> `workflow-interlock`: Stop before composition begins. Surface that review is settled (open threads resolved,
> required approvals received, checks green); await approval before proceeding to alignment + composition.

First confirm the WU's `**Design:**` field resolves to a spec present in `active/` — a `spec-{name}.md` or the
layered `spec-{name}-prd.md` / `spec-{name}-rfc.md` pair; if absent, stop and surface.

The alignment checks below are soft; rarely block if [`create-spec.md`][create-spec]'s alignment checks passed.
Surface any conflicts discovered against final reviewed scope.

#### PROJECT-PRD

Always evaluated. Surface conflicts between final reviewed scope and PROJECT-PRD Principles / Out of Scope.

#### TECHNICAL-OVERVIEW

Fires only when the PRD touched technical surfaces (tech stack, architecture, runtime, dependencies,
infrastructure). Independent of the PROJECT-PRD check — scope distinction is the trigger.

### 8) Compose Release Notes Entry — uncommitted

Compose a user-facing entry into `active/meta-{name}.md`'s archive-phase `## Release Notes Entry` section,
reflecting final reviewed scope: a one-paragraph user-facing summary plus categorized lines per the Keep a
Changelog set — **Added**, **Changed**, **Removed**, **Fixed**, **Infrastructure**, **Deprecated**, **Security**
(omit any empty category; keep that order), with an optional **Breaking Changes** callout flagging
stability-contract breaks. Neutral voice, no internal work-unit names or roadmap pointers. Omit the section
entirely when nothing user-facing ships (a mechanical or internal-only change); otherwise size it to what shipped.

Leave the edit uncommitted — Step 10's interlock surfaces it alongside the rest of the composition for review
before the commit fires.

### 9) Compose Completion Notes — uncommitted

Compose narrative Completion Notes into the meta file's archive-phase `## Completion Notes` section — a
synthesis of design intent, what actually shipped, key deviations / supersessions from plan, and verification
outcome; it complements, never repeats, the task list's verbatim record and git history. Sized to what there is
to say. Always present — not omittable, unlike Step 8's Release Notes. Same uncommitted-surfacing pattern as Step 8.

### 10) Commit completion content

> [!IMPORTANT]
> `workflow-interlock`: Stop before commit + sweep + push. Surface:
>
> 1. Composed completion content — Completion Notes, plus the Release Notes Entry when present (Steps 8–9)
> 2. Planned sweep target: `active/meta-{name}.md` → `completed/<dated>/{NN}_{name}/meta-{name}.md` (Step 11 under
>    `with-integration`)
> 3. ROADMAP delta the upcoming regen will produce (Step 11 under `with-integration`)
>
> Await explicit "proceed to commit + sweep + push" direction.

Bundle the composition edits.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): compose archive-phase content for {name}

- Release Notes Entry: <one-line summary>
- Completion Notes

Context: meta-{name}.md (integration)
```

When Step 8 omitted the Release Notes section (nothing user-facing), drop its bullet from the commit body.

See [DEV-RULES.ARC][dev-rules-arc] § Commit format and the [`commit-footer` method][commit-footer].

### 11) Cadence dispatch — `archive.cadence`

Read `archive.cadence` from [`arc-config.yml`][arc-config]:

- **`with-integration`** (default): Invoke [`archive-work-unit.md`][archive-work-unit] inline. Its `arc archive`
  sweep handles state flip `Integrating → Shipped`, the relocation `active/meta-{name}.md` →
  `completed/<dated>/{NN}_{name}/meta-{name}.md`, the logical `Branch → [none]`, the `PR URL` / `Completed`
  finalize-fact write (sourcing the PR URL from this ceremony's open PR), and ROADMAP regen per its
  cadence-invariant body — the **mergeable** ship, which rides this PR. Physical branch/worktree teardown is
  **not** archive's: it is Step 13's post-merge cleanup below. Returns; resume at Step 12.
- **`manual`**: Skip inline invocation. Archive runs separately post-merge via explicit `archive-work-unit.md`
  invocation. Step 12's push covers completion content only under this cadence.

### 12) Final push

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

**Skip the merge when the PR is already merged** — the resume path's PR-merged arm (Step 1) enters here with the
merge already landed (attended elsewhere, or unattended on the auto-merge lane); proceed straight to `arc user
close`.

Retire the per-WU user workspace subdir (filesystem op only, no git ops — contents are gitignored):

```bash
arc user close {name}
```

This is an **individually re-runnable** step, not just the tail of a synchronous merge: on the resume path it is
the owning caller of `arc user close` — a merge that landed while no session attended it has no other closer.
`arc user close` no-ops when the subdir is already retired, so a re-run is safe.

### 13) Post-merge worktree cleanup

After `arc user close`, run `arc teardown <wu-name>` under the pre-merge `integration-interlock` approval — no
second prompt fires. This is the **physical** branch/worktree teardown the archive sweep (Step 11) deferred: it
runs post-merge, since a merged branch can only be reaped once its PR has landed. The verb resolves the shipped
WU's branch and composes the cleanup deterministically, presence-guarded throughout — a resume that re-enters
after a partial teardown skips what is already done:

- reaps the merged branch with a **merged-safe** delete, containment-checked against the upstream — so squash and
  rebase ships are handled where a reachability-from-base delete would refuse, and never a force delete;
- removes the WU's worktree when one is distinct from the primary (the in-place arm has none to remove),
  clean-checked and never `--force`;
- prunes the stale remote-tracking ref the delete-on-merge left behind.

A dirty worktree is refused (no `--force` escape): surface the state and resolve it before re-running. When the
teardown removed the linked worktree the session occupied, the agent's prior cwd no longer exists — **the session
terminates here**: start a fresh session in another worktree (typically the primary), where `## Next step` does
not apply on this arm.

Then run the [same-session finalize pass][session-handoff-finalize] as an opportunistic early catch — a no-op
unless this session opened another PR that has merged outside an attended ceremony (a concurrent WU, or this one
on the auto-merge lane). The workflow continues to `## Next step` normally.

---

## Next step

- **Under `with-integration` (default):** WU is fully shipped after merge — archive ceremony already landed in
  Step 11.
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
[archive-work-unit]: archive-work-unit.md
[clean]: ../supplemental/clean-work-unit.md
[session-handoff-finalize]: ../session-lifecycle/session-handoff.md#same-session-finalize-pass
[create-spec]: ../create-spec.md
[arc-config]: ../../../arc-config.yml
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md

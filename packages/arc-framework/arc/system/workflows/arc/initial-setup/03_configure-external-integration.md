# Workflow: Configure External Tracker Integration

**Audience:** Collaborative — developer and agent work through this together.

**Purpose**: Connect ARC's workflow extension points and methods to your external project
tracker. This makes `pm.mode: external` meaningful — without this configuration, ARC
workflows don't know how to interact with your tracker.

**When to use**: After [02_define-project.md][define-project] when `pm.mode` is set to
`external` in [`arc-config.yml`][arc-config].

**Prerequisite**: Project documents defined — run [02_define-project.md][define-project] first.

---

## Step 1: Identify Your Tracker

Which external tracker does the team use?

- **Jira** — Atlassian's project tracker
- **Linear** — streamlined issue tracker
- **GitHub Issues** — built into the repository
- **GitLab Issues** — built into GitLab repos
- **Azure DevOps Work Items** — Microsoft's project management
- **Other** — any tool that tracks tasks and status

This is informational — it shapes the guidance in subsequent steps but doesn't generate
configuration. ARC's integration is tool-agnostic: extension points accept free-form
instructions that you write for your specific tracker.

---

## Step 2: Set Up Capture Routing

ARC's "leave it cleaner" rule ([DEV-RULES.ARC][dev-rules-arc] § Leave it cleaner) requires a
destination for deferred issues — work discovered during a task that can't be fixed inline.
With `pm.mode: external`, the natural destination is your tracker.

**Open** [`DEV-RULES.PROJECT.md`][dev-rules-project] and find the **Capture Routing** section.
Replace the placeholder with your routing rules.

**Think through:**

- Where should deferred bugs go? (e.g., "Create a GitHub Issue with the `bug` label")
- Where should feature ideas go? (e.g., "Add to the Linear backlog in project X")
- Where should tech debt go? (e.g., "Create a Jira ticket in the TECH project")
- Should different severity levels route differently?

**Example** (GitHub Issues):

```markdown
## Capture Routing

- **Bugs**: Create a GitHub Issue with the `bug` label and link to the relevant code
- **Feature ideas**: Create a GitHub Issue with the `enhancement` label
- **Tech debt**: Create a GitHub Issue with the `tech-debt` label
- **Urgent/blocking**: Flag in the current PR and create an issue — don't defer silently
```

**Example** (Jira):

```markdown
## Capture Routing

- **Bugs**: Create a Jira ticket in PROJ with type Bug, link to the file and line
- **Feature ideas**: Create a Jira ticket in PROJ with type Story in the Backlog
- **Tech debt**: Create a Jira ticket in PROJ with type Task, label `tech-debt`
```

---

## Step 3: Configure Workflow Extensions

ARC provides extension points at key workflow moments for syncing with your tracker. These
are configured in [`arc-extensions.md`][arc-extensions]. Each extension is optional — configure
the ones that add value for your workflow.

For background on how ARC and external trackers complement each other, see
[Team Coordination Strategy][team-coordination] § External Tracker Integration.

### post-task-completion

**What it does:** Fires after a task is marked `[x]` in the ARC task list.

**Why configure it:** Keeps your tracker's status in sync with actual completion. Without
this, task status lives only in ARC's markdown files — your tracker won't reflect progress.

**Think through:**

- Should every completed task update the tracker, or only tasks linked to tracker items?
- What status transition should happen? (e.g., "In Progress" -> "Done", "Move to Done column")
- Should a comment be added to the tracker item with completion details?

**Open** [`arc-extensions.md`][arc-extensions] § `post-task-completion` and replace the
placeholder with your sync steps.

### post-work-unit-activate

**What it does:** Fires after a work unit moves from backlog to active (branch created,
task list activated, status file written).

**Why configure it:** Keeps sprint boards or project dashboards current when new work begins.

**Think through:**

- Should activation create or update a tracker epic/story?
- Should it update a sprint board or project dashboard?
- Should team members be notified?

### post-work-unit-archive

**What it does:** Fires after a work unit is archived (tasks complete, branch merged).

**Why configure it:** Closes the loop — ensures tracker items are resolved when ARC work
finishes.

**Think through:**

- Should the corresponding epic/story be closed or moved to "Done"?
- Should project dashboards be updated?
- Should any summary be posted to the tracker?

---

## Step 4: Review Method Overrides (Optional)

Two ARC methods may benefit from tracker-specific customization. Review each and decide
whether the defaults work or whether an override is needed.

**Open** [`arc-methods.md`][arc-methods] to review these methods.

### commit-context-format

ARC's default `Context:` footer references ARC task lists. If your team's convention
includes tracker references in commits (e.g., `PROJ-123`, `#42`), you can override the
context footer format to include them.

**Think through:**

- Does your team require ticket references in commit messages?
- Should the ARC context footer include tracker IDs alongside (or instead of) task list
  references?
- Does your CI/CD use commit message patterns for tracker integration?

**If the defaults work:** Skip — no override needed. Most teams find that ARC's task list
references and the tracker coexist without conflict.

### issue-triage

ARC's default issue triage routes deferred items based on severity (minor/moderate/major).
If your tracker should be the primary destination for deferred items (rather than ARC's
built-in capture surfaces), override the triage routing.

**Think through:**

- Should moderate and major issues create tracker items directly?
- Should the severity assessment change based on your team's triage process?

**If the defaults work:** Skip — capture routing (Step 2) already defines where deferred
items go. The issue-triage method controls *when* to defer; capture routing controls *where*.

---

## Summary

After completing this workflow, you should have configured:

1. **Capture routing** in DEV-RULES.PROJECT — where deferred issues are sent
2. **Extension points** in arc-extensions.md — how ARC workflows sync with your tracker
   (whichever extensions are useful for your workflow)
3. **Method overrides** in arc-methods.md — tracker-specific commit format or triage
   rules (if defaults don't fit)

For ongoing reference on how ARC and external trackers work together, see the
[Team Coordination Strategy][team-coordination] § External Tracker Integration.

---

[define-project]: 02_define-project.md
[arc-config]: ../../../system/arc-config.yml
[arc-extensions]: ../../arc-extensions.md
[arc-methods]: ../../arc-methods.md
[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
[dev-rules-project]: ../../../../reference/constitution/DEV-RULES.PROJECT.md
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md

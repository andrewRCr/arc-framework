# Workflow: Initialize ARC

**Audience:** Collaborative — developer and agent verify setup together.

**Purpose**: Verify that ARC framework initialization completed successfully, and provide
context on the configuration choices made during `arc init`. This workflow is a post-init
safety guard, not the init process itself.

**When to use**:

- After running `arc init` for the first time
- When onboarding a new team member to an existing ARC project
- When verifying ARC setup is intact after major changes

---

## Verify Initialization

Before proceeding to project definition, confirm that `arc init` ran successfully.

### Check ARC Configuration

The init process creates `.arc/system/arc-config.yml` with your project's settings.
Verify it exists and review the values:

**Base branch** (`base_branch`): The primary integration branch. All planned work branches
are created from and merged back to this branch. Default: `main`.

**Branch protection** (`branch_protection`): Determines what work requires branches and PRs.

| Mode                              | Planned Work      | Atomic Tasks / Backlog | Best For                           |
|-----------------------------------|-------------------|------------------------|------------------------------------|
| **Unprotected**                   | Branches optional | Commit directly        | Solo prototyping, max speed        |
| **Partially protected** (default) | Branches required | Commit directly        | Solo or small team, balanced       |
| **Fully protected**               | Branches required | Micro-branches         | Teams with CI/CD and review gates  |

Start with **partially protected** unless you have a specific reason for another mode.
See [Work Organization Strategy][work-org] for detailed mode descriptions and the full
decision matrix.

### Check Directory Structure

Verify the `.arc/` directory was created with the expected structure:

- `active/` — Current work tracking (WORK-STATUS, task lists)
- `backlog/` — Future work pipeline (ROADMAP, backlogs, TASK-INBOX)
- `reference/` — Constitutional documents, strategies, ADRs
- `system/` — Agent configs, workflows, githooks, settings

### Check Agent Configuration

Confirm that agent-specific directories were created for your selected agents
(e.g., `.claude/`, `.codex/`, `.gemini/`). Each contains pre-built skills, slash
commands, and settings for that agent platform.

---

## Next Step

Once initialization is verified, proceed to
[02_define-project.md](02_define-project.md) to establish your project's identity
and planning documents.

---

[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md

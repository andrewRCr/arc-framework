---
purpose: Add a new AI agent to a project that already has ARC installed and configured.
audience: collaborative (human and agent)
---

# Workflow: Add Agent to Existing ARC Project

**When to use:**

- A developer wants to use a new agent in a project that was initialized with different tools
- An agent is pointed at this file because it doesn't have ARC skills yet

**Not for:** Initial setup (use `arc init`), or adding a new developer to an existing ARC
project (use `arc join`).

---

## Steps

### Step 1: Orient (Agent)

If you are an AI agent reading this, start by reading these two documents in full — they explain
what ARC is and how this project uses it:

1. `.arc/reference/briefs/AGENT-BRIEF.ARC.md` — ARC framework orientation
2. `.arc/reference/briefs/AGENT-BRIEF.PROJECT.md` — Project-specific context

### Step 2: Generate Skill Files

ARC uses skills to trigger key workflows — session resume, commit, handoff, etc. Canonical
skill definitions live in `.arc/system/.internal/skills/`. Each subdirectory contains a `SKILL.md` with
the skill's name, description, and instructions.

**Identify your skill directory:**

Determine where your agent discovers skills. This is your agent's convention — you know what
directories you scan. If a suitable directory already exists in the repo (check `.agents/skills/`
and any tool-specific directories), use it. If not, create the directory your agent expects.

**Copy skills:**

For each subdirectory in `.arc/system/.internal/skills/` (e.g., `arc-resume/`, `arc-commit/`):

1. Read the canonical `SKILL.md`
2. Create the matching subdirectory in your skill location (e.g., `{your-skill-dir}/arc-resume/`)
3. Copy the `SKILL.md` content — these are agent-agnostic by design

**Gitignore the generated skills:**

The generated `arc-*` skill subdirectories are deterministic copies of the canonical sources —
they can be regenerated and don't need to be tracked in git. Add a gitignore pattern for the
specific ARC skill subdirectories you created:

```text
{your-skill-dir}/arc-*/
```

This ignores only the ARC-generated skills, not other content in your agent's directory.

### Step 3: Restart and Resume

Skill files are typically loaded when the agent's harness starts. After creating skill files:

1. **Restart your agent** (or reload the workspace/session) so it discovers the new skills
2. **Run the `arc-resume` skill** to initialize a normal ARC session
3. From this point, the agent operates like any other — session init loads context, workflows
   guide execution, session handoff preserves state

---

**After this workflow:** The agent has full ARC integration — skill files and access to all ARC
workflows. Subsequent sessions use `arc-resume` normally.

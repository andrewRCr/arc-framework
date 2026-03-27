# Notes: Beta Readiness

Task-adjacent reference material for `tasks-beta-readiness.md`.

---

## Phase 6B: `--reconfigure` Design Reference

**Referenced by:** Task 6B.1–6B.6

### Problem Statement

`arc init` stores `install_config` in the manifest at init time. `arc update` reads only
from the manifest, never from live `arc-config.yml`. This means:

1. Editing structural values in `arc-config.yml` gets **overwritten** on next update
2. Files conditionally excluded at init time can never be installed via update
3. `arc init` hard-blocks with `ALREADY_INSTALLED` — no re-entry path
4. Documentation references `--reconfigure` which doesn't exist

**Non-structural settings** (enforcement, hooks, methods) are fine — git hooks read
`arc-config.yml` at runtime via `arc_config_get`. The gap is specifically with
`install_config` values that gate file presence or conditional content.

### Command Surface

Symmetric `--reconfigure` flag:

|                          | First time | Change config            |
|--------------------------|------------|--------------------------|
| **Project** (maintainer) | `arc init` | `arc init --reconfigure` |
| **Personal** (any dev)   | `arc join` | `arc join --reconfigure` |

**`init --reconfigure`** — project-level. Re-prompts for structural settings, updates
manifest, resolves new file list, installs additions, handles removals with interactive
prompts, updates pristine store.

**`join --reconfigure`** — personal. Re-prompts for role and tools. Updates git config,
regenerates skills. Idempotent on hooks/gitignore.

**Why a flag, not a separate command:** Discoverable ("I want to change my init choices" →
`arc init --help`). Same prompts, different entry condition. Symmetric with join.

**Why not "just re-run the command":** Explicit intent. The user is telling the tool "I know
I've already done this, I want to change my choices." Avoids the tool having to silently
detect-and-branch, and avoids UX ambiguity about whether re-running is safe.

### Scope of `init --reconfigure`

**In scope (structural settings from `install_config`):**

| Setting        | Change effect                                 | File impact       |
|----------------|-----------------------------------------------|-------------------|
| `pm_mode`      | Adds/removes arc-in-git layer files           | ~6 files          |
| `team_mode`    | Changes conditional content in existing files | Content re-render |
| `project_name` | Re-renders token substitutions                | Content re-render |

**Out of scope:**

- **`tools`** — handled by the add-agent workflow (`add-agent.md`). Add-agent is deliberately
  decoupled from init/manifest because new agents emerge over time and the workflow handles
  unknown future agents. The manifest's `tools` list is a bootstrapping convenience for
  day-one setup, not a structural gate.
- **Enforcement settings** (`commit.format`, `hooks.*`, etc.) — propagate automatically when
  the user edits `arc-config.yml`. Hooks read config at runtime.
- **Method overrides** — edited directly in `arc-methods.md`. No CLI involvement.

### File Removal UX (Two-Stage, Classification-Driven)

When reconfigure removes a condition that previously included files (e.g., `pm_mode:
arc-in-git` to `none`), the user decides what happens to those files.

**Stage 1 — Summary with bulk options:**

```text
Reconfiguring pm.mode: arc-in-git → none

6 files are no longer needed by ARC. These were part of arc-in-git
project management — ARC will stop managing them regardless of your
choice here. You're free to keep any for your own reference.

  .arc/active/ROADMAP.md                    (your content)
  .arc/active/PROJECT-STATUS.md             (your content)
  .arc/backlog/backlog-bugs.md              (your content)
  .arc/backlog/backlog-enhancements.md      (your content)
  .arc/reference/strategies/arc/...         (framework-managed)
  .arc/system/workflows/arc/...             (framework-managed)

  Remove all 6 files? (y = remove all / n = keep all / c = choose individually)
```

**Stage 2 — Per-file prompts (if user selects `c`):**

Classification drives defaults — framework-managed files default to remove,
user-content files default to keep.

**Kept files:** Removed from the manifest. They become untracked user files that ARC no
longer manages or updates. Clean separation — the file is yours now.

**Non-interactive mode (`--yes`):** Keep all Scaffolded (user content), remove all Framework
(auto-generated). Configurable files follow their classification's closer analogy (most are
closer to Framework for arc-in-git layer files).

### File Additions

When reconfigure adds a condition (e.g., `pm_mode: none` to `arc-in-git`), new files are
rendered from templates and installed. Both manifest and pristine store are updated, so
subsequent `arc update` calls manage these files normally. Same render pipeline as init,
just for the delta.

### Content Re-rendering

When `team_mode` or `project_name` changes, existing files with template conditionals or
token substitutions need re-rendering. This follows the same three-way merge logic as
`arc update` — pristine baseline (old render) vs. new render vs. user's current file.

### Role Gating

**`init --reconfigure`** requires `arc.role = maintainer` (or unset, defaulting to
maintainer). Contributors don't manage ARC project-level artifacts.

```text
Only maintainers can reconfigure project settings.
Your role: contributor (arc.role)
To change project configuration, ask a maintainer to run this command.
```

**`join --reconfigure`** — any role. Personal workspace reconfiguration.

### Team Mode Awareness

When `team.mode: true` and a maintainer runs `init --reconfigure`:

```text
This project has team mode enabled. Configuration changes affect
all developers when committed.
```

Informational, not a gate. ARC informs; team governance is not ARC's territory.

### Team Mechanics

- **Stale join after reconfigure:** Clean. Join reads live config, not manifest. No action
  needed for other developers after someone reconfigures.
- **Concurrent reconfigure:** Merge conflict on manifest.json. Git handles it. Edge case,
  no special handling needed.
- **Reconfigure before team members pull:** Files change on disk. Normal git workflow — pull
  brings the changes. No ARC-specific coordination needed.

### Interaction with `arc update`

After reconfigure updates `manifest.install_config`, subsequent `arc update` calls use the
new config to resolve the file list. This is the key invariant — reconfigure is a one-time
state transition that puts the manifest in sync with the user's intent. Update continues
to work as before, now with the correct config.

### Implementation Constraints

**Dry-run / preview mode:** `init --reconfigure --dry-run` shows what would change without
applying. Lists files that would be added, removed, and re-rendered. Low implementation cost
(resolve the new file list, diff against current manifest, report).

**Atomicity and crash recovery:** Operation order:

1. Read current manifest and resolve new file list
2. Render new/changed files to disk
3. Handle removals (per user choices)
4. Write manifest and pristine store last (using `atomicWriteJson`)

If crash occurs before step 4, manifest still reflects old state. Re-running reconfigure
produces the same diff and the user can proceed.

**Idempotency:** Running reconfigure twice with identical choices is a no-op. The file list
diff against the current manifest produces an empty delta. Report "nothing to change" and
exit.

**Pristine store handling:**

- **Added files:** New pristine entries (same as init)
- **Removed files:** Remove entries from pristine.json — no orphaned pristine data
- **Re-rendered files:** Update pristine baseline to new render (enables correct three-way
  merge on subsequent `arc update`)

### Resolved Design Decisions

1. **Settings screen, not init replay.** Show current values, let user change what they want.
   Confirmed by Yeoman's `.yo-rc.json` pattern (store previous answers as defaults).
2. **`tools` handled by add-agent, not reconfigure.** Add-agent workflow covers future unknown
   agents and decouples agent addition from project-level config.

### External Research Summary

Industry patterns that informed this design:

- **Terraform `init --reconfigure`** — safe re-run by default, explicit flag for state
  changes. Closest model to our approach.
- **Yeoman** — per-file conflict resolution with virtual FS. Informed our removal UX.
- **Angular schematics** — virtual file system stages changes before disk writes.
- **npm init** — additive merge, safe re-run. Informed "safe by default" principle.
- **ESLint init** — silent overwrite. Anti-pattern we're avoiding.

**Validation round (targeted):** Flag-on-command approach confirmed (Terraform precedent).
Settings screen confirmed (Yeoman `.yo-rc.json`). Two-stage removal confirmed. Role-gating
is unusual for scaffolding CLIs but natural given ARC's existing role concept. No red flags.
Key additions from validation: dry-run flag, atomic write ordering, idempotency requirement.

### Strategy Doc Realignment (Task 6B.5)

`strategy-configurability-architecture.md` needs updates:

- Expand from "pm.mode is structural" to documenting the full structural/runtime distinction
- Replace the single `--reconfigure` mention with proper documentation of the command
- Document what reconfigure does and doesn't cover
- Clarify that `tools` changes go through add-agent, not reconfigure
- Add the command landscape (init / join / update / reconfigure) as a clear reference

### Discoverability Audit (Task 6B.5)

Once the command surface is finalized, a pass across all docs to ensure clear signposting:

- `--help` text pointing to related commands
- Error messages as navigation (ALREADY_INSTALLED already does this well)
- add-agent workflow not referencing reconfigure for tool changes
- AGENT-BRIEFING, QUICK-REFERENCE covering paths an agent might need
- No dead ends or confusion about which command to use when

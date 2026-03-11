# ADR-012: Adopt Unified User Directory Model

## Status

Proposed

## Context

ARC's personal workspace files — SESSION-NOTES.md and ATOMIC-TASKS.md — currently use different paths depending on
whether team mode is active. In solo mode, both live in `active/` alongside WORK-STATUS.md and work unit directories.
In team mode, they move to `team/{name}/` per-developer directories. This creates two code paths through every layer
that touches these files: CLI initialization, `arc update`, session-init workflow, session-handoff workflow,
process-task-loop incidental routing, and documentation tables throughout strategies and ADRs.

Scenario analysis of the current design surfaced several friction points beyond the dual code path:

**ATOMIC-TASKS.md specific issues:**

- **Naming collision.** The term "atomic tasks" refers to both the standalone capture file (arc-in-git only,
  project-wide) and the "Atomic Tasks — {name}" section in every task list (Core, WU-scoped). The file and section
  serve different purposes — global capture vs. WU-domain off-plan work — but share a name.
- **Completion archive merge conflicts.** The `completed-atomic-{quarter}.md` file is shared across team members.
  Parallel atomic task completions cause merge conflicts (both inserting at the top of the same file). Trivial to
  resolve but frequent in active teams.
- **Documentation inconsistency.** The backlog organization strategy states "atomic tasks aren't archived (deleted
  after completion) — the commit message IS the record." The ATOMIC-TASKS.md template describes a completion protocol
  that moves items to `completed-atomic-{quarter}.md`. Both can't be correct.
- **Cross-developer handoff.** Per-developer ATOMIC-TASKS.md means tasks are "owned" by the capturer. If another team
  member wants to pick up a captured task, they must edit someone else's personal file — a soft ownership violation.
- **Completion ceremony overhead.** The protocol (mark complete, add outcome/files/branch metadata, move to archive
  file) is substantial for tasks defined as small and ready-to-execute.

**Structural issues:**

- **`active/` directory clutter.** In solo mode, `active/` contains WORK-STATUS.md, SESSION-NOTES.md,
  ATOMIC-TASKS.md, and work unit directories. Personal files mixed with shared project state makes the directory
  noisier than necessary — relevant because `active/` is typically expanded in the editor's file explorer.
- **Solo-to-team migration.** Switching from solo to team mode requires migrating files from `active/` to
  `team/{name}/`. No `reconfigure` command exists (post-beta scope). The dual-path model makes this transition a
  manual restructuring.
- **Identity fragmentation.** ADR-007 introduced `git config arc.session.identity` for session notes namespacing. The
  `team/` directory uses a developer name. These could diverge.

**Alternatives considered:**

1. **Keep current dual-path model, fix edges only.** Address naming, archive conflicts, and documentation
   inconsistency without structural change. Lower effort but preserves the dual code path through all layers.
2. **Unified user directory model.** Always use a per-identity directory, regardless of solo/team mode. One code path,
   one identity source, personal files separated from shared state.
3. **Eliminate standalone capture file entirely.** Rely on task list sections plus backlog files. Removes the file but
   loses the "quick capture, process later" workflow.

## Decision

### Part 1: Unified User Directory

We will replace the solo/team path split with a single `user/{identity}/` directory that exists in all configurations.
Personal workspace files always live at `.arc/user/{identity}/`, whether the project has one developer or twenty.

**Directory structure (all modes):**

```text
.arc/
  active/
    WORK-STATUS.md              # Branch-scoped, tracked, shared
    {category}/tasks-*.md       # Work unit task lists
  user/
    README.md                   # Tracked — explains the personal workspace concept
    {identity}/                 # Gitignored — personal workspace
      SESSION-NOTES.md          # Session context (all modes)
      ATOMIC-INBOX.md           # Task capture (arc-in-git only)
      ...                       # Freeform personal files
  backlog/                      # arc-in-git only
  reference/                    # Strategies, ADRs, archive
```

**Gitignore by default.** The `user/{identity}/` directory contents are gitignored. `user/README.md` is the one
tracked file establishing the directory structure. This makes the user directory a freeform personal workspace — no
commit ceremony for captures, session notes, scratch files, or any other personal content. The tracked/shared boundary
is at `active/` (WORK-STATUS.md, task lists) and `backlog/` — not inside the user directory.

**Adding team members** is creating a new `user/{name}/` directory — no file migration, no structural change. The
solo-to-team transition becomes trivial.

**Identity resolution.** A single git config key — `git config arc.identity` — is the canonical identity source. This
consolidates ADR-007's `arc.session.identity` into one key used for both directory naming and git notes refs.

Resolution chain: `git config arc.identity` → slugified `git config user.name` → prompt at `arc init`.

`arc init` prompts: "What name should we use for your personal workspace?" → stores in `git config --local
arc.identity`. The prompt communicates the purpose; the stored value is used for directory creation, git notes refs,
and session tracking.

### Part 2: Rename and Redefine Atomic Capture Mechanism

We will rename `ATOMIC-TASKS.md` to `ATOMIC-INBOX.md` and redefine it as a personal, gitignored capture bucket.

**Name change rationale.** "Inbox" communicates the correct semantics — items arrive, get processed out, and don't
live here permanently. It disambiguates from the task list "Atomic Tasks — {name}" section (WU-scoped, Core) while
maintaining the "atomic" qualifier that signals item size/nature. The task list section name is unchanged.

**Gitignored by design.** As part of the user directory (Part 1), ATOMIC-INBOX.md is not tracked in git. Captures
are zero-friction local edits — no staging, no commits, no branch-scoped lifecycle. Items that need shared visibility
are promoted to backlog files (tracked) through the inbox review workflow (Part 4).

**Eliminate `completed-atomic-{quarter}.md`.** The completion archive is removed entirely. The commit context footer
— `Context: {category} (atomic / no associated task list)` — is the canonical completion record, enforced by the
commit-msg hook. This resolves the documentation inconsistency between the backlog organization strategy and the
template, eliminates merge conflicts on the shared archive file, and reduces completion ceremony.

**`arc log --atomic` CLI subcommand.** A thin wrapper over `git log --grep="(atomic / no associated task list)"` that
provides browsable history of all completed atomic work from the commit record — regardless of whether the work
originated from the inbox or was done directly. Included in WU3 scope alongside other CLI subcommands.

**Relationship to backlog.** The inbox and backlog serve distinct roles in the capture-to-execution pipeline:

- **ATOMIC-INBOX.md** — "I could do this right now if I had time." Small, self-contained, ready to execute. Personal
  capture, gitignored.
- **`backlog/` files** — "This needs breakdown or planning before anyone can execute." Shared, tracked, project-level.

Items graduate from inbox to backlog when they turn out to be larger than expected. This is directional — inbox →
backlog → active — and the inbox review step (Part 4) is the primary triage point.

### Part 3: User Directory Portability via Git Notes

We will extend the git notes portability mechanism (ADR-007 Parts 2–3) from session-notes-only to the entire user
directory. A single git notes ref — `refs/notes/arc/user/{identity}` — stores serialized user directory contents.

**CLI surface:**

- `arc user save` — serialize user directory contents to a git note on HEAD
- `arc user load` — restore user directory from git note (on HEAD, walking ancestors if needed)
- `arc user push` — push notes ref to remote
- `arc user pull` — fetch notes ref from remote
- `arc sync` — sugar for save + push (or pull + load, context-dependent)

Session workflows call these internally: session handoff triggers save + push; session init triggers pull + load.

**Push policy.** `user.sync_push` in `arc-config.yml` (replaces `session.notes_push`):

- `always` — solo default. Auto-push after save, no friction.
- `prompt` — team default. Conscious choice per handoff.
- `manual` — full control.

Per-developer override via `git config arc.sync_push`.

**Scope benefit.** Any file in the user directory — session notes, inbox items, personal scratch notes — travels with
the developer across machines through one mechanism. New file types added to the user directory are automatically
included without additional plumbing.

### Part 4: Inbox Review Lifecycle

We will add an inbox review step to the integrate-work-unit workflow, positioned pre-merge alongside the existing
pre-merge diff review. This ensures captured items are triaged before the work unit closes, rather than accumulating
indefinitely.

**Trigger:** arc-in-git mode only. Skipped if inbox is empty.

**Triage actions per item:**

- **Keep** — still relevant, still yours → leave in inbox
- **Do now** — small enough to complete before integration → execute, remove
- **Promote** — bigger than expected or shared concern → move to appropriate `BACKLOG-*.md`
- **Redirect** (team mode) — another domain or team member's area → promote to backlog with context note
- **Drop** — stale or no longer relevant → remove

**Cross-member transfer routes through backlog, not into another person's inbox.** Backlog files are the shared
visibility channel. Promoting an item to `BACKLOG-TECHNICAL.md` with a context note ("discovered during auth work —
affects payments module") makes it visible to the team without presuming on anyone's priorities. The inbox remains
personal space.

**Pre-merge positioning.** The review happens before PR creation as part of the integration checklist. Promoted items
are committed on the work unit branch (included in the PR). This makes the review harder to skip than a post-merge
optional step, and backlog updates land on the base branch the moment the PR merges.

## Consequences

### Positive

- **Single code path.** CLI init, `arc update`, session-init, session-handoff, and process-task-loop all resolve one
  path pattern (`user/{identity}/`) instead of conditional solo/team branching. Reduces implementation complexity and
  maintenance surface across all layers.
- **Zero-friction capture.** Gitignored inbox means capturing a task is a local file edit — no staging, committing,
  or branch lifecycle management. Lowers the barrier to capture, which is the mechanism's primary goal.
- **No merge conflicts on personal files.** Nothing in the user directory is tracked, so nothing conflicts. The
  completed-atomic archive (a shared-file merge conflict source) is eliminated entirely.
- **Frictionless scaling.** Adding a team member is creating a directory. No file migration, no structural changes,
  no reconfiguration.
- **Freeform personal workspace.** The user directory accommodates any personal files — scratch notes, reference
  links, investigation logs — without polluting git history or requiring framework support.
- **Cleaner `active/` directory.** Contains only WORK-STATUS.md and work unit directories — the shared, tracked
  project state. Personal files are separated into their own space.
- **Unified portability.** One git notes mechanism syncs all personal files across machines, replacing the
  session-notes-only design with a broader, future-proof approach.

### Negative

- **Solo developers see a seemingly unnecessary directory.** `user/andrew/` when there's only one developer. Mitigated
  by README explanation and the practical benefits (clean `active/`, freeform workspace).
- **Identity resolution always required.** Solo mode previously needed no identity. Now `arc init` always prompts (or
  defaults from git config). Minimal friction — one prompt, one time.
- **Loss of browsable completion archive.** `completed-atomic-{quarter}.md` provided a structured, scannable record
  of one-off work. Replaced by `arc log --atomic` (commit history search), which requires CLI tooling or git
  knowledge. The tradeoff is accepted: eliminating merge conflicts, ceremony, and documentation inconsistency
  outweighs the convenience of a browsable file.

### Risks

- **Gitignored inbox items can be lost.** Machine failure, disk loss, or accidental deletion removes inbox items with
  no recovery path unless `arc sync` was used. Mitigated by: items are small and recallable by definition; truly
  important items belong in tracked backlog files; `user.sync_push: always` (solo default) provides automatic backup
  via git notes.
- **Git notes portability for broader content.** ADR-007 designed git notes for SESSION-NOTES.md (single file,
  write-once-read-once per session). Extending to the full user directory (potentially multiple files, accumulating
  content) changes the payload characteristics. Serialization format and note size need consideration during
  implementation.

### Supersedes

This ADR supersedes specific parts of earlier decisions:

- **ADR-007 Part 1** (file locations): Solo/team path split replaced by unified `user/{identity}/` model.
- **ADR-007 Parts 2–3** (git notes scope and push behavior): Broadened from session-notes-only to full user directory.
  Mechanism unchanged; scope expanded. `arc.session.identity` consolidated to `arc.identity`.
  `session.notes_push` consolidated to `user.sync_push`.
- **ADR-008** (ATOMIC-TASKS.md references): Per-developer `team/{name}/ATOMIC-TASKS.md` paths replaced by
  `user/{identity}/ATOMIC-INBOX.md`.
- **ADR-009 Part 2** (team file placement matrix): The orthogonal matrix's file placement column is simplified — all
  personal files use `user/{identity}/` regardless of team mode.

Unaffected: ADR-007 Part 4 (workflow integration steps — updated, not superseded), ADR-008 Part 7a (task list atomic
tasks section — unchanged), ADR-009 Part 1 (three PM modes — unchanged).

### Required Follow-Up

**Strategy documents:**

- `strategy-team-coordination.md` — Simplify solo/team workflow adaptations table to single path model. Update all
  `team/{name}/` references to `user/{identity}/`. Revise cross-member transfer guidance to route through backlog.
- `strategy-backlog-organization.md` — Update structure diagram (`ATOMIC-TASKS.md` → removed from `active/`, inbox
  concept referenced). Remove "deleted after completion" line (now the only model). Update commit context section.
  Remove `completed-atomic` references.
- `strategy-session-management.md` — Update file location references. Note broadened portability scope.
- `strategy-configurability-architecture.md` — Update convention inventory row for session state. Add
  `user.sync_push` (replacing `session.notes_push`). Note `arc.identity` consolidation.
- `strategy-work-organization.md` — Update `active/` directory contents. Remove `ATOMIC-TASKS.md` from active/
  listing.
- `strategy-file-classification.md` — Update inventory: remove `active/ATOMIC-TASKS.template.md` and
  `team/ATOMIC-TASKS.template.md`, add `user/ATOMIC-INBOX.template.md`. Rename `team/` entries to `user/`.
  Remove `completed-atomic` template entries.

**Workflow documents:**

- `session-init.md` — Single path for SESSION-NOTES.md loading (`user/{identity}/`). Remove solo/team branching.
  Add inbox item count to "no active work" orientation summary.
- `session-handoff.md` — Single path for SESSION-NOTES.md writing. Update `arc user save` integration.
- `integrate-work-unit.md` — Add pre-merge inbox review step (arc-in-git mode).
- `process-task-loop.md` — Update incidental work routing: `ATOMIC-TASKS.md` → `ATOMIC-INBOX.md`, path update to
  `user/{identity}/`.
- `arc-methods.md` — Update session-state method references. Add or update `user.sync_push` config reference.

**Template files:**

- Remove `active/ATOMIC-TASKS.template.md` and `team/ATOMIC-TASKS.template.md`
- Create `user/ATOMIC-INBOX.template.md`
- Rename `team/` directory to `user/` (README.md, SESSION-NOTES.template.md)
- Remove `completed-atomic-{quarter}.md` template (if one exists in `reference/archive/`)
- Update `active/WORK-STATUS.template.md` (remove team mode note about per-developer paths)
- Update `active/SESSION-NOTES.template.md` (remove team mode redirect note; this becomes the template in `user/`)

**Constitutional documents:**

- `DEV-RULES.ARC.md` — Update session state control section (file paths, `user.sync_push` reference)

**Active work (current WU3):**

- `prd-cli-implementation.md` — Update UC4 (team setup), P0 requirements 12, 14, 17-19 to reflect unified model.
  Update `arc session` → `arc user` / `arc sync` subcommand. Add `arc log --atomic`.
- `tasks-cli-implementation.md` — Update Phase 7 tasks (team mode, PM mode, session portability) to reflect unified
  model. Add `arc log --atomic` task. Adjust `arc session` → `arc user` subcommand scope.

**ADR status updates (partial supersession annotations):**

- ADR-007 status line: note Parts 1–3 superseded by ADR-012
- ADR-008 status line: note ATOMIC-TASKS.md path references superseded by ADR-012
- ADR-009 status line: note Part 2 file placement superseded by ADR-012

---

Context: tasks-cli-implementation.md (off-plan — architectural evaluation before Phase 2)

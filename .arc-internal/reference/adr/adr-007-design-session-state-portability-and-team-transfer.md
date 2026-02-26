# ADR-007: Design Session State Portability and Team Transfer

## Status

Accepted

## Context

ADR-002 established sessions as a first-class concept in ARC — bounded, intentional work periods with explicit
start and end states. It expanded P5 (Context Preservation) to include active quality management within sessions.
ADR-003 established the configuration and extension point system. Both decisions left a structural question open:
how does session state move across machine boundaries and developer boundaries?

ARC's `CURRENT-SESSION.md` carries two kinds of information with different sharing needs:

- **Project state** — current task, blockers, next action. Useful to anyone touching this branch. Already
  partially tracked elsewhere (task list checkboxes, git log, branch name), but the curated pointer — "here's
  exactly where we are and what's next" — is unique value.
- **Session context** — what the developer tried, what didn't work, which file has the tricky bit, qualitative
  notes they'd share in a five-minute walkthrough with a colleague taking over. Personal, narrative, and the
  hardest content to reconstruct from tracked artifacts alone.

`CURRENT-SESSION.md` is currently gitignored (correct instinct — the research evidence is unambiguous that
ephemeral state doesn't belong in VCS). But this means it doesn't travel between machines or team members.
Three scenarios expose the gap:

1. **Multi-machine solo developer.** A developer working on a desktop ends their session and wants to continue
   on a laptop. Project state is in git (task list, commits). Session context — the qualitative "where I was
   and what I was thinking" — is lost. This is a common scenario, and losing context at the machine boundary
   is a design failure.

2. **Team handoff.** Alice is handing work to Bob (vacation, rotation, specialization change). The project
   pointer transfers via task list and commit history. But the working context — decisions made, approaches
   tried and abandoned, known risks — transfers only through ad-hoc communication (Slack, meetings). No
   software development tool provides structured handoff; this is a genuinely unsolved problem in the industry.

3. **Team awareness.** Carlos wants to know what's happening on Alice's branch without taking it over. He needs
   the project pointer (current task, blockers), not Alice's personal session context. This is the well-solved
   case — task lists and commit history already provide it.

Neither git-tracking nor gitignoring the combined file is fully correct:

- **Git-tracking** creates a trailing "session update" commit after every real commit (session handoff assesses
  committed work, so it runs after commits). Accepting perpetual dirty state confuses session-init verification.
  Different machines and developers cause merge conflicts on a file that shouldn't need merging.
- **Gitignoring** loses the project pointer (no portability) and session context (no handoff mechanism). This is
  today's behavior — it works for solo, single-machine development and degrades everywhere else.

**Evidence base:**

Task 1.1 research (`research-session-lifecycle.md`) examined 9 pattern categories across development frameworks,
DevOps state management, collaboration tools, AI-assisted development, and high-reliability handoff ceremonies.
Key findings:

- **The sharing mechanism is never VCS.** Every mature pattern avoids putting ephemeral/local state in git —
  Terraform uses remote backends, dotenv gitignores instance files, IDE configs separate shared from personal,
  AI tool sessions are machine-local. VCS is for code and durable schemas.
- **The project-state / session-state decomposition is universally validated.** Every pattern separates shareable
  schema from local instance: `.env.example` (tracked) + `.env` (gitignored), `.editorconfig` (tracked) +
  personal IDE settings (gitignored), ConfigMap schemas (visible) + Secret values (encrypted). The hypothesis
  holds.
- **Handoff is solved in high-reliability fields, absent in dev tooling.** Medicine (SBAR, I-PASS), aviation
  (WEST, PRAWNS), military (Relief in Place), and SRE (On-Call Review) all formalize handoff with structured
  ceremonies. Software development has no equivalent — collaboration tools show status but don't systematize
  context transfer.
- **Status update and context transfer are different concerns.** SRE explicitly separates shift handoff
  (operational continuity) from on-call review (continuous improvement). Medical protocols distinguish patient
  status from care transfer. No software tool makes this distinction.
- **No AI coding tool has cross-machine session persistence.** Claude Code, Windsurf, Aider — all store session
  state locally with no cross-machine sync. Community workarounds (AI Context Bridge, Nucleus MCP) validate
  the problem space but don't provide a framework-level solution.

**Design constraints:**

- ARC is a documentation-only framework — no runtime services, no external dependencies beyond git
- The solution must work across ARC's three-tier agent compatibility model (ADR-002)
- Team coordination strategy documents shared branches as a first-class pattern — the design cannot assume
  one developer per branch
- Session state identity is per-developer, not per-branch or per-work-unit
- Graceful degradation is required — the mechanism must enhance but not create hard dependencies

## Decision

### Part 1: Two-File Decomposition

We will split session information into two files with different tracking models, replacing the single
`CURRENT-SESSION.md`.

**`WORK-STATUS.md`** — tracked in git. A lightweight project pointer (~6-8 lines) carrying factual,
branch-specific state:

- **Work Unit**: The conceptual work grouping (e.g., `auth-refactor`). Links to the work unit's artifacts
  (PRD, task list, notes) by convention. Provides the anchor when branch naming doesn't match the work unit.
- **Branch**: The current git branch. Technically redundant with `git branch`, but explicitly bridges
  work-unit-to-branch mapping in team scenarios where work units span multiple branches.
- **Task List**: Path to the active task list. Derivable from ARC's default context footer convention, but not
  all teams use that convention — the explicit pointer handles non-default configurations and external tracker
  integration.
- **Current Task**: Which task is active, with line number for direct navigation. Saves cross-referencing the
  task list, and handles out-of-order execution where "next unchecked" isn't "next to work on."
- **Blockers**: Anything preventing progress. Unique value — not tracked elsewhere.
- **Next Action**: Qualitative guidance on what comes next. Distinct from the task schedule — captures _intent_
  and _approach_, not just sequence.

`WORK-STATUS.md` is updated at commit time alongside task list changes — same commit, same atomic operation.
Because it updates _with_ commits rather than _after_ them, the tree stays clean. No trailing "session state"
commits.

**`SESSION.md`** — gitignored. Personal working context, scoped to the individual developer:

- Current focus and approach
- Decisions made and rationale
- Things tried and abandoned (and why)
- Key files, line numbers, known risks
- Notes for the next session

`SESSION.md` is narrative and qualitative — the content a developer would share in a five-minute walkthrough
if someone were taking over. It's as messy or structured as the developer needs. A recommended starting
structure (Current Focus / Approach & Context / For Next Session) provides consistency without rigidity.

**Why two files, not one:** The split follows the pattern validated across the software industry — tracked
schema with local instance. Project state changes at commit boundaries and is useful to anyone on the branch.
Session context is fluid, personal, and changes throughout a session as understanding evolves. Different
lifecycles, different audiences, different tracking models.

**File locations:**

- Solo: Both in `.arc/active/` (simple, adjacent to task list artifacts)
- Team: `WORK-STATUS.md` in `.arc/active/` (shared, one per branch). `SESSION.md` in `.arc/team/{member}/`
  (personal, one per developer). The team directory already houses per-developer configuration in ARC's team
  model.

`SESSION.md` is gitignored in both configurations. `WORK-STATUS.md` is tracked in both.

### Part 2: Git Notes for Session Context Portability

We will use git notes — metadata attached to commits within git's object model — as the portability mechanism
for `SESSION.md` content.

**Why git notes:**

Git notes have three properties that match the design requirements exactly:

1. **Local by default.** Notes aren't included in `git push` or `git fetch` unless explicitly requested. This
   is the correct privacy model — session context stays on the developer's machine unless they choose to share.
2. **No merge conflicts.** Notes are stored per-commit in a separate ref, not as tracked files. Two developers
   can have notes on different commits without conflicting.
3. **No extra commits.** Attaching a note doesn't create a new commit. Commit history stays clean — notes are
   metadata _about_ commits, not commits themselves.

**Per-developer note namespaces:**

Each developer uses a dedicated namespace under `refs/notes/arc/session/`:

```text
refs/notes/arc/session/andrew    ← Andrew's session notes
refs/notes/arc/session/alice     ← Alice's session notes
```

Per-developer namespaces prevent push conflicts entirely. Each developer pushes their own ref — independent of
other developers, independent of branch sharing patterns. To receive a handoff, the incoming developer fetches
the outgoing developer's namespace.

This maps naturally to ARC's team model: `.arc/team/{member}/SESSION.md` locally, `refs/notes/arc/session/{member}`
in git notes. Same identity key in both places.

**Core operations:**

```bash
# Save session context to the current commit
git notes --ref=arc/session/{identity} add -f -F {session-file} HEAD

# Load session context from the current commit
git notes --ref=arc/session/{identity} show HEAD > {session-file}

# Push notes to remote
git push origin refs/notes/arc/session/{identity}

# Pull notes from remote
git fetch origin refs/notes/arc/session/{identity}:refs/notes/arc/session/{identity}
```

Where `{identity}` is the developer's configured session identity, and `{session-file}` is the path to their
`SESSION.md`.

**Note format:** Raw markdown — the content of `SESSION.md` stored directly. Metadata (author, timestamp,
branch) is derivable from git itself: author from the namespace path, timestamp from the notes ref commit,
branch from the annotated commit's refs. Raw markdown is human-readable on `git notes show`, consistent with
ARC's documentation-only identity, and requires no parsing.

### Part 3: Configurable Push Behavior

Session note push behavior is a convention-level setting in `arc-config.yml`:

```yaml
# Session note push behavior on session end.
#   always - Push notes automatically (recommended for solo developers)
#   prompt - Ask before pushing (recommended for teams)
#   manual - Never push automatically; developer uses explicit command
session.notes_push: always
```

**Solo default (`always`):** A solo developer has no privacy concern — the notes are for themselves on another
machine. Automatic push removes friction without downside.

**Team default (`prompt`):** Team environments benefit from a conscious choice — the developer decides whether
their session context is worth sharing for this particular handoff. The session-handoff workflow prompts:
"Push session context for portability?"

**Manual option:** For developers who prefer full control or teams with specific sharing protocols.

### Part 4: Workflow Integration

**Session-init gains a session context loading step:**

1. Read `WORK-STATUS.md` for project orientation (replaces reading `CURRENT-SESSION.md`)
2. Check if `SESSION.md` exists locally
    - **If yes and matches current branch context:** Use it (resuming on same machine)
    - **If no, or stale:** Check for git notes on HEAD (then walk ancestors if no note on HEAD)
        - **If notes found:** Populate `SESSION.md`, announce provenance
        - **If no notes:** Start with clean template — graceful degradation

The ancestor-walk handles the case where HEAD advances past the noted commit (another developer pushes after
the note was saved). Session-init checks recent commits for notes rather than only checking HEAD exactly.

**Session-handoff gains a save-and-push step:**

1. Write `SESSION.md` with current context
2. Update `WORK-STATUS.md` with final project state (if not already current from last commit)
3. Save session context to git notes
4. Push per `session.notes_push` configuration (always, prompt, or manual)

**Commit workflow incorporates WORK-STATUS.md updates:**

`WORK-STATUS.md` updates are folded into work commits — when marking a task complete, update the task list
and `WORK-STATUS.md` in the same commit. This keeps the project pointer current without dedicated "session
state" commits.

**Branch rotation (`rotate-branch.md`, planned WU2):**

When a developer switches between branches (different work units or different phases of the same work unit),
the rotate-branch workflow is the natural handler for session context transitions:

- Save notes on the current branch before switching
- After checkout, session-init detects the stale `SESSION.md` (content references previous branch context)
  and loads notes from the new branch's HEAD

This is a WU2 implementation concern — the rotate-branch workflow (D6 in the WU2 plan) should incorporate
session note save/load as part of the branch transition ceremony.

**Note cleanup on archival:**

When a branch is merged and its task list archived, the archival workflow automatically removes associated
session notes. Notes on old commits are harmless (small text blobs) but cleaning up is more intentional than
accumulating stale metadata. Cleanup command: `git notes --ref=arc/session/{identity} remove <commit>`.

### Part 5: Setup and Tooling

**One-time setup (part of `arc-init`, planned WU3):**

1. Configure session identity: `git config arc.session.identity {name}` (per-developer, stored in local git config
   rather than `arc-config.yml` — see `strategy-configurability-architecture.md` § Config scope)
2. Add notes fetch refspec: `git config --add remote.origin.fetch "+refs/notes/arc/session/*:refs/notes/arc/session/*"`
3. Add `.arc/active/SESSION.md` (and `.arc/team/*/SESSION.md` for team config) to `.gitignore`

After setup, `git fetch` and `git pull` automatically include session notes. No explicit fetch commands needed
for routine use.

**Helper script:**

ARC ships a helper script in `.arc/system/scripts/` wrapping the git notes commands. The script provides
clear command names (`arc-session save`, `arc-session load`, `arc-session push`, `arc-session pull`) that
abstract the unfamiliar git notes syntax. The script is thin (~30 lines), wrapping stable git commands — low
maintenance burden.

Teams may also install git aliases for the same operations. The `arc-init` flow offers both options.

### Part 6: Graceful Degradation

The design is structured so that every component enhances but none creates hard dependencies:

| Component fails                   | Impact                                   | Fallback                                                                                                 |
| --------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Developer forgets to push notes   | Session context lost for this transition | WORK-STATUS.md still provides project pointer; session-init reconstructs from tracked artifacts          |
| Rebase orphans notes              | Note association lost on rebased commits | WORK-STATUS.md unaffected; developer can `git notes copy` manually or start fresh                        |
| Git hosting doesn't display notes | Notes invisible in web UI                | WORK-STATUS.md (regular tracked file) visible everywhere; notes serve CLI portability, not web awareness |
| Team skips session notes entirely | No session context portability           | Equivalent to today's behavior — no regression                                                           |
| `arc-session` helper unavailable  | Convenience commands unavailable         | Raw git notes commands documented in workflow; fully functional without helper                           |

This degradation model means teams can adopt session portability incrementally — use WORK-STATUS.md immediately
(just a tracked file), add notes when ready, automate with helper script when convenient.

## Consequences

### Positive

- **Session state portability is solved without external infrastructure.** Git notes are part of git's object
  model — no external services, no runtime dependencies, consistent with ARC's documentation-only identity.
  The mechanism is git-native, available everywhere git is available.
- **The project-state / session-state decomposition is formalized.** The split from a single conflated file
  into tracked pointer + gitignored context resolves the fundamental tension: project state travels with git
  automatically, session context travels on demand via notes. Different lifecycles, different mechanisms.
- **Team handoff has a structured mechanism.** No software development tool currently provides structured
  session context transfer. ARC's ceremony (write SESSION.md, save to notes, push) is modeled on
  high-reliability handoff patterns (SBAR, On-Call Review) adapted for the development context. The
  handoff carries qualitative context — decisions, gotchas, approach notes — not just a task pointer.
- **Multi-machine solo development just works.** With `session.notes_push: always` (the solo default), session
  context auto-pushes on session end. On the new machine, session-init auto-loads from notes. No manual steps
  beyond the session ceremonies that already exist.
- **Privacy model is correct by default.** Notes are local unless pushed — same as session context being
  personal unless shared. The `session.notes_push` config makes sharing a conscious choice in team
  environments while removing friction for solo developers.
- **No regression for teams that don't adopt.** Teams that skip session notes entirely get today's behavior.
  WORK-STATUS.md (tracked) is independently useful — it provides the project pointer without requiring notes
  adoption. The feature is additive, not migration-dependent.
- **Awareness and handoff are distinguished.** WORK-STATUS.md serves the awareness use case (what's happening
  on this branch) — visible in git, browsable on GitHub. SESSION.md via notes serves the handoff use case (how
  do I continue this work) — available on demand, carries qualitative context. Different questions, different
  mechanisms, per the research finding that status update and context transfer are distinct concerns.

### Negative

- **Two files instead of one.** The split adds a file and requires both session-init and session-handoff to
  handle two artifacts. Workflow automation makes this largely transparent, but the concept ("why two files?")
  needs clear explanation in adoption documentation. Sensible defaults and automated ceremonies mitigate the
  friction, but it is more complex than a single file.
- **Git notes are unfamiliar.** Most developers have never used git notes. The helper script and aliases
  abstract the syntax, but the underlying mechanism is obscure. If something goes wrong (orphaned notes, push
  conflicts on mismatched refspecs), debugging requires git-notes-specific knowledge. Clear documentation and
  the graceful degradation model mitigate this — notes are an enhancement layer, and failure falls back to
  working behavior.
- **Per-developer namespaces add conceptual overhead.** `refs/notes/arc/session/{identity}` is more complex
  than a single ref. The complexity is justified (prevents push conflicts in team scenarios) but adds setup
  configuration (`arc.session.identity` in git config) and mental model overhead for understanding note isolation.
- **Setup is required.** The refspec configuration, session identity, and gitignore updates are one-time setup
  but are easy to forget or misconfigure. `arc-init` (WU3) should handle this automatically, but until that
  tooling exists, teams need to follow manual setup steps.
- **File classification update needed.** `CURRENT-SESSION.template.md` is currently classified as Scaffolded
  in `strategy-file-classification.md`. This decision replaces it with `WORK-STATUS.md` (Scaffolded — tracked,
  project-owned after init) and `SESSION.md` (gitignored, not framework-shipped as a tracked template). WU2
  must update the file classification inventory to reflect the new file structure.

### Risks

- **Rebase and notes.** Rebase changes commit hashes; notes attached to pre-rebase commits don't follow
  automatically. ARC's default merge strategy avoids this, and rebase is documented as an escape hatch
  (ADR-003) with accepted tradeoffs. But teams using rebase who also want session portability face a genuine
  limitation. `git notes copy` provides manual recovery but isn't automated. This is an acknowledged limitation,
  not something ARC tries to solve — rebase users already accept history-rewriting consequences.
- **HEAD advancing past noted commits.** In shared-branch scenarios, another developer's push advances HEAD
  past the noted commit. Session-init's ancestor-walk mitigates this (checking recent commits for notes), but
  the window exists where a developer fetches a branch with no note on HEAD and must walk back. The
  ancestor-walk depth and behavior need specification during WU2 workflow implementation.
- **Note accumulation on long-lived branches.** Each session-end saves a note; old notes persist on old commits.
  Automated cleanup on archival handles the branch lifecycle, but long-lived branches (e.g., a multi-month
  feature branch) accumulate notes over time. This is functionally harmless (notes are small text objects) but
  could confuse exploration of note history. Periodic cleanup guidance may be warranted for long-lived branches.
- **Refspec misconfiguration.** If the notes fetch refspec isn't configured, `git fetch` silently skips notes.
  Session-init loads from local files (if present) or starts clean — graceful degradation. But the developer
  may not realize notes aren't syncing. `arc-init` automation (WU3) and session-init diagnostics ("no notes
  found — is refspec configured?") can surface this.

---

Context: tasks-foundational-gap-closure.md (Task 1.2)

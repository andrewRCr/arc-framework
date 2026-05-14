# Research: Worktree Management Tool Convergence

**Purpose:** External research on emerging agent-workspace management tools to inform ARC's
worktree-trio design (Worktree Foundation, Agile WU Lifecycle, Concurrent Work Conventions).
Conducted as a pre-PRD pressure test against current trio scope, surfacing where the field
converges, diverges, and where ARC's existing design already accommodates field pain points.

**Date:** 2026-05-12

**Scope:** Findings are descriptive of field state. Design implications for ARC's plans are
captured separately in `temp-worktree-trio-design-deltas.md` (gitignored working artifact)
— they will be folded into the trio plans during a friction pass and will rot independently
of these findings.

---

## 1. Method and Limitations

### Method

Three parallel research passes via `external-research-analyst` agents using a uniform
15-question per-tool template plus per-cluster meta-synthesis. Brief required inline citation
of every specific claim, terse "Not documented" answers when docs were silent, and a
deduplicated sources list per agent. Cross-cluster synthesis composed from the three reports.

**Cluster split:**

- **Cluster 1 — Multi-purpose tools with retrofitted agent layer:** Zed (IDE), Warp (terminal,
  with Warp Oz cloud-orchestration layer), Worktrunk (CLI).
- **Cluster 2 — Established dedicated agent-management apps:** Conductor, emdash, Maestro.
- **Cluster 3 — Newer dedicated agent-management apps:** Super, Superset, T3code, Soloterm,
  Nora.

**Question template (per tool):**

1. Category — IDE / terminal / CLI / hosted GUI / standalone desktop / hybrid
2. Worktree mechanic — actual `git worktree`, virtualized FS, copy, container, sandbox
3. Storage location — sibling dir, `.worktrees/`, app-controlled, user-chosen
4. Branch naming — auto-generated, user-provided, agent-prompted; convention
5. Spawn surface — trigger, inputs, CLI/GUI
6. Cold-start context handoff — what does the agent receive in a fresh worktree
7. Per-workspace agent state — one agent per workspace, persistence, cross-workspace memory
8. Concurrency stance — N concurrent workspaces; single-focus discipline; cross-workspace UI
9. Lifecycle / cleanup — automated removal, abandonment, stale detection
10. Composability — `.git/worktrees` ownership; hooks; coexistence with external conventions
11. Within-workspace session continuity — agent state survives restarts; resume mechanism
12. Review surface — per-step gates, per-commit, end-of-work; built-in diff/comment UI
13. Merge & post-merge lifecycle — PR creation, branch push, post-merge cleanup, sibling resync
14. Multi-developer / async handoff — workspace state transfer, cross-machine resume
15. Explicit design opinions — positions the docs explicitly take

**Time-window guard:** 2024+ docs preferred; older sources only as explicit background.

**Out of scope by design:** pricing, model selection, UI aesthetics beyond workspace
management, market share, third-party comparative reviews, source-code deep dives.

### Limitations

**Effective N = 9 (of 11 nominally researched).**

- **Super (`super.engineering`)** — inaccessible. Search returned unrelated tools (Genesys
  workspace agents, SWE-agent, OpenAI Agents SDK) and a different product at `super.work`. The
  cited URL either has minimal public docs, has changed, or was a typo. No findings.
- **Soloterm (`soloterm.com`)** — scope-mismatched. Soloterm is a process/dev-stack manager
  (servers, queues, CLI agents lifecycle), not a git-worktree-based agent-workspace manager.
  Soloterm's docs explicitly distinguish themselves from a separate product also called
  "Conductor" (by Melty Labs, distinct from `conductor.build`). 15-question template not
  applicable.
- **T3code** — early-stage, self-described as "very very early." Many "Not documented" answers.
  Single-agent-focused (minimal GUI wrapping Codex), not multi-agent orchestration like
  Superset and Nora. Treat findings as weak signal.

**Cluster 3 effective N = 2 (Superset, Nora).** Cross-cluster convergence anchors on 9 tools
across IDE / terminal / CLI / desktop-app categories, which is sufficient for pattern
identification but worth noting when reading § 3 (Convergence).

**Source quality.** Cluster 1 (Zed, Warp, Worktrunk) and Cluster 2 (Conductor, emdash,
Maestro) produced confident, well-cited answers across most/all 15 questions. Cluster 3 had
several inferred answers and one WebFetch 403 (emdash docs URL — recovered via search results
and GitHub PRs). All inferences flagged inline by the agents.

**Not researched:** Visual Studio Code's emerging agent-workspace features (mentioned in
session as becoming a UI primitive but not in the explicit tool list); Cursor's agent panel
(intentional omission — covered by separate research thread); JetBrains agent integrations.
The 9 tools surveyed are a representative sample, not exhaustive.

---

## 2. Cluster Reports

### 2.1 Cluster 1 — Multi-Purpose Tools with Retrofitted Agent Layer

#### Zed

1. **Category**: IDE (source: <https://zed.dev/ai>)

2. **Worktree mechanic**: Actual `git worktree`; threads can optionally use "new Git worktrees
   to provide isolated checkouts" for tasks that might edit the same files, or share the
   current working copy. (source: <https://zed.dev/docs/ai/parallel-agents>)

3. **Storage location**: Not tool-controlled; users manage worktree paths via standard git.
   Zed's worktree trust system applies to "a directory or a single file that Zed opens as a
   standalone 'project'", implying worktrees live wherever users place them.
   (source: <https://zed.dev/docs/worktree-trust>)

4. **Branch naming**: User-provided (agent does not auto-generate). Branches are managed
   through Zed's "worktree picker (in the title bar)" which reflects standard Git branch
   names, with new worktrees optionally starting in detached HEAD state.
   (source: <https://zed.dev/docs/ai/parallel-agents>)

5. **Spawn surface**: Per-thread in the Threads Sidebar (`cmd-alt-j` / `ctrl-alt-j`). Users
   can "send a prompt, open a second thread, and give it a different task." New threads
   created via the agent panel UI; agent can create worktrees if told to.
   (source: <https://zed.dev/docs/ai/parallel-agents>)

6. **Cold-start context handoff**: Agents can consume explicit context via `@` mentions of
   files, directories, symbols, previous threads, rules files, and diagnostics. The docs
   emphasize "providing [context] explicitly improves response quality and reduces latency,"
   placing curation responsibility on the developer rather than automatic context capture.
   No documented primary-spec mechanism.
   (source: <https://zed.dev/docs/ai/agent-panel>)

7. **Per-workspace agent state**: One agent per thread; threads persist independently.
   Threads appear in Thread History and can be "restored at any time" across sessions,
   suggesting thread state survives restarts. However, docs don't explicitly detail
   workspace-state serialization beyond thread conversation history.
   (source: <https://zed.dev/docs/ai/agent-panel>)

8. **Concurrency stance**: Multiple agent threads encouraged and tested at scale ("hundreds
   of threads" maintained at 120fps). The Threads Sidebar groups threads by project. Design
   philosophy: "decide per thread which folders and repositories agents can access."
   (source: <https://zed.dev/docs/ai/parallel-agents>,
   <https://zed.dev/blog/parallel-agents>)

9. **Lifecycle / cleanup**: Not documented. Standard git worktree removal presumably applies.
   Zed does not appear to provide automated post-merge cleanup of worktrees.

10. **Composability**: Zed respects `.zed/settings.json` project config (with trust gates),
    supports MCP servers, and uses rules files for agent instruction injection. Worktree trust
    is a first-class security boundary; single-file worktrees and directory worktrees require
    separate trust approval. Design explicitly positions worktrees as "one of the cleanest
    isolation boundaries for parallel development" in agentic workflows.
    (source: <https://zed.dev/docs/worktree-trust>, <https://zed.dev/blog/secure-by-default>)

11. **Within-workspace session continuity**: Thread conversation history persists across
    sessions; threads can be restored from Thread History. No documented scratchpad or
    plan-document persistence beyond chat. (source: <https://zed.dev/docs/ai/agent-panel>)

12. **Review surface**: Not documented for Zed's own agent. Community discussions mention
    requests for "support for PR reviews inside the editor" and "pull request review,
    comment, and approve," but these appear to be feature requests rather than implemented
    capabilities. External agents (Gemini, Claude Agent, Codex) inherit their own
    review/approval models. (source: <https://github.com/zed-industries/zed>)

13. **Merge & post-merge lifecycle**: Not documented. Users review diffs and "merge through
    standard Git workflows" after agent work completes, with no tooling for automated PR
    creation, branch push, or post-merge resync.
    (source: <https://zed.dev/docs/ai/parallel-agents>)

14. **Multi-developer / async handoff**: Not documented. Zed's collaboration features center
    on real-time peer co-editing and remote development (SSH), not asynchronous workspace
    handoff. (source: <https://zed.dev/docs/remote-development>)

15. **Explicit design opinions**: Zed is explicit about (a) worktree-centric isolation:
    "worktrees are part of Zed's core workspace/git/agent model... Zed lets you make [a]
    choice per thread" whether to use shared or isolated checkouts
    (source: <https://zed.dev/blog/parallel-agents>); (b) developer-curated context: "Zed
    doesn't index... In the agent panel, agents can search the codebase, but explicit context
    improves response quality and latency, putting the developer in charge of curation";
    (c) security-by-default: "Zed will be designed, where feasible, to be secure
    out-of-the-box without requiring additional user intervention"
    (source: <https://zed.dev/blog/secure-by-default>).

#### Warp

1. **Category**: Hybrid — terminal + cloud-orchestrated agent platform. Local Warp Terminal
   is an IDE-style terminal with integrated editor; Oz is Warp's cloud orchestration layer.
   (source: <https://www.warp.dev/>, <https://www.warp.dev/oz>)

2. **Worktree mechanic**: Not documented. Warp's primary abstraction is "containers" for
   cloud agents (Docker images + Git repos + start commands) and "panes" for local agents.
   No mention of `git worktree` mechanics; cloud agents run in "isolated Docker containers"
   and agents are "completely isolated from each other."
   (source: <https://docs.warp.dev/agent-platform/cloud-agents/overview/>,
   <https://docs.warp.dev/agent-platform/cloud-agents/platform/>)

3. **Storage location**: Cloud agents: app-controlled (Docker containers + repos specified
   at setup). Local agents: not applicable (terminal sessions, not persistent worktrees). No
   `.worktrees/` or user-chosen path mechanism documented.
   (source: <https://docs.warp.dev/agent-platform/cloud-agents/overview/>)

4. **Branch naming**: Not documented. For cloud agents, "as the developer, you decide how
   agents should branch, coordinate, and resolve conflicts," but no default convention
   specified. (source: <https://docs.warp.dev/agent-platform/cloud-agents/overview/>)

5. **Spawn surface**: Cloud agents: triggered by events (webhooks, CI, Slack messages, cron
   schedules) or via Warp web dashboard / desktop app / mobile. Local agents: spawned via
   terminal CLI ("Agent Mode") in Warp Terminal or multiple agents in parallel across panes.
   (source: <https://docs.warp.dev/agent-platform/cloud-agents/platform/>,
   <https://docs.warp.dev/agent-platform/cloud-agents/overview/>)

6. **Cold-start context handoff**: Cloud agents receive "Inputs: A prompt plus context from
   triggering systems" and an "Execution context" defining repo, image, and startup commands.
   Warp Drive provides "Codebase Context for semantic code understanding" as a default
   feature. No documented "primary spec" mechanism; context appears event-driven (Slack
   message, webhook payload, schedule) rather than spec-doc-based.
   (source: <https://docs.warp.dev/agent-platform/cloud-agents/overview/>)

7. **Per-workspace agent state**: Local agents: terminal session (not persistent across
   restarts unless explicitly saved). Cloud agents: "Session transcripts for post-execution
   review" and persistent records; "Session sharing" allows team members to "monitor or steer
   running tasks," implying live state visibility during execution. Cross-session resumption
   not documented. (source: <https://docs.warp.dev/agent-platform/cloud-agents/overview/>,
   <https://docs.warp.dev/knowledge-and-collaboration/session-sharing>)

8. **Concurrency stance**: Both local and cloud agents support parallelism. Local:
   "developers can run multiple agents simultaneously across panes." Cloud: "run multiple
   concurrent tasks rather than single local operations" is a recommended use case. No
   single-focus discipline enforced. "Agent Management Panel provides centralized monitoring
   of all AI agent progress." (source: <https://docs.warp.dev/knowledge-and-collaboration/admin-panel>,
   <https://docs.warp.dev/agent-platform/cloud-agents/overview/>)

9. **Lifecycle / cleanup**: Cloud agents: "Lifecycle tracking: Status progression from
   creation through completion" with persistent records. Automated cleanup not documented.
   Local agents: terminal session cleanup is user-managed.
   (source: <https://docs.warp.dev/agent-platform/cloud-agents/overview/>)

10. **Composability**: Warp Drive hosts Workflows, Notebooks, Prompts, Rules, and Environment
    Variables; "Rules and MCP servers work across both local and cloud agents," suggesting a
    unified config layer. Warp does not assume ownership of `.git/worktrees`; cloud agents
    use Docker (not git worktrees). No hooks or coexistence model documented beyond
    "Rules" and MCP. (source: <https://docs.warp.dev/knowledge-and-collaboration/warp-drive/>,
    <https://docs.warp.dev/agent-platform/cloud-agents/overview/>)

11. **Within-workspace session continuity**: Cloud agents produce "Session transcripts for
    post-execution review." Session sharing enables viewing running tasks. No documented
    mechanism for resuming an interrupted cloud agent session or cross-session prompt memory
    in Warp terminal.
    (source: <https://docs.warp.dev/agent-platform/cloud-agents/overview/>)

12. **Review surface**: Not documented specifically for Warp. Oz supports "comprehensive
    observability (tracing, logging, steerability)," implying real-time monitoring; cloud
    agents can be "steered" during execution via session sharing. No dedicated PR review or
    approval-gate mechanism documented.
    (source: <https://docs.warp.dev/agent-platform/cloud-agents/platform/>)

13. **Merge & post-merge lifecycle**: Not documented. Warp offers GitHub/Slack MCP
    integrations but no explicit merge workflow, PR creation, or post-merge resync tooling.
    (source: <https://docs.warp.dev/agent-platform/cloud-agents/overview/>)

14. **Multi-developer / async handoff**: Session sharing allows "hand over the controls to
    trusted teammates" for "seamless session handoff between team members during
    collaborative work." Warp Drive team workspace shares Workflows, Notebooks, Rules, and
    Env Vars across teams. Cross-machine resumption not documented beyond "Warp Drive
    [syncs] immediately as they're updated."
    (source: <https://docs.warp.dev/knowledge-and-collaboration/session-sharing>,
    <https://docs.warp.dev/knowledge-and-collaboration/warp-drive/>)

15. **Explicit design opinions**: Warp explicitly positions cloud agents as "event-driven,
    scheduled, and integration-based automation" rather than interactive development. The
    design philosophy separates "local agents" (interactive, real-time) from "cloud agents"
    (background, scheduled), with "Zero Data Retention" privacy policy. Branching/isolation
    strategy is deliberately flexible: "Interactive agents can plan work and spawn subagents
    to parallelize tasks... [Warp provides] building blocks for running and coordinating
    multiple concurrent agents, rather than enforcing a fixed workflow."
    (source: <https://docs.warp.dev/agent-platform/cloud-agents/overview/>)

#### Worktrunk

1. **Category**: CLI for git worktree management (source: <https://worktrunk.dev/>)

2. **Worktree mechanic**: Native `git worktree` — the tool wraps git's worktree feature,
   reducing CLI friction but not replacing the underlying mechanism.
   (source: <https://worktrunk.dev/>, <https://github.com/max-sixty/worktrunk>)

3. **Storage location**: User-configurable template (default: sibling directory
   `~/<repo>.<branch>`). Template filters include `{{ branch | sanitize }}` (converts `/` to
   `-`), `{{ branch | sanitize_db }}` (lowercase, underscores), `{{ branch | codename(2) }}`
   (friendly names). Users can configure inside `.worktrees/`, centralized `~/worktrees/`, or
   custom paths via `worktree-path` in `~/.config/worktrunk/config.toml`.
   (source: <https://worktrunk.dev/config/>)

4. **Branch naming**: User-provided (not auto-generated). Branches are the primary worktree
   address; "Worktrees are addressed by branch name; paths are computed from a configurable
   template." (source: <https://worktrunk.dev/>, <https://worktrunk.dev/tips-patterns/>)

5. **Spawn surface**: CLI command `wt switch --create <branch>` or aliased as
   `wt switch -c <branch>`. Launcher pattern:
   `wt switch --create <branch> --execute=claude` spawns a worktree and launches Claude in
   one command. Manual branch name input required; no agent-prompted branching.
   (source: <https://github.com/max-sixty/worktrunk>,
   <https://worktrunk.dev/tips-patterns/>)

6. **Cold-start context handoff**: Via the Worktrunk skill for Claude Code, agents receive a
   "structured brief" with pre-created worktree path: "You are working in
   `/abs/path/to/worktrunk.<branch>` on branch `<branch>`." The skill teaches one agent to
   spawn sub-agents in parallel worktrees by passing the path. No primary-spec or issue-link
   handoff documented; context is worktree path + implicit task from parent agent's prompt.
   (source: <https://github.com/max-sixty/worktrunk/blob/main/CLAUDE.md>,
   <https://worktrunk.dev/tips-patterns/>)

7. **Per-workspace agent state**: Not Worktrunk's responsibility — tool manages git state,
   not agent state. When Claude Code runs in a worktree, its session persists locally (if
   Claude Code session resumes in the same directory) but Worktrunk provides no
   session-restore mechanism.

8. **Concurrency stance**: Encouraged and primary use case: "AI agents like Claude Code and
   Codex can handle longer tasks without supervision, such that it's possible to manage
   5-10+ in parallel." Worktree isolation prevents "agents [from stepping] on each other's
   changes." Per-worktree tracking via `wt list` with emoji status markers (🤖 working, 💬
   waiting). (source: <https://github.com/max-sixty/worktrunk>,
   <https://worktrunk.dev/tips-patterns/>)

9. **Lifecycle / cleanup**: Automated via `wt remove`: By default, only deletes branches
   whose content is "already in the default branch" (safeguard against uncommitted work).
   Branches showing `_` (same commit) or `⊂` (integrated) in `wt list` are marked safe.
   Pre-merge and post-merge hooks execute at key points. Log cleanup via
   `wt config state logs clear` for `.git/wt/logs/` per-branch subtrees.
   (source: <https://worktrunk.dev/config/>, <https://worktrunk.dev/merge/>,
   <https://worktrunk.dev/tips-patterns/>)

10. **Composability**: Worktrunk explicitly does not own `.git/worktrees` beyond
    creating/listing them; respects custom files, planning docs, and agent-generated
    artefacts within worktrees. Data-safety principle: "Never risk data loss without
    explicit user consent." Hooks (`pre-start`, `post-start`, `pre-merge`, `post-merge`)
    are user-configurable in `.config/wt.toml` or `~/.config/worktrunk/config.toml`.
    Post-merge hooks run in background with logs in `.git/wt/logs/{branch}/`. Approvals
    system gates execution of project-supplied hook commands.
    (source: <https://github.com/max-sixty/worktrunk/blob/main/CLAUDE.md>,
    <https://worktrunk.dev/config/>)

11. **Within-workspace session continuity**: Not Worktrunk's responsibility — tool provides
    worktree isolation; agent session (e.g., Claude Code) maintains its own persistence.
    When resuming in a worktree, the agent session depends on that agent's own restart logic.

12. **Review surface**: Not built-in. Workflow integrates with platform tools (e.g.,
    `gh pr create` for GitHub, `glab mr create` for GitLab). Local commit generation hooks
    can auto-generate commit messages from diffs. No approval-gate or in-tool diff-review
    mechanism. (source: <https://worktrunk.dev/merge/>,
    <https://worktrunk.dev/tips-patterns/>)

13. **Merge & post-merge lifecycle**: `wt merge <target>` (default: main) executes:
    (1) Pre-commit hooks, (2) Squash commits since target, (3) Rebase onto target, (4)
    Pre-merge validation hooks, (5) Fast-forward merge, (6) Pre-remove checks, (7)
    Worktree/branch cleanup, (8) Post-merge background hooks. Options: `--no-squash`,
    `--no-ff` (merge commit), `--no-remove` (keep worktree). PR creation, branch push, and
    sibling-worktree re-sync are external (user/agent scripts).
    (source: <https://worktrunk.dev/merge/>)

14. **Multi-developer / async handoff**: Not built-in. Git push/pull is the transport;
    Worktrunk provides no cross-machine resume mechanism. Branch-state variables
    (`wt config state vars`) can "stick a branch to an environment" for coordinated pipeline
    steps across developers, but this is manual coordination, not automated handoff.
    (source: <https://worktrunk.dev/tips-patterns/>)

15. **Explicit design opinions**: Worktrunk takes a clear stance: (a) "Worktrees are
    addressed by branch name; paths are computed from a configurable template" — simplify
    UX by treating branch as the primary handle, auto-derive paths
    (source: <https://worktrunk.dev/>); (b) "Each worktree corresponds to a branch" —
    enforce 1:1 mapping to reduce cognitive load; (c) Local-first operations: "Network
    access occurs only when users explicitly request it"
    (source: <https://github.com/max-sixty/worktrunk/blob/main/CLAUDE.md>); (d) Data safety
    over convenience: "A failed command that preserves data is better than a 'successful'
    command that silently destroys work"
    (source: <https://github.com/max-sixty/worktrunk/blob/main/CLAUDE.md>); (e)
    Agent-friendly parallel workflows: Primary motivation is "5-10+ agents in parallel"
    without conflict (source: <https://github.com/max-sixty/worktrunk>).

#### Cluster 1 Meta-Synthesis

**Convergence within cluster:**

- **Worktree-centric isolation**: All three tools recognize worktrees (actual or abstracted)
  as a key boundary for parallel agent work. Zed treats worktrees as optional per-thread
  decisions; Worktrunk makes them mandatory and primary; Warp uses container isolation for
  cloud agents (analogous intent, different mechanism).
- **Developer-curated context over automatic capture**: Zed explicitly requires `@` mentions
  for context; Worktrunk passes worktree path + prompt implicitly; Warp Drive stores shared
  context artifacts (Workflows, Rules) that agents access. None default to indexing/codebase
  scanning without user curation.
- **Per-agent concurrency welcomed**: All three permit N concurrent agent workspaces and
  provide UI/tooling to track them (Threads Sidebar in Zed, `wt list` in Worktrunk, Agent
  Management Panel in Warp).
- **Flexible branching without rigid convention**: Zed and Worktrunk let users choose branch
  names; Warp leaves branching strategy to the developer. No tool enforces a single
  convention (e.g., "Conventional Branch Names").
- **Not ownership of merge workflows**: Zed defers to "standard Git workflows"; Worktrunk
  provides `wt merge` but no PR creation/platform integration; Warp Oz provides
  observability but no built-in merge. None claim to own the full PR-to-merge lifecycle.
- **Agent state lives outside the tool**: Zed's threads persist conversation history;
  Worktrunk and Warp don't store agent conversation/plan data — agents (Claude Code, Oz
  cloud agents) own their own state.

**Divergence within cluster:**

- **Workspace isolation mechanism**: Zed and Worktrunk use native git worktrees (user
  controls cleanup). Warp Oz uses Docker containers (tool controls everything inside the
  image).
- **Deployment model**: Zed and Worktrunk are local-only. Warp explicitly separates local
  (Warp Terminal + interactive agents) from cloud (Oz + scheduled/event-driven agents).
- **Context handoff sophistication**: Zed requires explicit mention. Worktrunk passes
  worktree path + implicit task. Warp Drive stores shared artifacts (Workflows, Rules, Env
  Vars) that agents can reference; most structured.
- **Session continuity across restarts**: Zed preserves thread conversation history;
  Worktrunk has no session persistence (relies on agent's own session logic); Warp stores
  cloud agent transcripts but offers no local interactive-agent session resume.
- **Review/approval gates**: None documented for Zed's agent or Worktrunk. Warp Oz offers
  "steerability" (real-time monitoring/intervention) but no formal approval gates.
- **Multi-developer async handoff**: Warp Drive + session sharing are most explicit (share
  Workflows, Rules, hand over session). Zed's real-time collaboration is peer co-editing,
  not async handoff. Worktrunk relies on plain git push/pull.

**Outliers:**

- **Warp's container-first design**: Unlike Zed (editor, uses git worktrees) and Worktrunk
  (CLI, wraps git worktrees), Warp's Oz abandons git worktree mechanics entirely for cloud
  agents, treating each agent run as an isolated container. This is a fundamentally
  different abstraction; the closest parallel is **not** worktree-to-worktree isolation but
  container-to-container.
- **Zed's worktree-as-first-class-citizen**: Zed makes worktree selection a per-thread UI
  decision (Threads Sidebar), integrating worktree choice into the agent panel itself — no
  other tool surfaces branch/worktree selection within the agent UX as prominently.

**Ambiguities (require testing or source-code review):**

- **Workspace state serialization in Zed**: Thread conversation history persists; whether
  plan documents, scratchpads, or custom artefacts within a worktree survive a restart is
  undocumented.
- **Warp's local-agent session persistence**: Whether a local terminal session state (shell
  history, working directory, agent prompt context) resumes across application restarts is
  undocumented.
- **Worktrunk's agent-context transport**: Whether Worktrunk itself provides a structured
  "handoff brief" (issue link, spec doc reference) or if that's purely the parent agent's
  responsibility is not explicitly clarified in docs.
- **PR/merge lifecycle ownership**: All three defer merge to external tools, but the degree
  to which an agent can autonomously create PRs (e.g., via MCP, GitHub integration, or API)
  is mentioned but not detailed enough to compare confidence levels.
- **Cleanup automation post-merge**: Worktrunk documents `wt remove` safeguards; Zed and
  Warp don't document automated worktree or container removal after merge completion.

---

### 2.2 Cluster 2 — Established Dedicated Agent-Management Apps

#### Conductor

1. **Category**: Standalone desktop app (macOS native).
   (source: <https://www.conductor.build/>)

2. **Worktree mechanic**: Actual git worktree. Each workspace is "a separate Git worktree,
   providing an isolated environment for each AI agent to work without interfering with
   others." (source: <https://www.conductor.build/docs/concepts/workspaces-and-branches>)

3. **Storage location**: User-controlled directory structure under `~/conductor/workspaces/`
   with autogenerated city names (e.g., `nagoya`, `montreal`). Not a hidden path; user can
   browse and manage directly.
   (source: <https://elite-ai-assisted-coding.dev/p/the-parallel-agent-multiplier-conductor-with-charlie-holtz>)

4. **Branch naming**: User-provided + task-driven. Conductor auto-generates a unique branch
   on workspace creation, then agents rename it to match the task (e.g., `add-nav-icons`)
   during their first chat.
   (source: <https://elite-ai-assisted-coding.dev/p/the-parallel-agent-multiplier-conductor-with-charlie-holtz>)

5. **Spawn surface**: GUI-first. `Cmd+Shift+N` or "New workspace" button. Inputs: branch
   (existing or new), GitHub issue, or Linear issue.
   (source: <https://www.conductor.build/docs/first-workspace>)

6. **Cold-start context handoff**: Manual attachment via chat, files, comments, or
   persistent `.context` directory (introduced v0.28.1). No auto-inheritance of prior chat.
   `.context` is the "primary spec" mechanism — specs and plans live as persistent Markdown
   files. (source: <https://www.conductor.build/blog/context>)

7. **Per-workspace agent state**: One agent per workspace. Persistent thread within a
   workspace. Chat history archived but not resumed across workspace boundaries.
   (source: <https://www.conductor.build/docs/concepts/workflow>)

8. **Concurrency stance**: N concurrent active workspaces explicitly blessed. Workflow
   requires coordinating as a tech lead over parallel branches; not enforced single-focus.
   "Use multiple agents in same workspace when they share code state; separate workspaces
   when tasks move independently."
   (source: <https://docs.conductor.build/core/parallel-agents>)

9. **Lifecycle / cleanup**: Post-merge: workspace can be archived (not deleted) and restored
   later with full chat history. No automated removal. User-initiated archival. Abandoned
   workspaces persist as archived entries.
   (source: <https://www.conductor.build/docs/concepts/workflow>)

10. **Composability**: Conductor assumes it owns `.git/worktrees` but explicitly delegates
    branch/merge decisions to Git. `.context` directory is checked-in; agents read/write
    files there directly. No hooks documented; Conductor wraps GitHub/Linear APIs directly.
    Planning docs and `.context` coexist cleanly.
    (source: <https://www.conductor.build/blog/context>)

11. **Within-workspace session continuity**: Full chat history persists and can be reviewed,
    but archival doesn't auto-resume in a new session; user must explicitly re-open the
    workspace. (source: <https://www.conductor.build/docs/concepts/workflow>)

12. **Review surface**: End-of-work review primary. Diff Viewer (`Cmd+Shift+D`) allows code
    comments, Checks tab shows git status / CI / comments / todos. Claude agent can comment
    on diffs. Right-click Review button to edit instructions. Built-in UI distinct from
    GitHub PR review. (source: <https://www.conductor.build/changelog>,
    <https://docs.conductor.build/core/diff-viewer>)

13. **Merge & post-merge lifecycle**: Agent or user can create PR via Conductor UI. Agent
    can respond to review comments, fix failing checks, draft PR description. No automated
    post-merge worktree removal. User archives the workspace. No automatic re-sync of
    sibling worktrees. (source: <https://www.conductor.build/docs/concepts/workflow>)

14. **Multi-developer / async handoff**: Not documented. Workspaces appear to be single-user
    local state (macOS app, no cloud sync mentioned). Plain git push is the handoff
    mechanism; no workspace-state transfer.

15. **Explicit design opinions**: Yes, strong stance. Creator explicitly states: "Git
    worktrees are actually really powerful, but they are a huge pain to manage yourself
    manually. Conductor just makes it really easy." Design philosophy is "git worktrees made
    human" — automate worktree lifecycle so developers focus on orchestration and review.
    (source: <https://elite-ai-assisted-coding.dev/p/the-parallel-agent-multiplier-conductor-with-charlie-holtz>)

#### emdash

1. **Category**: Standalone desktop app (Electron-based, TypeScript). Open-source. Supports
   local and remote (SSH) development.
   (source: <https://github.com/generalaction/emdash>)

2. **Worktree mechanic**: Actual git worktree. "When you assign a task to an agent, it
   creates a separate git worktree, a full copy of your working tree that shares the same
   `.git` directory but lives in its own directory on disk."
   (source: <https://www.startuphub.ai/ai-news/claudes-corner/2026/claudes-corner-emdash-yc-w2026>)

3. **Storage location**: Sibling directory. "Worktrees are created in a sibling worktrees/
   directory outside your repo." User can disable worktrees to work on current branch.
   (source: <https://emdash.sh/docs/tasks> — note: WebFetch returned 403 on direct URL;
   inferred from search results.)

4. **Branch naming**: Auto-generated from task name. `EMDASH_TASK_NAME` environment variable
   is single source of truth. Branch names derived from `task.name` in database.
   (source: <https://github.com/generalaction/emdash/pull/1084>)

5. **Spawn surface**: Task creation modal. Inputs: task name, agent selection, branch
   selection (or auto-create). CLI and GUI both supported. Can pass Linear/GitHub/Jira
   tickets directly. (source: <https://emdash.sh/docs/tasks> — WebFetch 403; inferred from
   Hacker News/coverage.)

6. **Cold-start context handoff**: Task specification passed to agent; no auto-inheritance
   of chat history. Can pass issue link / Linear ticket as spec. Environment variable
   `EMDASH_TASK_NAME` provided. No persistent "primary spec" file mentioned.
   (Inferred from task architecture; not fully documented.)

7. **Per-workspace agent state**: One agent per task/worktree. Persistent terminal state
   saves automatically; agent resumes where it left off. Optional tmux integration for
   persistent background sessions across restarts.
   (source: <https://emdash.sh/docs/tmux-sessions>)

8. **Concurrency stance**: N concurrent tasks/agents explicitly supported. Worktrees are
   the isolation mechanism. No single-focus discipline documented.
   (source: <https://github.com/generalaction/emdash>)

9. **Lifecycle / cleanup**: Automated cleanup post-crash/restart. Reserve worktrees
   (internal mechanism) are tracked in `.worktrees/_reserve/*`. Cleanup scans filesystem
   and git state to remove orphaned worktrees even after restart. Stale detection in Claude
   Code v2.1.76 auto-removes stale worktrees on session start.
   (source: <https://github.com/generalaction/emdash/pull/1004>,
   <https://github.com/anthropics/claude-code/issues/34282>)

10. **Composability**: emdash can copy gitignored files into each new worktree via
    `preservePatterns` in `.emdash.json`. Custom config file coexists cleanly. Tool assumes
    it owns `.worktrees/` but respects user-provided gitignore preservation rules. No
    explicit hooks documented. (source: <https://emdash.sh/docs/project-config>)

11. **Within-workspace session continuity**: Terminal state persists and auto-resumes. With
    tmux, full session survives restarts and reconnects; agent picks up in background.
    Without tmux, terminal state saved but agent stops on app close.
    (source: <https://emdash.sh/docs/tmux-sessions>)

12. **Review surface**: Built-in PR review within the tool. Can "review diffs, test changes,
    create PRs, see CI/CD checks, and merge." Integrated workflow, not delegated to GitHub.
    (source: <https://github.com/generalaction/emdash> — README excerpt from WebFetch.)

13. **Merge & post-merge lifecycle**: Agent or user can create PR. Improved PR sync workflow
    in v1 rebuild. PR auto-detection for task worktrees. No documented post-merge worktree
    removal; user must manage cleanup manually or rely on stale-detection automation.
    (source: <https://emdash.sh/changelog>)

14. **Multi-developer / async handoff**: SSH remote development supported; agents can work
    on remote codebases. Terminal state saves to local SQLite. No explicit cross-machine
    session transfer documented beyond git push.
    (source: <https://github.com/generalaction/emdash>)

15. **Explicit design opinions**: Yes, strong stance. "The implicit assumption underlying
    existing AI coding tools is that one agent, running one model, in one environment, is
    the future of software development. Emdash thinks that's wrong." Design explicitly
    rejects single-agent model; bets on heterogeneous multi-agent coordination. Uses git
    worktrees because "the isolation is battle-tested."
    (source: <https://www.startuphub.ai/ai-news/claudes-corner/2026/claudes-corner-emdash-yc-w2026>)

#### Maestro

1. **Category**: Standalone desktop app (Electron-based, Node.js main process + React
   renderer). Open-source.
   (source: <https://github.com/RunMaestro/Maestro/blob/main/ARCHITECTURE.md>)

2. **Worktree mechanic**: Actual git worktree. "Each worktree sub-agent operates
   independently with its own directory."
   (source: <https://docs.runmaestro.ai/git-worktrees>)

3. **Storage location**: User-specified base directory during worktree setup, default
   "parent of agent's working directory." Not hidden; managed via branch pill UI.
   (source: <https://docs.runmaestro.ai/git-worktrees>)

4. **Branch naming**: User-provided. User enters branch name when creating worktree.
   Auto-alternative generation (`branch-name-2`) when conflicts occur. (Maestro app branch
   naming inferred from worktree UI description; not fully documented.)

5. **Spawn surface**: Right-click context menu on git branch or branch pill in header.
   Inputs: base directory, branch name. Pure GUI, no CLI mentioned in docs.
   (source: <https://docs.runmaestro.ai/git-worktrees>)

6. **Cold-start context handoff**: Implicit. Each Auto Run task gets a fresh AI session
   (unique session ID) with no chat history inheritance. Markdown task documents define the
   spec; Auto Run processes them. For persistent instructions, use inline task document or
   environment variables. (source: <https://docs.runmaestro.ai/autorun-playbooks>)

7. **Per-workspace agent state**: One agent per worktree. Auto Run tasks get fresh context
   each execution (clean conversation per task). Persistent conversation in interactive
   sessions within the same agent/worktree.
   (source: <https://docs.runmaestro.ai/autorun-playbooks>)

8. **Concurrency stance**: N concurrent agents/worktrees blessed and encouraged. Multiple
   agents with "separate workspaces, context, and isolated contexts." Keyboard-first
   power-user workflow designed for rapid agent switching and parallel execution.
   (source: <https://github.com/RunMaestro/Maestro/blob/main/ARCHITECTURE.md>)

9. **Lifecycle / cleanup**: Cleanup options in UI: "Remove worktree by deleting just the
   agent or by removing both the agent and the underlying directory." User-initiated. No
   automated stale detection or post-merge cleanup documented.
   (source: <https://docs.runmaestro.ai/git-worktrees>)

10. **Composability**: Auto Run creates/reuses worktrees and branches. Can coexist with
    external conventions. Tool assumes it owns worktree creation but accepts user-specified
    base directories. No explicit hooks. Markdown-based task specs coexist cleanly with
    code. (source: <https://docs.runmaestro.ai/autorun-playbooks>)

11. **Within-workspace session continuity**: Sessions persist via electron-store.
    Interactive sessions maintain conversation tabs and history. Auto Run tasks reset
    context per iteration (fresh session). Resume is automatic; user reopens agent to
    continue. (source: <https://github.com/RunMaestro/Maestro/blob/main/ARCHITECTURE.md>)

12. **Review surface**: No explicit approval gates documented. Group Chat for agent
    coordination, but review workflow not detailed. Built-in diff/comment UI implied but
    not fully documented.

13. **Merge & post-merge lifecycle**: Auto Run can "create PRs from worktree branches." PR
    workflow integrated. Post-merge cleanup unclear; user must manually remove worktree or
    let it persist. No re-sync or post-merge automation documented.
    (source: <https://docs.runmaestro.ai/autorun-playbooks>)

14. **Multi-developer / async handoff**: Group Chat supports multi-agent coordination in
    single conversation with moderator AI. Not explicitly designed for cross-machine or
    cross-user handoff. Conversation history persists locally. Plain git push for branched
    work. (source: <https://docs.runmaestro.ai/autorun-playbooks>)

15. **Explicit design opinions**: Yes, moderate stance. Designed as "Keyboard-first,
    power-user orientation" for developers who "live on the keyboard and rarely touch the
    mouse." Emphasizes parallelization and isolation to prevent merge conflicts. Treats
    version control as foundational, not supplementary. No explicit stance against/for git
    worktrees; treats them as enabling infrastructure.
    (source: <https://github.com/RunMaestro/Maestro/blob/main/ARCHITECTURE.md>)

#### Cluster 2 Meta-Synthesis

**Convergence within cluster:**

- **Git worktree as isolation primitive**: All three tools use actual `git worktree` as
  their primary isolation mechanism, not virtualization or containers. This is the most
  concrete convergence signal.
- **One agent per worktree (or task)**: All three enforce or assume a 1:1 mapping of
  agent/task to worktree. No cross-worktree agent pooling.
- **Desktop/local-first architecture**: All three are standalone desktop apps (not hosted
  cloud services). Conductor is macOS-only; emdash and Maestro are cross-platform
  (Electron).
- **User-controlled or task-driven branch naming**: None use rigid global conventions.
  Conductor and Maestro accept user input; emdash auto-generates from task name. All allow
  descriptive task-aligned names.
- **Built-in review UI distinct from platform PR**: All three provide integrated
  diff/comment/check viewing rather than deferring entirely to GitHub. Conductor explicitly
  has Diff Viewer; emdash and Maestro integrate PR workflow into the tool.
- **N concurrent agents blessed**: All three explicitly support and encourage running
  multiple agents/worktrees in parallel, not single-focus discipline.
- **Manual/user-initiated cleanup**: None automate post-merge worktree removal. Conductor
  archives (reversible); emdash has stale-detection fallback; Maestro leaves cleanup to
  user.

**Divergence within cluster:**

- **Context handoff strategy**: Conductor uses persistent `.context` directory (checked-in
  files); emdash and Maestro use task/issue specifications or environment variables.
  Conductor's `.context` is the most explicit "primary spec" mechanism.
- **Session resumability**: Conductor archives but doesn't auto-resume (user must
  explicitly reopen); emdash saves terminal state automatically and supports tmux
  persistence; Maestro persists via electron-store with automatic recovery.
- **Worktree storage location**: Conductor uses friendly-named user-visible paths
  (`~/conductor/workspaces/`); emdash defaults to `.worktrees/` sibling; Maestro asks user
  to specify base directory. Conductor is the most opinionated about UX visibility.
- **Spawn trigger**: Conductor is GUI-only (`Cmd+Shift+N`); emdash can integrate
  issue/ticket links directly; Maestro is right-click context menu only.
- **Review gate model**: Conductor has explicit "Diff Viewer + Checks tab" flow with
  comment/approve UI; emdash and Maestro mention PR creation but don't document
  step-by-step approval gates.
- **Design philosophy explicitness**: Conductor frames itself as "git worktrees made
  human"; emdash explicitly rejects single-agent model (heterogeneous AI); Maestro
  emphasizes power-user keyboard workflow. Conductor is most "worktree-centric," emdash is
  most "multi-provider," Maestro is most "keyboard-native."

**Outliers:**

- **emdash's provider agnosticism**: Only emdash explicitly supports "27+ CLI agents from
  different vendors" rather than being Claude-first. This is a significant design
  divergence from Conductor (Claude Code native) and Maestro (multiple but not explicitly
  heterogeneous in docs).
- **emdash's stale-worktree auto-cleanup**: Only emdash documents automated cleanup in
  Claude Code v2.1.76; the others rely on user action or archival.
- **Conductor's `.context` directory as durable spec storage**: Unique among the three.
  Becomes a git-checked-in planning artifact, not ephemeral chat.

**Ambiguities (require testing or source-code review):**

- **Post-merge re-sync behavior**: None of the three clearly document whether/how sibling
  worktrees auto-update after a merge to main. Critical if multiple agents are working on
  dependent branches.
- **Cross-machine session transfer**: emdash mentions SSH remote development; Maestro
  implies local state only. None clearly support "copy conversation + worktree to another
  developer's machine." Plain git push is the only portable handoff.
- **Composability with external tools**: All three assume they own `.git/worktrees`
  creation, but none explicitly document hooks (pre-spawn, post-merge) for external
  orchestration. Conductor's approach to "wrap GitHub/Linear APIs" suggests it might block
  or complicate external CI/CD integration.
- **Per-step approval gates vs. end-of-work review**: Only Conductor's Diff Viewer is
  concretely documented. emdash and Maestro mention review UI but don't clarify if agents
  can pause mid-task for approval or if review happens only post-completion.
- **Terminal session model**: emdash's optional tmux support is unique, but docs don't
  clarify default behavior without tmux (does agent stop? resume on reopen?). Maestro's
  electron-store persistence is opaque (what state is actually saved?).

---

### 2.3 Cluster 3 — Newer Dedicated Agent-Management Apps

#### Super

**Cannot assess.** Search for "super.engineering" returned results for unrelated tools
(Genesys workspace agents, SWE-agent, OpenAI Agents SDK) and a different product at
`super.work`. The "Super" at `super.engineering` either has minimal public documentation, has
changed URL, or the URL was a typo. Without accessible documentation or GitHub repository,
cannot answer the 15 questions.

#### Superset

> Note: this is `superset.sh`, NOT Apache Superset (the data-visualization tool of the same
> name).

1. **Category**: Desktop IDE (macOS, Linux; Intel and ARM support). Also available as CLI and
   MCP server. (source: <https://docs.superset.sh/overview>)

2. **Worktree mechanic**: Native git worktrees. "Each git branch gets its own isolated
   workspace via git worktrees." Each workspace is a separate checkout of the repository
   backed by the same Git object store.
   (source: <https://superset.sh/blog/working-with-worktrees-in-superset>)

3. **Storage location**: Worktrees are "stored in your Superset data directory as git
   worktrees." User-controlled via filesystem.
   (source: <https://docs.superset.sh/faq>)

4. **Branch naming**: AI-suggested branches auto-generated from workspace creation prompt,
   with automatic conflict resolution if name is taken. No explicit naming convention
   enforced. (Inferred from search results on Superset auto-generated branch names.)

5. **Spawn surface**: GUI buttons in IDE ("New branch," "Existing branch," "Pull request").
   CLI via command. Users link pull requests by URL or search.
   (source: <https://docs.superset.sh/workspaces>)

6. **Cold-start context handoff**: Optional PR link provides initial context. Prompt-first
   workflow — user provides narrative on workspace creation. No structured brief mechanism
   explicitly documented; context derives from PR or user-supplied prompt.
   (source: <https://docs.superset.sh/first-workspace>)

7. **Per-workspace agent state**: One agent per workspace (one worktree, one branch).
   Sessions persist across app restarts: "Yes, terminals survive app restarts." No explicit
   cross-workspace shared memory. (source: <https://docs.superset.sh/faq>)

8. **Concurrency stance**: 5–7 agents comfortable on a modern laptop; 5–10 agents common
   before resource/API throttling. No hard limit; practical constraint is system resources
   and review throughput.
   (source: <https://superset.sh/blog/parallel-coding-agents-guide>)

9. **Lifecycle / cleanup**: Automatic worktree removal when workspace is closed/deleted.
   Teardown scripts via `.superset/config.json` run on deletion. No stale detection
   documented; cleanup is manual deletion via UI.
   (source: <https://docs.superset.sh/setup-teardown-scripts>)

10. **Composability**: Assumes full git worktree ownership. No mention of hooks or external
    conventions. Setup/teardown scripts can integrate custom file handling. Dedicated
    `.superset/` directory for config; external tools can coexist but no documented
    integration pattern.
    (source: <https://github.com/superset-sh/superset/blob/main/README.md>)

11. **Within-workspace session continuity**: Terminal sessions persist. Agent chat/worktree
    state persists locally in worktree. No resumable agent brief or explicit plan mechanism
    documented. (source: <https://docs.superset.sh/faq>)

12. **Review surface**: Built-in diff viewer shows all changes with additions/deletions
    highlighted. Per-file review before commit. No per-step approval gate; review is
    post-completion before PR.
    (source: <https://superset.sh/blog/parallel-coding-agents-guide>)

13. **Merge & post-merge lifecycle**: No explicit automation documented. Tool shows diff,
    user reviews, then merges manually via git. No documented post-merge re-sync of sibling
    worktrees. (source: <https://docs.superset.sh>)

14. **Multi-developer / async handoff**: Team sync via `.superset/` config commit. "Yes, for
    team features and settings sync" requires an account. No documented cross-machine
    resume or workspace transfer. (source: <https://docs.superset.sh/faq>)

15. **Explicit design opinions**: "No stashing, no git checkout whiplash" — philosophy
    eliminates manual branch switching friction. One branch per workspace by design.
    Emphasizes parallel execution without context switching.
    (source: <https://docs.superset.sh/overview>)

#### T3code

1. **Category**: Web GUI + Desktop Electron app. Minimal interface; Node.js WebSocket server
   wrapping Codex.
   (source: <https://betterstack.com/community/guides/ai/t3-code/>, <https://t3.codes/>)

2. **Worktree mechanic**: Git worktree native support. "Native support for git worktree,
   which allows a repository to have multiple checked-out working directories on different
   branches simultaneously." Each task runs in a separate worktree.
   (source: <https://betterstack.com/community/guides/ai/t3-code/>)

3. **Storage location**: Not documented. Likely default git worktree location
   (`.git/worktrees/`).

4. **Branch naming**: Not documented.

5. **Spawn surface**: Web GUI or desktop app. Minimal documentation; no explicit workflow
   for initiating workspaces. (source: <https://t3.codes/>)

6. **Cold-start context handoff**: Not documented. Supports "persistent project and thread
   management" but no explicit context handoff mechanism revealed.
   (source: <https://pingdotgg-t3code.mintlify.app/>)

7. **Per-workspace agent state**: Sessions are persistent with localStorage-backed settings.
   "Imported sessions can be opened, resumed, and read from T3." Thread deduplication by
   provider ID allows resuming across devices.
   (source: <https://github.com/pingdotgg/t3code/issues/510>)

8. **Concurrency stance**: Not documented explicitly. Tool is single-agent-focused (minimal
   GUI) rather than multi-agent orchestration.

9. **Lifecycle / cleanup**: Not documented.

10. **Composability**: Not documented. Early-stage project ("very very early"); composability
    not addressed. (source: <https://github.com/pingdotgg/t3code>)

11. **Within-workspace session continuity**: Session persistence via localStorage. Threads
    can be imported and resumed. "Codex can print a session ID but [historically] fail to
    persist resumable local session artifacts after early transport failure."
    (source: <https://github.com/pingdotgg/t3code/issues/510>)

12. **Review surface**: Per-turn diff viewer with side-by-side file comparisons. Approval
    modes available: supervised (per-action approval) and full-access (no restrictions).
    Plan mode generates step-by-step proposal before execution.
    (source: <https://betterstack.com/community/guides/ai/t3-code/>)

13. **Merge & post-merge lifecycle**: Not documented.

14. **Multi-developer / async handoff**: Remote sessions: "imported sessions can be accessed
    remotely from another device just like T3-native sessions." No explicit cross-machine
    handoff mechanism. (source: <https://deepwiki.com/pingdotgg/t3code/3.5-settings-and-configuration>)

15. **Explicit design opinions**: Project is early-stage with limited explicit positions.
    Dual access modes (Full Access vs. Supervised) reflect a design choice around approval
    control. Plan mode (generate plan, then execute) is offered as an alternative to chat
    mode. (source: <https://betterstack.com/community/guides/ai/t3-code/>)

#### Soloterm (Solo)

> **Scope mismatch.** Solo is a "lightweight terminal workspace for agents, project
> commands, and shell sessions" — a process dashboard and lifecycle manager for development
> stacks (servers, queues, CLI agents). It does not manage git worktrees, branching, or agent
> concurrency directly. Solo's docs explicitly distinguish themselves from a separate
> product also called "Conductor" (by Melty Labs, distinct from `conductor.build`
> researched in Cluster 2). Because Solo's purpose is fundamentally process management (not
> agent-workspace isolation or orchestration), the 15-question template does not apply.

#### Nora

1. **Category**: Desktop Electron app (macOS, Linux, Windows). CLI-first interface with
   multi-agent grid UI.
   (source: <https://github.com/citosoft/nora>, <https://www.withnora.run/>)

2. **Worktree mechanic**: Native git worktrees. "Workspace/session orchestration with
   per-session git worktrees under `.nora/worktrees/`."
   (source: <https://github.com/citosoft/nora>)

3. **Storage location**: `.nora/worktrees/` — app-controlled hidden path.
   (source: <https://github.com/citosoft/nora>)

4. **Branch naming**: Not documented.

5. **Spawn surface**: GUI buttons in the desktop app for session creation, or CLI commands.
   Sessions are created through workspace management UI.
   (source: <https://github.com/citosoft/nora>)

6. **Cold-start context handoff**: Tasks derived from project scope/spec. Nora breaks work
   into "actionable units" from scope specification. Agent receives "brief, repo state, and
   task intent." GitHub and Vercel integration provide external context links.
   (source: <https://www.withnora.run/>)

7. **Per-workspace agent state**: One agent per session/worktree. Supports persistent agent
   context: "cross-agent context sharing for multi-agent collaboration" via shared
   scope/task structure. No explicit cross-workspace shared memory documented.
   (source: <https://github.com/citosoft/nora>)

8. **Concurrency stance**: Supports "multiple agents can run simultaneously" with
   multi-agent grid view. No documented concurrency limits. "Live task state" and "operator
   overview" UI suggests blessing parallel execution.
   (source: <https://www.withnora.run/>)

9. **Lifecycle / cleanup**: "Session lifecycle controls for creation, launch, focus, close,
   destroy, resume, and terminal presets." No explicit stale worktree detection documented.
   (source: <https://github.com/citosoft/nora>)

10. **Composability**: Owns `.nora/worktrees/` directory. Security-first IPC design
    ("sensitive handlers validate payloads at runtime before touching workspace/filesystem").
    No documented hooks or external integration patterns. Modular composition via
    `main/orchestrator/` suggests extensibility but not publicly exposed.
    (source: <https://github.com/citosoft/nora/blob/main/ARCHITECTURE.md>)

11. **Within-workspace session continuity**: Sessions support resume: "Session lifecycle
    controls...resume." No explicit agent chat history or plan persistence mechanism
    documented. (source: <https://github.com/citosoft/nora>)

12. **Review surface**: "Git-aware workflows with status and diff visibility scoped to the
    current worktree." Built-in diff viewer and file editor. No explicit per-step approval
    gate or review UI distinct from platform PR review documented.
    (source: <https://github.com/citosoft/nora>)

13. **Merge & post-merge lifecycle**: GitHub and Vercel integrations "in the same flow." No
    documented automatic PR creation, branch push, or post-merge worktree cleanup.
    (source: <https://www.withnora.run/>)

14. **Multi-developer / async handoff**: GitHub OAuth device flow support suggests cloud
    context sharing, but cross-machine resume or workspace state transfer not documented.
    Agent-to-agent handoff preserves "brief, repo state, and task intent" within a session.
    (source: <https://github.com/citosoft/nora>)

15. **Explicit design opinions**: "Single control plane for multiple live coding agents"
    rather than isolated silos. "Explicit operator control" vs. autonomous agent execution.
    Work derived from scope (not manual prompts per task) to reduce "prompt drift." Design
    contrasts with traditional IDEs. (source: <https://www.withnora.run/>)

#### Cluster 3 Meta-Synthesis

> **Effective N = 2** (Superset, Nora) for cluster-internal convergence. Super inaccessible;
> Soloterm scope-mismatched; T3code early-stage with many "Not documented" answers.

**Convergence within cluster:**

- **Git worktrees as the isolation primitive**: All three agent-capable tools (Superset,
  T3code, Nora) use native git worktrees to isolate parallel agent work, rejecting cloning
  or containerization.
- **One worktree = one branch = one agent session**: Across all three, the
  worktree-branch-session mapping is 1:1, preventing concurrent checkout of the same branch
  and keeping agent work cleanly separated.
- **UI-based diff review pre-commit**: All three surface a diff viewer before changes are
  committed, supporting human review without switching to external Git tools.
- **Persistent terminal/session state**: Terminals and session contexts survive app
  restarts in Superset and Nora; T3code supports thread resumption via provider session
  IDs.
- **Multi-agent UI with visibility**: Superset (workspaces sidebar), Nora (multi-agent
  grid), and T3code (thread management) all provide centralized visibility into parallel
  work.

**Divergence within cluster:**

- **Concurrency scope**: Superset and Nora explicitly support N concurrent agents (5–10
  common); T3code is single-agent-focused (minimal GUI, Codex-first). Soloterm/Solo does
  not orchestrate agents.
- **Context handoff pattern**: Superset uses prompt-first + optional PR link. Nora
  structures work via scope → spec → tasks, deriving agent work from scope to reduce drift.
  T3code emphasizes persistent thread resumption.
- **Approval gates**: T3code offers explicit supervised mode (per-action approval) and plan
  mode (generate proposal before execute). Superset and Nora review diffs post-completion
  without per-step gates.
- **Setup/teardown automation**: Superset documents explicit `.superset/config.json` with
  setup/teardown hooks and environment variables. Nora and T3code do not expose this
  pattern.
- **Storage and abstraction**: Superset/Nora let users understand worktree locations
  (Superset data dir, Nora `.nora/worktrees/`). T3code storage location undocumented;
  minimalism suggests less config exposure.

**Outliers:**

- **Soloterm/Solo**: Explicitly out-of-scope for this cluster — it's a process /
  development-stack manager, not an agent-workspace orchestrator. Its sibling product
  Conductor (Melty Labs, free macOS) is the actual agent-orchestration tool using git
  worktrees, but it was not in the research list.
- **T3code**: Minimal documentation and early-stage status (self-described as "very very
  early") mean many answers are "Not documented." It's single-agent-focused (GUI frontend
  for one Codex instance) rather than multi-agent orchestration like Superset and Nora.

**Ambiguities (require testing or source-code review):**

- **Branch naming conventions**: Neither Superset, Nora, nor T3code explicitly document
  branch naming strategies (freeform, slug, Conventional Commits, auto-generated patterns).
  Superset suggests branches from prompts, but full semantics unclear.
- **Stale worktree cleanup**: Only Superset explicitly documents teardown-on-delete. Nora
  lists "destroy" in session lifecycle but no stale detection. T3code silent.
- **Cross-workspace state & memory**: Nora claims "cross-agent context sharing" and
  preserves brief+state across agent handoffs, but whether this survives workspace closure
  or transfer to another developer is unclear.
- **External tool / custom file coexistence**: Superset's `.superset/` namespace suggests
  composability, but no documented hook or protocol for external tools to integrate
  cleanly.
- **Multi-developer async handoff**: Nora mentions GitHub OAuth and Vercel integration,
  Superset mentions team sync via config commit, T3code supports remote session access.
  None explicitly describe workspace state transfer between developers or async handoff
  mechanics.

---

## 3. Cross-Cluster Convergence

The strongest signals come from convergence across categories — patterns shared by IDEs,
terminals, CLIs, and dedicated apps alike. Eight or nine of nine usable tools agreeing on a
design choice is field-level idiom.

### 3.1 Native git worktrees as the isolation primitive

**8 of 9 tools** use actual `git worktree` (Zed, Worktrunk, Conductor, emdash, Maestro,
Superset, T3code, Nora). The only exception is Warp Oz, which uses Docker containers — but
only for *cloud* agents; Warp's local interactive agents have no documented worktree story.

This is the most concrete convergence finding. The field has settled on git worktrees as the
right abstraction for parallel agent work: no virtualization, no copy-on-write filesystems,
no language-runtime sandboxes. Real git, real working trees, real branch isolation.

### 3.2 1:1 worktree ↔ branch ↔ agent session mapping

**All 9 tools** enforce or assume a 1:1 mapping. No tool pools agents across worktrees, runs
multiple agents in one worktree, or treats branches as a many-to-one relationship with
sessions. Worktrunk states this explicitly ("Each worktree corresponds to a branch");
others treat it as so obvious it goes unstated.

### 3.3 Concurrent multi-agent execution as the value proposition

**All 9 tools** bless N concurrent agent workspaces. Specific positions:

- Zed: "hundreds of threads" maintained at 120fps
- Worktrunk: "5-10+ agents in parallel" as primary motivation
- Conductor: "tech lead over parallel branches" framing
- emdash: explicitly rejects "one agent in one environment"
- Maestro: "rapid agent switching and parallel execution" as keyboard-power-user pitch
- Superset: 5-10 agents common before resource throttling
- Nora: multi-agent grid UI; "simultaneously" as default
- Warp: "multiple agents simultaneously across panes"
- T3code: not documented (single-agent focus)

**No tool documents single-focus discipline.** Concurrency is the headline feature, not a
risk to manage.

This is a direct contradiction of CWC's draft anti-pattern guidance around "single-thread
attention." The field's idiom and ARC's intended discipline pull in opposite directions.
ARC's posture is intentional and audience-specific (limited, thoughtful, restrained
parallelism with deep human involvement); the tool ecosystem's posture is "go fast, manage
many in parallel." Both are valid; they serve different developer profiles.

### 3.4 GUI-driven spawn surface in dedicated apps

In dedicated apps (Conductor, emdash, Maestro, Superset, Nora), the spawn surface is
GUI-first: button, modal, right-click context menu, keyboard shortcut. CLI exists in some
(Worktrunk is CLI-only; emdash, Superset, Nora support both) but GUI is the dominant
adopter-facing pattern.

For ARC adopters using these tools, "click to spawn workspace" is the expected entry. ARC
imposing a CLI-only spawn surface (`/arc-shift --worktree`, `arc start`) competes with the
adopter's tool of choice rather than complementing it.

### 3.5 Built-in pre-PR diff/review UI

**6 of 9 tools** have a built-in diff/review surface distinct from platform PR review
(Conductor, emdash, Maestro, Superset, T3code, Nora). Conductor's Diff Viewer (`Cmd+Shift+D`)
is the most documented; others integrate diff viewing into their workspace UI directly.

The field is converging on "review the agent's work *inside the tool* before opening a PR,"
not deferring everything to GitHub/GitLab review. This is functionally adjacent to ARC's
task-interlock discipline (mandatory stops at task completion) but operates at a different
granularity — typically end-of-work, not per-step.

**T3code is an outlier**: it offers per-step approval gates ("supervised mode") and a "plan
mode" that generates a proposal before execution. This is the only tool whose review surface
operationally resembles ARC's per-task interlock pattern.

### 3.6 Local-filesystem storage; no virtualization

**All 9 tools** store worktrees on the local filesystem (sibling dirs, `.worktrees/`,
app-controlled hidden paths, user-chosen locations). No tool uses virtualized FS, FUSE
mounts, or copy-on-write storage. Storage *location* varies; storage *medium* is universal.

### 3.7 Spec-doc / brief mechanism: invented bespoke per tool

This is the most consequential convergence finding for ARC. Every tool that gives the agent
any kind of "primary context" mechanism invents its own:

- **Conductor**: `.context/` directory of checked-in Markdown specs (introduced v0.28.1)
- **Nora**: structured `scope → spec → tasks` derivation
- **Worktrunk**: structured brief in CLAUDE.md instructing parallel sub-agents
- **emdash**: `EMDASH_TASK_NAME` env var + issue-link integration (Linear/GitHub/Jira)
- **Maestro**: Markdown task documents for Auto Run
- **Superset**: prompt + optional PR link
- **Zed**: explicit `@` mentions, developer-curated
- **Warp**: event payload (Slack/webhook) + Warp Drive shared artifacts

**None of these are cross-compatible.** A `.context/` Markdown set won't be recognized by
Maestro's Auto Run; emdash's `EMDASH_TASK_NAME` doesn't help Conductor; Nora's scope/tasks
structure has no path to Superset. Each tool's bespoke mechanism is locked to that tool.

This is structurally unfortunate. The natural design — accept any spec input (file pointer,
URL, issue link) and let the workspace's own discipline layer normalize it — is what ARC's
existing Origin ⊥ Spec orthogonality already provides (see § 6.1 ARC-relevance
observations).

### 3.8 Multi-developer / async handoff: nobody has solved it

**Only Warp** documents explicit session-sharing for multi-developer handoff. The other 8
tools defer to plain git push/pull. emdash supports SSH remote development, which is
adjacent but not handoff. Maestro's Group Chat is multi-agent coordination, not multi-dev.
Conductor, Superset, Nora are local single-user state.

This is an area where the field has not converged because the field has barely engaged with
the problem. ARC's existing user-notes-via-git-notes mechanism (per `strategy-team-coordination.md`
and the user-sync work) is more sophisticated than anything documented across these tools.

---

## 4. Cross-Cluster Divergence

Where tools disagree usefully, the disagreement signals open design space — not yet settled
field idiom, room for ARC to take a deliberate position.

### 4.1 Branch naming

Split: user-provided (Zed, Worktrunk, Conductor, Maestro) vs. auto-generated from task name
(emdash, Superset). **No tool enforces a Conventional-Branch-style prefix.** WOR's
Conventional Branch alignment is a deliberate ARC opinion, not field idiom — adopters
coming from these tools will find ARC's branch naming more structured than they're used to.

### 4.2 Storage location

Every tool picks differently:

- Sibling dir: emdash (default `.worktrees/` sibling)
- Hidden path: Nora (`.nora/worktrees/`)
- User-controlled friendly-named: Conductor (`~/conductor/workspaces/<city>`)
- User-configurable template: Worktrunk (default `~/<repo>.<branch>`)
- Tool data dir: Superset
- User-specified base: Maestro
- User-managed: Zed

**No convergence.** If ARC ships a recommended worktree location convention, it's a fresh
design choice; no field default to align with.

### 4.3 Composability / extension hooks

**Only Worktrunk documents explicit hooks** (`pre-start`, `post-start`, `pre-merge`,
`post-merge`). Most tools assume they own `.git/worktrees` and do not expose extension
points.

This is a friction signal for ARC's "complement, not replace" stance: tools that own the
worktree without hook surfaces don't easily let ARC plug in. The "external" mode of ARC's
proposed `worktree.management` config has to work *despite* the absence of hooks — by not
requiring them.

### 4.4 Lifecycle / cleanup automation

- Worktrunk: `wt remove` with safety gates (won't delete unmerged branches without consent)
- emdash: stale-detection auto-cleanup on session start (Claude Code v2.1.76)
- Conductor: archive (reversible), no removal
- Everyone else: defers to user

Convergence on "be cautious about cleanup"; divergence on whether the tool helps at all.

### 4.5 Within-workspace session continuity

- emdash: tmux integration (most robust)
- Conductor: archive-and-resume (manual)
- Maestro: electron-store auto-save
- Zed: thread history persists
- Superset: terminals survive restarts
- T3code: localStorage + provider session IDs
- Nora: "resume" lifecycle control documented, mechanism unclear
- Warp local: not documented
- Worktrunk: out of scope (defers to agent's own session)

The most varied dimension. Every tool picks a different point on the persistence spectrum.

---

## 5. Where the Field Has Not Built (ARC's Distinctive Value)

Patterns absent across all 9 tools point to ARC's distinctive value proposition. The field's
silence on these is informative.

### 5.1 Structured planning-artifact pipeline

**No tool models plan-doc → PRD → tasks → activate as a discipline.** They model
"prompt → work" or "issue → work" or "spec.md → work." ARC's full pipeline (incubation in
`backlog/plans/provisional/`, graduation to `planned/`, branch creation, plan-doc evolution
on the WU branch, PRD drafting, task generation, activation, execution, integration,
archive) has no analog.

Conductor's `.context/` directory and Nora's `scope → spec → tasks` are the closest
approximations, but both are flat stores rather than a staged lifecycle.

### 5.2 State machine for WU lifecycle

**No tool models a structured state machine** like WOR's
`Provisional | Planned | Active | Integrating | Shipped`. Their lifecycle is
"spawn → work → archive" with no intermediate states. State transitions, codified value
sets, and dependency-aware sequencing (per WOR scope item 20's `**Depends On:**` field) are
absent.

### 5.3 Sweep-as-you-go integration / single-branch-per-WU

**Every tool punts on what happens to artifacts after merge.** Most tools "archive the
workspace" (Conductor), "remove the worktree" (Worktrunk), or leave it to the user (the
rest). None ship artifacts to a structured archive directory; none model the question of
"how do other in-flight WUs see the new shipped state."

ARC's WOR foundation (single-branch-per-WU + sweep-as-you-go integration + per-worktree
isolation invariant) is unique in the surveyed field.

### 5.4 Inter-WU planning coordination

**Zero tools model inter-WU planning concurrency.** The field has not named the problem —
how do two in-flight WUs coordinate when one's planning artifacts evolve and the other
depends on that evolution?

This validates WOR's existing position (§ Pressure Points "Inter-WU planning freshness"):
out-of-band human coordination is the field's modal answer; ARC defers any codified
inter-WU sync mechanism to CWC downstream.

### 5.5 Per-task interlocks / mandatory review stops

Built-in diff review exists in 6 of 9 tools, but **per-step approval gates are rare**. Only
T3code documents explicit supervised mode (per-action approval) and plan mode (generate
proposal before execute). ARC's per-task interlock (mandatory stop after task completion,
explicit user approval before advancing) is distinctive.

The dedicated apps' review pattern is end-of-work / pre-PR, not mid-task. ARC's discipline
is finer-grained.

### 5.6 Multi-developer async handoff at workspace granularity

ARC's user-notes-via-git-notes (per the user-sync work) handles per-developer working state
attached to commits. Across the surveyed tools, only Warp documents anything analogous
(session sharing). ARC is more sophisticated here than the field.

### 5.7 Cross-tool spec-input adaptation

**No tool accepts another tool's spec format.** Each invents bespoke mechanisms (§ 3.7).
ARC's existing Origin ⊥ Spec orthogonality (`**Origin:**` accepts external trackers,
`**Spec:**` always points at an ARC-owned artifact) is the natural answer to this
divergence — see § 6.1.

---

## 6. ARC-Relevance Observations (Evidence-Anchored)

These observations connect findings above to ARC's existing design. They are descriptive
("ARC's existing X already addresses field pattern Y"), not prescriptive ("ARC should do
X"). Design decisions land in `temp-worktree-trio-design-deltas.md` and the trio plans.

### 6.1 ARC's Origin ⊥ Spec orthogonality is the natural answer to spec-doc lock-in (§ 3.7)

WOR's existing design (Working Thesis + scope item 11 cascade + Design Decisions §
"Origin ⊥ Spec orthogonality") establishes:

- `**Origin:**` accepts external references (issue URL, external tool's spec doc, "Internal,"
  verbal request)
- `**Spec:**` always points at an ARC-owned artifact (plan-*, prd-*, tasks-*, or empty
  during planning)
- The two fields are independent

This means ARC's `meta-{name}.md` already supports the input-agnostic shape the field is
groping toward. A cold-start primitive entering a fresh worktree can take any input — a
Conductor-style `.context/` reference, a GitHub issue, an emdash task name, an existing
ARC plan-doc, or just a name + brief description — and produce a meta-* file with the
appropriate Origin/Spec values. The principle is already in place; the trio plans need a
surface that activates it at boot time.

### 6.2 ARC's task-interlock discipline contrasts with the field's end-of-work review pattern (§ 3.5)

The field converges on built-in diff/review UIs at end-of-work / pre-PR boundaries
(Conductor's Diff Viewer, emdash, Maestro, Superset, Nora). ARC's per-task interlock
(mandatory stop after each task, explicit user approval) is finer-grained.

T3code's supervised mode and plan mode are the only documented analogs. ARC's task-interlock
is distinctive across the surveyed field.

### 6.3 ARC's WU lifecycle is structurally richer than any surveyed tool's (§ 5.1, 5.2, 5.3)

The field has spawn → work → archive. ARC has provisional → planned → active → integrating
→ shipped, with separate artifacts per phase, structured state transitions, and explicit
dependency tracking (post-WOR). This is a real differentiator, not legacy ceremony.

### 6.4 The audience-philosophy divergence is by design (§ 3.3)

The field's tools optimize for "go fast, 10+ parallel sessions, multiple repos, minimum
human involvement per session." ARC's discipline (CWC's anti-pattern guidance around
single-thread attention, per-task interlocks, structured planning artifacts) optimizes for
the opposite: limited, thoughtful, restrained parallelism with deep human involvement per
session.

Both are valid stances. The research finding is not "ARC should change posture" but "ARC's
posture is intentionally non-default in the tool ecosystem; adopters and onboarding
materials need to make that explicit." ARC and the parallel-agent tools serve overlapping
populations with different work styles.

### 6.5 Defaulting to ARC-managed worktrees is the right safe choice

8 of 9 tools use git worktrees, but **none expose extension hooks for external
orchestrators** (only Worktrunk, the CLI, does). For an adopter not using one of these tools
(terminal + IDE separately, CI environments, automation contexts), ARC must be self-sufficient
on worktree creation. That makes `worktree.management: arc` the right default; `external` is
opt-in for adopters who deliberately compose ARC with one of the workspace-management tools.

### 6.6 Worktree-foundation pressure-test closes here

(Per WOR Open Questions § "Worktree-trio dev-ergonomics pressure test".)

WOR's Open Questions § "Worktree-trio dev-ergonomics pressure test (forward-compat watch)"
flagged this exact research as deferred but not WU-blocking. The pressure test closes with
this finding: **research findings bleed into trio scope (WF most affected, then AWL, then
CWC), but do NOT bleed back into WOR scope materially.** WOR's foundation
(single-branch-per-WU, location-by-state, sweep-as-you-go, Origin/Spec orthogonality, capture
pipeline) survives unchanged. WOR's PRD-readiness is not gated by this research.

---

## 7. Sources

Sources organized by tool. URLs deduplicated; redundant cluster-internal references collapsed.

### Cluster 1: Multi-Purpose Tools

**Zed:**

- <https://zed.dev/ai> — main AI/agent features page
- <https://zed.dev/docs/ai/agent-panel> — thread management, context addition, token tracking
- <https://zed.dev/docs/ai/parallel-agents> — multi-thread isolation, worktree usage,
  per-thread configuration
- <https://zed.dev/docs/worktree-trust> — trust model, restricted mode, configuration
- <https://zed.dev/blog/secure-by-default> — security-by-default and worktree isolation
  philosophy
- <https://zed.dev/blog/parallel-agents> — parallel-agents design rationale
- <https://zed.dev/docs/ai/external-agents> — Claude Agent, Gemini CLI, Codex integration
- <https://zed.dev/docs/remote-development> — SSH, dev containers, TrustedWorktrees
- <https://github.com/zed-industries/zed> — repository, community discussions

**Warp:**

- <https://www.warp.dev/> — overview of Warp Terminal and Oz platform
- <https://www.warp.dev/oz> — Oz cloud orchestration overview
- <https://docs.warp.dev/agent-platform/cloud-agents/overview/> — cloud agents, container
  isolation, lifecycle
- <https://docs.warp.dev/agent-platform/cloud-agents/platform/> — Oz runtime details
- <https://docs.warp.dev/knowledge-and-collaboration/warp-drive/> — shared Workflows,
  Notebooks, Prompts, Rules
- <https://docs.warp.dev/knowledge-and-collaboration/session-sharing> — live terminal
  session collaboration
- <https://docs.warp.dev/knowledge-and-collaboration/admin-panel> — team admin panel
- <https://www.warp.dev/blog/2024-in-review> — Agent Mode debut, Session Sharing launch
- <https://github.com/warpdotdev/warp> — repository (MIT UI, AGPL v3 core)

**Worktrunk:**

- <https://worktrunk.dev/> — overview, core commands
- <https://worktrunk.dev/config/> — storage templates, naming, cleanup safeguards
- <https://worktrunk.dev/merge/> — eight-step merge pipeline, hook integration
- <https://worktrunk.dev/tips-patterns/> — parallel agent workflows, environment isolation
- <https://worktrunk.dev/faq/> — design decisions, lifecycle management
- <https://github.com/max-sixty/worktrunk> — repository, README, CLAUDE.md
- <https://github.com/max-sixty/worktrunk/blob/main/CLAUDE.md> — agent handoff patterns,
  data-safety principles

### Cluster 2: Established Dedicated Apps

**Conductor:**

- <https://www.conductor.build/> — main site
- <https://www.conductor.build/docs/concepts/workspaces-and-branches> — workspace/branch
  mechanics
- <https://www.conductor.build/docs/concepts/workflow> — workflow and lifecycle
- <https://www.conductor.build/docs/first-workspace> — workspace creation
- <https://www.conductor.build/blog/context> — `.context/` directory design
- <https://docs.conductor.build/core/parallel-agents> — parallel concurrency guidance
- <https://docs.conductor.build/core/diff-viewer> — diff viewer and review UI
- <https://www.conductor.build/changelog> — feature changelog
- <https://elite-ai-assisted-coding.dev/p/the-parallel-agent-multiplier-conductor-with-charlie-holtz>
  — Conductor design philosophy and branching strategy

**emdash:**

- <https://github.com/generalaction/emdash> — repository and README
- <https://www.startuphub.ai/ai-news/claudes-corner/2026/claudes-corner-emdash-yc-w2026>
  — design philosophy and multi-agent vision
- <https://emdash.sh/docs/tasks> — task creation workflow (WebFetch 403; supplemented by
  search results)
- <https://emdash.sh/docs/tmux-sessions> — terminal persistence and tmux integration
- <https://emdash.sh/docs/project-config> — configuration and `preservePatterns`
- <https://emdash.sh/changelog> — feature changelog
- <https://github.com/generalaction/emdash/pull/1004> — reserve worktree cleanup
- <https://github.com/generalaction/emdash/pull/1084> — `EMDASH_TASK_NAME` consistency
- <https://github.com/anthropics/claude-code/issues/34282> — Claude Code stale worktree
  cleanup

**Maestro:**

- <https://github.com/RunMaestro/Maestro> — repository
- <https://github.com/RunMaestro/Maestro/blob/main/ARCHITECTURE.md> — architecture and
  design
- <https://docs.runmaestro.ai/git-worktrees> — git worktree documentation
- <https://docs.runmaestro.ai/autorun-playbooks> — Auto Run and session model

### Cluster 3: Newer Dedicated Apps

**Super:** No accessible documentation; not researchable from the cited URL.

**Superset (`superset.sh`):**

- <https://docs.superset.sh/> — overview, workspaces, FAQ
- <https://docs.superset.sh/overview> — design philosophy
- <https://docs.superset.sh/workspaces> — workspace creation modes
- <https://docs.superset.sh/first-workspace> — initial setup and context handoff
- <https://docs.superset.sh/setup-teardown-scripts> — setup, teardown, run scripts
- <https://docs.superset.sh/faq> — worktree storage, terminal persistence, team features
- <https://superset.sh/blog/working-with-worktrees-in-superset> — git worktree creation,
  isolation, lifecycle
- <https://superset.sh/blog/parallel-coding-agents-guide> — concurrency limits, review
  workflow
- <https://github.com/superset-sh/superset> — repository, README, releases
- <https://github.com/superset-sh/superset/blob/main/README.md> — main README

**T3code:**

- <https://t3.codes/> — homepage
- <https://github.com/pingdotgg/t3code> — repository and README
- <https://pingdotgg-t3code.mintlify.app/> — documentation introduction
- <https://betterstack.com/community/guides/ai/t3-code/> — third-party guide on features,
  git integration, approval modes
- <https://github.com/pingdotgg/t3code/issues/510> — session persistence and resumability
- <https://deepwiki.com/pingdotgg/t3code/3.5-settings-and-configuration> — settings
  documentation

**Soloterm (Solo):**

- <https://soloterm.com/> — homepage and feature overview
- <https://soloterm.com/solo-vs-conductor> — distinction between Solo (process manager) and
  Conductor (Melty Labs agent orchestrator, not `conductor.build`)
- <https://soloterm.com/download> — download page

**Nora:**

- <https://www.withnora.run/> — homepage and design philosophy
- <https://github.com/citosoft/nora> — repository, README
- <https://github.com/citosoft/nora/blob/main/ARCHITECTURE.md> — architecture and design
  decisions

---

*Sources captured during research dispatched 2026-05-12. PRD-graduation triage will trim to
load-bearing references at WF / AWL / CWC PRD time.*

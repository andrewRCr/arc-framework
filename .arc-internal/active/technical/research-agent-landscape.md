# Research: AI Coding Agent Landscape

**Task:** 1.1.a — `tasks-philosophy-configurability.md`
**Date:** 2026-02-23
**Sources:** Two research passes — (1) training knowledge baseline, (2) web-verified
supplemental research with 50+ official docs, blogs, and community sources.

**Purpose:** Understand how AI coding agents work operationally to inform ARC's session
model, agent-agnosticism, and configurability decisions (PRD requirements 1, 3).

---

## IDE-Integrated Agents

### Cursor

**Platform:** VS Code-based IDE with foreground + background agent capabilities.

**Session & Context:**

- Foreground: conversation-persistent within IDE session; context lost on restart
- Background Agents (0.50+ release): run in isolated Ubuntu VMs with internet access
- Context window inherited from underlying model (Claude, GPT, etc.); no documented
  hard constraint
- No persistent cross-session memory

**Autonomy & Human Collaboration:**

- Background agents work autonomously on separate branches
- Autonomy managed through plan approval, optional step-by-step gating, external command
  approval rules, and short feedback loops with test results
- No explicit "autonomy slider" — staged autonomy via plan → approve → monitor
- Self-healing on failures (testing, linting, formatting without supervision)

**Git Integration:**

- Background agents: auto-create branch, draft PR, notify on completion
- Human reviews PR and merges — no main branch contamination
- No explicit Conventional Commits pattern; commits implicit within PR

**Sources:**

- [Background Agents at Scale][cursor-bg-agents]
- [Cursor AI Review 2026][cursor-review]
- [Background Agents Changelog][cursor-changelog]

### Windsurf (Codeium)

**Platform:** VS Code-based IDE with "Cascade" multi-step agent flows.

**Session & Context:**

- Workspace-level context during active session; session tied to IDE instance
- Direct file operations with preview/approval workflow

**Autonomy & Human Collaboration:**

- Explicit approval gates for file modifications
- "Cascade" flows enable multi-step agent reasoning

**Note:** Launched late 2024; 2026 operational details require current verification.
Community feedback on actual context handling vs. marketing claims is a research gap.

### GitHub Copilot

**Platform:** IDE-integrated agent (VS Code, JetBrains, Eclipse, Xcode, Visual Studio)
plus web-based Copilot Workspace.

**Session & Context:**

- Chat interface: 64K tokens standard, 128K in VS Code Insiders
- File context limits: evidence of 10-file effective limit in some modes,
  ~6,000 lines/file
- Agent Mode: reportedly "no file limitation" per community reports, but practical
  limits exist
- Dynamic context assembly; Copilot manages context on top of model's native window
- No cross-session memory

**Autonomy & Human Collaboration:**

- **Plan Mode** (all IDEs): agent outlines feature before writing code; user reviews
  and refines plan, then execution proceeds
- **Agent Mode**: analyzes code, proposes edits, runs tests, validates results;
  multi-file scope; recognizes runtime errors and attempts self-healing
- Autonomy constrained by explicit human approval of plans
- **Copilot Workspace** (web): turns task descriptions into plans, multi-file changes,
  PRs; available to all paid users (past preview as of 2026); shareable, versioned
  context for reproducibility

**Git Integration:**

- PR generation integrated via Workspace
- Branch handling through Workspace
- No explicit auto-commit pattern

**Sources:**

- [GitHub Copilot Features][copilot-features]
- [Copilot Workspace Review][copilot-workspace-review]
- [GitHub Community: Context Limits][copilot-context-limits]

### Google Antigravity

**Platform:** Agent-first IDE (VS Code fork with custom agent runtime). Released late
2025.

**Session & Context:**

- 1M token native context window via Gemini 3 Pro
- **Effective working context: ~200K tokens** per conversation (the rest is overhead)
- Token quota refreshes every 5 hours; rate-limit lockouts of 4-7 days reported after
  quota exhaustion
- Effectively handles repos up to ~400K LOC; larger codebases degrade context quality
- Agents can save context/snippets to a knowledge base for future tasks (persistence
  model unclear)

**Autonomy & Human Collaboration:**

- Two views: Editor view (traditional IDE + agent sidebar) and Manager view
  (multi-agent orchestration)
- High autonomy; agents autonomously plan, execute, and verify tasks across editor,
  terminal, and browser
- Manager view enables coordinating multiple agents in parallel across workspaces

**Git Integration:**

- No explicit auto-commit patterns documented; standard VS Code git operations

**Relationship to Jules:** Separate product. Jules is async/GitHub-native; Antigravity
is synchronous/IDE-native. Community-built bridges can connect them.

**Sources:**

- [Google Developers Blog: Antigravity][antigravity-blog]
- [Antigravity Context Explained][antigravity-context]
- [Avoiding Rate Limits][antigravity-rate-limits]

### Claude Code (Anthropic CLI Agent)

**Platform:** Terminal-based CLI agent. *This is the environment we're running in.*

**Session & Context:**

- Full conversation history maintained within a single session (~200K token window)
- **Clear session boundaries**: session has defined start and end; work spanning sessions
  requires explicit handoff (git commits, documented state)
- Sub-agent dispatching available for parallel research/exploration tasks
- Context compression available when approaching limits

**Autonomy & Human Collaboration:**

- **Explicit human-in-the-loop**: structured approval gates for file operations
    - Read: no approval needed
    - Edit/Write: require prior Read; exact-match replacement for safety
    - Bash: subject to configurable auto-approval patterns
- Humans can interrupt mid-task at any point
- No implicit autonomy: cannot auto-commit, auto-push, or make unilateral VCS decisions

**Git Integration:**

- All git operations require explicit user instruction
- No auto-commit, no auto-branch, no auto-PR
- Full git CLI access but controlled by approval gates

### Cline / Roo Code (VS Code Extensions)

**Cline:**

- Per-conversation thread within VS Code; threads are independent
- Direct file access with approval flows; can read entire project structure
- Inline preview + approval for changes; iterative refinement within thread

**Roo Code:**

- Similar to Cline with additional multi-step orchestration features
- Higher autonomy: can execute complex chains of edits and test runs
- Maintains state across sequential operations within a single thread

### Amazon Q Developer

**Platform:** IDE-integrated + cloud agentic coding agent (AWS).

**Session & Context:**

- Chat interface: 100 kB character limit
- Context files limited to 75% of model's context window; files exceeding limit
  auto-dropped
- At ~80% capacity, suggests compaction; `/compact` creates summary preserving
  essential info
- Up to 10 tabs open (each separate conversation); no cross-conversation context
- Agentic chat limits: 1,000 interactions/month, 4,000 LOC/month for transformations

**Autonomy & Human Collaboration:**

- High: autonomously implements features, refactors, tests, documents
- Approval required for plan execution (not step-by-step)
- Real-time transparency: shares updates on state, files modified, changes in progress
- Analyzes entire codebase, maps multi-file plans, executes changes + tests

**Git Integration:**

- PR generation capability (indirect, via code changes)
- No documented auto-commit patterns

**Benchmark:** 66% on SWE-Bench Verified (April 2025) — top of leaderboard at time
of measurement.

**Sources:**

- [Amazon Q Developer Features][amazon-q-features]
- [Chat Context Handling][amazon-q-context]
- [Reinventing Amazon Q Agent][amazon-q-agent]

### Augment Code

**Platform:** IDE-integrated agent (VS Code, JetBrains) with persistent memory layer.

**Session & Context:**

- **200K context tokens** with intelligent ranking to reduce hallucinations (40% fewer
  on enterprise codebases vs. naive context inclusion)
- Designed for large-scale codebases (100K+ files); multi-repo workspace indexing
- Real-time repository indexing keeps semantic understanding current

**Persistent Memory Across Sessions (unique):**

- **Only tool with documented persistent cross-session memory**
- Agent decides what's worth persisting: long-term goals, debugging decisions,
  architectural patterns, coding style
- Memory Review feature: users can review, edit, curate memories before finalization
- Memories maintained across days/weeks of development

**Autonomy & Human Collaboration:**

- High: handles architectural decisions and complex refactors
- Memory-guided: remembers previous decisions and infrastructure patterns
- Adaptive: learns developer patterns without retraining

**Git Integration:** Not explicitly documented.

**Sources:**

- [Augment Code][augment-code]
- [How Augment Solved Large Codebase Problem][augment-large-codebase]
- [Memory Review Feature][augment-memory-review]

---

## CLI Agents

### Aider

**Platform:** Terminal-based CLI AI pair programming tool. Open source.

**Session & Context:**

- Whole chat history included in every prompt to LLM
- Repository map built via ctags (default 1K token budget, configurable)
- Single continuous session per invocation; `/clear` resets history
- No cross-session memory or context persistence
- Large repo strategies: `--subtree-only`, `.aiderignore`, selective file addition

**Autonomy & Human Collaboration:**

- Moderate: edits files based on explicit chat prompts
- No approval gates in standard flow — edits applied immediately
- No built-in multi-file planning (reactive to prompts)

**Auto-Commit Model (distinctive):**

- **Automatic Conventional Commits** after every file edit
- Weak model generates commit messages from diffs + chat history
- Attribution: "(aider)" appended to author/committer metadata
- Pre-session cleanup: commits user's pre-existing uncommitted changes first
  (separates human edits from agent edits)
- Configurable: `--no-auto-commits` disables; `--commit-prompt` customizes
- No branch creation; works in current branch; no PR generation

**Sources:**

- [Aider: AI Pair Programming][aider]
- [Aider Git Integration][aider-git]
- [Aider Repository Map][aider-repomap]

---

## Cloud / Remote Agents

### OpenAI Codex (Cloud Agent)

**Platform:** Cloud-based agent with sandboxed task execution. *Not* the deprecated
Codex model — this is the 2025+ autonomous coding product.

**Session & Context:**

- Each task runs in an isolated OpenAI-managed container
- Internet access disabled by default (prompt injection prevention); admin-configurable
- Repository pre-loaded into sandbox; full multi-file access within task
- Session duration tied to task completion
- No persistent memory between tasks

**Autonomy & Human Collaboration:**

- High: writes features, answers codebase questions, fixes bugs, proposes PRs
- Edit → validate → iterate cycle; self-healing on test failures
- Shareable results and audit trails

**Git Integration:**

- PR proposal capability
- GitHub repository integration
- No explicit auto-commit patterns

**Recent (Feb 2026):** macOS app for managing multiple AI coding agents; evolution
toward multi-agent command center.

**Sources:**

- [Codex Cloud Documentation][codex-cloud]
- [Codex Security Model][codex-security]
- [Codex Pricing][codex-pricing]

### Google Jules

**Platform:** Asynchronous cloud-based coding agent. Gemini 2.5 Pro. Generally
available (exited beta August 2025).

**Session & Context:**

- Each task runs in a dedicated cloud VM
- Session = continuous unit of work initiated with prompt + repository
- Concurrent task handling supported
- No documented persistent memory between sessions

**Autonomy & Human Collaboration:**

- High: reads code autonomously, shows plan and reasoning before changes
- **Key differentiator: async operation** — developer does not watch in real-time;
  completion notifications when ready for review
- Unlike synchronous tools (Cursor, Windsurf, Antigravity), Jules is non-blocking

**Git Integration:**

- GitHub-native: triggered from issues, PRs, or webhooks
- PR generation for review
- Jules Tools CLI + Jules API for programmatic integration

**Availability:** Free plan (15 tasks/day, 3 concurrent), Pro/Ultra tiers.

**Relationship to Antigravity:** Separate products. Antigravity is synchronous IDE;
Jules is async GitHub-native agent. Can be used independently or together via
community bridges.

**Sources:**

- [Jules: Autonomous Coding Agent][jules]
- [Jules Tools CLI][jules-tools]
- [TechCrunch: Jules Out of Beta][jules-beta]

### Warp Oz

**Platform:** Cloud-based multi-agent orchestration platform.

**Session & Context:**

- Docker container + git repo + startup commands define "Environments"
- Agents run in isolated, sandboxed Docker environments
- Full repository access within Docker environment (pre-cloned)
- Multi-repo capable: changes across multiple repos in a single task
- No explicit context window limit documented; env-scoped

**Autonomy & Human Collaboration:**

- **Purpose-built for multi-agent orchestration**: can launch hundreds of agents
  in parallel
- REST API and CLI for task creation, status querying, history inspection
- Every agent run generates shareable link and audit trail
- Deployment via cron, webhooks, or API triggers
- Human role is primarily programmatic; Web UI available for interactive management

**Git Integration:**

- Full repo cloning via environment setup
- PR generation and push capable within agents
- No documented auto-commit patterns

**Model Support:** Claude, Codex, Gemini, customizable via API.

**Sources:**

- [Warp: Introducing Oz][warp-oz]
- [Warp Oz Documentation][warp-oz-docs]
- [Warp Oz API & SDK][warp-oz-api]

### Claude Code (Headless/API Mode)

**Operational Model:**

- Stateless request-response pattern (no implicit file system access)
- Full ~200K token window but must be explicitly populated per request
- **Fundamental difference from CLI mode**: request-level granularity, not
  conversation-level persistence
- No persistent session state; requires explicit context injection
- Suitable for CI/CD integration, not interactive development

---

## Factory-Style / High-Autonomy Agents

### Devin (Cognition AI)

**Session & Context:**

- **Full workspace context**: persistent access to entire development environment
- **Long-lived sessions**: works across extended timeframes without context resets
- Browser-based: runs in web environment with persistent state
- Environment simulation: executes code, runs tests, examines output in real-time

**Autonomy & Human Collaboration:**

- **Highest autonomy observed**: accepts natural language task descriptions, performs
  end-to-end development (code generation, testing, debugging, environment setup)
- Agentic loop: perception → planning → action → observation
- Human intervention rare — primarily for deployment approval, ambiguous requirements,
  and final acceptance
- Can create branches and PRs autonomously; cannot push to main without approval

### SWE-Agent (Princeton NLP)

**Session & Context:**

- **Issue-driven**: one session per GitHub issue
- Repository understanding through code search and navigation tools
- Tool-use based: grep, git, Python REPL (not direct file access)
- Trajectory-based planning: search → locate → implement → test

**Autonomy & Human Collaboration:**

- High for exploration and implementation; can navigate large codebases
- Cannot merge to main (human review required)
- Research-oriented: open-source proof-of-concept, not a commercial product

**Source:** [SWE-Agent GitHub][swe-agent]

### OpenHands (Formerly OpenDevin)

**Platform:** Open-source agentic framework for building autonomous agents.

**Session & Context:**

- Customizable: can maintain persistent state in agent instance
- Agent instance-driven: long-lived agent accumulates context across tasks
- Event-driven architecture in sandboxed Linux environment

**Autonomy & Human Collaboration:**

- Framework-dependent: autonomy level depends on configuration
- Supports varied patterns: prompting, approval gates, full autonomy
- Integrates terminal, file system, browser, code editor

**Source:** [OpenHands GitHub][openhands]

### Bolt.new / Lovable / v0 (App Generation Platforms)

**Specialized high-autonomy agents** for UI/web app generation:

- Input: natural language or uploaded design file → Output: functional web app
- **Generative-first**: output is working code, not suggestions
- Project-scoped sessions with live preview and iterative refinement
- **Bounded scope**: greenfield only; not designed for existing codebases
- Cannot effectively refactor or optimize — requires human polish for production

---

## Cross-Cutting Analysis

### Session Model Taxonomy

**Pattern A: Conversation-Persistent Sessions**

- Examples: Claude Code CLI, Cline, Roo Code, Augment Code
- Context maintained across multiple turns in single conversation thread
- Human can reference earlier decisions without re-explaining
- Session boundaries are explicit (new thread/invocation = new session)
- Ideal for: complex, multi-phase work requiring fine-grained human control

**Pattern B: Task-Driven Sessions**

- Examples: GitHub Copilot Agent, SWE-Agent, Jules, OpenAI Codex, Warp Oz
- Session scoped to explicit task definition (issue, PR description, API call)
- Agent works to completion with minimal human interruption
- New task = new session with fresh context
- Ideal for: well-defined, bounded tasks with clear success criteria

**Pattern C: Long-Lived Agentic Sessions**

- Examples: Devin, OpenHands, Bolt.new projects
- Agent maintains state over extended periods (hours/days)
- Session boundaries unclear or deliberately extended
- Ideal for: complex, exploratory work with emergent requirements

**Pattern D: Persistent Memory (emerging)**

- Examples: Augment Code (only documented implementation)
- Context persists across session boundaries via explicit memory system
- Agent accumulates understanding of codebase, decisions, and patterns
- User can review/edit/curate persisted memories
- Fundamental differentiator from all other approaches

### Context Window Comparison

| Tool           | Context Window  | Working Context   | Notes                            |
|----------------|-----------------|-------------------|----------------------------------|
| Antigravity    | 1M tokens       | ~200K             | Gemini 3; repo-dep. degradation  |
| Augment Code   | 200K tokens     | 200K              | Intelligent ranking; 100K+ files |
| Claude Code    | ~200K tokens    | ~200K             | Full conversation history        |
| Amazon Q       | 100K chars      | ~100K             | Auto-drops files at 75%          |
| GitHub Copilot | 64K-128K tokens | Varies by mode    | Chat vs. agent vs. edits differ  |
| Aider          | Model-dependent | Full chat history | No limit enforcement             |
| Cursor         | Model-dependent | Large             | No documented constraint         |
| Codex          | Not documented  | Task-scoped       | Per-task sandbox                 |
| Jules          | Not documented  | Session-scoped    | Cloud VM per session             |
| Warp Oz        | Not documented  | Env-scoped        | Full repo pre-loaded             |

**Key finding:** Antigravity advertises 1M but effective window is ~200K. Most tools
don't document hard limits. Augment Code and Claude Code both operate around 200K
effective context. GitHub Copilot is notably smaller (64-128K).

### Session Duration & Persistence

| Tool         | Session Duration     | Cross-Session Memory        | Notable Behavior              |
|--------------|----------------------|-----------------------------|-------------------------------|
| Augment Code | Per-conversation     | **Yes** (persistent memory) | Only tool with memory         |
| Antigravity  | 5-hour quota window  | No (knowledge base unclear) | 4-7 day lockouts              |
| Claude Code  | Until context fills  | No                          | Explicit handoff protocol     |
| Amazon Q     | Per-conversation tab | No                          | Up to 10 concurrent tabs      |
| Aider        | Per-invocation       | No                          | `/clear` resets mid-session   |
| Cursor       | Per-agent execution  | No                          | Background agents continuous  |
| Copilot      | Per-conversation     | No                          | Plan preserved within session |
| Codex        | Per-task sandbox     | No                          | Task-scoped isolation         |
| Jules        | Per-task session     | No                          | Async; notifications on done  |
| Warp Oz      | Per-agent task       | No                          | Docker env per execution      |

### Auto-Commit & Git Integration Patterns

| Tool                | Auto-Commit                    | Branch Handling     | PR Creation    |
|---------------------|--------------------------------|---------------------|----------------|
| Aider               | Yes (Conventional Commits)     | Current branch only | No             |
| Cursor (background) | Implicit via PR                | Auto-creates branch | Yes            |
| Copilot Workspace   | Implicit via PR                | Workspace-managed   | Yes            |
| OpenAI Codex        | Implicit via PR                | Implicit            | Yes            |
| Jules               | No (explicit)                  | GitHub-native       | Yes            |
| Claude Code         | No (explicit user instruction) | No auto-branch      | No             |
| Amazon Q            | No (explicit)                  | Via PR (indirect)   | Possible       |
| Devin               | Can auto-commit in sandbox     | Auto-creates branch | Yes            |
| Augment Code        | Not documented                 | Not documented      | Not documented |
| Antigravity         | Not documented                 | Not documented      | Not documented |
| Warp Oz             | Not documented                 | Via API/Docker      | Possible       |

**Key finding:** Only **Aider** implements automatic Conventional Commits natively.
Cloud/background agents (Cursor, Copilot, Codex, Jules) abstract commits behind
PR workflows. Claude Code and Amazon Q require explicit human-initiated git operations.

### Human-AI Collaboration Spectrum

```text
HUMAN-DRIVEN ←————————————————————————————————→ AI-DRIVEN

Copilot base    Claude Code    Cursor/Cline    Copilot Agent    Jules/Codex    Devin    Bolt.new
(suggest)       (approve each) (direct iter.)  (describe→PR)    (async task)   (E2E)    (generate)
```

**Key inflection points:**

- **Approval gates** (Claude Code, Cursor) vs. **review-based acceptance** (Copilot
  Agent, Jules, Codex) vs. **full autonomy in sandbox** (Devin, OpenHands)
- **Task scope clarity** affects autonomy: fuzzy requirements → more human involvement
- **Existing codebase** work requires more oversight; greenfield allows higher autonomy

### Multi-Agent Orchestration

**Native multi-agent support:**

- **Warp Oz**: Purpose-built; hundreds of agents in parallel via REST API/SDK
- **Antigravity**: Manager view for parallel agents across workspaces
- **Cursor**: Multiple background agents on separate branches
- **OpenAI Codex**: macOS app evolving toward multi-agent command center

**Single-agent focus:** Claude Code, Aider, Jules, Amazon Q, Augment Code, Copilot,
SWE-Agent, OpenHands

**Coordination models vary:** Warp Oz is programmatic (API/webhooks), Antigravity is
UI-driven, Cursor uses branch-per-agent with human merge. No tool fully orchestrates
heterogeneous agents across different platforms.

### Autonomy Control Mechanisms

**Explicit per-action approval gates:**

- Claude Code, Cursor (optional), Cline
- Agent cannot proceed without human approval for defined operations
- Highest human control; highest overhead per action

**Plan-then-execute approval:**

- GitHub Copilot Plan Mode, Antigravity, Amazon Q
- Human approves plan; agent executes autonomously within approved scope
- Medium control; lower overhead (one approval per task)

**Review-based acceptance:**

- GitHub Copilot Agent, Jules, OpenAI Codex, Cursor background agents
- Agent completes work; human reviews and accepts/rejects via PR
- Lower per-action control; catches problems before merge

**Sandbox isolation:**

- Devin, OpenHands, OpenAI Codex, Warp Oz, Cursor background agents
- Full autonomy within bounded environment; cannot affect production
- Control via environment boundaries rather than per-action gates

---

## Implications for ARC Framework

### Safe Assumptions (Agent-Agnostic)

1. **Session boundaries will exist.** All agents have some notion of a session. ARC
   should assume work can span sessions and design for explicit handoff points (git
   commits, documented state).

2. **Context is never infinite.** Effective working context clusters around 100-200K
   tokens across tools. ARC should design task units to fit within this range.

3. **Human review is universal.** Even the highest-autonomy agents (Devin, Bolt.new)
   assume human review before production. ARC should assume human-in-the-loop at
   critical decision points.

4. **Git is the universal handoff mechanism.** Commits, branches, and PRs are the
   common abstraction across all tools. ARC should use git as the canonical interface
   for work results.

5. **Multi-agent is arriving but immature.** Warp Oz, Antigravity, and Cursor
   support multi-agent patterns; no heterogeneous orchestration exists yet. ARC should
   acknowledge multi-agent without designing exclusively for it.

### Unsafe Assumptions (Tool-Specific)

1. **Do NOT assume persistent memory across sessions.** Only Augment Code has this.
   ARC's handoff mechanism (CURRENT-SESSION.md, git commits) is essential for all
   other tools.

2. **Do NOT assume agents create branches/PRs.** Cloud agents do; CLI agents (Claude
   Code, Aider) work in the current branch. ARC should support both patterns.

3. **Do NOT assume a specific approval model.** Per-action (Claude Code), plan-based
   (Copilot), and review-based (Jules) all exist. ARC should define approval
   *points* without prescribing *mechanism*.

4. **Do NOT assume auto-commit behavior.** Only Aider auto-commits. Most tools either
   use PR abstraction or require explicit commit instructions. ARC's commit control
   philosophy must account for both.

5. **Do NOT assume uniform context windows.** Range is 64K (Copilot) to 1M
   (Antigravity nominal). ARC's task sizing should target the practical floor
   (~100K effective) to remain broadly compatible.

---

## Research Gaps & Confidence Assessment

### High Confidence (verified from official docs)

- Aider's Conventional Commit pattern and git integration model
- Warp Oz's Docker environment and REST API orchestration
- Jules's async operation, Gemini 2.5, GitHub-native integration
- Amazon Q's agentic capabilities and SWE-Bench results (66% verified)
- Augment Code's 200K context and persistent memory claims
- Cursor Background Agents' PR generation workflow
- OpenAI Codex sandboxing and isolation model
- Claude Code's approval gates and session model (firsthand)

### Medium Confidence (community reports + announcements)

- Effective context windows (especially Antigravity ~200K vs. advertised 1M)
- Multi-agent coordination patterns across tools
- Session duration and timeout specifics
- Cost structures for preview/early-access tools

### Low Confidence / Research Gaps

- Antigravity's knowledge base persistence mechanism
- Exact context limits for Cursor, Jules, Warp Oz
- GitHub Copilot's file count limits (varies by mode, not officially specified)
- Augment Code's memory architecture (not fully detailed)
- Windsurf's 2026 feature set (thin coverage)
- Devin's current autonomy boundaries (pre-cutoff info only)
- CI/CD integration patterns across tools

---

## Sources

[cursor-bg-agents]: https://decoupledlogic.com/2025/05/29/background-agents-in-cursor-cloud-powered-coding-at-scale/
[cursor-review]: https://prismic.io/blog/cursor-ai
[cursor-changelog]: https://linear.app/changelog/2025-08-21-cursor-agent
[copilot-features]: https://docs.github.com/en/copilot/get-started/features
[copilot-workspace-review]: https://vibecoding.app/blog/github-copilot-workspace-review
[copilot-context-limits]: https://github.com/orgs/community/discussions/180198
[antigravity-blog]: https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/
[antigravity-context]: https://skywork.ai/blog/ai-agent/antigravity-infinite-context-window-explained/
[antigravity-rate-limits]: https://www.howtogeek.com/how-to-use-googles-new-antigravity-ide-without-hitting-rate-limits/
[amazon-q-features]: https://aws.amazon.com/q/developer/features/
[amazon-q-context]: https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/q-in-IDE-chat.html
[amazon-q-agent]: https://aws.amazon.com/blogs/devops/reinventing-the-amazon-q-developer-agent-for-software-development/
[augment-code]: https://www.augmentcode.com
[augment-large-codebase]: https://blog.codacy.com/ai-giants-how-augment-code-solved-the-large-codebase-problem/
[augment-memory-review]: https://www.augmentcode.com/changelog/memory-review
[aider]: https://aider.chat/
[aider-git]: https://aider.chat/docs/git.html
[aider-repomap]: https://aider.chat/docs/repomap.html
[codex-cloud]: https://developers.openai.com/codex/cloud/
[codex-security]: https://developers.openai.com/codex/security/
[codex-pricing]: https://developers.openai.com/codex/pricing/
[jules]: https://jules.google/
[jules-tools]: https://developers.googleblog.com/en/meet-jules-tools-a-command-line-companion-for-googles-async-coding-agent/
[jules-beta]: https://techcrunch.com/2025/08/06/googles-ai-coding-agent-jules-is-now-out-of-beta/
[warp-oz]: https://www.warp.dev/blog/oz-orchestration-platform-cloud-agents
[warp-oz-docs]: https://docs.warp.dev/agent-platform/cloud-agents/platform
[warp-oz-api]: https://docs.warp.dev/reference/api-and-sdk/api-and-sdk
[swe-agent]: https://github.com/princeton-nlp/swe-agent
[openhands]: https://github.com/All-Hands-AI/OpenHands

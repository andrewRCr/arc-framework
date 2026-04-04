# Research: Agent Hooks Landscape Survey

**Date:** 2026-03-10\
**Context:** Off-task-list research for ARC integration evaluation\
**Method:** External research agent with cited sources; gaps explicitly marked

---

## Executive Summary

No formal open standard specifically for agent hooks exists, though the **Agents.md**
specification (2025) and **Agent Skills** (2024-2025) are emerging governance frameworks
adopted across major platforms. Hook support is now widespread across coding agent platforms,
with significant convergence around JSON configuration, pre/post-action event pairs, and
exit-code-based control semantics. Configuration formats remain platform-specific but
increasingly compatible; Model Context Protocol (MCP) standardizes tool integration rather
than hooks themselves.

---

## 1. Open Standard Status

### Finding: No Dedicated Hook Standard

**Status**: No official open standard exclusively for agent hooks exists.

However, three governance-adjacent standards address agent control and interoperability:

#### A. Agents.md (2025) — Emerging Standard

- **Specification**: <https://agents.md/>
- **GitHub**: <https://github.com/agentsmd/agents.md>
- **Governance body**: Community-maintained (no single governing authority yet)
- **Scope**: Machine-readable manifest and protocol suite for AI coding agent interoperability
- **Lifecycle hooks**: Defines evented lifecycle stages — `create`, `plan`, `approve`,
  `execute`, `complete`, `audit` — with telemetry hooks and checkpoint events where humans
  can approve/veto actions
- **Status**: Actively adopted; no formal governance body, but multiple platforms recognize it
- **Source**: [What Is Agents.md? — remio.ai][agents-md-guide]

#### B. Agent Skills (Dec 2024) — Open Standard

- **Specification**: <https://agentskills.io/specification>
- **GitHub**: <https://github.com/agentskills/agentskills>
- **Governing body**: Anthropic (published as open standard, not governed by standards body)
- **Scope**: Reusable skill modules (folders of instructions, scripts, resources) that agents
  discover and execute
- **Hook relationship**: Skills are validated via hooks; hooks execute before/after skill
  invocation
- **Adoption**: Microsoft, OpenAI, Atlassian, Figma, Cursor, GitHub
- **Sources**: [Anthropic Engineering — Agent Skills][anthropic-skills],
  [The New Stack — Agent Skills][newstack-skills]

#### C. Model Context Protocol (MCP) — Tool Integration Standard

- **Documentation**: <https://modelcontextprotocol.io/>
- **Governing body**: Anthropic
- **Scope**: Standardizes how agents access external tools, data sources, and services
- **Hook relationship**: Indirect; platforms provide `beforeMCPExecution` and
  `afterMCPExecution` hooks to govern MCP tool invocations
- **Status**: De facto standard; adopted by OpenAI (2025), GitHub Copilot, Anthropic
- **Sources**: [Grokipedia — MCP][grokipedia-mcp],
  [MintMCP — MCP governance via hooks][mintmcp-hooks]

**Conclusion**: No standalone open standard governs hook mechanics themselves. Hooks remain
platform-specific. Agents.md and Agent Skills are governance/capability frameworks that
leverage platform-specific hooks underneath.

---

## 2. Platform Support Survey

### Summary Table

| Platform          | Hooks?  | Events | Config Format   | Control Type                 | Maturity             |
|-------------------|---------|--------|-----------------|------------------------------|----------------------|
| Claude Code       | Yes     | 20+    | JSON            | Command, HTTP, Prompt, Agent | Stable               |
| GitHub Copilot    | Yes     | 6      | JSON            | Command                      | Stable (GA Feb 2026) |
| Cursor            | Yes     | 16+    | JSON            | Command                      | Stable (v1.7+)       |
| Windsurf          | Yes     | 12     | JSON            | Command                      | Stable               |
| Gemini CLI        | Yes     | 4      | JSON            | Script                       | Stable               |
| OpenAI Codex CLI  | Yes     | 7+     | TOML, CLI       | Command, Webhook             | Active development   |
| VS Code (Preview) | Yes     | 8      | JSON            | Command                      | Preview              |
| Amazon Q          | Partial | 2+     | Undocumented    | Scripts                      | Limited info         |
| Continue          | Unclear | —      | —               | —                            | Not confirmed        |
| Aider (core)      | Unclear | —      | —               | —                            | Not confirmed        |
| Qwen Code         | Unclear | —      | JSON (MCP)      | —                            | Not confirmed        |
| LangChain         | Yes     | 5      | Python (inline) | Middleware                   | Stable (framework)   |

### Platform Details

#### Claude Code (Anthropic)

- **Configuration**: `~/.claude/settings.json` (global), `.claude/settings.json` (project)
- **Handler types**: Command, HTTP, Prompt, Agent (subagent), MCP tool
- **Key events**: PreToolUse, PostToolUse, SessionStart, SessionEnd, PreCompact,
  UserPromptSubmit, SubagentStart, SubagentStop, TaskCompleted, PermissionRequest,
  PostToolUseFailure, WorktreeCreate, WorktreeRemove, ConfigChange, InstructionsLoaded,
  Notification, TeammateIdle, Stop
- **Control mechanism**: Exit codes (0 = success, 2 = blocking error)
- **Source**: [Claude Code Docs — Hooks][claude-hooks]

#### GitHub Copilot (GitHub/Microsoft)

- **Configuration**: `.github/hooks/*.json` (repository)
- **Handler types**: Shell commands
- **Key events**: sessionStart, sessionEnd, userPromptSubmitted, preToolUse, postToolUse,
  errorOccurred
- **Control mechanism**: preToolUse can approve/deny; others observational
- **Sources**: [GitHub Docs — Hooks configuration][copilot-hooks-config],
  [GitHub Docs — Using hooks][copilot-hooks-usage]

#### Cursor (Anysphere)

- **Configuration**: Workspace or user directory (JSON)
- **Key events (Agent)**: sessionStart, sessionEnd, preToolUse, postToolUse,
  postToolUseFailure, subagentStart, subagentStop, beforeShellExecution,
  afterShellExecution, beforeMCPExecution, afterMCPExecution, beforeReadFile,
  afterFileEdit, beforeSubmitPrompt, preCompact, stop, afterAgentResponse,
  afterAgentThought
- **Key events (Tab/inline)**: beforeTabFileRead, afterTabFileEdit
- **Control mechanism**: Pre-hooks can block with exit code 2
- **Sources**: [InfoQ — Cursor 1.7 Hooks][infoq-cursor], [Cursor Docs — Hooks][cursor-hooks]

#### Windsurf / Codeium (Cascade)

- **Configuration**: System -> user -> workspace inheritance (JSON)
- **Key events**: pre_read_code, pre_write_code, pre_run_command, pre_mcp_tool_use,
  pre_user_prompt, post_read_code, post_write_code, post_run_command, post_mcp_tool_use,
  post_cascade_response, post_cascade_response_with_transcript, post_setup_worktree
- **Control mechanism**: Pre-hooks can block with exit code 2
- **Source**: [Windsurf Docs — Cascade Hooks][windsurf-hooks]

#### Google Gemini CLI

- **Configuration**: `settings.json` (JSON)
- **Key events**: Startup, Shutdown, AfterAgent, Notification
- **Control mechanism**: Observational only; cannot block execution
- **Sources**: [Gemini CLI Docs — Hooks][gemini-hooks],
  [Google Developers Blog — Gemini CLI hooks][google-blog-gemini]

#### OpenAI Codex CLI

- **Configuration**: `~/.codex/config.toml` (TOML), override via CLI flags
- **Key events**: Tool hooks (before/after), file hooks (before/after write), event hooks
  (prompt gating, stop, compact, notification)
- **Features**: Global hooks ordering; project-level configuration via `codex.json`
- **Sources**: [GitHub PR #9796 — Hooks system][codex-pr-hooks],
  [OpenAI Developers — Codex CLI][codex-docs]
- **Note**: RFC #2582 proposes future lifecycle hooks (beforePlan, afterCode, onError)

#### VS Code Agent Hooks (Preview)

- **Configuration**: Workspace/user directory (JSON); compatible with Claude Code/Copilot
  format
- **Key events**: 8 events (exact list subject to Preview changes)
- **Compatibility**: Uses same hook format as Claude Code and Copilot CLI
- **Sources**: [VS Code Docs — Agent hooks][vscode-hooks],
  [VS Code Blog — Making agents practical][vscode-blog-agents]

#### Amazon Q Developer

- **Configuration**: Not explicitly documented
- **Key events**: conversation_start, per_prompt (context hooks for dynamic injection)
- **Status**: *Not confirmed* — context hooks exist but detailed lifecycle spec is unclear
- **Sources**: [AWS DevOps Blog — Amazon Q CLI][aws-q-cli],
  [Medium — Maximizing Amazon Q CLI][medium-q-cli]

#### Continue IDE

- **Status**: *Not confirmed* — no hook documentation found

#### Aider (aider.chat)

- **Core CLI**: *Not confirmed* — official docs lack hook specification
- **AiderDesk** (desktop variant): supports hooks (onTaskCreated, onTaskClosed,
  onPromptSubmitted, onAgentStarted, onAgentFinished, onAgentStepFinished)
- **Source**: [Aider Options Reference][aider-docs]

---

## 3. Lifecycle Events Comparison

<!-- markdownlint-disable MD056 -->

| Event           | Claude Code           | Copilot             | Cursor                        | Windsurf                      | Gemini CLI   | Codex CLI     | VS Code | Amazon Q           |
|-----------------|-----------------------|---------------------|-------------------------------|-------------------------------|--------------|---------------|---------|--------------------|
| Session Start   | SessionStart          | sessionStart        | sessionStart                  | —                             | Startup      | —             | Yes     | conversation_start |
| Session End     | SessionEnd            | sessionEnd          | sessionEnd                    | —                             | Shutdown     | —             | Yes     | —                  |
| Pre-Tool Use    | PreToolUse            | preToolUse          | preToolUse                    | pre_* (4 types)               | —            | before (tool) | Yes     | —                  |
| Post-Tool Use   | PostToolUse           | postToolUse         | postToolUse                   | post_* (4 types)              | —            | after (tool)  | Yes     | —                  |
| Tool Failure    | PostToolUseFailure    | errorOccurred       | postToolUseFailure            | —                             | —            | —             | Yes     | —                  |
| Pre-Compaction  | PreCompact            | —                   | preCompact                    | —                             | —            | compact       | —       | —                  |
| User Prompt     | UserPromptSubmit      | userPromptSubmitted | beforeSubmitPrompt            | pre_user_prompt               | —            | prompt gating | —       | per_prompt         |
| MCP Tool Use    | —                     | —                   | before/afterMCPExecution      | pre/post_mcp_tool_use         | —            | —             | —       | —                  |
| File Read/Write | via tool hooks        | —                   | beforeReadFile, afterFileEdit | pre/post_read, pre/post_write | —            | file hooks    | —       | —                  |
| Notification    | Notification          | —                   | —                             | —                             | Notification | notification  | —       | —                  |
| Subagent        | SubagentStart/Stop    | —                   | subagentStart/Stop            | —                             | —            | —             | —       | —                  |
| Task Completion | TaskCompleted         | —                   | —                             | —                             | —            | —             | —       | —                  |
| Shell Execution | —                     | —                   | before/afterShell             | pre/post_run_command          | —            | —             | —       | —                  |
| Agent Response  | —                     | —                   | afterAgentResponse/Thought    | post_cascade_response         | AfterAgent   | —             | —       | —                  |
| Worktree Ops    | WorktreeCreate/Remove | —                   | —                             | post_setup_worktree           | —            | —             | —       | —                  |
| Stop/Completion | Stop                  | —                   | stop                          | —                             | —            | stop          | —       | —                  |

<!-- markdownlint-enable MD056 -->

### Key Observations

- **Pre/Post pairs dominant**: Nearly all platforms use symmetrical event naming
- **Session lifecycle near-universal**: SessionStart/SessionEnd on most platforms
- **Tool use near-universal**: PreToolUse/PostToolUse on all major platforms
- **MCP-specific hooks emerging**: Only Cursor and Windsurf expose MCP hooks separately
- **Blocking vs observational**: Pre-hooks can typically block; post-hooks are observational

---

## 4. Configuration Format Comparison

### Format Overview

| Platform     | Format | Location(s)                                        | Schema Available? |
|--------------|--------|----------------------------------------------------|-------------------|
| Claude Code  | JSON   | `~/.claude/settings.json`, `.claude/settings.json` | Yes (JSON Schema) |
| Copilot      | JSON   | `.github/hooks/*.json`                             | No                |
| Cursor       | JSON   | Workspace/user directory                           | No                |
| Windsurf     | JSON   | System/user/workspace (inherited)                  | No                |
| Gemini CLI   | JSON   | `settings.json`                                    | No                |
| OpenAI Codex | TOML   | `~/.codex/config.toml`                             | No                |
| VS Code      | JSON   | Workspace/user `.hooks/`                           | Same as Claude    |
| Amazon Q     | —      | Undocumented                                       | No                |

### Common Patterns

**Claude Code / VS Code / Copilot (nested structure)**:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh"
          }
        ]
      }
    ]
  }
}
```

**Windsurf (flat structure)**:

```json
{
  "hooks": {
    "pre_read_code": {
      "command": ["bash", "/path/to/script.sh"]
    }
  }
}
```

**Gemini CLI (flat, simple)**:

```json
{
  "hooks": {
    "startup": [
      {
        "command": "my-init-script.sh"
      }
    ]
  }
}
```

### Cross-Platform Notes

- VS Code explicitly claims format compatibility with Claude Code and Copilot CLI
- Copilot uses versioned config objects — similar to Claude Code but not identical
- Windsurf's flat structure is not directly compatible without translation
- Multiple platforms support OS-specific command variants (windows/linux/osx keys)

---

## 5. Convergence and Cross-Platform Efforts

### De Facto Convergence Points

1. **JSON config dominant** (7/9 platforms)
2. **Pre/Post event symmetry** across all platforms
3. **Exit code semantics converging**: 0 = success, 2 = blocking error (Claude Code, Cursor,
   Windsurf, VS Code)
4. **stdin/stdout** for hook handler data exchange
5. **Status**: Not formally standardized, but de facto convergence emerging

### Governance Layers Above Hooks

- **Agent Skills** (Anthropic, Dec 2024): Capability layer above hooks; adopted by Microsoft,
  OpenAI, Atlassian, Figma, Cursor, GitHub
- **Agents.md** (2025): Lifecycle checkpoint model (`create -> plan -> approve -> execute ->
  complete -> audit`); hooks implement these checkpoints
- **MCP**: Tool access standard; hooks govern MCP invocations on platforms that support both

### Formal Standardization

- **No W3C, IETF, ECMA, or ISO standard** for agent hooks identified
- Standardization is happening bottom-up through adoption, not top-down through standards
  bodies
- Industry trend (2026): "Agent harnesses" replacing focus on individual agents — hooks seen
  as essential infrastructure

---

## 6. Known Gaps and Unverified Claims

| Platform/Topic               | Status              | Reason                                                             |
|------------------------------|---------------------|--------------------------------------------------------------------|
| Continue IDE                 | Not confirmed       | No hook documentation found                                        |
| Aider core tool              | Not confirmed       | Official docs lack hook spec; AiderDesk variant does support hooks |
| Qwen Code                    | Not confirmed       | MCP config hints exist; no lifecycle event spec                    |
| JetBrains CodeCanvas         | Out of scope        | Dev environment lifecycle, not agent lifecycle                     |
| Formal hook standard         | Does not exist      | No W3C, IETF, ECMA, or ISO standard identified                     |
| Hook config JSON schema      | Partial             | Only Claude Code schema publicly available                         |
| Cross-platform migration     | Not confirmed       | VS Code claims compatibility; no tested path                       |
| Amazon Q full lifecycle spec | Not confirmed       | Only context hooks documented                                      |
| OpenAI Codex RFC #2582       | Not yet implemented | Proposes future hooks (beforePlan, afterCode, onError)             |

---

## Sources

### Official Documentation

- [Claude Code Docs — Hooks][claude-hooks]
- [GitHub Docs — Hooks configuration][copilot-hooks-config]
- [GitHub Docs — Using hooks with Copilot agents][copilot-hooks-usage]
- [Cursor Docs — Hooks][cursor-hooks]
- [Windsurf Docs — Cascade Hooks][windsurf-hooks]
- [Gemini CLI Docs — Hooks][gemini-hooks]
- [VS Code Docs — Agent hooks (Preview)][vscode-hooks]
- [Aider — Options reference][aider-docs]
- [LangChain Docs — Custom middleware][langchain-middleware]
- [Model Context Protocol — Architecture][mcp-arch]
- [Agent Skills — Official site][agentskills-site]
- [Agents.md — GitHub][agents-md-github]

### Standards and Specifications

- [Anthropic Engineering — Agent Skills][anthropic-skills]
- [Agents.md — Specification][agents-md-spec]
- [Agent Skills Specification — GitHub][agentskills-github]

### News and Analysis

- [InfoQ — Cursor 1.7 Adds Hooks][infoq-cursor]
- [The New Stack — Agent Skills][newstack-skills]
- [VS Code Blog — Making agents practical][vscode-blog-agents]
- [Google Developers Blog — Gemini CLI hooks][google-blog-gemini]
- [Medium — 2026 Is Agent Harnesses][medium-harnesses]

### Technical References

- [GitHub PR #9796 — Codex hooks system][codex-pr-hooks]
- [OpenAI Developers — Codex CLI][codex-docs]
- [AWS DevOps Blog — Amazon Q CLI][aws-q-cli]
- [MintMCP — MCP governance via Cursor hooks][mintmcp-hooks]

---

[claude-hooks]: https://code.claude.com/docs/en/hooks
[copilot-hooks-config]: https://docs.github.com/en/copilot/reference/hooks-configuration
[copilot-hooks-usage]: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks
[cursor-hooks]: https://cursor.com/docs/hooks
[windsurf-hooks]: https://docs.windsurf.com/windsurf/cascade/hooks
[gemini-hooks]: https://geminicli.com/docs/hooks/
[vscode-hooks]: https://code.visualstudio.com/docs/copilot/customization/hooks
[aider-docs]: https://aider.chat/docs/config/options.html
[langchain-middleware]: https://docs.langchain.com/oss/python/langchain/middleware/custom
[mcp-arch]: https://modelcontextprotocol.io/docs/learn/architecture
[agentskills-site]: https://agentskills.io/
[agents-md-github]: https://github.com/agentsmd/agents.md
[agents-md-spec]: https://agents.md/
[agents-md-guide]: https://www.remio.ai/post/what-is-agents-md-a-complete-guide-to-the-new-ai-coding-agent-standard-in-2025
[agentskills-github]: https://github.com/agentskills/agentskills
[anthropic-skills]: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
[newstack-skills]: https://thenewstack.io/agent-skills-anthropics-next-bid-to-define-ai-standards/
[infoq-cursor]: https://www.infoq.com/news/2025/10/cursor-hooks/
[vscode-blog-agents]: https://code.visualstudio.com/blogs/2026/03/05/making-agents-practical-for-real-world-development
[google-blog-gemini]: https://developers.googleblog.com/tailor-gemini-cli-to-your-workflow-with-hooks/
[medium-harnesses]: https://aakashgupta.medium.com/2025-was-agents-2026-is-agent-harnesses-heres-why-that-changes-everything-073e9877655e
[codex-pr-hooks]: https://github.com/openai/codex/pull/9796
[codex-docs]: https://developers.openai.com/codex/cli/features/
[aws-q-cli]: https://aws.amazon.com/blogs/devops/exploring-the-latest-features-of-the-amazon-q-developer-cli/
[medium-q-cli]: https://medium.com/@jason_94622/maximizing-amazon-q-in-the-command-line-a-guide-to-contextual-ai-0db5c08968d9
[mintmcp-hooks]: https://www.mintmcp.com/blog/mcp-governance-cursor-hooks
[grokipedia-mcp]: https://grokipedia.com/page/Model_Context_Protocol

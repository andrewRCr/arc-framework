# Research: Context Window Visibility Across Platforms

**Date:** 2026-03-10\
**Context:** Supplementary to agent hooks research; relevant to ARC session management model\
**Method:** Two external research agent passes. First pass produced errors on known-verifiable facts
(Claude Code capabilities); second pass used stronger verification guardrails with source classification.\
**Status:** DRAFT — several findings need manual verification. Confidence levels marked per-platform.

---

## Purpose

ARC's session management model expects the user to monitor context usage via their platform's reporting
and invoke session handoff proactively before context is exhausted. This research evaluates whether that
expectation is reasonable across major platforms — specifically, what visibility and warnings each platform
provides to users.

## Known Facts (Firsthand Verified)

These are confirmed by the ARC developer's direct experience and override any research findings:

- **Claude Code**: CAN disable auto-compaction. DOES display a prominent red warning when approaching
  context limits. Has configurable status line for persistent display. Has `/context` for on-demand detail.
- **OpenAI Codex CLI**: Provides a persistent context indicator (not just on-demand).
- **Gemini CLI**: Has `/stats` for on-demand token usage. Footer shows context percentage.

## Research Findings (Require Verification)

Confidence levels: HIGH (official docs confirmed), MEDIUM (official + community), LOW (community only),
UNVERIFIED (no reliable source).

### GitHub Copilot CLI — HIGH confidence

- On-demand `/context` command shows token breakdown with percentage
- Warning at ≤20% remaining context
- Auto-compaction at 95% usage (mandatory, cannot be disabled)
- "Truncated" label in status bar when context is truncated
- Source: [GitHub Changelog 2026-01-14][copilot-changelog] [OFFICIAL]

### Cursor — LOW confidence

- No persistent context display confirmed in official docs
- Feature requests for context window inspector exist (unimplemented as of research date)
- Auto-compacts when context limit is hit
- Context overflow behavior described as opaque to users
- Sources: Cursor Forum feature requests only [COMMUNITY]

### Windsurf Cascade — MEDIUM confidence

- Footer shows real-time context usage meter (community reports; not confirmed in official docs)
- Auto-summarization built in per official docs
- No explicit warning threshold documented
- Source: [Windsurf Docs — Cascade][windsurf-cascade] [OFFICIAL for auto-summarize; COMMUNITY for footer]

### Amazon Q Developer CLI — MEDIUM confidence

- `/usage` command shows on-demand context usage estimate with percentage
- `/context show` displays per-file token counts
- No persistent indicator (feature request open)
- Manual `/compact` available; auto-drops context files exceeding 75% of window
- Error at hard limit: "context window has overflowed"
- Sources: [AWS Docs — Context Management][q-context] [OFFICIAL],
  [GitHub Issue #1366][q-fr-display] [COMMUNITY]

### VS Code Agent Mode — UNVERIFIED for this research

- Not included in second research pass; first pass findings unreliable
- First pass claimed: persistent fill bar + hover detail, auto-compaction mandatory, manual `/compact`
- Needs manual verification

## Key Takeaway

Every major platform provides at least an on-demand mechanism to check context usage. The expectation that
users monitor context and invoke handoff proactively appears reasonable, but monitoring quality varies
significantly — from persistent indicators with explicit warnings (Claude Code, Copilot CLI) to opaque
behavior with no confirmed warnings (Cursor).

## Research Quality Notes

External research agents produced factual errors about Claude Code in both passes (incorrectly stating
auto-compaction cannot be disabled). This means findings about other platforms — particularly those marked
LOW or UNVERIFIED — should be treated as leads for manual verification rather than established facts.
Findings marked HIGH have official documentation sources that can be independently checked.

---

[copilot-changelog]: https://github.blog/changelog/2026-01-14-github-copilot-cli-enhanced-agents-context-management-and-new-ways-to-install/
[windsurf-cascade]: https://docs.windsurf.com/windsurf/cascade/cascade
[q-context]: https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-context.html
[q-fr-display]: https://github.com/aws/amazon-q-developer-cli/issues/1366

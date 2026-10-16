# Draft: agent-session-bridge — cross-harness agent messaging addressed by ARC locus

- **Origin:** [internal] — `USER-INBOX § Work Unit` capture from the read-only exploration of cross-harness agent
  messaging (native-harness, Herdr and third-party, and ARC-locus research passes), 2026-10-14; minted planned at the
  2026-10-15 housekeep drain.
- **Purpose:** Let agent sessions in different harnesses message one another, addressed and enriched by ARC locus,
  without ARC recording sessions or owning a transport.

---

## Problem / Motivation

Claude Code (`ListAgents` / `SendMessage`, 2.1.224+) and Codex (`codex queue`, 0.149+) each message their own
sessions; nothing crosses harnesses, and neither knows a session's ARC locus. Herdr (0.9.3 here) already lists every
pane's agent kind, harness session UUID, cwd, and idle / working / blocked status across both, and ARC's derived frame
(`npx arc locus --json`) holds each checkout's subject, stage, task cursor, and cohort. The `storage-seam` members'
sessions were coordinating by hand on 2026-10-14.

## Candidate Composition

- **Join, don't record.** ARC records no session — ADR-032 and ADR-033 retired session and liveness authority, and
  `seam-locus` keeps no attach or heartbeat. Join the two at query time by checkout path: the adapter owns session →
  cwd → harness ID → live status (advisory); the frame owns checkout → subject → stage. Not built here: transport, a
  session registry, liveness, wake-up, or a mail server — MCP Agent Mail is the mature third-party bus, pull-only and
  ARC-unaware.
- **Delivery by target over native ingress.** Claude → Claude: native `SendMessage` (sender-attributed, cannot approve
  prompts, permission-mode gated). Any → Codex: `codex queue --thread <uuid|name>` (wakes an idle session, keeps its
  permission profile, arrives as a plain user turn with no sender attribution). Codex → Claude: no documented ingress —
  the inbox socket (`CLAUDE_CODE_MESSAGING_SOCKET`) is documented for posting but its message format is not, and
  Herdr's `agent prompt` is pty input with user authority — the one structurally second-class pair.
- **Envelope.** The authority-bearing channel carries only a fixed pointer ("N ARC peer messages — run the inbox
  verb"); the body lands in a machine-local inbox under `.arc/user/<id>/.internal/` (the storage contract reserves
  that slot for "a session's request and message drafts" and keeps it out of `refs/arc/*`) and is read as a tool
  result. ARC derives the sender's locus and offers a verify against its own record. Use an ARC-owned envelope name —
  never `cross-session-message` or `channel`, which Claude Code neutralizes as forged harness tags.
- **Beyond messaging.** Address work, not panes — resolve a work-unit slug through `seam-locus`'s checkout-holder
  lookup, then the adapter; and cohort broadcast.
- **Gate doctrine lives elsewhere.** That an incoming peer message never releases an interlock or approval gate is
  routed to `autonomy-levels` (§ The grant); this work unit's envelope must not weaken it.

## Constraints

- `seam-locus` is Active and owns the roster files an enrichment layer reads — consume its output read-only until it
  lands.
- Several emitted roster fields (`owner`, `branch`, `markerGeneration`) pass through `.loose()` undeclared.
- "Identity" means three things (person, meta owner, Errand claim).
- Addressing needs every session's harness ID reported (one Codex pane had none in Herdr), so names stay free for
  display.
- Stub-level work waits on the storage cutover per the release gates.

## Neighbors

Not homes, but expect coordination or a merge at grooming:

- `session-retitle` — the stage labels share this work unit's session-to-checkout join.
- `recovery-hardening` — owns the session-to-checkout binding keyed on `CLAUDE_CODE_SESSION_ID`; whether that binding
  becomes its own concern consumed here is held there.
- `agent-platform-support` — the harness registry this would join; none exists, and four separate harness tables do.
- `autonomy-levels` — already notes that other sessions' messages fire `UserPromptSubmit`.
- `external-coord-probe` — the `adapter` + `command` → JSON precedent.

## Unverified

- The Claude inbox socket's message format (posting to the session's own socket would reveal it — opt-in).
- How `codex queue` frames a message to the model.
- Whether Claude channels wake an idle session.
- Whether Herdr plugin `[[events]]` hooks bind `pane.agent_status_changed`.
- MCP Agent Mail's license text.

## Sources

- code.claude.com/docs/en/cross-session-messaging and /channels-reference.
- openai/codex release `rust-v0.149.0`, and its PRs 39092 and 39034.
- herdr.dev/docs/socket-api, /plugins, and /integrations.
- github.com/Dicklesworthstone/mcp_agent_mail_rust.

## Next Steps

A personal read-only spike first (gitignored), then groom this draft via `--plan` in an isolated worktree once the
cutover allows stub-level work.

# Draft: agent-session-bridge — cross-harness agent messaging addressed by ARC locus

- **Origin:** [internal] — `USER-INBOX § Work Unit` capture from the read-only exploration of cross-harness agent
  messaging (native-harness, Herdr and third-party, and ARC-locus research passes), 2026-10-14; minted planned at the
  2026-10-15 housekeep drain.
- **Purpose:** Let agent sessions in different harnesses message one another, addressed and enriched by ARC locus,
  without ARC recording sessions or owning a transport.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration by this work unit’s owner._

### `[ ]` **Account for `codex queue` holding a message silently until the target's turn ends, with no withdraw**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Native ingress: queued versus delivered status and duplicate prevention

- _Observation:_ First field use, 2026-10-16, on codex-cli 0.163.0. `codex queue --thread "process-task-loop.SRB"
  --message ...` printed `Queued message <id> for thread <uuid>` and exited 0, resolving the name to the one session
  carrying it (`~/.codex/session_index.jsonl`). The message then sat in `~/.codex/queue_1.sqlite` (`queued_items`) while
  the target was mid-turn, its rollout still being written; the target's log did not contain it and its pane showed
  nothing, so the sender read success and the receiver saw no sign. Delivery waits for the target's turn to end: asked
  to pause, the target took the message at once. That fits the draft's "wakes an idle session" but leaves a busy
  session's wait unbounded and invisible. `codex queue` offers only `--thread` and `--message`, with no list or
  withdraw, so pasting the text by hand as well delivers it twice. How the delivered turn is framed to the model stays
  unverified.

- _Approach:_ the bridge reports a queued message as pending, not delivered, reading `queued_items` or the target's
  rollout to confirm delivery, and offers no hand-paste fallback while a queued copy is pending, or names the duplicate.

- _Captured during:_ `seam-decomposition` create-spec, relaying a review finding to `storage-ref-backend`'s Codex
  session, 2026-10-16.

### `[ ]` **Plan for routing as the bridge's first consumer: messages to a live work unit's session by slug**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Delivery by target and Envelope: slug addressing, advisory session presence, and delivery record

- _Observation:_ discovered-work routing now sends a concern for a live work unit (one with a registered checkout) to
  that unit's session by message, within its scope window from `arc status <slug>`. It names no transport: it uses the
  harness's session messaging where there is one, and otherwise gives the Owner the message to relay. It sends without
  asking only where the two sessions already have a conversation. Three needs fall on the bridge: addressing a session
  by work-unit slug; knowing whether a session is actually present in a checkout, since a checkout usually but not
  always has one; and a delivery record, since today a message goes in place of an inbox capture and the Owner holds its
  delivery once it is sent or handed over for relay.

- _Approach:_ treat routing as the first consumer when grooming delivery and the envelope. Slug addressing and the
  advisory live status answer the first two needs, and the bridge's machine-local inbox could give a sent message the
  delivery record it lacks. Keep the consent rule outside the transport, as the gate doctrine is.

- _Captured during:_ Errand `route-live-wu-concerns` (PR #1035), 2026-10-17.

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

# Draft: Agent-Platform Support

- **Origin:** [internal] — two agent-platform concerns routed from `BACKLOG-INBOX` at the work-routing-discipline
  retirement pass (2026-06-01): first-class harness support (Pi + opencode) and cross-platform compatibility
  testing. Grouped because you validate the harnesses you support — onboarding and validation are two facets of
  one concern.
- **Purpose:** Give ARC explicit, ergonomic support for the agent harnesses it targets first-class, and a
  validation layer that confirms consistent behavior across the supported harness family.

---

## Scope (routed captures — iterate into a plan)

### First-class harness support: Pi + opencode

Pi and opencode are open-source TypeScript agent harnesses in the Claude Code / Codex CLI category. These two are
the targets for **first-class** ARC harness support alongside the existing Codex CLI / Claude Code; every other
harness stays implicitly supported through agent-agnostic defaults. Both are categorically orthogonal to ARC
(they are runtime agent harnesses; ARC is a process harness in `.arc/`), so coexistence already works via those
defaults. Explicit support is ergonomic glue, not architectural change.

- **Per harness, a `{HARNESS}.ARC.md` file** — sibling to `WARP.ARC.md`, distinct from model-identity files like
  `CLAUDE.ARC.md`: `PI.ARC.md` and `OPENCODE.ARC.md`.
- **Skill packaging at each harness's discovery location** — Pi: `~/.pi/agent/skills/` or `.pi/skills/`;
  opencode: confirm its skill / plugin discovery path. Include any format adaptation.
- **`arc init` / `arc join` recognition** — `--tools {pi,opencode}`.
- **Instruction-file discovery, verified in practice** — Pi concatenates `AGENTS.md` / `CLAUDE.md` from
  global+parent+CWD; opencode reads `AGENTS.md`. Confirm whether either needs a shim.
- **Out of scope:** MCP (Pi excludes by design), permission-model guidance (user responsibility).

### Cross-platform compatibility testing

ARC claims agent-agnosticism but isn't tested across platforms. ADR-003 assesses agent-agnosticism; this is the
validation layer. A cross-platform compatibility matrix across the Claude / Codex / Gemini / Warp family (plus
Pi / opencode as they gain first-class support, and others as the ecosystem evolves) validates consistent
behavior for session-init, handoff, workflow execution, and skill invocation across harnesses.

- **Open shape:** whether the matrix ships as an automated test harness, a documented validation checklist run
  per release, or a hybrid. Resolve at PRD.

## Scope Estimate

Small–Medium per harness for support glue; Medium for the compatibility matrix depending on automation depth.
Post-1.0; demand-gated — pursue when a real Pi/opencode user asks or a neighboring WU (rebrand, operating-modes)
makes the harness-file + skill-packaging extension cheap.

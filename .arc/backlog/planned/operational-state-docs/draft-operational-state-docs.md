# Draft: Managed Operational-State Document Model

- **State:** Draft — pre-PRD. Spawned by ADR-022 as its implementation substrate.
- **Created:** 2026-05-27
- **Origin:** [internal] — ADR-022 (`adr-022-managed-operational-state-documents.md`).

---

## Purpose

Build the cross-cutting substrate that realizes ADR-022's structured-record model for the managed
operational-state document class (`meta-*`, `SESSION-NOTES`, `WORKING-MEMORY`, `USER-INBOX`, the shared
backlog inbox (`ATOMIC-INBOX`), `ROADMAP` / `STATUS.PROJECT`, `STATUS.USER`). No existing work unit owns this
substrate today; the surfaces are otherwise built piecemeal, each coining its own partial field-set.

## Scope

- **Structured schemas** for the managed-doc surfaces `cli-substrate-adoption` does not cover. (CSA covers
  the meta record, the session-init envelope, the audit log, and `arc-config`; this WU covers `SESSION-NOTES`,
  `WORKING-MEMORY`, `USER-INBOX`, the shared backlog inbox (`ATOMIC-INBOX`), and the `STATUS.*` views.) The
  inbox schemas adopt the slug-keyed managed-entry grammar — including the `WU_Target` field
  `work-routing-discipline` set on current names — so the structured-record swap is a clean lift, not a
  regrammar.
- **Render + reconcile projection engine** — renders the markdown projection from a record and reconciles a
  designated free-text editable region back into the record's `text` field on save/handoff (ADR-022 §5's
  write-path constraint: reconciled editable region, never argv-per-field).
- **The reconciled-editable-region write primitive**, shared across the prose-bearing members.
- **The `structural_contract` classification annotation** plus its manifest wiring — closes the
  untracked-template gap and reclassifies `ROADMAP` / `STATUS.PROJECT` off `Scaffolded`.
- **Round-trip test harness** (render ↔ parse) so structural drift is a loud, immediate failure.
- **Migration** of the current markdown-canonical documents to the model.

Subsumes the `USER-INBOX` "structured-storage + routed-write" capture (Move B for `WORKING-MEMORY` /
`USER-INBOX`) and `cli-substrate-adoption`'s "Complete-Migration" placeholder for the managed-doc surfaces.

## Kickoff (first action)

**Flip `adr-022` Proposed → Accepted.** This WU's activation is the ADR's flip trigger (ADR-022 Status); do
it as the first action on activation, before substrate work begins.

## Dependencies and Sequencing

- **`cli-substrate-adoption`** (hard, upstream) — provides the zod substrate and the meta record schema this
  WU extends to the remaining surfaces.
- Coordinates with `roadmap-tooling` (the `STATUS.*` renderer is an instance of the render engine),
  `meta-file-tracking-model` (the meta-storage slice — provisional), and `cross-machine-sync-coherence`
  (transport hardening for notes-synced members).
- Forward-compat self-check against `strategy-storage-evolution`: the record layer stays storage-agnostic so
  records lift to the backend tier without reshaping.

## Open Questions

- Schema-home convention (shared with `cli-substrate-adoption`'s open question).
- The reconciled-region delimiter and the recovery behavior on a malformed region.
- Per-member migration order and interim coexistence with markdown-canonical readers.
- ADR-022's managed-doc member list still names `BACKLOG-INBOX`; `work-routing-discipline` retired that
  surface, so verify at execution whether the list needs the removal — a role-based reconciliation, not
  rename-driven (ADR-022 is rename-agnostic).

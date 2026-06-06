# Draft: Managed Operational-State Document Model

- **State:** Draft — pre-PRD. Spawned by ADR-022 as its implementation substrate.
- **Created:** 2026-05-27
- **Origin:** [internal] — ADR-022 (`adr-022-managed-operational-state-documents.md`).

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Decide the legacy flat-bullet core fallback in `parseMetaRecord`**

- _Routed from:_ `USER-INBOX § Backlog`, housekeep drain (2026-06-06); captured during
  `class-model-foundation` Task 2.1 handoff.
- _Concern:_ `parseMetaRecord` now reads the core meta block table-first, with a legacy flat-bullet fallback for
  the five core fields. After the table re-render there are no live bullet-form core metas in this repo, but the
  fallback may remain valuable as the tolerant recovery importer ADR-022 anticipates.
- _Decision point:_ keep the fallback as the recovery-import path or retire it so table-absent core fields fail
  loudly. Either outcome should reframe lingering "pre-migration" / "interim window" prose toward the chosen
  recovery model.

### `[ ]` **Archive-time semantics for dependency metadata**

- _Routed from:_ `USER-INBOX § Backlog`, housekeep drain (2026-06-06); captured after
  `class-model-foundation` archival.
- _Concern:_ `Depends On` is live readiness metadata while a WU is active or planned; after archival the edge is
  historical lineage. Decide whether completed metas keep the canonical `Depends On` field with documented
  archive semantics, or render an archive alias such as `Depended On` while parsers normalize both labels.
- _Scope:_ if aliasing wins, update `template-meta.md`, `archive-work-unit.md`, `renderMetaFile` /
  `parseMetaRecord`, validation expectations, and completed-corpus migration guidance together.

### `[ ]` **Reconcile the interim title-keyed parser to the slug-keyed grammar + codify field ordering**

- _Routed from:_ work-routing-discipline housekeep drain (2026-06-01) — surfaced classifying the live inbox.
- _Concern:_ this draft (§ Scope) already states the inbox schemas adopt the "slug-keyed managed-entry grammar,"
  but the interim parser (`parseUserInboxSection`) work-routing-discipline shipped keys entries on the bold
  **title** (`H3_KEY`), not an explicit slug — while `run-errand` removes the "slug-matched" originating entry.
  The deprecated `ERRANDS.md` `Branch: chore/<slug>` field that previously served as the parse key did not
  survive the errand re-pivot, and an inbox entry may never become a `chore/<slug>` branch (and wouldn't under
  partial protection), so the key must be entry-intrinsic.
- _Reconcile (at the structured-record swap):_ codify an explicit `_Slug:_` field (= slugified title;
  protection-mode-agnostic) as the structured key. work-routing-discipline hand-applies `_Slug:_` on its
  execute-bound stayers now, ahead of codification.
- _Also codify:_ the entry field-ordering convention — parsed/managed fields (`_Slug:_` / `_Remind:_` /
  `_Created:_` / `_Hold:_` / `WU_Target:`) grouped and blank-line-separated from the prose descriptors, so the
  render engine emits a stable shape.

### `[ ]` **Corpus-wide meta-schema conformance gate (validate the whole corpus, not changed-files-only)**

- _Routed from:_ `backlog-meta-schema-backfill` errand (2026-06-06); surfaced when two planned metas
  (`out-of-wu-entry`, `markdown-formatting`) reached `main` in the legacy flat-bullet schema with no `Class` —
  added on sibling branches in parallel with the `class-model-foundation` migration sweep, then merged clean (no
  conflict, separate files), so the sweep never re-touched them.
- _Concern:_ the planned downstream catches are each partial against this mode. The Concurrent Work Conventions
  behind-base detector is advisory and resume-gated — it fires only if the in-flight author resumes after the
  sibling branches land and acts on the reconcile prompt, so a sweep authored-and-merged in one sitting slips it.
  `cli-substrate-adoption`'s zod meta record validates round-trip on the records a command reads, not necessarily
  the entire on-disk corpus at a gate. Neither deterministically flags a malformed or incomplete meta that lands
  on `main` via a clean merge.
- _Decision point:_ specify a conformance check that validates **every** `meta-*.md` across `backlog/`, `active/`,
  and `completed/` against the zod schema, wired to a gate (pre-commit and/or CI) rather than changed-files-only —
  the timing-independent net that closes the concurrent-merge drift gap. Pairs with the round-trip harness
  (§ Scope) and the `parseMetaRecord` validation-expectations decision above.

### `[ ]` **Blocked/awaiting status for inbox captures (GTD "Waiting For")**

- _Routed from:_ `inbox-awaiting-status` errand (2026-06-06); surfaced deciding the home for a homeless atomic
  blocked on an external trigger ("remove the TS6 bridge before TypeScript 7" — TS7 not yet released).
- _Concern:_ the inbox family has no first-class status for a capture that is _correctly blocked on an external
  trigger_ (vs. merely deferred). `_Remind:_` is time-based — it nags an item that isn't late, only waiting;
  `_Hold:_` mutes surfacing but records no unblock condition and means "retained," not "blocked." The trigger
  primitive already exists elsewhere: WORKING-MEMORY's `_Remove when: <trigger>_` is exactly a trigger expression,
  never yet applied to the inbox to-do surface.
- _Design direction:_ an `_Awaiting: <trigger>_` managed field on a `§ Atomic` capture that records the unblock
  condition and suppresses time-nudge surfacing, re-evaluated as a **judgment pointer** at a housekeep pass or
  WU-init absorption ("trigger met → promote to ready / route to a stub : keep waiting"), never as an automated
  condition. Evaluation model is scope-dependent: the private `USER-INBOX` is nudge-based (a blocked item sits
  awkwardly there), while the shared inbox (`ATOMIC-INBOX` → `INBOX.PROJECT`) is sweep-based and nudge-free — the
  natural host for trigger-gated project concerns. Codify the field in the `§ Atomic` flag schema alongside
  `_Remind:_` / `_Hold:_`, reusing WORKING-MEMORY's trigger-expression convention for consistency.
- _Interim:_ `_Awaiting:_` is hand-applied on the re-homed TS7 capture in `ATOMIC-INBOX` now, ahead of
  codification (the same pattern recorded for `_Slug:_` above).

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
  inbox schemas adopt the slug-keyed managed-entry grammar — including the `WU_Target` field, the `§ Atomic`
  reminder flag (`_Remind:_` + its `_Created:_` aging date), and the `§ Atomic` retain flag (`_Hold:_`, set by
  the housekeep drain), with parsed field values backtick-delimited, `work-routing-discipline` set on current
  names — so the structured-record swap is a clean lift, not a regrammar. The interim markdown readers
  (`session-init/managed-field.ts`, regex-extracting these backtick-delimited values for the inbox-state and
  reminder probes) are the recovery/import path this WU's structured model **supersedes**, not a layer to extend.
  `arc-inbox`'s deterministic managed-write CLI (`arc inbox add`) is this WU's backend: `work-routing-discipline`
  ships `arc-inbox` model-first over hand-managed markdown against the grammar this WU's CLI later emits (the
  `ROADMAP`-before-its-renderer pattern).
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

# Draft: Managed Operational-State Document Model

- **State:** Draft — pre-PRD. Spawned by ADR-022 as its implementation substrate. Re-scoped at the
  `state-storage` re-cut (2026-09-28) as the storage program's records-engine follow-on (§ Re-scope); the
  2026-07-02 decomposition cut-map (§ Decomposition) predates that and is re-derived before `decompose-work-unit`
  runs. The inbound buffer distributes to members rather than integrating into this body.
- **Created:** 2026-05-27
- **Origin:** [internal] — ADR-022 (`adr-022-managed-operational-state-documents.md`).

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Keep targeted inbox removal visible across entry separators**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-07-23); captured during `wu-rename`
  cross-WU coordination routing.
- _Concern:_ `entryHeadingLines()` treats `---` as leaving the managed section, so list/removal operations silently
  miss later valid-looking entries until another `## Errand` or `## Work Unit` heading. The failure forced a raw
  identity-global inbox edit during routing.
- _Fold-in:_ reconcile the interim reader/writer grammar when the remove half moves onto managed records. Either
  keep separators inside the current section or remove that formatting from the accepted/written surface; cover
  multiple separated entries, a post-separator match, and idempotent absence. Re-ground the implementation after
  `session-locus-model` integrates because its completed branch overlaps `inbox-writer.ts`.

### `[ ]` **Make the execute-bound inbox queue discoverable from a cold session**

- _Routed from:_ housekeep drain (2026-09-07), while preparing the first ordered execute-bound queue.
- _Concern:_ Errand completion can offer the next physical execute-bound entry, but cold session orientation does
  not make the queue or its next available item comparably visible.
- _Fold-in:_ carry ordered execute-bound entries as an operational-state projection with one discoverable next
  item, preserving the inbox as the interim source until managed entry records replace it.

### `[ ]` **Shared inbox staleness nudge supersedes the "nudge-free" assumption**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: operational-state-docs`), housekeep drain
  (2026-07-03); captured during `shared-inbox-model` grooming (2026-07-02).
- _Concern:_ this draft's inbound `_Awaiting:_` evaluation-model note describes the shared inbox as
  sweep-based and nudge-free. `shared-inbox-model` has since settled the opposite: the project inbox gets a
  session-init staleness probe plus once-per-calendar-day nudge (count + oldest age), with `_Awaiting:_`
  entries suppressing the age nudge.
- _Fold-in:_ amend the evaluation-model sentence at OSD's next planning iteration: shared inbox records are
  sweep-based **and age-nudged**, with `_Awaiting:_` as the nudge suppressor. Also carry forward the
  concurrency shape from `draft-storage-contract.md` / `draft-shared-inbox-model.md`: shared-mutable inbox records
  are entry-granular (slug-keyed add / remove / re-home), never whole-document state.

### `[ ]` **Reconcile the interim title-keyed parser to the slug-keyed grammar + codify field ordering**

- _Scoped:_ the writer half stays here — idempotent slug-keyed removal and the `--from-inbox` repoint; the schema half
  (the `_Slug:_` structured key and field ordering) moved to `storage-seam` under `storage-contract` C2, the
  record-aware seam (2026-09-30).
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
- _Honor (async-merge-lifecycle, 2026-06-13):_ the slug-keyed removal must be **idempotent** — a no-op when the
  matched line is already absent. The unattended-merge completion contract gives the slug-matched `USER-INBOX`
  removal one authoritative point (`run-errand` § Complete) plus idempotent backstops (the same-session finalize
  pass and session-init's in-flight-errand sweep), any of which may replay it, so the structured removal
  primitive must preserve no-op-when-absent rather than erroring or double-removing. Until `_Slug:_` lands the
  backstops match by entry title (the current parser key) and stay agent-driven.
- _Also (`--from-inbox` flag, 2026-06-24):_ `arc errand open --from-inbox <entry-title>` (landed by
  `lifecycle-closeout`) is another title-keyed inbox consumer — it adopts a capture by its bold title (the interim
  `H3_KEY`) and `arc errand close` drops it via the title-matched `removeInboxEntry`. When the `_Slug:_` field is
  codified, repoint this flag's value (the `cli.ts` placeholder + the `handlers/errand.ts` producer) and the
  close-side match onto the slug key alongside the parser.

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

### `[ ]` **Take tombstones out of the rendered `USER-INBOX` / `WORKING-MEMORY` files (record field, not in-band)**

- _Routed from:_ `USER-INBOX`, 2026-06-09.
- _Concern:_ deletion tombstones (`## Removed:` markers) render in-band in the human-facing `USER-INBOX` /
  `WORKING-MEMORY` files and only GC at merge time once past their TTL, so removed entries pile up in the files
  read raw (the inbox ran ~98% tombstones, 55 dead / 1 live). The clutter is a direct artifact of markdown being
  both the canonical store and the viewing surface.
- _Proposed:_ make tombstones non-projected fields of the notes-stored structured record (this WU's model); the
  `.md` becomes a rendered projection that emits live entries and omits tombstones, so they never reach the human
  file even when read raw. They still sync because the record syncs (git note today → local store → backend — the
  store these files already materialize from).
- _Design fork (do NOT do):_ do not carve a synced exception into `user/{identity}/.internal/`. The dot-prefix ⇒
  never-synced rule is intentional and double-enforced (`classifier.ts` + the serialize-walk dotfile prefilter,
  chosen deliberately "rather than carving out only `.internal/`"). The coupling to break is hidden ⇔
  never-synced (tombstones want hidden AND synced) — break it in the record/projection layer, never by bolting an
  exception onto the dotfile rule.
- _Interim (if a sidecar predates this WU):_ a visible synced sibling file (a flat non-dot path is already
  `cross-wu`, zero sync-layer change), or stay in-band with a short TTL (shipped via PR #72, 90 → 7 days). Applies
  to BOTH `USER-INBOX` and `WORKING-MEMORY`.

### `[ ]` **Lifecycle-complete cohort membership — graduated-vs-removed validator fix + cohort-doc archival loop**

- _Scoped:_ only the condition (c) validator fix stays here — the hook is removed at the cutover, so it matters only if
  it runs ahead; the re-home of the shipped resolution moved to `storage-seam` under `storage-contract` C2, the
  record-aware seam (2026-09-30).
- _Routed from:_ `USER-INBOX § Backlog`, housekeep drain (2026-06-10); captured during `doc-cascade-sweep`
  Task 3.2 cohort-doc conformance audit.
- _Concern:_ the cohort-consistency validator (`decomposition-machinery`, shipped) derives membership from
  co-located `backlog/planned/` metas in the staged delta, but members **relocate out** of the cohort dir as they
  activate (→ flat `active/`) and ship (→ `completed/`). The membership universe shrinks as the cohort matures, so
  a cohort doc edited late flags every graduated member section as an orphan. Root conflation: **"graduated
  member" is indistinguishable from "removed WU"** to a backlog-scoped check (the dm spec line 260 literally says
  orphans catch "a renamed/removed WU" — graduation looks identical). Hit live 2026-06-10 auditing
  `cohort-agile-wu-lifecycle.md` for `doc-cascade-sweep`: all four members (`class-model-foundation` /
  `scalable-authoring-pipeline` / `decomposition-machinery` shipped, `doc-cascade-sweep` active) flagged as
  orphans — unfixable in that WU's scope. The authoritative membership is the position-independent `Cohort` field
  resolved across **all** lifecycle states, not dir co-location in a staged backlog snapshot; the two agree at
  planning time and silently diverge the moment a member activates.
- _Related:_ sibling of this WU's captured "CLI primitive: resolve a WU's lifecycle state by slug" and
  "Dependency-edge lifecycle semantics" items — same state-blindness family, same index machinery
  (`completed-index` + active `meta-reader` + backlog scan). Build the resolver once; don't double-build.
- _Approach:_ one primitive resolves all three:
    1. **Lifecycle-complete cohort-membership resolver** — the set of WUs whose `Cohort` field resolves to a
       cohort path, across `backlog/planned/` + `active/` + `completed/`. Shared infra under
       `operational-state-docs`.
    2. **Validator fix (condition c):** a member-section slug is an orphan only if it resolves to **no** lifecycle
       state (genuinely renamed/removed); a slug resolving to an active/completed WU with a matching `Cohort` field
       is a graduated member → not flagged. Distinguishes graduated from removed. Cost guard: keep the hermetic
       staged-delta path for the common case; resolve only the _graduated_ slugs (absent from the staged set) via
       the index — cohort membership is small.
    3. **Archival-trigger wiring:** "cohort doc archives to `completed/` when the last member ships"
       (dm spec C5, lines 277-279/336) needs the same resolver — when shipping a member, check whether any
       _other_ member (by `Cohort` field, any state) is not yet in `completed/`; if none, `git mv` the cohort doc
       to `completed/` in that archival. Closes the loop so the doc never strands. Wire into
       `integrate-work-unit.md` / archival.
- _Scope:_ codify the conceptual rule the gap exposed: **a cohort dir is its doc's home until cohort completion,
  independent of where its members are**; "no co-located backlog members" is the _fully-activated cohort_ (a valid
  mature state), not breakage. Do **not** relocate the doc on last-member-_activation_ — `active/` is flat by design
  (no cohort home), and relocating there would fight the flat-`active/` invariant. Relocation happens once, at
  last-member-_ship_ (already dm's design).
- _Reframe (2026-07-02 grooming — partially shipped):_ `lifecycle-transition-core` Task 6.1/6.2 delivered the
  lifecycle-complete membership resolution, archival-trigger wiring, and archive + cohort-doc sweep (approach
  items 1 and 3). Still genuinely this WU's: the **validator fix (condition c)** and the corpus-wide conformance
  gate's cohort-doc-presence extension; the shipped membership resolution re-homes onto records at the substrate
  migration.

### `[ ]` **Pair OSD's `arc inbox add` managed-write with the shipped inbox-remove half (I/O symmetry + kills append drift)**

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: operational-state-docs`), housekeep drain (2026-06-19);
  captured during `lifecycle-mechanics-tail` Task 6.1 — building the inbox-removal writer.
- _Concern:_ `lifecycle-mechanics-tail` § 7 shipped `removeInboxEntry` (`user-sync/inbox-writer.ts`) — the inbox
  **drain/remove** half — as interim markdown, because errand completion had a concrete judgment-free hand-run tail
  to migrate. Its symmetric **add** half is deliberately not there: capture is judgment-laden (classify → section,
  author title, compose descriptors, resolve `WU_Target`) and lives in the `arc-inbox` skill. But OSD already
  scopes the deterministic managed-write CLI (`arc inbox add`) over both inboxes, so the add half is OSD's.
- _Scope:_ when OSD builds the managed-write, design it as a paired I/O surface with the remove half — re-home
  `removeInboxEntry` onto records alongside `arc inbox add` (zero-reshape lift), not as two unrelated migrations.
  **Anti-drift dividend:** a deterministic append (placement + canonical section spacing) eliminates the free-hand
  spacing drift the skill's hand-append produces today — e.g. stray mid-`## Backlog` `---` separators that hid an
  entry from the section parser (`routableCount` under-counted until hand-fixed 2026-06-18). The judgment (what to
  write) stays in the skill; only placement/spacing becomes mechanical.

### `[ ]` **Cohort-doc presence is enforced on-touch only — grouping dirs missing their `cohort-*.md` slip through**

- _Routed from:_ `single-owner-wu-model` housekeep drain (2026-06-24); surfaced live adding a member to
  `architecture-remediation`, a five-member grouping dir that had **no** `cohort-architecture-remediation.md`.
- _Concern:_ the cohort-consistency check (condition (b), `validate-cohort-consistency.ts`) validates a grouping
  dir's cohort-doc presence only when the **staged delta touches** that dir. So a grouping dir created or left
  without its constitutive `cohort-*.md` is never flagged until some commit happens to touch it —
  `architecture-remediation` carried five members in that invalid state indefinitely, caught only because a sixth
  member's add touched the dir. There is no proactive / standing guard asserting that **every** grouping dir
  (across the lifecycle-complete membership universe) carries its cohort doc.
- _Tension to reconcile:_ the cohort-doc **convention** (`cohort-agile-parallelism.md` § "Why this doc exists")
  treats the doc as **optional** — its presence is the _signal_ that a cohort coordinates, and a browsing-bucket
  grouping needs none. The **hook** mandates one per grouping dir regardless. `architecture-remediation` is exactly
  the browsing-bucket case the convention says needs no doc, yet the hook forced one. Settle which rule wins:
  mandatory-per-grouping-dir, or doc-iff-coordinating (then the hook must allow doc-less browsing buckets).
- _Approach:_ extend the corpus-wide conformance gate (the enforcement-vehicle entry above) to assert cohort-doc
  **presence** across all grouping dirs, not just touched ones, reusing the lifecycle-complete cohort-membership
  resolver; pair with a one-time backfill sweep. Settle the convention/hook tension first — the gate's rule depends
  on it.
- _Note:_ the `architecture-remediation` instance was backfilled at this drain (its `cohort-*.md` authored as a
  minimal browsing-bucket record); this entry is the durable guard so the class of gap can't recur silently.

### `[ ]` **Give `WORKING-MEMORY` a mutation verb, and make its proposal gate mechanical**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-07-28); captured during
  `judgment-authority-model` planning.
- _Concern:_ `arc user` has `inbox-remove` for `USER-INBOX`, but nothing mutates `WORKING-MEMORY` — every entry is
  hand-written prose whose shape rules live in an on-demand strategy. Verb-gap per DEV-RULES.PROJECT § Verbs over
  mechanics. A verb could enforce `_Remove when:_` mechanically and carry the propose-don't-self-add gate as a real
  interlock.
- _Fold-in:_ `user-surface-records` / managed-write surface — the WORKING-MEMORY side of the same CLI mutator family
  as `arc inbox add` paired with remove. Settle verb surface (add / remove / list), composition with
  `arc user save` / `load`, and gate shape (interlock vs emitted proposal).

### `[ ]` **Make execute-bound Errand offers respect typed work-unit dependencies**

- _Routed from:_ `USER-INBOX § Work Unit`, drained at the `state-storage` re-cut (2026-09-28).

- _Observation:_ `nextOffer` selects the first execute-bound `USER-INBOX` entry from file order without consulting
  dependency state. It therefore offered the paused `batch-compaction-seed-candidate-reads` Errand even though its
  required `review-signal-convergence` work unit remains active and unshipped, causing a pointless open/leave cycle.

- _Approach:_ model typed work-unit dependency edges in the managed user-surface record and reuse the canonical,
  storage-agnostic WU lifecycle query when projecting the next eligible execute-bound offer. Preserve file order
  among eligible entries, treat missing targets as unsatisfied, and cover the blocked-first/eligible-later case plus
  automatic eligibility after the dependency ships.

- _Boundary:_ automated edges initially target work units only. Closed Errands currently leave no durable completion
  record, so Errand-to-Errand edges cannot distinguish completed from nonexistent safely. Ecosystem and other
  external predicates remain `_Awaiting:_` judgment pointers with `_Hold: true`, not machine-guessed dependencies.

- _Forward compatibility:_ do not extend the interim Markdown parser as a second authority. Add the field to the
  slug-keyed `USER-INBOX` record grammar owned by `user-surface-records`; keep queue selection behind the record/query
  boundary so the current in-repo lifecycle index can later move to the materialized git backing store unchanged.

- _Captured during:_ the execute-bound Errand sequence after `keep-approved-errand-merges-waiting`, 2026-09-22.

### `[ ]` **Take operational-state-docs' re-scope from storage-contract**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: operational-state-docs`), housekeep drain (2026-09-30); captured
  during `storage-contract` draft close, 2026-09-30.
- _Observation:_ `storage-contract` decided the record-aware seam (C2): each `storage-seam` member builds the parser
  for the families it reroutes, so this work unit stops being the records engine. Its conformance gate stays an
  independent slice that can run ahead; its user-surface verbs and fields — `arc inbox add`, a `WORKING-MEMORY`
  mutation verb, tombstones, `_Awaiting:_` — stay here, re-scoped and deferred (C14). The draft's § Re-scope still
  names it the records engine, and its buffer still wires a `git mv` and audits notes.
- _Approach:_ Rewrite § Re-scope to the decided shape at next grooming. The inbound buffer's redistribution is a
  separate capture.

---

## Re-scope — the records engine

At the `state-storage` re-cut (2026-09-28) this work unit became the storage program's records-engine follow-on.
It runs after `storage-cutover`; `storage-contract` tags it core or deferred.

- **File-as-record (Owner, 2026-09-25).** A managed document's fields are parsed from the file, which is itself
  the record, and validated when written back. Rendering is only for derived views — ROADMAP and the `STATUS.*`
  surfaces. This replaces ADR-022's record-authoritative model, which renders markdown from the record and
  reconciles one editable region back. This work unit carries the ADR-022 amendment when it designs the records
  work.
- **What survives.** The structured schemas and the round-trip harness. The render-and-reconcile engine and the
  reconciled-editable-region primitive give way to parse-and-validate, and the notes-synced wiring is rebuilt on
  the store (storage analysis § 8).
- **Where the parsers meet the contract.** Under the storage contract every reader asks for a document's fields
  through its record family's parser, never by path or placement, and the query cache indexes the parsed fields.
  This work unit later changes what sits behind each parser without moving storage.
- **Independent slice.** `corpus-conformance-gate` validates the stored corpus and does not depend on storage;
  it can be cut out and run ahead of the cutover.

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

## Decomposition (cut-map, settled 2026-07-02)

The concern exceeds one WU on the orthogonality discriminator, not size alone: the inbound buffer's ~17 pending
entries sort into distinct concern families with independent deliverable boundaries, and each surviving family
independently clears the WU floor. `assess-cohort-fit` verdict: **cohort of three**, delivered as a stack.
`decompose-work-unit` (backlog-stub-source arm, its own `chore/decompose-*` branch) consumes this map; the
origin WU retires into the cohort, its draft content and buffer distributing per the routing below.

**Members** (cohort `operational-state-docs`):

1. **`managed-record-substrate`** (est. `Heavy`) — the keystone: structured schemas as a model (incl. the
   `identifier-list` cardinality axis and band-varying required-field sets), the render + reconcile projection
   engine, the reconciled-editable-region write primitive, the round-trip harness, `structural_contract`
   annotation + manifest wiring, migration of the markdown-canonical members — with the **session-surface
   re-homes as its migration phase** (dep-edge discharge, slug resolver, cohort-membership resolution, errand
   record v2 + live-PR read: zero-reshape lifts too thin for a standalone member, per the lower rail). Owns the
   ADR-022 alignment edits and the Accepted flip at its activation.
2. **`corpus-conformance-gate`** (est. `Light`) — corpus-wide schema validation wired to a gate
   (timing-independent, closes the concurrent-merge drift gap), the cohort-doc-presence extension plus the
   mandatory-vs-doc-iff-coordinating convention settle, the write-path-enforcement framing (CLI-mutate +
   consistency-hook), the cohort-membership validator fix (condition c), and VECTOR slug-ref validation as those
   surfaces land. **Orthogonal to the projection engine** — validation over the stored corpus, deliverable
   before or parallel to the substrate; its schema source is CSA's zod meta record, so it sequences after CSA,
   not after the substrate.
3. **`user-surface-records`** (est. `Heavy`) — the USER-INBOX / WORKING-MEMORY / ATOMIC-INBOX record family:
   slug-keyed entry identity decoupled from rendered headers, tombstones as non-projected record fields + the
   TTL config knob, the wrapped-header silent-drop hardening, `arc inbox add` paired with the shipped remove
   half, and the `§ Atomic` flag schema (`_Awaiting:_`; sequenced after `shared-inbox-model`'s `_Hold:_` →
   `_Queued:_` call).

**Dependency edges:** `managed-record-substrate` ← `cli-substrate-adoption`; `corpus-conformance-gate` ←
`cli-substrate-adoption`; `user-surface-records` ← `managed-record-substrate`.

**Buffer routing map** (consumed at the decompose ceremony; entries listed by heading):

- → `managed-record-substrate`: compaction seed projection; `parseMetaRecord` fallback; dep-edge reframe;
  title-keyed→slug-keyed _grammar codification_ (the schema half; the inbox writer half → user-surface);
  `identifier-list` valueClass; slug-resolver reframe; cohort-membership reframe (re-home portion); errand
  record + live-PR read; errand tip SHA; `VECTOR.*` membership (schema half); `session-state` method audit;
  ADR-022 re-point (rides the ADR alignment set).
- → `corpus-conformance-gate`: corpus-wide conformance gate; write-path enforcement framing; cohort-doc
  presence; cohort-membership validator fix (condition c); `VECTOR.*` ref-validation ask.
- → `user-surface-records`: slug-keyed parser reconcile + field ordering (writer half); `_Awaiting:_` flag;
  tombstones out of rendered files; tombstone TTL config; WORKING-MEMORY parser drops; `arc inbox add` pairing;
  entry-identity decoupling.

## Kickoff (first action)

**Flip `adr-022` Proposed → Accepted.** The ADR's flip trigger (ADR-022 Status) — post-decomposition this rides
`managed-record-substrate`'s activation, as the first action before substrate work begins.

## Dependencies and Sequencing

- **`cli-substrate-adoption`** (hard, upstream) — provides the zod substrate and the meta record schema this
  WU extends to the remaining surfaces.
- Coordinates with `roadmap-tooling` (the `STATUS.*` renderer is an instance of the render engine),
  `storage-contract` (the record-family parsers and where each surface is stored), and
  `cross-machine-sync-coherence` (transport hardening for notes-synced members).
- **`knowledge-lint`** (boundary, settled at its 2026-07-02 grooming) — standing consistency enforcement over
  `.arc/` splits by document class: this WU owns record-schema conformance (round-trip harness + corpus gate)
  over the managed class; `knowledge-lint` owns the durable prose corpus no schema governs. Resolve-don't-store
  means rendered projections need no lint coverage — this WU shrinks that WU's surface by construction. The
  corpus conformance gate may surface as a check family under its `arc lint` umbrella; coordinate the
  family-registration seam at spec time.
- **`composable-workflows`** (downstream consumer, 2026-07-02 grooming) — its agenda-compiler invalidation rule
  shrinks as this WU makes session fields (e.g. the SESSION-NOTES `Session Type:` override) CLI-readable record
  fields the compiler consumes — a real dependency edge; its generated-from-types envelope-schema pilot applies
  ADR-022's managed-records philosophy to documentation and coordinates with this WU's schema-home question.
- Forward-compat self-check against `strategy-storage-evolution`: the record layer stays storage-agnostic so
  records lift to the backend tier without reshaping.

## Open Questions

- Schema-home convention (shared with `cli-substrate-adoption`'s open question).
- The reconciled-region delimiter and the recovery behavior on a malformed region.
- Per-member migration order and interim coexistence with markdown-canonical readers.
- ADR-022's managed-doc member list still names `BACKLOG-INBOX`; `work-routing-discipline` retired that
  surface, so verify at execution whether the list needs the removal — a role-based reconciliation, not
  rename-driven (ADR-022 is rename-agnostic).

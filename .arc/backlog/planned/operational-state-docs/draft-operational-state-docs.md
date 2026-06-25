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

### `[ ]` **Dependency-edge lifecycle semantics (gate vs. lineage)**

- _Routed from:_ `USER-INBOX § Backlog`, housekeep drain (2026-06-06); captured after
  `class-model-foundation` archival. Sharpened from `decomposition-machinery` planning (2026-06-09).
- _Concern:_ `Depends On` is **state-blind** — it names a dependency without signaling whether that dependency has
  shipped. This bites in two places: **(a) at read time** — an agent reading a meta / draft during planning can
  read a satisfied edge as live (observed live 2026-06-09: `class-model-foundation`, shipped and archived at
  `completed/2026-q2/15_class-model-foundation/`, was reasoned about as an in-flight collaborator while planning
  `decomposition-machinery`); **(b) across the lifecycle** — the edge is a live readiness gate while a WU is
  planned / active, but historical lineage once discharged. Decide the field's lifecycle treatment.
- _Boundary — the gate discharges at activation, not archival:_ a dependency's _scheduling_ job ("don't start
  until B lands") is done once the dependent WU **activates** (start precedes completion), not at ship — so a
  live→discharged transition keys on **activation**. Nuance: activation does **not** imply all deps landed —
  concurrent / stacked delivery activates a WU while a dep is in-flight (rebased onto the dep's branch), so
  activation _examines each edge and discharges only the landed ones_; unlanded deps stay live (they are the real
  remaining blockers).
- _Lean (sharpened 2026-06-09) — resolve at lifecycle triggers, not handle-at-render:_ `Depends On` is two
  concerns under one label — a **live scheduling gate** (currently-blocking deps; wants resolution when satisfied
  so it never misleads) and **build lineage** (atemporal "built on B"; wants preservation). Treat the field as the
  live gate and **resolve discharged edges off it at lifecycle triggers**: `init-work-unit` authors /
  `activate-work-unit` discharges satisfied / the planning workflows _ground-read_ without mutating (pre-activation
  edges are legitimately forward-looking) / session-init _optionally surfaces_. The burden sits at write-once
  events, not every-session read. Lineage, if wanted, rides **write-once prose provenance** (the dual of
  decomposition's at-cap "provenance, not live grouping" move), **not** a maintained structured `Depended On`
  alias — a parallel field needs a guard and mints a second source of truth, the same reasons decomposition rejects
  a maintained cohort roster. Lineage already lives in git history, the `completed/` archive, and spec prose, so a
  structured lineage field is YAGNI absent a concrete consumer.
- _Reweighs the prior lean:_ the earlier routing favored "keep canonical, handle at render" (atemporal structural
  truth; nulling destroys data). That argument is real but solves only the _render_ consumer — it is invisible to
  the agent reading the raw meta / draft, the consumer that actually got misled (ROADMAP already de-emphasizes
  shipped deps; the raw meta does not). And "resolve" is not "destroy": a discharged edge moves from the live-gate
  field to provenance, it is not lost. Net: handle-at-render is insufficient alone; lifecycle-trigger resolution is
  the spine, render-relevance may complement.
- _Touchpoints:_ `init-work-unit` / `activate-work-unit` (resolution triggers); the planning workflows
  (ground-read); session-init (optional surface); plus `template-meta.md` / `archive-work-unit.md` /
  `renderMetaFile` / `parseMetaRecord` / validation expectations / completed-corpus migration if any field-shape
  change lands. Shares one substrate with the read-time half: **resolve a referenced WU's lifecycle state** (is X
  shipped? — a `completed/` check). Coordinates with `decomposition-machinery` (authors live-gate edges) and
  `roadmap-tooling` (render de-emphasis).

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

### `[ ]` **Carry the `identifier-list` valueClass into the managed-doc structured schema + round-trip harness**

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: operational-state-docs`), housekeep drain (2026-06-08);
  captured at `scalable-authoring-pipeline` Task 1.4.
- _Concern:_ SAP (Task 1.4) added an `identifier-list` valueClass to the meta projection (`meta-reader.ts`
  `META_FIELDS` / `formatValue` / `parseMetaRecord`) for `Depends On` / `Design`: per-element backtick render
  with a comma-joined record string recovered via the **global** `stripInlineCode`. The meta-reader docstring
  frames `valueClass` as "the proto-schema axis a later code-owned schema maps directly" — that later schema is
  this WU's deliverable.
- _Proposed:_ when formalizing the managed-doc structured schemas + render/reconcile engine, model list
  cardinality as a first-class axis (the `identifier-list` member), preserving the per-element render rule and
  the render↔parse round-trip invariant (per-element render → global-strip parse → comma-joined value). The
  round-trip harness must cover multi-value list fields so a regression to the compound whole-value form fails
  loud.
- _Scope:_ `meta-reader.ts` is the managed-doc surface this WU absorbs; coordinate with roadmap-tooling's
  sibling note on ROADMAP dep-cell rendering of the same fields.

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

### `[ ]` **Make the tombstone GC TTL a configurable per-user value**

- _Routed from:_ `USER-INBOX`, 2026-06-09.
- _Concern:_ the tombstone GC window is a hardcoded constant `TOMBSTONE_TTL_MS` in
  `packages/arc-framework/src/lib/user-sync/merge.ts` (7 days as of PR #72) — not configurable, so the
  legibility-vs-correctness tradeoff can't be tuned per project or developer.
- _Proposed:_ expose it as config. Interim: a project-level global key mirroring `inbox.remind_after_days`, whose
  `arc-config.yml` comment already documents the pattern ("conceptually a per-user preference; lives here today,
  migrating to a per-user config substrate later"); wire it through the merge (config → TTL into
  `mergeCrossWuFile`), status-reader, and config types.
- _Eventual home:_ `arc-config.user.yml` under `config-storage-architecture` (the per-user substrate); if that
  lands first, target it directly.
- _Note:_ once the sibling capture (record/projection) lands and tombstones leave the rendered file, the default
  can rise again — TTL becomes purely a merge-correctness knob (sized to the merge-window staleness horizon), not
  a legibility constraint.

### `[ ]` **CLI primitive: resolve a WU's lifecycle state by slug**

- _Routed from:_ `USER-INBOX § Backlog`, housekeep drain (2026-06-10); captured during
  `doc-cascade-sweep` draft-design.
- _Concern:_ planning and other workflows repeatedly need to know a referenced WU's lifecycle state
  (shipped / active / parked / planning / provisional) cheaply and deterministically; today the answer is ad-hoc
  `find`/`ls` across `active/`, `backlog/**`, and `completed/**`. This hit live three times in one
  `doc-cascade-sweep` planning session while resolving whether `scalable-authoring-pipeline`,
  `decomposition-machinery`, `work-routing-discipline`, and `naming-conventions` had shipped. It directly serves
  this WU's "planning grounds-reads / session-init surfaces" arms and the `Depends On`-edge state-blindness pain.
- _Approach:_ expose a slug → state resolver as a CLI primitive, composing the existing
  `lib/work-unit/completed-index.ts` + `lib/active/meta-reader.ts` plus `roster` /
  `materializable-work-units`. Return a **state enum**, not a boolean — `provisional` / `planning` / `active` /
  `parked-in-backlog` / `shipped` — so ROADMAP dep de-emphasis, in-flight-scope-check, and materialize all reuse
  it; `shipped?` is a trivial projection. Resolve by **location** first (presence under `completed/` = shipped;
  `active/` = active; etc.) as the authoritative ground-truth signal, and the meta `**State:**` field second,
  since the field can lag the directory (same Axis-1 git-is-truth logic session-init uses).
- _Scope:_ routed here rather than folded into `doc-cascade-sweep` because it is CLI code + tests, a distinct
  concern from the Light doc-sweep.

### `[ ]` **Lifecycle-complete cohort membership — graduated-vs-removed validator fix + cohort-doc archival loop**

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

### `[ ]` **WORKING-MEMORY parser silently drops wrapped or colon-less entry headers**

- _Routed from:_ express-lane capture, housekeep drain (2026-06-11); surfaced fixing a live
  "missing `_Remove when:_` trigger" warning on `WORKING-MEMORY.md`.
- _Concern:_ `lib/user-sync/parser.ts` recognizes a WORKING-MEMORY entry header only as a **single line** matching
  `^\*\*.+:\*\*$`. A header that **wraps** across two physical lines (common past the 120-char wrap target) matches
  nothing, and the whole entry is **silently swallowed** into its predecessor — no warning, dropped from the
  cross-WU merge. Found live: 3 of 12 entries dropped this way; a 4th had a missing colon (`_Remove when` without
  the `:`) and was at least _flagged_. A header that both wrapped and lost its colon would vanish with no signal.
- _Why here:_ this WU owns the WORKING-MEMORY structured record + the render↔parse round-trip harness. The record
  model makes the header a record field (not a parsed markdown line), and the harness turns today's silent drop
  into a **loud** failure. Interim mitigation is an authoring convention (single-line headers ≤120) — whack-a-mole;
  the durable fix is the record/harness.

### `[ ]` **Frame write-path enforcement explicitly: the consistency-hook is the compliance mechanism**

- _Routed from:_ `lifecycle-transition-core` determinism/judgment-boundary review (2026-06-16); surfaced asking
  whether cross-WU awareness (is a dep still live or shipped? who are the cohort siblings?) can be made
  deterministic / automated rather than drift-prone.
- _Concern:_ this WU's dep-edge resolution + projection substrate make cross-WU state _resolvable_, but the draft
  frames the guarantee as "resolve at lifecycle triggers" without naming **what makes the automation trustworthy**.
  The realization: automation is guaranteed **not** by "always use the CLI" (you cannot prevent a hand-edit to a
  markdown file in git) but by a **consistency check that makes non-CLI drift non-survivable at commit**. Two halves
  with different guarantees — **reads → resolve-don't-store** (drift _impossible_: nothing stored to drift — the same
  reason cohort siblings aren't stored in the meta), **writes → CLI-mutate + consistency-hook** (drift _caught_ at
  commit).
- _Approach:_ the precedent is `lifecycle-transition-core`'s encoding-consistency invariant (asserts meta `State` ·
  directory · branch — and, after that WU's executor task, the meta `Branch` _field_). Generalize it: the
  render/reconcile round-trip harness + the corpus conformance gate assert that every _stored_ cross-ref (dep-edge
  state, cohort membership, the planning-stage pointers) matches its _resolved_ projection, so a hand-edit that
  drifts fails the gate. State this explicitly in the substrate design as the compliance mechanism, paired with
  resolve-don't-store.
- _Note:_ ties together the Dependency-edge lifecycle entry (the dep-edge half) and the corpus-wide conformance gate
  entry (the enforcement vehicle) — it is the _framing_ that unifies them, not a separate build.

### `[ ]` **Re-home three cohort-shipped behaviors onto records (dep-edge discharge, slug resolver, cohort-membership/archival)**

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: operational-state-docs`), housekeep drain (2026-06-17);
  consolidates two captures — `lifecycle-transition-core` Task 4.7 (2026-06-15) and session-init forward-compat
  (2026-06-16).
- _Concern:_ the `lifecycle-state-machine` cohort has now **delivered as behaviors** (against the markdown
  substrate) three items this buffer still frames as OSD "build" work — see the existing entries **Dependency-edge
  lifecycle semantics (gate vs. lineage)**, **CLI primitive: resolve a WU's lifecycle state by slug**, and
  **Lifecycle-complete cohort membership — validator fix + cohort-doc archival loop**. Specifically: the slug→state
  resolver shipped in `lifecycle-state-resolver`; the cohort-membership / archival trigger + archive & cohort-doc
  sweep in `lifecycle-transition-core` Task 6.1/6.2; dep-edge discharge-at-activate in Task 4.7
  (`src/lib/work-unit/side-effects/discharge-dep-edges.ts`, already preserving the identifier-list backtick
  round-trip — treats `Depends On` as the live gate, resolves satisfied edges `shipped ∨ integrating`, no mirrored
  lineage field).
- _Approach:_ at OSD's next planning iteration, **reframe those three buffer entries from build-tasks to "re-home
  onto records"** so OSD doesn't double-plan. For the dep-edge discharge specifically the list mutation maps 1:1
  onto a structured `dependsOn` record — a **zero-reshape lift**, keeping the shipped readiness policy (`shipped ∨
  integrating`) and the gate-only treatment; OSD's slice is the record / projection substrate, not the discharge
  logic. The **validator-fix** and **corpus-conformance-gate** portions stay genuinely OSD's (unbuilt). The
  2026-06-16 write-path-enforcement entry already reframed only the consistency-hook framing — not these three.
- _Also — a 4th re-home target + a read-side consumer (housekeep drain 2026-06-21; from errand-lattice Task 3.2,
  2026-06-19):_ the **errand record** (shipped via errand-lattice, distinct provenance from the three cohort
  behaviors above) is a 4th surface to re-home onto records. Its consumer `arc errand close` reaps containment-safe
  (delete only when commits are provably preserved on `origin/<branch>` or in `base`) and ships a `--force` escape
  for the rest; one narrow case still needs the flag — a **squash-merge whose remote-tracking ref was already
  pruned** (commits exist under no name git can check). A live-PR merge-status read (read-side external state:
  `awaiting-merge` / `merged-cleanup`) would let `close` recognize the merged PR and auto-clear the reap without
  `--force`. Low priority — `--force` already covers it; this removes the manual flag in a rare window and depends
  on OSD's live-PR-read substrate (behind CSA). OSD owns the errand record's projection + read-side external state;
  `close` is the consumer.

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

### `[ ]` **Decouple cross-WU entry identity from rendered header text (managed-record model)**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: operational-state-docs`), housekeep drain (2026-06-21);
  captured during the errand-lattice session investigating recurring WORKING-MEMORY MD013 failures (2026-06-20).
- _Concern:_ user-sync keys cross-WU entry identity on the exact rendered header (`parser.ts` `key: header`;
  `merge.ts` `(section, key)`), so any header edit — including the one MD013 forces on a >120-char title — orphans
  the old identity. The merge then synthesizes a tombstone for the now-absent original header while treating the
  reworded entry as new, producing the near-duplicate `## Removed:` fossil trail (repeated `_Removed:_` timestamps =
  one merge pass minting several). Editing a placed tombstone heading is the same hazard from the other side: it
  changes the tombstone key and can resurrect the original entry if it's still inside the 10-note window
  (`CROSS_WU_NOTE_WINDOW`).
- _Approach:_ give entries a stable short ID/slug decoupled from rendered prose, so the long title lives in a
  wrappable body and rendering is a projection (line-length-immune) — the managed-record model. Interim if a full
  migration is too heavy: normalize/slug the merge key (hash or stable prefix) instead of raw header text, so a
  header reword no longer orphans identity.
- _Relationship:_ this is the **at-source / durable** fix for the recurring WORKING-MEMORY MD013 churn whose
  **interim** mitigation (scope `.arc/user/**` out of MD013 line-length lint) was executed as a config errand at
  this same drain (2026-06-21) — symptom there, root cause here. Sibling of the existing buffer entries **Reconcile
  the interim title-keyed parser to the slug-keyed grammar** (the USER-INBOX-side analog), **WORKING-MEMORY parser
  silently drops wrapped or colon-less entry headers**, and **Take tombstones out of the rendered files** — same
  rendered-text-as-identity family; build the slug/record decoupling once across them.

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

### `[ ]` **Re-point ADR-022's retired `cross-machine-sync-coherence` references to `partial-push-marker`**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-06-25); captured during `partial-push-marker`
  draft-design (ADR-022 forward-compat check).
- _Concern:_ ADR-022 § Risks (line ~202) and § Coordination (line ~257) still name the retired
  `cross-machine-sync-coherence` as the notes-synced transport-hardening dependency. Post-decomposition
  (2026-06-25) that dependency is `partial-push-marker`'s (the marker / partial-push owner). This WU owns the
  ADR-022 alignment edits, so the re-point rides the propagation set rather than a standalone errand.
- _Verified at drain:_ the capture's second premise is already stale — `draft-arc-backend.md` no longer
  references the retired slug, so the live remainder is ADR-022 only.
- _Adjacent (flagged, not routed here):_ ADR-027 (line ~134) and several backlog drafts
  (`state-ref-write-safety`, `naming-conventions`, `finalize-parallelism`, `external-coord-probe`, the
  `cross-machine-coherence` cohort, `stale-state-detect-and-pull`, `cross-wu-forward-compat`) also name the
  retired slug; each re-points to whichever decomposition successor owns its specific dependency — a
  per-reference design call, not a blanket rename.

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

# Task List: Work-Routing Discipline

- **Design:** `spec-work-routing-discipline.md`

---

## **Phase 1:** Capture surfaces + parser

_Purpose:_ Land the foundational data shapes everything downstream consumes — the sharpened `USER-INBOX` section
preambles + uniform `WU_Target` entry grammar, the atomic-only shared inbox, and the `parseUserInboxSection`
reconcile — so the probe (Phase 4) and `arc-housekeep` (Phase 3) read a settled surface.

_Design decisions:_ Lands shape + behavior on **current names** — `USER-INBOX` (`## Atomic` / `## Backlog`),
`ATOMIC-INBOX`; file/section renames (`→ INBOX.USER` / `INBOX.PROJECT` / `## Work Unit`) stay
`doc-naming-convention`'s. `USER-INBOX` already has both sections, so this sharpens preambles + adds grammar, not
creates sections. Parser reconcile is test-first (existing coverage in `user-sync-merge.test.ts`).
`BACKLOG-INBOX` is _retired_ (structural removal here; its content-drain is Phase 6). See
`notes-work-routing-discipline.md` § Inbox section preambles and § Entry-grammar subtleties (target-vocabulary;
map per its naming banner).

### `[x]` **1.1 `USER-INBOX` section-preamble sharpening + uniform entry grammar**

- _Goal:_ `USER-INBOX`'s two sections fully determine a capture's drain fate — the `## Atomic` and `## Backlog`
  preambles state the inline / errand-now / inbox-defer destinations, and every `## Backlog` entry carries a
  `WU_Target` field — so the section plus fields, not memory, route the entry.

    - `[x]` **1.1.a Rewrite the `## Atomic` / `## Backlog` preamble callouts**
        - Landed the routing-model callouts (destination story in the preamble, character token in the heading)
          under each section, replacing the prior one-line descriptions.
        - Edited the template `packages/arc-framework/templates/user/USER-INBOX.md` (canonical shape for new
          installs) and aligned the live `.arc/user/andrew/USER-INBOX.md` preambles to match; existing entries
          left in the flat shape for Phase 6.1 reshape.

    - `[x]` **1.1.b Add the `WU_Target` descriptor to the `## Backlog` entry grammar**
        - `## Backlog` entry-shape comment now documents the `WU_Target: <slug>` / `<slug>
          (planned|provisional)` / `TBD` field with the existence-at-drain route-vs-create rule (no `new`
          keyword); `## Atomic` takes none. The field rides the entry body (housekeep reads it; the merge parser
          keeps it in `raw`).

- _Outcome:_ Both `USER-INBOX` copies (template + live) carry the routing-model section callouts; the
  `## Backlog` entry-shape comment self-defines the H3+checkbox grammar with the `WU_Target` field, dropping the
  pointer to the retiring `BACKLOG-INBOX` (Task 1.3 completes that retirement). Heading kept as `## Backlog` per
  the naming banner — the `→ ## Work Unit` rename stays `doc-naming-convention`'s.

### `[x]` **1.2 `parseUserInboxSection` ↔ template reconcile (test-first)**

- _Goal:_ The `USER-INBOX` parser reads the template's current H3+checkbox managed-entry shape — so an entry
  authored per the template parses to its `{section, key, raw}` envelope instead of being silently dropped at
  merge.
- _Outcome:_ Converged the `USER-INBOX` parser onto the H3+checkbox grammar: the `UI_LEAD_IN` flat-list regex
  retired, and the section parser now keys on the bold title via the same H3 boundary as errands. Took the
  unify path the `_Note:_` sanctioned — extracted a shared `parseH3Section(lines, section, label, out)` helper
  (generic `H3_BOUNDARY` / `H3_KEY` regexes) that both `parseUserInbox` (Atomic/Backlog) and `parseErrands`
  (Queue) delegate to; `WU_Target` and other descriptors ride verbatim in `raw`, never parsed as fields. Test
  fixtures across the parse, merge-fold, and tombstone cases were reshaped flat → H3 (merge identity / recency
  behavior unchanged). Doc comments in `parser.ts` / `types.ts` / `merge.ts` updated off the stale "lead-in"
  vocabulary. Files: `parser.ts`, `types.ts`, `merge.ts`, `__tests__/unit/user-sync-merge.test.ts`.

### `[x]` **1.3 Shared inbox atomic-only + `BACKLOG-INBOX` structural retirement**

- _Goal:_ The shared project inbox is atomic-only — `ATOMIC-INBOX` survives as the homeless-atomic surface and
  `BACKLOG-INBOX` is no longer a write target — so homeless multi-step work has no shared resting place and must
  graduate to a provisional stub.

    - `[x]` **1.3.a Sharpen `ATOMIC-INBOX` to the atomic-only homeless role**
        - Rewrote the preamble (both copies: `.arc/backlog/ATOMIC-INBOX.md` +
          `packages/arc-framework/arc/backlog/ATOMIC-INBOX.template.md`) to state the homeless-atomic-only role,
          multi-step → provisional stub, and the asymmetry-legibility rationale (no work-unit stub passes through;
          only genuinely homeless single-step items rest here). Kept the rationale timeless — no transitional
          rename framing in the adopter-facing template.

    - `[x]` **1.3.b Retire the `BACKLOG-INBOX` template + references**
        - Deleted `packages/arc-framework/arc/backlog/BACKLOG-INBOX.template.md` and removed its scaffold wiring:
          `SCAFFOLDED_FILES` (`classification.ts`), the `pm.mode == arc-in-git` include (`init-recipe.json`),
          the scaffold-map row (`strategy-package-project-sync.md`), and the four referencing tests
          (`init`/`init.e2e`/`reconfigure` drop the entry; `manifest/plan` swaps to `ATOMIC-INBOX` to keep the
          arc-in-git-layer coverage).
        - Folded in two stale source-refs: `commit-footer.md` queue-shaping examples (`BACKLOG-INBOX` →
          `ATOMIC-INBOX`, both copies) and `1_create-spec.md`'s Promotion-write conditional — removed (both
          copies), since the retirement eliminates the shared multi-step inbox that was its only promotion source.
        - Deferred per the WU's phase split (untouched here): `DEV-RULES.ARC` (2.1), `strategy-planning-module` +
          `session-operations` (2.2), `integrate` write-stop (5.1), `activate` absorption (5.2); live
          `.arc/backlog/BACKLOG-INBOX.md` content-drain + deletion (6.2). ADRs left as immutable records.

## **Phase 2:** Work-routing doctrine + merge-lane + coordination

_Purpose:_ Codify the errand-era doctrine across the constitutional and strategy surfaces, set the merge-lane
rules the `arc-housekeep` drain must obey, and record the forward-compat write-backs into downstream WUs — the
durable-documentation layer that makes the surfaces (Phase 1) and mechanism (Phase 3) authoritative.

_Design decisions:_ Placed after Phase 1 so the doctrine documents the just-built surfaces by their settled
shape, and before Phase 3 so the contract precedes the mechanism that implements it. Doctrine uses current
names (`USER-INBOX` / `ATOMIC-INBOX`). All edits are dual-copy (`.arc/` + `packages/arc-framework/arc/`) per
package-project-sync. The `doc-naming-convention` write-back rewrites its inbox _collapse_ into a _simple
rename_ of the surviving `ATOMIC-INBOX` (atomic-only). Heaviest doc phase — five parents (2.1–2.4 author the
doctrine on the current `### Leave it cleaner` heading; 2.5 promotes it to a top-level section and cascades the
refs); splittable if review prefers. See `notes-work-routing-discipline.md` § Merge-lane reasoning detail and
§ Coordination write-back
specifics.

### `[x]` **2.1 `DEV-RULES.ARC § Leave it cleaner` rewrite (both faces)**

- _Goal:_ `§ Leave it cleaner` states the errand-era routing doctrine in full, so the rule a developer reads
  matches the surfaces and mechanism this WU ships.
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **2.1.a Replace the routing table with the capture decision table**
        - Commitment table replaced by the 3-row urgency × isolation table (inline / errand-now / inbox-defer),
          with the capture-time-coarse / drain-time-fine split stated above it; the `Express lanes, never forced`
          block carries the committed-work direct-to-stub/errand path and the queuing-is-free rationale.

    - `[x]` **2.1.b Add the holding-vs-execution boundary**
        - `Holding ≠ execution`: the inbox holds, never executes; out-of-WU execution always via `arc-errand`
          (no hand-rolled fix, no bypass branch); promotion moves the source entry; note-routing-to-a-stub is not
          execution.

    - `[x]` **2.1.c Add the anti-rider rule**
        - `Anti-rider`: concern-identity, not file-identity — same-concern micro-cleanup inline, distinct
          same-file concern errands. PR-packaging consequence stated (distinct concerns never share a PR; two
          same-file concerns sequenced, not merged) as the agent-facing citation surface for 2.3.

    - `[x]` **2.1.d Add the planning-artifacts-aren't-capture anti-pattern**
        - `Planning artifacts aren't capture surfaces`: generalized to draft / spec / notes / meta /
          `Coordination §` — cross-ref yes, record-of-record no; framed as the dual of the core invariant.

- _Outcome:_ Section rewritten on both copies, on the current `### Leave it cleaner` heading (2.5 promotes it to
  `§ Discovered Work Routing`). Beyond the four faces, the rewrite opens with the **core invariant** (a WU's stub
  is the single authoritative home; no known-home item rests in a capture surface) and folds the drain-timing
  shift (housekeep, not the integration ceremony; `BACKLOG-INBOX` gone; homeless multi-step → provisional stub)
  plus the express-lanes synthesis settled this session.

### `[x]` **2.2 Strategy alignments (planning-module, work-organization, session-operations)**

- _Goal:_ The strategies documenting capture / incidental / inbox behavior agree with the rewritten
  `§ Leave it cleaner` — none still describes the pre-errand drain-at-integration model.
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **2.2.a `planning-module` — § Inbox Family, § How Work Flows Through, § Ceremony-Only Writes**
        - Swept `BACKLOG-INBOX` from the whole file (the three named sections plus § What It Installs table +
          surface count, and the tracked/absent-artifact enumerations); sharpened `### backlog/ATOMIC-INBOX.md` to
          the homeless-atomic-only role (housekeep writes, ceremonies read); reframed + renamed
          `## Ceremony-Only Writes` → `## Shared-Inbox Write Discipline` (the push/pull split); drain path is now
          the between-WUs housekeep flow, not integration. TOC updated.

    - `[x]` **2.2.b `work-organization § Incidental Work Model`**
        - Added an anti-rider pointer (concern-identity; cross-refs `§ Leave it cleaner` + `§ Auto-Merge Lane`)
          and absorbed the express-lane cost rationale trimmed from the rule (queuing to either inbox is free;
          only execution costs isolation).

    - `[x]` **2.2.c `session-operations § USER-INBOX`**
        - Drain timing → between-WUs housekeep (off integration); dropped `BACKLOG-INBOX` (atomic → `ATOMIC-INBOX`,
          multi-step → provisional stub); added the `WU_Target` grammar to the section structure; retargeted the
          renamed `§ Shared-Inbox Write Discipline` cross-ref.

- _Outcome:_ All three strategies agree with `§ Leave it cleaner`; both copies identical, lint clean. The (A)
  rename of planning-module's `§ Ceremony-Only Writes` leaves `integrate-work-unit`'s now-stale reference to it
  dangling until Task 5.1 removes Step 10 wholesale (breadcrumbed on 5.1) — consistent with the plan's Phase 2→5
  migration window.

### `[x]` **2.3 Merge-lane codification (`strategy-work-organization § Auto-Merge Lane`)**

- _Goal:_ `§ Auto-Merge Lane` governs how an `arc-housekeep` drain hits the lanes, so a drain's PR structure is
  prescribed rather than improvised.

    - `[x]` **2.3.a One PR per lane + concern-coherence batching**
        - Added `### The housekeep drain` (after `### Path classification`): one PR per lane (lanes never mix);
          concern-coherence — not file/destination — bounds a PR (routing sweep → one batched auto-merge PR;
          code-execution errand stays 1:1, may span files); distinct same-file concerns sequenced, not merged;
          provisional stub auto-merges. Anti-rider cross-referenced to `DEV-RULES.ARC § Leave it cleaner`, not
          restated.

    - `[x]` **2.3.b The four-condition review threshold + housekeep carve-out**
        - Four-condition threshold (foreign-owner / design authority / constitutional / unverifiable derived-surface
          hand-edit, a sunset trigger) framed as the principle beneath the prefix fast-path — conditions 2–4 map to
          the reviewed-lane prefixes, condition 1 (ownership) is what a prefix can't see. Carve-out: the drain's own
          homeless-flush + disciplined `ROADMAP` regen auto-merge.

    - `[x]` **2.3.c CWC coordination note (P1)**
        - `**Foreign edits beyond the in-flight gate**` paragraph: condition 1 classifies foreign-owned artifacts
          (any state) as reviewed, but the mechanism catches only in-flight edits; gating dormant foreign edits is
          the project's concurrent-work discipline's concern (audience-neutral — CWC not named in adopter-facing
          surface).

- _Outcome:_ `§ Auto-Merge Lane` now carries the drain-interaction layer (both copies). The pre-existing Path
  classification's "shared inboxes change only at reviewed ceremonies" parenthetical was reconciled to point at
  the new carve-out, resolving the contradiction the carve-out would otherwise create.

### `[x]` **2.4 Forward-compat write-backs (doc-naming-convention, operational-state-docs, CWC)**

- _Goal:_ The downstream WUs whose plans this work shifts carry the updated assumptions in their own artifacts,
  so each is correctly informed when next iterated and no foreign work-item rests here as record-of-record.

    - `[x]` **2.4.a `doc-naming-convention` write-back**
        - Rewrote the shared-inbox _collapse_ to a _simple rename_ of the surviving `ATOMIC-INBOX` (atomic-only,
          one section): Renames table row, the renamed `Design decisions` block, the section-anchors note (the
          two-section shape is now `INBOX.USER`-only), the motivation inbox list, and a new
          `work-routing-discipline` coordination bullet carrying the uniform `WU_Target` grammar into the rename
          cascade. Removed the now-moot § Open Questions bullet (shared-inbox section rename dissolved).

    - `[x]` **2.4.b `operational-state-docs` write-back**
        - Dropped `BACKLOG-INBOX` from the managed-doc member list (Purpose + Scope → singular shared
          `ATOMIC-INBOX`); inbox schemas adopt the slug-keyed managed-entry grammar including `WU_Target`; added
          an Open Question flagging the `adr-022` member-list `BACKLOG-INBOX` reconciliation as verify-at-execution
          (role-based, not rename-driven). No `adr-022` edit (out of scope; rename-agnostic record).

    - `[x]` **2.4.c CWC de-scope record**
        - Confirmed: the general base-branch-write-guard + commit-hook backstop (shared write-context classifier)
          is already recorded in `USER-INBOX § Atomic`, routed from this WU's design session and home-targeted to
          Concurrent Work Conventions. No new authoring — it drains to CWC's stub at the Phase 6 pass.

- _Outcome:_ All three downstream artifacts now reflect the `BACKLOG-INBOX` retirement and the uniform
  `WU_Target` grammar; single-copy (`backlog/` drafts, no package mirror). No foreign work-item rests in this
  WU's artifacts as record-of-record.

### `[ ]` **2.5 Promote to `DEV-RULES.ARC § Discovered Work Routing` (H2) + decompose + ref cascade**

- _Goal:_ The routing doctrine sits at its true altitude — a top-level `§ Discovered Work Routing` governing
  capture during _any_ work, with `Leave it cleaner` preserved as its behavioral-floor subsection — and every
  cross-reference resolves to the new structure.
- _Note:_ Content is authored by 2.1–2.4 under the current `### Leave it cleaner` H3; this task is the structural
  promote (H3 → H2), the internal decomposition, and the mechanical ref cascade — kept separate so the doctrine
  rewrite and the rename churn review independently. Source: `notes-work-routing-discipline.md`.
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **2.5.a Restructure `DEV-RULES.ARC` (dual-copy)**
        - Promote `### Leave it cleaner` (under `## Task Execution`) to a top-level `## Discovered Work Routing`;
          keep `### Leave it cleaner` as the behavioral-floor subsection (anchor `#leave-it-cleaner` preserved);
          split the routing table, holding-vs-execution, anti-rider, and planning-artifacts content into sibling
          subsections. Update the document TOC bullet.

    - `[ ]` **2.5.b Retarget the routing-table cross-refs (dual-copy + harness skills)**
        - Refs meaning _the routing table_ point to `§ Discovered Work Routing`; refs meaning _the behavioral
          rule_ (e.g. `issue-triage`, `arc-task-review`) stay on `§ Leave it cleaner`. Covers `3_process-task-loop`,
          `integrate-work-unit`, `activate-work-unit`, the `arc-errand` / `arc-task-review` skills,
          `DEV-RULES.PROJECT`, and the strategies (`work-organization`, `planning-module`,
          `configurability-architecture`).

    - `[ ]` **2.5.c Internal-record handling**
        - Leave `adr-001` / `adr-013` naming the rule as it stood at decision time (historical record); update
          live internal pointers (`analysis-cross-cutting-dependencies`, `docs-content-sweep` notes) only where
          they cite the routing role rather than the historical name.

## **Phase 3:** `arc-housekeep` mechanism

_Purpose:_ Build the between-WU drain — a thin `arc-housekeep` skill dispatching a drain/route workflow — plus
the machine-checked write-context guard that refuses/relocates off a base-branch context, reusing `arc errand`'s
resolution.

_Design decisions:_ Skill/workflow split mirrors `arc-commit → prepare-commits`. The guard's context classifier
is test-first (reuses `resolvePrimaryWorktreePath`; the new logic is the on-WU-branch refusal). Routing is
defined against the logical model (entry · character · home), not markdown format, so a later structured-record
swap doesn't break it. _Open question pinned here (resolve at authoring):_ the presentation of the `ERRANDS.md`
staleness + shared-inbox aging surfacing (spec § Open Questions, item b) — default a brief advisory line; settle
when authoring the surfacing step. See `notes-work-routing-discipline.md` § Drain timing and ownership.

### `[ ]` **3.1 Drain/route workflow (logical-model routing)**

- _Goal:_ A drain/route workflow reads `USER-INBOX`, classifies each entry by character and home, and routes it
  in one batched pass — leaving `USER-INBOX` empty — so the between-WU drain is a repeatable mechanism, not
  manual discipline.
- _Approach:_ classify each entry (existing-stub home / new stub / atomic errand / homeless), then route on
  housekeep's own auto-merge branch: stub edits written straight in; standalone atomic execution via a reviewed
  errand; homeless atomics flush to `ATOMIC-INBOX`; homeless multi-step graduates to a provisional stub. PR
  structure follows § Auto-Merge Lane (2.3).
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[ ]` **3.1.a Author the workflow skeleton + precondition**
        - Frontmatter, steps, and the base-branch write-context precondition (gated by the 3.3 guard). New
          Framework workflow (both copies) under `supplemental/`, matching `prepare-commits` (the closest
          skill+workflow analog).

    - `[ ]` **3.1.b Classification + routing logic (logical model)**
        - The four routes, defined against entry · character · home (not markdown format), so a later
          structured-record swap doesn't break it.
        - Group planning-routing writes into one auto-merge PR (one coherent concern); keep each code-execution
          errand standalone (1:1) — never auto-batch code. Lanes never mix (§ Auto-Merge Lane, 2.3).

    - `[ ]` **3.1.c Move-not-copy promotion**
        - Routing removes the source `USER-INBOX` entry as part of the write → the inbox ends empty.

    - `[ ]` **3.1.d Staleness + aging surfacing**
        - Surface the `ERRANDS.md` staleness sweep and shared-inbox aging. _Resolves open question (b):_ default
          a brief advisory line; finalize the presentation here.

### `[ ]` **3.2 Thin `arc-housekeep` skill (dual entry point)**

- _Goal:_ `arc-housekeep` is invokable as a thin skill that dispatches the drain/route workflow, and the same
  logic is reachable from `session-handoff`'s between-WUs path — one workflow, two doors.
- **Strategies:** strategy-workflow-authoring.md

    - `[ ]` **3.2.a Author the `arc-housekeep` SKILL.md**
        - Thin skill mirroring `arc-commit`'s shape. Canonical `.arc/system/.internal/skills/arc-housekeep/` +
          package mirror; hand-sync the harness copy if exercised this session (self-hosting skill drift).

    - `[ ]` **3.2.b Keep the mechanism DRY**
        - The workflow is the single logic home; the skill and the `session-handoff` between-WUs path (Phase 5.3)
          both dispatch it — factor, don't duplicate.

### `[ ]` **3.3 Machine-checked write-context guard (test-first)**

- _Goal:_ Invoked off a base-branch write context, `arc-housekeep` refuses or offers to relocate rather than
  writing shared base-branch paths from a WU branch — the precondition enforced mechanically, not by prose.
- _Shape:_ A new read-only `arc housekeep check` subcommand mirroring `arc errand check` — emits a
  machine-consumable classification (with `--json`) the skill/workflow consults. Adds an `arc housekeep` command
  group in `cli.ts` + `src/handlers/housekeep.ts` (+ command/lib), mirroring the errand file layout.
- _Note:_ Reuses `resolvePrimaryWorktreePath` (`src/lib/git/worktree-roster.ts`), `readConfigSettings`
  (`branch.base`), and current-branch resolution — the same context `arc errand` resolves; the existing
  `isProtectedBaseBranch` (`lib/release/interlock-validation.ts`) is a candidate building block.
- **Strategies:** strategy-testing-methodology.md

    - Build `test-first` (one behavior at a time):
        - On the configured `branch.base` (primary-worktree base context) → the guard passes (proceed).
        - On a WU branch (`plan/<name>` or `<type>/<name>`, i.e. not `branch.base`) → the guard refuses with a
          relocate offer.
        - Context resolution matches `arc errand`'s (primary worktree path, current branch, `branch.base`).
        - Degenerate state (detached HEAD / no base) → safe refusal, not a silent write.
        - `--json` emits the classification shape the skill consumes.

## **Phase 4:** CLI probe + session-init wiring

_Purpose:_ Add the `inboxState`/`housekeepNeeded` probe field to the session-init envelope and wire the
session-init workflow's soft-offer — making the empty-`USER-INBOX`-at-WU-start invariant a real forcing
function.

_Design decisions:_ Probe lib is test-first, modeled on `errand-staleness-sweep.ts` and slotted into
`SessionInitProbeResult` parallel to `errandSweep`. The session-init workflow gains the `housekeep` intent (the
third Orient-arm intent beside discovery and errand). Soft-encourage, never hard-block.

### `[ ]` **4.1 `inboxState` probe lib (test-first)**

- _Goal:_ A probe computes the routable-entry count in `USER-INBOX` and a `housekeepNeeded` flag — so
  session-init offers housekeep from a machine-resolved signal, not an agent re-scan.
- _Shape:_ A pure function `runInboxState({ content })` over `USER-INBOX` text, returning
  `{ routableCount, housekeepNeeded }` — parallel to `runErrandStalenessSweep`. New lib
  `src/lib/session-init/inbox-state.ts`. Counts `parse.ok` entries from
  `parseCrossWuEntries(content, "user-inbox")`, so "routable" = well-formed entries (depends on the 1.2 parser).
- _Note:_ Identity-gating and the file read live in the orchestrator (4.2), not this pure lib.
- **Strategies:** strategy-testing-methodology.md

    - Build `test-first` (one behavior at a time):
        - Counts `parse.ok` entries across `## Atomic` + `## Backlog`.
        - `housekeepNeeded` is true when the count > 0, false on an empty inbox (trivial emptiness gate).
        - Empty content → count 0, `housekeepNeeded` false.
        - Malformed (`{ok:false}`) entries aren't counted — mirrors the sweep skipping unageable entries.

### `[ ]` **4.2 Wire probe into the session-init status envelope**

- _Goal:_ The `arc status --session-init --json` envelope carries an `inboxState` slot parallel to `errandSweep`,
  so the workflow reads `housekeepNeeded` without re-scanning.

    - `[ ]` **4.2.a Add the `inboxState` slot to the probe types**
        - Extend `SessionInitProbeResult` and the `SessionInitProbes` interface (`src/commands/status/types.ts`).

    - `[ ]` **4.2.b Orchestrate + bind the probe**
        - Read `USER-INBOX` and call the probe in `runSessionInitStatus` (`src/commands/status/run.ts`); bind in
          the handler (`src/handlers/status.ts`), gated on identity present (like `errandSweep`) — identity
          absent resolves the slot to skip/empty. The slot rides the envelope as
          `inboxState.value.{routableCount, housekeepNeeded}`. Cover with an integration test (present, empty,
          identity-absent).

### `[ ]` **4.3 session-init `housekeep` intent + soft-offer**

- _Goal:_ Session-init's Orient arm offers housekeep when `USER-INBOX` has routable entries — a third intent
  beside discovery and errand — soft-encouraging the empty-at-WU-start invariant without blocking.
- _Note:_ Cross-file refs (session-init ↔ housekeep ↔ session-handoff) use stable heading-slug anchors, never
  ordinal `Step N` refs (composable-workflows interim convention).
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **4.3.a Add the `housekeep` intent to the entry dispatch**
        - Step 2 Orient arm reads `inboxState.housekeepNeeded` and carries the housekeep intent.

    - `[ ]` **4.3.b Add the soft-offer to orientation**
        - Step 6: "No active WU. `USER-INBOX`: N pending — housekeep?" Soft-encourage, never hard-block. Both
          copies (`session-init` is `.template.md` in the package).

## **Phase 5:** Lifecycle-workflow deltas

_Purpose:_ Wire the mechanism into the remaining lifecycle workflows — remove the integration-ceremony drain,
reframe activation absorption, add the dedicated between-WUs handoff path, and add the init backstop warning —
so the drain failure is structurally designed out.

_Design decisions:_ `session-handoff`'s between-WUs path wires to the same drain logic as the standalone skill
(DRY, two doors). All workflow edits dual-copy; `session-init`/`session-handoff` are `.template.md` in the
package source.

### `[ ]` **5.1 Remove `integrate-work-unit` Step 10 (drain leaves integration)**

- _Goal:_ Integration ships only the WU — the `USER-INBOX` → shared-inbox drain no longer rides the integration
  commit — so the failure mode (deferred under PR-leanness pressure) is structurally removed.
- _Note:_ Removing Step 10 also stops the `## Backlog` → `BACKLOG-INBOX` write — the write-stop leg of the
  `BACKLOG-INBOX` retirement (1.3 template, 6.2 content). Renumber the subsequent steps. 2.2.a already reframed
  and renamed the planning-module section to `§ Shared-Inbox Write Discipline` (housekeep writes, ceremonies
  read); removing Step 10 here also drops `integrate-work-unit`'s now-stale `[planning-ceremony]` reference +
  link def to it (dangling since 2.2.a). Both copies.

### `[ ]` **5.2 Reframe `activate-work-unit` Step 6 (absorption narrowing)**

- _Goal:_ Activation absorbs only from the shared inbox (homeless items whose home turns out to be this WU);
  `USER-INBOX` absorption is dropped as degenerate (empty post-housekeep) — so the step matches reality.
- _Note:_ Drop the `BACKLOG-INBOX` reference (retired); the shared inbox is now atomic-only `ATOMIC-INBOX`. Both
  copies.

### `[ ]` **5.3 `session-handoff` dedicated between-WUs path**

- _Goal:_ Session-handoff has a streamlined between-WUs branch — no SESSION-NOTES write, no meta commit, review
  WORKING-MEMORY removals, offer housekeep if captures pending, sync, confirm — wired to the same drain logic as
  the standalone skill.
- _Note:_ Folds the standing `USER-INBOX § Atomic` capture (the between-WUs-path request). Compose as a
  resolve-then-load fragment (composable-workflows forward-compat), not a parallel copy. SESSION-NOTES
  _content_ cleanup stays `handoff-optimization`'s — adjacent concern, coordinate.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[ ]` **5.3.a Add the between-WUs branch (DRY)**
        - Factor the shared steps rather than duplicating the active-WU path; the branch skips SESSION-NOTES /
          meta-commit and reviews WORKING-MEMORY removals. Replaces the scattered `(if an active WU exists)`
          conditionals and the "next-session pointer" marker — durable captures route to existing surfaces
          (`USER-INBOX` / `WORKING-MEMORY` / `ROADMAP`), not a phantom pointer file.

    - `[ ]` **5.3.b Wire the housekeep offer**
        - Reuse the Phase 3 drain logic (the second of the two doors); offer housekeep when captures pend.

### `[ ]` **5.4 `init-work-unit` non-blocking backstop warning**

- _Goal:_ Starting a new WU with a non-empty `USER-INBOX` emits a non-blocking warning ("starting new work with
  N pending captures — consider housekeep first") — a backstop reinforcing the empty-at-WU-start invariant at
  the init moment.
- _Note:_ Init, not activate — init is the begin-new-WU moment the invariant targets. Fires at Step 1/2 (before
  scaffolding), reading the `inboxState` probe. Both copies.

## **Phase 6:** Live validation (component b)

_Purpose:_ Run the new `arc-housekeep` flow against the real backlog — drain `andrew`'s long-deferred
`USER-INBOX` captures to their homes and retire `BACKLOG-INBOX`'s contents into provisional stubs. The first
live run _is_ the mechanism's validation; the next WU begins with an empty `USER-INBOX`.

_Design decisions:_ Exercises Phases 1-5 end to end. Run from the primary worktree / base-branch context per the
guard. _Open question pinned here (resolve at run):_ the errand↔PR chunking heuristic (spec § Open Questions,
item a) — default one PR per lane, chunk only if a drain is too large for one reviewable PR; the actual backlog
volume at run time decides.

### `[ ]` **6.1 Drain `andrew`'s `USER-INBOX` to homes**

- _Goal:_ `andrew`'s pending `USER-INBOX` captures are routed to their real homes by an actual `arc-housekeep`
  run — the mechanism's first live exercise, proving the drain end to end.
- _Approach:_ run the housekeep flow; classify + route each entry (existing-stub edits, new provisional stubs,
  standalone errands, homeless flush to `ATOMIC-INBOX`). PRs follow § Auto-Merge Lane; the chunking heuristic
  (open question a) settles against the actual volume.
- _Note:_ ~17 entries as of planning (8 § Atomic + 9 § Backlog). The live `.arc/user/andrew/USER-INBOX.md` is
  still flat-shape here — the Phase 1 parser switch doesn't reshape it (a harmless interim probe miscount).
  Reshape its entries to the H3+checkbox grammar, or read them directly, as the drain's first step.

    - `[ ]` **6.1.a Execute the drain over `USER-INBOX`**
        - Classify and route every `## Atomic` + `## Backlog` entry to its home.

    - `[ ]` **6.1.b Confirm the invariant holds**
        - `USER-INBOX` ends empty; the next WU starts clean.

### `[ ]` **6.2 Retire `BACKLOG-INBOX` contents to provisional stubs**

- _Goal:_ `BACKLOG-INBOX`'s accumulated entries reach durable homes and the file is deleted — completing the
  retirement begun in 1.3 (template) and 5.1 (write-stop).
- _Note:_ A one-time retirement migration, not a housekeep run (housekeep drains the personal `USER-INBOX`, not
  shared inboxes). ~13 entries, already in the managed-entry grammar (no reshape needed).

    - `[ ]` **6.2.a Route each entry to a durable home**
        - Triage each `BACKLOG-INBOX` entry: graduate to a `backlog/provisional/<wu-name>/` stub (`meta-*` +
          `draft-*` as scope warrants), merge into an existing WU where one fits, or dismiss if obsolete.

    - `[ ]` **6.2.b Delete the live `BACKLOG-INBOX.md`**
        - Remove the file and confirm no remaining references across docs/workflows/templates.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow [`verify-work-unit.md`][verify-work-unit]

---

## Success Criteria

- `[ ]` `DEV-RULES.ARC § Leave it cleaner` states the core invariant, the capture decision table, the
  holding-vs-execution boundary, the anti-rider concern-identity test, and the planning-artifacts-aren't-capture
  anti-pattern; the three strategies align with no contradiction.
- `[ ]` `USER-INBOX`'s `## Atomic` / `## Backlog` preambles carry the routing model and `## Backlog` entries
  carry `WU_Target`; `parseUserInboxSection` parses the shape with no silent drops (tests green).
- `[ ]` `BACKLOG-INBOX` is retired (template removed, writes stopped, contents drained, file deleted);
  `ATOMIC-INBOX` is the atomic-only shared inbox.
- `[ ]` `arc-housekeep` exists as a thin skill + drain/route workflow, refuses/relocates off a base-branch write
  context, drains `USER-INBOX` to empty, and is reachable from both the standalone skill and `session-handoff`'s
  between-WUs path.
- `[ ]` The session-init envelope exposes `inboxState`/`housekeepNeeded`; session-init carries the `housekeep`
  intent + soft-offer; `init-work-unit` warns on a non-empty `USER-INBOX`; `integrate-work-unit` Step 10 is
  removed; `activate-work-unit` Step 6 is narrowed.
- `[ ]` `strategy-work-organization § Auto-Merge Lane` codifies one-PR-per-lane, provisional-stub auto-merge, the
  four-condition review threshold, and the housekeep carve-out.
- `[ ]` The three forward-compat write-backs (doc-naming-convention, operational-state-docs, CWC de-scope) are
  recorded in their destinations.
- `[ ]` A live `arc-housekeep` run cleared `andrew`'s `USER-INBOX` and retired `BACKLOG-INBOX`; the next WU
  begins with an empty `USER-INBOX`.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md

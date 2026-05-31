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
rename_ of the surviving `ATOMIC-INBOX` (atomic-only). Heaviest doc phase — six parents (2.1–2.4 author the
doctrine on the current `### Leave it cleaner` heading; 2.5 promotes it to a top-level section and cascades the
refs; 2.6 names the coordination-write-back routing seam, discovered while executing 2.4); splittable if review
prefers. See `notes-work-routing-discipline.md` § Merge-lane reasoning detail and § Coordination write-back
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

### `[x]` **2.5 Promote to `DEV-RULES.ARC § Discovered Work Routing` (H2) + decompose + ref cascade**

- _Goal:_ The routing doctrine sits at its true altitude — a top-level `§ Discovered Work Routing` governing
  capture during _any_ work, with `Leave it cleaner` preserved as its behavioral-floor subsection — and every
  cross-reference resolves to the new structure.
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **2.5.a Restructure `DEV-RULES.ARC` (dual-copy)**
        - Promoted `### Leave it cleaner` out of `## Task Execution` to a top-level `## Discovered Work Routing`
          (placed between Task Execution and Session Management); core-invariant + take-responsibility framing lifted
          to the H2 preamble; decomposed into `### Leave it cleaner` (behavioral floor — `#leave-it-cleaner`
          preserved), `### Route by urgency × isolation` (the table), `### Holding ≠ execution`, `### Anti-rider`,
          `### Planning artifacts aren't capture surfaces`. TOC bullet added; Task Execution descriptor trimmed.

    - `[x]` **2.5.b Retarget the routing-table cross-refs (dual-copy + harness skills)**
        - Retargeted 33 routing/anti-rider/commitment refs across 17 files (dual-copy + the `.claude` `arc-errand`
          harness copy) to `§ Discovered Work Routing`: `3_process-task-loop`, `integrate-work-unit`,
          `activate-work-unit` (prose + the one hard anchor link, label renamed `dev-rules-leave-cleaner` →
          `dev-rules-discovered-routing` → `#discovered-work-routing`), `DEV-RULES.PROJECT`, `issue-triage` (both
          refs), `arc-errand`, `initial-setup/03` (package-only), and the strategies (`work-organization` ×6,
          `planning-module` ×3). _Stay on `§ Leave it cleaner`:_ `configurability-architecture` (names the
          capture-floor configurable method) and `docs/reference/skills.md` (concept name) — both unchanged.
          `arc-task-review` carries no such ref.

    - `[x]` **2.5.c Internal-record handling**
        - Left `adr-001` / `adr-013` at the decision-time name (historical record). Updated
          `analysis-cross-cutting-dependencies` (cites the routing role → retargeted). Left `docs-content-sweep`
          notes (a section-inventory row naming the surviving subsection, not a routing-role pointer).

- _Outcome:_ `§ Discovered Work Routing` is a top-level constitutional section across both copies; the
  `#leave-it-cleaner` anchor survives (now unreferenced — every hard link meant the routing table and retargeted).
  Behavioral-rule refs reduced on inspection to two name-references that legitimately stay; everything else routes
  to the new H2. Lint clean, framework parity holds (`DEV-RULES.PROJECT` template/instance divergence is
  pre-existing).

### `[x]` **2.6 Coordination-write-back routing rule (`strategy-work-organization § Errand Work Class`)**

- _Goal:_ The doctrine names the seam that decides whether a cross-WU edit rides the active WU or routes out —
  so the 2.4-shaped case (a spec-scoped write-back into a foreign WU's artifact) is covered, not left to be
  re-derived. Discovered in-WU while executing 2.4; folded in per `§ Discovered Work Routing` (in-WU discovery →
  new task).

    - `[x]` **2.6.a Add the third category to the Errand decision-matrix preamble**
        - Added to the matrix preamble: beyond "incidental-now → matrix" and "not-now → capture," a third case
          sits _outside_ the matrix — work your own WU's spec already claims (a scoped-in coordination write-back)
          is WU scope and rides the WU's PR, never an Errand; the matrix governs _incidental_ cross-cutting work
          only. The two axes were re-scoped to "that incidental case."

    - `[x]` **2.6.b State the ride-vs-route test (the spec seam)**
        - Added `**Coordination write-backs ride; incidental foreign edits route**` after the cross-cutting axis:
          the three-count ride test (scoped into your spec / mechanical propagation of _your_ decision / recorded
          into the foreign artifact's record-of-record) vs. routes-out (unrelated same-file fix = rider, or
          _foreign design authoring_). Framed as the same concern-identity test as anti-rider, deciding
          WU-scope-vs-route rather than inline-vs-defer.

    - `[x]` **2.6.c Confirm the CWC de-scope boundary at audit**
        - Confirmed the rule stays on the matrix-entry boundary (this WU's surfaces); the dormant-foreign-edit
          gating is deferred to "the project's concurrent-work discipline" in audience-neutral terms (no internal
          WU named in the adopter-facing surface). Spec-anchored per the **fold-into-existing** decision: a framing
          note under spec `§ Forward-compat write-backs (Coordination)` binds the general rule to its R20–22
          instances + the R18 anti-rider test (no standalone requirement).

- _Outcome:_ The spec-scoping seam is now codified in `§ Errand Work Class` (both copies) and spec-anchored. The
  Errand matrix no longer reads as "any foreign-artifact edit → Errand"; a spec-scoped coordination write-back is
  recognized as WU scope. Single new doctrine of this WU beyond the planned 2.1–2.5; the rest was restructure +
  alignment.

## **Phase 2.R:** Errand-model re-pivot + protection-mode correction

_Purpose:_ Re-baseline the Phase 1–2 doctrine to the corrected errand model — errands are execution-only (the
`ERRANDS.md` queue retired), capture is inbox-only, and protection-mode (`partial` vs `full`) is threaded
through — so Phases 3–7 build on a correct foundation rather than the `full`-biased, queue-muddied one. Remedial
by character: it corrects shipped surfaces and amends the design authority; it builds no new mechanism (the
errand lifecycle, `arc-inbox`, the probe arms, and the code/skill retirements are slotted into the later phases
by this phase's closing audit, 2.R.6).

_Design decisions:_ The spec (`§ Errand-model re-pivot`, R24–31) and ADR-021 (Amendment 2026-05-31) are amended
as the re-planning act that opens this phase. Doctrine corrections are prose-level and dual-copy where the
surface ships; the partial-vs-full split is expressed as clean blocks deferring to
`strategy-work-organization § Cheap-branch path` (the one localized split), never scattered conditionals, and
authored fragment-extractable for `composable-workflows`. Doctrine-before-mechanism mirrors Phase 2 → 3 (the
contract describes `run-errand` / `arc-inbox` before they are built). See `notes-work-routing-discipline.md`
§ Errand-model re-pivot.

### `[x]` **2.R.1 Amend the design authority (spec + ADR-021)**

- _Goal:_ The spec and the constitutional record carry the execution-only errand model and queue retirement, so
  every downstream correction and build cites a settled design.
- _Outcome:_ `spec-work-routing-discipline.md` gained `§ Errand-model re-pivot` (R24–31) plus Purpose /
  Introduction / Use-Case / Technical-Consideration / Success-Criteria / Open-Question revisions; `adr-021`
  gained Amendment (2026-05-31) recording the queue-as-capture-surface fault, the protection-mode bias, and the
  execution-only model (taxonomy unchanged, realization re-pivoted). Done as the re-planning act.

### `[x]` **2.R.2 `DEV-RULES.ARC § Discovered Work Routing` correction (both copies)**

- _Goal:_ The constitutional routing rule states the execution-only errand model and is protection-mode-aware,
  so the rule a developer reads matches the corrected mechanism.
- **Strategies:** strategy-package-project-sync.md
- _Outcome:_ Recast `§ Discovered Work Routing` for the execution-only, protection-mode-aware model (both
  copies, byte-identical): the urgency / capture routing-table routes now point at `arc-session --errand` and
  `arc-inbox`; "Express lanes" drops "queue an errand" (→ "run an errand"); `### Holding ≠ execution` rewritten —
  capture is inbox-only (via `arc-inbox`), an errand _is_ its execution (the `run-errand` lifecycle), the
  isolation rule is universal but its shape (full `chore/<slug>` branch vs. partial direct base commit) defers to
  `§ Cheap-branch path`, no queue / `errand-*` file / State field, and a captured item's inbox entry is removed
  at completion (slug-matched). Ambient discipline stays here; actionable specifics route to `arc-inbox` (R29).

### `[x]` **2.R.3 `strategy-work-organization` correction (both copies)**

- _Goal:_ `§ Errand Work Class`, `§ Cheap-branch path`, and `§ Entry path` describe the execution-only model with
  no queue, so the strategy is the single coherent home of the protection-mode split.
- **Strategies:** strategy-package-project-sync.md
- _Outcome:_ Narrower than scoped — Phase 2 had already authored `§ Errand Work Class`, the decision matrix, and
  `§ Cheap-branch path` in the execution-only / derived-state shape, so only two residues remained. Recast
  `§ Entry path` to the `run-errand` model (launches from any worktree; Launch resolves base and relocates the
  execution locus itself; defers the partial-vs-full split to `§ Cheap-branch path` rather than re-stating it),
  and retired the queue language in `§ Incidental Work Model` → "Why capture is cheap" (dropped the `ERRANDS.md`
  second capture surface and "queuing an errand"; capture is `USER-INBOX`-only, express lane is _running_ an
  errand). `run-errand` is named without a link — a forward-reference under doctrine-before-mechanism, to be
  wired when Phase 3 builds the workflow. Both copies byte-identical; Tier-1 clean.

### `[x]` **2.R.4 `USER-INBOX` + `session-operations § USER-INBOX` correction + reminder flag**

- _Goal:_ The capture surfaces describe the collapsed model and carry the reminder flag, so a committed-near-term
  errand-class concern has a home (a flagged `§ Atomic` capture) and the staleness signal survives without a
  queue.
- **Strategies:** strategy-package-project-sync.md
- _Outcome:_ Design refined first (spec R30 amended): the field is named for effect — `_Remind:_` (boolean,
  default `false`), not "urgency" — rendered only when `true` under a **managed-field render rule** (generalizing
  `WU_Target`; absence = default), with **parsed fields backtick-delimiting their value** (italic key, e.g.
  `_Remind:_` carrying `true`) to distinguish them from prose descriptors. Aging anchor is the tool-stamped
  `_Created:_` date — the errand sweep's stamped-date field carried forward onto flagged entries (regex
  unchanged); config renamed `errands.staleness_days` →
  `inbox.remind_after_days` (default **1**). Cadence: first nudge after N days (floor: never same-day), then a
  once-per-calendar-day batched advisory (framework-constant rate-limit); personal-`USER-INBOX`-only (shared
  `ATOMIC-INBOX` shares the schema but is never nudged). Recast the `§ Atomic` preamble capture-only /
  `run-errand` (live `USER-INBOX` + the notes' canonical preamble), and documented the grammar + cadence +
  doc-boundary divide in `session-operations § USER-INBOX` (both copies, byte-identical; construction specifics
  defer to `arc-inbox`). Doc/grammar only — no parser/sweep code (the live-inbox shape reconciles at Phase 6's
  drain; the sweep repoint + config code-rename are 4.4.d). Seeded coordination notes in 3.5 / 3.6.d / 4.4.d, and
  propagated the urgency→reminder rename across R27 / R29 / R31, Success Criteria, Open Questions, the notes, and
  Phase 7.

### `[x]` **2.R.5 Downstream cascade write-backs (errand-model re-pivot)**

- _Goal:_ The downstream WUs whose assumptions the re-pivot shifts carry the change in their own artifacts, so
  none is silently stale and no foreign work-item rests here.
- _Outcome:_ Extended the `operational-state-docs` Scope write-back — the `§ Atomic` reminder flag (`_Remind:_` +
  `_Created:_`, parsed values backtick-delimited) joins `WU_Target` in the slug-keyed grammar it inherits, and
  `arc-inbox`'s managed-write CLI (`arc inbox add`) is named as its backend (model-first → CLI). Added a dated
  errand-model-re-pivot cascade-note to each agile-parallelism draft at its errand touchpoint: the cohort doc
  (the Errand-class spine, framing the ownership map as pre-pivot), `agile-wu-lifecycle` (promote-to-WU via
  `run-errand` → `init-work-unit`), `in-flight-awareness` (the oracle absorbs the interim errand-state probe +
  in-flight sweep), `concurrent-work-conventions` (errands as `chore/` mini-PRs through its merge / async-merge
  discipline). Informational only — each flags the change and defers redesign to its owner ("reconcile when next
  iterated"); no foreign design authored, no work-item left resting here.

### `[x]` **2.R.6 Audit remainder of the task list (per remaining phase)**

- _Goal:_ Each remaining phase is reconciled against the amended spec + corrected baseline, with the errand
  lifecycle build slotted into the right phase — so execution proceeds against a coherent, current plan, not a
  pre-pivot one.
- _Outcome:_ Reconciled Phases 3–6 against the re-pivot, folding the errand-lifecycle build in (no new phase):
  **Phase 3** renamed "Between-WU + errand mechanism" + tasks 3.4 (`run-errand`), 3.5 (`arc-inbox`), 3.6
  (retirements); **Phase 4** + tasks 4.4 (errand-state probe) / 4.5 (session-init errand arms, incl. the moved
  `--errand` dispatch); **Phase 5** + tasks 5.5 (errand-session handoff) / 5.6 (promote-to-WU); **Phase 6** route
  recast + no-live-queue note. The build inventory (spec R24–31) is now concrete, sequenced tasks — a fresh
  session executes a plan rather than re-deriving one.

    - `[x]` **2.R.6.a Audit Phase 3 (`arc-housekeep`)**
        - Folded the errand-lifecycle build into Phase 3 (renamed "Between-WU + errand mechanism"): added 3.4
          `run-errand` (Launch/Execute/Integrate + errand PR body), 3.5 `arc-inbox` (model-first + doc-boundary
          divide), 3.6 retirements (one parent; per-target subtasks, sequenced last; keep `arc errand check`).
          Recast 3.1 (→ `run-errand`), 3.1.d (→ shared-inbox aging; errand staleness → Phase 4), and the 3.3 note
          (the base-resolution primitive is shared three ways).

    - `[x]` **2.R.6.b Audit Phase 4 (probe + session-init)**
        - Added 4.4 errand-state probe (errand-resume detection, in-flight-errand sweep, Materialize-candidate
          extension to `chore/` remote branches, repointed staleness sweep) and 4.5 session-init errand arms
          (orthogonal errand-resume arm → `run-errand`; `--errand` cold dispatch + discovery surfacing; Materialize
          consumption + orient-only in-flight advisory with the rate-limited nudge). Existing 4.1–4.3 unchanged.
          Moved the `--errand` dispatch into Phase 4 (was mis-scoped to Phase 5).

    - `[x]` **2.R.6.c Audit Phase 5 (lifecycle deltas)**
        - Added 5.5 errand-session handoff path (commit-WIP + push, no SESSION-NOTES; + the "other handoffs don't
          police errand branches" guardrail) and 5.6 promote-errand-to-WU path in `init-work-unit`. Existing
          5.1–5.4 unchanged. The `--errand` dispatch + session-init errand arm went to Phase 4 (4.5), not here, per
          the 6.b scope correction.

    - `[x]` **2.R.6.d Audit Phase 6 (live validation)**
        - Recast 6.1 `_Approach:_` (standalone errands → `run-errand`) and noted the drain itself validates
          `run-errand` live. Confirmed no live `.arc/user/andrew/ERRANDS.md` exists → queue retirement is
          template/code-only (3.6.c), no live-data migration. 6.2 unaffected.

## **Phase 3:** Between-WU + errand mechanism

_Purpose:_ Build the between-WU drain (a thin `arc-housekeep` skill dispatching a drain/route workflow) and the
machine-checked write-context guard, **plus the errand-lifecycle mechanism the collapsed model needs** — the
`run-errand` workflow, the `arc-inbox` capture entrypoint, and the retirement of the `ERRANDS.md` queue +
capture-flavored `arc-errand` skill. One coherent mechanism cluster: the drain routes atomic execution to
`run-errand`, and the guard, `arc errand check`, and `run-errand` Launch share one write-context primitive.

_Design decisions:_ Skill/workflow splits mirror `arc-commit → prepare-commits` (both `arc-housekeep` and
`run-errand` / `arc-inbox`). The guard's context classifier is test-first (reuses `resolvePrimaryWorktreePath`;
the new logic is the on-WU-branch refusal) and that primitive is shared three ways — guard, `arc errand check`,
`run-errand` Launch — so build it once. Routing is defined against the logical model (entry · character · home),
not markdown format, so a later structured-record swap doesn't break it. `arc-inbox` is **model-first**:
hand-managed markdown now, `operational-state-docs`' managed-write CLI later (R29). Retirements (3.6) sequence
**last**, after `run-errand` / `arc-inbox` exist, so capture and execution never lack a home. Errand /
flagged-item staleness surfacing is a session-init (orient) concern — Phase 4, not here. See
`notes-work-routing-discipline.md` § Errand-model re-pivot + § Drain timing and ownership, and spec
§ Errand-model re-pivot.

### `[ ]` **3.1 Drain/route workflow (logical-model routing)**

- _Goal:_ A drain/route workflow reads `USER-INBOX`, classifies each entry by character and home, and routes it
  in one batched pass — leaving `USER-INBOX` empty — so the between-WU drain is a repeatable mechanism, not
  manual discipline.
- _Approach:_ classify each entry (existing-stub home / new stub / atomic errand / homeless), then route on
  housekeep's own auto-merge branch: stub edits written straight in; standalone atomic execution via `run-errand`
  (a reviewed-lane code errand, 1:1); homeless atomics flush to `ATOMIC-INBOX`; homeless multi-step graduates to a
  provisional stub. PR structure follows § Auto-Merge Lane (2.3).
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[x]` **3.1.a Author the workflow skeleton + precondition**
        - `drain-inbox.md` authored in both copies under `supplemental/` (mirrors `prepare-commits`):
          frontmatter, the five-step drain scaffold, and the full base-branch write-context precondition — a
          machine-checked guard (via the `arc housekeep check` command, 3.3) that refuses or relocates a
          WU-branch invocation, keyed on **write context** rather than absence of an active WU, so mid-WU
          on-demand sweeps are supported. No `arc:` deps declared yet (the skeleton loads no method/extension).

    - `[ ]` **3.1.b Classification + routing logic (logical model)**
        - The four routes, defined against entry · character · home (not markdown format), so a later
          structured-record swap doesn't break it.
        - Group planning-routing writes into one auto-merge PR (one coherent concern); keep each code-execution
          errand standalone (1:1) — never auto-batch code. Lanes never mix (§ Auto-Merge Lane, 2.3).

    - `[ ]` **3.1.c Move-not-copy promotion**
        - Routing removes the source `USER-INBOX` entry as part of the write → the inbox ends empty.

    - `[ ]` **3.1.d Shared-inbox aging note**
        - During the drain, optionally note shared-inbox (`ATOMIC-INBOX`) aging. Errand / flagged-item staleness
          surfacing moved to Phase 4 (session-init orient) with the queue retirement — not housekeep's job.

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
  `isProtectedBaseBranch` (`lib/release/interlock-validation.ts`) is a candidate building block. **`run-errand`
  Launch (3.4) reuses this same write-context primitive** — build it once here; consume in three places (this
  guard, `arc errand check`, `run-errand`).
- **Strategies:** strategy-testing-methodology.md

    - Build `test-first` (one behavior at a time):
        - On the configured `branch.base` (primary-worktree base context) → the guard passes (proceed).
        - On a WU branch (`plan/<name>` or `<type>/<name>`, i.e. not `branch.base`) → the guard refuses with a
          relocate offer.
        - Context resolution matches `arc errand`'s (primary worktree path, current branch, `branch.base`).
        - Degenerate state (detached HEAD / no base) → safe refusal, not a silent write.
        - `--json` emits the classification shape the skill consumes.

### `[ ]` **3.4 `run-errand` workflow (errand execution lifecycle)**

- _Goal:_ Out-of-WU work executes through one `run-errand` workflow — Launch → Execute → Integrate,
  re-enterable, dispatched by `arc-session` — so an errand _is_ its execution (chore branch / direct base
  commit), with no queue, no `errand-*` file, and no State field.
- _Shape:_ A new Framework workflow (both copies) under `system/workflows/arc/` (beside the WU lifecycle, or
  `supplemental/` — decide at authoring). Honors `DEV-RULES.ARC § Review-Increment Invariant` directly; does
  **not** load `process-task-loop` (no task list).
- _Note:_ This authors the workflow; the `arc-session --errand` dispatch + the errand-resume / Materialize /
  in-flight arms are Phase 4 (session-init wiring), and the promote-to-WU path is Phase 5.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[ ]` **3.4.a Launch phase**
        - Classify (errand vs WU) → `arc errand check` (overlap, now at execution time) → resolve base and
          relocate the locus (spawn an ephemeral `chore/<slug>` worktree under full + Worktree Foundation; target
          the primary base checkout under partial), reusing 3.3's write-context primitive. Launching from any
          worktree is not a blocker.

    - `[ ]` **3.4.b Execute phase**
        - Do the errand as one review increment; carry the promote-to-WU primer (points at the `init-work-unit`
          path, Phase 5) for scope explosion.

    - `[ ]` **3.4.c Integrate phase + errand PR body**
        - Commit → (full) push + open PR with a lean errand PR body (`template-pull-request` assumes a WU — author
          a variant or inline a minimal body) → arm auto-merge (auto lane) or leave for review (reviewed lane);
          (partial) direct base commit. On completion: tear down branch/worktree **and remove the slug-matched
          originating inbox entry** (the one place removal is ensured). Pause = commit WIP + push.
        - _Resolves open question (spec):_ eager-vs-on-completion PR — lean on-completion; settle here.

### `[ ]` **3.5 `arc-inbox` capture entrypoint (model-first)**

- _Goal:_ A single `arc-inbox` skill is the unified capture entrypoint — routing + entry construction for
  `§ Atomic` (with/without the reminder flag), `§ Backlog` (with `WU_Target`), and homeless flush — so capture is
  consistent and the doctrine's actionable specifics live in one action-focused place.
- _Shape:_ Thin skill (canonical `.arc/system/.internal/skills/arc-inbox/` + package mirror). Write is
  **hand-managed markdown now**, structured to swap to `operational-state-docs`' `arc inbox add` later —
  interface + entry grammar stable across the swap (the `ROADMAP`-before-its-renderer pattern). Scoped to
  capture; drain is `arc-housekeep`'s, execution is `arc-session`'s.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[ ]` **3.5.a Author the `arc-inbox` SKILL.md**
        - Mirror `arc-commit`'s thin shape; route per `DEV-RULES.ARC § Discovered Work Routing`; construct the
          managed-entry grammar for each section. The `§ Atomic` **reminder flag** is defined by 2.R.4 (spec R30):
          the skill sets the `_Remind:_` flag on user intent and stamps the `_Created:_` date anchor — parsed
          fields backtick-delimit their value (key bare-italic), distinct from prose descriptors.

    - `[ ]` **3.5.b Doc-boundary divide**
        - Move actionable construction specifics out of the inbox templates into the skill — templates clean down
          to surface-only; ambient discipline (the routing decision, the core invariant) stays in
          `DEV-RULES.ARC § Discovered Work Routing` for pre-invocation awareness.

### `[ ]` **3.6 Retire the queue + capture-flavored `arc-errand` (sequenced last)**

- _Goal:_ The `ERRANDS.md` queue substrate and the capture-flavored `arc-errand` skill are removed — capture is
  `arc-inbox` / inbox, execution is `run-errand` — leaving no stale queue mechanism. Sequenced after 3.4/3.5 so
  capture and execution always have a home.
- _Note:_ Touches the same `lib/user-sync` parser Phase 1 reshaped + the seeding loops + a session-init sweep —
  test-first care; **keep `arc errand check`** (it moves to `run-errand` execution time).
- **Strategies:** strategy-testing-methodology.md, strategy-package-project-sync.md

    - `[ ]` **3.6.a Retire the `arc-errand` (capture) skill**
        - Remove the capture-flavored skill (canonical + package mirror + harness copy); its execution intent is
          now `run-errand` via `arc-session`.

    - `[ ]` **3.6.b Remove the `arc errand queue` CLI command**
        - Drop `arc errand queue` (`cli.ts` + handler/command + tests); keep `arc errand check` (used by
          `run-errand`).

    - `[ ]` **3.6.c Retire the `ERRANDS.md` template + seeding**
        - Remove `templates/user/ERRANDS.md` and its seeding from `runPostInitSetup()` / `arc user add` (+ the
          init / add / e2e tests that assert it).

    - `[ ]` **3.6.d Retire the errands parser entry-type + the sweep's queue source**
        - Remove the `errands` parser entry-type (`lib/user-sync`) and the staleness sweep's queue source.
          Coordinate with Phase 4: the sweep code survives but **repoints** at flagged `§ Atomic` items +
          in-flight chore branches — don't leave it dangling.
        - **Config + field coordination (2.R.4):** the `errands.staleness_days` → `inbox.remind_after_days` rename
          and the sweep's read of the new key ride **4.4.d** (with the repoint), not here — renaming the key while
          the live sweep still reads the old name would break it mid-phase. The `_Created:_` stamped-date field
          carries forward — only the queue _source_ retires; `_Created:_` stays the aging anchor on flagged inbox
          entries (the sweep's date regex reused unchanged).

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

### `[ ]` **4.4 Errand-state probe (test-first)**

- _Goal:_ The session-init envelope surfaces errand state — so session-init dispatches and advises from a
  machine-resolved signal, not an agent scan — covering errand-resume, the in-flight sweep, and cross-machine
  materialization.
- _Shape:_ Probe additions modeled on `errand-staleness-sweep.ts` / the roster, slotted into
  `SessionInitProbeResult` (e.g. an `errandState` slot beside `active` / `errandSweep`). New / repointed libs
  under `src/lib/session-init/`.
- **Strategies:** strategy-testing-methodology.md

    - `[ ]` **4.4.a Errand-resume detection**
        - Resolve "current branch is `chore/`-prefixed AND no backing meta" → an errand to resume. The signal the
          orthogonal resolution arm (4.5) dispatches on.

    - `[ ]` **4.4.b In-flight-errand sweep**
        - Enumerate `chore/` branches (local + open PRs) with no meta; classify in-progress / awaiting-merge /
          merged-cleanup / stale. Mirrors the stale-worktree sweep's advisory role.

    - `[ ]` **4.4.c Materialize-candidate extension**
        - Recognize `chore/`-prefixed _remote_ branches (no local worktree, no meta) as materializable errands —
          the cross-machine-resume path.

    - `[ ]` **4.4.d Repoint the staleness sweep**
        - The staleness sweep survives 3.6.d's queue-source removal by reading flagged `§ Atomic` items +
          in-flight chore branches instead of `ERRANDS.md`. Coordinate with 3.6.d so it is never left dangling.
        - **Reminder-flag contract (2.R.4 / spec R30):** read `_Remind:_`-flagged `§ Atomic` `USER-INBOX` entries
          (value `` `true` ``, backtick-delimited); age each against its `_Created:_` date (also
          backtick-delimited) vs. `inbox.remind_after_days` (default **1**; floor: never the same day). Do the
          **config code-rename here** — `errands.staleness_days` → `inbox.remind_after_days` across
          `status-reader.ts` default, `config/types.ts`, the `validate-config.sh` `known_keys` allowlist, and the
          sweep's read — paired with this repoint so nothing dangles. **Rate-limit to once per calendar day** via a
          per-user gitignored last-nudge marker (one batched advisory orientation line listing all due captures,
          not a per-entry nudge; once/day is a framework constant, not user config). Surface is advisory /
          non-blocking, mirroring the in-flight sweep (4.5.c).

### `[ ]` **4.5 session-init errand arms (workflow wiring)**

- _Goal:_ session-init dispatches and advises on errands — execution is `arc-session`-driven, resume is
  automatic, and committed errands stay discoverable — without disturbing the WU-resume path.
- _Note:_ Cross-file refs use stable heading-slug anchors, never ordinal `Step N` (composable-workflows interim
  convention). Both copies (`session-init` is `.template.md` in the package).
- **Strategies:** strategy-package-project-sync.md

    - `[ ]` **4.5.a Errand-resume arm (orthogonal to `sessionType`)**
        - On the 4.4.a signal, load `run-errand` (resume mode) — **not** `process-task-loop`. Resolved as its own
          arm beside the existing entry dispatch, ahead of the `sessionType` → lifecycle-workflow mapping.

    - `[ ]` **4.5.b `--errand` cold dispatch + discovery surfacing**
        - `arc-session --errand <blurb|slug>` cold-starts a fresh errand or picks up a flagged capture (dispatches
          `run-errand` Launch); bare `arc-session` (orient) surfaces recorded errands (flagged `§ Atomic` items +
          in-flight chore branches) as a route.

    - `[ ]` **4.5.c Materialize consumption + in-flight advisory**
        - Consume the 4.4.c materialize candidates (remote chore branch → `git worktree add` → resume); surface
          the 4.4.b in-flight sweep as an **orient-only** advisory with the **rate-limited** nudge (lean: a
          lightweight last-nudged timestamp in user state — needs deeper evaluation at impl).

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

### `[ ]` **5.5 Errand-session handoff path (`session-handoff`)**

- _Goal:_ Pausing an in-flight errand has a ceremony-light path — `commit WIP + push` the `chore/<slug>` branch,
  no SESSION-NOTES — so the pushed branch is the cross-machine resume anchor and an errand never needs WU-handoff
  ceremony it has no artifacts for.
- _Note:_ A distinct path from 5.3's no-active-WU branch (this one fires when on a `chore/` branch). Carries the
  guardrail that **other handoffs do not police errand branches** — dangling errands surface at orient (the 4.4
  in-flight sweep), not at every handoff (flow protection). No SESSION-NOTES per ADR-021 (errands have no
  orientation surface). Both copies (`session-handoff` is `.template.md` in the package).
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

### `[ ]` **5.6 Promote-errand-to-WU path (`init-work-unit`)**

- _Goal:_ An errand that exceeds one review increment promotes cleanly — `chore/<slug>` → mint `meta-*`, rename
  branch `chore/<slug>` → `<type>/<name>`, preserve commits — so scope explosion has a sanctioned conversion
  rather than an abandon-and-restart.
- _Note:_ A new `init-work-unit` entry path, sibling to the backlog-graduation path; pointed to from
  `run-errand`'s Execute phase (3.4.b). Authored as a clean extractable block (`composable-workflows`
  forward-compat). Both copies.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

## **Phase 6:** Live validation (component b)

_Purpose:_ Run the new `arc-housekeep` flow against the real backlog — drain `andrew`'s long-deferred
`USER-INBOX` captures to their homes and retire `BACKLOG-INBOX`'s contents into provisional stubs. The first
live run _is_ the mechanism's validation; the next WU begins with an empty `USER-INBOX`.

_Design decisions:_ Exercises Phases 1-5 end to end — the drain itself is the live validation of `run-errand`
(any atomic entry draining to standalone execution goes through it). Run from the primary worktree / base-branch
context per the guard. The `ERRANDS.md` queue retirement is **template/code-only** (3.6.c): no live
`.arc/user/andrew/ERRANDS.md` exists, so there is no live errand-queue migration here. `arc-inbox` and the
session-init errand arms are exercised organically in use, not by the drain. _Open question pinned here (resolve
at run):_ the errand↔PR chunking heuristic (spec § Open Questions, item a) — default one PR per lane, chunk only
if a drain is too large for one reviewable PR; the actual backlog volume at run time decides.

### `[ ]` **6.1 Drain `andrew`'s `USER-INBOX` to homes**

- _Goal:_ `andrew`'s pending `USER-INBOX` captures are routed to their real homes by an actual `arc-housekeep`
  run — the mechanism's first live exercise, proving the drain end to end.
- _Approach:_ run the housekeep flow; classify + route each entry (existing-stub edits, new provisional stubs,
  standalone execution via `run-errand`, homeless flush to `ATOMIC-INBOX`). PRs follow § Auto-Merge Lane; the
  chunking heuristic (open question a) settles against the actual volume.
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
- `[ ]` Errands are execution-only: the `ERRANDS.md` queue, the capture-flavored `arc-errand` skill, and
  `arc errand queue` are retired (no `errand-*` file, no State field); `arc errand check` survives at execution
  time; ADR-021 carries the amendment.
- `[ ]` `run-errand` exists (one workflow, Launch → Execute → Integrate, dispatched by `arc-session`, honoring the
  Review-Increment Invariant — not `process-task-loop`); Integrate removes the slug-matched inbox entry at
  completion; promote-to-WU is reachable from Execute.
- `[ ]` Session-init carries the errand-resume arm, the Materialize extension to `chore/` remote branches, and the
  orient-only in-flight-errand sweep with a rate-limited nudge.
- `[ ]` `arc-inbox` exists as the model-first unified capture entrypoint; the doc-boundary divide holds and
  `§ Atomic` carries the optional reminder flag; `arc-session` is the sole execution entrypoint.
- `[ ]` Protection-mode awareness threads the doctrine as clean blocks deferring to `§ Cheap-branch path`; the
  `operational-state-docs` write-back is extended and the cohort cascade-notes are recorded.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

[verify-work-unit]: ../system/workflows/arc/work-unit-lifecycle/verify-work-unit.md

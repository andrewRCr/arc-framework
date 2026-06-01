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

### `[x]` **3.1 Drain/route workflow (logical-model routing)**

- _Goal:_ A drain/route workflow reads `USER-INBOX`, classifies each entry by character and home, and routes it
  in one batched pass — leaving `USER-INBOX` empty — so the between-WU drain is a repeatable mechanism, not
  manual discipline.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[x]` **3.1.a Author the workflow skeleton + precondition**
        - `drain-inbox.md` authored in both copies under `supplemental/` (mirrors `prepare-commits`):
          frontmatter, the five-step drain scaffold, and the full base-branch write-context precondition — a
          machine-checked guard (via the `arc housekeep check` command, 3.3) that refuses or relocates a
          WU-branch invocation, keyed on **write context** rather than absence of an active WU, so mid-WU
          on-demand sweeps are supported. No `arc:` deps declared yet (the skeleton loads no method/extension).

    - `[x]` **3.1.b Classification + routing logic (logical model)**
        - Steps 2–3 author the four routes against the logical model (entry · character · home): existing-stub
          write-in, new `provisional/` stub, atomic → `run-errand` (1:1), and homeless (atomic → `ATOMIC-INBOX`,
          multi-step → provisional stub). Planning-routing writes batch into one auto-merge PR; each code errand
          stays 1:1; lanes never mix; a foreign-owned write splits to the reviewed lane. The full/partial split
          defers to § Branch Protection Modes.

    - `[x]` **3.1.c Move-not-copy promotion**
        - Step 3 makes the move explicit: routing removes the source `USER-INBOX` line in the same write. A
          route-3 errand is the one deferral — removal at errand **completion** (slug-matched), so the line
          doubles as the in-flight record and an abandoned errand never orphans the capture.

    - `[x]` **3.1.d Shared-inbox aging note**
        - Step 4 surfaces `ATOMIC-INBOX` aging as an advisory observation only; per-capture reminder and
          in-flight-errand staleness nudges are scoped to session-init orientation, not the drain.

- _Outcome:_ `drain-inbox.md` (both copies) now fully specifies the between-WU / mid-WU capture drain —
  base-branch write-context precondition, four-route logical-model classification, auto-merge-lane PR packaging,
  and move-not-copy promotion. Dispatched by the `arc-housekeep` skill and the `session-handoff` between-WUs path
  (one workflow, two doors); routing keys on the logical model so a later structured-record swap leaves it intact.

### `[x]` **3.2 Thin `arc-housekeep` skill (dual entry point)**

- _Goal:_ `arc-housekeep` is invokable as a thin skill that dispatches the drain/route workflow, and the same
  logic is reachable from `session-handoff`'s between-WUs path — one workflow, two doors.
- **Strategies:** strategy-workflow-authoring.md

    - `[x]` **3.2.a Author the `arc-housekeep` SKILL.md**
        - Thin dispatcher (canonical + package mirror) mirroring `arc-handoff`'s shape: frontmatter +
          one-line `Apply` pointer at `drain-inbox.md`, with a one-sentence gloss. No logic in the skill.
          Harness availability rides the established symlink-to-canonical pattern (the harness skill dir links
          back to this `.internal/skills/` source), so there is no separate copy to drift.

    - `[x]` **3.2.b Keep the mechanism DRY**
        - Satisfied by construction: all logic lives in `drain-inbox.md`; the skill only dispatches it, so the
          Phase 5.3 `session-handoff` between-WUs path can dispatch the same workflow with nothing to duplicate.

- _Outcome:_ `arc-housekeep` is a pure dispatcher over `drain-inbox.md` — the workflow is the single logic
  home, leaving the standalone skill and the (future) `session-handoff` between-WUs path as two thin doors onto
  one mechanism.

### `[x]` **3.3 Machine-checked write-context guard (test-first)**

- _Goal:_ Invoked off a base-branch write context, `arc-housekeep` refuses or offers to relocate rather than
  writing shared base-branch paths from a WU branch — the precondition enforced mechanically, not by prose.
- **Strategies:** strategy-testing-methodology.md
- _Outcome:_ `arc housekeep check [--json]` added (`src/handlers/housekeep.ts` + the `housekeep` command group in
  `cli.ts`), backed by a shared `src/lib/git/write-context.ts` primitive. Pure `classifyWriteContext` decides on
  current branch vs `branch.base` (mirroring `isProtectedBranch`): base → `proceed`, WU branch → `relocate`,
  detached HEAD / unset base → safe `refuse`. The `resolveWriteContext` I/O wrapper reuses `getCurrentBranch` +
  `resolvePrimaryWorktreePath`, resolving the same context `arc errand` does. Built shared-ready so `run-errand`
  Launch (3.4) reuses the primitive rather than re-deriving it; `--json` emits the verdict shape `drain-inbox.md`
  consumes.

### `[x]` **3.4 `run-errand` workflow (errand execution lifecycle)**

- _Goal:_ Out-of-WU work executes through one `run-errand` workflow — Launch → Execute → Integrate,
  re-enterable, dispatched by `arc-session` — so an errand _is_ its execution (chore branch / direct base
  commit), with no queue, no `errand-*` file, and no State field.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[x]` **3.4.a Launch phase**
        - Classify (errand vs WU) → advisory `arc errand check --target ... --json` overlap → resolve base +
          primary worktree via the shared write-context resolution (read from `arc housekeep check --json`) and
          relocate per protection mode (full: ephemeral `chore/<slug>` worktree where spawning is available, else
          the primary base checkout; partial: direct base checkout). Branch cut lazily; launch from any worktree.

    - `[x]` **3.4.b Execute phase**
        - Errand runs as one review increment (Review-Increment Invariant, not `process-task-loop`), with Tier 1
          gates and the `post-task-quality` extension, closing at a `workflow-interlock`; promote-to-WU primer
          points at `init-work-unit` for scope explosion.

    - `[x]` **3.4.c Integrate phase + errand PR body**
        - Commit (`standalone (...)` footer; `commit-interlock` release as `taskCommit`); under full, the
          `pre-push-review` / `workflowPush` push, a lean inline errand PR body with `pre-pr-review`, then the
          `integration-interlock` and `pre-merge-review` before arming auto-merge (auto lane) or leaving for
          review (reviewed lane); under partial, a direct base commit with no PR. Completion removes the
          slug-matched `USER-INBOX` entry (the one ensured removal).
        - _Resolves open question (spec):_ eager-vs-on-completion PR — settled lean on-completion.

- _Outcome:_ `run-errand.md` authored in both copies under `supplemental/` (an errand is not a WU, so beside
  `drain-inbox`, not in `work-unit-lifecycle/`). Re-enterable Launch → Execute → Integrate dispatched by
  `arc-session`, honoring the Review-Increment Invariant directly (no `process-task-loop`); the conceptual model
  cross-refs `§ Errand Work Class` rather than re-explaining it. Interlocks: `workflow-interlock` (increment
  close), `commit-interlock` / `push-interlock` releases (commit / PR-push), `integration-interlock` (pre-merge);
  review extensions (`post-task-quality`, `pre-pr-review`, `pre-push-review`, `pre-merge-review`) fire at their
  points. Dispatch wiring + Materialize/in-flight (Phase 4) and the WU-side promote path (Phase 5) follow.

### `[x]` **3.5 `arc-inbox` capture entrypoint (model-first)**

- _Goal:_ A single `arc-inbox` skill is the unified capture entrypoint — routing + entry construction for
  `§ Atomic` (with/without the reminder flag), `§ Backlog` (with `WU_Target`), and homeless flush — so capture is
  consistent and the doctrine's actionable specifics live in one action-focused place.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[x]` **3.5.a Author the `arc-inbox` SKILL.md**
        - `arc-inbox/SKILL.md` authored (canonical + byte-identical package mirror) mirroring `arc-commit`'s thin
          numbered-step shape: a confirm-capture-is-the-route gate (defers the inline / errand-now / capture call
          to `DEV-RULES.ARC § Discovered Work Routing`), character→section classification, the shared
          H3 + checkbox + italic-descriptor entry grammar with the `WU_Target` line for `§ Backlog`, and the
          optional `_Remind:_` / `_Created:_` reminder flag (parsed values backtick-delimited, key bare-italic;
          current-date stamp). Registered in the skills `README.md` (both copies).

    - `[x]` **3.5.b Doc-boundary divide**
        - Stripped the construction `<!-- Entry shape -->` comments from the inbox templates
          (`templates/user/USER-INBOX.md`, `ATOMIC-INBOX.template.md`, and the live `.arc/backlog/ATOMIC-INBOX.md`)
          down to surface-only — headings + destination preambles; refreshed the USER-INBOX preambles to the
          execution-only model (`arc-errand` → `run-errand`) and added a one-line `arc-inbox` capture pointer.
          Replaced the stale `§ Atomic` "never executed directly from here" line (a relic of the retired
          `ERRANDS.md` intermediate surface) with an execution-locus nudge — run via `arc-session --errand`, from
          the primary worktree's base, never a WU branch — doubling as new-user orientation; aligned the
          `§ Backlog` mid-WU reference to
          the same user-facing invocation (the `run-errand` lifecycle name stays in the agent-facing doctrine).
          Propagated the preamble changes to the live `.arc/user/andrew/USER-INBOX.md` and the notes' verbatim
          preamble block. Ambient discipline (the routing decision, the core invariant) stays in
          `DEV-RULES.ARC § Discovered Work Routing` for pre-invocation awareness.

- _Outcome:_ Capture is now a single skill: `arc-inbox` owns entry construction (the doc-boundary divide
  deliverable), the inbox templates carry only destination surface, and ambient routing discipline stays
  constitutional in `DEV-RULES.ARC`. Homeless atomics capture to `§ Atomic` and transit to the shared inbox at
  drain — the skill writes only the personal `USER-INBOX`, refusing direct shared-inbox writes (drain-write
  isolation). Model-first per R29: hand-managed markdown over a stable interface + entry grammar, swap-ready for
  `operational-state-docs`' `arc inbox add` backend.

### `[x]` **3.6 Retire the queue + capture-flavored `arc-errand` (sequenced last)**

- _Goal:_ The `ERRANDS.md` queue substrate and the capture-flavored `arc-errand` skill are removed — capture is
  `arc-inbox` / inbox, execution is `run-errand` — leaving no stale queue mechanism. Sequenced after 3.4/3.5 so
  capture and execution always have a home.
- **Strategies:** strategy-testing-methodology.md, strategy-package-project-sync.md

    - `[x]` **3.6.a Retire the `arc-errand` (capture) skill**
        - Removed the canonical + package-mirror skill source and the stale local `.claude/skills/arc-errand`
          real dir (gitignored, not a `dotfiles-ai`-managed symlink → no dotfiles/chezmoi change; `.codex` had
          none). Retiring the skill orphaned the session-init workflow's errand references, so repointed them
          (both copies) onto the forward model: in-session out-of-WU work → `§ Discovered Work Routing`
          (`arc-inbox` capture / fresh `arc-session --errand`); cold-entry classify + `arc errand check` +
          execute → the `run-errand` workflow. Structural errand-arm wiring stays Phase 4.5.

    - `[x]` **3.6.b Remove the `arc errand queue` CLI command**
        - Deleted `src/commands/errand.ts` (the `runErrand` queue orchestrator) + its unit test; dropped the
          `queue` subcommand from `cli.ts` and `handleErrandQueue` / `ErrandQueueOptions` from
          `handlers/errand.ts`; trimmed the e2e to the surviving `check` path. `arc errand check` retained.

    - `[x]` **3.6.c Retire the `ERRANDS.md` template + seeding**
        - Deleted `templates/user/ERRANDS.md` and dropped `ERRANDS.md` from `CROSS_WU_INSTANCE_FILES` (the single
          seeding source `runPostInitSetup` / `arc user add` both read); updated the init / join / user seeding
          tests + doc comments.

    - `[x]` **3.6.d Retire the errands parser entry-type + the sweep's queue source**
        - Removed the `errands` shape from the parser and `CrossWuShape` (`shapeForFile` now returns `null` for
          `ERRANDS.md`, so merge degrades to unmanaged passthrough); deleted the ERRANDS parse/merge tests.
          Severed the staleness sweep's queue source: `runErrandStalenessSweep` now ages caller-supplied dated
          entries (no parser-shape or file coupling), with the probe feeding an empty set — the aging machinery
          survives, inert, for the 4.4.d repoint.
        - **Config + field coordination (2.R.4):** kept `errands.staleness_days` and the resolver's threshold
          plumbing untouched — the `errands.staleness_days` → `inbox.remind_after_days` rename and the sweep's
          repoint at flagged `§ Atomic` items + in-flight chore branches ride **4.4.d** (renaming the key here
          would orphan it before its new reader exists). `_Created:_` stays the aging anchor.

- _Outcome:_ The errand model is now execution-only end-to-end — no queue substrate, capture-flavored skill,
  `queue` CLI, `ERRANDS.md` template/seeding, parser shape, or sweep queue-source remains; capture is `arc-inbox`,
  execution is `run-errand`, and `arc errand check` survives (it moves to `run-errand` Launch). Two coordinated
  carry-forwards: the staleness sweep survives inert (caller-injected entries, empty for now) pending its 4.4.d
  repoint + config-key rename; and retiring the skill forced a forward-consistent repoint of the session-init
  errand prose (both copies, folded into 3.6.a), with the structural errand-arm wiring left to Phase 4.5.

## **Phase 4:** CLI probe + session-init wiring

_Purpose:_ Add the `inboxState`/`housekeepNeeded` probe field to the session-init envelope and wire the
session-init workflow's soft-offer — making the empty-`USER-INBOX`-at-WU-start invariant a real forcing
function.

_Design decisions:_ Probe lib is test-first, modeled on `errand-staleness-sweep.ts` and slotted into
`SessionInitProbeResult` parallel to `errandSweep`. The session-init workflow gains the `housekeep` intent (the
third Orient-arm intent beside discovery and errand). Soft-encourage, never hard-block.

### `[x]` **4.1 `inboxState` probe lib (test-first)**

- _Goal:_ A probe computes the routable-entry count in `USER-INBOX` and a `housekeepNeeded` flag — so
  session-init offers housekeep from a machine-resolved signal, not an agent re-scan.
- _Outcome:_ New `src/lib/session-init/inbox-state.ts` — pure `runInboxState({ content })` returning
  `{ routableCount, housekeepNeeded }`, a thin filter over `parseCrossWuEntries(content, "user-inbox")` that
  counts `parse.ok` entries (well-formed across `## Atomic` + `## Backlog`; malformed blocks skipped) and sets
  `housekeepNeeded` on count > 0. Identity-gating and the file read stay with the 4.2 orchestrator.

### `[x]` **4.2 Wire probe into the session-init status envelope**

- _Goal:_ The `arc status --session-init --json` envelope carries an `inboxState` slot parallel to `errandSweep`,
  so the workflow reads `housekeepNeeded` without re-scanning.

    - `[x]` **4.2.a Add the `inboxState` slot to the probe types**
        - Added `inboxState?: Probe<InboxStateResult>` to `SessionInitProbeResult` and the `inboxState` resolver
          to the `SessionInitProbes` interface (`src/commands/status/types.ts`).

    - `[x]` **4.2.b Orchestrate + bind the probe**
        - Added the identity-gated `inboxState` task to `runSessionInitStatus` (`src/commands/status/run.ts`) —
          omitted from the envelope when identity is absent, like `errandSweep`. The handler
          (`src/handlers/status.ts`) binds it to read `.arc/user/{identity}/USER-INBOX.md` (empty string on
          miss) and call `runInboxState`; the slot rides as `inboxState.value.{routableCount, housekeepNeeded}`.
- _Outcome:_ Orchestrator + integration coverage added (present / empty / identity-absent). Making `inboxState`
  required on `SessionInitProbes` rippled into every probe-literal test fixture — surfaced only by
  `typecheck:test`, not the src-only Tier-1 check.

### `[x]` **4.3 session-init `housekeep` intent + soft-offer**

- _Goal:_ Session-init's Orient arm offers housekeep when `USER-INBOX` has routable entries — a third intent
  beside discovery and errand — soft-encouraging the empty-at-WU-start invariant without blocking.
- _Note:_ Cross-file refs (session-init ↔ housekeep ↔ session-handoff) use stable heading-slug anchors, never
  ordinal `Step N` refs (composable-workflows interim convention).
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **4.3.a Add the `housekeep` intent to the entry dispatch**
        - Orient arm now reframes discovery/errand as the dispatch intents and adds **Housekeep** as a third —
          gated on `inboxState.value.housekeepNeeded`, an overlay (not a hard arm) that points at the
          `arc-housekeep` skill. Added an `inboxState` row to the Step 1 envelope table.

    - `[x]` **4.3.b Add the soft-offer to orientation**
        - Step 6 conditional surface: `**Housekeep:** no active WU; USER-INBOX has {routableCount} pending —
          housekeep?` — gated to the Orient arm (a Resume session carries the probe but doesn't surface it).
- _Outcome:_ Both copies edited symmetrically (the `housekeep`/`inboxState` additions are ungated, matching the
  existing errand/USER-INBOX treatment — only the pre-existing `arc:if` blocks still differ); new
  `[arc-housekeep-skill]` link ref added to each.

### `[x]` **4.4 Errand-state probe (test-first)**

- _Goal:_ The session-init envelope surfaces errand state — so session-init dispatches and advises from a
  machine-resolved signal, not an agent scan — covering errand-resume, the in-flight sweep, and cross-machine
  materialization.
- _Shape:_ Probe additions modeled on `errand-staleness-sweep.ts` / the roster, slotted into
  `SessionInitProbeResult` (e.g. an `errandState` slot beside `active` / `errandSweep`). New / repointed libs
  under `src/lib/session-init/`.
- **Strategies:** strategy-testing-methodology.md

    - `[x]` **4.4.a Errand-resume detection**
        - New pure `detectErrandResume({ currentBranch, hasBackingMeta })` lib
          (`src/lib/session-init/errand-resume-detection.ts`) → `{ resumable, slug }`: a `chore/`-prefixed branch
          with no backing meta is a resumable errand (slug = the part after `chore/`); a backed `chore/` branch is
          a promoted errand → WU, not a resume. Caller injects branch + meta-backing (from active/roster); the
          orthogonal resolution arm (4.5) dispatches on `resumable`.

    - `[x]` **4.4.b In-flight-errand sweep**
        - New pure `classifyInFlightErrands` (`src/lib/session-init/in-flight-errand-sweep.ts`): maps
          caller-enumerated `chore/` branch facts (`hasMeta` / `hasOpenPr` / `merged` / `ageDays`) to
          in-progress / awaiting-merge / merged-cleanup / stale (precedence merged → PR → aged → fresh);
          excludes non-errand and meta-backed branches. Git/forge enumeration is caller-side (wired later).
          Extracted the shared `chore/` identity (`errand-branch.ts`: `ERRAND_BRANCH_PREFIX` + `errandSlugOf`)
          and repointed 4.4.a's lib onto it.

    - `[x]` **4.4.c Materialize-candidate extension**
        - New pure `findMaterializableErrands` (`src/lib/session-init/materializable-errands.ts`): filters
          caller-enumerated remote-branch facts (`hasLocalWorktree` / `hasMeta`) to `chore/` branches with
          neither — the cross-machine-resume candidates (already-local → resume; meta-backed → WU). Reuses the
          shared `errandSlugOf`. Git enumeration is caller-side (wired later).

    - `[x]` **4.4.d Repoint the staleness sweep**
        - _Config rename:_ `errands.staleness_days` → `inbox.remind_after_days` (default 3→1) across
          `status-reader.ts`, `config/types.ts`, the handler read, both `arc-config.yml` (section retitled
          `# --- Inbox ---`), both `validate-config.sh` `known_keys`, and all test fixtures.
        - _Reminder source:_ new pure `extractReminderEntries` (`inbox-reminders.ts`) pulls `§ Atomic` entries
          whose `_Remind:_` value is `true` with their `_Created:_` date; the handler's `errandSweep` resolver reads
          `USER-INBOX` (shared `readUserInbox`) and ages them via `runErrandStalenessSweep` — the sweep sources the
          inbox, not the retired `ERRANDS.md`. Integration-tested (present / empty / identity-absent).
        - _Rate-limit:_ new pure `shouldNudge` (`nudge-rate-limit.ts`) gates the batch to once per calendar day
          (fail-open on a missing/corrupt marker); the marker file I/O + surfacing ride 4.5.c.
        - _Docs:_ rewrote the Step 1 `errandSweep` row + Step 6 surface (both copies) onto the reminder model.
        - _Interpretation:_ the sweep's "in-flight `chore/` branches" source is the 4.4.b classifier, surfaced at
          4.5.c (git/forge enumeration); the `errandSweep` slot keeps its name (repointed, not renamed). Held the
          commit to land all three sub-pieces (rename + parser + repoint) atomically — nothing dangles.

### `[x]` **4.5 session-init errand arms (workflow wiring)**

- _Goal:_ session-init dispatches and advises on errands — execution is `arc-session`-driven, resume is
  automatic, and committed errands stay discoverable — without disturbing the WU-resume path.
- _Note:_ Cross-file refs use stable heading-slug anchors, never ordinal `Step N` (composable-workflows interim
  convention). Both copies (`session-init` is `.template.md` in the package).
- **Strategies:** strategy-package-project-sync.md

    - `[x]` **4.5.a Errand-resume arm (orthogonal to `sessionType`)**
        - On the 4.4.a signal, load `run-errand` (resume mode) — **not** `process-task-loop`. Resolved as its own
          arm beside the existing entry dispatch, ahead of the `sessionType` → lifecycle-workflow mapping.
        - Added the composite `errandState` envelope slot and Step 3 / lifecycle dispatch: a meta-less current
          `chore/` branch routes to `run-errand` before WU `sessionType` handling and skips WU/task-loop reads.

    - `[x]` **4.5.b `--errand` cold dispatch + discovery surfacing**
        - `arc-session --errand <blurb|slug>` cold-starts a fresh errand or picks up a flagged capture (dispatches
          `run-errand` Launch); bare `arc-session` (orient) surfaces recorded errands (flagged `§ Atomic` items +
          in-flight chore branches) as a route.
        - Updated the cold-entry/orient arms so `--errand <blurb|slug>` feeds `run-errand` Launch, while bare
          orient surfaces flagged inbox captures, in-flight errands, and materializable errand candidates.

    - `[x]` **4.5.c Materialize consumption + in-flight advisory**
        - Consume the 4.4.c materialize candidates (remote chore branch → `git worktree add` → resume); surface
          the 4.4.b in-flight sweep as an **orient-only** advisory with the **rate-limited** nudge (lean: a
          lightweight last-nudged timestamp in user state — needs deeper evaluation at impl).
        - Wired branch enumeration into `errand-state.ts`: local/remote `chore/` refs are classified with
          merge/PR/age/meta facts; remote-only materializable candidates are exposed; the daily nudge marker is
          carried in the same slot and documented as workflow-updated after surfacing.
- _Outcome:_ One status envelope slot now carries resume, in-flight, materializable, and nudge state; both
  session-init workflow copies consume it through Errand-resume, Orient, and Materialize arms, and the live
  `npx arc status --session-init --json` probe returns `errandState`.

## **Phase 5:** Lifecycle-workflow deltas

_Purpose:_ Wire the mechanism into the remaining lifecycle workflows — remove the integration-ceremony drain,
reframe activation absorption, add the dedicated between-WUs handoff path, and add the init backstop warning —
so the drain failure is structurally designed out.

_Design decisions:_ `session-handoff`'s between-WUs path wires to the same drain logic as the standalone skill
(DRY, two doors). All workflow edits dual-copy; `session-init`/`session-handoff` are `.template.md` in the
package source.

### `[x]` **5.1 Remove `integrate-work-unit` Step 10 (drain leaves integration)**

- _Goal:_ Integration ships only the WU — the `USER-INBOX` → shared-inbox drain no longer rides the integration
  commit — so the failure mode (deferred under PR-leanness pressure) is structurally removed.

- _Outcome:_ Removed the integration-ceremony `USER-INBOX` drain from both `integrate-work-unit` workflow copies,
  renumbered the remaining ceremony steps, and dropped stale drain references from the interlock surface, commit
  template, and planning-module link definitions.

### `[x]` **5.2 Reframe `activate-work-unit` Step 6 (absorption narrowing)**

- _Goal:_ Activation only finalizes source cleanup for captures already absorbed into this WU's spec or task list
  — whether personal `USER-INBOX` or shared `ATOMIC-INBOX` — so the step is a failsafe, not a broad drain.

- _Outcome:_ Reframed activation absorption as source-entry cleanup for already-incorporated `USER-INBOX` or
  `ATOMIC-INBOX` captures, with unrelated personal captures left to between-WUs housekeep rather than activation.
  Added the `workflowCommit` marker for tracked `ATOMIC-INBOX` cleanup while keeping personal-inbox cleanup out of
  the project commit path, and normalized the ROADMAP regen fire site to the same marker pattern.

### `[x]` **5.3 `session-handoff` dedicated between-WUs path**

- _Goal:_ Session-handoff has a streamlined between-WUs branch — no SESSION-NOTES write, no meta commit, review
  WORKING-MEMORY removals, offer housekeep if captures pending, sync, confirm — wired to the same drain logic as
  the standalone skill.
- _Note:_ Folds the standing `USER-INBOX § Atomic` capture (the between-WUs-path request). Compose as a
  resolve-then-load fragment (composable-workflows forward-compat), not a parallel copy. SESSION-NOTES
  _content_ cleanup stays `handoff-optimization`'s — adjacent concern, coordinate.
- **Strategies:** strategy-workflow-authoring.md, strategy-package-project-sync.md

    - `[x]` **5.3.a Add the between-WUs branch (DRY)**
        - Factor the shared steps rather than duplicating the active-WU path; the branch skips SESSION-NOTES /
          meta-commit and reviews WORKING-MEMORY removals. Replaces the scattered `(if an active WU exists)`
          conditionals and the "next-session pointer" marker — durable captures route to existing surfaces
          (`USER-INBOX` / `WORKING-MEMORY` / `ROADMAP`), not a phantom pointer file.

    - `[x]` **5.3.b Wire the housekeep offer**
        - Reuse the Phase 3 drain logic (the second of the two doors); offer housekeep when captures pend.

- _Outcome:_ Added a dedicated between-WUs branch to both `session-handoff` copies: no meta commit or
  SESSION-NOTES write, WORKING-MEMORY review, durable capture routing, resolve-then-load dispatch to
  `drain-inbox.md` through `arc-housekeep`, refresh, sync, and confirm. Wired handoff's identity-gated
  `inboxState` probe through the status envelope and handler, with unit and integration coverage for success,
  identity-absent, empty, and probe-failure paths.

### `[x]` **5.4 `init-work-unit` non-blocking backstop warning**

- _Goal:_ Starting a new WU with a non-empty `USER-INBOX` emits a non-blocking warning ("starting new work with
  N pending captures — consider housekeep first") — a backstop reinforcing the empty-at-WU-start invariant at
  the init moment.
- _Note:_ Init, not activate — init is the begin-new-WU moment the invariant targets. Fires at Step 1/2 (before
  scaffolding), reading the `inboxState` probe. Both copies.

- _Outcome:_ Added the advisory backstop to Step 1 of both `init-work-unit` copies. Before creating a planning
  branch or spawning a worktree, the workflow now reads `inboxState`, warns when `USER-INBOX` has pending
  captures, keeps WU creation non-blocking, and lets the user optionally pause for base-branch housekeep before
  re-checking clean/parity.

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

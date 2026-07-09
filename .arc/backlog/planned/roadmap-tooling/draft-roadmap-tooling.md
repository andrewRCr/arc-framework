# Draft: ROADMAP Tooling

- **State:** Draft — rescoped at the 2026-07-06 decomposition to the **render-standard + rename slice**; the
  FP-critical state-integrity slice split out to `project-state-integrity`, on which this WU now depends. Iterate
  before PRD/spec promotion.
- **Origin:** [internal] — homes the CLI helpers Work Organization Reform codified-but-deferred (the
  rendered-view algorithm + hand-maintenance discipline shipped in WOR; the tooling that automates them did not).
- **Purpose:** Build the derived-view render **tooling** on top of `project-state-integrity`'s regenerate-wins
  projection engine — the render standard (columns / tiers / overflow / naming), the `ROADMAP → STATUS.PROJECT`
  rename cascade, the `arc cohort list` / `arc graduate` helpers + lifecycle-aware link reanchoring, and the
  `STATUS.USER` on-disk writer completion. The projection **engine** and its correctness (regenerate-wins,
  oracle/roster determinism, dangling-edge validation) belong to `project-state-integrity`; this WU applies the
  render standard on top.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **STATUS.USER writer offline merge and document chrome**

- *Routed from:* `USER-INBOX § Backlog`, housekeep drain (2026-06-06); captured during
  `class-model-foundation` ready-slice work.
- *Concern:* the eventual `STATUS.USER` writer should reconcile cached in-flight data with a fresh local ready
  slice on the online-but-unreachable path, instead of degrading the whole view to the cached document. The
  structured writer should own this merge; doing it in the terminal-only composer would be fragile string surgery.
- *Document chrome:* the writer/template also owns the H1, standing header note, intro blurb, and `Updated:`
  footer. Re-evaluate the current local blurb wording at template time, including whether "available" should align
  to the table heading's "ready" vocabulary.

### `[ ]` **Lifecycle-aware link reanchoring for movable ARC artifacts**

- *Routed from:* `BACKLOG-INBOX`, work-routing-discipline retirement pass (2026-06-01). Folded here because the
  reanchor belongs to the same lifecycle file-move CLI surface this WU owns (`arc graduate`, the boundary
  ceremonies that `git mv` artifacts).
- *Concern:* in `pm.mode: arc-in-git`, lifecycle workflows move PRDs, task lists, atomic companions, plan docs,
  and archives between `backlog/`, `active/`, and `completed/`. Markdown links inside moved files can go stale
  because relative paths anchor to the source file's old directory. The pre-commit link validator catches the
  failure, but recovery is manual and interrupts the activation/archive flow.
- *Proposed:* combined helper + lifecycle CLI improvement — (1) a constrained link-reanchor helper accepting
  explicit move pairs (or reading staged `git mv` state), parsing Markdown links / reference definitions and
  rewriting only targets that resolve to moved ARC artifacts; (2) integrate into the lifecycle CLI commands so
  `npx arc` performs `git mv`, state/PM updates, and link reanchoring as one operation. Keep it structural (not
  broad grep/replace); support `--check`/`--write`; preserve filename-only references.
- *Scope:* M (helper + tests); L if bundled with full activation/archive CLI commands.

### `[ ]` **Evaluate extracting a standalone STATUS render-standard doc when repurposing § ROADMAP**

- *Routed from:* In-Flight Awareness Phase 3 planning (2026-06-02). That WU adds the shared render contract —
  per-table column sets + the uniform `(priority, cohort, wu-name)` sort key — to `strategy-work-organization.md
  § ROADMAP`, since `STATUS.USER` is the in-flight-mine slice of the *same* source as the project view: one
  contract, two consumers.
- *Concern:* `strategy-work-organization.md` is already ~811 lines / ~40 sections. After In-Flight Awareness lands,
  § ROADMAP carries a render contract shared by `STATUS.PROJECT` and `STATUS.USER` — a decomposition candidate. But
  extracting it early, from a WU that doesn't own the project-view doc, would fragment one contract across two
  files, so it was deliberately kept in § ROADMAP for now.
- *Proposed:* At the § ROADMAP repurposing (contract kept, mechanics → renderer spec), evaluate lifting the shared
  render standard into its own doc (e.g. a `STATUS` render-standard strategy), co-decided with the
  ROADMAP → STATUS.PROJECT rename (`doc-naming-convention`) so home and naming settle together. Keep-in-place is a
  valid outcome — the point is to make the call deliberately with the right owner, not let the broad doc grow by
  default.
- *Scope:* S — a doc-structure decision + move, folded into the § ROADMAP repurposing already in this WU's scope.

### `[ ]` **Codify the empty-tier render convention in the shared render standard**

- *Routed from:* `USER-INBOX § Atomic`, housekeep drain (2026-06-02); captured at in-flight-awareness archival.
- *Concern:* `strategy-work-organization.md` § Render standard fixes per-table column sets and the uniform sort
  key but says nothing about how a tier with **zero rows** renders. Surfaced at in-flight-awareness archival —
  shipping the only in-flight WU emptied the In Flight tier with no guidance (an italic `_No work units in
  flight._` placeholder was chosen ad hoc). `STATUS.USER` shares the standard and has the same gap (an operator
  with no in-flight-mine work).
- *Proposed:* add an empty-tier rule to § Render standard — retain the tier heading and render a single fixed
  italic placeholder line instead of a header-only empty table; applies to both the project readiness view and
  `STATUS.USER`. Keep the placeholder string fixed so byte-stability holds. Coordinate so this WU's automated
  renderer emits the same placeholder.
- *Scope:* S — strategy-doc convention edit; infra-smell re-triaged to quick-tier at drain (touches a strategy).

### `[ ]` **Rename this WU — its name goes stale once it renames ROADMAP away**

- *Routed from:* `USER-INBOX § Backlog`, housekeep drain (2026-06-02); captured during in-flight-awareness spec
  planning. (`naming-conventions` owns the convention.)
- *Concern:* this WU renames `ROADMAP` → `STATUS.PROJECT` and automates the `STATUS.*` render (both `.PROJECT`
  and `.USER`), so "roadmap" no longer describes what it tools.
- *Proposed:* rename the WU + concept to a status-oriented name (e.g. `status-view-tooling` /
  `status-render-tooling`) and sweep cross-references in sibling drafts / metas. Coordinate with
  `naming-conventions` (owns the convention).
- *Scope:* S — WU rename + reference cascade.

### `[ ]` **STATUS.USER on-disk write + refresh is unbuilt — only the terminal render shipped**

- *Routed from:* housekeep-drain discovery (2026-06-02) — surfaced when the last WU's integration regenerated
  ROADMAP but left `STATUS.USER.md` stale.
- *Concern:* in-flight-awareness shipped the render core + the terminal view (`arc status --user`) but
  **explicitly deferred the canonical-file write + reconcile** (`user-view.ts`: "renders to the terminal only;
  the canonical-file write and reconcile … land later"). So `arc status --user` prints an up-to-date slice but
  **nothing writes `.arc/user/{identity}/STATUS.USER.md`** — it reads the on-disk file only as a degradation
  cache. No ceremony refreshes it either: the lifecycle workflows carry a `Regenerate ROADMAP` step but no
  parallel STATUS.USER step (integrate / archive / activate / init / handoff / session-init). The strategy's
  "the rendered file is the cache / trustworthy when opened" language describes the *target*, not shipped reality.
- *Proposed:* build the canonical-file write + reconcile (this WU's deferred half), then wire the refresh at the
  trigger points the strategy names (spawn / activate / integrate / shift / handoff + session-start-no-active-WU
  for the cross-machine slice). Reconcile the strategy § STATUS.USER claims with shipped behavior as the writer
  lands.
- *Interim:* `finalize-parallelism` added a narrow cache safety patch: explicit `arc status --user` refreshes now
  write the resolver-backed cache, and linked-worktree migration discards stale generated `STATUS.USER.md` copies
  instead of treating them as divergent authored user content. Full trigger wiring, document chrome, and offline
  cache merge remain here.
- *Scope:* M — the deferred file-write/reconcile + trigger wiring (CLI + workflows, package-synced).

### `[ ]` **Render standard: uniform columns (replace conditional-column rules) + Priority as a regen trigger**

- *Routed from:* housekeep-drain follow-on (2026-06-02), surfaced doing the Priority-backfill errand + ROADMAP
  regen. Coordinate with the empty-tier-render note above — same § Render standard, land together.
- *Concern:* now that `**Priority:**` ships and is populated, the render rules are internally inconsistent and
  partly contradicted by the rendered artifact:
    - **Conditional columns are arbitrary and ragged.** § Render standard says "omit any column constant across
      the table," but the Priority-specific rule renders the column "when at least one row carries a value" — the
      two diverge for an all-`P2` table (omit-if-constant hides it; the special rule shows a constant `P2`
      column). And the actual ROADMAP already renders `Depends on` in Ready despite it being constant `—`, so the
      artifact already votes for **uniform columns**. Decision (this session): standardize on a uniform column set
      across all tables — `Work unit · Priority · Owner · Depends on · Cohort` (`State` prepended for In Flight),
      Priority always shown in slot 2. Replaces both "omit-constant columns" and "conditional Priority."
    - **The rule lives in code, not just the doc.** `lib/status/render.ts` (≈ line 10) "drops the conditional
      Priority column when no row carries a value" — the uniform-columns change must touch the renderer, not only
      `strategy-work-organization.md § Render standard`.
    - **DEV-RULES omits Priority from the regen-trigger list.** `DEV-RULES.ARC § Commit Discipline` (and its
      package mirror) names only `Depends On / Owner / Cohort` as render fields that re-render ROADMAP in the same
      commit, yet `strategy-work-organization § Regeneration fire-points` correctly includes `**Priority:**`. Add
      `Priority` to the DEV-RULES list to reconcile.
- *Proposed:* one reconciliation pass — strategy § Render standard (uniform-columns rule) + `render.ts` (render
  uniformly) + DEV-RULES.ARC regen-trigger list (add Priority) + package mirrors.
- *Scope:* S–M — doc + small renderer change, package-synced; reviewed-lane (touches DEV-RULES + strategy).

---

### `[ ]` **Render decisions for nested cohorts + multi-dependency rows (surfaced by the first graduation)**

- *Routed from:* agile-wu-lifecycle graduation (PR #55), 2026-06-04 — first hand-render with a nested cohort
  path and WUs carrying more than one dependency. Coordinate with the uniform-columns entry above — same
  § Render standard, land together.
- *Concern:* two render gaps the uniform-columns entry didn't anticipate (nested cohorts + multi-dep didn't
  exist yet):
    - **Nested cohort path.** `Cohort` is now path-valued (`principle-anchored-core/agile-wu-lifecycle`); the
      full path overflows the column. Interim render shows the **leaf segment only** (`agile-wu-lifecycle`),
      full path in the meta. Ratify, or prefer top-level / full-path.
    - **Multi-dependency rows overflow.** A WU with two deps (`concurrent-work-conventions` →
      `scalable-authoring-pipeline, decomposition-machinery`) pushes the row to ~127 chars, past the 120
      target. A `Blocked by:` list was tried and rejected (split the table into duplicate WU names); reverted
      to the wide table and accepted it as a big-screen artifact. Needs a real policy: accept-wide, a generated
      graph/list view, or narrow other columns.
- *Proposed:* fold into the § Render standard pass above (same doc + `render.ts`); decide the nested-cohort
  segment rule and the multi-dep / over-width policy; consume `arc.identity.short`
  (config-storage-architecture) to shrink the Owner column.
- *Refinement (routed from `USER-INBOX § Backlog`, housekeep drain 2026-06-14):* high fan-in kills the
  "accept-wide / big-screen artifact" option outright — `finalize-parallelism`'s row now depends on so many WUs
  that the `Depends on` cell can't fit the table at all, well past the ~127-char two-dep case above. Pushes the
  over-width policy toward a generated graph/list view or the by-priority/horizon render mode, not one wide cell.
- *Scope:* S — render-standard + renderer; lands with the uniform-columns reconciliation.

### `[ ]` **Render-standard decisions from CWC planning (refinements to existing buffer items)**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: roadmap-tooling`), agile-wu-lifecycle cohort housekeep drain
  (2026-06-04). A CWC planning adjacency pass settled five render-standard / STATUS questions that **refine this
  WU's existing inbound-buffer items** (decisions/refinements, not new scope) — fold each into its target item at
  integration. Captured during `concurrent-work-conventions` planning (2026-06-03).
- *B2 — cross-doc column order* (→ the "extract a standalone STATUS render-standard doc" / shared-contract item):
  adopt "Work unit always col 1; State (where present) always col 2; following columns consistent; column
  **inclusion** varies by scope (STATUS.USER omits Owner — printing one's own name every row is noise)." Effect:
  ROADMAP In Flight reorders State col 1 → col 2 to match STATUS.USER (which already conforms).
- *B1 — uniform columns refinement* (→ the "Render standard: uniform columns" item): keep the already-decided
  uniform set; **decline** equal-width-across-tables (pad to doc-max) — cosmetic only, and the tier already
  encodes State for Ready/Blocked so a State column there is empty/redundant. Keep State In-Flight-only.
- *B3 — priority visual grouping* (→ render-standard work): do **not** separate priority groups with blank lines —
  a blank line terminates a GFM table, so P2/P3 blocks render broken (verified live, then reverted). Pick at
  render time: (a) per-priority sub-headings, each its own table; (b) Priority value on the first row of each
  group only (merged-cell style; risk: a blank cell reads as "no priority"); or (c) leave the readiness table
  flat and solve scanning via the horizon view (B4).
- *B4 — by-priority / horizon view* (→ confirms § Unknowns "Direction's home"): now/next/later is a render
  **mode** over the same meta source (Now = In Flight; Next = Ready, priority-then-dependency ordered; Later =
  the rest), not a separate file. CWC contributes only the concurrency-safety overlay on the "Next" slice (the
  existing CWC↔roadmap-tooling seam).
- *A — STATUS.USER interim honesty* (→ note on the "STATUS.USER on-disk write + refresh is unbuilt" item):
  considered fixing the header's false freshness claim as a separate interim errand; **decided** to leave it
  bundled into that item — the file stays knowingly-stale until the writer lands. Recorded so it is not re-raised
  as separate work.

### `[ ]` **Honor the per-element backtick convention for `Depends On` / `Design` meta fields**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: roadmap-tooling`), housekeep drain (2026-06-08); captured
  at `scalable-authoring-pipeline` Task 1.4.
- *Concern:* SAP (Task 1.4) switched the meta render convention for the list-valued fields `Depends On` /
  `Design` to per-element backticks — `` `A`, `B` `` (two discrete tokens) rather than the compound whole-value
  `` `A, B` `` — via a new `identifier-list` valueClass in `meta-reader.ts`'s `formatValue`. This WU owns the
  real ROADMAP renderer + dependency-edge handling, so the convention lands as a requirement on it.
- *Proposed:* (1) parse `Depends On` only through the shared reader path (`parseMetaRecord` →
  `parseIdentifierList`, relying on the **global** `stripInlineCode`) — never reintroduce a bespoke
  outer-pair-strip parser, which mis-parses the per-element form. (2) Reconcile the ROADMAP "Depends on" cell
  with the per-element convention: `lib/status/render.ts` joins deps plain (no backticks) today — decide whether
  table cells should match the meta bullets.
- *Scope:* pairs with this WU's existing buffer items on uniform-columns + `render.ts`.

### `[ ]` **§ Unknowns "Direction's home" resolved by `goal-aware-direction` + two render consequences**

- *Routed from:* `goal-aware-direction` grooming (2026-07-02).
- *Resolution:* the "Direction's home" open call is settled — direction gets a separate small **authored** doc
  (`VECTOR.PROJECT`, a scope-paired target/horizon surface owned by `goal-aware-direction`); this WU's derived
  view stays purely derived, and the earlier "now/next/later is derivable" lean is *repaired, not reopened*: the
  missing datum was the goal itself. The freed `roadmap` name **retires** rather than transferring (transition
  hazard; `ROADMAP.USER` idiomatically broken). Confirms the B4 render *mode* — which post-vector should consume
  the target (goal-aware "Next") rather than priority-order alone.
- *Vocabulary hygiene (research-grounded 2026-07-02):* a mechanical now/next/later banding over *WUs* is a
  readiness-horizon view over outputs, not an outcome NNL roadmap (Bastow's sense) — don't name it in a way that
  claims outcome semantics unless it consumes the vector. Keep readiness vocabulary for readiness renders.
- *Multi-dep cell recommendation (with the over-width policy items above):* treat the rendered table as a
  **lossy scan surface** — the lossless edge set lives in the meta and `arc status <slug>`. Render deps as WU
  short names (the `Short:` field, convention owned by `naming-conventions`) with a deterministic overflow
  collapse — `SAP, DM, +4` — optionally paired with a plain list section below the table for overflowed rows.
  Unbounded inline lists are unsolvable under the 120-char budget by naming alone; boundedness is the rule.

### `[ ]` **Make the render standard's output idempotent under `markdown-table-formatter`**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: roadmap-tooling`); `roadmap-renderer-slice` errand, Pass 1
  byte-determinism verification (2026-07-05). Folded in at the 2026-07-06 decomposition.
- *Concern:* the readiness composer (`project-view.ts`, via `renderStatusTable` in `render.ts`) emits GFM table
  **separator** rows padded (`| --- |`), but the repo's canonical style — `markdown-table-formatter` per
  DEV-RULES.PROJECT § Quality Gates — is tight (`|---|`). Verified: the formatter rewrites **only** the separator
  rows (data/alignment/columns already stable). `markdownlint` passes on both, so CI is green either way; the gap
  is generator-vs-formatter **non-idempotence** — a composer-written ROADMAP re-dirties on the next `format:tables`
  pass.
- *Proposed:* criterion — **generated output must be a fixpoint of the repo's formatters.** Make
  `renderStatusTable`'s separator emission match the tight style so a composed ROADMAP survives `format:tables`
  unchanged. `renderStatusTable` is **shared with `STATUS.USER`**, so the fix touches that view + its render
  tests, and diverges `render.ts` from FP — coordinate so FP adopts the same on merge. Mechanical formatting
  conformance, not a semantic render-standard call — orthogonal to the render-standard reconciliation but lands
  naturally with this WU's `render.ts` work.

### `[ ]` **Continue the render standard on `project-state-integrity`'s projection base**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: roadmap-tooling`); `finalize-parallelism` Task 2.4.a
  (`arc start` substrate), 2026-07-04. Folded in at the 2026-07-06 decomposition — the render-**standard**
  continuation of the FP-renderer capture whose substrate-base half routed to `project-state-integrity`.
- *Concern:* once `project-state-integrity` audits/adopts FP's minimal renderer substrate as the regenerate-wins
  projection engine, this WU continues on that base: reconcile it with the pending `ROADMAP → STATUS.PROJECT`
  decision, template/scaffold shape, empty-tier convention, uniform-column and overflow policy, STATUS.USER writer
  parity, and the final CLI surface (`arc roadmap render`). Do not re-solve the projection engine here — depend on
  it.
- *Scope:* lands with this WU's render-standard reconciliation; sequenced after `project-state-integrity`'s
  substrate adoption.

---

## Problem / Motivation

WOR established the meta files as the single source of truth and codified a deterministic render for
`backlog/ROADMAP.md` (`strategy-work-organization.md § ROADMAP`), with ceremony workflows carrying
regenerate-ROADMAP steps. The automation was explicitly deferred: WOR ships the algorithm + interim
hand-maintenance discipline, not the tool. WOR's Phase 7.R then reshaped the doc into a **fully-derived
readiness view** (In Flight / Ready / Blocked, rendered by WU-name from `State` / `Owner` / `Depends On`; no
hand-maintained content) and hand-rendered the first baseline.

Three standing costs remain until this WU lands (the state-layer correctness beneath them —
regenerate-wins projection, oracle determinism, dangling-edge validation — is `project-state-integrity`'s):

- **The renderer is assumed to exist.** `arc-plan-conductor`'s park/resume workflows treat "ROADMAP regen" as a
  one-line mechanism; the boundary workflows (`activate` / `integrate` / `archive` / `deactivate`) hand-maintain
  per the algorithm in the interim. Every ceremony pays a manual-render tax and risks drift.
- **Sibling helpers are deferred alongside it.** WOR's CLI-tooling capture lists `arc cohort list` and
  `arc graduate <type>` next to the renderer — all three read or mutate the same meta-file + backlog surface.
- **Planning-time edits have no regen trigger.** `§ ROADMAP` lists graduation (`provisional/` → `planned/`) and
  dependency-field edits as regen fire-points, but those happen during planning — outside the four boundary
  ceremonies that carry a regen step — so the ROADMAP silently lags after a promotion or a `**Depends On:**`
  change until the next ceremony re-render. The renderer makes regen cheap enough to run on demand, closing the
  gap.
- **Interim enforcement landed in WOR (Task 7.R.5); two upgrades remain here.** WOR added the standing regen rule
  (DEV-RULES.ARC § Commit Discipline) plus a field-specific pre-commit warning (CHECK 17, warn-only), and split
  `§ ROADMAP` fire-points into ceremony-wired vs. manual discipline. Deferred to this WU: (1) a **ceremony-aware
  dir-move check** (graduation / demotion / create-into-`planned/`) — belongs in the commit-msg hook, which has
  the commit message for the ceremony exemption pre-commit lacks; (2) **escalate CHECK 17 from warn to block**
  once `arc roadmap render` makes the fix a one-command stage-and-recommit.

## Scope

Candidate command set (final split confirmed at PRD time):

- **`arc roadmap render`** — the render **standard + CLI surface** over `project-state-integrity`'s regenerate-wins
  projection engine: emit `backlog/ROADMAP.md` per the codified algorithm (In Flight / Ready / Blocked,
  cohort-grouped within tier, WUs by canonical WU-name with owner + `◂ <dep-wu-name>` pointers, header marker),
  applying the render standard (uniform columns, empty-tier, nested-cohort + multi-dep overflow, per-element
  backticks, formatter-idempotence). Target: reproduce the WOR-era hand baseline (first run is a no-op diff). The
  projection **engine** (glob/roster walk + regenerate-wins resolution) and **dangling-edge validation** are
  `project-state-integrity`'s; this command applies the standard on top.
- **`arc cohort list`** (or equivalent) — enumerate cohort members from `**Cohort:**` fields.
- **`arc graduate <type>`** — branch-rename ergonomics for the `plan/<name>` → `<type>/<name>` graduation.

Companion doc deliverable (lands with the render standard): **significantly repurpose `strategy-work-organization.md
§ ROADMAP`.** Once the renderer carries the step-by-step, that section should be slimmed to the contract it
actually governs — the tier definitions, dependency-satisfaction-by-absence and its invariants, and the
regeneration fire-points — and point at `arc roadmap render` for the mechanics. The numbered render procedure
(glob-walk, parse order, markdown emit) sits in the strategy today only because hand-maintenance needs a precise
procedure with no tool to carry it; landing the renderer removes that reason. Keep the contract in the strategy;
move the mechanics to the renderer's spec/tests.

The `ROADMAP → STATUS.PROJECT` rename cascade (the `roadmap` name **retires**; direction moves to
`goal-aware-direction`'s authored `VECTOR.PROJECT`) and the `STATUS.USER` on-disk writer completion (the deferred
canonical-file write + reconcile) also land in this WU — see the Inbound Buffer.

Possible adjacent capture (decide at PRD): a Release Notes Entry validation check (e.g. `arc state set
integrating` validates archive-phase section presence on the meta file).

## Dependencies and Sequencing

- **`project-state-integrity`** (hard dependency, the one edge of the decomposition) — provides the trustworthy
  regenerate-wins projection engine + oracle/roster determinism + dangling-edge validation this WU's render
  standard and CLI surface build on. Render tooling atop a state layer that lies would inherit the lie.
- **CLI Substrate Adoption** — provides the zod meta-frontmatter schema this tooling would parse against;
  preferred to sequence after CSA so parsing is typed rather than hand-rolled. Not a hard gate (a hand-rolled
  parser is viable if landing the renderer earlier is favored).
- **arc-plan Conductor** — consumes `arc roadmap render` (assumes it exists). Sequence this WU before or
  alongside the conductor; otherwise the conductor falls back to the codified hand-regen discipline.
- **Concurrent Work Conventions** — owns parallel-safety + any ROADMAP visualization redesign (see Unknowns).
  Coordinated via a note in `draft-concurrent-work-conventions.md`.

## Unknowns and Assumptions

- **Semantics / rename.** Once preference and direction are out (WOR 7.R), the doc is a derived dependency/
  readiness view, not a priority timeline — "roadmap" may be the wrong name. Rename candidates (work-graph / WU
  board / pipeline) vs. keeping the familiar `ROADMAP.md`; the cascade cost (workflows, strategies, ADRs, CLI
  seed/manifest, file-classification governed files, session-init discovery) is real. WOR deliberately kept the
  filename and parked the rename here. If a directional now/next/later doc is later adopted (see the
  direction-layer note below), it may claim the freed `roadmap` name — making this view's rename a forcing move
  rather than optional.
- **Direction's home.** The directional / "what's important" half a roadmap traditionally carries is constitutional
  (PROJECT-PRD mission + principles) or simply out of in-git scope (session/PM). Confirm no orphaned need before
  any rename. If a real directional need surfaces, the clean resolution is a *separate* now/next/later artifact
  (human-curated priority / time-horizon) that takes the `roadmap` name, freeing this derived dep-state view to
  rename (per the semantics note above) — keeping the two layers discrete rather than shoehorning priority back
  into the doc WOR 7.R just stripped it from. WOR 7.R research confirms now/next/later is the standard directional
  idiom, distinct from a dependency view; ARC has no directional layer today, so whether to add one is the open
  call. (Now settled — see the § Unknowns "Direction's home" resolution buffer item above.)
- **Parallel-safety — deterministic or not?** "Which Ready WUs are concurrency-safe with what's in flight" is
  high-value but likely not deterministic from ARC data (meta files don't declare file-scope/domain; predicted
  paths ≠ actual; cognitive-load is judgment). Industry leans on conventions + pick-time accounting (WIP limits,
  swimlane/value-stream partitioning, module ownership) over a computed answer. Probably an on-contact
  convention, not a rendered field — CWC's research call. Constraint: if a parallel view is ever hand-curated, it
  is a **sibling** artifact; the derived ROADMAP stays hand-maintenance-free.
- Whether `arc cohort list` and `arc graduate` belong in this WU or split — co-deferred but functionally
  distinct from the renderer.
- Whether to gate on CSA (typed parsing) or land the renderer earlier with hand-rolled meta parsing.
- Output-stability contract: the renderer should reproduce the WOR-era hand baseline exactly, so the cutover is
  a no-op diff. Confirm the hand baseline matches the algorithm closely enough that this holds.

### Cross-WU design input (Worktree Foundation planning, 2026-05-24)

The Worktree Foundation planning round, while designing the user-scoped in-flight view (`STATUS.USER`),
settled several points that bear on this WU's open questions. (That awareness layer — the oracle,
`STATUS.USER`, `Priority`, and materialize — has since split out to **In-Flight Awareness**; the
attributions below now name it.)

- **Priority field — standardized by In-Flight Awareness (updated 2026-05-24).** The per-WU `**Priority:**`
  field (3 bounded levels, `P3` default; a *field*, never a hand-curated ordering *doc* per ADR-020) is
  introduced by In-Flight Awareness, not here: it is an *input* field that lands where first needed, and the
  multi-in-flight worklist is that place. In-Flight Awareness adds it to `template-meta.md` +
  `strategy-work-organization.md` and renders it in both `STATUS.*` views. **This WU's scope narrows to
  *automating* the render** + the directional derivation (now/next/later) of an already-standardized field —
  it no longer introduces the field.
- **Answers "Direction's home."** With `State × Depends-On × Priority`, now/next/later is *derivable* (Now =
  In Flight; Next = Ready, priority-ordered; Later = the rest) — a render mode, not a separately-curated doc.
  Narrative direction stays in PROJECT-PRD. So the open call leans **no separate directional doc**; the
  freed name goes to a derived view, not a hand-maintained timeline.
- **The rename leans toward `STATUS`.** Adding priority shifts the project view from a pure dependency graph
  toward a status/priority board — so a `STATUS`/dashboard-flavored name fits better than the earlier
  graph/pipeline candidates, and **`STATUS.PROJECT`** pairs with In-Flight Awareness's **`STATUS.USER`**
  under the `TYPE.QUALIFIER` convention (see the `doc-naming-convention` provisional stub). The rename +
  cascade stays this WU's to execute.

## Scope Estimate

Small–Medium. The render standard + CLI surface (`arc roadmap render` presentation, columns, tiers, overflow,
naming) + the rename cascade + `cohort` / `graduate` helpers + the STATUS.USER writer — bounded, no new
constitutional surface. Lighter if `cohort` / `graduate` split out. The heavy state-layer correctness moved to
`project-state-integrity`; sequencing behind it shapes timing more than size.

## Coordination — ADR-022

`ROADMAP` / `STATUS.PROJECT` is a *derived* managed operational-state document (ADR-022): a rendered
projection over the meta records. `project-state-integrity` owns the regenerate-wins projection **engine** (the
first render-and-reconcile instance); this WU owns the render **standard** + CLI surface on top. Coordinate the
engine/standard boundary with `operational-state-docs`, which later absorbs both into the general
render-and-reconcile engine. See `adr-022-managed-operational-state-documents.md` § Coordination.

When the reconcile engine absorbs mutation of managed source-doc entries (e.g. removing the slug-matched
`USER-INBOX` line on errand completion), honor `async-merge-lifecycle`'s idempotent-removal contract — one
authoritative remover plus no-op-when-absent backstops, recorded in `draft-operational-state-docs.md`
§ Reconcile the interim title-keyed parser.

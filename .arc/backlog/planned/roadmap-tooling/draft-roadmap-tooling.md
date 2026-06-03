# Draft: ROADMAP Tooling

- **Origin:** [internal] — homes the CLI helpers Work Organization Reform codified-but-deferred (the
  rendered-view algorithm + hand-maintenance discipline shipped in WOR; the tooling that automates them did
  not).
- **Purpose:** Build the small CLI helpers that operate on WOR's settled meta-file shape + backlog structure,
  starting with the deterministic ROADMAP renderer that downstream workflows already assume exists.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

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
- *Scope:* M — the deferred file-write/reconcile + trigger wiring (CLI + workflows, package-synced).

---

## Problem / Motivation

WOR established the meta files as the single source of truth and codified a deterministic render for
`backlog/ROADMAP.md` (`strategy-work-organization.md § ROADMAP`), with ceremony workflows carrying
regenerate-ROADMAP steps. The automation was explicitly deferred: WOR ships the algorithm + interim
hand-maintenance discipline, not the tool. WOR's Phase 7.R then reshaped the doc into a **fully-derived
readiness view** (In Flight / Ready / Blocked, rendered by WU-name from `State` / `Owner` / `Depends On`; no
hand-maintained content) and hand-rendered the first baseline.

Three standing costs remain until this WU lands:

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

- **`arc roadmap render`** — walk `active/**` and `backlog/planned/**` for `meta-*.md`, parse the canonical
  fields (`State` / `Owner` / `Depends On` / `Cohort` / title), and emit `backlog/ROADMAP.md` per the codified
  algorithm: In Flight / Ready (all deps shipped) / Blocked (waiting on, by dependency depth), cohort-grouped
  within tier, WUs rendered by canonical WU-name with owner + `◂ <dep-wu-name>` pointers, header marker
  (generated-by note + last-rendered commit hash). Target: reproduce the WOR-era hand baseline (first run is a
  no-op diff).
- **Dependency-edge validation** (render-time, or a `--check` mode) — resolving `**Depends On:**` by absence
  (a dep is met once its WU leaves `active/` + `backlog/`) silently treats a *dangling* edge — a typo'd or
  renamed target — as satisfied. Distinguish *absent-because-shipped* (target in `completed/` / archive →
  satisfied) from *absent-everywhere* (→ warn). Surfaced during WOR's dependency-baseline pass.
- **`arc cohort list`** (or equivalent) — enumerate cohort members from `**Cohort:**` fields.
- **`arc graduate <type>`** — branch-rename ergonomics for the `plan/<name>` → `<type>/<name>` graduation.

Companion doc deliverable (lands with the renderer): **significantly repurpose `strategy-work-organization.md
§ ROADMAP`.** Once the renderer carries the step-by-step, that section should be slimmed to the contract it
actually governs — the tier definitions, dependency-satisfaction-by-absence and its invariants, and the
regeneration fire-points — and point at `arc roadmap render` for the mechanics. The numbered render procedure
(glob-walk, parse order, markdown emit) sits in the strategy today only because hand-maintenance needs a precise
procedure with no tool to carry it; landing the renderer removes that reason. Keep the contract in the strategy;
move the mechanics to the renderer's spec/tests.

Possible adjacent capture (decide at PRD): a Release Notes Entry validation check (e.g. `arc state set
integrating` validates archive-phase section presence on the meta file).

## Dependencies and Sequencing

- **Work Organization Reform** — provides the meta-file shape, field semantics, and the derived-view algorithm
  this tooling renders. Shipped upstream.
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
  call.
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

Small–Medium. Three bounded commands plus tests; no new constitutional surface. Lighter if `cohort` / `graduate`
split out. Dependencies above shape sequencing more than size.

## Coordination — ADR-022

`ROADMAP` / `STATUS.PROJECT` is a *derived* managed operational-state document (ADR-022): a rendered
projection over the meta records. This WU's renderer is the first instance of the model's
render-and-reconcile engine; coordinate the engine boundary with `operational-state-docs`. See
`adr-022-managed-operational-state-documents.md` § Coordination.

# Draft: ROADMAP Tooling

- **Origin:** [internal] — homes the CLI helpers Work Organization Reform codified-but-deferred (the
  rendered-view algorithm + hand-maintenance discipline shipped in WOR; the tooling that automates them did
  not).
- **Purpose:** Build the small CLI helpers that operate on WOR's settled meta-file shape + backlog structure,
  starting with the deterministic ROADMAP renderer that downstream workflows already assume exists.

---

## Problem / Motivation

WOR established the meta files as the single source of truth and codified a deterministic render for
`backlog/ROADMAP.md` (`strategy-work-organization.md § ROADMAP`), with ceremony workflows carrying
regenerate-ROADMAP steps. The automation was explicitly deferred: WOR ships the algorithm + interim
hand-maintenance discipline, not the tool. WOR's Phase 7.R then reshaped the doc into a **fully-derived
readiness view** (In Flight / Ready / Blocked, rendered by WU-name from `State` / `Owner` / `Depends On`; no
hand-maintained content) and hand-rendered the first baseline.

Two standing costs remain until this WU lands:

- **The renderer is assumed to exist.** `arc-plan-conductor`'s park/resume workflows treat "ROADMAP regen" as a
  one-line mechanism; the boundary workflows (`activate` / `integrate` / `archive` / `deactivate`) hand-maintain
  per the algorithm in the interim. Every ceremony pays a manual-render tax and risks drift.
- **Sibling helpers are deferred alongside it.** WOR's CLI-tooling capture lists `arc cohort list` and
  `arc graduate <type>` next to the renderer — all three read or mutate the same meta-file + backlog surface.

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
  filename and parked the rename here.
- **Direction's home.** The directional / "what's important" half a roadmap traditionally carries is constitutional
  (PROJECT-PRD mission + principles) or simply out of in-git scope (session/PM). Confirm no orphaned need before
  any rename.
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

## Scope Estimate

Small–Medium. Three bounded commands plus tests; no new constitutional surface. Lighter if `cohort` / `graduate`
split out. Dependencies above shape sequencing more than size.

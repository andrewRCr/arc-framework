# Plan: Docs Site Content Sweep

**Purpose:** Post-docs-site-migration WU that consolidates content updates for the public
`docs/` site — methodology model changes that accumulated since the content port, plus
content contributions staged from other WUs (e.g., operational-context extractions from
rule/workflow slim-down passes). Accumulation home for both input types between now and
WU activation.

- **State:** Capture (accumulating items; PRD-drafted closer to activation)
- **Created:** 2026-04-16
- **Origin:** The Work-Status Restructure WU shipped the per-WU status file model to `.arc/` and
  `packages/arc-framework/arc/` but did not update the adopter-facing content at `docs/`. Pre-merge review surfaced ~15
  touch points across 9 files still describing the retired singular `WORK-STATUS.md` model. That propagation was the
  first captured item; subsequent WUs now also stage content contributions here.

---

## Why a Dedicated Plan

The two adjacent docs-touching WUs don't absorb this work cleanly:

- **`prd-arcd-docs-site.md`** (mkdocs → Astro/Starlight migration) is explicitly
  *format migration, not content rewrite* (Non-Goals: "not a content-expansion pass",
  "not a content rewrite"). It carries one content-sweep hitchhiker — the rebrand
  branding sweep from `prd-arcd-rebrand.md` — because branding is mechanical
  find-replace that pairs cleanly with the per-file content port. Methodology model
  changes and content contributions (conceptual, editorial, prose-level judgment per
  touch point) don't fit that rubric.
- **`prd-arcd-rebrand.md`** excepts `docs/**` from its content sweep Success Criteria
  and routes the branding sweep through the docs-site WU's content port. Scope stays
  on branding — not a general content-refresh vehicle.

The concern is also inherently ongoing: framework updates between now and docs-site
activation will generate additional drift, and slim-down WUs will stage content
contributions over time. A dedicated catch-all means both input types get tracked at
capture time rather than being rediscovered during an eventual sweep.

## Timing

**Activates after `prd-arcd-docs-site.md` merges.** Running before the Starlight
structure lands would burn effort on mkdocs prose that gets transformed (or deleted)
during the content port.

**Before public release.** The sweep must land before `plan-wu5-public-release.md`
activates — external readers arriving at a fresh docs site should not read a
methodology description that no longer matches the shipped framework, and staged
content contributions should be integrated so slimmed `.arc/` files' link placeholders
resolve cleanly.

## Items to Sweep

Two input types feed this sweep:

- **Drift items** — methodology changes in `.arc/` that left user-facing `docs/` prose
  stale. Each entry captures touch points in existing `docs/` files to update.
- **Content contributions** — staged content from other WUs (typically slim-down passes
  that extract non-operational prose from in-repo files for docs/ absorption). Each
  entry points at a staging notes file produced by the source WU.

### Drift Items

#### 1. Per-WU status file model (from Work-Status Restructure WU, 2026-04-16)

**What changed:** Singular tracked `.arc/active/WORK-STATUS.md` retired. Per-WU
`status-{name}.md` files in `active/{category}/` carry project state; file is
deleted (not reset) at archive. `**State:**` field (on status file) is the
lifecycle marker; `**Status:**` header retired from task list template. SESSION-NOTES
gains `**Working On:**` field.

**Edit type:** Conceptual rewrite. Prose-level editorial judgment per touch point.
Not a mechanical find-replace — readers arriving fresh need explanations that hold
together without seeing the old model.

**Known touch points** (non-exhaustive, from pre-merge review 2026-04-16):

- `docs/getting-started.md:101,109`
- `docs/the-framework.md:60,127,140,143,148,176`
- `docs/contributing.md:24`
- `docs/methodology/principles.md:144,147`
- `docs/reference/sessions.md:92`
- `docs/reference/glossary.md:26,60`
- `docs/reference/skills.md:38,50`
- `docs/reference/team-coordination.md:23,44,120,136`
- `docs/reference/updating.md:63`

**Nuance:** Public-facing prose should explain *why* the per-WU model (disentangles
project pointer from session pointer; eliminates parallel-WU concurrency flaw;
cleans up under full protection) without assuming prior knowledge of the retired
model. Archive under `docs/reference/archive/` or similar if a historical note
helps; otherwise don't.

#### 2. Session portability / probe vocabulary realignment (from Session-Init Optimization WU, 2026-04-22)

**What changed:** Phase 3.R changed the public-facing session portability model and supporting terminology:
`arc sync --load` was retired in favor of the `arc user fetch` / `pull` split and direction-aware `arc sync`,
bootstrap guidance shifted away from implicit overwrite flows, `disk ahead` was renamed to `local unsaved`,
`conflict` was canonicalized over `divergence`, merge recovery now uses the explicit
"Merge: rebase my save onto remote, then push" label, and the shipped probe surface includes
`arc extensions status`, `arc active status`, and composite `arc status --session-init --json`
(`arc methods status` was explored and then dropped, so docs should not describe it as live).

**Edit type:** Mixed conceptual + mechanical sweep. Some touch points are direct stale command replacements, but
the portability model and bootstrap wording need reader-first prose rather than literal command swaps.

**Known touch points** (captured during 3.R pre-implementation audit, 2026-04-22):

- `docs/the-framework.md:186`
- `docs/reference/team-coordination.md:133`
- `docs/index.md:57-59,79`
- `docs/faq.md:121`

**Repo scan confirmation (2026-04-22):** A direct `rg` sweep of `docs/**` for stale portability
commands and vocabulary found exactly these four public-doc touch points. No additional
`arc sync --load`, `arc user pull --identity`, or probe-surface drift was present outside this
set at scan time.

**Nuance:** Keep this sweep aligned to shipped CLI behavior, not intermediate task-list intent. In particular:
do not document `arc methods status` as available, and preserve the docs-site plan boundary by updating these
public-doc touch points here rather than folding them back into Session-Init Optimization execution.

### Content Contributions

#### 3. Operational-context extractions (from Session-Init Optimization WU, pending)

**What changed:** Content audit of session-init always-loaded docs + high-frequency
workflows identified non-operational rationale/background/examples for absorption
into `docs/` site. Source WU slims in-repo files and stages extracted prose for
absorption here.

**Input type:** Content contribution (new prose to absorb), not drift-fix.

**Staging reference:** `notes-docs-content-sweep.md` in `backlog/technical/`,
populated when Session-Init Optimization WU activates. Structured as content blocks
per extraction — each captures source-file + section anchor, extracted content,
suggested destination in docs/ IA, stylistic integration notes.

**Link placeholders:** The source WU leaves `[TODO-docs-site]` reference-style link
placeholders in slimmed `.arc/` files pointing at eventual `docs/` destinations.
This sweep's execution must resolve all placeholders to final docs URLs. Greppable
pattern (`grep -r "TODO-docs-site"`) enables completion verification.

**Nuance:** Advisory destinations in the staging file are the source WU's best guess;
final IA placement is editorial judgment at sweep time. Extracted prose came from
dual-audience `.arc/` files and may need rephrasing for docs-only audience. Keep
phrasing honest to the Starlight structure this sweep targets.

## Adding Items

**Drift items** — when a methodology change lands in `.arc/` or
`packages/arc-framework/arc/` that affects user-facing conceptual content (not
branding, not file names, not formatting — actual model/behavior descriptions
adopters rely on):

1. Confirm the change doesn't fit `prd-arcd-rebrand.md` scope (branding only) or
   `prd-arcd-docs-site.md` scope (format migration only)
2. Add a new numbered item under § Drift Items with the template shape: what
   changed / edit type / touch points / nuance
3. Update Document History

**Content contributions** — when a WU slims in-repo content and stages extracted prose
for docs absorption:

1. Source WU produces a staging notes file (`notes-docs-content-sweep.md`) in
   `backlog/technical/` during its execution, structured per the Content Contributions
   entry shape
2. Add a numbered item under § Content Contributions here, pointing at the staging
   file and capturing high-level context (what changed / input type / staging
   reference / link placeholders / nuance)
3. Update Document History

The plan remains in capture state until either (a) `prd-arcd-docs-site.md` is near
activation and items have accumulated enough to PRD this WU, or (b) an individual
item is urgent enough to run as an atomic task list before the consolidated sweep.

## Scope Boundaries

**In scope:**

- Conceptual/model changes in `.arc/` that affect user-facing prose in `docs/` (drift)
- Content contributions staged from other WUs for docs/ absorption
- Editorial judgment to keep public copy coherent for readers arriving fresh
- Historical notes where helpful; deletion where not
- Resolving `[TODO-docs-site]` link placeholders left by source WUs

**Out of scope:**

- Brand identity changes (→ `prd-arcd-rebrand.md` / `prd-arcd-docs-site.md` § Req 12)
- File-format migration (→ `prd-arcd-docs-site.md`)
- New docs pages or structural reorganization of the docs tree (explicitly Non-Goal
  in the migration PRD; if needed, scope separately)
- Internal `.arc/` file drift (→ framework-sync integration test catches this)
- In-repo slim-down work itself (source WUs do this; this sweep only absorbs)

## Dependencies

- **Upstream:** `prd-arcd-docs-site.md` (format migration must land first so sweep
  targets the Starlight structure)
- **Downstream:** `plan-wu5-public-release.md` (public release prereq)
- **Feeds this plan:** `prd-session-init-optimization.md` (produces content
  contributions via `notes-docs-content-sweep.md` staging file)
- **Does not block:** `plan-arcd-rebrand.md`, `plan-expanded-planning-path.md`,
  `plan-arc-modes.md`

## References

- `prd-arcd-docs-site.md` § Non-Goals (content rewrite out of scope)
- `prd-arcd-docs-site.md` Req 12 (rebrand branding sweep piggyback pattern)
- `prd-arcd-rebrand.md` § docs/ exception
- Pre-merge review for `technical/work-status-restructure` (2026-04-16) — original
  surfacing of the per-WU status file docs drift
- `prd-session-init-optimization.md` § Requirements P1.1–P1.3 (operational-context audit
  producing content contributions staged here)

## Document History

| Date       | Change                                                                                                |
|------------|-------------------------------------------------------------------------------------------------------|
| 2026-04-16 | Initial capture — seeded with per-WU status file model from Work-Status Restructure pre-merge         |
| 2026-04-17 | Added Content Contributions input type — accommodates Session-Init Optimization staging notes         |
| 2026-04-17 | Renamed plan file: methodology-sweep → content-sweep (scope broadened beyond methodology drift)       |
| 2026-04-22 | Added Session-Init Optimization Phase 3.R docs drift capture — public `docs/**` updates deferred here |

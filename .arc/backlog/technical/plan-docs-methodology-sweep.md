# Plan: Docs Site Methodology Sweep

**Purpose:** Post-docs-site-migration WU that propagates methodology model changes
accumulated since the content port into the public `docs/` site. Accumulation home for
docs-site methodology drift captured between now and WU activation.

**State:** Capture (accumulating items; PRD-drafted closer to activation)
**Created:** 2026-04-16
**Origin:** The Work-Status Restructure WU shipped the per-WU status file model to
`.arc/` and `packages/arc-framework/arc/` but did not update the adopter-facing content
at `docs/`. Pre-merge review surfaced ~15 touch points across 9 files still describing
the retired singular `WORK-STATUS.md` model. That propagation is the first known item
on this plan; additional items will accrete as further methodology changes land.

---

## Why a Dedicated Plan

The two adjacent docs-touching WUs don't absorb this work cleanly:

- **`prd-arcd-docs-site.md`** (mkdocs → Astro/Starlight migration) is explicitly
  *format migration, not content rewrite* (Non-Goals: "not a content-expansion pass",
  "not a content rewrite"). It carries one content-sweep hitchhiker — the rebrand
  branding sweep from `prd-arcd-rebrand.md` — because branding is mechanical
  find-replace that pairs cleanly with the per-file content port. Methodology model
  changes (conceptual, editorial, prose-level judgment per touch point) don't fit
  that rubric.
- **`prd-arcd-rebrand.md`** excepts `docs/**` from its content sweep Success Criteria
  and routes the branding sweep through the docs-site WU's content port. Scope stays
  on branding — not a general content-refresh vehicle.

The methodology-content-drift concern is also inherently ongoing: framework updates
between now and docs-site activation will generate additional drift. A dedicated
catch-all means drift gets tracked at capture time rather than being rediscovered
during an eventual sweep.

## Timing

**Activates after `prd-arcd-docs-site.md` merges.** Running before the Starlight
structure lands would burn effort on mkdocs prose that gets transformed (or deleted)
during the content port.

**Before public release.** The sweep must land before `plan-wu5-public-release.md`
activates — external readers arriving at a fresh docs site should not read a
methodology description that no longer matches the shipped framework.

## Items to Sweep

As methodology changes land that touch docs/ content, add entries here. Each entry
should capture: what changed, which files it affects, what kind of edit (mechanical
find-replace vs. conceptual rewrite), and any editorial nuance the sweep should
preserve.

### 1. Per-WU status file model (from Work-Status Restructure WU, 2026-04-16)

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

## Adding Items

When a methodology change lands in `.arc/` or `packages/arc-framework/arc/` that
affects user-facing conceptual content (not branding, not file names, not formatting
— actual model/behavior descriptions adopters rely on):

1. Confirm the change doesn't fit `prd-arcd-rebrand.md` scope (branding only) or
   `prd-arcd-docs-site.md` scope (format migration only)
2. Add a new numbered item under § Items to Sweep with the template shape: what
   changed / edit type / touch points / nuance
3. Update the plan's Document History

The plan remains in capture state until either (a) `prd-arcd-docs-site.md` is near
activation and sweep items have accumulated enough to PRD this WU, or (b) an
individual item is urgent enough to run as an atomic task list before the
consolidated sweep.

## Scope Boundaries

**In scope:**

- Conceptual/model changes in `.arc/` that affect user-facing prose in `docs/`
- Editorial judgment to keep public copy coherent for readers arriving fresh
- Historical notes where helpful; deletion where not

**Out of scope:**

- Brand identity changes (→ `prd-arcd-rebrand.md` / `prd-arcd-docs-site.md` § Req 12)
- File-format migration (→ `prd-arcd-docs-site.md`)
- New docs pages or structural reorganization of the docs tree (explicitly Non-Goal
  in the migration PRD; if needed, scope separately)
- Internal `.arc/` file drift (→ framework-sync integration test catches this)

## Dependencies

- **Upstream:** `prd-arcd-docs-site.md` (format migration must land first so sweep
  targets the Starlight structure)
- **Downstream:** `plan-wu5-public-release.md` (public release prereq)
- **Does not block:** `plan-arcd-rebrand.md`, `plan-session-init-optimization.md`,
  `plan-expanded-planning-path.md`, `plan-arc-modes.md`

## References

- `prd-arcd-docs-site.md` § Non-Goals (content rewrite out of scope)
- `prd-arcd-docs-site.md` Req 12 (rebrand branding sweep piggyback pattern)
- `prd-arcd-rebrand.md` § docs/ exception
- Pre-merge review for `technical/work-status-restructure` (2026-04-16) — original
  surfacing of the per-WU status file docs drift

## Document History

| Date       | Change                                                                                          |
|------------|-------------------------------------------------------------------------------------------------|
| 2026-04-16 | Initial capture — seeded with per-WU status file model from Work-Status Restructure pre-merge   |

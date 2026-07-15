# Draft: arc-view

- **Origin:** [internal] — minted from direct discussion (2026-07-14). Motivation: quick, zero-input terminal
  access to the active WU's task list for the *human* operator — no editor, no slug, no path.
- **Cohort:** [none]
- **Purpose:** An `arc view <artifact>` CLI verb that auto-resolves the current worktree/branch to the active
  WU's core artifacts and renders them in the terminal — a pager view for reading, and a live, debounced
  watch mode that follows the work as it progresses.

---

## Problem / Motivation

Agents get a codified strategic partial read of the active task list at session-init; the human operator has no
symmetric surface. Viewing the current task list today means opening an editor or hand-locating the file and
piping it through a renderer. The two things that earn a dedicated verb over `glow .arc/active/tasks-foo.md`:

- **Auto-resolve** — the current worktree/branch already determines the active WU and its task list; the user
  should supply zero input.
- **Live watch** — a debounced, re-rendering "follow the work" panel beside a running agent session, tracking
  checkbox progress as it lands.

## Core design positions (settled at mint)

1. **Oracle-resolved, never raw paths.** Resolution rides the same status-oracle chain session-init consumes
   (active-meta resolution → task-list path), including multiple-candidate handling. This is also the
   forward-compat position: the materialized-backing-store target (`strategy-storage-evolution.md`,
   `draft-arc-backend.md`) still materializes artifacts locally, so a viewer that resolves through the oracle is
   unaffected by the storage migration. Sanity-checked against the storage north star at mint; no new
   per-artifact config, no baked-in path assumptions.
2. **Two modes, split by job.** *Static:* the full artifact through a pager, git-idiom TTY handling — pager when
   interactive, plain stdout when piped (composes with `cli-substrate-adoption`'s uniform non-interactive
   contract rather than fighting it). *Watch:* a focused live panel — statusline + collapsed outline +
   current-task detail — re-rendered on file change at a reasonable debounce. Watch mode is explicitly **not** a
   scrollable document: render-only, no input handling. Pagers cannot re-render a changed pipe and
   glow/bat have no follow mode, so the panel reframe is both the cheap path and the better product.
3. **Cursor anchor is file-derived.** The deterministic first-open-checkbox cursor (the existing task-cursor
   mechanism) anchors both modes — open-at-current-task in static mode, focus selection in watch mode. No
   dependency on `session-locus-model` in core; anchoring to the *agent's* live position (locus records /
   compaction seed) is a recorded upgrade seam, not a foundation.
4. **Structure context via statusline + collapsed outline.** Two stacked idioms carry "where am I in the whole":
   a breadcrumb/counter band (test-runner idiom — `Phase 4/6 · Task 4.1 (subtask 2/5) · 23/61 overall`) and a
   folded outline body (code-folding idiom — every phase one line with its tally, current phase expanded to task
   level, current task in full detail). All counts derive from the same checkbox parse as the cursor; the
   codified task-list format (`strategy-task-list-formatting.md`) makes that parse reliable rather than
   heuristic. The band prepends in static mode too, so both modes share one metadata surface. In watch mode the
   tallies update live.
5. **Renderer resolution: detection + one user-scoped override.** Detection order (`glow` → `bat` → plain /
   `less -R`), overridable by a single user-scoped renderer setting. Renderer choice is personal taste, not
   project convention — user scope is settled. Interim home is git config (the existing user-scoped surface);
   explicit migration seam to `config-storage-architecture`, which owns user-scoped config's future substrate.
   No new `arc-config.yml` axis.

## Scope boundary

- **In:** the WU-doc family — `tasks` (primary), plus `spec` / `draft` / `meta` (same resolver, marginal cost).
  The value-add (zero-input auto-resolve from filesystem context) only exists for artifacts with a "current"
  resolvable from where you stand.
- **Out:** ROADMAP, `STATUS.USER`, inboxes, `RELEASE-GATES` verdict surfaces. Those are headed for the
  records/materialized model (`strategy-storage-evolution.md`, `local-mode`, `arc-backend`);
  `arc status --project` already renders the project view live (piping it to a pager is a one-liner, not a
  feature); `roadmap-tooling` owns the project-status render surface.

## Coordination seams

- `session-locus-model` — optional upgrade: anchor watch focus to the agent's live position instead of the
  file-derived cursor. Enhancement, never a core dependency.
- `cli-substrate-adoption` — the non-TTY behavior above should land as an instance of (not an exception to) the
  uniform non-interactive contract.
- `config-storage-architecture` — the renderer key migrates off git config when the user-scoped substrate ships.
- `roadmap-tooling` — explicit non-overlap: `arc view` never grows a project-status renderer.

## Scope estimate

Small–Medium (days). Largely composition: existing oracle resolution + checkbox parse, new rendering layer,
process spawn + file watching. `Class` likely `Light`; confirm at draft-design. The one scope risk is watch-mode
UX creep toward a TUI (scrolling, input, panes) — design position 2's render-only panel exists to cap it; hold
that line at grooming.

## Continuity

- **Readiness:** stub-shaped. Positions 1–5 are settled; open at grooming: watch-panel layout detail, debounce
  interval, renderer detection specifics, and whether `spec`/`draft`/`meta` land in v1 or fast-follow `tasks`.
- **Next:** activate via `init-work-unit` Path A → iterate via `arc-plan` → `draft-design`. First move: settle
  the watch-panel layout and renderer resolution order; validate the panel against a live agent session.

---

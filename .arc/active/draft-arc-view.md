# Draft: arc-view

- **Origin:** [internal] — minted from direct discussion (2026-07-14). Motivation: quick, zero-input terminal
  access to the active WU's core artifacts for the *human* operator — no editor, no slug, no path.
- **Cohort:** [none]
- **Purpose:** An `arc view <kind>` CLI verb that auto-resolves the current worktree/branch/identity context to
  the working set's artifacts and renders them in the terminal — a pager view for reading, rendered once, with a
  plain region output that composes with standard unix tooling for everything live.
- **Amended:** 2026-07-17 (storage-substrate grooming) — verb-semantics split: status/HUD surfaces (context
  card, live watch panel, live tallies) moved to the `status-hud` stub; this WU is artifact viewing only.
  2026-07-18 (draft-design grooming) — consolidated post-split; v1 kind set settled (WU group + cohort +
  identity-scoped surfaces + shared inbox), pass-through and canonical-doc extensions dispositioned,
  interim-liveness position settled (render-once contract + cursor-anchored region output).

---

## Problem / Motivation

Agents get a codified strategic partial read of the active task list at session-init; the human operator has no
symmetric surface. Viewing the current task list today means opening an editor or hand-locating the file and
piping it through a renderer. Under worktree parallelism that cost recurs constantly: the pre-parallelism
workspace (an editor pinned to inbox / roadmap / tasks) breaks — state forks per checkout, files reopen on every
swap — promoting zero-input, cwd-resolved terminal surfaces from convenience to load-bearing.

What earns a dedicated verb over `glow <path>` is **resolution**: the current worktree, branch, and identity
already determine the working set — the active WU's artifact group, its cohort doc, the operator's own notes and
inboxes — so the user supplies zero input. The sibling need (following the work live beside a running session,
and the at-a-glance context card) carries status/HUD semantics and lives in `status-hud`.

## Core design positions

1. **Oracle-resolved, never raw paths.** Every path the viewer touches comes from the resolver layer —
   the same status-oracle chain session-init's load set consumes (active-meta resolution → artifact paths,
   including multiple-candidate handling, identity scoping, and primary-vs-linked worktree resolution) — with
   zero path construction in the viewer itself. This is also the forward-compat position: artifacts materialize
   locally at every storage tier (`strategy-storage-evolution.md`, `draft-arc-backend.md`), so a resolver-backed
   viewer is invariant across the migration, including the per-user surfaces whose homes move (notes-family
   state absorbing into the backing store). Read-side only — no writes, no notes-specific machinery
   (stop-loss compliant). The kind-based interface doubles as rename insurance: kinds are semantic, not
   filenames, so a file re-home or rename lands with zero CLI contract change.

2. **Kind vocabulary — the resolved-not-known line.** The verb covers artifacts whose location must be
   *resolved* from live context, never artifacts whose location is merely *known* (fixed paths that shell
   completion or a two-line alias already serve). The inbox kind is scope-qualified: `arc view inbox` resolves
   the identity-scoped inbox; `--project` selects the shared one. The flag keeps the kind grammar regular, and
   the scope pair matches the live qualifier convention (`STATUS.USER` shipped). Deliberately no dotted kinds
   (`inbox.user` / `inbox.project`) until the `TYPE.QUALIFIER` rename cascade lands — then they arrive as
   aliases. New resolver-backed kinds (future identity-scoped surfaces) slot into the same registry as they
   land; the set is extensible without contract change. Bare `arc view` defaults to `tasks` — the primary kind;
   the zero-input ethos extends to the argument itself (help-by-default is dispatcher idiom, not leaf-verb
   idiom). Kind discoverability rides teaching outputs, never the default: `--help` carries the kind table, and
   the two error paths — unknown kind, and no resolvable WU context — list the valid kinds in the message.

3. **Render once and exit — static view, with an external-liveness bridge.** *TTY:* the full artifact through
   a pager, git-idiom handling. *Non-TTY:* plain stdout (an instance of, not an exception to,
   `cli-substrate-adoption`'s uniform non-interactive contract). The statusline band carries a rendered-at
   timestamp, so staleness is visible instead of silent; refresh is re-invocation — zero-input makes that an
   up-arrow away, a deliberate position rather than a gap. For volatile artifacts, a cursor-anchored **region
   output** (`--current`: the current-task section as plain stdout, bare — no band, so it composes under pipes
   and `watch` alike) lets standard unix tooling supply interim liveness — `watch -n2 arc view tasks --current` —
   with zero watch machinery here. A genuinely useful live
   panel intrinsically requires focus and curation (pagers cannot re-render a changed pipe; a naive full-doc
   re-render shows the wrong region of a long file) — that *is* the panel, and it is `status-hud`'s. Explicitly
   rejected here: any `--follow` / in-process watch mode. **Cap line: `arc view` renders once and exits — it
   never re-renders, never watches, never handles input.**

4. **Cursor anchor is file-derived.** The deterministic first-open-checkbox cursor (the existing task-cursor
   mechanism) drives open-at-current-task in pager mode and the `--current` region selection. No dependency on
   `session-locus-model` in core; anchoring to the *agent's* live position is a recorded upgrade seam, not a
   foundation. Failure behavior is degrade, never hard-fail: a malformed task list (the cursor's existing
   `malformed` state) renders bandless and unanchored with a one-line stderr warning — a viewer that errors on
   a malformed document blocks inspecting the very file that needs fixing. `--current` with no open task prints
   an explicit "no open task" line rather than empty output.

5. **Structure context via the statusline band (static arm).** A breadcrumb/counter band (test-runner idiom —
   `Phase 4/6 · Task 4.1 (subtask 2/5) · 23/61 overall` + rendered-at timestamp) prepends to the `tasks` kind's
   full render in both pager and plain modes — one metadata surface. Counts derive from the same checkbox parse
   as the cursor; the codified task-list format (`strategy-task-list-formatting.md`) makes that parse reliable
   rather than heuristic. Counters are `tasks`-specific: other kinds carry a one-line header (kind · WU ·
   rendered-at) instead. The static body is always the full artifact — the folded-outline body (every phase one
   line with its tally, current phase expanded) is the *panel's* rendering and lives in `status-hud` with the
   live tallies.

6. **Renderer resolution: detection + one user-scoped override.** Detection order (`glow` → `bat` → plain /
   `less -R`), overridable by a single user-scoped renderer setting. Renderer choice is personal taste, not
   project convention — user scope is settled. Interim home is git config (the existing user-scoped surface);
   explicit migration seam to `config-storage-architecture`, which owns user-scoped config's future substrate.
   No new `arc-config.yml` axis.

## Scope boundary

**In — the v1 kind set** (everything the resolver resolves from where you stand):

- **WU artifact group:** `tasks` (primary), `spec`, `draft`, `meta`, and `notes` (when present) — same
  resolver, marginal cost, all valuable.
- **`cohort`** — the active WU's `cohort-*.md` when it names one (the probe already resolves the path); a
  clear no-op message when the WU is standalone.
- **Identity-scoped surfaces:** `session-notes` (per-WU), `working-memory`, and `inbox` (`--project` for the
  shared inbox). These pass the resolution test emphatically — under linked-worktree operation they resolve to
  the *primary* checkout, exactly the path pain the motivation names. Status/HUD surfaces will *project* these
  documents (cards, summaries); viewing the document itself is the stable other half of that pair, not interim
  scaffolding.
- The shared inbox is the one kind that bends the resolved-not-known line today (a fixed tracked path). It
  earns inclusion anyway: operational working-set state mid-migration to the records/materialized model (the
  kind mapping is what keeps that re-home invisible), family symmetry with the user inbox, and the document is
  its own record surface — no live projection supersedes it.

**Out, with rationale:**

- **Arbitrary paths (pass-through).** Zero value over running the renderer directly; muddies the kind contract
  (argument becomes kind-or-path); bakes "the file is the surface" into the UX — the assumption the storage
  check-doc says not to accrete. The kind interface survives the substrate migration; a path interface is what
  would need migrating.
- **Canonical reference docs by name** (DEV-RULES, briefs, PROJECT-PRD, QUICK-REFERENCE, strategies). Fail the
  resolved-not-known test (fixed paths; completion / alias suffice), and that namespace is mid-rename
  (`naming-conventions`' `TYPE.QUALIFIER` cascade; the knowledge-architecture target dissolves the "strategy"
  category) — a name table now is churn bait. Strategies additionally open a fuzzy-match namespace (a doc
  browser — a different feature). Recorded as a deferred extension: revisit after those renames land.
- **ROADMAP / project-status surfaces.** A live projection already supersedes the file (`arc status --project`);
  `roadmap-tooling` owns the project-status render surface — explicit non-overlap: `arc view` never grows a
  project-status renderer. General rule: where a live projection command supersedes the document, the kind
  stays out; where the document is the record surface (inboxes, notes), it belongs in.
- **Live watch, follow, context card** — `status-hud` (see position 3's cap line).
- **TUI ambitions** (scrolling, input handling, panes) — render-only; the cap line holds the boundary.

## Coordination seams

- `status-hud` (provisional, split out 2026-07-17) — sibling chunk: context card + live watch panel
  (projections *about* the work). Shares this WU's oracle resolution, checkbox parse, and renderer
  infrastructure; the `--current` region output doubles as the interim liveness bridge and generates the
  v1 usage evidence its sequencing waits on. The folded-outline panel body, watch-focus, and live-tally arms
  live there.
- `session-locus-model` — optional upgrade: anchor the cursor to the agent's live position instead of the
  file-derived first-open-checkbox. Enhancement, never a core dependency.
- `cli-substrate-adoption` — the non-TTY behavior lands as an instance of the uniform non-interactive
  contract; the region output composes with it.
- `config-storage-architecture` — the renderer key migrates off git config when the user-scoped substrate
  ships.
- `naming-conventions` — kinds are semantic, not filenames; dotted-kind aliases may land with the
  `TYPE.QUALIFIER` cascade, never before.
- `operational-state-docs` / `shared-inbox-model` / `local-mode` — inbox and per-user-state homes migrate to
  the records/materialized substrate; resolver-backed kinds insulate the viewer; read-side only, no new notes
  machinery.
- `roadmap-tooling` — explicit non-overlap (above).

## Scope estimate

Small–Medium (days). Largely composition: existing oracle/resolver chain + checkbox parse; new rendering
layer, kind registry, pager spawn. `Class: Light` — confirmed at draft-design (2026-07-18): no derivation
authored beyond composed positions, no substantial grounding surface. Two scope risks, each with its recorded
guard: kind-set creep (the resolved-not-known line) and liveness creep (the render-once cap line).

## Continuity

- **Readiness:** formalization-ready. Settled this pass: v1 kind set, inbox disambiguation, interim-liveness
  position, pass-through / canonical-doc dispositions, storage forward-compat discipline for the identity-scoped
  kinds; adversarial pass 1 folded (static body is always the full artifact — the folded outline is the panel's,
  i.e. `status-hud`'s; band is `tasks`-specific with a one-line header elsewhere; `--current` emits a bare
  region; malformed parse degrades, never hard-fails; bare `arc view` defaults to `tasks`). Open (spec-time
  detail, not design): renderer detection specifics (probe commands / flags per renderer), band layout detail,
  exact flag spellings (`--project`, `--current`).
- **Next:** assess draft readiness → `create-spec`.

---

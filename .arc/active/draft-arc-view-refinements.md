# Draft: arc-view-refinements

- **Origin:** [internal] — in-practice use of the shipped `arc view` command surfaced friction and a set of
  bounded ergonomic improvements.
- **Purpose:** Refine `arc view` along seven concrete axes found by using it as a daily driver — resolution of
  forming/uncommitted artifacts, a smarter bare-verb default, light artifact metadata, a clock-format toggle,
  and three render-fidelity/anchoring polishes — without expanding the verb's read-only, oracle-resolved,
  render-once charter (`spec-arc-view.md`).

---

## Problem / Motivation

`arc view` works well overall, but sustained use exposed a cluster of small frictions. The sharpest is that a
document actively being *formed* — a task list mid-generation, a draft/spec being written — can read as absent,
which is exactly when you most want to glance at it. Bare `arc view` also hard-assumes `tasks`, so before a task
list exists you get an unhelpful result rather than the furthest artifact that *does*. The rest are polish: prose
artifacts carry no size signal, the timestamp is 24h-only, the open-at-cursor anchor sits flush against the task
with no top margin and gives no phase context at a phase's first task, and the glow render silently flattens
loose-list spacing that exists on disk.

None of these change what `arc view` *is* — they sharpen an existing, well-specced surface. The design charter
(read-only, oracle-resolved, render-once, kind→path indirection) is preserved throughout; several items are pure
renderer polish, and the two resolution changes stay on the oracle seam the shipped spec's Decision 1 established.

## The improvements

### 1. Forming/uncommitted artifacts read as "does not exist"

**Root cause (recorded so we don't re-chase git).** This is *not* a git tracking issue: the final existence
check is `fs.access` on the working tree (`view-artifact.ts`), so an uncommitted file on disk is already visible.
The absence comes from *resolution keying off the meta pointer, not disk*:

- Bare `arc view` = `tasks`, whose path derives from the meta's `**Task List:**` field. During task generation
  the `tasks-<name>.md` is written to disk first; the meta field is only repointed at the generation ceremony
  commit. Until then it reads `[none]`, `taskListPath` resolves null, and the viewer reports absent.
- A draft/spec being formed on a not-yet-started stub has no active meta in that worktree, so the WU-scoped
  resolver returns "No active work unit" — which reads like the file doesn't exist.

**Decision.** Resolve `tasks` by the same `<kind>-<name>.md`-adjacent-to-meta convention the other WU kinds
already use (`spec`/`draft`/`notes` at `view-artifact.ts`), and treat existence on that conventional path as
sufficient rather than requiring the meta's `**Task List:**` pointer. Prefer the meta pointer when it is present
*and* resolves to an existing file; fall back to the conventional path when the meta reads `[none]`. This closes
the task-generation window without touching meta-write timing (which is deliberately ceremony-bound).

### 2. Bare `arc view` resolves the furthest present artifact

**Decision.** The WU lifecycle is linear, so bare `arc view` should render the *furthest existing* artifact in
`tasks → spec → draft` order rather than always assuming `tasks`. Implement as an iteration over the existing
resolve-path-then-exist seam (same kind→path indirection + injected existence predicate), picking the furthest
that exists. Explicit `arc view <kind>` is unchanged — it still targets exactly that kind, and an absent kind
still renders its one-line "not present" message.

This subsumes point 1's fix: once resolution is existence-driven over the conventional paths, the
task-generation window and the "form the furthest thing that's there" case both resolve. Note the one contract
change: bare `arc view`'s meaning shifts from "tasks" to "furthest present" — record it in the spec.

### 3. Light metadata for draft/spec (and other prose kinds)

Today `tasks` carries the phase/task/overall counter band; every other kind carries a one-line header
(kind · WU · rendered-at). **Decision:** add **line count** to that one-line header for the non-`tasks` kinds —
a pure content property, trivially computed, storage-agnostic. Keep it to the one-line header; do not grow a
tasks-style band for prose. **Last-modified is deferred** (see Open items / Forward-compat): if it ever lands it
must use `fs` mtime, never `git log`.

### 4. 12-hour clock toggle

**Decision.** Add a user-scoped `arc.viewClock = 24h | 12h` git-config key (default `24h`), mirroring
`arc.viewRenderer` — same "personal taste, not project convention" rationale and the same interim git-config
home with a known migration seam to `config-storage-architecture`. The rendered-at stamp formats per the key.

**Dropped:** a date component (overkill — the stamp exists to show *within-day* staleness against your live
"now"; a render-once tool you refresh with the up-arrow does not span days) and any relative form
("3m ago" is incoherent for a tool that stamps at render time and exits — it would freeze at ~0m).

### 5. Anchor one line above the current task (top margin)

The open-at-cursor anchor is a line number handed to `less +<line>`. **Decision:** target `line − 1` — the
blank line the task-list format guarantees above each task — for a one-line top margin, which reads cleaner than
opening flush against the task. Lands on `bat`/`plain` (line-based `less +N`); on `glow` the anchor is a search
pattern with no source-line mapping, so this is a graceful no-op there (consistent with the shipped spec's known
glow-anchoring limitation).

### 6. First task of a phase → anchor to the phase heading

**Decision.** When the cursor's current leaf is the *first task entry of its phase*, anchor to the phase heading
(also minus one line, same top margin) rather than the task — surfacing the phase preamble as context exactly
when you're starting the phase. The checkbox parse already knows phase boundaries, so detection is cheap. Fires
only for a literal first-entry-of-phase; every other task anchors normally. Same `bat`/`plain`-vs-`glow` caveat
as point 5.

### 7. Loose-list blank lines collapse in the glow render

**Root cause.** `glow`'s renderer (glamour) flattens loose-list inter-item spacing when it re-renders markdown to
ANSI. It is *not* our preprocessing: `normalizeMarkdownSoftBreaks` in `view-renderer.ts` preserves blank lines
(it pushes the empty line and resets paragraph state) and only joins soft-wrapped continuation *within* an item.
`bat`/`plain` are unaffected — they display source / near-source, so on-disk blank lines survive; only the
markdown re-renderer collapses looseness.

**Leaning.** Investigate a custom glamour style (via glow's style config) that adds list-item margin, weighed
against the risk of over-spacing genuinely *tight* lists (glamour's tightness handling is the open question —
whether spacing can be applied to loose lists only, or only uniformly). If no acceptable style exists, accept it
as a `glow`-specific degrade — the same family as points 5/6, where glow's re-render diverges from source in
ways bat/plain don't. Resolved against the real binary during implementation.

### Cross-cutting: the glow-divergence theme

Points 5, 6, and 7 share a shape: `glow` re-renders markdown (pattern-anchoring, ANSI re-layout), so it diverges
from source where `bat`/`plain` do not. Each lands fully on `bat`/`plain` and degrades gracefully on `glow`.
Worth stating once in the spec as a consequence rather than three times — it extends the shipped spec's existing
glow-anchoring open item.

## Forward-compatibility (storage-evolution check)

Ran the `strategy-storage-evolution.md` Self-Check, since points 1–3 touch where/how artifacts are discovered.
Verdict: **composes with the materialized-git-backing-store target; low risk.** Two structural facts insulate
the verb — it is **read-only** (Principles 3/4/7–9 on writes and axes don't apply) and **oracle-resolved**
(Decision 1 is already Principle 1: workflows ask for paths, the storage layer provides them). Two guardrails
carry into implementation:

- **Furthest-present resolution stays on the oracle seam.** Iterate the existing kind→path convention +
  injected `pathExists`; **never a raw `readdir` of `.arc/active/`** (Principle 1's named anti-pattern — bakes in
  tracked-tree layout). Resolving `tasks-<name>.md` by convention is consistent with how `spec`/`draft`/`notes`
  already resolve, and a materialized store swaps it at one site.
- **Any last-modified uses `fs` mtime, never `git log -1 -- <path>`.** The latter is Principle 1's explicit
  anti-pattern and breaks in the Local/Shared tiers where `.arc/` is gitignored in the code repo (history lives
  in the backing store). `fs` mtime works across tiers (the file materializes locally everywhere), at the cost
  of checkout-reset lossiness in-repo — which is a further reason to lean toward deferring last-modified.

The `arc.viewClock` key inherits the same git-config → `config-storage-architecture` migration seam already
recorded for `arc.viewRenderer`; no new storage assumption.

## Alternatives

- **Point 1/2 — resolve by disk scan vs. oracle seam.** A `readdir('.arc/active/')` scan would discover
  artifacts too, but bakes in tracked-tree file layout (rejected — violates the storage forward-compat
  discipline). The oracle-seam iteration achieves the same result while staying substrate-swappable.
- **Point 1 — fix the meta-pointer lag instead.** Repointing the meta's `**Task List:**` earlier during
  generation would also close the window, but meta-write timing is deliberately ceremony-bound; the viewer-side
  fix is the correct layer and doesn't perturb that contract.
- **Point 3 — last-modified via git log.** More accurate in-repo, but couples to tracked storage (rejected on
  forward-compat) and offers little over line count for the daily use case.
- **Point 4 — a project-level clock setting.** Clock format is personal taste, so it belongs in the user-scoped
  surface next to `arc.viewRenderer`, not `arc-config.yml`.

## Unknowns and Assumptions

- **Glamour list-item spacing (point 7)** — whether a custom glow style can restore loose-list spacing without
  over-spacing tight lists. Resolved against the real binary; may end as an accepted glow degrade.
- **Furthest-present edge (points 1/2)** — behavior when the meta points at a *different* task list than the
  conventional filename (rare). Assumption: prefer the meta pointer when it resolves to an existing file, else
  the conventional path.
- **Last-modified value (point 3)** — assumed deferred; if pulled in, mtime is the only forward-compat-safe
  source, with in-repo checkout-reset lossiness accepted.
- **Anchoring on glow (points 5/6)** — assumed graceful no-op, not a regression; confirm the pattern-anchor path
  is unaffected by the `line − 1` / phase-heading targeting.

## Scope Estimate

**Small (hours–days); Class `Light`.** Bounded surface: `commands/view.ts` (band/anchor/metadata/clock),
`view-artifact.ts` (resolution for points 1/2), `view-renderer.ts` (glow style for point 7), one new user-scoped
git-config key. No new concepts; determinate improvements to an existing, well-specced command. Reuses the
existing oracle-resolution and checkbox-parse infrastructure.

**Dependencies:** none. Follow-on to the shipped `arc view` (`spec-arc-view.md`); shares no gate with in-flight
work.

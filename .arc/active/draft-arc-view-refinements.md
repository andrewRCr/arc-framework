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
  current-context resolver has no target. The artifact exists and the backlog resolver can find it by slug, but
  bare `arc view` has no honest ambient slug under partial protection, where grooming occurs directly on base.

**Decision.** Resolve `tasks` by the same `<kind>-<name>.md`-adjacent-to-meta convention the other WU kinds
already use (`spec`/`draft`/`notes` at `view-artifact.ts`), and treat existence on that conventional path as
sufficient rather than requiring the meta's `**Task List:**` pointer. Prefer the meta pointer when it is present
*and* resolves to an existing file; fall back to the conventional path when the meta reads `[none]`. This closes
the task-generation window without touching meta-write timing (which is deliberately ceremony-bound).

Add `--for <slug>` as explicit semantic target injection for bare or explicit WU-scoped views. Its reading is
“view this work unit's artifact group instead of the ambient WU context”: it changes the WU target, not the
artifact-kind selection rule. Thus `arc view --for foo` renders `foo`'s furthest present artifact, while
`arc view spec --for foo` renders exactly `foo`'s spec. An explicit target wins over ambient context.

The eligible lifecycle domain is deliberately planning/live only: `backlog/provisional`, `backlog/planned`, and
`active`. Resolve the slug through the shared lifecycle authority, then locate that eligible artifact group in
the current checkout; never accept a path or inspect another worktree directly. An unknown slug returns an
unknown-target error. A known eligible target whose artifact group is not materialized here returns a
target-unavailable error. A completed slug returns a distinct unsupported-lifecycle error — completed viewing is
not implied by this grooming/active-context fix, because archived cohort documents have different sidecar
semantics. No explicit-target failure may fall back to the ambient WU. Reject `--for` with identity-global kinds
(`working-memory`, `inbox`) and `inbox --project`, where a WU target has no meaning.

### 2. Bare `arc view` resolves the furthest present artifact

**Decision.** The WU lifecycle is linear, so every resolved artifact group has one default chain:
`meta → draft → spec → tasks`. Bare `arc view` selects the furthest existing member by checking
`tasks → spec → draft → meta`; the meta is the guaranteed base, so a valid active-WU or `--for` target always
renders something useful. Implement the selection as an iteration over the existing resolve-path-then-exist seam
(same kind→path indirection + injected existence predicate). Explicit `arc view <kind>` is unchanged — it still
targets exactly that kind, and an absent explicit kind still renders its one-line "not present" message.

This subsumes point 1's fix: once resolution is existence-driven over the conventional paths, the
task-generation window and the "form the furthest thing that's there" case both resolve. `arc view --current`
without a kind remains task-specific shorthand: it forces `tasks`, bypasses furthest-present selection, and keeps
the existing task-absence behavior. The contract change is therefore bounded to bare view without `--current`.

### 3. Light metadata for draft/spec (and other prose kinds)

Today `tasks` carries the phase/task/overall counter band; every other kind carries a one-line header
(kind · WU · rendered-at). **Decision:** add **line count** to that one-line header for the non-`tasks` kinds —
a pure content property, trivially computed, storage-agnostic. Keep it to the one-line header; do not grow a
tasks-style band for prose. **Last-modified is deferred** (see Unknowns / Forward-compatibility): if it ever lands it
must use `fs` mtime, never `git log`.

Count logical source lines: an empty file is `0 lines`; a terminal newline closes the final line and does not add
a phantom one; CRLF is one separator. Render the singular as `1 line`, otherwise `{N} lines`, in the existing
header before the rendered-at stamp.

### 4. 12-hour clock toggle

**Decision.** Add a user-scoped `arc.viewClock = 24h | 12h` git-config key (default `24h`), mirroring
`arc.viewRenderer` — same "personal taste, not project convention" rationale and the same interim git-config
home with a known migration seam to `config-storage-architecture`. The rendered-at stamp formats per the key:
`24h` remains zero-padded `09:05`; `12h` is locale-independent, hour-unpadded `9:05 AM` / `9:05 PM`, with noon
and midnight rendered as `12:xx PM` / `12:xx AM`.

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

**Decision.** When `cursor.section` — the current parent-task section — is the first parent task of its phase,
anchor to the phase heading (also minus one line, same top margin) rather than the task. This keeps the phase
preamble visible throughout work on that first parent, even when `cursor.leaf` has advanced to a later subtask.
Every later parent task anchors normally. The checkbox parse already carries the section/leaf distinction and
phase boundaries, so detection is cheap. Same `bat`/`plain`-vs-`glow` caveat as point 5.

### 7. Loose-list blank lines collapse in the glow render

**Root cause.** `glow`'s renderer (glamour) flattens loose-list inter-item spacing when it re-renders markdown to
ANSI. It is *not* our preprocessing: `normalizeMarkdownSoftBreaks` in `view-renderer.ts` preserves blank lines
(it pushes the empty line and resets paragraph state) and only joins soft-wrapped continuation *within* an item.
`bat`/`plain` are unaffected — they display source / near-source, so on-disk blank lines survive; only the
markdown re-renderer collapses looseness.

**Research result.** Goldmark retains the CommonMark tight/loose distinction as `List.IsTight`, but Glamour does
not read it: direct paragraphs inside list items are flattened, every sibling item receives the same hard-coded
newline, and the style schema has no tight/loose selector. A custom style can alter markers, indentation, or the
whole list's margin, but cannot restore loose-only inter-item spacing. Forking Glamour is disproportionate.

**Decision.** Add a conservative, Glow-only transient adapter before handing Markdown to the renderer. At a
provable boundary where a blank source line separates sibling list items, insert an invisible HTML comment at
the list-container indentation; Glamour sanitizes the comment while its separate-list block spacing restores the
blank display row. Tight lists receive no marker. For ordered lists, materialize the computed ordinal in the
transient copy before splitting so lazy repeated markers (`1.`, `1.`) still render as `1.`, `2.`. The source and
the `bat`/`plain` paths remain untouched.

The adapter is deliberately conservative rather than a second Markdown parser: reuse the existing fence,
blockquote, and list-prefix awareness in `view-renderer.ts`, and transform only a sibling boundary the state
machine can prove. Ambiguous structures remain compact under Glow — a safe false negative — rather than risking
a semantic rewrite. Guard the contract with top-level and nested unordered, ordered, task-list, blockquote,
multi-block-item, fence, and tight-list cases against the transient input, plus a real-Glow behavior probe where
the binary is available.

### Cross-cutting: the glow-divergence theme

Points 5, 6, and 7 share a shape: `glow` re-renders markdown (pattern-anchoring, ANSI re-layout), so it diverges
from source where `bat`/`plain` do not. Points 5/6 degrade gracefully on Glow; point 7 restores fidelity at
provable boundaries and degrades only where the adapter cannot prove the source structure. State the renderer
divergence once in the spec as a consequence rather than three times — it extends the shipped spec's existing
glow-anchoring open item.

### Cross-cutting: explicit target now, ambient groom target later

Target precedence is `explicit --for → active worktree WU → recorded groom locus`. This WU ships the explicit
target and current-active arms with no dependency on `session-locus-model`; until that WU lands, a pre-start
grooming session names its stub with `--for`. `session-locus-model` already owns groom roles and identities. When
its typed reader exposes the current checkout's groom subject, `arc view` may consume that shared resolver to make
bare view zero-input during grooming. It must never read raw locus records or parse `arc locus` output. The
grooming-locus record and reader remain owned by `session-locus-model`; this WU owns only the viewer-side consumer
seam.

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
- **Point 1/2 — infer a groom target from branch or dirty files.** Rejected: `chore/groom-*` exists only under
  full protection, while partial protection grooms on base; dirty-file or newest-artifact inference is ambiguous
  and couples resolution to tracked storage. Explicit `--for` is deterministic now, and the recorded groom locus
  is the honest future ambient source.
- **Point 1/2 — make `--for` lifecycle-complete now.** Rejected for this WU: completed meta/spec/tasks groups are
  locatable, but a completed cohort's coordinating document may have moved into a separate closeout sidecar.
  Archive viewing deserves its own semantic contract rather than an accidental consequence of explicit targeting;
  capture it as a provisional follow-up.
- **Point 3 — last-modified via git log.** More accurate in-repo, but couples to tracked storage (rejected on
  forward-compat) and offers little over line count for the daily use case.
- **Point 4 — a project-level clock setting.** Clock format is personal taste, so it belongs in the user-scoped
  surface next to `arc.viewRenderer`, not `arc-config.yml`.
- **Point 7 — custom Glamour style.** Rejected: Glow accepts a full style file, but Glamour exposes no
  tight/loose selector or per-item vertical-spacing property. A global marker prefix would over-space tight lists
  and replace the user's chosen theme.
- **Point 7 — Glamour fork or full Markdown parser.** Rejected as disproportionate. The renderer-level fix belongs
  upstream; locally, a second parser adds dependency and reserialization cost for a boundary the existing
  Glow-only state machine can recognize conservatively.

## Unknowns and Assumptions

- **Glow loose-list adapter (point 7)** — assumes Glow continues sanitizing HTML comments while retaining
  inter-list block spacing. Unit tests pin the transient Markdown contract; an available-binary probe pins the
  renderer behavior. If Glow changes, disable the adapter rather than broadening it into ANSI postprocessing.
- **Task-pointer divergence (points 1/2)** — when the meta points at a *different* task list than the conventional
  filename (rare), prefer the pointer when it resolves to an existing file; otherwise use the conventional path.
- **Last-modified value (point 3)** — assumed deferred; if pulled in, mtime is the only forward-compat-safe
  source, with in-repo checkout-reset lossiness accepted.
- **Anchoring on glow (points 5/6)** — assumed graceful no-op, not a regression; confirm the pattern-anchor path
  is unaffected by the `line − 1` / phase-heading targeting.

## Scope Estimate

**Small execution size (hours–days); Class `Heavy`.** The implementation surface remains bounded:
`commands/view.ts` (band/anchor/metadata/clock), `view-artifact.ts` (resolution plus explicit target injection for
points 1/2), `view-renderer.ts` (Glow-only loose-list adapter for point 7), and one new user-scoped git-config key.
But the realized design authored a public target-selection contract, lifecycle-domain boundary, future locus seam,
and renderer-fidelity strategy with researched alternatives and explicit failure policy; that crosses the Heavy
derivation floor regardless of code size. No new parser or durable-locus machinery; reuse the lifecycle/backlog
and active artifact-group authorities, checkbox parse, and Markdown boundary infrastructure.

**Dependencies:** none. Follow-on to the shipped `arc view` (`spec-arc-view.md`); shares no gate with in-flight
work.

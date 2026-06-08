# Notes: Scalable Authoring Pipeline

> Internal working notes for this WU. Phase 5.R working artifact — the family structural convention the three
> authoring-stage workflows (`draft-design.md`, `1_create-spec.md`, `2_generate-tasks.md`) are refactored toward.
> 5.R.1 settles + applies the spine; 5.R.2 / 5.R.4 / 5.R.5 execute against it.

## Phase 5.R — Family structural convention

Bounded by spec § SC15: **no file rename/renumber, no new design.** This convention *surfaces and unifies
structure that already exists*; it never changes behavior. Re-entry-valve semantics are frozen (settled in
Phase 5) — they get a structural home here, not a redesign.

### Terminology — `path` is the settled term

The depth-selected alternative block is a **`path`** — corpus-wide, across all three workflows and this note.
`draft-design` and the SAP spec already settled on `path` ("each level maps to a path — the drafting procedure at
that depth"); the competing terms are strays to retire:

- **`lane`** — stray in `draft-design` (~L100, "the `low` and `medium` lanes") and `2_generate-tasks` ("no phantom
  lane"). Retire from workflow prose. *Reserved* as candidate jargon for the `composable-workflows`
  structural-extraction view (`path` = the route you run; `lane` = the parallel extractable block) — a distinction
  to draw in that WU if it earns its keep, never sprinkled here. A coherence phase does not bless
  interchangeable-by-context.
- **`(depth) variant`** — `2_generate-tasks`' inline `**Depth variant:**` marker. This is the *inline sprinkle*
  5.R.2 replaces with whole blocks; the term retires with it. Don't promote `variant` to the whole-block name.

`pass` is **not** a synonym for `path` — it is a distinct taxonomy term (a repeated sweep; see below).

### Heading taxonomy

The categories every part of these workflows falls into (replaces ad-hoc Step / Pass / Entry / variant mixing):

- **Resolve depth & Class** — the entry resolution. One evidence read → planning-depth level + `Class`. Heading is
  **`## Resolve depth & Class`, identical across all three** (a stable key-like anchor for the shared fragment);
  the axis lives in the body's first line, not the heading. *Not* `Step 1` (it parameterizes the body, it isn't the
  body's first action) and *not* "entry gate" (`gate` is interlock vocabulary — avoid the collision). The shared
  "one read drives both methods" block goes **minimal-inline + the method body (`resolve-planning-depth` /
  `classify-work-unit`) as source of truth** — keep only the stage-specific bits (which axis, what the read
  inspects, what the level drives here). This is the 5.R.1 DRY target.
- **Step** — a linear sequential action. The default. Flat top-level steps (a bare sequence counter) are
  **de-numbered to named sections**; hierarchical **pass-scoped** sub-steps keep their `N.M` numbering
  (`generate-tasks` Pass `N` → Steps `N.1`, `N.2`) — the ordinal encodes the Pass grouping and within-pass
  sequence, and is referenced intra-file only.
- **Pass** — a repeated sweep over the same artifact. Used only where the workflow genuinely re-traverses
  (`generate-tasks`). Not a synonym for Step.
- **Path** — a depth-selected whole-block alternative (`low` / `medium` / `high`; `brief` / `outline` /
  `detailed`). Parallel across workflows; each path encodes its loop-shape choice (see envelope). 5.R.2 converted
  `generate-tasks`' inline sprinkle to these whole blocks (depth-spine — see § 5.R.2 resolution).
- **Finalize** — the terminal persist + commit ceremony. *Named*, never `Step 4` / `Step 6`. Parallel across all
  three (`draft-design` Capture, `create-spec` Finalize, `generate-tasks` pre-save + commit).
- **Next Step** — transition to the next stage (all three already have it).
- **Interlock markers** stay embedded gates (per `strategy-workflow-authoring`) — never numbered steps.

**Identical spine, varied body.** Only the spine headers are identical key-like anchors across all three:
**`Resolve depth & Class`** and **`Next Step`**. The terminal ceremony keeps a *descriptive* per-workflow name (it
names a real, different deliverable — `Capture the draft` / `Finalize` / pre-save + commit), and the body sections
(`Draft …`, discovery, Passes) are descriptive and vary by workflow. Don't force body or terminal headings to match.

**Fold thin transition sections.** A standalone section that only restates what the method or `Next Step` already
owns doesn't earn an H2 — fold its one load-bearing clause into `Next Step` (or the adjacent step). (`draft-design`'s
`Feed the spec form forward` folded into `Next Step`: the draft's *shape*, not a depth value, carries forward.)

Structural fixes this implies:

- **Drop the `## Process` wrapper** in `generate-tasks` — it is the only one with a container, and it forces every
  child a level deeper (`#### Step N.M`). Removing it lets Passes be `##` and their steps `###`, matching the other
  two. This is the single biggest reason the three don't read as one family.
- **`Step 4`-among-Passes → `Finalize`** in `generate-tasks` — today it is a Step-labeled sibling of the Passes;
  pull it out as the terminal ceremony, outside the Pass numbering.

### Body envelope — the loop, made explicit

Non-light paths share one shape: **Resolve → Setup → Iterate → Finalize → Next Step.**

- **Setup (pre-loop)** — frame the artifact, seed the first iteration (read prior draft / spec, gather initial
  context). May include pre-loop *gates* (e.g. `create-spec`'s alignment checks, which run before the write).
- **Iterate (the loop)** — the explicit iterative core, with a stated **exit condition** and a **re-entry
  back-edge**. Two flavors — kept distinct, not forced into one vocabulary:
    - **Convergence loop** — collaborative, open-ended, iterate-until-a-readiness-bar. `draft-design` `high`
      (Start → Gather → Facilitate → Re-synthesize → Amend, loop until *formalization-ready*); `create-spec`
      `detailed` (discover → write → iterate until spec-grade). `draft-design` `high` already carries this as an
      explicit numbered loop — the model.
    - **Sweep loop** — fixed / bounded passes, each producing a review deliverable; exit when passes complete.
      `generate-tasks` (Pass 1 → 2 → 3; Pass 3 nests a per-phase audit / revise loop).
    - **Re-entry valve = the loop's floor-raising back-edge.** When iteration surfaces that the resolved level was
      too low, exit-and-re-enter at Resolve (per `resolve-planning-depth` § Mid-stage re-entry). Give it a
      structural home *inside* the loop — not a trailing footnote (today: a `draft-design` Step-4 aside, a
      `create-spec` Step-2 aside). Surfacing the settled Phase-5 semantics structurally — **not** redesigning them.
- **Light paths have no loop** — `low` / `brief`: Resolve → confirm → Finalize. The path *is* the loop-shape
  choice; this is why paths are whole blocks (5.R.2). Taxonomy and envelope are one structure viewed two ways.

### Per-workflow application

- **`draft-design`** — **done** (proves the convention). Entry heading → `Resolve depth & Class` + entry-block
  DRY'd to method-delegated minimal-inline; body de-numbered to named sections; `Capture the draft` kept
  (descriptive terminal); re-entry valve framed as the loop's back-edge; `Feed the spec form forward` folded into
  `Next Step`; `low` → `(no draft artifact)`; stray `lane` → `path`. The `high` path's explicit numbered loop is
  the convergence-loop model the others mirror.
- **`generate-tasks`** — **done** (templated source: `2_generate-tasks.template.md` → rendered `.arc/` copy with
  the `team.mode` blocks stripped). Dropped `## Process` (preamble → intro); `Entry step` → `## Resolve depth &
  Class` (DRY'd); `### Pass N` → `##` and `#### Step N.M` → `###`; `### Step 4` → `## Finalize the task list`
  (descriptive terminal) with internal `Step 4` refs reflowed; re-entry valve framed as the back-edge; stray
  `lane` → `path`. Citations updated (below).
- **`create-spec`** — **done**; envelope relabeling, not resequencing (its real sequence already matched:
  discover → alignment *gates* → write + iterate → finalize). `Step 1` → `## Resolve depth & Class` (DRY'd, with
  the form-mapping kept inline); body de-numbered to named sections (`Conduct discovery` / `PROJECT-PRD alignment
  check` / `TECHNICAL-OVERVIEW alignment check` / `Write and save the spec` / `Finalize …`); all 8 internal `Step N`
  cross-refs reflowed to named anchors. Alignment-check behavior left as-is (pre-write gates).

### Scope split

- **5.R.1** — settle this convention (this note) + apply: Resolve-unification, entry-block DRY, and the
  unambiguous structural fixes (drop `## Process`, `Step 4` → `Finalize`, terminology → `path`, citation updates).
- **5.R.2** — **done.** Paths → whole extractable blocks. `draft-design` / `create-spec` already complied; the
  conversion target was `generate-tasks`, resolved **depth-spine (shape D)** — see § 5.R.2 resolution below.
- **5.R.4 / 5.R.5** — legacy-prose polish / reflow to the ~110-char deep-indent target.

### 5.R.2 resolution — `generate-tasks` depth-spine (executed)

`generate-tasks` was the lone non-compliant surface (the other two already use whole-block paths). Resolved
**depth-spine (shape D)**: the depth `### low` / `### medium` / `### high` blocks under `## Generate in the
resolved level` are the spine and the **execution driver**; the three Passes demote to a shared, depth-agnostic,
stopless **procedure library** (`## Structural decomposition` / `## Content fill` / `## Grounding audit &
coherent revision`) the paths invoke by name. Mirrors the siblings' depth-as-spine shape.

Key cut — **de-conflate `Pass`**: "Pass" stops naming a procedure and becomes purely the **review increment** the
paths own (which procedures group into which pass, and where the inter-pass stops fall). Procedure-identity is
invariant and stopless; increment-cadence is depth-selected. So the inter-pass stops (skeleton / draft) live in
the paths; the grounding audit's per-phase confirm gate stays in its procedure (depth-invariant — fires per
substantive phase at every level). Intra-procedure parameters (phase count, audit depth) stay inline.

Hardening (from an execution-time fresh-eyes read): the paths preamble states the procedures are reference detail
the path invokes, not a standalone linear sequence; each non-terminal procedure ends with a depth-agnostic
**pass-boundary reminder** ("if your path places a stop after this procedure, stop and surface now") so an agent
can't sail past a `high` / `medium` review stop that lives up in the path.

Routed the structural finding to `composable-workflows` (`USER-INBOX § Backlog`): procedure-fragments + thin
orchestration-fragments as a second composition shape for that WU's core/fragment boundary.

### Cross-reference blast radius (live corpus)

Heading renames touch a small, concentrated set — recorded so the edits don't miss them. (SC15's "don't rewrite
cross-references" is the *file-prefix* cascade — `doc-cascade-sweep`'s; these internal-heading citations are
in-scope consequences of in-scope restructure, and naming an anchor is *more* stable than the ordinal it replaces.)

- `generate-tasks` `§ Step 4` → `§ Finalize the task list` — **done**: `STRATEGY-INDEX.md`,
  `strategy-task-list-formatting.md`, `template-tasks.md` (two-copy each), and `analysis-cross-cutting-dependencies.md`
  (single). (`strategy-task-list-formatting.md`'s other `generate-tasks` ref is a filename link — heading-agnostic,
  untouched.)
- `generate-tasks` `Pass 3` → grounding-audit procedure (5.R.2 de-conflated `Pass`): `arc-task-audit/SKILL.md`'s
  "invoked by … Pass 3" reworded to "… grounding-audit procedure" (two-copy) — now correct at every depth, not
  just `high`.
- `create-spec` `Step 1` → `§ Resolve depth & Class` — **done**: `drain-inbox.md:131` (two-copy).
- Filename links elsewhere (methods, strategies, templates, `session-init`) are heading-agnostic — untouched.

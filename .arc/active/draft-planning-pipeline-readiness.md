# Draft: Planning-Pipeline Readiness

- **Origin:** [internal]
- **Purpose:** Make the **planning-pipeline readiness surface** coherent — the `draft-design` → `create-spec`
  entry gates and the stage-pointer machinery that tracks where a WU sits in the planning progression. After the
  2026-06-17 scope-split, the spine is three coupled design sections sharing one seam — *when is a draft
  formalization-ready, who decides, and where does the stage pointer live?*: (A) a single shared
  `assess-draft-readiness` judgment, (B) the `create-spec` review/proceed interlock split, and (C) the
  planning-stage-pointer mechanics (a code-owned `Current Workflow` field + event-driven `Design`), into which the
  `init-work-unit` readiness-pointer fix folds. The readiness call lands in the consuming session against the
  draft's actual state, never pre-judged by a mechanical upstream step. The iteration-*content* concerns
  (buffer-drain ceremony, depth-aware navigation, oversized-increment audit) split to `planning-iteration-mechanics`;
  the cold-start init cleanup to `cold-start-init-polish`.

---

## Problem / Motivation

The readiness judgment ("is this draft ready to formalize into a spec?") is currently **duplicated, mis-placed,
and under-gated** across the planning pipeline:

- It is re-implemented in two places (`draft-design` owns the maturity ladder + formalization-ready bar;
  `create-spec` re-implements a lighter entry backstop and separately owns the inbound-buffer drain).
- `init-work-unit` pre-judges it mechanically, writing a `Next Action` pointer that often lies about where the
  work actually is.
- `create-spec` Finalize collapses spec-review and proceed-to-finalize into a single interlock, leaving no clean
  gate for a full spec read or iteration.
- session-init **prose-parses** the planning sub-stage from the free-form `Next Action` (there is no code-owned
  stage pointer), so the pointer is overloaded and the sub-stage isn't deterministically resolved.

These were separate captures; the 2026-06-17 scope-split narrowed this WU to the readiness / stage-pointer
**spine** — routing the iteration-content concerns to `planning-iteration-mechanics` and the cold-start-init
cleanup to `cold-start-init-polish` — so a single iteration can cut the spine coherently rather than patching
each in isolation.

## Scope Estimate

Large (week+) — load-bearing planning-workflow design touching `draft-design.md`, `create-spec.md`, and
`init-work-unit.md` across both the package source and the `.arc/` copy, plus a new shared `assess-draft-readiness`
method and the planning-stage-pointer mechanics. The mechanics carry the heaviest surface: a code-owned
`Current Workflow` field, event-driven `Design`, the planning sub-stages made **CLI-recognized events** (in scope —
see § C), and session-init sub-stage resolution, all building on `lifecycle-transition-core`'s executor encoding
pattern. The *direction* on every arm is settled here; what defers to create-spec is the **precise cut** — chiefly
how many planning-stage events the executor wires and at which edges (§ C Open).

---

## Design

Three sections, one shared seam. Each settles its direction here and names what create-spec sharpens.

### A. Shared `assess-draft-readiness` formalization-ready method

**The concern.** The "is this draft formalization-ready?" judgment is duplicated: `draft-design` owns the
`fresh / rough / maturing / formalization-ready` ladder + the formalization-ready bar, while `create-spec`
re-implements a lighter version as an entry backstop and separately owns the inbound-buffer drain. Two
implementations of one judgment drift.

**Direction.** Extract one method — the formalization-ready bar (all settle-able design settled + a stateable
success signal) AND inbound-buffer-drained AND no-open-settle-able-design — consumed at two live fire points:
`draft-design` loop-exit and `create-spec` entry. This consolidates the check and gives the readiness criterion a
single home. You point a `Next Action` at a skill/workflow, not a method, so the method is **conductor-independent**
— the readiness *owner* the consuming session runs is `arc-plan` → `draft-design`.

**The buffer-drain seam (settled).** The method only ever **checks**. "The draft carries no un-integrated
`## Inbound Buffer — Pending Integration` section" is one criterion of the formalization-ready bar, evaluated at
both fire points; the method never performs the integration. The drain **act** is never PPR's, at any fire point —
the first-class mandatory draft-design drain step (the "ceiling") is `planning-iteration-mechanics`' Concern 1,
superseding today's minimal `create-spec` inline hook (the "floor"). Until that ships, the floor remains the
drain's working home. The interim is coherent, not a gap: routing iteration through `draft-design` (§ C) means
`assess-draft-readiness` fires *earlier* (draft-design loop-exit) than the drain's current home (create-spec entry),
so an undrained buffer simply yields a correct *not-ready* verdict — the planner drains inline (prompted by that
verdict, using the floor's guidance) before declaring ready, with the create-spec hook as backstop. **No homeless
drain; no hard dependency edge in either direction** — `planning-iteration-mechanics`' own draft confirms the seam
is "a contract, not a gate."

- **Open (create-spec):** the method's physical home + the exact invocation shape at the two fire points (what
  draft-design loop-exit vs. create-spec entry each pass in). Detail-design, not direction.

### B. `create-spec` review/proceed interlock split + overlay-recommendation convention

**The concern.** `create-spec.md` Finalize collapses spec-review / iteration approval and proceed-to-finalize
approval (draft retirement + meta update + commit) into one `workflow-interlock`. In practice, answering a
Novel-overlay ADR scope question read as authorization to finish Finalize, leaving no clean gate for a full spec
read, feedback, or iteration. Separately: accept-or-decline overlay prompts (including the Novel ADR companion)
present a fork without the agent's judgment.

**Direction — the concern splits by tier, for one DRY reason.**

- **Interlock split → `create-spec.md` (the workflow).** Finalize's single gate becomes two: *review / iterate*,
  then *proceed-to-finalize*. An interlock is workflow control flow; a shared method carrying create-spec's
  specific two-gate structure would be *less* reusable, so this stays in the workflow body — methods don't own
  interlocks.
- **Recommend-on-overlay-prompts → a behavioral norm in `DEV-RULES.ARC`.** Candidate phrasing: *"When surfacing
  an advisory accept/decline (or either-or) fork — not a mandatory approval gate — state the recommended option
  with a one-line rationale; never a bare fork."* The advisory overlays are scattered across four sites in two
  tiers — `create-spec.md` (the ADR companion), `draft-design.md` (the Novel overlay), `resolve-planning-depth`
  (depth re-entry), `spec-review` (findings) — with **no single owning method**. That is the signal it is a
  *behavior*, not a *procedure*: a method (per `composable-workflows`, "a procedure with a contract") needs an
  owner and an invocation point; an ambient norm has neither. So it lands as a short always-on rule in
  `DEV-RULES.ARC` — operational context, loaded every session (unlike a strategy, which is authoring-time
  reference) — where being ambient it covers all four sites at once. **Authoring constraints:** the phrasing must
  generalize to *every* advisory fork (not Novel-/planning-specific) and stay token-tight, since it is always
  loaded. Forward-compat with `composable-workflows`: the rule is the *policy* (you must recommend); if CW later
  wants a reusable *mechanism* (a `public + fixed` "present-overlay" fragment that formats it), the fragment
  *implements* the policy — different tiers, they compose. PPR authors the norm, not CW's machinery.
    - *Rejected homes:* a **new method** (no procedure, no owner — wrong shape) and **inline-at-each-site +
      extract-later** (duplicates a norm that has a natural single home today; the recommendation content is
      runtime-situational, not pre-bakeable in workflow text).

- **Open:** [none] — both halves homed: interlock split → `create-spec.md`; the norm → `DEV-RULES.ARC`. Tier and
  file settled for each.

### C. Planning-stage-pointer mechanics — `Current Workflow` field + event-driven `Design`

**The concern.** session-init resolves the lifecycle workflow deterministically *between* phases (`State` → coarse
bucket: `execution` → `process-task-loop`, `integration` → `integrate-work-unit`) but **prose-parses the planning
sub-stage**: at `sessionType: planning` it reads the free-form meta `**Next Action:**` to pick
`draft-design` / `create-spec` / `generate-tasks`, with an artifact-existence guess as fallback. The fallback is
lossy (a draft + no spec can't distinguish "still drafting" from "drafting done, starting spec") — exactly why
`Next Action` ends up overloaded and "lies about where the work is." This is the **mechanics** that the
`init-work-unit` readiness-pointer fix was a *workaround* for; with the mechanics in PPR's spine, the workaround
collapses in (below).

**Direction — the field model.** Split the operational substrate pointer from free-form judgment:

- **`Current Workflow`** — a new code-owned **encoding** field naming the active lifecycle workflow, written by the
  executor at every transition (single-owner; never hand-edited). session-init reads one deterministic field, no
  prose-parse. Redundant-but-machine-verified beats derived-but-fragile: an encoding-consistency test asserts it
  matches `(State, sub-stage)`.
- **`Next Action`** drops the workflow pointer and becomes pure within-stage judgment, or a bracketed sentinel at a
  clean boundary — `[begin current workflow]` (semantically correct, unlike `[none]` which reads as parked; the
  workflow *name* lives in `Current Workflow`, so no duplication).
- **`Design`** becomes an **event-driven pointer** (not a presence-scan): `[none] → draft-<name>` at draft
  creation; `draft-<name> → spec-<name>` **at create-spec finalization** (not spec existence — a spec can exist
  half-written while the draft is authoritative). The optional `notes-*` content migration is orthogonal (`Design`
  never points at `notes-*`); the mandatory draft-delete + repoint is mechanical at the finalization edge. No
  forced draft-first — a Light WU may go `[none] → spec` directly.

**`init-work-unit` folds in (the #2 collapse).** init-work-unit never decides readiness — and with the field model
above, it no longer writes a `Next Action` workflow pointer *at all*. It writes `Current Workflow` (via the
executor) and leaves the readiness call to the consuming session (`arc-plan` → `draft-design`), which already does
assess-then-route against the draft's actual state. "Stop pre-judging spec-readiness" falls out for free. The
"extractable judgment block inside init-work-unit" shape is rejected — wrong altitude.

**CLI event-recognition is in scope (ship coherent).** The field model needs the planning sub-stages
(`draft-design` / `create-spec` / `generate-tasks`, incl. create-spec finalization) to become **CLI-recognized
events** so the executor advances the pointers — they are markdown-only today. This is *in scope*: deferring it
would leave session-init prose-parsing the planning sub-stage behind the new field — i.e., the very defect this
section exists to kill, shipped half-dressed (the *inconsistent-if-deferred* case the cohort's consistency-on-exit
standard says to absorb). Builds on `lifecycle-transition-core`'s executor encoding pattern (the `Branch`-field
encoding write is the worked precedent) + the resolver. **Principle:** resolve-don't-store for reads (drift
impossible — nothing stored), CLI-mutate + consistency-hook for writes (drift caught at commit).

**The event set (pinned).** `Current Workflow` is the planning sub-stage pointer — meaningful only under
`State: Planning` (between phases, `State` → bucket is unchanged). The executor writes two field-families across
the planning stages, each riding an existing workflow moment (no new ceremony):

| Event (CLI-recognized)              | Writes                                | Notes                                       |
| ----------------------------------- | ------------------------------------- | ------------------------------------------- |
| Enter `draft-design`                | `Current Workflow = draft-design`     | stage-entry write                           |
| Draft created/adopted (first draft) | `Design: [none] → draft-<name>`       | conditional — only when a draft is produced |
| Enter `create-spec`                 | `Current Workflow = create-spec`      | stage-entry write                           |
| create-spec finalization            | `Design: draft-<name> → spec-<name>`  | event-driven repoint; rides draft-retire    |
| Enter `generate-tasks`              | `Current Workflow = generate-tasks`   | stage-entry write                           |
| Planning exit (activate)            | `Current Workflow → [none]`           | `State: Active` takes over; rides activate  |

The three `Current Workflow` stage-entry writes are the core that kills the prose-parse defect (what session-init
reads to resolve the sub-stage); the two `Design` repoints are the presence-scan → event improvement. All ride the
`Branch`-field executor precedent — a write bolted to each existing edge.

- **Open (create-spec, implementation):** the CLI **verb shape** that fires the events (coordinates with
  `idiomatic-alignment`'s verb-naming + cli-substrate), the **encoding format** of `Current Workflow` (bare
  workflow name vs. a state token), the **consistency-test** assertion specifics, and the **session-init
  read-path**. The event *set* above is pinned; these are how it is realized.
- **Guard:** if create-spec discovery shows the event-recognition surface is really a `cli-substrate-adoption`
  concern (its own substrate, cleanly separable), revisit the cut then. The lean is include.

---

## Readiness

- **State:** formalization-ready. The three sections' directions are settled, the shared seam resolved, the § C
  event set pinned, and every home named; what remains Open is create-spec-grade *implementation* detail, not open
  *design direction*.
- **Resolved:** (A) one shared `assess-draft-readiness` method, two fire points, checks-only on the buffer with the
  drain at the floor until the sibling builds the ceiling — no hard dependency. (B) interlock split →
  `create-spec.md`; recommend-on-overlay → a `DEV-RULES.ARC` behavioral norm (generalizable, token-tight),
  composable-workflows-forward-compat as policy. (C) field model (`Current Workflow` encoding + event-driven
  `Design` + `Next Action` sentinel), `init-work-unit` folded in, CLI event-recognition in scope with the
  six-event set pinned.
- **Open (all create-spec-grade implementation):** A's method file + fire-point invocation shapes; C's CLI verb
  shape, `Current Workflow` encoding format, consistency-test specifics, and session-init read path — with the
  cli-substrate guard on the event surface.
- **Next:** carry to `create-spec` as a `detailed` · **RFC** — the derivation is high (load-bearing multi-surface
  workflow design building invented stage-pointer mechanics); the dominant open question is the technical design of
  the pointer mechanics + event model, with the readiness-method / interlock-split user-facing impact riding as a
  subsection. Confirm the RFC subtype at create-spec's own derivation read.

---

# Notes: out-of-wu-entry

**Contents:**

- [Layer map — where the fixes land](#layer-map--where-the-fixes-land)
- [Design spine + per-signal locus](#design-spine--per-signal-locus)
- [Two-gate confirmation — detail](#two-gate-confirmation--detail)
- [Deferred signals](#deferred-signals)
- [Forward-compat seams](#forward-compat-seams)
- [Routed-out concerns](#routed-out-concerns)
- [Dependencies (shipped upstream)](#dependencies-shipped-upstream)

---

## Layer map — where the fixes land

| Layer | Change | Weight |
| --- | --- | --- |
| **Doctrine** | Already correct. Realign `cohort-agile-parallelism.md` § Known gap to name the active-WU dual it under-scoped (now owned here); add the `arc-shift` disposition note. **Landed in planning** (the planning iteration), per the planning-scope call. | Light |
| **CLI / probe** | errand/housekeep core needs none (signals are skill/workflow tokens; the probe is agnostic; errand identity is record-owned via `readErrandSlugByBranch`). `--plan` needs `resolveDraftPresent()` path-parameterized (`handlers/plan.ts`) to also find `backlog/{planned,provisional}/` drafts. No state-machine change (grooming is not a transition). | Light |
| **Workflows** | `session-init` entry dispatch — the core arm-orthogonal leaf + shared spine + two-gate confirmation; retire/rewrite "signal not consumed". `draft-design` — entry-gate-skip + an explicit groom-and-stop exit for the `--plan` locus (interim "approach A"). `run-errand` / `drain-inbox` already correct. | Medium |
| **Skills** | `arc-session` (bare `--errand` wording; `--housekeep`; `--plan`). `arc-inbox` terminology only (no slug work). `arc-errand` already correct — the warm-path precedent. | Light–medium |

## Design spine + per-signal locus

The shared spine all populated signals reduce to:

```text
[parse signal]
  → [displacement guard: active checkout present? → confirm-once]
  → [relocate via resolveWriteContext: full → short-lived branch off base; partial → direct base commit]
  → [load universal context only]
  → [run locus workflow]
```

The relocate step is the existing `resolveWriteContext` primitive (`lib/git/write-context.ts`, exported at
line ~292) that `run-errand` Launch and `drain-inbox` already share — protection-mode-shaped *and*
worktree-shape-agnostic (resolves `branch.base` from config, so the primary worktree need not be on `main`).
Relocation is therefore uniform across all three signals, not a per-signal property.

| Signal | Locus workflow | Edits | Sufficiency / elicitation |
| --- | --- | --- | --- |
| `--errand` | `run-errand` Launch | the errand's target paths | needs a concern — bare → elicit, or adopt a flagged `§ Errand` capture |
| `--housekeep` | `drain-inbox` | inbox → authoritative homes | self-determining (the inbox is the input); scope-extensible |
| `--plan <stub>` | `draft-design` content loop | the backlog stub's `draft-*` | needs a stub — bare → elicit / disambiguate |

**Grounded thin (live source, 2026-06-24):** `run-errand` Launch step 3 already relocates per protection mode
(`arc errand open <slug>`, folding cut→occupy off base); `drain-inbox` already lists "Mid-WU on demand" with the
`arc housekeep check` write-context guard (refuse-and-relocate off a WU branch); the `arc-session` skill already
brackets `--errand [<slug|description>]` as optional. So the errand and housekeep routes need only `session-init`
to *reach* their existing entrypoints — no new execution machinery.

**`--plan` committable-context grounding:** `classifyPlanningEntry` (`lib/git/write-context.ts`, exported at
line ~233) makes full-mode committability `= onPlanningBranch` (State `Planning` AND meta `Branch` == current
branch); a backlog stub's `Branch` is `[none]`, so editing it from base / a WU branch would `redirect`
(`protected-base` / `work-unit-branch`). `--plan` therefore rides the spine's relocate-to-grooming-branch
(auto-merge planning lane), where the edit commits cleanly — the committable-context "gap" was an artifact of
routing through the wrong gate (`arc plan check`), and dissolves under the spine.

**`draft-design` edits (the workflow surface the earlier layer map undercounted):**

- **Entry:** `--plan` enters draft-design's content loop **past** its `## Planning-entry gate` (`arc plan check`,
  at `draft-design.md` line ~26), which would otherwise `redirect` on a grooming branch — the spine already
  established committability. The gate is a discrete block; this is the interim hand-rolled "approach A" of
  composable-workflows' conditional-fragment skip ("approach C", routed out).
- **Exit:** an explicit **groom-and-stop** outcome alongside forward-advance and the re-entry back-edge — capture
  to the grooming branch, **don't advance** (draft-design's advance is already conditional, line ~172: "when the
  draft crosses into create-spec — not the re-entry back-edge"; groom-and-stop is a third, *named* case so a
  session doesn't read "didn't advance" as an incomplete forward path), stub stays in its backlog state, resume
  via `--plan X`.

**`--plan` continuity (the "3c" model):** grooming legitimately goes long (designs iterate). It rides
`run-errand`'s re-enterable pattern (pause = commit + push; resume from the pushed branch — no SESSION-NOTES),
with the **draft as the continuity artifact** (tracked; draft-design already maintains its readiness / Open /
Next sections). The grooming branch stays open across sessions (surfaced in the in-flight view; out of occupancy
math — a `chore/` branch has no meta); intentional resume is re-invoking `--plan X`; it merges once grooming
concludes; abandonment is swept by the existing in-flight-chore sweep. **No marker, no SESSION-NOTES analog, no
new durable state** — the draft *is* the state.

## Two-gate confirmation — detail

- **Sufficiency / elicitation** (signal-specific): does the signal carry enough to act? `--housekeep` → always
  (the inbox is the input). `--errand` / `--plan` **bare** → elicit (or adopt a flagged capture) before
  relocating. This is why a bare `--errand` does *not* silently launch — it asks first.
- **Displacement / precedence** (uniform): is an active WU / dirty checkout present? → **confirm-once-then-
  relocate**. Nothing checked out → proceed silently. Applies identically across the three signals.

The full Step-6 orientation is **replaced by a locus-scoped acknowledgment** (errand cold-entry already does this
— "orient on the locus, not the WU"), gated by sufficiency: `--housekeep` on a clean tree → "draining N entries"
then go; bare `--errand` → asks first, then goes.

## Deferred signals

The dispatch slot is built to be extended; these are deliberately **not populated** now.

- **`--new` / `--discover` — deferred (slot-ready).** Start new work from a Resume arm by routing to discovery /
  new-WU-start. Deferred because, unlike the populated three, it carries **no bug-fix or correctness value**:
  starting a new WU already works (`arc start B` cuts B's branch / spawns its worktree — isolation already
  enforced). No discarded-signal bug (the signal doesn't exist today). Pre-parallelism the underlying "start B
  while A is active" is gated by the single-checkout occupancy model itself, so `--new` removes no real blocker;
  post-parallelism the natural flow is "spawn B's worktree, open a session *there*", reducing `--new` to a minor
  shortcut. The generic slot makes it a one-line add if demand materializes.
- **`arc-shift` — dispositioned to `finalize-parallelism`.** Related theme, orthogonal mechanism — not this WU's
  slot:

| | `--new` (and the populated signals) | `arc-shift` |
| --- | --- | --- |
| When | At session entry (dispatch override) | Mid-session detour |
| Context | Establishes *fresh* scoped context | *Carries + merges* the live session context |
| Target | New/relocated work locus | Another **worktree's runtime environment** |
| Return | No | Yes — short detour, return-intent |
| Mechanism | A case in the `arc-session` dispatch slot | A separate verb (`shift-work-unit.md`), not an entry signal |

  `arc-shift`'s reason for existing is the **context-merge across a runtime hop**; none of the entry signals do
  that. Its premise (operate in *another worktree's* runnable env) also requires real worktrees-in-use, gated on
  `finalize-parallelism`. Revival decision routed to `finalize-parallelism`. A disposition note is folded into
  `cohort-agile-parallelism.md` § Deferred.

## Forward-compat seams

- **composable-workflows** *(routed out → `USER-INBOX`)* — the `--plan` gate-suppression and the signal-dispatch
  leaf are early consumers of its conditional-fragment composition. Build "approach A" interim; flag the seam so
  composable-workflows subsumes it (the gate-skip becomes a fragment skip) rather than rips out a bespoke branch.
- **shared-inbox-housekeep** — `--housekeep` is designed scope-extensible (default user inbox) so its possible
  dual-mode `drain-inbox` (`user|shared`) lands as a parameter; do not hardwire `USER-INBOX`-only.
- **operational-state-docs** — consume the record/identity interface (errand adoption by title → slug later,
  `arc inbox add`) as forward-extensible; OSD owns the substrate (no build here).
- **planning-iteration-mechanics** — `--plan` honors PIM's inbound-buffer ceremony as a seam condition (rides
  draft-design's content loop); grooming-not-validation boundary (full validation defers to promotion /
  create-spec).
- **finalize-parallelism** — out-of-wu-entry is its shipped dependency. Relocate via the write-context primitive
  already handles "primary worktree not on `main`", so no design change is needed for worktree-by-default.
- **cross-wu-coordination** — no material constraint now (a possible future `arc status <slug>` cohort-surfacing
  in `--plan`, additive).

## Routed-out concerns

Captured to `USER-INBOX § Work Unit` (2026-06-24) — drain at the next housekeep, not this WU:

- **composable-workflows gate-suppression seam** — the `--plan` entry-gate-skip + the signal-dispatch leaf as
  early consumers of its fragment composition (target: composable-workflows' Inbound Buffer).
- **Grooming-branch bare-landing recovery** — a paused `--plan` grooming branch *bare-landed on* (via plain
  `arc-session`, not `--plan X`) trips `session-init`'s errand-resume detection and misroutes as an *errand* (a
  meta-less `chore/` branch is indistinguishable today). Fix = type the grooming branch's record (extends
  errand-lattice's shipped model) so resume detection + the in-flight surface label it grooming. Recovery-
  precision only; this WU does not depend on it. Target: OSD / skill-infrastructure-cleanup / a small new stub.
- **Frictionless cold-session capture** — the "capture-and-leave with no ARC session" idea is a *different
  mechanism* (a cold `arc-inbox` skill path removing the need for a session door) — opposite end of the
  "out-of-WU work shouldn't require winding down" spectrum, no shared mechanism. (→ a `frictionless-capture`
  planned/P2 stub at the next housekeep.)

## Dependencies (shipped upstream)

This WU **composes** the following, all shipped:

- **Errand Enablement** — `run-errand`, the `arc-errand` warm skill, the Errand decision matrix.
- **work-routing-discipline** — errand-model re-pivot (execution-only); the housekeep write-context guard.
- **In-Flight Awareness** — the oracle behind `arc errand check`.
- **errand-lattice** — record-owned errand identity (`readErrandSlugByBranch` at `lib/errand/record.ts` line
  ~175; the retired `chore/`-prefix parse). Also the extension point for the routed-out grooming-branch
  record-typing.
- **the lifecycle state machine** — state resolved from location + meta `State`, so in-place grooming needs no
  new state.
- **planning-pipeline-readiness**.

**Coordination (not blockers):** `planning-iteration-mechanics` (planning *content* mechanics);
`operational-state-docs` (`arc inbox add` + the `_Slug:_` identity migration); `composable-workflows` (the
fragment composition that subsumes the `--plan` gate-skip); `skill-infrastructure-cleanup` (warm/cold session
marker — candidate home for grooming-branch recovery).

**Sibling (shipped):** the `concurrent-work-conventions` sub-cohort — `concurrent-work-doctrine`,
`merge-safety-mechanism`, `async-merge-lifecycle`, `single-owner-wu-model`. out-of-wu-entry follows it, making the
mid-WU entry path its conventions assume actually work.

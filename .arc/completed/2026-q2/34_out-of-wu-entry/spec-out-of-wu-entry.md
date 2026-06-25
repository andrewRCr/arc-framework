# Spec (`outline`): out-of-wu-entry

- **Origin:** [internal] — surfaced during `class-model-foundation` planning, when `arc-session --errand`
  invoked from the primary worktree (active planning WU, clean tree) resolved to the **Resume** arm and discarded
  the signal. The warm `arc-errand` skill then ran the capture as an errand — confirming the gap is localized to
  the cold session door.

- **Purpose:** Realign `session-init`'s entry dispatch so **explicit out-of-WU intent routes regardless of
  active-WU state** — one **arm-orthogonal dispatch leaf** that outranks the implicit resume/orient dispatch,
  preserves the active WU's checkout, and routes to the signal's locus. Populated this WU by `--errand`,
  `--housekeep`, and `--plan <stub>`; left slot-ready for future signals.

---

## Problem / Context

The doctrine treats mid-WU out-of-WU entry as the **normal case**. `DEV-RULES.ARC` § Discovered Work Routing
names *"Errand now — own session (`arc-session --errand`)"* as the primary route for urgent out-of-WU work;
`strategy-work-organization` says an Errand "launches from any worktree" and names the primary worktree "the
launchpad for Errand launches"; `run-errand` Launch relocates the execution locus itself per protection mode.
The execution machinery is ready and blesses the mid-WU case.

The entry plumbing honors it only with **no active WU**. `session-init`'s entry dispatch gates `--errand` to the
**Orient** arm (`active.resolution === "none"`, primary worktree); on the **Resume** arm it discards the signal
under "Errand signal not consumed (non-Orient arms)" with circular advice — "run it from the primary worktree via
a fresh `arc-session --errand`" — when re-invoking there lands on the same Resume arm and is discarded again.
There is no `--housekeep` priming door (housekeep surfaces only as an Orient-arm soft-offer) and no `--plan` door
(iterating a backlog stub's draft forces graduation to `active/` + a `plan/` branch, then park-back, recording a
false `parked` state for grooming-lane work).

**Why it's exposed now:** per-WU worktree-by-default is not yet in practice, so *every* mid-WU session today is
"Resume arm, primary worktree, on a WU branch" — precisely the shape the dispatch refuses to route. **Root
cause:** the cohort's recorded "cold errand entry" known-gap was under-scoped to the *no-originating-session*
case; the orient-and-await leaf was built faithfully to that record, but it lives on the Orient arm and so
structurally cannot serve the **dual** — explicit out-of-WU intent raised while a WU is active. This is a
`session-init` orchestration gap, not a `run-errand` or CLI bug.

## Decision(s)

1. **One arm-orthogonal dispatch leaf.** When an explicit-intent signal is present, `session-init` routes to the
   **signal leaf** *before* (and instead of) resolving resume-vs-orient-vs-cold-start; signal absent → normal arm
   dispatch. The leaf (a) **outranks** the implicit resume/orient dispatch, (b) **preserves** the active WU's
   checkout (relocate to a fresh locus; never clobber the resumed branch), and (c) **routes** to the signal's
   locus. Context-independence is **structural** — one mechanism honored identically on either arm, not two
   per-arm implementations.

2. **Shared spine + per-signal locus.** All populated signals reduce to one spine — *parse signal → displacement
   guard → relocate via `resolveWriteContext` → load universal context only → run locus workflow*. The relocate
   step is the **existing `resolveWriteContext` primitive** (`lib/git/write-context.ts`) that `run-errand` Launch
   and `drain-inbox` already share: protection-mode-shaped (full → short-lived branch off base; partial → direct
   base commit) *and* worktree-shape-agnostic (resolves `branch.base` from config, so the primary worktree need
   not be on `main`). "Respect `branch.protection`" and "forward-compat to worktree-by-default" are inherited from
   one primitive, not re-implemented per signal. Signals differ only in **which workflow runs, what it edits, and
   the sufficiency rule**:
    - `--errand` → `run-errand` Launch; edits the errand's target paths; needs a concern (bare → elicit, or adopt
      a flagged `§ Errand` capture).
    - `--housekeep` → `drain-inbox`; edits inbox → authoritative homes; self-determining (the inbox is the input).
    - `--plan <stub>` → `draft-design` content loop; edits the backlog stub's `draft-*`; needs a stub (bare →
      elicit / disambiguate).

3. **Two-gate confirmation model.** Two distinct gates: **sufficiency / elicitation** (signal-specific — does the
   signal carry enough to act? `--housekeep` always; bare `--errand` / `--plan` elicit first) and **displacement
   / precedence** (uniform — an active WU or dirty checkout present → **confirm-once-then-relocate**; nothing
   checked out → proceed silently). The explicit flag signals intent, but relocating away from a resumed WU is
   worth one visible beat. The full Step-6 orientation is **replaced by a locus-scoped acknowledgment** (as errand
   cold-entry already does — orient on the locus, not the WU).

4. **`--plan <stub>` — in-place planning iteration.** Enter a planning session against a `backlog/` stub's draft
   (`planned` or `provisional`) **in place** — no graduation, the stub stays in its backlog state, no false
   `parked`. Editing a backlog stub's draft is a **content mutation, not a lifecycle transition** (the state
   resolver reads directory location + meta `State`, neither of which changes), and both `planned` and
   `provisional` sit outside the capacity-occupancy set (`OCCUPYING = [planning, active, integrating]`), so
   in-place grooming stays out of parallel-capacity math for free. **No state-machine change.** Committable context
   comes from the spine's relocate-to-grooming-branch (`classifyPlanningEntry` makes a backlog stub's `Branch:
   [none]` redirect off base / a WU branch), not from `arc plan check`. `draft-design` takes two small edits — an
   **entry-gate-skip** past its `## Planning-entry gate` (interim hand-rolled "approach A" of the
   composable-workflows fragment-skip) and an explicit **groom-and-stop** exit (capture to the grooming branch,
   **don't advance**, stub stays `planned`, resume via `--plan X`). Cross-session continuity is the **"3c" model**
   — `run-errand`'s re-enterable pattern (pause = commit + push; resume from the pushed branch, no SESSION-NOTES)
   with the **tracked draft as the continuity artifact**; the grooming branch stays open across sessions and out
   of occupancy math; **no marker, no new durable state**. CLI surface: a minimal, reusable backlog-stub resolver
   (slug → stub dir / state-dir / draft path, plus a stub-listing for disambiguation) backs both
   `resolveDraftPresent()` (`handlers/plan.ts`) and `--plan`'s sufficiency / disambiguation gate — both are
   deterministic code call sites, so the lookup is code, not agent-globbing of nested
   `backlog/{planned,provisional}/[<cohort>/]<slug>/` dirs. Kept minimal and backlog-stub-scoped;
   `composable-workflows`' canonical `slug → artifact` resolver later absorbs and extends it (seam note routed).

5. **`--housekeep` — populated, scope-extensible.** A full slot member symmetric with `--errand`: short-circuits
   the WU-execution doc loads, relocates to the base write context, and runs `drain-inbox` — arming a drain
   directly, cold or mid-WU. Design the scope as a **parameter** (default user inbox), so a future `user|shared`
   mode lands without re-architecture; do not hardwire `USER-INBOX`-only. The warm `arc-housekeep` skill remains
   the execution path the flag reaches; the flag adds the direct, minimal-load entry.

6. **Bare `--errand` is valid.** A bare `--errand` (no slug/description) primes errand cold-entry — universal
   context only, skipping SESSION-NOTES, the active task list, and `process-task-loop`. Fix the wording in the
   `arc-session` skill and `session-init` so absent-seed is explicitly supported (→ elicit the concern, or adopt a
   flagged `USER-INBOX § Errand` capture).

7. **Errand identity is record-owned.** Any errand identity this route needs comes from the record via
   `readErrandSlugByBranch` (`lib/errand/record.ts`), never a `chore/`-prefix branch parse (retired by
   errand-lattice). The planning-entry gate needs no errand identity at all.

8. **(Ergonomic) Pre-focus a positional backlog-WU arg on the Orient arm.** A positional arg naming a backlog WU —
   currently "surfaced, not acted on" — lets the Orient/discovery arm **pre-focus** the named WU and offer to init
   it, **confirm-only, never auto-init** (the existing entry-seed mechanism extended to the discovery arm).

9. **Design posture — direct intent, not nudges.** The slot arms an *explicitly declared* goal and loads only what
   that goal needs; it does not surface unrequested routes or nag about the active WU's execution context. (This
   is why a Resume-arm housekeep *route* was rejected in favor of the `--housekeep` flag.)

## Scope boundary (No-gos)

- **Atomic-slug identity for captures** — OBE; downstream mechanisms key on the entry **title**
  (`--from-inbox <entry-title>`; the record's `originEntry` back-pointer), not a slug. The `_Slug:_` migration is
  `operational-state-docs`'.
- **`draft-design`'s full composable-fragment refactor** — the entry-gate-skip here is the interim "approach A";
  the conditional-fragment composition ("approach C") is `composable-workflows`'.
- **Grooming-branch bare-landing recovery** — a paused `--plan` branch bare-landed on (plain `arc-session`, not
  `--plan X`) misrouting as an errand. Recovery-precision only; routed out, no dependency here.
- **`--new` / `--discover` and `arc-shift`** — deferred / dispositioned (see the draft's § Deferred signals;
  `arc-shift`'s revival is routed to `finalize-parallelism`).
- **`run-errand` / `arc-errand` and `drain-inbox` execution mechanics** — already correct (relocation, "any
  worktree" handling, the write-context guard). This WU changes entry routing, not execution.
- **In-place planning *content* mechanics** — the inbound-buffer drain ceremony and depth-aware sizing correction
  are `planning-iteration-mechanics`'. This WU owns only entry/locus.
- **`arc inbox add` deterministic write CLI** — `operational-state-docs`'.
- **Per-WU worktree-by-default rollout, parallelism conventions, merge-safety / async-merge / single-owner-WU
  model** — the broader cohort move and the shipped `concurrent-work-conventions` members; this WU rides the
  relocate primitive under both current (in-primary) and future (per-WU-worktree) practice.

## Consequences & Risks

- **Completes a latent contradiction in shipped doctrine.** The `concurrent-work-conventions` members shipped
  conventions that *assume* mid-WU errand/housekeep entry already works (the in-session-fork matrix; the
  all-owner advisory gate). Until this lands, that doctrine describes a path the plumbing doesn't fully take.
- **Interim "approach A" is deliberate debt.** The `draft-design` entry-gate-skip is a hand-rolled fragment skip;
  flag the seam so `composable-workflows` *subsumes* it (gate-skip → fragment skip) rather than ripping out a
  bespoke branch later.
- **Forward-compat seams (no build here):** `shared-inbox-housekeep` (`--housekeep` scope as a parameter);
  `operational-state-docs` (record/identity interface, `arc inbox add`); `planning-iteration-mechanics` (the
  buffer ceremony rides `--plan`'s draft-design loop as a seam condition); `finalize-parallelism` (this WU is its
  shipped dependency; the relocate primitive already handles "primary not on `main`", so no design change for
  worktree-by-default); `cross-wu-coordination` (a possible future cohort-surfacing in `--plan`, additive).
- **Accepted tradeoff:** the grooming-branch bare-landing edge persists (routed out); a paused `--plan` branch
  resumed via plain `arc-session` may misroute as an errand. Low-cost — intentional resume (`--plan X`) is the
  shipped path; the precision fix is a separate concern this WU does not depend on.

## Success Criteria

- An explicit `--errand` / `--housekeep` / `--plan` signal on a **Resume** arm (active WU, primary worktree, WU
  branch) routes through the override leaf and is **not discarded**; the "Errand signal not consumed (non-Orient
  arms)" rule is retired and replaced by an actual Resume-arm route.
- Relocation **preserves the active WU's checkout** (the resumed branch is never clobbered) and goes through
  `resolveWriteContext` per `branch.protection` (full → short-lived branch off base; partial → direct base).
- The **displacement gate** fires confirm-once when an active checkout / dirty tree is present, and proceeds
  silently when nothing is checked out.
- A **bare `--errand`** is accepted (no arg required) and primes cold-entry loading universal context only
  (SESSION-NOTES, active task list, and `process-task-loop` skipped); the `arc-session` skill and `session-init`
  wording agree that absent-seed is supported.
- **`--housekeep`** relocates to the base write context and runs `drain-inbox` without loading WU-execution docs;
  its scope is a parameter defaulting to the user inbox.
- **`--plan <stub>`** enters `draft-design`'s content loop against a `backlog/` stub (`planned` or `provisional`)
  **in place**: the stub's `State` stays unchanged, the **groom-and-stop** exit does not advance the stage, and
  the session resumes via `--plan X` across sessions with the draft as the continuity artifact.
- A **linked-worktree `--errand`** relocates to the primary's base and runs the errand rather than falling through
  to discovery.
- Errand identity is read from the **record** (`readErrandSlugByBranch`); no code path parses the `chore/` prefix.

## Open items

- The precise **insertion point** of the signal-leaf check within `session-init`'s Step 2 dispatch (relative to
  the branch-gone precondition and the sync-pull channels) — resolves while editing the workflow.
- The bare-`--plan` / bare-`--errand` **elicitation & disambiguation UX** when zero or several candidate stubs /
  captures match — the sufficiency-gate interaction shape, settled during implementation against the existing
  prompt conventions.

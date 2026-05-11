# Plan: arc-reinforce — Backpressure Routing Skill

**Purpose:** Codify the routing procedure for adding or strengthening behavioral guidance in
response to observed failure modes. Skill (`arc-reinforce`) handles the simple case inline;
workflow loads for complex cases (multi-destination, framework-owned, method/extension
scaffolding). Maintainer superset (`arc-reinforce-dev`) extends scope to framework-owned
destinations. Artifact named `arc-reinforce`; "backpressure" is the working term in the copy.

- **State:** Draft — pre-PRD exploration captured 2026-05-10 from facilitated planning
  conversation. Iteration expected before PRD promotion.
- **Created:** 2026-05-10
- **Origin:** Surfaced 2026-05-10 in dialogue while observing the recurring "we noticed agent did
  X, let's figure out where in ARC's structure to add a guard against that" pattern. Currently
  handled ad-hoc each instance, with routing-decision overhead and inconsistent results across
  instances. Maintainer is the primary near-term consumer (no adopters yet); shipped variant is
  forward-looking surface for the post-1.0 audience.

---

## Problem / Motivation

When the user observes an unwanted agent behavior that traces clearly to a guidance gap (no rule,
ambiguous rule, rule loaded too late, etc.), the recurring pattern is: figure out the optimal
location in ARC's structure for the corrective guidance, draft the addition, edit the file. This
happens often enough that ad-hoc handling burns the same routing cycles repeatedly.

What's missing today:

1. **No common entry point.** Each instance starts from scratch. Routing decisions are non-trivial
   (DEV-RULES.ARC vs DEV-RULES.PROJECT vs DEV-RULES.{DOMAIN} vs workflow body vs method override
   vs extension activation vs SESSION-NOTES persistent context vs harness off-ramp), and reasoning
   from intuition each time produces inconsistent outcomes.

2. **No bloat guard.** Adding a corrective bullet for every observed slip risks DEV-RULES growing
   into a rule swamp that nobody reads — the failure mode that produces slips in the first place.
   No standardized triage-out path exists for "this was an execution lapse, not a guidance gap."
   Making the routing path cheaper without bloat resistance would risk an over-add ratchet.

3. **No duplication guard.** When existing guidance covers the case but the user has forgotten,
   ad-hoc handling drafts fresh content rather than strengthening existing — accumulating bloat
   AND potentially contradictory instruction.

4. **Self-hosting routing carries extra load.** Framework-owned changes require package-source-
   first routing with awareness of `.template` rendering and the manifest. Adopter-only routing is
   the common case for shipped audiences but the dev case adds complexity that the shipped surface
   shouldn't carry.

The skill+workflow pair codifies the procedure with bloat/duplication guards baked in, while
keeping the routing model principle-driven (not closed-set) so it remains forward-compatible with
ARC's structural evolution and adopter customization.

---

## Working Principles

Three design choices shape the skill, validated through pre-planning iteration:

1. **Principle-driven routing, not enumerative.** Skill carries small orthogonal axes
   (Scope / Form / Persistence) plus stable anchor examples per resulting destination class — not
   closed lookup tables. Agent reasons about new situations by projecting onto the axes.
   Forward-compatible with adopter customization (custom DEV-RULES.{DOMAIN}, project workflows,
   custom strategies) and downstream ARC structural evolution.

2. **Bloat resistance is load-bearing, not aspirational.** Three mandatory mechanisms —
   duplication scan, triage-out as first-class outcome, tier-aware concision discipline — give the
   skill default-toward-not-adding gravity. Necessary because making the path cheaper otherwise
   risks unintended over-add ratchet.

3. **Skill carries the routing decision; workflow carries procedural scaffolding.** Mirrors the
   [arc-commit][arc-commit] / [prepare-commits][prepare-commits] split. Skill is genuinely useful
   in isolation for simple cases (single artifact, obvious destination); workflow loads only when
   the chosen destination requires multi-step execution that doesn't fit inline.

---

## Routing Model

Three orthogonal axes plus a tier modifier. The intersection of axes implies a destination class;
adopters and maintainers project new situations onto the axes rather than consulting enumerated
lists.

### Axis 1 — Scope

| Value     | Meaning                                                | Shipped | Dev |
|-----------|--------------------------------------------------------|---------|-----|
| framework | Ships to all adopters via package source               | —       | ✓   |
| project   | This adopter only; lives in `.arc/`                    | ✓       | ✓   |
| personal  | Per-developer; gitignored under `user/{identity}/`     | ✓       | ✓   |

Shipped `arc-reinforce` constrains Axis 1 to `{project, personal}`. Dev variant
`arc-reinforce-dev` adds `framework`, plus the package-sync workflow handoff trigger that fires
when framework × any × durable lands.

### Axis 2 — Form

| Value     | Meaning                                          | Anchor destinations                        |
|-----------|--------------------------------------------------|--------------------------------------------|
| rule      | Constraint on what to do or avoid                | DEV-RULES.{ARC,PROJECT,DOMAIN}             |
| procedure | Sequence of steps                                | system/project workflows                   |
| reference | Stable fact about what something is or where     | AGENT-BRIEF.{ARC,PROJECT}, QUICK-REFERENCE |
| trigger   | When/where a behavior fires                      | method override, extension activation      |

### Axis 3 — Persistence

| Value     | Meaning                                          | Implication                              |
|-----------|--------------------------------------------------|------------------------------------------|
| durable   | Lives until superseded by future change          | Default for codified guidance            |
| temporary | Active for bounded period, with removal trigger  | SESSION-NOTES persistent context entry   |

Personal × temporary always lands as a SESSION-NOTES persistent context entry with explicit
removal trigger (by definition of the section).

### Axis 4 — Tier (orthogonal modifier)

Not a destination axis — a discipline modifier governing concision of whatever lands. Classified
by anchor examples (skill carries 1-2 per tier inline):

- **Tier 1 (every session, ops-only):** DEV-RULES.{ARC,PROJECT}, AGENT-BRIEF.{ARC,PROJECT},
  session-init/session-handoff workflows, frequently-invoked skills (arc-commit, arc-resume,
  arc-handoff). Earn the line — no rationale, no examples unless disambiguating.
- **Tier 2 (every execution session, lean+procedural):** process-task-loop and methods/extensions
  it declares (test-first, commit-format, commit-context-format, issue-triage,
  quality-gate-commands), current-task section of active task list.
- **Tier 3 (boundary/occasional, verbose-OK):** lifecycle workflows (activate, integrate, sweep,
  deactivate, plan-\* generation), supplemental workflows (prepare-commits, manage-incidental-
  work), strategy docs, ADRs.
- **Tier 4 (rare/on-demand, rationale-heavy):** infrequent skills (arc-verify, arc-task-audit),
  domain-specific reference loaded only on contact.

Methods and extensions inherit the tier of the workflow(s) that declare them. Skills get tier by
invocation frequency.

### Off-ramp: harness-side

Sometimes the right destination is harness-side, not ARC: settings.json hooks, permissions,
keybindings, MCP server config. Skill surfaces this routing as an off-ramp — references the
appropriate harness skill (`update-config`, `keybindings-help`, etc.) or directs the user to the
harness config. Does **not** perform the edit itself; avoids taking on cross-harness config
knowledge.

---

## Skill Shape

Two skill artifacts; structure mirrors the arc-commit pattern.

### `arc-reinforce` (shipped)

- **Path:** `packages/arc-framework/arc/system/skills/arc-reinforce/SKILL.md` (canonical) →
  ships to adopter `.arc/system/skills/arc-reinforce/SKILL.md` and harness mirrors
  (`.claude/skills/`, `.codex/skills/`) via `arc update`.
- **Frontmatter:** standard skill fields (`name`, `description`).
- **Scope:** Axis 1 ∈ {project, personal}.
- **Body:** routing axes + tier anchors inline; diagnostic input prompts; duplication scan with
  skip path; triage checklist; tier-aware verbosity self-checks; routing decision; simple-path
  inline edit OR complex-path workflow handoff.

### `arc-reinforce-dev` (maintainer-only)

- **Path:** `.arc/system/skills/arc-reinforce-dev/SKILL.md` and harness mirrors. **Never** in
  `packages/arc-framework/arc/system/skills/`.
- **Frontmatter:** standard skill fields plus `distribution: internal`. Defense-in-depth marker
  alongside path-based exclusion. Generic enough to apply to any future `.arc/`-only file
  (workflows, methods, extensions).
- **Scope:** Axis 1 ∈ {framework, project, personal}.
- **Body:** strict superset of `arc-reinforce`. Same axes block, same anchors, same triage; adds
  framework destination handling and package-sync workflow handoff trigger. Drift between
  shipped and dev bounded by writing dev as explicit superset; manual diff at maintenance time
  keeps them aligned without composition machinery.
- **Manifest caveat:** the package-project sync manifest must NOT auto-classify
  `.arc/system/skills/arc-reinforce-dev/` as Framework. Verified silent under current manifest
  behavior (no entry → both classification branches skipped). Confirm during implementation that
  manifest regeneration preserves this.

### Diagnostic input (both variants)

Required inputs (skill prompts if missing):

- **Observed behavior:** what the agent did that was unwanted
- **Expected behavior:** what should have happened
- **Gap classification (agent self-diagnosis):** missing guidance / ambiguous guidance / loaded
  too late / present-but-ignored / wrong destination / not-an-ARC-concern

Gap classification feeds routing directly. "Present-but-ignored" routes to triage-out by default
(execution lapse, not guidance gap). "Not-an-ARC-concern" routes to harness-side off-ramp.

### Triage checklist (hybrid: rules surface, user confirms)

Before drafting any new content, skill surfaces findings on:

1. Was guidance present at the candidate destination?
2. Was the guidance loaded at the relevant fire point?
3. Was the guidance unambiguous as written?

Outcome surfaced as one-liner with recommendation: triage-out (no codify), strengthen existing,
or add new. User confirms or overrides. Light enough to inline; informative enough to resist
over-add.

### Duplication scan (default-on, confident-assertion skip)

When scan runs (default): grep candidate destination + 1-2 adjacent destinations for keyword
overlap with diagnosed gap. Three outcomes:

- **No match** → proceed to draft (or skip per triage)
- **Partial match** → strengthen existing in place (never duplicate)
- **Contradiction** → escalate to user; do not auto-resolve

Skip path: explicit confident assertion from user OR from agent with user confirmation
("destination known, no adjacent existing guidance to strengthen"). Default-on bias:
agent-initiated skip without user direction is itself a yellow flag and should require user
confirmation, not agent self-authorization.

### Strengthen-in-place sub-procedure (sketched, refined at contact)

When duplication scan finds existing guidance needing sharpening:

1. Read full surrounding rule context (not just matched paragraph)
2. Categorize gap shape: ambiguity / missing edge case / wrong emphasis / location issue
3. Propose minimal tightening that preserves voice and structure
4. Show diff before edit

Detail formalized at first contact; MVS keeps the procedure compact and grows it from real cases.

### Path branching

- **Simple path (inline):** single artifact, obvious destination, no cross-cutting wiring. Skill
  drafts and edits inline, applies tier discipline, runs lint check.
- **Complex path (load workflow):** any of (a) destination is framework-owned (dev variant only),
  (b) more than one destination requires edits, (c) change introduces or activates a method
  override / extension point, (d) change spans rules + workflow body. Threshold deliberately
  slightly aggressive on the complex-path side; refine after MVS contact.

---

## Workflow Shape

`arc-reinforce.md` workflow under `system/workflows/arc/supplemental/`. Loaded by skill on
complex-path branch. Carries procedural scaffolding only; routing decision is already made by the
skill.

- **Multi-destination orchestration:** sequence for edits across multiple files (rule + cross-link
  from QUICK-REFERENCE; rule + supporting strategy doc; rule + workflow body).
- **Package-sync workflow handoff:** when destination is framework-owned (dev variant only),
  invoke existing package-sync discipline per [Package-Project Sync Strategy][package-sync].
  Workflow handoff, not duplication.
- **Method-override scaffolding:** patterns for when destination requires creating a project-level
  method override of a framework default. File path layout, frontmatter shape.
- **Extension-activation scaffolding:** patterns for when destination requires activating and
  populating a declared extension hook. arc-config.yml entry, `.actions` block shape.
- **Strengthen-in-place sub-procedure (full):** detailed gap-classification-and-tightening
  procedure invoked from the skill when complexity earns full treatment.
- **Lint and verification:** post-edit checklist (markdown lint, link validation, frontmatter
  shape, manifest re-check if applicable).

The workflow body composition specifics — particularly method-override and extension-activation
patterns — stay schematic in MVS and grow from real cases at contact.

---

## Self-Hosting Verifications (Resolved)

Captured during pre-planning to lock in the dev-variant housing decision:

1. **Claude Code skill resolution (project-level vs user-level same name):** Personal
   (`~/.claude/skills/`) overrides project (`.claude/skills/`); strict precedence, no merging,
   no warning. Separate names (`arc-reinforce` vs `arc-reinforce-dev`) avoids the conflict.
   Bonus mechanism: `skillOverrides` in `settings.local.json` supports explicit suppression
   (`"<name>": "off"`) if ever needed.

2. **Codex CLI skill format:** Codex CLI supports both `.codex/skills/` and `.agents/skills/`
   (the latter being a cross-harness open-source format supported by several CLIs but not Claude
   Code). This project uses `.codex/skills/` per maintainer preference. Single SKILL.md per skill
   with name + description in frontmatter. Mirrors Claude Code structure closely enough that no
   harness-specific adaptation is needed beyond directory placement.

3. **npm publish surface:** `packages/arc-framework/package.json` `files` field is
   `["dist", "arc", "templates", "init-recipe.json", "changelog"]` — all relative to the package
   directory. Repo-root `.arc/` is never reached. `npm pack --dry-run` confirms only
   package-relative paths in the tarball. **Zero leak risk** for
   `.arc/system/skills/arc-reinforce-dev/`.

4. **Pre-commit sync hook on `.arc/`-only entries:** Hook at `.husky/pre-commit` delegates to
   `scripts/check-package-sync.sh`. Logic looks up staged `.arc/` files in
   `.arc/system/.internal/manifest.json`; entries not in the manifest fall through both
   classification branches (Framework / Configurable) silently. Confirmed: a new
   `.arc/system/skills/arc-reinforce-dev/SKILL.md` with no manifest entry stages cleanly with no
   warning, no error. **Caveat:** confirm during implementation that the manifest generation
   process does not auto-add new `.arc/system/skills/` entries with Framework classification
   (which would start tripping the warning).

---

## Alternatives Considered

- **Status quo (ad-hoc handling).** Continues the routing-cycle overhead per instance and the
  bloat/duplication risks. Rejected — the recurring pattern is exactly what skills exist to
  codify.

- **DEV-RULES.ARC amendment with routing procedure (no skill).** Encode the routing logic
  constitutionally as a § Backpressure Routing block. Rejected — adds Tier 1 surface load (every
  session, every developer) for procedural content that isn't needed every session. Constitutional
  rules constrain; they don't perform diagnostic prompting or duplication scanning.

- **Workflow-only (no skill).** Direct workflow invocation. Rejected — loses the simple-case
  thin-wrapper benefit; users would always pay the workflow load cost. Less discoverable as
  user-initiated entry point.

- **Method override pattern (`backpressure-routing` method).** Define a method that workflows
  invoke at relevant fire-points. Rejected — the entry point isn't a workflow fire-point, it's a
  user-initiated request. Methods compose into workflows; skills provide user-initiated entry.

The skill+workflow pair fits the existing arc-commit/prepare-commits pattern and is the natural
shape.

---

## Forward-Compat Callbacks

Annotations to revisit when downstream WUs land or when sequencing settles.

> **Plan Instruction Optimization composability.** [Instruction Optimization][instruction-opt]
> defines lean-shape principles for every-session-loaded surfaces. arc-reinforce's tier-aware
> verbosity discipline is downstream of those principles — when adding to Tier 1 destinations,
> arc-reinforce respects the lean discipline that instruction-optimization codifies. If
> instruction-optimization lands first, arc-reinforce references its tier discipline; if
> arc-reinforce lands first, the tier-anchor block is the single source until
> instruction-optimization formalizes a sibling.

<!-- -->

> **Worktree Foundation interaction.** When [Worktree Foundation][worktree-foundation] lands,
> mixed-scope planning on feature branches becomes unnecessary (per current SESSION-NOTES
> persistent context note). arc-reinforce invocations that surface during execution sessions can
> rotate to a separate worktree for the codification work without disrupting active task state.
> No structural impact on the skill itself; affects when/where it's invoked.

<!-- -->

> **Work Organization Reform interaction.** [Work Organization Reform][work-org-reform] changes
> the `active/{category}/` partition to a flatter shape and introduces Conventional Branch
> alignment. arc-reinforce destinations that reference active-WU paths should compose with WOR's
> structure after it lands; not blocking, just sequencing-aware.

---

## Boundary Items / Out of Scope

Explicitly out of scope:

- **First-time project configuration** — `arc init` territory.
- **Wholesale rule rewrites or refactors** — backpressure adds or strengthens; refactor is its
  own workflow.
- **Net-new feature requirements** — planning territory; arc-reinforce guards against observed
  failure modes, not designs new capabilities.
- **Incident logs / "things that went wrong" tracking** — arc-reinforce produces durable guidance
  changes, not historical records. Historical context lives in commit messages and completion
  docs.
- **Harness/IDE config edits themselves** — skill identifies harness-side off-ramp and references
  the appropriate harness skill or directs the user to harness config; does not perform the edit.
  Avoids taking on cross-harness config knowledge.

---

## Open Items at PRD Time

Small items deferred to PRD or implementation contact (not blockers for the plan):

- **Strengthen-in-place sub-procedure detail.** Gap classification + diff-before-edit shape kept
  schematic; refined from real cases.
- **Workflow body composition specifics.** Method-override scaffolding patterns and
  extension-activation patterns stay schematic in MVS; grow from real cases.
- **Triage-out example accumulation.** Examples thin until accumulated through use; PRD-time
  decision on whether to seed from past observed failures or wait for organic accumulation.
- **Frontmatter field name confirmation.** `distribution: internal` is the lean direction;
  confirm against any other existing frontmatter convention or future maintainer-only file
  needs at PRD time.
- **Complex-path threshold refinement.** Initial threshold (framework-owned, multi-destination,
  method/extension scaffolding, rules+workflow spanning) is deliberately slightly aggressive;
  expect to refine after MVS contact.
- **Documentation hooks.** Brief mention in DEV-RULES.PROJECT § Capture Routing or similar so
  the skill is discoverable from existing capture-surface guidance; final placement and wording
  at PRD time.

---

## Sibling Work Units

- **Plan Instruction Optimization** ([plan-instruction-optimization.md][instruction-opt]) —
  composability concern (forward-compat callback). Lean-shape principles for every-session
  surfaces; arc-reinforce's tier discipline downstream.
- **Worktree Foundation** ([plan-worktree-foundation.md][worktree-foundation]) — composability
  concern (forward-compat callback). Affects when/where arc-reinforce is invoked, not the skill
  itself.
- **Work Organization Reform** ([plan-work-organization-reform.md][work-org-reform]) —
  composability concern (forward-compat callback). Path/structure changes for active-WU
  destinations.

---

## Scope Estimate

**Small.** ~2-3 sessions ballpark. Roughly:

- Skill drafting (`arc-reinforce` + `arc-reinforce-dev`): ~1 session. Two artifacts, but the dev
  variant is a strict superset — second artifact builds on first.
- Workflow drafting (`arc-reinforce.md`): ~0.5-1 session. Procedural scaffolding only; some
  content schematic.
- Harness mirror placement (`.claude/skills/`, `.codex/skills/`): trivial copy + manifest
  re-check.
- Documentation hooks (DEV-RULES.PROJECT capture-routing pointer or similar): small.
- Verification + buffer: ~0.5 session.

**No hard prerequisites.** Can ship at any time after this plan stabilizes.

**PRD-time clarifications expected.**

- Whether to seed triage-out examples from past observed failures or wait for organic accumulation.
- Whether the workflow ships in MVS or defers (current lean: ship in MVS because dev variant's
  framework-routing path needs it, and dev is the primary near-term consumer).
- Final frontmatter field name (`distribution: internal` lean).
- Documentation-hook placement and wording.

---

[arc-commit]: ../../system/skills/arc-commit/SKILL.md
[prepare-commits]: ../../system/workflows/arc/supplemental/prepare-commits.md
[package-sync]: ../../reference/strategies/project/strategy-package-project-sync.md
[instruction-opt]: plan-instruction-optimization.md
[worktree-foundation]: plan-worktree-foundation.md
[work-org-reform]: plan-work-organization-reform.md

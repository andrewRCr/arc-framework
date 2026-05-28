# ADR-021: Introduce the Errand Work Class and Make the Work-Unit Wrapper Optional

## Status

Proposed.

Operational conventions (the concurrency gate, the lighter merge gate, the cheap-branch mechanism, the
tier-model reconciliation) are named here but ratify at the cohort work units' PRDs — Worktree
Foundation, Concurrent Work Conventions, Agile WU Lifecycle. This ADR decides the work-class taxonomy;
the plumbing follows. Promote to Accepted when the cohort PRDs validate the operational pieces.

## Context

[ADR-019][adr-019] reformed the work-unit (WU) lifecycle to a single-branch-per-WU model and separated
two long-tangled concepts: **work unit** (the wrapper noun — a bounded chunk of work with a branch, a
meta file, and one PR) and **atomic** (a work *character* — single-bounded, indivisible). It did not,
however, question the assumption underneath both: that *every* bounded chunk of work is a WU. Under that
assumption a branch + PR implies a meta file and a full lifecycle.

Worktree Foundation makes WU isolation and shifting cheap, which sharpens a tension the single-branch
model left unresolved. Two kinds of work fit the WU wrapper badly:

- **Trivially small work** — a typo fix, a dependency-version bump, a one-line correction. Forcing a
  meta file, a name, a lifecycle, and an archive entry onto a three-line edit is disproportionate
  ceremony, and pollutes the WU namespace with throwaway entries.
- **Cross-cutting planning maintenance** — a dependency note on another WU's backlog stub, a cohort
  cross-reference, a doc fix. Folding it into an in-flight WU's branch pollutes that WU's PR diff and
  plants a latent cross-branch conflict if the touched artifact later forks — the opposite of the
  isolation Worktree Foundation exists to provide.

Neither is a deliverable: no design, no tasks, no resumable lifecycle. Yet under strict 1:1 each must
masquerade as a WU. The mismatch is structural, not cosmetic.

ARC already carries the seams for WU-less work. ADR-019's `commit-footer` defines a `standalone` anchor
with off-WU vocabulary (`maintenance | planning | documentation | refactor`) for "no active WU," and
session-init has a no-active-WU orphan path. The low-level accommodation exists; what is missing is the
*named work class*, the *threshold* that separates it from a WU, and the conventions that keep it
isolated and cheap.

External practice corroborates the shape. Trunk-based and GitHub-flow shops lean on heuristics rather
than a named category for "work too small to track"; "atomic commit" is the idiomatic term for the
smallest single-purpose change, and Gerrit treats "Change" as a first-class review noun. Empirical
review-effectiveness peaks around 200–400 lines / 30–60 minutes and falls off sharply beyond, which
gives a size sanity-check (not a primary criterion).

### Alternatives considered

- **Force every change into an atomic-tier WU.** Preserves strict 1:1. Rejected — disproportionate
  ceremony, WU-namespace pollution, and it re-couples the atomic *character* to the WU *wrapper*, the
  exact tangle ADR-019 separated.
- **Fold cross-cutting edits into the in-flight WU's branch.** Rejected — diff pollution plus latent
  cross-branch conflict; defeats Worktree Foundation's isolation.
- **Defer all such edits to capture surfaces (USER-INBOX) and drain later.** Rejected for
  stub-ready / actionable work — double-work plus inbox bloat. Capture surfaces remain correct for
  *not-yet-actionable* pointers only.
- **Introduce an Errand work class (chosen).** A wrapper-optional class for work fully consumed in a
  single review increment.

## Decision

We will define **Errand** as a first-class work class alongside Work Unit, and make the WU wrapper
optional for work that does not need it.

**The Errand class.** An Errand is a single review increment, fully consumed when its commit lands: no
meta file, no `State` / lifecycle, no name-as-WU. It is tracked by git history (Conventional Commits +
context footer), not by the planning layer (ROADMAP / backlog / `active/`). Its commit carries the
existing `standalone (...)` footer — the Errand *is* the work that anchor was reserved for. An Errand
routes *around* WU machinery rather than through it; the `standalone` footer and the session-init orphan
path are the seams that already make this possible.

**Naming.** "Errand" over the alternatives. *Change* (Gerrit's review noun) is precedented and neutral
but generic — every WU also produces changes — so it carries no lightweight signal. *Patch* is
fix-shaped and misfits the class's maintenance-leaning center (cohort cross-references, dependency
notes, doc fixes). *Increment* is the most precise (an Errand is exactly one review increment) but
clunky as a count-noun. *Atomic* — ARC's own term — was the strongest challenger, rejected on
principle rather than surface collision: "atomic" is a cross-scale *character* (atomic commits, tasks,
WUs), and ADR-019 deliberately separated character from wrapper, so naming the class "Atomic" would
re-tangle them — and it does not nominalize ("an atomic" is awkward). It stays the character; an Errand
*is* atomic-character work that skips the wrapper. *Errand* names the small, complete, standalone,
untracked side-task: its
defining trait is being a bounded task you just complete — not triviality (a consequential one-commit
change is still an Errand) — and it carries the chore-like, not-the-main-concern signal the class
wants. The name lives at the taxonomy layer only; commits use the `standalone (...)` footer regardless,
so "Errand" never enters commit syntax.

**Open question — renaming the "Work Unit" wrapper itself (deferred).** Codifying the Errand sibling
surfaced whether "Work Unit" / `WU` is the right name for the heavy class. Considered and **not adopted**:
*program* (maximal collision in a software-methodology tool — every adopter writes programs) and *labor*
(connotation baggage, and less precise than "work unit"). "Work unit" stays — neutral, accurate, a
recognized term; its only wart is the `WU` abbreviation, addressed far more cheaply by a
spell-it-out-on-user-surfaces style rule than by a constitutional rename. A class rename would be an
ADR-led dedicated sweep (workflows, strategies, templates, CLI, `meta-*` naming) — out of scope for the
cohort. Revisit only if a clearly superior, collision-free term emerges; none has.

**The 1:1 relaxation.** A branch + PR no longer implies a WU. Under full / host-protected `main` an
Errand may take an ephemeral `chore`-type branch + PR; under partial protection it is a direct commit.
Either way it has no meta file and never enters lifecycle, orientation, handoff, or archival. ADR-019's
"one WU = one branch" is unchanged — every WU still has exactly one branch; ADR-021 adds that not every
branch is a WU.

**The threshold.** A Work Unit is warranted when *any* of these hold:

1. the work spans **more than one review increment** (multiple logical commits / internal sequencing);
2. it carries **design that must be authored and referenced** (a Spec);
3. it must be **tracked or resumed** as future or owned work (a roadmap slot, dependencies, an owner, a
   cross-session lifecycle).

None of these → it is an Errand. As an empirical *symptom* check (not the primary criterion), a candidate
Errand that cannot be reviewed in one window (~400 lines / ~60 minutes) is almost certainly
multi-increment and is therefore a WU. The trunk-based one-day rule is explicitly *not* the line: it
governs integration cadence at the review-increment grain, not tracking-worthiness — ARC WUs are
design-bearing and legitimately span sessions.

**Create vs. maintain.** Creating a new tracked unit of future work — a backlog stub — is a (small) WU
even when it is one commit, because its output is a tracked deliverable with a meta file. *Maintaining*
an existing artifact — a dependency note, a cohort cross-reference, a doc fix — is an Errand. The
create/maintain distinction scopes the 1:1 relaxation to precisely where it is justified.

**Atomic-as-character, extended.** ADR-019 separated "atomic" (character) from "work unit" (wrapper) but
still required a wrapper for all work. ADR-021 makes the wrapper *optional* for atomic-character work:
such work now **defaults to an Errand**, and is promoted to a WU only when the threshold trips. "Atomic"
remains strictly a character adjective ("an atomic change," "an atomic task") and is not a work class.
The fate of the *atomic-tier* name within the tier model (atomic / quick / standard) belongs to Agile WU
Lifecycle, which owns the tier model; ADR-021 only shifts the *default realization* of atomic-character
work from "atomic-tier WU" to "Errand."

**Operational conventions (named here, ratified at the cohort PRDs).** The plumbing that makes the
Errand class safe and cheap is owned by the agile-parallelism cohort and detailed in
[`cohort-agile-parallelism.md`][cohort]:

- **Worktree Foundation** — the cheap ephemeral-branch mechanism for Errands, and the concurrency
  oracle's hook (in-flight detection from remote refs + open PRs, path/content-based, all-owner). The
  in-flight blind spot is closed by `init-work-unit`'s existing branch-push step.
- **Errand Enablement** — the `errand-launch` entry primitive, the Errand decision matrix (create/maintain ×
  self-contained/cross-cutting × in-flight routing), and the advisory foreign-artifact gate: the floor that
  makes the class usable, sequenced after Worktree Foundation.
- **Concurrent Work Conventions** — the isolation doctrine (do actionable work once, in its real place;
  capture surfaces only for not-yet-actionable pointers), the concurrency gate (edit a foreign artifact
  only when its WU is not in flight; own work uses the user-scoped check, foreign in-flight work is
  coordinated), and the path-graded lighter merge gate (planning / grooming auto-merges, constitutional
  docs stay reviewed; implemented via a conditional "merge-ok" status job, not naive CI path-filtering).
- **Agile WU Lifecycle** — reconciling the tier model to the Errand/WU split and atomic-as-character.

The concurrency oracle is derived shared state (per [ADR-020][adr-020]'s derived-vs-mutated split):
regenerated from refs / PRs on demand, conflict-free.

## Consequences

### Positive

- Ceremony is proportionate: a typo is an Errand, not a work unit. The WU namespace stays free of
  throwaway entries.
- WU PR diffs stay clean — cross-cutting work no longer pollutes a member branch or plants cross-branch
  conflicts. The isolation Worktree Foundation provides extends to planning artifacts.
- The "do it once, in the right place" discipline becomes affordable: an Errand is cheap enough that
  deferring actionable work to a capture surface (and re-doing it later) stops being the path of least
  resistance.
- Vocabulary coheres: "atomic" is unambiguously a character; "Errand" names the small, complete,
  standalone, untracked side-task as its own class — the lightweight, chore-like signal that "work
  unit" lacks and that the generic "change" (which every WU also produces) blurs.
- ARC's existing `standalone` footer and orphan-session seams gain a name and a purpose rather than
  sitting as latent affordances.

### Negative

- Relaxes a constitutional invariant ADR-019 implicitly relied on (branch + PR ⟹ WU). Anything that
  enumerated WUs by branch must move to path / content-based detection.
- Adds a second work class every actor must learn to distinguish; mitigated by the create/maintain split
  and the threshold's three-part test.
- The concurrency oracle and lighter-gate are new build, deferred to the cohort WUs. Host-side merge
  configuration is host-specific — ARC owns the classification and a recommended recipe, not enforcement.

### Risks

- *Threshold mis-application* (work that should be a WU done as an Errand). Mitigation: the empirical size
  symptom-check and the create/maintain split.
- *Lighter-gate misclassification* letting a substantive change through a light lane. Mitigation:
  path-graded gating keeps constitutional surfaces reviewed; the conditional "merge-ok" job avoids the
  path-filtering-versus-branch-protection footgun.
- *Premature ratification.* Status stays Proposed until the cohort PRDs validate the operational pieces;
  the taxonomy can be exercised before the plumbing exists, but the conventions are not binding until
  then.

## Amending This Document

<!-- Reserved for post-implementation learnings per the three-tier amendment model
     (strategy-adr-methodology.md). Append dated annotations as `**Amendment (YYYY-MM-DD):** …`. -->

**Amendment (2026-05-27):** Worktree Foundation ratifies the **cheap ephemeral-branch mechanism** named under
§ Operational conventions. The Errand cheap-branch path — short-lived `chore`-prefix branch under full
protection / direct commit under partial, tracked by the `standalone (...)` context footer — is now
documented in `strategy-work-organization.md` § Errand Work Class. Status remains **Proposed** pending
Concurrent Work Conventions and Agile WU Lifecycle.

---

[adr-019]: adr-019-work-unit-lifecycle-reform.md
[adr-020]: adr-020-adopt-principle-anchored-scalable-core.md
[cohort]: ../../backlog/planned/agile-parallelism/cohort-agile-parallelism.md

# Draft: Operational Advisory Registers

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-07-23); captured during the
  `session-locus-model` right-sizing audit.
- **Purpose:** Make routine operational narration preserve signal under normal parallel work by assigning each
  advisory to an explicit urgency register.

---

## Problem / Motivation

Session-init and adjacent lifecycle surfaces emit an increasing number of conditional advisories. Under ordinary
parallel work, several conditions are nearly permanent: the base moves while sibling WUs integrate, sibling
worktrees exist, mid-WU commits remain unpushed, and personal notes lag temporarily. Rendering expected steady
state with the same cadence as actionable failures makes the whole surface easier to ignore.

The once-per-calendar-day nudge-marker pattern already reduces noise for selected reminders, but each surface
chooses that behavior independently. There is no common register that tells authors which conditions always render,
which batch into periodic awareness, and which remain silent.

## Direction

Classify routine operational output across session init, recovery, handoff, and CLI-composed narration into three
registers:

- **Actionable now:** always render because immediate intervention is required.
- **Awareness:** batch or rate-limit through the existing daily nudge mechanism.
- **Expected:** remain silent because the condition is ordinary steady state.

Codify the classification where advisory authors encounter it, likely across the session-operations strategy and
the probe/narration composition sites. Inventory the complete current surface before changing cadence so failures
cannot be hidden by a category chosen from examples alone.

## Composition

`session-locus-model` owns a locus-scoped noise diet for its own surfaces. This WU generalizes the register
discipline across routine operations after that implementation integrates; it does not reopen the completed locus
model.

## Carried input from `session-locus-operability-hardening`

That work unit reached this territory from its own faults and stopped at the boundary this section records,
keeping the union, the vocabulary, and the cadence mechanism here. Four things it settled or measured travel
forward as input rather than as decisions binding this unit.

**The discriminator is transition, not age.** An advisory should fire when a condition **becomes** true, not for
as long as it **is** true. A state that has held for forty sessions carries no information — the operator has
already decided not to act on it, and repeating it trains the habit of skipping the section. Age is a weaker
proxy: a fresh condition can deserve immediate surfacing, and an old one can be permanent furniture. The worked
example was a shipped work unit's residue, unchanged since it shipped, re-emitted every session until it read as
background rather than signal.

**Two supporting cuts come with it.**

- **Context is not advisory.** Branch, dirty state, ahead/behind counts are the state the next operation acts on.
  They belong in the orientation header and are cheap to render every time. The budget governs the conditional
  sections, which propose that the operator go and _do_ something.
- **An advisory with no available action is not an advisory.** A surfaced condition with no verb the operator can
  currently run is a complaint. Either give it an action or do not raise it. The locus work hit this shape
  directly: an advisory reading "reconcile manually before cleanup" named no mechanism, and the state it reported
  was the correct end of the lifecycle.

**Transition tracking is not free, and the cost is unpriced.** Firing on _becoming_ true requires remembering what
was true last session — new durable per-condition state, plausibly sited near the existing gitignored last-nudge
markers. The existing daily-nudge markers reduce frequency while still reporting steady state, so they are the
right instinct at the wrong altitude; whether they survive alongside transition tracking or are replaced by it is
this unit's call, and it is a storage design rather than a rendering one.

**The surface needs counting mechanically, and the attempts so far are not trustworthy.** Two independent counts
of Step 6's conditional sections returned 31 and 32, and two successive classifications of which sections are
locus-triggered were both wrong — the current-husk advisory reads branch, HEAD, marker, and worktree path with no
locus input, and the linked-worktree cleanup-residue section fires on the same sweep and orphan inputs as sections
already classified as veto-only. Do not inherit any figure from this note or from
`draft-session-locus-operability-hardening.md`; derive the census from the workflow and the composing source
before classifying anything. The 3 rate-limited nudge markers are the one figure that has reproduced.

**A classification trap worth naming, which is what those errors have in common.** A condition's **trigger** and
its **gate** frequently sit in different subsystems: the sweep arms and orphan branches fire on worktree and
lifecycle facts while locus participates only as a veto, and the rename-move arm reads no locus state at all. A
classification keyed to "which subsystem owns this advisory" will mis-sort every such section. Key it to what
makes the section fire, and expect the owning-subsystem intuition to be wrong more often than it is right.

The clearly non-locus majority is this unit's regardless of how the census resolves: worktree sync, base distance,
base-branch sync, the two reconcile surfaces, notes state and drift, compaction, dirty, retired subdirs, in-flight
work units, the two materializable routes, and housekeep. That is why an ordinary session stays noisy after the
locus work ships — the single advisory an observed healthy session rendered was base drift, from this unit's half.

**The vocabulary is already forked in-tree, which sharpens § Direction's three-register proposal into a
reconciliation rather than an introduction.** Two typed register fields already ship with different namings:
`BaseDriftRegister` carries `calm` / `attention` / `degraded` (`lib/git/base-drift-types.ts`), and
session-init's `notesDriftSurface` carries `expected` / `caution`. Each was minted locally for one surface. A
third naming that does not absorb these two leaves three vocabularies where the problem was one too many, so the
inventory owes a mapping for the existing fields, not only a classification of the conditions.

---

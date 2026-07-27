# Draft: decompose-transform-integrity

- **Origin:** [internal] — two live decompositions on 2026-07-26 (`review-protocol-alignment` symmetric,
  `review-protocol-alignment` extraction) each failed or required manual surgery against the shipped transform.
- **Purpose:** Make the decompose transform run, conserve, and commit correctly against the real planning topology,
  and make its tests exercise that topology rather than a simplified one.

---

## Problem / Motivation

`decomposition-machinery` and `decomposition-hardening` both shipped, yet the first two decompositions attempted
after them could not complete as documented. The failures are not a single defect; they cluster into three areas
plus one enabling cause.

**Run context and write authority disagree — in both arms.** The symmetric arm prescribes a base checkout, but
`resolveComposedLifecycleIndex` grants `writablePath` only when an agreeing origin record exists in the current
checkout. Planning artifacts are branch-private, so the verb refused before mutation with "no current-checkout
write authority". The extraction arm has the mirror defect: its run context is the origin's worktree, while its ship
leg expects a base-cut `chore/decompose-<name>` branch, so member scaffolds and the ROADMAP regen staged onto the
origin's planning branch — unreachable by the ship leg, and invisible in the backlog until the origin merges.

**Conservation covers the wrong universe.** The conserved set is the origin artifact group, but a planning branch
carries more: the symmetric run exposed an already-authored `review-adapter-extensibility` stub and a project
compatibility-posture rule. A base-rooted transform would strand these silently; the source-rooted workaround
preserves them, but neither the cut map nor the decomposition PR account names them.

**Allocation granularity fails in both directions.** Source units scan at H2. Where member concerns live as H3
under `## Scope`, no whole source unit leaves the origin, `sourceAllocations` is honestly `[]`, and the conservation
gate's machine-checkable record is empty while nothing fails loudly. Where the design nests below a single
`## Proposed Design`, the whole design is one indivisible unit and headings had to be promoted and committed before
a cut map could be authored. Cross-cutting sections that belong to no single member remained atomic and had to be
routed to the cohort document by hand.

**Lifecycle boundaries leak.** A pre-mutation refusal left an empty `chore/decompose-*` branch that session-init
then misclassified as errand residue. More seriously, the finalized transform deadlocks at commit: decompose
supplies `supersededSource` so its staged ROADMAP omits the retired origin, while the pre-commit renderer calls the
same index view without supersession input, sees the linked plan worktree, and requires the origin row back. The
prescribed remedy — regenerate — makes the hook pass by publishing a readiness view that contradicts the finalized
transform. The errand on `fix/decompose-roadmap-supersession` is already in flight against this deadlock, judged
urgent enough to fix ahead of this work unit; treat it as delivered work to confirm, not to redo.

**The deadlock is the severe case of a general seam.** The derived ROADMAP has several renderers that do not agree
on the same view, and the disagreement surfaces routinely rather than exceptionally. Three instances inside a
single day: a base merge conflicted on the file and needed the dedicated conflict auto-remedy to regenerate from
the staged-index projection; `arc stub` regenerated the file at mint time, yet the pre-commit renderer rejected its
output and required a re-render from staged sources for a ten-line diff; and the supersession deadlock above. The
first two are benign — clean remedies, correct outcomes — while the third publishes a view contradicting the
finalized transform. Fixing only the third leaves the seam. Worth deciding whether the ROADMAP wants one renderer
with explicit inputs (staged versus worktree, supersession, degraded views) rather than several callers of a shared
index view that each supply different context.

**The enabling cause: test topology.** Each of the above sat behind a fixture that does not reproduce the real
lifecycle. The symmetric E2E commits origin artifacts on base and then branches, so it never builds the ordinary
planning topology and gave positive assurance over exactly the case that failed. The lifecycle E2E installs only
the decompose-record hook rather than the full pre-commit chain, so the ROADMAP deadlock cannot surface. The
extraction integration test ships an empty `sourceAllocations`, so the unenforced-conservation case reads as
passing. This is one blind spot with several symptoms, and it explains how two work units shipped believing
themselves complete.

## Candidate Shape

- **Test topology first.** Build fixtures that start through the normal planning lifecycle and install the
  repository's complete pre-commit chain. Without this, every fix below is unverifiable by the tests that missed
  the defect.
- **Reconcile run context with write authority.** Settle one coherent locus per arm and name the artifact split
  where one is needed — member scaffolds on the result branch, origin thinning on the origin's branch.
- **Widen and report conservation.** Conserve the complete branch-private planning delta, not only the origin
  artifact group, and name what moved in the cut map and PR account.
- **Fix allocation granularity.** Decide whether the scanner needs finer semantic units or the planning forms need
  decomposition-ready heading structure, and give cross-cutting sections a declared destination.
- **Close the lifecycle boundaries.** Make a pre-mutation refusal clean up or accurately classify the branch it
  cut. For the commit-time ROADMAP supersession deadlock, **verify `fix/decompose-roadmap-supersession` against a
  real decomposition** once it ships, and scope this work unit to whatever it leaves open — do not re-implement it.
- **Add an allocation-unit preflight** that reports source headings and digests before mutation, so a coverage
  mismatch surfaces before the destructive gate rather than at execution.

## Design Questions

- Whether the run-context fix is an explicit materialize/land primitive or a first-class source-rooted result
  branch. This is the one genuinely open design fork and it likely sets the work unit's weight.
- Whether conserving the branch-private delta belongs to the transform or to a separate reporting pass.
- Whether cross-cutting sections route to the cohort document by rule, or the cut map gains an explicit
  destination kind for content owned by no member.
- Whether the empty-`sourceAllocations` extraction shape is acceptable by design or must be made expressible.
- Whether the ROADMAP renderer seam belongs here at all. Unifying it reaches well past decomposition, so this may
  own only the supersession-input fix and route the wider consolidation to whoever owns the readiness view.

## Boundaries

- **Not** the when-to-cut question. Discriminator, recorded verdict, tripwire, and stack-vs-coupling belong to
  `decomposition-doctrine`.
- **Not** mint-time properties of the resulting members. Commitment-level inheritance and close-with-launch belong
  to `stub-mint-to-launch`.
- Charter is transform integrity — run, conserve, commit, and prove. Resist growing into a general home for every
  decompose concern; adjacency is not membership.

---

# Notes: delivery-plan-record

- [Verified substrate facts](#verified-substrate-facts)
- [Claims that did not hold](#claims-that-did-not-hold)
- [Field-evidence anchors](#field-evidence-anchors)
- [Review did not converge, and the plan is scoped accordingly](#review-did-not-converge-and-the-plan-is-scoped-accordingly)
- [Delivery topology and sequence](#delivery-topology-and-sequence)

---

## Verified substrate facts

Each was checked against source during spec authoring. Line anchors are as of the base merged at spec time; treat
them as starting points rather than guarantees, but the facts themselves gated design decisions.

**Schema kernel.** `strict-current` is a real registered `MigrationPosture`, not a phrase — `lib/kernel/schema/`
`registry.ts` defines the union and validates it at registration, and the posture is registered widely across the
session-envelope, layout, validation-surface, and review-gate roots. Canonical serialization sorts keys by UTF-8
byte order via `Buffer.compare` (explicitly not `localeCompare`), which is what makes the digests byte-stable.
Domain-separated preimages are pervasive: strict Zod objects carrying a `domain: z.literal(...)` field parsed
before digesting, with roughly fifteen distinct domains already in use.

**The local record store.** `RepositoryGitCommonStatePublisher` resolves its root through
`git rev-parse --git-common-dir`, so every linked worktree agrees on the path and checkout relocation cannot move
it. It takes a bounded-wait advisory lockfile, reads, applies, and writes through a temp-file rename. The store
above it refuses a stale `expectedVersion` with a typed `version-conflict`.

Four properties bound how much of this delivery can reuse:

- the publisher hardcodes a `<git-common-dir>/arc/review-gate/<namespace>` root;
- its namespace type is a **closed** five-member union of review names;
- the store above it is typed to review operation state;
- it lives under the scripts tree, and the library tree does not import from there (zero imports; the dependency
  runs the other way).

So the reuse is a pattern plus a concurrency model, not a callable class. The compare-and-swap is an **integer
revision counter** with no predecessor pointer anywhere in it, and the store holds **one record per name** — which
is why only the assurance store's publication shape is priced as new work.

**Ref namespaces get nothing for free.** No `remote.*.fetch` refspec is ever written by any install or join path,
and the previously shipped notes refspec was deliberately removed. Refs under `refs/arc/**` therefore do not arrive
on a clone or on any ordinary fetch or pull. The only working cross-machine record transport is the notes shape: an
explicit named fetch into a unique temp ref with `--refmap=`, an ancestry classification, and a compare-and-swap
`update-ref` onto the live ref, driven by a dedicated command. The pushed `refs/arc/**` refs that do exist are
identity-partitioned, and the sync-state one is written and pushed but **never fetched to be read** — its own module
doc describes a sibling-clone scenario no transport in the codebase delivers.

**Work-unit identity is the slug.** The metadata record carries no identity field; the active unit's name is
recovered from its artifact path. `arc rename <slug> <new-slug>` ships and renames a work unit "and its branch,
workspace, remote, marker, and worktree identities" while the unit is live.

**Rename evidence is forward-keyed and ref-scoped.** A rename writes a retirement receipt keyed on the **old** slug
as its subject, carrying the new one as `result.targetSlug`. The disposition query matches on the subject, so a
query keyed on a unit's current name matches nothing. Receipts are **tracked** content under
`.arc/system/.internal/retirement-receipts/` enumerated with `git ls-tree` against a ref, so visibility depends on
which ref is read. A transitive resolver with cycle detection already exists and returns a closed result set;
rename preflight refuses only a self-rename and checks only live occupancy of the target, so an `A → B` then
`B → A` cycle is accepted and both receipts stand.

**Completion protocol.** `Goal` is preserved verbatim at completion. `Outcome` is a second protected surface but is
**added** at completion and only when it earns signal, so it is absent from authoring-time state. `Goal` is required
on parents and opt-in, default-absent on subtasks, and the formatting standard's own diagnostic pushes toward
dropping noise-shaped subtask goals. No rule anywhere directs a title change at completion.

**Commit-footer attribution.** The _documented_ task-reference forms are two-level — single, range,
non-contiguous — and do not mention subtasks, but the _enforced_ grammar is `[0-9]+(?:\.[0-9A-Za-z]+)+` in
`commit-check/policy.ts`, which admits arbitrary dotted depth: `X.Y.a`, `X.Y.R`, `X.R`, and `X.Y.R.a` all
validate, and only a bare phase number fails. A clear majority of recent task-naming footers carry a deeper id
than the documented examples show, dominated by letter-suffixed subtask forms, and the revision family is live.
Normalization to the parent inventory is therefore required by the inventory's parent granularity, not by any
narrowness in the validator.

**Revision-family ids are parents, not danglers.** `X.R` was twice described here and in the spec as resolving to
no parent implementation task. It is wrong: shipped task lists render phase-level follow-ons as ordinary parent
headings, and the scanner's own body pattern accepts `2.R` and `5.R.a` as parent ids, rejecting only all-numeric
third segments. A footer citing one resolves to it. The genuinely unresolvable case is an id
absent from the inventory — a task deleted or renumbered after the footer was written — which is what keeps the
derived entry's advisory disposition necessary.

## Claims that did not hold

The design repeatedly rested on substrate guarantees it had asserted rather than established. Four were caught
during drafting; several more during spec authoring. The pattern is worth carrying into implementation: **check the
substrate before writing the sentence that depends on it.**

Corrected during spec authoring:

- `refs/arc/**` was described as a **shared** tenancy. Every pushed ref under it is identity-partitioned, and no
  project-scoped pushed namespace exists. This is what moved storage to a local-only v1.
- The completion protocol was said to direct a **title update** at completion. No such rule exists anywhere.
- The footer contract's **documented forms were conflated with its enforced grammar**, in both directions — first
  read as admitting subtask ids, then over-corrected to two-level-only. The validator admits arbitrary dotted
  depth; only the documented examples are two-level. Read the regex, not the contract prose.
- Rename resolution was first specified in the direction that **cannot find the plan** — querying by the current
  name, which is a receipt's target and never its subject.
- The plan record was given a `landed` discriminant whose refusal required a **landing observation the constructor
  cannot see**, contradicting the rule that host-derived position is not writable state.

Two identities were removed as unsupported machinery after failing a goal-to-mechanism trace — a stored intermediate
chunk identity and a stored seam identity — each a registered preimage and a durable schema commitment with no
reader. When adding an identity, name its consumer first.

## Field-evidence anchors

**The two hand-run cuts the success signal round-trips.** The seven-slice stack plus its terminal merge is fully
shipped; its slice branches have since been reaped, so base and head pairs must be reconstructed from the recorded
merge parents. The thirteen-slice cut's branches still exist locally.

**A base merge sits inside a delivery slice.** Commit `a0e6d1533` — "Merge current base into legacy delivery" — is a
genuine two-parent merge inside slice 06 of the shipped stack, and its second parent is the previous slice's merge
into the base. This is the concrete case that forces the partition to run over work-unit-owned contribution along
the first parent rather than over raw commits, and any implementation of the retrofit entry should use it as a test
fixture rather than a hypothetical.

**Attribution is sparse by design, not by accident.** A substantial minority of a branch's commits name no task at
all — review-driven fixes above all — and the footer contract blesses `code review`, `maintenance`, and
`incidental during …` alongside a task reference. A member whose range is mostly review fixes deriving no task ids
is a valid member, not a composition failure.

## Review did not converge, and the plan is scoped accordingly

Three adversarial passes ran over the finished suite at task generation. They returned 15, 11, and 13 findings;
majors went 9, then 6, then 9. Every finding was verified against source before disposition and none was
manufactured, so the passes were working — the artifact's error surface is simply wider than three whole-artifact
passes exhaust. Two facts sharpen that.

**Fix rounds introduced defects of the class they fixed, four rounds running.** Five of pass two's findings were
produced by pass one's repairs; pass three found another in a repair made minutes earlier. Fold findings in small
verified edits, not sweeps.

**A substrate claim survived four reviews before failing.** The assertion that a phase-level revision id resolves
to no parent task passed the spec's own four adversarial passes, a dedicated grounding audit, and two adversarial
passes before pass three checked it against shipped task lists and the scanner and found it false. The pattern
this file already records — check the substrate before writing the sentence that depends on it — held again, and
the check that finally caught it was two greps.

The response is in the task list's per-member procedure rather than a fourth pass: each member opens with a
grounding audit over its own phases, which bounds the surface to roughly a quarter and puts the implementer in
front of the findings. Expect that audit to find things. Treat every task as a claim about the codebase.

## Delivery topology and sequence

The cut is hand-run. Neither the delivery mechanism this work unit builds nor the decomposition machinery is
available to author it, which is the same bootstrap problem the two field runs faced. The member table lives in
the task list, in the shape the authoring command will eventually render and replace; this section carries the
rationale and the runbook.

**Why the work needed cutting.** Estimated at roughly 8,400 source lines plus tests at the package's measured
1.27× ratio, plus field-reconstruction fixtures — about 19,000 to 22,000 changed lines across 85 to 100 files.
The project's demonstrated single-pull-request scale is a median near 4,000 insertions with a ceiling at 7,199,
so one change set would run about three times the largest thing this repository has merged.

**Why stack-to-`main` rather than the integration-target projection.** The integration-target projection makes
each member's _review_ small but leaves the terminal pull request carrying the whole contribution, which is the
enforcement asymmetry the design already records from the other direction. The goal here is that no
over-sized pull request exists in the repository at all, and only the stack projection delivers that: every
member reaches the protected base at member size.

**Why the compatibility caps the first field run needed are not expected here.** Those caps existed because
candidate heads advertised runtime surfaces their own code had not yet wired. Members 1, 3, and 4 are library
additions with no command surface, so they advertise nothing. Member 2 is the only one that adds verbs, and they
fully perform what they expose: a command group that does not yet contain execution verbs is this work unit's
charter rather than an unwired surface — it ships authoring-without-execution even at completion. Re-check this
per member before cutting, since it is an assessment of shape rather than a measurement.

**Lifecycle-artifact exclusion is the discipline that avoids the measured bystander cost.** The damage recorded
against a concurrent work unit — `ambiguous-active-wu` commit refusals, multiple-candidate session resolution,
a null session-notes pointer, shadowing advisories at every lifecycle invocation — came from the first slice
publishing its unit's artifacts to the base in active state. Members 1 through 3 therefore exclude this unit's
metadata, spec, notes, and task list, and member 4's implementation-review head excludes them too. The artifacts
arrive only as member 4's same-PR terminal tail, together with archival. The exclusion is stated as an invariant
that `delivery-stack-topology` will enforce, but obeying it needs no machinery. Its cost is that a member reviewer
cannot see which tasks the member closes, which the task list's member table substitutes for.

**Runbook.** Cut each member from the `main` containing its predecessor, target the predecessor's branch, and
retarget to `main` as the predecessor lands. Close each member with a Tier 3 run at its exact head before opening
the pull request. Reconcile the unlanded suffix after every base advance the series absorbs — with two work units
live alongside this one, that reconciliation is the principal running cost of the projection, and it scales with
how long the series stays partial rather than with member count alone. Where ARC's own review clearance cannot
admit a member ref, use an explicitly authorized administrative merge, as the thirteen-slice run is doing; the
gate's admission of delivery refs is a known open edge and is not a gating consideration here.

Member 4 closes differently at the tail without becoming a fifth member. Publish, test, and request manual hosted
review of its implementation candidate while the retained control checkout still carries the active lifecycle
generation and the candidate carries none of those artifacts. Once that implementation candidate is settled,
enter one attended terminal window: quiesce scratch and member checkouts; persist the exact control/member heads and
pull-request coordinates; advance the retained control ref so no separate ref exposes the active group; and append
one atomic same-slug lifecycle transition that deletes the planned materialization, adds the completed archive, and
regenerates ROADMAP. Push that documentation-only delta to member 4's existing pull request, rerun required hosted
checks, and explicitly resolve manual-review applicability for the new exact head. Then obtain exact-head admin-merge
authorization, merge, and retire the work-unit locus and worktree without an intentional session break. Never delete
a locus record by hand. If the window is interrupted after the lifecycle transition begins, stop and recover from
the persisted coordinates rather than improvising cleanup.

**This cut becomes a third field-evidence datapoint.** It is the first run authored _before_ implementation
rather than retrofitted, so it exercises the `from-tasks` shape the two recorded runs could not. Watch for the
three events the design treats as a watch list rather than a gate: a rewrite cascade that breaks plan-ordered
membership, a stack abandoned mid-series, and a host merge method that silently breaks commit identity.

---
purpose: Transform a live work unit into a cohort of member WUs — the cut-map judgment and conservation gate over the `arc decompose` mechanics.
audience: agent
arc:
  extensions:
    - pre-push-review
---

# Workflow: Decompose Work Unit

Turn one work unit into a **cohort** of self-contained member WUs. A genuine lifecycle transition — the WU
changing *what it is* — not a code-shipping integration: nothing merges as a deliverable and no `completed/`
archive is written for the origin (the cohort carries the eventual archive when its last member ships). The
[`arc decompose`](#5-run-arc-decompose) verb owns the in-verb mechanics (batch member scaffold, origin **artifact**
retirement, incoming-edge re-point, ROADMAP regen); this workflow supplies the **judgment** — the cut-map, the
conservation gate, the cohort coordination, and the shape selection — plus the ship legs and the out-of-band
post-merge teardown of a started origin's branch + worktree.

The cut — members, slugs, dependency edges, deliverable boundaries — is **not decided here.** It arrives as the
**cut-map** from the [`assess-cohort-fit`][assess-cohort-fit] method at planning time; this workflow consumes it
and never re-derives it. Run it only to split a draft that *matured* into a cohort; when `assess-cohort-fit` fired
*during* draft-design (no monolith ever formed), author directly into the cohort structure and skip this workflow.

The cut selects two independent axes — resolve both ([Step 1](#1-resolve-the-matrix-cell--gate)):

- **Parent position** (cohort placement): standalone → top-level cohort; in-cohort → sub-cohort; at-cap → lateral
  fan-out ([§ At-cap arm](#at-cap-arm)).
- **Transform shape** (origin disposition): symmetric / extraction / backlog-stub-source / heterogeneous-home —
  each a [whole block](#transform-shape-arms) carrying its run-context, distribution scope, and any extra leg.

> [!NOTE]
> **Not an integration.** No code deliverable ships and no `completed/` entry is written for the origin. The
> ship is PM-artifact grooming on the auto-merge lane ([Step 7](#7-ship-per-protection-mode)), not a deliverable PR.

---

## Steps

The spine below is shape-agnostic; each step defers its shape-specific delta to the matching
[transform-shape arm](#transform-shape-arms). Read the spine for the invariant flow, then the one arm your cut selects.

### Active-state precondition guard

Run first, before resolving the cell — route on the origin's `(phase, location)` and any committed code:

- **`Planning` origin** (the realized cases) → no guard action; proceed to [Step 1](#1-resolve-the-matrix-cell--gate).
- **`Active` origin, built code belongs to one member** → **extraction-from-Active**, the first-class Active path:
  the origin stays `Active`, only unbuilt scope is extracted ([extraction arm](#extraction-arm)). Proceed.
- **`Active` origin, genuine multi-member-built code** (committed work spanning several would-be members) → **stop.**
  Full-split is recognized and routed, never run here: there is no `decompose@active` edge and this workflow performs
  no commit-allocation or git-history surgery. Route to the full-split escape-hatch guidance in
  [Work Organization Strategy § Active-state decomposition][work-org-active-state].

This guard **directs**; it never runs git surgery.

### 1) Resolve the matrix cell & gate

Confirm a cut-map is in hand from [`assess-cohort-fit`][assess-cohort-fit] — the members (with slugs and resolved
`Class`), the internal dependency edges, the per-destination distribution, and the dispositions. If none exists,
**stop** — run the method first; this workflow does not decide the cut.

Resolve both axes:

- **Parent position** from the origin's existing `**Cohort:**` against the one-level nesting cap (see
  [Work Organization Strategy § Decomposition][work-org-decomp]): standalone (no cohort) → top-level cohort;
  in-cohort (single segment) → sub-cohort; at-cap (two segments) → lateral fan-out ([§ At-cap arm](#at-cap-arm)).
- **Transform shape** from the origin's `(phase, location)` and the cut's disposition — jump to the matching
  [arm](#transform-shape-arms) for its run-context and distribution scope.

### 2) Conservation gate — the allocation map

The origin's design is **split, not copied**, under a gate that guarantees no silent loss. Map *every* origin
section and design-point — **and every dependency edge** — to exactly one destination, or *dropped-with-reason*
(superseded, or satisfied internally by the cut):

1. **Allocate.** Each item → a member's `draft-<member>.md`, the cohort doc's cohort-level coordination, a member's
   per-member coordination, an existing/atomic home (the [heterogeneous arm](#heterogeneous-home-arm)), **retained
   on the surviving origin** (the [extraction arm](#extraction-arm) — an un-extracted section stays put; a conserved
   destination, not a drop), or dropped-with-reason.
2. **Classify** by the design-vs-coordination boundary: design that drives a member's task list → that member's
   draft; ownerless shared material → cohort-level coordination; a member's exposes/consumes surface → per-member
   coordination; an owned contract → its owner's draft, with a pointer + consumer list in the cohort doc.
3. **Conserve.** Assert every allocated item lands in exactly one destination or is dropped-with-reason, at the
   arm's **scope**: the symmetric / stub-source arms conserve the *whole* draft; the [extraction arm](#extraction-arm)
   conserves only the *extracted subset* — the surviving origin absorbs the remainder as a retained entry, not a
   drop. For an existing/atomic home, "lands" carries an ordering: the destination edit is staged **in the transform,
   before the origin retires** — never deferred.

The allocation map feeds both the cut-map file ([Step 4](#4-compose-the-cut-map-file)) and the decomposition PR
description ([Step 7](#7-ship-per-protection-mode)).

### 3) Author the cohort coordination

The verb scaffolds member skeletons but never writes coordination content. Author it here:

- **Mint the (sub)cohort doc** under `backlog/planned/<cohort>[/<subcohort>]/` from [`template-cohort.md`][template-cohort],
  carrying forward the origin draft's coordination (shared contracts, cross-member seams, closeout criteria) per the
  Step 2 allocation. At minimum the required one-paragraph `Purpose` floor. Membership stays **derived** from each
  member's `Cohort` field — the doc records coordination, never a roster. *Skipped on the [at-cap arm](#at-cap-arm)*
  (no cohort node minted).
- **Backfill the parent cohort doc** to its `Purpose` floor when the minted (sub)cohort nests under a grouping
  directory that has no `cohort-<name>.md` yet — no doc-less grouping may exist. A no-op where the parent doc
  already exists.

### 4) Compose the cut-map file

Serialize the Step 2 allocation into the structured cut-map file `arc decompose` consumes — a JSON file authored
to a scratch path (an input artifact, never committed). The validated shape:

```json
{
  "schemaVersion": 2,
  "origin": { "slug": "<origin>", "phase": "Planning|Active", "location": "provisional|planned|active" },
  "shape": "symmetric|extraction|backlog-stub-source|heterogeneous-home",
  "parentPosition": "standalone|in-cohort|at-cap",
  "cohort": "<cohort>[/<subcohort>]",
  "entries": [
    { "kind": "new-member", "destinationId": "member:<m>", "slug": "<m>", "workClass": "Light|Heavy|Novel" },
    { "kind": "surviving-origin", "destinationId": "origin:<origin>", "slug": "<origin>", "disposition": "keep-active|park" },
    { "kind": "existing-home", "destinationId": "home:<name>", "target": { "kind": "work-unit", "slug": "<slug>" }, "home": "fold" },
    { "kind": "cohort-coordination", "destinationId": "cohort:<cohort>", "cohort": "<cohort>[/<subcohort>]" }
  ],
  "internalEdges": [ { "from": "<m2>", "to": "<m1>" } ],
  "sourceAllocations": [
    {
      "sourceId": "sha256:<64-lower-hex>",
      "disposition": {
        "kind": "target",
        "destinationId": "member:<m>",
        "targetLocator": { "artifact": "draft-<m>.md", "kind": "section", "headingSource": "<H2 text>", "occurrence": 0 }
      }
    },
    { "sourceId": "sha256:<64-lower-hex>", "disposition": { "kind": "drop", "reason": "<why>" } }
  ],
  "incomingEdges": [
    { "dependent": "<dependent>", "disposition": { "kind": "replace", "replacementTargets": ["<m>"] } }
  ],
  "outgoingEdges": [
    { "prerequisite": "<prerequisite>", "disposition": { "kind": "targets", "targets": ["<m>"] } }
  ]
}
```

Each source ID is the canonical `sha256:` digest of `{ "schemaVersion": 2, "sourcePath": <path>,
"sourceLocator": <locator> }`. Markdown companions split into a preamble plus top-level H2 sections; repeated
normalized H2 source uses zero-based `occurrence`. Non-Markdown companions use `whole-file`. Allocate each live
source ID and each incoming/outgoing edge exactly once; a no-target disposition requires a non-empty reason.
Existing-home targets use a structured `work-unit`, `draft-block`, or `document` object. Omit `cohort` only on the
at-cap arm.

The verb inherits `Origin` / `Owner` / `Priority` from the origin, takes `Class` per member, dual-places `Cohort`
in meta + draft, and writes `State: Planning`. `Depends On` comes only from `internalEdges` and the exact outgoing
dispositions; the incoming sweep applies each declared replacement or drop without disturbing unrelated targets.
The entry kinds each arm uses are named in its [arm block](#transform-shape-arms).

### 5) Run `arc decompose`

> [!IMPORTANT]
> `workflow-interlock`: Stop before running the transform — it is the destructive act (origin artifacts removed,
> incoming edges re-pointed; the branch + worktree reap is the separate post-merge step in
> [Step 7](#7-ship-per-protection-mode)). Surface the **allocation map** (Step 2 — where every section and edge
> lands, or why dropped), the cohort-consistency check ([Step 6](#6-verify-cohort-consistency)), and the planned
> origin disposition + ROADMAP delta. Await approval before running the verb.

Run the verb with the cut-map from the run-context the [shape arm](#transform-shape-arms) names:

```bash
arc decompose <origin> --cut-map <scratch-path>
```

For a retirement shape, the verb validates the map and complete live inventories, writes and stages the durable
preparation **before mutation**, then runs the token-bound deterministic legs: batch-scaffold the members under
`backlog/planned/<cohort>[/<subcohort>]/<member>/` (`meta-` + skeleton `draft-`), retire the origin through its
reserved edge, apply the exact incoming dependency dispositions, and regenerate the ROADMAP. It stages the closed
prepared result and prints the receipt ID required by Step 7; it does not commit.

The [extraction arm](#extraction-arm) has no retirement preparation or receipt: the origin survives, so the verb
scaffolds and stages the extracted members in one invocation. A started retired origin's branch + worktree are
**not** torn down in-verb — that teardown is out-of-band, a post-merge `arc teardown <origin> --force`
([Step 7](#7-ship-per-protection-mode)); the verb retires only the origin artifacts.

### 6) Verify cohort consistency

Before the ship commit, verify the three cohort-consistency conditions over the minted structure:

1. **Field ↔ dir path-match** — each member's path-valued `**Cohort:**` matches its
   `backlog/planned/<cohort>[/<subcohort>]/` parent directory.
2. **Every grouping dir carries a doc** — each grouping directory has a `cohort-<name>.md` with at least a
   `Purpose` floor (Step 3).
3. **No orphan per-member sections** — every per-member section in a cohort doc keys to a derived member.

The cohort-consistency structural guard re-checks these at commit time as the backstop; confirming here surfaces
drift at the Step 5 interlock rather than after the origin is gone.

### 7) Ship per protection mode

`arc decompose` left the transform staged. Distribute the design into the scaffolded member drafts and author any
[heterogeneous direct edits](#heterogeneous-home-arm) per the Step 2 allocation — content the verb does not write —
then, for every retirement shape, finalize the exact preparation using the receipt ID printed in Step 5:

```bash
arc decompose <origin> --finalize <receipt-id>
```

Finalization reopens that one record directly; the scratch map is no longer required. It verifies the unchanged
source/result refs, complete source and dependency dispositions, resolved destination locators, closed staged-path
set, and exact transition patch before atomically replacing the preparation with the finalized receipt. A refusal
leaves the preparation recoverable for correction and retry. Only the finalized receipt may commit. The extraction
arm skips this command because it did not retire the origin.

Then commit and ship per [Work Organization Strategy § Branch Protection Modes][work-org-protection]:

- **Partial** — a direct base commit.
- **Full** — ship on a short-lived `chore/decompose-<name>` branch + PR (the auto-merge lane), cut from the base
  checkout.

**The allocation map is the PR description.** Lead with the operation (`decompose <name> into cohort <cohort>:
<m1>, <m2>, <m3>`), then account for where every origin section and dependency edge landed (member draft / cohort
doc / existing home / dropped-with-reason) — the audit trail a reviewer reads to confirm nothing was lost. Plain
prose, legible without ARC-internal knowledge; artifact references kept as backticked filenames.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): decompose <name> into cohort

- Mint cohort <cohort> + member stubs in backlog/planned/
- Distribute origin design across member drafts (allocation map in PR)
- Re-point incoming Depends On to delivering members
- Retire origin; regenerate ROADMAP

Context: meta-<name>.md (maintenance)
```

Push the grooming branch and open the PR:

- **Extensions** · `#pre-push-review`: If `pre-push-review` is in the active-extensions list, load and execute its
  `.actions` before the push. Otherwise, skip.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin chore/decompose-<name>`.

```bash
gh pr create --base main --head chore/decompose-<name>
```

> [!IMPORTANT]
> `integration-interlock`: Stop before merge. Surface PR status (open threads, required approvals, checks); await
> explicit 'merge' direction before merging.

```bash
gh pr merge <pr-number> --squash   # or per merge.strategy
```

**Post-merge teardown — started origin only.** For a started (`Planning`) origin (the [symmetric arm](#symmetric-arm),
or a [heterogeneous](#heterogeneous-home-arm) cut over one), reap its now-orphaned `plan/<name>` branch + worktree
**after** the decompose has merged — never before, or the artifact retirement would not yet be durable. Run from the
base checkout (so the locus survives the worktree removal):

```bash
arc teardown <origin> --force   # un-shipped / force mode: reaps the retired plan branch + worktree
```

`--force` selects the un-shipped teardown mode: the origin is retired (not in `completed/`) and its `plan/<name>`
branch is unmerged (the design was redistributed into members, not git-merged), so the conservation gate above is the
upstream safety, not git-containment. The in-place arm switches the primary to base; a linked arm removes the
worktree and locus-hops. The [backlog-stub-source arm](#backlog-stub-source-arm) (no branch) and the
[extraction arm](#extraction-arm) (origin survives) owe no teardown.

Then retire the origin's per-WU user workspace subdir (filesystem op only, contents gitignored):

```bash
arc user close <name>
```

---

## Transform-shape arms

Each shape is a whole block: its run-context for [Step 5](#5-run-arc-decompose), its distribution scope, and any
extra leg. The parent-position axis ([§ At-cap arm](#at-cap-arm)) is orthogonal and composes with any shape.

### Symmetric arm

The realized cell: a live `plan/<name>` origin in `**State:** Planning`, cut-map in hand. The whole draft is
distributed to N new members (all `kind: new-member`); the origin is **retired** (its artifacts removed), and its
`plan/<name>` branch + worktree are reaped post-merge ([Step 7](#7-ship-per-protection-mode)).

- **`shape`**: `symmetric`. Entries: ≥ 2 `new-member`.
- **Conservation scope** (Step 2): the *whole* origin draft.
- **Run-context** (Step 5): from a base checkout — the transform is PM-artifact grooming, staged on the base tree and
  shipped on the auto-merge lane. `arc decompose` retires the origin's artifacts but does **not** touch its
  `plan/<name>` branch or worktree, so the run-locus is never sawn off mid-transform; the branch + worktree are
  reaped post-merge via `arc teardown <origin> --force` (Step 7), run from the base checkout the ship already used.

### Extraction arm

The origin sheds one orthogonal sub-concern as a new sibling and **survives** — no origin-retire edge fires. Only
the *extracted* subset is distributed; the surviving (thinned) origin keeps the rest.

- **`shape`**: `extraction`. Entries: ≥ 1 `new-member` (the extracted member, carrying its `Depends On: <origin>`
  edge) **plus** one `surviving-origin` entry naming the origin and its disposition.
- **Conservation scope** (Step 2): the *extracted subset only* — the surviving origin is itself a cut-map entry,
  not a dropped section.
- **Run-context** (Step 5): from the origin's worktree; no teardown leg fires (the origin is untouched — branch and
  any committed code stay).
- **Active-state origin** (first-class): extraction is the first-class path for a mid-implementation (`Active`)
  origin — it stays `Active`, the extracted member(s) mint as `Planning`, and **only unbuilt scope** is extracted.
  Built code stays with the surviving origin; extracting written code needs the full-split machinery this workflow
  does not run (see the [Active-state guard](#active-state-precondition-guard)).
- **Disposition fork** — the `surviving-origin` entry carries `keep-active` or `park`:
    - `keep-active` — the thinned origin stays in `active/`, a valid terminal outcome. No extra leg.
    - `park` — relocate it to backlog as a **separate** workflow step after the ship, sequencing two orthogonal
      primitives: `arc park <origin> --reason "<thinned by extraction of <member>>"` via the
      [`park-work-unit`][park] ceremony. Park is *not* a `decompose` leg — it is purely additive over the
      already-terminal keep-active, so a skipped or deferred park leaves no partial state.

### Backlog-stub-source arm

Decompose a `planned/` (or `provisional/`) stub **in place** — no activation, no `plan/` branch. The origin is
retired from backlog and the members are minted in backlog.

- **`shape`**: `backlog-stub-source`. Entries: ≥ 2 `new-member`.
- **Conservation scope** (Step 2): the *whole* stub.
- **Run-context** (Step 5): from any base checkout — no worktree exists. The verb's `artifacts: remove` leg prunes
  the emptied backlog subdir, so a retired stub leaves no orphaned cohort dir.

### Heterogeneous-home arm

Members route to **mixed destinations**: a new stub, a fold into an existing sibling stub or `draft-design` block,
or an atomic edit to a standing doc. The origin-retire side reuses the symmetric or stub-source edge per the
origin's position; what is novel is the **destination handling**.

- **`shape`**: `heterogeneous-home`. Entries: ≥ 2 destinations, mixing `new-member` with `existing-home`
  (`home: fold | atomic-edit`).
- **Run-context** (Step 5): per the origin's position (symmetric or backlog-stub-source above).
- **Direct edits ride the decompose PR.** The fold / atomic-edit homes are **workflow-authored direct edits**
  ([Step 7](#7-ship-per-protection-mode)) — the verb has no content-editing leg. They are **same-concern**
  (redistributing the origin's design *is* the decompose concern), the home is **already known** (the cut decided
  it), and the conservation gate **requires** each to land before the origin retires — so they are authored into
  the transform, recorded in the allocation map, and **never inbox-captured.** (A *foreign* concern that merely
  surfaces during the decompose still routes to capture — concern-identity is the discriminator, per
  [DEV-RULES.ARC § Anti-rider][dev-rules-antirider].)

---

## At-cap arm

The parent-position cap (Step 1, two-segment `Cohort`): no cohort node can be minted, so the cohort-mint legs change
and every other step is unchanged. Composes with any [transform shape](#transform-shape-arms).

- **No cohort minted (Step 3 cohort-mint skipped).** Members are scaffolded as **siblings under the origin's existing
  parent cohort**, peers of its current siblings (`cohort` omitted from the cut-map; the verb enrols them under the
  origin's existing cohort).
- **Fan-out provenance, not a grouping node.** The "these came from one concern" fact is recorded as **provenance —
  a write-once, immutable past-event note** in the parent cohort doc, in greppable phrasing:

  ```text
  Fanned out from `<origin>`: `<m1>`, `<m2>`, `<m3>` (at-cap lateral decomposition).
  ```

  It records a past event, so it never drifts and needs no guard — invisible-safe to the cohort-consistency
  invariant (which keys on the shared `Cohort` path).

- **Reality check before fanning out (judgment, not a gate):** ask whether hitting the cap signals the *parent*
  cohort was mis-scoped — calling for a parent restructure — rather than a clean lateral split. A prompt only; the
  cap is never raised to rescue a member that legitimately outgrew itself.

---

## Composition and reuse

### The park-exit block

The exit choreography is shared with [`park-work-unit`][park]: an in-verb artifact retire / relocate
([Step 5](#5-run-arc-decompose)), the ship legs ([Step 7](#7-ship-per-protection-mode)), and — for a started
origin — the **out-of-band post-merge `arc teardown --force`** that reaps the orphaned `plan/<name>` branch +
worktree. `arc park` also serves an extraction's origin-park disposition. Neither verb tears down the branch or
worktree in-verb; both defer it to the shared post-merge teardown.

---

## Next step

The origin is now a cohort of `backlog/planned/` members. Each is activated separately, in dependency order, via
[`init-work-unit`][init-work-unit] Path A when work on it begins — no member is auto-started by decomposition.

## Related workflows

- [`assess-cohort-fit`][assess-cohort-fit] — the planning-time method that produces the cut-map this workflow consumes.
- [`init-work-unit`][init-work-unit] — initializes each member (`backlog/planned/ → active/`) when its work begins.
- [`park-work-unit`][park] — shares the exit choreography (in-verb retire + post-merge teardown); the extraction
  arm's origin-park sequences it.
- [`integrate-work-unit`][integrate-work-unit] — the code-shipping lifecycle exit; contrast with this
  transform-and-ship exit.

---

[assess-cohort-fit]: ../../../methods/assess-cohort-fit.md
[init-work-unit]: planning/init-work-unit.md
[integrate-work-unit]: integrate-work-unit.md
[park]: park-work-unit.md
[template-cohort]: ../../../../reference/templates/arc/work-unit/template-cohort.md
[dev-rules-antirider]: ../../../../system/rules/DEV-RULES.ARC.md#anti-rider
[work-org-decomp]: ../../../../reference/strategies/arc/strategy-work-organization.md#decomposition--three-arms-by-parent-position
[work-org-active-state]: ../../../../reference/strategies/arc/strategy-work-organization.md#active-state-decomposition
[work-org-protection]: ../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes

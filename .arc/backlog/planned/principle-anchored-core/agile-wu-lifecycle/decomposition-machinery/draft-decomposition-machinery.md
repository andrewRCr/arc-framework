# Draft: Decomposition Machinery

- **Origin:** [internal]
- **Cohort:** principle-anchored-core/agile-wu-lifecycle

- **Purpose:** Deliver the machinery for a concern that outgrows one WU: the planning-time **decomposition
  method** (when and how to cut a concern into a cohort of self-contained WUs) and the lifecycle **graduation
  workflow** (how to execute a confirmed cut on a live WU). Plus the structures they need — the bounded
  nested-cohort grouping taxonomy, the path-valued `Cohort` field's *semantics*, the constitutive
  `cohort-{name}.md` managed record + `template-cohort.md`, and the **cohort-consistency invariant + its
  enforcement**. The decomposition method is the *decide* half (a planning method, like test-first); the
  graduation workflow is the *execute* half (a lifecycle workflow, like init / integrate). This WU is its own
  acceptance test's second customer and the first graduation customer — this cohort was itself created by
  running the (manual) graduation this WU codifies.

---

## Problem / Motivation

`class-model-foundation` answers the *lower* bound of a WU (Errand vs. WU — is this big enough to warrant a
wrapper?). The *upper* bound is unaddressed: when is a concern **too big to be one WU**, and what do you do
about it? Without a codified procedure, a large concern either bloats into an unreviewable mega-WU (one spec +
one task list across many phases, defect detection cratering) or gets split ad-hoc into stacked PRs that force
shared mutable planning artifacts across branches — exactly the cross-branch contention worktree isolation
exists to prevent. This WU codifies the cut (the method) and its execution (the workflow), plus the cohort
structures that make a decomposed concern a first-class, browsable, coordinated thing rather than a pile of
loosely-related WUs.

## The WU upper boundary (mirror of ADR-021)

ADR-021's threshold answers "is this big enough to warrant a WU?" (Errand vs. WU — the *lower* bound).
Decomposition answers "is this too big to be **one** WU?" (WU vs. cohort — the *upper* bound). Same test, other
end; the symmetry is the spine of the procedure.

## Model B only — decompose into a cohort of self-contained WUs; Model A retired

When a concern exceeds one WU it becomes a **cohort of self-contained, single-owner WUs** (each its own
`meta-* + spec-* + tasks-*`, one branch, one PR) — **not** one WU sliced into stacked PRs (Model A). Three
grounds, weakest to strongest:

1. **One-branch-per-WU (ADR-019) makes Model A inexpressible.** "One WU across many branches" has no ARC form;
   it can only collapse into a stack of *WUs* — which is just Model B's delivery mode.
2. **ARC's review grain is already sub-PR** (per-task review increment, P2) — so Model A's "split PRs to get
   small reviewable units" benefit is largely served at a finer grain already. (This does not replace PR-level
   review — different eyes, different altitude.)
3. **Decisive — Model A forces shared mutable planning artifacts across branches.** One spec + one task list
   edited from N worktrees is exactly the cross-branch shared-mutable state that worktree isolation and the
   relocatability invariant exist to prevent: it either gravitates up to the cohort / backlog tier (detaching
   the design from any single task list) or stays on one branch referenced cross-branch (clunky,
   conflict-prone, a relocatability breach). **Model B keeps each WU's meta + spec + tasks a self-contained,
   co-located, relocatable bundle.** The external research reached this independently (Google's
   one-RFC-to-many-PRs "works at enterprise scale only because they accept spec drift").

"Stacked PRs" survives **only** as Model B's *dependency-ordered delivery mode* — a stack of WUs, each its own
branch, merged in order. The merge / rebase *discipline* for executing such a stack is Concurrent Work
Conventions's; this WU owns the *decision* to decompose, CWC owns delivering the stack safely.

## The discriminator — orthogonality, not size

Decompose on **design / subsystem orthogonality + independent deliverability / ownership** — *not* raw size.
Size is a secondary symptom, and only when it spans *unrelated* subsystems (review-sizing research: defect
detection craters past ~200–400 LOC per review increment; ~800–1000 LOC across *orthogonal* systems is a
decompose signal). Tightly-coupled work designed as a whole stays **one WU even when large** — the per-task
review grain carries quality — and splits later only if it destabilizes. Concern multiplicity is the trigger;
LOC is a heads-up.

## Folded-in sizing requirements (the concrete protocol)

- **Decouple planning-grouping from delivery-grouping.** One concern plans as a single coherent draft / spec
  but *delivers* as a stack of PR-sized WUs along natural deliverable / phase boundaries.
- **Sizing heuristics (sense oversize ahead).** Count distinct deliverables / independently-reviewable
  surfaces; estimate LOC + file count; test "reviewable in one sitting." >~few-hundred LOC / >~8–10 files /
  multiple independent review surfaces → stack-or-cohort, not one WU.
- **Stack vs. cohort.** Sequentially-dependent → stack (ordered PRs); independent-ish → cohort (parallel WUs).
  **cohort ≈ epic**, **WU ≈ story / one reviewable PR**; the gap this WU fills is the codified concern →
  WU-count mapping.
- **When to split.** At decomposition time, not mid-execution (a mid-execution split is a costly escape hatch).
- **Sizing-norm co-home.** The sizing standard itself co-homes in `strategy-work-organization` (a WU-sizing
  standard the procedure consumes), not authored here.

### Member-slug naming heuristic

When the cut produces members, **their slugs must read legibly out of context.** Dependency edges
(`**Depends On:**`) carry bare WU-names with no cohort path, so a downstream WU reads `Depends On: <slug>` cold:
a slug like `model-foundation` or `cohort-machinery` is opaque, while `class-model-foundation` or
`decomposition-machinery` self-describes. The naming step is part of the cut, not an afterthought — surfaced
during this cohort's own graduation, where the provisional `model-foundation` / `cohort-machinery` slugs were
sharpened to their self-describing forms before CWC's `Depends On` re-point wired them (a rename after wiring is
rework). Fold into the sizing protocol: name members for standalone legibility.

## Two guard rails

- **Lower rail — don't split below WU-warrant.** Decompose only until each piece independently warrants a WU
  (ADR-021 threshold). A piece too small is a **phase of a sibling** or an **Errand**, never a peer WU.
  ("Making a 3-task piece its own WU feels silly" is this rail firing.)
- **Upper rail — don't split coupled one-design work for size alone.** Over-decomposition is a real failure
  mode (the microservices premature-split trap: chatty coordination, onboarding cost). A personal
  under-decomposition bias will feel the lower rail most; the framework needs both for general correctness.

## Timing — gated on design maturity

Decompose when the design is **stable enough that the cuts are real**, not before. Speculative design → hold as
one unit and iterate; settled design → decompose. **The cut is firm at the maturity gate:** once you've
decomposed properly at design maturity, the *cut itself* — members, dependency edges, deliverables, slugs — is
settled; if it isn't, you decomposed too early, which is exactly what this gate prevents. What stays open is
**not the cut** but each member's ordinary spec-time openness (internal sizing / phase shape, and the universal
possibility that a member recurses into a sub-cohort). That openness is identical to any backlog stub's — not a
special provisionality of decomposition output.

## The bounded grouping taxonomy: nested cohorts, WU leaf

Decomposition needs **one bounded level of nesting** — because the common case is decomposing a WU that is
*already* a cohort member. There is **one grouping kind — the cohort** — and coordination is a *property it
carries by degree*, not a separate category:

- **Cohort** — any deliberate grouping of sibling WUs. It **always carries a `cohort-{name}.md`** (no
  exceptions), whose required floor is a one-paragraph **Purpose** and whose body *accretes* coordination
  content as the siblings tighten. A grouping that only *organizes* carries a Purpose-only doc; one that
  actively *coordinates* carries the fuller body. The difference is **how much the doc says, not what kind of
  thing the grouping is.**
- **WU** — the leaf deliverable (one branch, one PR, its own `meta-* / spec-* / tasks-*`).

"**Theme**" survives only as **informal prose** for a top-level, mostly-organizing cohort — never a distinct
schema kind, never a doc-less exception. (Earlier drafts made theme a categorical doc-less tier; it broke at the
single-segment `Cohort` value, where a theme and a genuine top-level cohort are syntactically identical and
disambiguated *only* by doc-presence. Collapsing to one kind with a Purpose-floor doc dissolves the wrinkle.)

**The cap is one level of nesting:** at most `<cohort>/<subcohort>/<wu>` — never three grouping segments. A
plain structural bound (anti-sprawl), **not** a limit on coordination: *both* levels may coordinate. Each level
above the WU is optional. The required one-paragraph Purpose doubles as a **reality check on the grouping** — if
you can't expand the slug into a sentence that distinguishes this cohort from "a pile of loosely-related WUs,"
it shouldn't exist.

Nesting lives in a **path-valued `Cohort` field** (`principle-anchored-core/agile-wu-lifecycle`), not a distinct
artifact type: one `cohort-{name}.md` shape and one `template-cohort.md` at every level — an inner cohort
differs from a top-level one *only* by path depth (capped at two segments) and by how much its doc says.
"Sub-cohort" is prose framing, never a `subcohort-*` prefix. The on-disk dir mirrors the path; the
relocatability invariant (pure `git mv`) is unaffected (just more dir levels); the cohort-consistency invariant
generalizes from "field matches parent dir" to "field-path matches dir-path."

## A decomposing WU graduates to a cohort

When a WU decomposes it **graduates into a cohort** carrying the original name, members nested beneath it,
`cohort-{name}.md` repurposed from the origin draft's coordination content. A *standalone* WU that decomposes
*becomes* a top-level cohort; a WU *already* in a cohort graduates to a **sub-cohort** under its existing
parent. It **preserves the name** — and so the browsing / narrative / mental-model references — at the right
altitude.

The "name loss breaks references" worry dissolves:

- **Dependency edges (`Depends On`) are always WU→WU**, never group-level. A downstream WU re-points to the
  specific pieces that deliver what it needs, regardless of the name. Dependencies bind deliverables, not
  groups.
- **Narrative / browsing references** (WORKING-MEMORY, sibling drafts, the cohort docs) are what the preserved
  cohort name saves — a WU→cohort *rename*, not a deletion, swept at graduation.

`ROADMAP` / `STATUS.USER` render from metas, so regen handles the WU→cohort shift automatically — no manual
roster anywhere.

## The cohort doc — every grouping's identity record (ADR-022 family)

`cohort-{name}.md` joins the structured-record family alongside the meta record (ADR-022), and is
**constitutive of every cohort** — its presence is what marks a dir as a deliberate grouping rather than an
incidental parent. Content scales from pure orientation to full coordination:

- **H1 + uniform preamble** (from `template-cohort.md`).
- **Required floor — a one-paragraph `Purpose`:** an expansion of the slug; the minimum that makes the file
  non-vacuous; also the grouping's reality check. May **sharpen** into a thesis as the grouping tightens.
- **Optional coordination content (accretes above the floor):** shared contracts (cross-member design no single
  WU owns), closeout criteria, and a parent-cohort pointer (derivable from the `Cohort` path). There is **no
  `Coordinated` flag**: coordination is a continuum of how much the doc says.
- **Per-WU sections, keyed by slug — a *partitioned coordination surface*, not a membership roster.** Each
  member edits only its own section, so parallel writers line-merge cleanly.

**Membership stays derived** from each WU's `Cohort` field (the meta record is the source of truth). A per-WU
section is therefore a *subset* of members — a WU gets one only when it has cross-cutting coordination to
record; a missing section just means "nothing to coordinate." The doc never carries a roster or status table
(those render). Orphan per-WU sections (a renamed / removed WU) are caught by the cohort-consistency invariant.

**The design-vs-coordination boundary (forced, not chosen).** The doc carries **coordination only — never
design that drives a task list** — and this is *forced* by the invariant. A contract's authoritative definition
drives its implementing member's task list, so it **must** live in that member's spec; the cohort doc holds only
a *pointer* plus the consumer list. Coordination splits two ways: **cohort-level** for genuinely ownerless
shared material (thesis, closeout criteria, a convention all members honor); **per-member** for a member's own
surface, framed as **exposes / consumes**. The per-member partition is a deliberate **forcing function**: if a
member's section fills with design that drives its own tasks, that visible smell *is* the signal the content
belongs in its spec. Exact field / section set is a prototype-iterate artifact (the cohort docs minted at this
cohort's graduation are the first prototype `template-cohort.md` generalizes).

## Decomposition (decide) vs. graduation (execute) — a method and a lifecycle workflow

Semantically distinct, split across the method/workflow line ARC already uses:

- **Decomposition is a planning-time *method*** — the discriminator + rails + timing that *decide* the cut
  (pieces + dependency edges + the cut map). It runs inside planning; it produces a decision, not a structural
  change.
- **Graduation is a lifecycle *workflow*** — it *executes* a confirmed cut by transforming a live WU into a
  cohort. A genuine lifecycle transition (a WU changing *what it is*), earning its own workflow + PR story.
  "Graduate" is ARC's established word for a lifecycle promotion (`init-work-unit` graduates a backlog stub →
  active); a WU graduating to a cohort extends that sense.

The relationship is **not 1:1**, gated on whether a monolith ever existed. **Predicted decomposition** (you see
the cohort coming *during* planning) authors directly into the cohort structure; no monolith is created, so
graduation does not apply. **Emergent decomposition** (a holistic draft matures and *then* reveals itself as a
cohort) has a monolith to *split* — this is the arm graduation + the distribution discipline serve.

## Graduation delivery lifecycle — a park-shaped exit

Graduation reuses the **park** path's mechanics (`active/ → backlog/`, PR to `main`, branch + worktree
teardown) with cohort-specific choreography. It is **not** an `integrate-work-unit` (no code deliverable, no
`completed/` archive):

- **Runs on the originating planning branch**, as that WU's terminal act. No fresh branch; no `Active` step.
- **Steps:** mint the cohort (dir + `cohort-{name}.md` from the origin draft's coordination content) →
  **backfill the parent cohort's doc if absent** → scaffold the N member stubs in
  `backlog/planned/<cohort>[/<subcohort>]/` (`meta-* + draft-*` each, fields set — see field inheritance below)
  → distribute the origin draft's design into each member draft per the **distribution discipline** (below) →
  re-point *incoming* `Depends On` (**sweep every meta whose `Depends On` names the origin**, not only the
  dependents the cut map happened to name — this cohort's own graduation found three incoming edges where the
  cut map listed one) → **verify** (checklist below) → **retire the origin `meta-* + draft-*`** (deleted; fully
  redistributed) → regen `ROADMAP` → park-shaped PR to `main` → branch / worktree teardown (branches on
  worktree kind).
- **Field inheritance on minted stubs.** Each member inherits the originating WU's `**Origin:**` (members of a
  decomposed concern share its provenance — `[internal]`, or an external tracker if the origin had one; you
  know it at decomposition time) and carries its own `**Design:** draft-<member>.md`. `**Cohort:**` is path-set
  to the (sub)cohort — in the meta *and* mirrored into the member's draft header per the header convention (see
  `class-model-foundation`); `**Depends On:**` encodes the cut's order; `**Class:**` is the member's own.
- **No new State value:** the origin meta is deleted — the WU *ceases to be a WU* because it became a cohort.
  **No `completed/` entry** for the origin (its outputs are *future* work in `backlog/`); the **cohort** carries
  the eventual `completed/` archive when its last member ships.
- **Members land uniformly in `backlog/planned/`;** activation is a separate, deliberate act per member
  (`init-work-unit` Path A), in dependency order. The cut is **firm**; each member carries only the normal
  spec-time openness any backlog stub has.
- **Distribution discipline (emergent arm — splitting a monolith):** the origin draft's design is *split*, not
  copied, under a four-step gate. **(1) Allocation map** — every section / design-point → its destination
  (member-X draft, cohort-doc cohort-level, cohort-doc per-member, or *dropped — superseded, with reason*).
  **(2) Classify** by the design-vs-coordination boundary: design-drives-task-list → a member draft;
  coordination → shared / per-member; an owned contract → owner's draft + a reference in the doc. **(3)
  Conservation gate** — assert every origin section lands in exactly one destination or is explicitly
  dropped-with-reason (**no silent loss**); this gates retirement. **(4) Retire** the origin only after the gate
  passes. The allocation map is **not throwaway** — it becomes the **graduation PR description** (the
  reader-facing "decompose X → cohort + members; here's where everything went" story + audit trail).
- **Verification (manual at the bootstrapping run; automated once this WU ships):** before the PR, assert the
  three cohort-consistency conditions on the minted structure — every `Cohort` field path-matches its dir; every
  grouping dir carries a doc; every per-member section's slug ∈ derived members.
- **Teardown branches on `worktree.identity.kind`:** **primary** → switch the worktree back to `branch.base` +
  delete the local / remote `plan/<name>` branch; *no* worktree removal. **linked** → delete the branch +
  `git worktree remove <path>`.
- **Relationship to `integrate-work-unit`:** graduation is a *separate* workflow (keeps integrate
  code-shipping-focused) that **shares the PR-merge-branch-cleanup primitive** (DRY), plus a lightweight
  graduation-PR description variant. The first worked example is this cohort's own graduation PR (#55) — it
  leads with the operation ("split X into N deliverable units"), names each unit + where the content went, and
  follows the commit/PR surface-language register (see `doc-cascade-sweep`): plain prose legible without
  ARC-specific knowledge, artifact references kept.
- **Bootstrapping:** the graduation workflow is itself this WU's deliverable, so this cohort's own graduation
  ran the **manual** park-shaped path above; this WU codifies it after, using that run as the worked example
  (`doc-cascade-sweep` carries the codification-against-the-actual-run reconciliation).

## Concurrency — the cohort doc is the one shared-mutable planning artifact (CWC seam)

`cohort-{name}.md` is the deliberate exception to per-worktree isolation (every other planning artifact is
per-WU-on-its-branch). It rides plain git line-merge — *not* the notes-ref convergence machinery — so the
per-member partition is what keeps concurrent edits safe. Two notes flow to Concurrent Work Conventions, which
owns runtime concurrency safety:

- **The advisory cross-cutting gate has a blind spot here.** The Errand matrix's "advisory gate when the owning
  WU is in flight" keys on a single owning WU; the cohort doc is owned by the *cohort*, so the gate is
  ill-defined for it — the most-shared artifact is the least-covered. CWC's behind-base detector is the net that
  does apply (advisory, at resume).
- **Escape hatch if partition proves insufficient:** route `cohort-{name}.md` edits as errands through the
  primary worktree (serialized via `main`) rather than riding WU-branch PRs. Lean: partition-first (cheap);
  serialize-via-main as the fallback.

## Plan-grouping ≠ delivery-grouping

One concern **plans** as one draft; at decomposition it becomes **N self-contained WU specs + cross-WU
coordination** in `cohort-{name}.md`. The cohort doc carries coordination only — never design that drives a
task list (specs feed task lists and validate completion; they are not coordination docs).

## Deliberate divergence from Shape Up

Adopt Shape Up's *self-contained vertical-slice unit* shape; **reject its design-co-evolves-during-build
timing.** ARC stays spec-directed (P1) — but as a best-effort *goal*: settle everything *settle-able* up front
and never *consciously* defer it, while accepting that genuine unforeseeable unknowns surface during impl and
are routed back to the spec. The divergence is *deliberate under-specification as a design method* (Shape Up)
vs. *best-effort settle + disciplined emergence-handling* (ARC).

## Acceptance test

The procedure must cleanly **re-derive Concurrent Work Conventions's D1–D4 from CWC's one settled draft.** CWC
is both the worked requirements example and the first customer (parked pending this support). If the
orthogonality discriminator and the two rails produce that decomposition, the procedure works; if it strains,
the rule is wrong. (This cohort's own four-member cut is the *second* worked example.)

## `Cohort` field taxonomy / nesting semantics (meta schema)

The path-valued `Cohort` field's *schema* (the field exists, is path-valued, capped at two segments, membership
derived) is `class-model-foundation`'s. This WU owns the *semantics* it expresses: what a cohort **is** (a
deliberate grouping with a constitutive doc), the one-level nesting cap, single-segment vs. two-segment meaning,
and the dir-path mirroring rule. The two compose: the field carries the value; this WU defines what legal values
mean and what structure they imply.

## Cohort-consistency invariant + enforcement

A WU's path-valued `**Cohort:**` field must match its `backlog/planned/<cohort>[/<subcohort>]/` parent dir-path;
**every grouping dir carries a `cohort-{name}.md`** (constitutive — no doc-less grouping exists) with at least a
**`Purpose`** floor; and a cohort doc's per-member section slugs must be a **subset of derived members** (no
orphan sections). Field-vs-dir drift is a silent failure (a WU assigned to one cohort but filed under another).
This WU owns the *invariant* (cohort semantics is its charter) **and** its *enforcement* — a backlog-scoped
structural guard (`active/` is flat and `completed/` ordinal, so neither applies); the validator + its
pre-commit wiring (the forbidden-pattern / layout-drift hook family). Co-locating definition and enforcement
ensures the invariant is never defined-but-unenforced. The check also serves as the cohort doc's schema
validator (Purpose present; per-member section slugs ⊆ derived members). The graduation procedure carries a
**manual** version of these three checks for the bootstrapping run that precedes this WU.

## Open / deferred

- **Decomposition pipeline fire-point** — a new decomposition workflow vs. a phase inside `create-spec`. Couples
  with the graduation workflow (decide-the-cut vs. execute-the-cut).
- **Coordinator / DRI for a cohort doc** — lean no (over-structure; `Owner` stays WU-level).
- **`template-cohort.md` body** — the exact coordination field set + per-member section shape are
  prototype-iterate (like the spec templates); generalize from the prototype docs minted at this cohort's
  graduation.
- **Reconciliation debt.** `strategy-work-organization` § Task Lists and Branches (stacked-PRs / phased /
  team-sub-branch — pre-ADR-019 leftovers that contradict one-branch-per-WU) needs rewriting to the B-only
  model. (Compounds with the broader tier reconciliation — coordinate with `doc-cascade-sweep`.)

## Scope

**In scope:**

1. The decomposition **method** (planning-time *decide*) — the orthogonality discriminator, two guard rails,
   design-maturity timing, plan-vs-delivery-grouping, Model-B-only, the member-slug naming heuristic; sizing
   heuristics consuming the `strategy-work-organization` sizing standard. Acceptance test: re-derive CWC's
   D1–D4.
2. The grouping **taxonomy** — the bounded nested-cohort model (one kind, ≤2 deep, coordination by degree); the
   path-valued `Cohort` field *semantics*; the dir-path mirroring rule.
3. The `cohort-{name}.md` managed record (ADR-022 family; Purpose floor / optional coordination /
   per-member-by-slug; membership-derived) + `template-cohort.md`.
4. The **graduation workflow** (lifecycle *execute*) — park-shaped exit; transforms a live WU → cohort; field
   inheritance on minted stubs; the four-step distribution discipline; shares `integrate`'s
   PR-merge-cleanup primitive + a graduation-PR variant. Plus the codification of this cohort's own manual
   graduation run (reconciliation with `doc-cascade-sweep`).
5. The **cohort-consistency invariant + its enforcement** (validator + pre-commit wiring, co-located with the
   invariant).

**Out of scope:**

- The `Class` model, the `Cohort` field *schema*, and the relocatability invariant *statement* —
  `class-model-foundation` (consumed here).
- The scalable authoring pipeline that members' specs flow through — `scalable-authoring-pipeline`.
- Relocatability *enforcement* — `quality-gate-hooks`.
- The merge / rebase discipline for delivering a decomposed stack, and the create-new `arc start` wiring —
  Concurrent Work Conventions.

## External research

- **Decomposition idiom** — stacked-diffs (Graphite), RFC-to-implementation (Google enterprise spec-drift
  finding), epic / story mapping, review-sizing studies (Google / SmartBear ~200–400 LOC defect-detection
  cliff). Folded into the discriminator + sizing protocol above.

## Scope estimate

**Large.** A planning method + a lifecycle workflow + the grouping taxonomy + a new managed-record type and
template + an invariant with its own enforcement hook. Grew with the cohort-graduation fold-in; a possible
decompose-at-spec itself, but it is one coherent design — lean one WU with phases. *Depends on:
`class-model-foundation`.* Runs in parallel with `scalable-authoring-pipeline`.

---

# Draft: Decomposition Machinery

- **Origin:** [internal]
- **Cohort:** principle-anchored-core/agile-wu-lifecycle

- **Purpose:** Deliver the machinery for a concern that outgrows one WU: the planning-time **decomposition
  method** (when and how to cut a concern into a cohort of self-contained WUs) and the lifecycle
  **`decompose-work-unit` workflow** (how to execute a confirmed cut on a live WU). Plus the structures they
  need — the bounded nested-cohort grouping taxonomy, the path-valued `Cohort` field's *semantics*, the
  constitutive `cohort-{name}.md` managed record + `template-cohort.md`, and the **cohort-consistency invariant +
  its enforcement**. The decomposition method is the *decide* half (a planning method, like test-first); the
  `decompose-work-unit` workflow is the *execute* half (a lifecycle workflow, like init / integrate). This WU is
  its own acceptance test's second customer and the first `decompose-work-unit` customer — this cohort was itself
  created by running the (manual) decomposition this WU codifies.

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
during this cohort's own decomposition, where the provisional `model-foundation` / `cohort-machinery` slugs were
sharpened to their self-describing forms before CWC's `Depends On` re-point wired them (a rename after wiring is
rework). Fold into the sizing protocol: name members for standalone legibility. **Never encode order in the
slug** — no `-pt1` / `-pt2` ordinals (they fabricate sequencing and aren't self-describing); inter-member order,
when it exists, lives in `Depends On`.

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

## Terminology home — introduce "cohort" into the always-loaded surface

The concept is **used-before-defined.** `class-model-foundation` shipped the `Cohort` field, the
`backlog/planned/<cohort>/` dirs, the render columns, and even names the `cohort-*` record — but no constitutional
/ brief surface *defines* a cohort. `AGENT-BRIEF.ARC` § Vocabulary (the terminology-introduction surface, alongside
Work unit / Class / Atomic / Interlock / Review increment) gains a **Cohort** entry: what a cohort is (a deliberate
grouping with a constitutive doc), the nested-cohort / sub-cohort framing, and the WU-leaf relationship. Any
*constitutive rule* that reads as behavior rather than vocabulary (every grouping dir carries a `cohort-{name}.md`;
the one-level nesting cap) promotes to `DEV-RULES.ARC`. This WU owns the entry because it owns cohort semantics —
the brief is the introduction, the body sections above are the definition.

## A decomposing WU becomes a cohort — three arms by parent position

When a WU decomposes it **becomes a cohort**, `cohort-{name}.md` repurposed from the origin draft's coordination
content. Which arm runs is selected by the parent's position relative to the nesting cap:

1. **Standalone WU → top-level cohort.** A WU in no cohort becomes a new top-level cohort carrying its name,
   members nested beneath. **Name preserved.**
2. **In-cohort WU (single-segment parent) → sub-cohort.** A WU already in a cohort becomes a **sub-cohort** under
   its existing parent, members nested one level deeper. **Name preserved.**
3. **At-cap WU (two-segment parent) → lateral fan-out.** A WU *already at the nesting cap* has no legal nested
   target — minting a cohort beneath it would be a forbidden third grouping segment. It decomposes **laterally**
   into sibling WUs under its *existing* parent (peers of its current siblings). **The name is not preserved as a
   grouping node** (no new cohort doc, no path segment); grouping identity moves off the slug and onto an
   explicit provenance record (below).

Arms 1–2 preserve the name — and so the browsing / narrative / mental-model references — at the right altitude.
Across all three arms the "name loss breaks references" worry dissolves:

- **Dependency edges (`Depends On`) are always WU→WU**, never group-level. A downstream WU re-points to the
  specific pieces that deliver what it needs, regardless of the name. Dependencies bind deliverables, not
  groups — so they survive every arm unchanged.
- **Narrative / browsing references** (WORKING-MEMORY, sibling drafts, the cohort docs) are what the preserved
  cohort name saves in arms 1–2 — a WU→cohort *rename*, not a deletion, swept at decomposition. In arm 3, the
  cap denies a name-carrying node, so the same "these came from one concern" fact is carried by the provenance
  record instead.

`ROADMAP` / `STATUS.USER` render from metas, so regen handles the WU→cohort shift automatically — no manual
roster anywhere.

### The at-cap arm: grouping as provenance, not live grouping

Because no cohort node is minted at the cap, the "these came from one concern" fact is preserved as **provenance
(an immutable past-event record), not live grouping (maintained membership).** That distinction is the whole
design — a maintained roster / identifier / per-section tag would re-mint the very grouping node the cap denied,
introduce a second source of truth against the membership-is-derived rule, and sit invisible to the
cohort-consistency invariant (which keys on the `Cohort` path, identical across these siblings). So:

- **The original concern name is the stable common identifier** — recorded once, write-once at fan-out, as an
  explicit **cohort-level provenance note in the parent cohort doc**, in a recognizable greppable phrasing:
  *"Fanned out from `<origin>`: `<m1>`, `<m2>`, `<m3>` (at-cap lateral decomposition)."* It never drifts (it
  records a past event), needs no guard, and is stronger than any slug convention — the compensating record for
  the cohort node the cap denied.
- **Slugs stay content-legible** (the member-slug heuristic), **never ordinal**. A shared *meaningful* root is
  welcome where it falls out naturally, but never forced and never abbreviated — the slug's primary job stays
  out-of-context legibility for `Depends On`, not grouping.
- **Inter-member order, if any, lives in `Depends On`** — parallel-able siblings carry no inter-edges and imply
  no sequence, preserving parallel delivery as a real option rather than baking artificial order into a name.
- **Coordination for the new siblings rides the parent cohort doc** — they are members of it now, so they take
  per-member sections there. The cap means "no new grouping node; reuse the parent's."
- **Mis-scope reality-check (judgment prompt, not a gate):** before committing to a lateral fan-out, ask whether
  hitting the cap is itself a signal the *parent cohort* was mis-scoped (→ a parent restructure) rather than a
  clean lateral split. A prompt only — a legitimately-scoped member can simply outgrow itself; the cap is not
  raised to rescue it (that would erode the anti-sprawl bound's firmness).

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
cohort's decomposition are the first prototype `template-cohort.md` generalizes).

**No coordinator / DRI.** A cohort needs none: membership is derived, coordination is partitioned per-member
(each edits only its own section), and cohort-level material is by definition ownerless — *the partition is the
coordination mechanism, in place of an owner.* `Owner` stays WU-level; any future team-scale arbitration need
routes to the team-coordination strategy / Concurrent Work Conventions (runtime concurrency), not a role minted
here.

## Decomposition (decide) vs. `decompose-work-unit` (execute) — a method and a lifecycle workflow

Semantically distinct, split across the method / workflow line ARC already uses.

**Decomposition is a planning-time *method*** — the discriminator + rails + maturity-timing that *decide* the
cut. It is `assess-decomposition`, a **paired sibling of `classify-work-unit`, co-located with it**: the
upper-bound WU-vs-cohort test is the mirror of `classify-work-unit`'s lower-bound Errand-vs-WU test (its
boundary test #1), so it belongs to the same classification family and fires at the same touchpoints. It
produces a **cut-map** (members + dependency edges + deliverable boundaries + slugs) or "stays one WU" — a
decision, not a structural change. (The exact method-file name mirrors `classify-work-unit`'s convention and
finalizes at create-spec.)

- **Fire-points: the two derivation stages — `draft-design` and `create-spec`.** Decomposition is a
  design-orthogonality judgment gated on design maturity, so it fires where design is the live artifact:
  draft-design (the *predicted* arm) and create-spec (the *emergent* arm).
- **Not depth-gated.** Like `classify-work-unit`, it is a cheap confirm at every design-stage read — trivially
  cleared when the design is a single determinate / bounded concern, expensive only when it fires affirmative.
  And decompose-candidacy keys on orthogonality / breadth, a *different axis* than the derivation-depth the
  stages resolve: a low-derivation design can still be a wide orthogonal cohort, so gating behind `high` depth
  would miss exactly those.
- **`generate-tasks` coverage is free.** A "this should be multiple WUs" discovery during task generation is a
  *derivation-class* signal, which `resolve-planning-depth`'s re-entry valve already routes **upstream** to the
  design stages (a masked design decision belongs in the design, not a deeper task pass). So a late orthogonality
  discovery bounces up to where `assess-decomposition` lives — the costly escape-hatch the timing rule warns
  against, not a new fire-point.

**`decompose-work-unit` is a lifecycle *workflow*** — it *executes* a confirmed cut-map by transforming a live
WU into a cohort. A genuine lifecycle transition (a WU changing *what it is*), earning its own workflow + PR
story. (Renamed off "graduation": that term is reserved for the readiness ladder — `provisional → planned →
active` — owned by `class-model-foundation`'s `graduate-work-unit`; reusing it for the WU→cohort split would
collide with shipped vocabulary.)

**The cut-map is the DRY interface:** the method *produces* it, the workflow *consumes* it. No decision logic in
the workflow (it never re-derives the cut), no structural change in the method.

The relationship is **not 1:1**, gated on whether a monolith ever existed:

- **Predicted decomposition** — `assess-decomposition` fires affirmative *during* draft-design, while the design
  is still forming. You author directly into the cohort structure; no monolith is created, so
  `decompose-work-unit` does not run.
- **Emergent decomposition** — a holistic draft matures and *then* reveals itself as a cohort (the affirmative
  fires at create-spec). A monolith exists to *split* — this is the arm `decompose-work-unit` + the distribution
  discipline serve.

**Forward-compat with `composable-workflows`** (a sibling cohort — a constraint, not a dependency): declare
`assess-decomposition` via the existing `arc.methods` frontmatter bundle (alongside `resolve-planning-depth` /
`classify-work-unit`); author `decompose-work-unit`'s shared steps as named, extractable blocks (the "lane" unit
composition trades in) so resolve-then-load can later hoist them without a rewrite; reference cross-workflow
steps by stable **heading slug** — never ordinals (the brittleness `composable-workflows` fixes) or the
extension-reserved `#name` marker. The durable cross-file step-reference / anchor convention is
`composable-workflows`' to provide.

## `decompose-work-unit` delivery lifecycle — a park-shaped exit

`decompose-work-unit` reuses the **park** path's mechanics (`active/ → backlog/`, PR to `main`, branch + worktree
teardown) with cohort-specific choreography. It is **not** an `integrate-work-unit` (no code deliverable, no
`completed/` archive):

- **Runs on the originating planning branch**, as that WU's terminal act. No fresh branch; no `Active` step.
- **Steps:** mint the cohort (dir + `cohort-{name}.md` from the origin draft's coordination content) →
  **backfill the parent cohort's doc if absent** → scaffold the N member stubs in
  `backlog/planned/<cohort>[/<subcohort>]/` (`meta-* + draft-*` each, fields set — see field inheritance below)
  → distribute the origin draft's design into each member draft per the **distribution discipline** (below) →
  re-point *incoming* `Depends On` (**sweep every meta whose `Depends On` names the origin**, not only the
  dependents the cut map happened to name — this cohort's own decomposition found three incoming edges where the
  cut map listed one) → **verify** (checklist below) → **retire the origin `meta-* + draft-*`** (deleted; fully
  redistributed) → regen `ROADMAP` → park-shaped PR to `main` → branch / worktree teardown (branches on
  worktree kind). *(At-cap arm: no cohort is minted — instead, scaffold the members under the existing parent
  and write the fan-out provenance note into the parent cohort doc; every other step is unchanged.)*
- **Field inheritance on minted stubs.** Each member inherits the originating WU's `**Origin:**` (members of a
  decomposed concern share its provenance — `[internal]`, or an external tracker if the origin had one; you
  know it at decomposition time) and carries its own `**Design:** draft-<member>.md`. `**Cohort:**` is path-set
  to the (sub)cohort — in the meta *and* mirrored into the member's draft header per the header convention (see
  `class-model-foundation`); `**Class:**` is the member's own. `**Depends On:**` **distributes by *actual need*,
  never blanket-inherited:**
    - *outgoing* ancestor edges (`origin → X`): a member inherits `Depends On: X` **only if that member genuinely
      depends on X** — blanket-inheriting the origin's deps onto every member manufactures artificial
      serialization (a member that never touches X gets falsely gated behind it);
    - *internal* edges (`m_i → m_j`): authored fresh from the cut's delivery order;
    - *incoming* edges (`Y → origin`): re-pointed to the specific member(s) that deliver what `Y` needs (the
      sweep above).
- **No new State value:** the origin meta is deleted — the WU *ceases to be a WU* because it became a cohort.
  **No `completed/` entry** for the origin (its outputs are *future* work in `backlog/`); the **cohort** carries
  the eventual `completed/` archive when its last member ships.
- **Members land uniformly in `backlog/planned/`;** activation is a separate, deliberate act per member
  (`init-work-unit` Path A), in dependency order. The cut is **firm**; each member carries only the normal
  spec-time openness any backlog stub has.
- **Distribution discipline (emergent arm — splitting a monolith):** the origin draft's design is *split*, not
  copied, under a four-step gate. **(1) Allocation map** — every section / design-point **and every dependency
  edge** → its destination (member-X draft, cohort-doc cohort-level, cohort-doc per-member, or *dropped —
  superseded, with reason*). **(2) Classify** by the design-vs-coordination boundary: design-drives-task-list →
  a member draft; coordination → shared / per-member; an owned contract → owner's draft + a reference in the
  doc. **(3) Conservation gate** — assert every origin section **and outgoing dependency edge** lands in exactly
  one destination (a member that needs it) or is explicitly *dropped-with-reason* (superseded, or satisfied
  internally by the cut) — **no silent loss**; this gates retirement. **(4) Retire** the origin only after the
  gate passes. The allocation map is **not throwaway** — it becomes the **decomposition PR description** (the
  reader-facing "decompose X → cohort + members; here's where everything went" story + audit trail).
- **Verification (manual at the bootstrapping run; automated once this WU ships):** before the PR, assert the
  three cohort-consistency conditions on the minted structure — every `Cohort` field path-matches its dir; every
  grouping dir carries a doc; every per-member section's slug ∈ derived members.
- **Teardown branches on `worktree.identity.kind`:** **primary** → switch the worktree back to `branch.base` +
  delete the local / remote `plan/<name>` branch; *no* worktree removal. **linked** → delete the branch +
  `git worktree remove <path>`.
- **Relationship to `integrate-work-unit` and the predicted arm — two factored primitives (DRY).**
  `decompose-work-unit` is a *separate* workflow (keeps integrate code-shipping-focused) that shares two
  factored primitives: the **PR-merge-branch-cleanup primitive** with `integrate`, and the **cohort-scaffold
  primitive** (mint cohort + scaffold member stubs + wire deps + verify consistency) with the *predicted*
  decomposition arm — which draws on that primitive without the monolith-splitting distribution step. Layered:
  `decompose-work-unit` = [distribution-discipline + retire-origin] ∘ cohort-scaffold ∘ PR-cleanup; the
  predicted arm = cohort-scaffold (authored incrementally as the design forms). Plus a lightweight
  decomposition-PR description variant. The first worked example is this cohort's own decomposition PR (#55) — it
  leads with the operation ("split X into N deliverable units"), names each unit + where the content went, and
  follows the commit / PR surface-language register (see `doc-cascade-sweep`): plain prose legible without
  ARC-specific knowledge, artifact references kept.
- **Bootstrapping:** the `decompose-work-unit` workflow is itself this WU's deliverable, so this cohort's own
  decomposition ran the **manual** park-shaped path above; this WU codifies it after, using that run as the
  worked example (`doc-cascade-sweep` carries the codification-against-the-actual-run reconciliation).

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
pre-commit wiring (the forbidden-pattern / layout-drift hook family), coordinating with `quality-gate-hooks`'
source-side movable-artifact ref-enforcement — same hook-file family, a different invariant. Co-locating
definition and enforcement ensures the invariant is never defined-but-unenforced. The check also serves as the
cohort doc's schema validator (Purpose present; per-member section slugs ⊆ derived members). The
`decompose-work-unit` procedure carries a **manual** version of these three checks for the bootstrapping run that
precedes this WU.

## Cohort record relocatability & reference hygiene

`cohort-{name}.md` is a **movable `.arc/` artifact** and adopts the WU-artifact relocatability + reference-hygiene
invariant wholesale — not a special case. It relocates `backlog/planned/<cohort>[/<subcohort>]/ → completed/` when
the cohort's last member ships (a pure `git mv`, no content edit), so it carries position-independent references
exactly as `meta-* / draft-* / spec-* / tasks-*` do: **inbound** references to it are backticked-filename-only (no
Markdown links, no paths); **outbound** from it carries no relative-path links at all. The outbound rule is
satisfiable by construction — a cohort doc names sibling drafts / specs by backticked filename, and the
parent-cohort pointer is *derivable from the `Cohort` path* (never a hardcoded link).

The relocatability invariant's **statement** is `class-model-foundation`'s (shipped; consumed here) — this WU does
not restate it. What this WU adds, because it introduces the record type, is naming `cohort-*` in the
movable-artifact **enumeration** (DEV-RULES.ARC § Artifact relocatability / § `.arc/` artifact references), so the
existing rule covers it. **Enforcement** of `cohort-*` reference hygiene rides `quality-gate-hooks`' source-side
ref-enforcement (the same out-of-scope boundary as relocatability enforcement generally); only the
*cohort-consistency* invariant's enforcement is in scope here.

## Open / deferred

- **`template-cohort.md` body — deferred by method, not unsettled.** The exact coordination field set + per-member
  section shape are *generalized from the prototype* cohort docs minted at this cohort's own decomposition
  (`cohort-agile-wu-lifecycle.md` is the live first prototype), not designed top-down — the rare legitimate
  deferral (cf. the spec templates). Authored at execution from the prototype, with the field set explicitly
  marked prototype-iterate; not design debt.
- **Reconciliation debt — routed to `doc-cascade-sweep`.** `strategy-work-organization` § Task Lists and Branches
  (stacked-PRs / phased / team-sub-branch — pre-ADR-019 leftovers contradicting one-branch-per-WU) needs
  rewriting to the B-only model; this is `doc-cascade-sweep`'s terminal retirement sweep across strategies (it
  consumes all three siblings). **Spec-time flag:** if *this* WU's own `strategy-work-organization` edits (the
  sizing-norm co-home) would leave that file self-contradicting, neutralize § Task Lists and Branches locally in
  this WU's PR; the broader cross-surface tier reconciliation stays `doc-cascade-sweep`'s.
- **`active/`-layout drift hook — routed out (not this WU).** A hook asserting the documented flat `active/`
  layout matches reader / scaffold *code* behavior (`meta-reader.ts` non-recursive readdir; `worktree-scaffold.ts`
  flat write) is **not** this WU's. By this WU's own co-location-of-enforcement principle, it enforces the
  cohort-consistency invariant *because it owns cohort semantics* — and it does not own the `active/`-layout
  invariant; the check also needs code-behavior introspection the structural cohort guard doesn't share, so it
  does not cheap-ride the same harness. Routed to `quality-gate-hooks` (alongside relocatability enforcement) /
  the worktree-scaffold owner. **Interim gap accepted:** until that lands, the flat `active/` layout is unguarded
  against doc↔code drift — low cost (the layout is simple and low-churn, and `doc-cascade-sweep` already corrects
  today's drift; this only prevents recurrence).
- **Dependency-edge lifecycle awareness — routed to `operational-state-docs`.** A `Depends On` edge is
  *state-blind*: it names a dependency without signaling whether that dependency has shipped, so an agent reading
  a meta / draft during planning can read a satisfied edge as live (observed live this cohort — a shipped,
  archived dependency was reasoned about as in-flight). The fix is not this WU's — it belongs to
  `operational-state-docs`, which owns the dependency-metadata field semantics (lifecycle-trigger resolution:
  `init` authors / `activate` discharges satisfied edges / planning grounds-reads / session-init optionally
  surfaces). **Coordination seam:** this WU's distribution discipline *authors* `Depends On` edges — it authors
  *live gates* among members, leaving satisfied-ness to be discharged at each member's activation; keep the
  edge-distribution wording consistent with the live-gate semantics `operational-state-docs` settles.

## Scope

**In scope:**

1. The decomposition **method** (planning-time *decide*) — `assess-decomposition` (paired sibling of
   `classify-work-unit`): the orthogonality discriminator, two guard rails, design-maturity timing,
   plan-vs-delivery-grouping, Model-B-only, the member-slug naming heuristic, and the cut-map + fire-point model
   (draft-design / create-spec; not depth-gated); sizing heuristics consuming the `strategy-work-organization`
   sizing standard. Acceptance test: re-derive CWC's D1–D4.
2. The grouping **taxonomy** — the bounded nested-cohort model (one kind, ≤2 deep, coordination by degree); the
   path-valued `Cohort` field *semantics*; the dir-path mirroring rule; the three decomposition arms
   (standalone → top-level, in-cohort → sub-cohort, at-cap → lateral fan-out with provenance).
3. The `cohort-{name}.md` managed record (ADR-022 family; Purpose floor / optional coordination /
   per-member-by-slug; membership-derived; no DRI) + `template-cohort.md`; its relocatability + reference-hygiene
   treatment (adopts the WU-artifact invariant; adds `cohort-*` to the movable-artifact enumeration — ref-hygiene
   *enforcement* rides `quality-gate-hooks`).
4. The **`decompose-work-unit` workflow** (lifecycle *execute*) — park-shaped exit; transforms a live WU →
   cohort; field inheritance on minted stubs; dependency-edge-by-need distribution; the four-step distribution
   discipline; shares the cohort-scaffold primitive with the predicted arm and `integrate`'s PR-merge-cleanup
   primitive + a decomposition-PR variant. Plus the codification of this cohort's own manual decomposition run
   (reconciliation with `doc-cascade-sweep`).
5. The **cohort-consistency invariant + its enforcement** (validator + pre-commit wiring, co-located with the
   invariant).
6. The **concept introduction** — a `Cohort` entry in `AGENT-BRIEF.ARC` § Vocabulary (the always-loaded
   terminology surface; the concept is used-before-defined today), promoting any constitutive cohort *rule* (the
   constitutive-doc requirement; the one-level nesting cap) to `DEV-RULES.ARC`.

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
template + an invariant with its own enforcement hook. Grew with the cohort-decomposition fold-in; a possible
decompose-at-spec itself, but it is one coherent design — lean one WU with phases. *Depends on:
`class-model-foundation`.* Runs in parallel with `scalable-authoring-pipeline`.

## Planning status

- **Readiness:** formalization-ready. The inbound-buffer trio is drained — cohort-* relocatability **integrated**
  (adopts the WU-artifact invariant; § Cohort record relocatability & reference hygiene), the cohort-field↔dir
  guard **already subsumed** by § Cohort-consistency invariant (one `quality-gate-hooks` cross-ref added), the
  `active/`-layout hook **routed out** to `quality-gate-hooks`. The concept-introduction deliverable (cohort →
  `AGENT-BRIEF.ARC` § Vocabulary) is folded into scope. The core model was already settled — Model-B-only; the
  bounded grouping taxonomy + three arms (incl. at-cap lateral fan-out + provenance); the cohort record and its
  design-vs-coordination forcing function (no DRI); the decompose method / `decompose-work-unit` workflow split
  with fire-points, the cut-map interface, and the primitive factoring; dependency-edge-by-need distribution; the
  cohort-consistency invariant + enforcement.
- **Open by method, not unsettled:** `template-cohort.md` body (generalized from the live prototype at execution);
  the `strategy-work-organization` § Task Lists and Branches reconciliation (routed to `doc-cascade-sweep`, with a
  spec-time local-neutralize flag). Dependency-edge lifecycle awareness is routed to `operational-state-docs` (a
  coordination seam, not a blocker here).
- **Next:** run `create-spec` (`detailed` / heavy) — re-read the derivation axis at its own entry, and re-derive
  the worked example (CWC's D1–D4).

---

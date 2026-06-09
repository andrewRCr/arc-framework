# Spec (`detailed` · `RFC`): Decomposition Machinery

- **Origin:** [internal]
- **Cohort:** principle-anchored-core/agile-wu-lifecycle

- **Purpose:** Deliver the machinery for a concern that outgrows one WU — the planning-time **decomposition
  method** (`assess-cohort-fit`: when and how to cut a concern into a cohort of self-contained WUs) and the
  lifecycle **`decompose-work-unit` workflow** (how to execute a confirmed cut on a live WU) — plus the
  structures they need: the bounded nested-cohort taxonomy, the path-valued `Cohort` field's *semantics*, the
  constitutive `cohort-{name}.md` record + `template-cohort.md`, and the cohort-consistency invariant with its
  enforcement.

---

## Introduction / Context

`class-model-foundation` settled the *lower* bound of a work unit — the Errand-vs-WU wrapper floor (ADR-021):
"is this big enough to warrant a WU?" The *upper* bound is unaddressed: when is a concern **too big to be one
WU**, and what do you do about it? The symmetry is the spine of this work — same boundary test, other end.

Without a codified upper-bound procedure, a large concern fails one of two ways. It either bloats into an
unreviewable mega-WU (one spec + one task list across many phases, where defect-detection craters), or it gets
split ad-hoc into stacked PRs that force *shared mutable planning artifacts across branches* — exactly the
cross-branch contention worktree isolation (ADR-019) and the relocatability invariant exist to prevent.

This WU codifies the cut (a planning **method**) and its execution (a lifecycle **workflow**), plus the cohort
structures that make a decomposed concern a first-class, browsable, coordinated thing rather than a pile of
loosely-related WUs. It consumes `class-model-foundation`'s shipped contracts (the `Class` model, the
path-valued `Cohort` field *schema*, the relocatability invariant *statement*) and owns the *semantics* layered
on them.

**Why now.** `class-model-foundation` introduced the `Cohort` field, the `backlog/planned/<cohort>/` dirs, the
render columns, and even names the `cohort-*` record — but the concept is **used-before-defined**: no
constitutional or brief surface defines what a cohort *is*. `decomposition-machinery` is the member that owns
cohort semantics, so it both defines the concept and ships the machinery that operates on it. It is also **its
own second customer**: this cohort was itself created by running (manually) the decomposition this WU codifies,
giving a live worked example to codify against.

## Goals

- Give ARC a **codified upper-bound procedure**: a planning-time decision (decompose or stay one WU) and a
  lifecycle execution (transform a live WU into a cohort), split across the method/workflow line ARC already
  uses for `classify-work-unit` (method) and `init`/`integrate` (workflow).
- Make the decision rest on **design/subsystem orthogonality**, not raw size — with two guard rails (don't split
  below WU-warrant; don't split coupled one-design work for size alone) and a design-maturity timing gate.
- Establish a **bounded grouping taxonomy** — one grouping kind (the cohort), a WU leaf, at most one level of
  nesting — with the path-valued `Cohort` field carrying membership and the on-disk dir mirroring the path.
- Introduce the **`cohort-{name}.md` managed record** as constitutive of every cohort, scaling from a one-
  paragraph Purpose floor to a full coordination surface, with a design-vs-coordination boundary *forced* by the
  cohort-consistency invariant and no coordinator/DRI role.
- Own and enforce the **cohort-consistency invariant** (field↔dir path-match; every grouping dir carries a doc;
  no orphan per-member sections) so the invariant is never defined-but-unenforced.
- **Introduce the cohort concept** into the always-loaded surface (`AGENT-BRIEF.ARC` § Vocabulary), promoting
  any constitutive rule it carries to `DEV-RULES.ARC`.
- **Record the invented model's durable rationale** in a companion ADR (the `Novel`·RFC overlay), joining the
  ADR-019/021/022 line this design leans on.
- **Validate** the procedure against a real case: cleanly re-derive Concurrent Work Conventions's decomposition
  (D1–D4) from CWC's one settled draft.

## Non-Goals

Out of scope, each with its owning member:

- **The `Class` model, the `Cohort` field *schema*, and the relocatability invariant *statement*** —
  `class-model-foundation` (shipped; consumed here). This WU adds only `cohort-*` to the movable-artifact
  *enumeration* so the existing rule covers the new record type.
- **The scalable authoring pipeline** members' specs flow through — `scalable-authoring-pipeline`.
- **Relocatability *enforcement* and source-side movable-artifact ref-enforcement** (the forbidden-pattern
  hook + path-style link-def sweep) — `quality-gate-hooks`. Only the *cohort-consistency* invariant's
  enforcement is in scope here.
- **The `active/`-layout drift hook** (asserting the documented flat `active/` layout matches `meta-reader.ts`
  non-recursive readdir + `worktree-scaffold.ts` flat write) — `quality-gate-hooks` / the worktree-scaffold
  owner. This WU enforces the cohort-consistency invariant because it *owns cohort semantics*; it does not own
  the `active/`-layout invariant, and that check needs code-behavior introspection the structural cohort guard
  doesn't share. Interim gap accepted as low-cost.
- **Dependency-edge lifecycle awareness** (a `Depends On` edge is state-blind — it names a dependency without
  signaling whether it has shipped) — `operational-state-docs`, which owns the dependency-metadata field
  semantics. A coordination seam, not a blocker here (see Cross-cutting).
- **The merge/rebase discipline for delivering a decomposed stack, and the create-new `arc start` wiring** —
  Concurrent Work Conventions. This WU owns the *decision* to decompose and the *transform* into a cohort; CWC
  owns delivering the resulting stack safely.
- **The broad reconciliation of `strategy-work-organization` § Task Lists and Branches** (stacked-PRs / phased /
  team-sub-branch pre-ADR-019 leftovers) — `doc-cascade-sweep`'s terminal cross-strategy retirement sweep. A
  *local* neutralize of that section, if this WU's own edits would leave it self-contradicting, stays in scope
  (see Cross-cutting).

## Proposed Design

The design has six surfaces: (A) the `assess-cohort-fit` **method**; (B) the grouping **taxonomy**; (C) the
`cohort-{name}.md` **record** + template; (D) the `decompose-work-unit` **workflow**; (E) the
**cohort-consistency invariant + enforcement**; (F) the **concept introduction**. A concurrency seam (G) and a
forward-compat constraint (H) cut across them; a companion **ADR** (I) records the invented model's rationale.

### A. `assess-cohort-fit` — the planning-time *decide* method

A planning-time method, paired sibling of `classify-work-unit` and **co-located with it**: the upper-bound
WU-vs-cohort test is the mirror of `classify-work-unit`'s lower-bound Errand-vs-WU test (its boundary test #1),
so it belongs to the same classification family and fires at the same kind of touchpoints. It produces a
**cut-map** — members + dependency edges + deliverable boundaries + slugs — or the decision "stays one WU." It
is a *decision*, never a structural change. The name is `assess-cohort-fit` — it names the verdict ("one WU, or a
cohort?") without presupposing the cut; an `assess-` planning-judgment verb (distinct from the `decompose-work-unit`
workflow that *executes*), not the symmetric `verb-work-unit` mold (`scope-` reads as the in/out boundary sense,
`size-` fights the orthogonality-not-size thesis).

**A1. The discriminator — orthogonality, not size.** Decompose on **design/subsystem orthogonality +
independent deliverability/ownership**, *not* raw size. Size is a secondary symptom, and only when it spans
*unrelated* subsystems (review-sizing research: defect detection craters past ~200–400 LOC per review increment;
~800–1000 LOC across *orthogonal* systems is a decompose signal). Tightly-coupled work designed as a whole stays
**one WU even when large** — the per-task review grain carries quality — and splits later only if it
destabilizes. **Concern multiplicity is the trigger; LOC is a heads-up.**

**A2. Two guard rails.**

- **Lower rail — don't split below WU-warrant.** Decompose only until each piece independently warrants a WU
  (the ADR-021 threshold). A piece too small is a **phase of a sibling** or an **Errand**, never a peer WU.
  ("Making a 3-task piece its own WU feels silly" is this rail firing.)
- **Upper rail — don't split coupled one-design work for size alone.** Over-decomposition is a real failure mode
  (the microservices premature-split trap: chatty coordination, onboarding cost). Both rails ship because a
  given author's bias will press on only one of them.

**A3. Timing — gated on design maturity.** Decompose when the design is **stable enough that the cuts are
real**, not before. Speculative design → hold as one unit and iterate; settled design → decompose. **The cut is
firm at the maturity gate:** once decomposed properly at design maturity, the cut itself — members, dependency
edges, deliverables, slugs — is settled; if it isn't, you decomposed too early, which the gate prevents. What
stays open is **not the cut** but each member's ordinary spec-time openness (internal sizing/phase shape, and
the universal possibility a member recurses into a sub-cohort) — identical to any backlog stub's openness, not a
special provisionality of decomposition output.

**A4. Model B only — a cohort of self-contained WUs.** When a concern exceeds one WU it becomes a **cohort of
self-contained, single-owner WUs** (each its own `meta-* + spec-* + tasks-*`, one branch, one PR) — **not** one
WU sliced into stacked PRs (Model A). "Stacked PRs" survives **only** as Model B's *dependency-ordered delivery
mode* — a stack of WUs, each its own branch, merged in order; the merge/rebase discipline for executing such a
stack is Concurrent Work Conventions's, not this WU's. (Rationale in § Alternatives.)

**A5. Plan-grouping ≠ delivery-grouping.** One concern **plans** as a single coherent draft/spec but
**delivers** as a stack of PR-sized WUs along natural deliverable/phase boundaries. At decomposition the one
draft becomes **N self-contained WU specs + cross-WU coordination** in `cohort-{name}.md`.

**A6. Sizing heuristics (sense oversize ahead).** Count distinct deliverables / independently-reviewable
surfaces; estimate LOC + file count; test "reviewable in one sitting." A signal of `>~few-hundred LOC` /
`>~8–10 files` / multiple independent review surfaces → stack-or-cohort, not one WU. **Stack vs. cohort:**
sequentially-dependent → stack (ordered PRs); independent-ish → cohort (parallel WUs). The mental model is
**cohort ≈ epic, WU ≈ story / one reviewable PR**; the gap this method fills is the codified concern → WU-count
mapping. The sizing *standard itself* co-homes in `strategy-work-organization` (a WU-sizing standard the method
*consumes*), not authored here.

**A7. Member-slug naming heuristic.** When the cut produces members, **their slugs must read legibly out of
context.** Dependency edges (`**Depends On:**`) carry bare WU-names with no cohort path, so a downstream WU reads
`Depends On: <slug>` cold: `model-foundation` is opaque, `class-model-foundation` self-describes. Naming is part
of the cut, not an afterthought. **Never encode order in the slug** — no `-pt1`/`-pt2` ordinals (they fabricate
sequencing and aren't self-describing); inter-member order, when it exists, lives in `Depends On`.

**A8. Output — the cut-map.** The method produces the **cut-map**: members (with slugs), internal dependency
edges, deliverable boundaries — or "stays one WU." The cut-map is the **DRY interface** between method and
workflow: the method *produces* it, `decompose-work-unit` *consumes* it; no decision logic in the workflow (it
never re-derives the cut), no structural change in the method.

**A9. Fire-points — the two derivation stages, not depth-gated.** Decomposition is a design-orthogonality
judgment gated on design maturity, so it fires where design is the live artifact: **`draft-design`** (the
*predicted* arm) and **`create-spec`** (the *emergent* arm). Like `classify-work-unit`, it is **not
depth-gated** — a cheap confirm at every design-stage read (trivially cleared for a single determinate concern,
expensive only when it fires affirmative). Decompose-candidacy keys on orthogonality/breadth — a *different
axis* than derivation depth — so gating it behind `high` depth would miss exactly the low-derivation-but-wide
cohorts. **`generate-tasks` coverage is free:** a "this should be multiple WUs" discovery during task generation
is a *derivation-class* signal, which `resolve-planning-depth`'s re-entry valve already routes **upstream** to
the design stages where `assess-cohort-fit` lives — the costly escape-hatch the timing rule warns against,
not a new fire-point.

### B. The grouping taxonomy — nested cohorts, WU leaf

**B1. One grouping kind; coordination by degree.** There is **one grouping kind — the cohort** — and
coordination is a *property it carries by degree*, not a separate category. A **cohort** is any deliberate
grouping of sibling WUs; it **always carries a `cohort-{name}.md`** (no exceptions). A grouping that only
*organizes* carries a Purpose-only doc; one that actively *coordinates* carries a fuller body. The difference is
**how much the doc says, not what kind of thing the grouping is.** A **WU** is the leaf deliverable (one branch,
one PR, its own `meta-* / spec-* / tasks-*`).

**B2. "Theme" is informal prose only.** "Theme" survives only as informal prose for a top-level,
mostly-organizing cohort — never a distinct schema kind, never a doc-less exception. (It broke at the
single-segment `Cohort` value, where a theme and a genuine top-level cohort are syntactically identical and
disambiguated *only* by doc-presence; collapsing to one kind with a Purpose-floor doc dissolves the wrinkle.)

**B3. The nesting cap — one level.** At most `<cohort>/<subcohort>/<wu>` — never three grouping segments. A
plain structural bound (anti-sprawl), **not** a limit on coordination: *both* levels may coordinate. Each level
above the WU is optional. The required one-paragraph Purpose doubles as a **reality check** — if you can't
expand the slug into a sentence distinguishing this cohort from "a pile of loosely-related WUs," it shouldn't
exist.

**B4. Path-valued `Cohort` semantics + dir-path mirroring.** Nesting lives in the path-valued `Cohort` field
(`principle-anchored-core/agile-wu-lifecycle`), not a distinct artifact type: one `cohort-{name}.md` shape and
one `template-cohort.md` at *every* level — an inner cohort differs from a top-level one *only* by path depth
(capped at two segments) and by how much its doc says. "Sub-cohort" is prose framing, never a `subcohort-*`
prefix. **The on-disk dir mirrors the path.** The relocatability invariant (pure `git mv`) is unaffected (just
more dir levels). This WU owns these *semantics*; the field *schema* (the field exists, is path-valued, capped
at two segments, membership derived) is `class-model-foundation`'s — the two compose: the field carries the
value, this WU defines what legal values mean and what structure they imply.

**B5. A decomposing WU becomes a cohort — three arms by parent position.** When a WU decomposes it **becomes a
cohort**, its `cohort-{name}.md` repurposed from the origin draft's coordination content. Which arm runs is
selected by the parent's position relative to the nesting cap:

1. **Standalone WU → top-level cohort.** A WU in no cohort becomes a new top-level cohort carrying its name,
   members nested beneath. **Name preserved.**
2. **In-cohort WU (single-segment parent) → sub-cohort.** A WU already in a cohort becomes a **sub-cohort** under
   its existing parent, members nested one level deeper. **Name preserved.**
3. **At-cap WU (two-segment parent) → lateral fan-out.** A WU *already at the nesting cap* has no legal nested
   target (minting a cohort beneath it would be a forbidden third grouping segment). It decomposes **laterally**
   into sibling WUs under its *existing* parent (peers of its current siblings). **The name is not preserved as
   a grouping node** — grouping identity moves off the slug and onto an explicit provenance record (B6).

Arms 1–2 preserve the name — and so the browsing/narrative/mental-model references — at the right altitude.
Across all three arms the "name loss breaks references" worry dissolves: **dependency edges (`Depends On`) are
always WU→WU**, never group-level, so a downstream WU re-points to the specific delivering pieces regardless of
name; **narrative/browsing references** (WORKING-MEMORY, sibling drafts, cohort docs) are what the preserved
name saves in arms 1–2 (a WU→cohort *rename*, swept at decomposition), and in arm 3 the same "these came from
one concern" fact is carried by the provenance record. `ROADMAP` / `STATUS.USER` render from metas, so regen
handles the WU→cohort shift automatically — no manual roster anywhere.

**B6. The at-cap arm — grouping as provenance, not live grouping.** Because no cohort node is minted at the cap,
the "these came from one concern" fact is preserved as **provenance (an immutable past-event record), not live
grouping (maintained membership).** A maintained roster/identifier/per-section tag would re-mint the very
grouping node the cap denied, introduce a second source of truth against membership-is-derived, and sit
invisible to the cohort-consistency invariant (which keys on the `Cohort` path, identical across these
siblings). So:

- **The original concern name is the stable common identifier** — recorded once, write-once at fan-out, as an
  explicit **cohort-level provenance note in the parent cohort doc**, in greppable phrasing: *"Fanned out from
  `<origin>`: `<m1>`, `<m2>`, `<m3>` (at-cap lateral decomposition)."* It never drifts (it records a past
  event), needs no guard, and is stronger than any slug convention.
- **Slugs stay content-legible** (the A7 heuristic), **never ordinal**. A shared meaningful root is welcome
  where it falls out naturally, but never forced and never abbreviated.
- **Inter-member order, if any, lives in `Depends On`** — parallel-able siblings carry no inter-edges and imply
  no sequence, preserving parallel delivery as a real option.
- **Coordination for the new siblings rides the parent cohort doc** — they are members of it now, taking
  per-member sections there. The cap means "no new grouping node; reuse the parent's."
- **Mis-scope reality-check (judgment prompt, not a gate):** before committing to a lateral fan-out, ask whether
  hitting the cap signals the *parent cohort* was mis-scoped (→ a parent restructure) rather than a clean
  lateral split. A prompt only — a legitimately-scoped member can simply outgrow itself; the cap is not raised
  to rescue it (that would erode the anti-sprawl bound's firmness).

### C. The `cohort-{name}.md` record + `template-cohort.md`

**C1. Constitutive of every cohort (ADR-022 family).** `cohort-{name}.md` joins the structured-record family
alongside the meta record (ADR-022). Its presence is what marks a dir as a deliberate grouping rather than an
incidental parent — there is **no doc-less grouping**. Content scales from pure orientation to full
coordination:

- **H1 + uniform preamble** (from `template-cohort.md`).
- **Required floor — a one-paragraph `Purpose`:** an expansion of the slug; the minimum that makes the file
  non-vacuous; also the grouping's reality check. May **sharpen** into a thesis as the grouping tightens.
- **Optional coordination content (accretes above the floor):** shared contracts (cross-member design no single
  WU owns), closeout criteria, a parent-cohort pointer (derivable from the `Cohort` path). There is **no
  `Coordinated` flag** — coordination is a continuum of how much the doc says.
- **Per-WU sections, keyed by slug — a *partitioned coordination surface*, not a membership roster.** Each
  member edits only its own section, so parallel writers line-merge cleanly.

**C2. Membership stays derived.** Membership derives from each WU's `Cohort` field (the meta record is the source
of truth). A per-WU section is therefore a *subset* of members — a WU gets one only when it has cross-cutting
coordination to record; a missing section means "nothing to coordinate." The doc never carries a roster or
status table (those render). Orphan per-WU sections (a renamed/removed WU) are caught by the cohort-consistency
invariant (E).

**C3. The design-vs-coordination boundary (forced, not chosen).** The doc carries **coordination only — never
design that drives a task list** — and this is *forced* by the invariant. A contract's authoritative definition
drives its implementing member's task list, so it **must** live in that member's spec; the cohort doc holds only
a *pointer* plus the consumer list. Coordination splits two ways: **cohort-level** for genuinely ownerless
shared material (thesis, closeout criteria, a convention all members honor); **per-member** for a member's own
surface, framed as **exposes/consumes**. The per-member partition is a deliberate **forcing function**: if a
member's section fills with design that drives its own tasks, that visible smell *is* the signal the content
belongs in its spec.

**C4. No coordinator / DRI.** A cohort needs none: membership is derived, coordination is partitioned per-member
(each edits only its own section), and cohort-level material is by definition ownerless — *the partition is the
coordination mechanism, in place of an owner.* `Owner` stays WU-level; any future team-scale arbitration need
routes to the team-coordination strategy / Concurrent Work Conventions, not a role minted here.

**C5. Relocatability + reference hygiene.** `cohort-{name}.md` is a **movable `.arc/` artifact** and adopts the
WU-artifact relocatability + reference-hygiene invariant *wholesale* — not a special case. It relocates
`backlog/planned/<cohort>[/<subcohort>]/ → completed/` when the cohort's last member ships (a pure `git mv`, no
content edit), so it carries position-independent references exactly as `meta-* / draft-* / spec-* / tasks-*` do:
**inbound** references to it are backticked-filename-only (no Markdown links, no paths); **outbound** from it
carries no relative-path links at all. The outbound rule is satisfiable by construction — a cohort doc names
sibling drafts/specs by backticked filename, and the parent-cohort pointer is *derivable from the `Cohort`
path*. The relocatability invariant's *statement* is `class-model-foundation`'s (consumed, not restated); what
this WU adds, because it introduces the record type, is **naming `cohort-*` in the movable-artifact
enumeration** (`DEV-RULES.ARC` § Artifact relocatability / § `.arc/` artifact references) so the existing rule
covers it. *Enforcement* of `cohort-*` reference hygiene rides `quality-gate-hooks` (out of scope); only the
*cohort-consistency* invariant's enforcement is in scope here.

**C6. `template-cohort.md` body — deferred by method.** The exact coordination field set + per-member section
shape are *generalized from the prototype* cohort docs minted at this cohort's own decomposition
(`cohort-agile-wu-lifecycle.md` is the live first prototype), not designed top-down — the rare legitimate
deferral (cf. the spec templates). Authored at execution from the prototype, field set explicitly marked
prototype-iterate; not design debt. (See Open Questions.)

### D. `decompose-work-unit` — the lifecycle *execute* workflow

A genuine lifecycle transition (a WU changing *what it is*), earning its own workflow + PR story. Renamed off
"graduation" — that term is reserved for the readiness ladder (`provisional → planned → active`,
`class-model-foundation`'s `graduate-work-unit`); reusing it for the WU→cohort split would collide with shipped
vocabulary.

**D1. A park-shaped exit, not an integrate.** `decompose-work-unit` reuses the **park** *pattern*'s mechanics
(`active/ → backlog/`, PR to `main`, branch + worktree teardown) with cohort-specific choreography — authored
inline as named extractable blocks, since no `park-work-unit.md` workflow exists yet (park/resume are the planning
conductor's, §20, which will reuse these blocks rather than re-author them). It is **not** an `integrate-work-unit`
(no code deliverable, no `completed/` archive). It **runs on the originating planning branch** as that WU's
terminal act — no fresh branch, no `Active` step.

**D2. Steps.** Mint the cohort (dir + `cohort-{name}.md` from the origin draft's coordination content) →
**backfill the parent cohort's doc if absent** → scaffold the N member stubs in
`backlog/planned/<cohort>[/<subcohort>]/` (`meta-* + draft-*` each, fields set per D3) → distribute the origin
draft's design into each member draft per the distribution discipline (D5) → re-point *incoming* `Depends On`
(**sweep every meta whose `Depends On` names the origin**, not only the dependents the cut-map named — this
cohort's own decomposition found three incoming edges where the cut-map listed one) → **verify** (the three
cohort-consistency conditions, E) → **retire the origin `meta-* + draft-*`** (deleted; fully redistributed) →
regen `ROADMAP` → park-shaped PR to `main` → branch/worktree teardown (D6). *(At-cap arm: no cohort is minted —
instead scaffold the members under the existing parent and write the fan-out provenance note into the parent
cohort doc; every other step is unchanged.)*

**D3. Field inheritance on minted stubs.** Each member inherits the originating WU's `**Origin:**` (members of a
decomposed concern share its provenance — `[internal]`, or an external tracker if the origin had one; known at
decomposition time) and carries its own `**Design:** draft-<member>.md`. `**Cohort:**` is path-set to the
(sub)cohort — in the meta *and* mirrored into the member's draft header per the dual-placement convention;
`**Class:**` is the member's own. `**Depends On:**` **distributes by *actual need*, never blanket-inherited:**

- *outgoing* ancestor edges (`origin → X`): a member inherits `Depends On: X` **only if that member genuinely
  depends on X** — blanket-inheriting manufactures artificial serialization (a member that never touches X gets
  falsely gated behind it);
- *internal* edges (`m_i → m_j`): authored fresh from the cut's delivery order;
- *incoming* edges (`Y → origin`): re-pointed to the specific member(s) that deliver what `Y` needs (the D2
  sweep).

**D4. No new State value; members land in `backlog/planned/`.** The origin meta is deleted — the WU *ceases to
be a WU* because it became a cohort. **No `completed/` entry** for the origin (its outputs are *future* work in
`backlog/`); the **cohort** carries the eventual `completed/` archive when its last member ships. Members land
uniformly in `backlog/planned/`; activation is a separate, deliberate act per member (`init-work-unit` Path A),
in dependency order. The cut is **firm**; each member carries only the normal spec-time openness any backlog
stub has.

**D5. Distribution discipline (emergent arm — splitting a monolith).** The origin draft's design is *split*, not
copied, under a four-step gate:

1. **Allocation map** — every section / design-point **and every dependency edge** → its destination (member-X
   draft, cohort-doc cohort-level, cohort-doc per-member, or *dropped — superseded, with reason*).
2. **Classify** by the design-vs-coordination boundary (C3): design-drives-task-list → a member draft;
   coordination → shared / per-member; an owned contract → owner's draft + a reference in the doc.
3. **Conservation gate** — assert every origin section **and outgoing dependency edge** lands in exactly one
   destination (a member that needs it) or is explicitly *dropped-with-reason* (superseded, or satisfied
   internally by the cut) — **no silent loss**; this gates retirement.
4. **Retire** the origin only after the gate passes.

The allocation map is **not throwaway** — it becomes the **decomposition PR description** (the reader-facing
"decompose X → cohort + members; here's where everything went" story + audit trail).

**D6. Teardown branches on `worktree.identity.kind`.** **primary** → switch the worktree back to `branch.base` +
delete the local/remote `plan/<name>` branch; *no* worktree removal. **linked** → delete the branch +
`git worktree remove <path>`.

**D7. Predicted vs. emergent — the relationship is not 1:1**, gated on whether a monolith ever existed:

- **Predicted decomposition** — `assess-cohort-fit` fires affirmative *during* draft-design, while the design
  is still forming. You author directly into the cohort structure; no monolith is created, so
  `decompose-work-unit` does not run.
- **Emergent decomposition** — a holistic draft matures and *then* reveals itself as a cohort (the affirmative
  fires at create-spec). A monolith exists to *split* — this is the arm `decompose-work-unit` + the distribution
  discipline (D5) serve.

**D8. Primitive factoring (DRY).** `decompose-work-unit` is a *separate* workflow (keeping `integrate`
code-shipping-focused). It authors two named extractable blocks (forward-compat, H): the **cohort-scaffold
primitive** (mint cohort + scaffold member stubs + wire deps + verify consistency), shared *now* with the
*predicted* decomposition arm — which draws on it *without* the monolith-splitting distribution step; and the
**`active/ → backlog/` + park-PR + worktree-kind-teardown block**, authored single-source for `integrate` /
`park-work-unit.md` to adopt *when `composable-workflows` lands* — not a present-tense `integrate` refactor.
(`integrate` already owns its own merge and post-merge worktree teardown — the park-exit block shares that
teardown choreography but differs in relocation target, `active/ → backlog/` versus `active/ → completed/`, and
in carrying no code deliverable, so the shared steps are factored to one source rather than duplicated.) Layered:
`decompose-work-unit = [distribution-discipline + retire-origin] ∘ cohort-scaffold ∘ PR-cleanup`; the predicted
arm = `cohort-scaffold` (authored incrementally as the design forms). Plus a lightweight decomposition-PR
description variant.

**D9. Bootstrapping.** The `decompose-work-unit` workflow is itself this WU's deliverable, so this cohort's own
decomposition ran the **manual** park-shaped path above; this WU codifies it *after*, using that run as the
worked example. The first worked example is this cohort's own decomposition PR (#55) — it leads with the
operation ("split X into N deliverable units"), names each unit + where the content went, and follows the
commit/PR surface-language register (plain prose legible without ARC-specific knowledge, artifact references
kept). The codification-against-the-actual-run reconciliation is carried with `doc-cascade-sweep`.

### E. The cohort-consistency invariant + enforcement

**E1. The invariant — three conditions.** (a) A WU's path-valued `**Cohort:**` field must **path-match** its
`backlog/planned/<cohort>[/<subcohort>]/` parent dir-path; (b) **every grouping dir carries a
`cohort-{name}.md`** (constitutive — no doc-less grouping exists) with at least a **`Purpose`** floor; (c) a
cohort doc's per-member section slugs must be a **subset of derived members** (no orphan sections).
Field-vs-dir drift is a silent failure (a WU assigned to one cohort but filed under another).

**E2. Enforcement — co-located with the definition.** This WU owns the *invariant* (cohort semantics is its
charter) **and** its *enforcement* — a **backlog-scoped structural guard** (`active/` is flat and `completed/`
is ordinal, so neither applies): the validator + its pre-commit wiring (the forbidden-pattern / layout-drift
hook family), coordinating with `quality-gate-hooks`' source-side movable-artifact ref-enforcement (same
hook-file family, a different invariant). Co-locating definition and enforcement ensures the invariant is never
defined-but-unenforced. The check **also serves as the cohort doc's schema validator** (Purpose present;
per-member section slugs ⊆ derived members).

**E3. Manual version for the bootstrapping run.** The `decompose-work-unit` procedure carries a **manual**
version of these three checks for the bootstrapping run that precedes this WU (D9); they automate once this WU
ships.

### F. The concept introduction

**F1. `Cohort` entry in `AGENT-BRIEF.ARC` § Vocabulary.** The concept is used-before-defined today.
`AGENT-BRIEF.ARC` § Vocabulary (the terminology-introduction surface, alongside Work unit / Class / Atomic /
Interlock / Review increment) gains a **Cohort** entry: what a cohort is (a deliberate grouping with a
constitutive doc), the nested-cohort / sub-cohort framing, and the WU-leaf relationship. This WU owns the entry
because it owns cohort semantics — the brief is the introduction, the design surfaces above are the definition.

**F2. No standalone rule promotion to `DEV-RULES.ARC`.** The two constitutive rules — every grouping dir carries
a `cohort-{name}.md`; the one-level nesting cap — are *not* promoted as a standalone `DEV-RULES.ARC` behavior
section: that would only restate what the F1 glossary entry already carries on the same always-loaded surface,
while their *enforcement* lives in the cohort-consistency invariant (E), not in prose. `DEV-RULES.ARC`'s sole
cohort addition is naming `cohort-*` in the movable-artifact enumeration (C5) — genuinely additive, extending the
existing reference-hygiene / relocatability rule to a new artifact type. (The brief glossary introduces; § E
enforces; `strategy-work-organization` elaborates — DEV-RULES restating them would add no coverage, since the
brief loads every session too.)

### G. Concurrency — the cohort doc is the one shared-mutable planning artifact (CWC seam)

`cohort-{name}.md` is the deliberate exception to per-worktree isolation (every other planning artifact is
per-WU-on-its-branch). It rides **plain git line-merge** — *not* the notes-ref convergence machinery — so the
per-member partition (C1) is what keeps concurrent edits safe. Two notes flow to Concurrent Work Conventions
(which owns runtime concurrency safety):

- **The advisory cross-cutting gate has a blind spot here.** The Errand matrix's "advisory gate when the owning
  WU is in flight" keys on a single owning WU; the cohort doc is owned by the *cohort*, so the gate is
  ill-defined for it — the most-shared artifact is the least-covered. CWC's behind-base detector is the net that
  does apply (advisory, at resume).
- **Escape hatch if partition proves insufficient:** route `cohort-{name}.md` edits as errands through the
  primary worktree (serialized via `main`) rather than riding WU-branch PRs. Lean: partition-first (cheap);
  serialize-via-main as the fallback.

### H. Forward-compat with `composable-workflows`

A sibling cohort — a *constraint*, not a dependency. Declare `assess-cohort-fit` via the existing
`arc.methods` frontmatter bundle (alongside `resolve-planning-depth` / `classify-work-unit`); author
`decompose-work-unit`'s shared steps as **named, extractable blocks** (the "lane" unit composition trades in) so
resolve-then-load can later hoist them without a rewrite; reference cross-workflow steps by **stable heading
slug** — never ordinals (the brittleness `composable-workflows` fixes) or the extension-reserved `#name` marker.
The durable cross-file step-reference / anchor convention is `composable-workflows`' to provide.

### I. Companion ADR — the invented model's durable rationale

`Class: Novel` invents a model — the bounded grouping taxonomy, the constitutive cohort record, the at-cap
provenance design, and the decompose-method / `decompose-work-unit`-workflow split — and the `Novel`·RFC overlay
calls for an **ADR-companion** under `reference/adr/`, parallel in scope to `class-model-foundation`'s companion
ADR. It records the *durable, cross-cutting* rationale (not the spec's full surface): why a cohort of
self-contained WUs over stacked PRs (Model B over Model A); why orthogonality over size; why one grouping kind
with coordination-by-degree; why the one-level nesting cap with at-cap lateral fan-out + provenance; why a
method/workflow split with the cut-map as the DRY interface; and why no coordinator/DRI. It joins and extends
the ADR-019 (one-branch-per-WU) / ADR-021 (Errand wrapper-floor) / ADR-022 (managed structured records) line
this design builds on.

The ADR is a **non-moving artifact** — it stays under `reference/adr/` through the WU lifecycle (no relocation
across `active/` ↔ `backlog/` ↔ `completed/`), and rides the normal ceremony commit; it is internal-only (it
does not ship to adopters and is not referenced from adopter-facing surfaces).

## Alternatives & Rationale

**Model B (cohort of self-contained WUs) over Model A (one WU sliced into stacked PRs).** Three grounds, weakest
to strongest:

1. **One-branch-per-WU (ADR-019) makes Model A inexpressible.** "One WU across many branches" has no ARC form;
   it can only collapse into a stack of *WUs* — which is just Model B's delivery mode.
2. **ARC's review grain is already sub-PR** (per-task review increment, P2), so Model A's "split PRs to get small
   reviewable units" benefit is largely served at a finer grain already. (This does not replace PR-level review
   — different eyes, different altitude.)
3. **Decisive — Model A forces shared mutable planning artifacts across branches.** One spec + one task list
   edited from N worktrees is exactly the cross-branch shared-mutable state worktree isolation and the
   relocatability invariant exist to prevent: it either gravitates up to the cohort/backlog tier (detaching the
   design from any single task list) or stays on one branch referenced cross-branch (clunky, conflict-prone, a
   relocatability breach). Model B keeps each WU's meta + spec + tasks a self-contained, co-located, relocatable
   bundle. External research reached this independently (Google's one-RFC-to-many-PRs "works at enterprise scale
   only because they accept spec drift").

**Orthogonality over size as the discriminator.** Size as the trigger over-decomposes coupled work and
under-decomposes wide-but-small work. Defect-detection research bounds the *review increment* (~200–400 LOC),
but ARC already reviews per-task at that grain, so the PR-size argument is largely absorbed. What actually
warrants separate WUs is *concern multiplicity* (orthogonal subsystems independently deliverable/ownable); size
across *unrelated* subsystems is a corroborating heads-up, never the primary signal.

**One grouping kind (cohort) over a categorical theme/cohort/sub-cohort tier set.** Earlier drafts made "theme"
a distinct doc-less tier; it broke at the single-segment `Cohort` value, where a theme and a genuine top-level
cohort are syntactically identical and disambiguated only by doc-presence. Collapsing to one kind with a
Purpose-floor doc (coordination by degree) dissolves the wrinkle and removes a doc-less exception that the
constitutive-doc invariant would otherwise have to carve around.

**At-cap provenance (immutable past-event record) over a maintained roster/identifier.** A maintained roster
re-mints the very grouping node the cap denied, introduces a second source of truth against the
membership-is-derived rule, and sits invisible to the cohort-consistency invariant (which keys on the `Cohort`
path, identical across the fanned-out siblings). A write-once provenance note records a past event, never
drifts, needs no guard, and is stronger than any slug convention — it carries the "came from one concern" fact
without re-introducing live grouping the cap forbids.

**No coordinator/DRI over a cohort-owner role.** The per-member partition *is* the coordination mechanism: each
member edits only its own section (clean line-merges), membership is derived, and cohort-level material is
ownerless by definition. A DRI would add a role with nothing load-bearing to do; team-scale arbitration, if it
ever arises, routes to the team-coordination strategy / CWC.

**A method + a workflow over a single combined workflow.** The decision (orthogonality + rails + maturity
timing) and the execution (transform a live WU into a cohort) are semantically distinct and fire at different
times — the method fires at every design-stage read (cheap, repeated); the workflow runs once, as a terminal
lifecycle act. Splitting them across the method/workflow line ARC already uses keeps each cohesive, lets the
predicted arm reuse the cohort-scaffold primitive without the workflow's monolith-split machinery, and makes the
cut-map the single DRY interface between them.

**One level of nesting over unbounded depth.** Decomposition needs *one* bounded level because the common case
is decomposing a WU that is already a cohort member. Unbounded nesting invites sprawl and an unbrowsable tree;
the cap (`<cohort>/<subcohort>/<wu>`) is a structural anti-sprawl bound that still admits coordination at both
levels, with the at-cap lateral fan-out arm handling the "I'm already at the cap" case without raising it.

**Deliberate divergence from Shape Up.** Adopt Shape Up's *self-contained vertical-slice unit* shape; **reject
its design-co-evolves-during-build timing.** ARC stays spec-directed (P1) — settle everything settle-able up
front and never *consciously* defer it, while accepting genuine unforeseeable unknowns surface during impl and
route back to the spec. The divergence is *deliberate under-specification as a design method* (Shape Up) vs.
*best-effort settle + disciplined emergence-handling* (ARC).

## Cross-cutting Considerations

**Testing.** The cohort-consistency validator (E2) gets unit coverage over its three conditions (field↔dir
path-match; constitutive-doc presence; orphan per-member section detection), including the nested-cohort path
case and the negative (drift) cases; its pre-commit wiring gets integration coverage in the hook-family harness.
The **acceptance test** (re-derive CWC's D1–D4, see Success Criteria) is the method's behavioral validation. The
manual bootstrapping checks (E3) need no automated test — they are a one-time human pass superseded by E2.

**Migration / rollout.** No data migration. The rollout *is* the bootstrapping (D9): this cohort's own
decomposition already ran the manual park-shaped path; this WU codifies the workflow and automates the checks
against that real run. `cohort-agile-wu-lifecycle.md` is the live first prototype `template-cohort.md`
generalizes from (C6).

**Dependencies & seams.** Builds atop **shipped** `class-model-foundation` (the `Class` model, `Cohort` field
schema, relocatability invariant statement — consumed, not restated). Coordination seams, none blocking:

- **`operational-state-docs`** — owns dependency-edge lifecycle awareness. This WU's distribution discipline
  (D5) *authors* `Depends On` edges as **live gates** among members, leaving satisfied-ness to be discharged at
  each member's activation; keep the edge-distribution wording consistent with the live-gate semantics
  `operational-state-docs` settles.
- **`quality-gate-hooks`** — owns relocatability/source-side ref-enforcement and the `active/`-layout drift hook
  (both routed out, see Non-Goals); the cohort-consistency guard coordinates within the same hook-file family.
- **Concurrent Work Conventions** — owns the merge/rebase delivery discipline for a decomposed stack and the
  runtime concurrency net for the shared cohort doc (G); also carries the forward-compat consolidation of
  `decompose`'s park-exit teardown with `integrate`'s now-parallel archive teardown into one shared block, once a
  composition mechanism can hoist them (D8).
- **`composable-workflows`** — the forward-compat constraint (H); provides the durable cross-file
  step-reference / anchor convention.
- **`arc-plan-conductor`** — owns `park-work-unit.md` / `resume-work-unit.md` (§20); will reuse this WU's
  single-source `active/ → backlog/` + worktree-kind-teardown blocks rather than re-author them (D1, D8).
- **`doc-cascade-sweep`** — carries the codification-against-the-actual-run reconciliation (D9), the broad
  `strategy-work-organization` § Task Lists and Branches retirement sweep, and the conformance sweep of
  pre-existing cohort docs against this WU's record shape.

**Local reconciliation flag (in scope).** If *this* WU's own `strategy-work-organization` edits (the sizing-norm
co-home, A6) would leave § Task Lists and Branches self-contradicting (its stacked-PRs / phased / team-sub-branch
pre-ADR-019 leftovers contradict the B-only model), **neutralize that section locally in this WU's PR**; the
broader cross-surface tier reconciliation stays `doc-cascade-sweep`'s.

**User-facing impact.** A new planning method fires (cheaply) at the two design stages; a new lifecycle workflow
becomes available for the WU→cohort transition; `AGENT-BRIEF.ARC` § Vocabulary gains a Cohort entry (carrying
the two constitutive rules) and `DEV-RULES.ARC` gains `cohort-*` in its movable-artifact enumeration. No change
to existing commit/push/interlock behavior.

**Novel overlay.** This is `Class: Novel` · `detailed`·RFC — an invented model (the grouping taxonomy, the
cohort record, the at-cap provenance design, the method/workflow split). The Novel overlay's **ADR-companion is
folded into scope** (design area I, Success Criterion 10): a `reference/adr/` ADR capturing the invented model's
durable, cross-cutting rationale, parallel to `class-model-foundation`'s companion ADR and joining the
ADR-019/021/022 line.

## Success Criteria

Validated explicitly at work-unit completion — concrete checks, not aspirations.

1. **Acceptance test passes.** Applying the `assess-cohort-fit` discriminator (A1) + the two guard rails (A2)
   to Concurrent Work Conventions's one settled draft cleanly re-derives CWC's actual decomposition (its D1–D4
   members) without strain. If the orthogonality discriminator and the rails reproduce that cut, the procedure
   works; if it strains, the rule is wrong. (This cohort's own four-member cut is the second worked example.)
2. **`assess-cohort-fit` method exists** as a paired sibling of `classify-work-unit`, co-located with it,
   declared via the `arc.methods` frontmatter bundle: the orthogonality discriminator, two guard rails,
   design-maturity timing, plan-vs-delivery-grouping, Model-B-only, the member-slug naming heuristic, the
   sizing heuristics (consuming the `strategy-work-organization` sizing standard), and the cut-map + fire-point
   model (draft-design / create-spec; not depth-gated; generate-tasks coverage free).
3. **The grouping taxonomy is defined:** one kind (cohort), coordination by degree, WU leaf, the one-level
   nesting cap (≤2 segments), the path-valued `Cohort` field *semantics* + dir-path mirroring, and the three
   decomposition arms (standalone → top-level, in-cohort → sub-cohort, at-cap → lateral fan-out with
   provenance).
4. **The `cohort-{name}.md` record exists** (ADR-022 family) with the Purpose floor / optional coordination /
   per-member-by-slug shape, membership derived, no DRI, the design-vs-coordination forcing function; `cohort-*`
   is added to the movable-artifact enumeration in `DEV-RULES.ARC`; `template-cohort.md` is authored from the
   live prototype with its field set marked prototype-iterate.
5. **The `decompose-work-unit` workflow exists** (park-shaped exit; transforms a live WU → cohort): the D2
   steps, field inheritance (D3), dependency-edge-by-need distribution, the four-step distribution discipline
   (D5), the predicted/emergent arms (D7), the cohort-scaffold + PR-cleanup primitives authored as named
   extractable blocks (D8), the worktree-kind teardown (D6), and the decomposition-PR description variant —
   codified against this cohort's own manual run (D9).
6. **The cohort-consistency invariant + enforcement ships:** the three conditions (E1) as a backlog-scoped
   structural guard with pre-commit wiring (E2), co-located with the invariant definition and serving as the
   cohort doc's schema validator; the manual bootstrapping version (E3) is documented in `decompose-work-unit`.
7. **The concept is introduced:** `AGENT-BRIEF.ARC` § Vocabulary carries a Cohort entry covering the term and its
   two constitutive rules (every grouping dir carries a doc; the one-level nesting cap); the rules are enforced by
   the cohort-consistency invariant (SC6), not restated as standalone `DEV-RULES.ARC` prose.
8. **No silent loss on any decomposition:** the conservation gate (D5.3) asserts every origin section + outgoing
   dependency edge lands in exactly one destination or is dropped-with-reason before the origin is retired; the
   incoming-`Depends On` sweep (D2) re-points every meta naming the origin, not only the cut-map's named
   dependents.
9. **Reference hygiene holds:** `cohort-{name}.md` carries position-independent references (inbound
   filename-only; outbound no relative paths) and relocates `backlog/ → completed/` as a pure `git mv`.
10. **A companion ADR exists** under `reference/adr/` (parallel to `class-model-foundation`'s), recording the
    invented model's durable cross-cutting rationale (Model B over A; orthogonality over size; one grouping kind;
    the nesting cap + at-cap provenance; the method/workflow split + cut-map interface; no DRI); it is a
    non-moving, internal-only artifact.

## Open Questions

Resolved during the work, not deferred as debt:

- **`template-cohort.md` body shape** — open *by method*, not unsettled. The exact coordination field set +
  per-member section shape are generalized from the live prototype (`cohort-agile-wu-lifecycle.md`) at execution,
  with the field set explicitly marked prototype-iterate (cf. the spec templates' legitimate deferral). Settle
  at execution against the prototype; not a resolve-before-starting blocker.
- **Local neutralize of `strategy-work-organization` § Task Lists and Branches** — *resolved:* a **bounded local
  neutralize is in scope**. This WU's own taxonomy + sizing-standard edits render the section's
  multi-branch-per-one-task-list framing (stacked-PRs / phased / team-sub-branches) self-contradicting against the
  B-only model, so reconcile it locally to "decomposition yields a cohort of self-contained one-branch WUs"; the
  broad cross-surface tier reconciliation stays `doc-cascade-sweep`'s regardless.

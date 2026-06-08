---
purpose: Crystallize the design into a spec at the resolved form — the second authoring stage — selecting and emitting the matching template.
audience: collaborative (human and agent)
arc:
  methods:
    - resolve-planning-depth
    - classify-work-unit
    - spec-review
  extensions:
    - pre-spec-finalization-review
---

# Workflow: Create Spec

The second authoring stage — peer to [draft-design](draft-design.md) and
[generate-tasks](2_generate-tasks.md). It crystallizes the design into a **spec** at the form the work demands: a
one-paragraph `brief`, a decision-recording `outline`, or a full `detailed` spec (subtyped PRD or RFC). It reads
the **derivation** axis — how much design must be authored before a competent engineer can start — resolves the
form, selects the matching template, and emits a finalized spec the task list is built from and validated against.

**Stage boundary.** The open-ended shaping of the design — surfacing alternatives, settling direction — is
[draft-design](draft-design.md)'s. By the time create-spec runs, that design is settled (in a `draft-*`, or
determinate enough to need none); this stage **crystallizes** it. Discovery here is spec-completeness, not design
exploration: if it surfaces unsettled _design_ (a real open decision, not merely unwritten detail), that is a
derivation signal — step back to draft-design rather than re-opening shaping here.

**Not the PROJECT-PRD.** This workflow produces work-unit specs, not the project-wide constitutional PROJECT-PRD —
for that, use [02_define-project.md](initial-setup/02_define-project.md).

**Branch context:** Under full protection (`branch.protection: full`), spec creation runs on a planning branch —
verify you are on one before proceeding (created via [init-work-unit][init-work-unit]). Under partial protection
(the default), specs may be created directly on the base branch.

---

## Step 1: Resolve spec form (one derivation read)

Make **one evidence read** on the derivation axis, and let that single read drive both methods:

- [`resolve-planning-depth`][resolve-planning-depth] yields the **level** — `low` / `medium` / `high` — which this
  stage maps to the spec **form**: `low` → `brief`, `medium` → `outline`, `high` → `detailed`. Which evidence
  reads which level is the method's to define; this stage initiates it on the derivation axis and consumes the
  result.
- [`classify-work-unit`][classify-work-unit] confirms-or-ratchets the work unit's **`Class`** against that same
  read.

The richest evidence is the **`draft-*`** when one exists (from draft-design) — read it as the primary input, and
let its produced shape indicate the form: a rich, fully-shaped draft feeds `detailed`; a thin draft or a
determinacy-confirm feeds `brief` / `outline`. When no draft exists, read the standing `Class` plus the problem
directly, narrowing to a **brief-vs-outline** disambiguation.

If a draft carries an `## Inbound Buffer — Pending Integration` section, **integrate those routed notes into the
draft body first** (or consciously reject each) — the buffer is a transit zone that must drain before the draft
feeds the spec, never carried forward as-is. Then assess readiness: unresolved design decisions, open unknowns, or
missing concrete detail the spec would need to specify. If the draft is not ready, surface the gaps and resolve
them (or return to drafting) before investing in spec writing.

The resolved form is this stage's default — re-selectable, never below the derivation floor; it selects the
discovery pass (Step 2) and the template (Step 5). The `**Class:**` decision is live from this read but its write
defers to the spec-generation ceremony commit (Step 6), never a mid-stage meta edit.

## Step 2: Conduct discovery (spec-crystallization, depth-relative)

Discovery here confirms the design is **complete and concrete enough to write — and to validate against — at this
form**, then closes the remaining gaps. With a settled draft this is targeted gap-filling, not open exploration;
without one it covers the same ground from the problem directly. The pass is discover-then-write: work the block
for the resolved form, then write (Step 5) and lightly iterate. If discovery surfaces heavier derivation than the
form assumed, fire the re-entry valve per [resolve-planning-depth][resolve-planning-depth] § Mid-stage re-entry —
re-resolve the form higher, or route to `draft-design` when the design direction is unshaped — rather than
patch-and-limp.

### `brief` — intent + scope + one signal

The design is determinate. Confirm three things are concrete: the intent, the scope boundary, and the one
falsifiable signal that says it worked. Sharpen any that reads fuzzy. A `draft-*` (if any) plus a targeted
question or two suffices — no broad pass.

### `outline` — settle the recorded substance

Confirm the substance the form records is spec-grade: each **decision** is genuinely settled (with its leaning
rationale), not deferred or hand-waved; the **scope boundary** (no-gos) is explicit; the **consequences / risks**
are named; the **success criteria** are concrete and checkable. Fill gaps with targeted questions against the
draft rather than re-deriving the decision set.

### `detailed` — full completeness pass

Work the form to completeness across its substrate and validation surface:

- **Subtype.** Resolve PRD vs RFC by **which kind of derivation dominates** the work unit: product / requirements
  derivation → **PRD** (the open question is _what should this do_); technical-design derivation → **RFC** (the
  open question is _what's the right technical design and its tradeoffs_ — refactor, migration, internal
  architecture, performance rework). One spec per work unit by derivation-kind; the secondary dimension rides as a
  subsection (a PRD's technical constraints; an RFC's note on user-facing impact). If the work seems to want
  **both** a full PRD and a full RFC, treat that as a **decomposition signal** — the work unit holds two concerns
  and wants splitting (one spec per resulting WU by derivation-kind), not two specs authored here.
- **Substrate completeness.** The enumerable unit set the task list is built from and validated against — numbered
  **Requirements** (PRD) or the structured **Proposed Design** (RFC) — is complete and unambiguous.
- **Success criteria.** Concrete, falsifiable, validated at completion — the form-invariant validation anchor.
- **Scope precision.** In- and out-of-scope boundaries are crisp; no soft edges left to creep under pressure.
- **Cross-cutting surface.** The non-functional concerns the form calls for — security, performance, testing,
  migration / rollout (RFC); constraints, dependencies, integration points (PRD).
- **Open questions — open for the right reason.** Genuine implementation detail may be left open, and sometimes
  should be: the "how" within a settled "what / why" belongs to implementation, and a call that truly turns on
  what implementation reveals is better made then than guessed now. What may **not** be left open is _settle-able
  design_ — a decision that could and should be made pre-implementation. Deferring one is a masked design
  decision: a derivation signal — route it to the design (draft / spec), never park it as an open question or push
  it into the task list. See [DEV-RULES.ARC][dev-rules-arc] § Design before implementation.

**Novel overlay** (`Class == Novel`, advisory). At `detailed`, an invented model warrants an **ADR-companion** —
an ADR under `reference/adr/` capturing the invented model's durable, cross-cutting rationale. **Subtype-keyed:**
recommend it strongly at `detailed`·RFC (an invented architectural model is ADR's home turf, and the RFC's inline
Alternatives & Rationale is not redundant — this-design rationale vs. a durable cross-cutting decision), weak or
omitted at `detailed`·PRD (product-concept novelty is far less ADR-shaped). Accept-or-decline, never a gate. An
accepted ADR is a **non-moving artifact** — it stays under `reference/adr/` through the WU lifecycle (no
relocation, no Novel branch at integration) and rides the normal ceremony commit.

For interactive sessions, provide numbered options to keep responses quick.

## Step 3: PROJECT-PRD alignment check

Always-on floor — fires at every form, its cost naturally proportional to the spec's surface (a `brief` clears it
near-instantly). Evaluate the spec's scope (crystallized in Step 2) against PROJECT-PRD's Principles and Out of
Scope — the principle catalog is the project's vision contract.

**Halt-and-ask conditions:**

- The spec's scope conflicts with a named PROJECT-PRD principle
- The spec introduces scope that PROJECT-PRD lists as Out of Scope

On either, halt and surface the specific conflict — user direction needed before save.

**On pass — cite the principle by name.** Not "checked, passes" — "checked against the _Configurability_
principle — passes". Substantive citation keeps the alignment check load-bearing rather than ornamental.

## Step 4: TECHNICAL-OVERVIEW alignment check (conditional)

Always-on floor, conditional on surface: fires only when the spec touches technical surfaces — tech stack,
architecture, runtime, dependencies, or infrastructure. Independent of Step 3: PROJECT-PRD covers problem / scope /
principles; TECHNICAL-OVERVIEW covers technical surfaces. A single spec may trigger both, one, or neither.

**Halt-and-ask condition:** The spec introduces tech (component, framework, dependency, infrastructure choice) not
in TECHNICAL-OVERVIEW. On detection, halt and surface the drift — user direction needed before save.

The companion downstream condition ("TECHNICAL-OVERVIEW edited since the spec was approved") fires at
[`activate-work-unit.md`][activate-work-unit] and [`integrate-work-unit.md`][integrate-work-unit], not here — at
create-spec time the spec hasn't been approved yet.

**On pass — cite the section by name.** Not "checked, passes" — "checked against § 2 Architecture Components —
passes". Section-based citation reflects TECHNICAL-OVERVIEW's structure (parallel to Step 3's named-principle
citation).

## Step 5: Write and save the spec

Select the template for the resolved form (and subtype) from the spec template family, and generate the spec from
it:

- `brief` → [template-spec-brief.md][template-spec-brief]
- `outline` → [template-spec-outline.md][template-spec-outline]
- `detailed` · PRD → [template-spec-detailed-prd.md][template-spec-detailed-prd]
- `detailed` · RFC → [template-spec-detailed-rfc.md][template-spec-detailed-rfc]

**Strip template scaffolding on emit.** The detailed templates carry authoring scaffolding that does not belong in
a finalized spec — remove it as you write:

- the top paired-mode scaffolding comment block,
- the `` · `omit-when-paired` `` / `` · `optional | omit-when-paired` `` heading flags (keep the heading text
  itself), and
- the inline non-rendering scaffolding comments under flagged sections.

When two `detailed` specs are authored as a **paired** PRD + RFC, additionally drop the flagged sections entirely:
the PRD's Technical Considerations and the RFC's context spine (Introduction / Goals / Non-Goals) — the PRD owns
the shared spine, the RFC references it. A standalone `detailed` spec keeps every section; only the markers are
stripped.

**Naming:** The `{name}` descriptor in the spec filename becomes the work unit's identifier across all artifacts —
task list (`tasks-{name}.md`), notes (`notes-{name}.md`), completion record, and branch name. Choose a concise,
descriptive slug (e.g., `api-modernization`, `cli-implementation`). Avoid abbreviations that only make sense in
context or overly long compound names.

**Save location** depends on your project's PM mode ([`arc-config.yml`][arc-config] → `pm.mode`):

- **arc-in-git**: `.arc/backlog/{provisional,planned}/{name}/spec-{name}.md` — specs start in backlog and
  graduate to `active/` during [activation][activate-work-unit]
- **none / external**: `.arc/active/spec-{name}.md` — specs save directly to active (no backlog directory). Create
  the directory first if it doesn't exist: `mkdir -p .arc/active/`

## Step 6: Finalize — review, retire the draft, persist `Class`, commit

Before surfacing the spec for approval, run the [spec-review][spec-review] self-review on what you just wrote — a
coherence + grounding pass scaled to the form (it collapses to a single minimal check at `brief`). Fold in the
fixes it surfaces; carry anything that needs a decision into the review below. A finding that reopens design is a
derivation signal — fire the re-entry valve per [resolve-planning-depth][resolve-planning-depth] § Mid-stage
re-entry (route it to the design, never patch it into the spec).

- **Extensions** · `#pre-spec-finalization-review`: If `pre-spec-finalization-review` appears in the
  active-extensions list (established at session init), load and execute its
  [`.actions`][pre-spec-finalization-review] — a team's own spec-review ceremony layered on the default
  self-review. Otherwise, skip.

> [!IMPORTANT]
> `workflow-interlock`: Stop after the spec is saved and self-reviewed. Surface the spec location and the
> self-review findings for review; await approval before proceeding to draft retirement + meta update + commit.

If a `draft-*.md` document fed into this spec, retire it now. Drafts are ephemeral — they serve exploration and are
deleted once the spec captures the conclusions (see [Work Planning Strategy][work-planning] § Draft Documents).

1. **Audit for reference content**: Scan the draft for implementation detail, design rationale, or context the
   spec doesn't capture but would be valuable during task generation or execution. Migrate this to a `notes-*.md`
   file alongside the spec (same directory). Keep the notes header minimal (title + contents only) — no purpose
   block, no provenance to the draft, no commit metadata. See [DEV-RULES.ARC][dev-rules-arc] § Documentation
   Boundaries.
2. **Delete the draft**: `git rm` the `draft-*.md` file (and any supplemental files that fed into it, unless they
   have independent archival value — e.g., research files may belong in `reference/supplemental/research/`).
3. **Update planning-state meta file** (when present): If `.arc/active/meta-{name}.md` exists with
   `**State:** Planning` (planning-branch sessions), persist the resolved `**Class:**` (live from Step 1) and
   advance its `**Next Action:**` to the post-spec step (e.g., "Run `2_generate-tasks.md`"). The `Class` write
   lands here, at this ceremony commit — never as a mid-stage meta edit. Skip otherwise (no meta file exists
   pre-init under non-planning-branch flows).

After substeps 1-3, stage all edits — spec save (Step 5), any promotion-write inbox deletion (Step 5, arc-in-git),
draft deletion + `notes-*` migration, meta update.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`. Subject `chore(arc): create spec-{name}`; body itemizes
> the bundled changes per [DEV-RULES.ARC][dev-rules-arc] § Commit format and § Meta-file commit shape.

---

## Next Step

Run [2_generate-tasks.md](2_generate-tasks.md) when ready — it consumes this spec as input.

---

[work-planning]: ../../../reference/strategies/arc/strategy-work-planning.md
[resolve-planning-depth]: ../../methods/resolve-planning-depth.md
[classify-work-unit]: ../../methods/classify-work-unit.md
[spec-review]: ../../methods/spec-review.md
[pre-spec-finalization-review]: ../../extensions/pre-spec-finalization-review.md
[template-spec-brief]: ../../../reference/templates/arc/work-unit/spec/template-spec-brief.md
[template-spec-outline]: ../../../reference/templates/arc/work-unit/spec/template-spec-outline.md
[template-spec-detailed-prd]: ../../../reference/templates/arc/work-unit/spec/template-spec-detailed-prd.md
[template-spec-detailed-rfc]: ../../../reference/templates/arc/work-unit/spec/template-spec-detailed-rfc.md
[activate-work-unit]: work-unit-lifecycle/activate-work-unit.md
[integrate-work-unit]: work-unit-lifecycle/integrate-work-unit.md
[init-work-unit]: work-unit-lifecycle/planning/init-work-unit.md
[arc-config]: ../../arc-config.yml
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md

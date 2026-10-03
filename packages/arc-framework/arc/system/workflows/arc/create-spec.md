---
purpose: >-
  Crystallize the design into a spec at the resolved form — the second authoring stage — selecting and emitting
  the matching template.
audience: collaborative (human and agent)
arc:
  methods:
    - resolve-planning-depth
    - classify-work-unit
    - assess-boundary-fit
    - assess-draft-readiness
    - assess-design-proportionality
    - spec-review
    - adversarial-review
    - design-audit
  extensions:
    - pre-spec-finalization-review
---

# Workflow: Create Spec

For every write — authoring, revision, gate iteration, and folds — a claim that states what shipped code does names
the code that does it, in backticked symbol form, per [source-grounding][source-grounding].

The second authoring stage — peer to [draft-design](draft-design.md) and [generate-tasks](generate-tasks.md).
It crystallizes the design into a **spec** at the form the work demands: a one-paragraph `brief`, a
decision-recording `outline`, or a full `detailed` spec (subtyped PRD or RFC). It reads the **derivation** axis
— how much design must be authored before a competent engineer can start — resolves the form, selects the
matching template, and emits a finalized spec the task list is built from and validated against.

**Stage boundary.** The open-ended shaping of the design — surfacing alternatives, settling direction — is
[draft-design](draft-design.md)'s. By the time create-spec runs, that design is settled (in a `draft-*`, or
determinate enough to need none); this stage **crystallizes** it. Discovery here is spec-completeness, not
design exploration: if it surfaces unsettled _design_ (a real open decision, not merely unwritten detail), that
is a derivation signal — step back to draft-design rather than re-opening shaping here.

**Not the PROJECT-PRD.** This workflow produces work-unit specs, not the project-wide constitutional PROJECT-PRD
— for that, use [02_define-project.md](initial-setup/02_define-project.md).

**Branch context:** Under full protection (`branch.protection: full`), spec creation runs on a planning branch —
verify you are on one before proceeding (created via [init-work-unit][init-work-unit]). Under partial protection
(the default), specs may be created directly on the base branch.

**Mark the stage** on entry _only when entering without a draft_ (`draft-{name}.md` absent — `draft-design` was
skipped or produced no draft): `arc set-stage create-spec` corrects the stale `draft-design` pointer so a mid-stage
handoff resolves correctly. When a draft exists, `draft-design`'s finalization already advanced the pointer here —
skip the write.

---

## Resolve depth & Class

Make **one derivation-axis read**, then run [`resolve-planning-depth`][resolve-planning-depth] and
[`classify-work-unit`][classify-work-unit] off it: one read drives both, yielding this stage's **level** (`low`
/ `medium` / `high`) — which it maps to the spec **form** (`low` → `brief`, `medium` → `outline`, `high` →
`detailed`) — and confirming-or-ratcheting **`Class`** against that same read. The methods own how the read maps
to a level, and the mid-stage re-entry valve.

Off the same read, run [`assess-boundary-fit`][assess-boundary-fit] — the boundary confirm paired with
`classify-work-unit`. Dispatch its one selected outcome before crystallizing the spec:

| Outcome                                  | Owner                   | Action                                                                                                                                                        |
| ---------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stays one WU`                           | Current authoring stage | Record outcome and evidence basis in existing spec decision prose; continue whole and stay silent while evidence is materially unchanged.                     |
| `cut-map`                                | `decompose-work-unit`   | Route the complete cut-map before crystallizing a monolith; that workflow alone owns the transform.                                                           |
| `stays one WU + delivery-plan candidate` | Current authoring stage | Record outcome and evidence basis in existing spec decision prose; make discovery and spec emission slice-aware without publishing or binding delivery state. |

The selected result is sticky planning judgment. At later fire-points, compare the evidence semantically and
re-raise only for a material new-evidence delta, never for mere invocation, elapsed time, or restatement. No CLI
parser, fingerprint, schema, or new decision record is introduced.

The richest evidence is the **`draft-*`** when one exists (from draft-design): read it as the primary input, and
let its produced shape indicate the form — a rich, fully-shaped draft feeds `detailed`; a thin draft or a
determinacy-confirm feeds `brief` / `outline`. With no draft, read the standing `Class` plus the problem
directly, narrowing to a **brief-vs-outline** disambiguation.

If a draft carries an `## Inbound Buffer — Pending Integration` section, **integrate those routed notes into the
draft body first** (or consciously reject each) — the buffer is a transit zone that must drain before the draft
feeds the spec, never carried forward as-is. Then assess formalization-readiness via the
[assess-draft-readiness][assess-draft-readiness] method; on **not-ready**, surface the returned gaps and resolve
them inline (or return to drafting) before investing in spec writing.

The resolved form is this stage's default — re-selectable, never below the derivation floor; it selects the
discovery pass below and the template at Write and save. The `**Class:**` decision is live from this read but
its write defers to the spec-generation ceremony commit (Finalize).

## Conduct discovery (spec-crystallization, depth-relative)

Discovery here confirms the design is **complete and concrete enough to write — and to validate against — at
this form**, then closes the remaining gaps. With a settled draft this is targeted gap-filling, not open
exploration; without one it covers the same ground from the problem directly. The pass is discover-then-write:
work the block for the resolved form, then write and lightly iterate (Write and save, below). If discovery
surfaces heavier derivation than the form assumed, fire the re-entry valve per
[resolve-planning-depth][resolve-planning-depth] § Mid-stage re-entry — re-resolve the form higher, or route to
`draft-design` when the design direction is unshaped — rather than patch-and-limp.

### Proportionality guard (all forms)

As discovery crystallizes the settled design, run
[`assess-design-proportionality`][assess-design-proportionality] with the chartered problem, the current spec
candidate, and key existing substrate pointers when useful. Apply it at every form. On `proportionate`, continue
silently. On `revise`, correct a wrong named mechanism, shape, or interface in the spec candidate when the design
is already settled; when the finding exposes an unshaped or under-derived direction, fire
[`resolve-planning-depth`][resolve-planning-depth]'s mid-stage re-entry valve and return to `draft-design`.

### Scope-boundary carry-forward (all forms)

The spec's boundary inherits the draft's and sharpens it; never silently drop a commitment the draft recorded.
Where no `draft-*` exists, the inheritance arrives as the determinacy-confirm carried from `draft-design`
rather than a draft section — carry it forward the same way.

### `brief` — intent + scope + one signal

The design is determinate. Confirm three things are concrete: the intent, the scope boundary, and the one
falsifiable signal that says it worked. Sharpen any that reads fuzzy. A `draft-*` (if any) plus a targeted
question or two suffices — no broad pass.

### `outline` — settle the recorded substance

Confirm the substance the form records is spec-grade: each **decision** is genuinely settled (with its leaning
rationale), not deferred or hand-waved; the **scope boundary** (no-gos) is explicit; the **consequences /
risks** are named; the **success criteria** are concrete and checkable. Fill gaps with targeted questions
against the draft rather than re-deriving the decision set.

### `detailed` — full completeness pass

Work the form to completeness across its substrate and validation surface:

- **Subtype.** Resolve PRD vs RFC by **which kind of derivation dominates** the work unit: product /
  requirements derivation → **PRD** (the open question is _what should this do_); technical-design derivation →
  **RFC** (the open question is _what's the right technical design and its tradeoffs_ — refactor, migration,
  internal architecture, performance rework). One spec per work unit by derivation-kind; the secondary dimension
  rides as a subsection (a PRD's technical constraints; an RFC's note on user-facing impact). If the work seems
  to want **both** a full PRD and a full RFC, treat that as a **decomposition signal** — the work unit holds two
  concerns and wants splitting (one spec per resulting WU by derivation-kind), not two specs authored here.
- **Substrate completeness.** The enumerable unit set the task list is built from and validated against —
  numbered **Requirements** (PRD) or the structured **Proposed Design** (RFC) — is complete and unambiguous.
- **Success criteria.** Concrete, falsifiable, validated at completion — the form-invariant validation anchor.
- **Scope precision.** In- and out-of-scope boundaries are crisp; no soft edges left to creep under pressure.
- **Cross-cutting surface.** The non-functional concerns the form calls for — security, performance, testing,
  migration / rollout (RFC); constraints, dependencies, integration points (PRD).
- **Open questions — open for the right reason.** Genuine implementation detail may be left open. What may
  **not** be left open is _settle-able design_ — a decision that could and should be made pre-implementation.
  Deferring one is a masked design decision: a derivation signal — route it to the design (draft / spec), never
  park it as an open question or push it into the task list. See [DEV-RULES.ARC][dev-rules-arc] § Design before
  implementation.

**Novel overlay** (`Class == Novel`, advisory). At `detailed`, an invented model warrants an **ADR-companion** —
an ADR under `reference/adr/` capturing the invented model's durable, cross-cutting rationale.
**Subtype-keyed:** recommend it strongly at `detailed`·RFC, weak or omitted at `detailed`·PRD.
Accept-or-decline, never a gate. An accepted ADR is a **non-moving artifact** — it stays under `reference/adr/`
through the WU lifecycle (no relocation, no Novel branch at integration) and rides the normal ceremony commit.

## PROJECT-PRD alignment check

Always-on floor — fires at every form, its cost naturally proportional to the spec's surface (a `brief` clears
it near-instantly). Evaluate the spec's scope (crystallized in discovery) against PROJECT-PRD's Principles and
Out of Scope — the principle catalog is the project's vision contract.

**Halt-and-ask conditions:**

- The spec's scope conflicts with a named PROJECT-PRD principle
- The spec introduces scope that PROJECT-PRD lists as Out of Scope

On either, halt and surface the specific conflict — user direction needed before save.

**On pass — cite the principle by name** · `[invariant]`. Not "checked, passes" — "checked against the
_Configurability_ principle — passes".

## TECHNICAL-OVERVIEW alignment check (conditional)

Always-on floor, conditional on surface: fires only when the spec touches technical surfaces — tech stack,
architecture, runtime, dependencies, or infrastructure. Independent of the PROJECT-PRD check: PROJECT-PRD covers
problem / scope / principles; TECHNICAL-OVERVIEW covers technical surfaces. A single spec may trigger both, one,
or neither.

**Halt-and-ask condition:** The spec introduces tech (component, framework, dependency, infrastructure choice)
genuinely new to the project. Absence from TECHNICAL-OVERVIEW is the trigger to look, not the finding — the
common hit is a stale document describing tech the project already carries. Confirm presence against the
project's technical surface (manifests, lockfiles, config, existing code); on confirmation, note the document's
staleness and continue. Fail closed: anything not confirmable as already present halts and surfaces the drift —
user direction needed before save.

The companion downstream condition ("TECHNICAL-OVERVIEW edited since the spec was approved") fires at
[`activate-work-unit.md`][activate-work-unit] and [`integrate-work-unit.md`][integrate-work-unit], not here — at
create-spec time the spec hasn't been approved yet.

**On pass — cite the section by name** · `[invariant]`. Not "checked, passes" — "checked against § 2 Architecture
Components — passes".

## Write and save the spec

Select the template for the resolved form (and subtype) from the spec template family, and generate the spec
from it:

- `brief` → [template-spec-brief.md][template-spec-brief]
- `outline` → [template-spec-outline.md][template-spec-outline]
- `detailed` · PRD → [template-spec-detailed-prd.md][template-spec-detailed-prd]
- `detailed` · RFC → [template-spec-detailed-rfc.md][template-spec-detailed-rfc]

**Strip template scaffolding on emit.** The detailed templates carry authoring scaffolding that does not belong
in a finalized spec — remove it as you write:

- the top paired-mode scaffolding comment block,
- the `` · `omit-when-paired` `` / `` · `optional | omit-when-paired` `` heading flags (keep the heading text
  itself), and
- the inline non-rendering scaffolding comments under flagged sections.

When two `detailed` specs are authored as a **paired** PRD + RFC, additionally drop the flagged sections
entirely: the PRD's Technical Considerations and the RFC's context spine (Introduction / Goals / Non-Goals) —
the PRD owns the shared spine, the RFC references it. A standalone `detailed` spec keeps every section; only the
markers are stripped.

**Retain the boundary carrier on emit.** Each form's boundary surface carries this contract line inside a
section body you otherwise replace wholesale — keep it, along with the `brief` form's clause-scoping sentence
where that form applies:

```text
_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_
```

**Naming:** The `{name}` descriptor in the spec filename becomes the work unit's identifier across all artifacts
— task list (`tasks-{name}.md`), notes (`notes-{name}.md`), completion record, and branch name. Choose a
concise, descriptive slug (e.g., `api-modernization`, `cli-implementation`). Avoid abbreviations that only make
sense in context or overly long compound names.

**Save location** — co-locate with the work unit's existing artifacts (lifecycle position first; `pm.mode`
only when nothing is on disk yet):

1. **Sibling present** — write beside an existing `meta-{name}.md`, `draft-{name}.md`, or other planning
   artifact for this name (same directory). After [`init-work-unit`][init-work-unit] / `arc start`, that is
   almost always `.arc/active/spec-{name}.md`. Do **not** write under `backlog/` when the meta already lives
   in `active/` — [activation][activate-work-unit] is a state-flip + branch rename only, not a backlog→active
   relocate.
2. **No sibling yet, arc-in-git incubating** — `.arc/backlog/{provisional,planned}/{name}/spec-{name}.md`
   (pre-start stub / `--plan` grooming only; uncommon — most specs are authored after init).
3. **none / external** — `.arc/active/spec-{name}.md` (create the directory first if needed:
   `mkdir -p .arc/active/`).

## Finalize — review, retire the draft, persist `Class`, commit

Re-run [`assess-design-proportionality`][assess-design-proportionality] over the saved spec before self-review.
Handle `revise` through the same in-place correction or `draft-design` re-entry routing as the discovery guard;
the finalization boundary proceeds only on `proportionate`.

Before surfacing the spec for approval, run the [spec-review][spec-review] self-review on what you just wrote —
a coherence + grounding pass scaled to the form (it collapses to a single minimal check at `brief`). Fold in the
fixes it surfaces; carry anything that needs a decision into the review below. A finding that reopens design is
a derivation signal — fire the re-entry valve per [resolve-planning-depth][resolve-planning-depth] § Mid-stage
re-entry (route it to the design, never patch it into the spec).

- **Extensions** · `#pre-spec-finalization-review`: If `pre-spec-finalization-review` appears in the
  active-extensions list (established at session init), load and execute its
  [`.actions`][pre-spec-finalization-review] — a team's own spec-review ceremony layered on the default
  self-review. Otherwise, skip.

The finalization boundary also carries an advisory adversarial fire-point — design _and_ artifact attacked from
fresh context, distinct from both the self-review above and any team extension:

> [!IMPORTANT]
> `adversarial-review` method — advisory fire-point (`Class`-scaled): recommend at `Heavy` / `Novel`; surface a
> neutral offer at `Light`. Offer the pass and await the call — user decides; decline proceeds normally.

```yaml
adversarial-review:
  rubric:          # assess-design-proportionality + design-audit + spec-review at the resolved form
  artifacts:       # spec-{name}.md + draft-{name}.md (when one fed it) + non-exhaustive key-file pointers
  orientation:
    - AGENT-BRIEF.ARC
    - AGENT-BRIEF.PROJECT
  pass-cap:        # per Class — Light 1 / Heavy 2 / Novel 3
  fold-verification: on
  prior-findings:  # pass two onward; omitted on pass one
```

After each returned pass, apply the method's complete-disposition and bounded-continuation protocol, then append the
pass to `ADVERSARIAL-PASSES.md` in the work unit's personal workspace (`.arc/user/{identity}/{name}/`, beside
SESSION-NOTES): follow [adversarial-review § Pass record][pass-record] for the entry contents. Later passes take their
`prior-findings` from it, and the commit below summarizes each pass in one body line. A stub groomed before it starts
has no workspace yet, so that summary is its only record. This advisory evidence creates no lane-progress record.

> [!IMPORTANT]
> `workflow-interlock` — Gate 1 (review / iterate): Stop after the spec is saved and self-reviewed. Surface the
> spec location and the self-review findings for a full read and feedback. Iteration loops here against the saved
> spec — amend and re-surface until the spec is right. This approval means the spec is correct; it does **not**
> authorize the irreversible finalize actions below · `[invariant]`.

Once the spec is approved as correct, finalize the work unit. The remaining steps are irreversible, so they take
a second, separate approval:

> [!IMPORTANT]
> `workflow-interlock` — Gate 2 (proceed-to-finalize): Only after Gate 1 clears. The steps below are
> irreversible — draft retirement (`notes-*` migration + draft deletion) and the meta update — and close with the
> commit. State that finalize is about to run and await explicit approval; this approval authorizes the
> retirement, the meta update, and the commit.

If a `draft-*.md` document fed into this spec, retire it now. Drafts are ephemeral — they serve exploration and
are deleted once the spec captures the conclusions (see [Work Planning Strategy][work-planning] § Draft
Documents).

1. **Audit for reference content**: Scan the draft for implementation detail, design rationale, or context the
   spec doesn't capture but would be valuable during task generation or execution. Migrate this to a
   `notes-*.md` file alongside the spec (same directory). Keep the notes header minimal (title + contents only)
   — no purpose block, no provenance to the draft, no commit metadata. See [DEV-RULES.ARC][dev-rules-arc] §
   Documentation Boundaries.
2. **Delete the draft**: `git rm` the `draft-*.md` file (and any supplemental files that fed into it, unless
   they have independent archival value — e.g., research files may belong in
   `reference/supplemental/research/`).
3. **Update planning-state meta file** (when present): If `.arc/active/meta-{name}.md` exists with `**State:**
   Planning` (planning-branch sessions), repoint `Design` to the finalized spec — `arc repoint-design
   spec-finalized` rewrites `Design: draft-{name}.md → spec-{name}.md` (the no-draft path repoints `[none] →
   spec-{name}.md`). Persist the resolved `**Class:**` (live from the entry read) — `arc finalize create-spec
   --class <Class>` writes it through the field model. Then advance the stage pointer to the next sub-stage:
   `arc set-stage generate-tasks --advance` rewrites `Current Workflow: create-spec → generate-tasks` and resets
   `**Next Action:**` to the `[begin current workflow]` boundary sentinel in one step, so a fresh session after
   handoff resumes in generate-tasks. Skip otherwise (no meta file exists pre-init under non-planning-branch
   flows).

**Post-settle coherence re-read** (always-on, in-context): when folds landed after the self-review —
adversarial-pass findings, Gate 1 iteration amendments — re-fire `spec-review`'s coherence slice over the
settled spec as the last step before the commit below.

After substeps 1-3, stage all edits — spec save (Write and save), any promotion-write inbox deletion (Write and
save, arc-in-git), draft deletion + `notes-*` migration, meta update.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): create spec-{name}

Context: spec-{name}.md (planning)
```

Body itemizes the bundled changes (spec save, draft retirement, `notes-*` migration, meta update) per
[DEV-RULES.ARC][dev-rules-arc] § Commit format and § Meta-file commit shape.

---

## Next Step

Run [generate-tasks.md](generate-tasks.md) when ready — it consumes this spec as input.

---

[work-planning]: ../../../reference/strategies/arc/strategy-work-planning.md
[resolve-planning-depth]: ../../methods/resolve-planning-depth.md
[assess-design-proportionality]: ../../methods/assess-design-proportionality.md
[classify-work-unit]: ../../methods/classify-work-unit.md
[assess-boundary-fit]: ../../methods/assess-boundary-fit.md
[assess-draft-readiness]: ../../methods/assess-draft-readiness.md
[spec-review]: ../../methods/spec-review.md
[pre-spec-finalization-review]: ../../extensions/pre-spec-finalization-review.md
[template-spec-brief]: ../../../reference/templates/arc/work-unit/spec/template-spec-brief.md
[template-spec-outline]: ../../../reference/templates/arc/work-unit/spec/template-spec-outline.md
[template-spec-detailed-prd]: ../../../reference/templates/arc/work-unit/spec/template-spec-detailed-prd.md
[template-spec-detailed-rfc]: ../../../reference/templates/arc/work-unit/spec/template-spec-detailed-rfc.md
[activate-work-unit]: work-unit-lifecycle/activate-work-unit.md
[integrate-work-unit]: work-unit-lifecycle/integrate-work-unit.md
[init-work-unit]: work-unit-lifecycle/planning/init-work-unit.md
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
[source-grounding]: ../../methods/source-grounding.md
[pass-record]: ../../methods/adversarial-review.md#pass-record

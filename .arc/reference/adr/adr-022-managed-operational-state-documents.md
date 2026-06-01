# ADR-022: Adopt a Structured-Record Model for Managed Operational-State Documents

## Status

Proposed. **Flip trigger:** flips to *Accepted* at the kickoff of the `operational-state-docs` work unit
(Decision §9) — "just before implementation," per the ADR lifecycle. That work unit carries the flip as an
explicit first action; until then the model is decided-in-principle, not yet in build.

Builds on [ADR-019][adr-019] (Work Organization Reform — always-present `meta-*`, meta files as the state
source of truth) and [ADR-020][adr-020] (the derived-vs-mutated split, the invariant floor). It does not
supersede either; it extends ADR-020's derived/mutated framing from a concurrency property into a
source-of-truth and storage model for a named class of documents. Surfaced during Worktree Foundation
Task 5.2, where designing the meta + SESSION-NOTES scaffolding primitive forced the question of where these
documents' structure actually lives.

## Context

ARC's CLI and hooks read and write a set of markdown files as operational data: the active `meta-*` file,
`SESSION-NOTES`, `WORKING-MEMORY`, `USER-INBOX`, the project-shared backlog inboxes, and the generated
`ROADMAP` (soon `STATUS.PROJECT`) plus the planned `STATUS.USER`. The session-init probe parses meta fields;
the ROADMAP renderer parses `**State:** / **Owner:** / **Depends On:** / **Cohort:**` by bold-field name; the
cross-WU merge re-parses `WORKING-MEMORY` / `USER-INBOX` entries on every read; handoff parses
`**Commit at Handoff:**`. Their structure is a hard dependency of ARC's operation.

Yet that structure has no single source of truth. It is defined by markdown **template** files and
independently re-encoded by scattered consumers (`meta-reader`, `worktree-roster`, `wu-resolution`,
`validate-meta-spec`, the renderer, and now a scaffolder). The consequences are already visible:

- `template-meta.md`, `template-tasks.md`, and the `SESSION-NOTES` / `WORKING-MEMORY` / `USER-INBOX`
  templates are **not tracked in the manifest** — the very files whose fields the renderer parses by name
  have no integrity protection, so structural drift fails silently today.
- Planned work is accreting **per-WU partial schemas**: the agent-context-optimization cluster has four work
  units each coining its own meta / SESSION-NOTES field-set (a probe-slot interface here, a length hook
  there, structured `_Remove when:_` triggers elsewhere), none sharing a definition.
- The cross-WU merge parses markdown on the hot path; a whole-format convention change fails silently (the
  merge finds zero entries and reverts to most-recent-wins — the clobbering bug it exists to prevent).

The customization line is also muddled. ARC's file-classification taxonomy
(`Framework / Configurable / Scaffolded / Project-Owned`) is organized around **update behavior**, not
**structural ownership** — it has no concept for "the CLI depends on this file's structure." `Framework`
incidentally locks structure via overwrite-on-update, but that is a side effect, not an articulated
property; `ROADMAP` is classified `Scaffolded` (adopter-editable) while strategy says never edit it; and
`strategy-configurability-architecture` contains a live contradiction — its "File-customizable" path lists
"template formats" as adopter-customizable, against its own "Structural contract: fill in, don't redesign."

The decisive finding from a corpus survey (the agile-parallelism cohort, the architecture-remediation /
CLI-substrate cluster, the agent-context-optimization cluster, and the storage docs): **every plan already
assumes code — not the template — is the real authority; no document declares it.** The schema/remediation
cluster (`cli-substrate-adoption`, `schema-introspection-layer`) is building exactly toward
zod-schemas-in-code as the contract surface. This ADR ratifies and unifies that direction.

The forces in tension:

- **Human legibility vs. programmatic control.** These files must stay readable as raw markdown by humans
  *and* behave as reliable data for the CLI.
- **"Markdown is the source" vs. drift-proofing.** ARC has historically treated markdown as the canonical,
  agent-readable form. That instinct is correct for workflow and authored content; it is the *cause* of the
  drift problem for operational state.
- **Incremental validation vs. structural guarantee.** A schema that merely *validates* parsed markdown
  catches drift; a model where markdown cannot disagree with the record *prevents* it.

Alternatives considered:

- **Option A — status quo (template-as-SoT + per-WU mechanization).** Keep the template canonical; let each
  work unit add field-by-field parsing/hooks as needed. Rejected: multiplies the scattered re-encodings,
  offers no loud-failure guarantee, and is the drift trajectory already underway.
- **Option B — schema-as-contract (markdown canonical, code schema validates).** A code schema validates the
  parsed markdown and seeds scaffolds, with round-trip tests. Better — it gives a single definition and
  catches drift. But two source-of-truth mechanisms coexist in one class, parsing stays on the hot path for
  `meta`, and drift is *caught by tests*, not made impossible.
- **Option C (chosen) — structured records are the source of truth; markdown is a projection.** A code-owned
  record is canonical for every member; the `.md` is rendered/projected from it; structural drift becomes
  impossible rather than test-caught; storage lifts cleanly to the future backend.

## Decision

We will define **managed operational-state documents** as a first-class document class and adopt a
structured-record source-of-truth model for them.

1. **The class is defined by failure domain, not by degree of structure.** A document is a *managed
   operational-state document* when ARC's CLI/hooks read and write it as operational data, such that a
   structural violation breaks **CLI / session plumbing** — the ability to start and end sessions and keep
   operational state coherent (a hard failure). This is distinct from **authored artifacts** (`spec-*`,
   `draft-*`, `tasks-*`, PRDs, ADRs), where structural violation breaks **workflows** — the agent following a
   lifecycle workflow gets confused and surfaces the problem (a soft, agent-mediated failure; sessions still
   operate). Neither class is adopter-customizable in structure; the distinction is what breaks.
    - **Members:** `meta-*`, `SESSION-NOTES`, `WORKING-MEMORY`, `USER-INBOX`, the backlog inboxes
      (`ATOMIC-INBOX`, `BACKLOG-INBOX`), `ROADMAP` / `STATUS.PROJECT`, and `STATUS.USER`.
    - **Not members, but adjacent:** authored artifacts (above). And `arc-config.yml` is *adjacent, not
      separate*: its key schema is code-owned and CLI-depended-on (renaming a key breaks operations — the §3
      structure-vs-value split in its purest form), and `cli-substrate-adoption` already schema-validates it.
      It is excluded only because it is *configuration, not operational state* — its **values are the
      adopter's customization surface**, where a managed operational-state document carries machine/agent-set
      state with no adopter-customizable surface. The structural-ownership half of this ADR governs it
      equally; its model is owned by `cli-substrate-adoption` and `config-storage-architecture`, not here.

2. **Structured records are the source of truth; the markdown is a projection.** For every member, a
   code-owned schema/record is canonical, and the `.md` file is a rendered or projected view of it. Prose is
   carried as a `text` field within the record, not as unstructured document body. This satisfies both hard
   requirements — the rendered `.md` stays human-legible, and every consumer reads the record, never a parsed
   blob — and makes structural drift **impossible** rather than merely test-caught.

3. **Structure is owned by code; values are owned by humans/agents.** The schema owns the field set, the
   valid-value sets, defaults, and (for `meta`) the legal state transitions. The human or agent owns the
   instance *value* (`**Priority:** P2` is theirs to set). "Not adopter-customizable" applies to the
   structure, never the value. `arc-config.yml` is this split in its purest form — keys locked by code,
   values the adopter's to set — which is why it is adjacent to this class rather than apart from it (§1).

4. **The write path varies by subtype, over a structured record in every case:**
    - **Derived** (`ROADMAP` / `STATUS.PROJECT`, `STATUS.USER`) — regenerated from source records (the
      `meta-*` set); never hand-authored.
    - **Agent-maintained with merge** (`WORKING-MEMORY`, `USER-INBOX`, backlog inboxes) — records are
      canonical and converge via entry-union with deletion tombstones; the merge operates on records, not
      parsed markdown; the `.md` is rendered.
    - **Lifecycle-fielded** (`meta-*`) — the record is canonical; structured fields carry schema-enforced
      valid values and transitions; archive fields (release-notes / completion content) are appended at
      integration. There is no separate completion or status document — that content is `meta-*` fields.
    - **Per-WU prose** (`SESSION-NOTES`) — the thinnest case: pointer fields (`Working On`,
      `Commit at Handoff`) are CLI-owned and set from git state; the rest is a single prose field.

5. **Prose authorship happens through a reconciled editable region — never argv-per-field.** Where a human
   or agent authors prose (`SESSION-NOTES` body, `meta` Next Action), they edit a designated free-text region
   of the markdown projection exactly as they edit a file today; the CLI reconciles that region into the
   record's `text` field on save/handoff. Structured fields render read-only. We explicitly reject a write
   path that pushes prose through per-field CLI string arguments — multi-line prose in argv is the
   ergonomic failure mode. (Net effect at `SESSION-NOTES`: the agent stops hand-typing the handoff hash — an
   error source removed — and authors prose unchanged.)

6. **Structural ownership becomes a classification axis orthogonal to update behavior.** We introduce a
   `structural_contract` marker (a managed-document annotation) distinct from the
   `Framework / Configurable / Scaffolded / Project-Owned` update-behavior tiers. Managed operational-state
   documents carry it; the manifest tracks and integrity-checks their definitions. This closes the current
   gaps: the untracked `template-*` files gain protection, `ROADMAP`/`STATUS.PROJECT` stops being mis-filed
   as `Scaffolded`, and the `packages/.../templates/user/` definitions gain a governance home.

7. **The customization line is stated, and the configurability contradiction resolved.** Managed-document
   structure is non-customizable, full stop; customization routes only through the blessed mechanisms (method
   overrides, extensions). `strategy-configurability-architecture`'s "File-customizable" wording is narrowed
   to "fill project content into a fixed structure," not "redesign the structure." The separate, larger
   problem — that lifecycle *workflows* are rigidly coupled to *authored-artifact* template shapes with no
   configurable primitive — is explicitly **out of scope** here and captured as its own provisional work
   unit (`configurable-lifecycle-artifacts`).

8. **This ADR ratifies the target; migration is incremental and storage-agnostic.** Today's
   markdown-canonical state is the interim. The record/schema layer must be storage-agnostic per
   `strategy-storage-evolution` (no baked-in "git-tracked" assumption); records lift to the future backend
   tier without reshaping. Interim storage assignment per subtype (derived → tracked + regeneratable;
   agent-maintained-with-merge → notes-synced records; lifecycle-fielded → coordinated with
   `meta-file-tracking-model`; per-WU prose → notes-synced) is recorded here but the per-document storage
   *mechanism* stays with the owning work units (see Coordination).

9. **Implementing the model spawns one new work unit.** No existing work unit owns the cross-cutting
   substrate the model needs. We create **`operational-state-docs`** ("Managed Operational-State Document
   Model") to own: the structured schemas for the surfaces `cli-substrate-adoption` does not cover, the
   render-and-reconcile projection engine, the reconciled-editable-region write primitive, the
   `structural_contract` annotation and its manifest wiring, the round-trip test harness, and the migration
   of the current markdown-canonical documents. It depends on `cli-substrate-adoption` (zod substrate) and
   **subsumes** two scattered captures: the `USER-INBOX` "structured-storage + routed-write" entry (Move B
   for `WORKING-MEMORY` / `USER-INBOX`) and `cli-substrate-adoption`'s "Complete-Migration" placeholder, for
   the
   managed-document surfaces.

## Consequences

### Positive

- **Drift becomes structurally impossible, not test-dependent.** A rendered projection cannot disagree with
  its record; the field-by-field parsing and silent-revert failure modes are eliminated at the root.
- **One model for the whole class.** The only axis of variation is the write path; the source-of-truth and
  legibility story is uniform.
- **Consolidation.** Two scattered captures fold into one owner, and the four agent-context-optimization work
  units stop each coining a partial field-set — they consume one schema.
- **The governance gap closes.** Managed-document structure gains manifest tracking and integrity checks;
  the `Scaffolded`-vs-managed misclassification and the configurability contradiction are resolved.
- **Backend-aligned.** Records lift to the future backend tier without reshaping (per ADR-020's
  derived/mutated split and `strategy-storage-evolution`).
- **Unblocks Worktree Foundation Task 5.2.** The meta-scaffolding question that triggered this ADR resolves:
  meta scaffolding becomes structured-record creation owned by `operational-state-docs`, so 5.2's primitive
  keeps worktree + branch + marker and builds the model-aligned *interim* scaffold — an internal/bundled
  template skeleton plus a code-owned `META_FIELDS` definition shared with `meta-reader` (the proto-schema),
  round-trip-tested — which `operational-state-docs` later generalizes into the full record→render engine.
  It does **not** read the adopter `.arc/` template copy as the source of truth. See Coordination.

### Negative

- **The real payload is a new substrate work unit plus migration**, not a one-file change — a
  render-and-reconcile engine, the schemas, and the write primitive are new infrastructure.
- **The agent write path for `meta` and `SESSION-NOTES` changes** from free file edits to reconciled
  editable regions. The change is bounded (these are the only prose members; authored artifacts are
  untouched), but it is a real workflow shift.
- **Wide propagation.** Roughly sixteen drafts, four strategies, and the manifest must be aligned to the
  model (see Coordination).

### Risks

- **Write-path ergonomics for `SESSION-NOTES`** must hold in practice. Mitigated by the reconciled-region
  design (prose is authored as markdown, not argv) and by the observation that `SESSION-NOTES` is the
  thinnest-structured member, so the model's cost is lowest exactly where the prose is heaviest.
- **The reconciled-editable-region parse-back is a new correctness surface.** A malformed region must fail
  loudly and recover, not silently drop content. Mitigated by the round-trip test harness and a robust
  importer/recovery path (the markdown-to-record direction survives as a one-way recovery import).
- **Notes-synced members depend on transport reliability.** `cross-machine-sync-coherence` addresses a known
  partial-push gap; any "notes-synced" assignment here depends on it and must not assume it solved.
- **Storage-agnosticism must be enforced**, or the schema layer could re-bake in-repo assumptions (the
  `git log .arc/...` anti-pattern). The new work unit self-checks against `strategy-storage-evolution`.

## Coordination

This ADR is a coordinating anchor; it asserts the model and defers per-document mechanism to the owning work
units. The alignment edits below are the propagation set.

- **`operational-state-docs` (new, this ADR's deliverable)** — owns the substrate (schemas, render/reconcile
  engine, write primitive, `structural_contract` annotation + manifest wiring, round-trip harness,
  migration). Subsumes the `USER-INBOX` "structured-storage + routed-write" capture and
  `cli-substrate-adoption`'s "Complete-Migration" placeholder for managed-document surfaces. Created in
  `backlog/planned/`; its kickoff (activation) flips this ADR to *Accepted* (see Status).
- **`configurable-lifecycle-artifacts` (new, provisional)** — captures the out-of-scope concern: lifecycle
  workflows are rigidly coupled to authored-artifact template shapes, with no configurable primitive bounding
  non-negotiable structure vs. swap-in slots. Rough shape only.
- **`meta-file-tracking-model`** — demoted from `planned/` to `provisional/`. This ADR answers the *class*
  question (meta is lifecycle-fielded; its structure is a code record) but not the meta-specific *storage*
  question (active-phase tracked vs. notes-synced; the multi-maintainer coordination model), which remains
  its own PRD scope. The β-shaped slot is reserved, not ratified.
- **`worktree-foundation` (active — the origin WU)** — Task 5.2's meta + SESSION-NOTES scaffolding is this
  ADR's trigger and resolves under it: the primitive scaffolds from internal/bundled skeletons (not the
  adopter `.arc/` copy — these are not adopter-customizable) populated via a code-owned `META_FIELDS`
  definition shared with `meta-reader`, round-trip-tested — the model-aligned interim that
  `operational-state-docs` later generalizes. Propagation updates `tasks-worktree-foundation.md` (Task 5.2,
  esp. 5.2.b — drop the "read the project template to preserve adopter-customizability" framing) and
  `notes-worktree-foundation.md` § Phases 5 & 6 (supersede the now-falsified adopter-customizable-template
  rationale); `cohort-agile-parallelism.md`'s "authoritative in `template-meta.md`" line is requalified to
  name the record/schema as authority, with `template-meta.md` as its render skeleton.
- **`cli-substrate-adoption`** — enumerate full managed-document schema coverage (it currently covers four
  surfaces); resolve the schema-home convention; the meta record is its schema, consumed by this model.
- **`schema-introspection-layer`** — the `arc schema` registry exposes the managed-document schemas; scope
  which at launch.
- **`lib-layer-type-extraction`** — carve out managed-document types that become `z.infer` from the schema;
  do not re-home them as hand-written types.
- **`roadmap-tooling`** — `ROADMAP` / `STATUS.PROJECT` is the canonical derived member; its renderer is the
  first instance of the render engine. Reinforces, not conflicts.
- **`in-flight-awareness`** — `STATUS.USER` is a derived member; `**Priority:**` is schema-owned structure
  with a human-set value.
- **`agile-wu-lifecycle`** — `**Tier:**` / `**Design:**` are schema-owned with tier-conditional validity (a
  cross-field constraint a flat template cannot express).
- **`concurrent-work-conventions`** — the merge correctness for the agent-maintained-with-merge members lives
  in the notes-merge engine; reference the model rather than redefining write semantics.
- **`arc-plan-conductor`** — replace stale `status-{name}.md` references with `meta-*` (post-WOR); the
  three meta-creation paths converge on one schema; state transitions are schema events.
- **`agent-context-optimization` cluster** (`handoff-optimization`, `documentation-surface-routing`,
  `loadset-composition`, `instruction-optimization`, `compaction-recovery`) — replace per-WU field-set accretion
  with "consume the managed-document schema"; structured `_Remove when:_` triggers and the pointer-field
  hooks become schema-derived.
- **`config-storage-architecture`** — coordinate on the notes-sync channel and manifest extension. Also the
  owner (with `cli-substrate-adoption`) of `arc-config.yml`'s structure-vs-value model — the adjacent archetype
  of this ADR's structural-ownership principle (keys code-owned, values customizable); keep its key-schema
  treatment consistent with the managed-document schemas.
- **`cross-machine-sync-coherence`** — notes-synced members depend on its transport hardening.
- **`arc-backend` / `strategy-storage-evolution`** — the record layer must be forward-compatible with the
  backend tier; self-check against the storage-evolution principles.
- **`doc-naming-convention`** — owns the file renames (`WORKING-MEMORY → MEMORY.USER`, etc.); this ADR
  classifies by role and is rename-agnostic. The class concept is a natural motivation for that rename, but
  timing stays that work unit's call.
- **Strategies to align** — `strategy-file-classification` (add the structural-ownership axis),
  `strategy-configurability-architecture` (resolve the contradiction; extend "structural contract" to the
  field level), `strategy-session-operations` (state the managed-document boundary), `strategy-work-organization`
  § ROADMAP (`STATUS.PROJECT` as a managed derived member).
- **`customization-arch-realign`** — the `core: true` method flag is the method-layer parallel to this
  ADR's document-layer `structural_contract` annotation; align the framing.
- **`workflow-template-loads`** — managed-document templates no longer need `arc.templates` declarations (the
  schema enforces structure); the mechanism remains relevant for authored-artifact templates.
- **Manifest** — track the currently-untracked `template-*` files and home the `packages/.../templates/user/`
  definitions.

## Amending This Document

<!-- Three-tier amendment model (strategy-adr-methodology.md): corrections fixed directly; amendments
appended as dated annotations below; supersession via a new ADR + a Status update here. -->

---

[adr-019]: adr-019-work-unit-lifecycle-reform.md
[adr-020]: adr-020-adopt-principle-anchored-scalable-core.md

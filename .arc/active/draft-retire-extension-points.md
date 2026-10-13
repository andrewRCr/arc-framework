# Draft: Retire Extension Points

- **Origin:** [internal] — minted at the 2026-10-13 housekeep drain from the `USER-INBOX` capture "Remove the inactive
  extension mechanism until lifecycle events replace it", made in the discussion after PR #955 (Errand
  `disposition-approval-release`).
- **Purpose:** Remove ARC's extension mechanism whole while every extension ships inactive, so agent workflows stop
  carrying fire-point instructions that do nothing, and carry the lifecycle-event contracts it defined forward as input
  to the CLI-fired replacement rather than as live machinery.

---

## Problem / Motivation

ARC's extensions fire through agent instructions at every workflow site: check the session's active-extensions list,
run the extension's `.actions`, halt on failure, otherwise skip. All eleven ship `active: false` with no configured
actions — the package placeholder, or "Future … actions" stubs in this repository's `post-pr-open` and `pre-merge`
copies — so every one of those instructions resolves to "skip".

The cost is not idle. Seventeen shipped workflows declare 26 `arc.extensions` entries and carry 18 tagged
`· #name` marker lines, plus fire steps without that marker in `activate-work-unit`, `archive-work-unit`,
`integrate-work-unit`, and `run-errand`, and a `#pre-commit-review` step in the `arc-commit` skill. The CLI keeps a
command, a session-init probe slot, validators, a pre-commit check, and a push-site audit that serve only them. The
audit (`auditPushExtensionCoverage` in `audit-method-triggers.ts`) requires a `pre-push-review` declaration and marker
at every agent-managed push site; when PR #955 tagged new review-fix push sites, its fix had to turn `run-errand`'s hook
into a workflow-wide push contract (`0dd0545dc`) for a hook nothing fires.

The mechanism also runs against the project's own direction: `strategy-knowledge-evolution.md` Principle 3 (anchor
triggers to operations, not workflows) and `strategy-procedure-evolution.md` Principles 1 and 2 (the CLI computes what
it can; agent-interpreted markup grows no control flow). `pre-push-review` names the push wrapper as its fire point —
an event the CLI already owns — yet no CLI code reads it, and pushes outside workflows are never covered.

The replacement — lifecycle events fired by the CLI verbs that drive each advance — belongs to
`customization-arch-realign` (inbound entry "Replace agent-fired extension markers with CLI-fired lifecycle events").
This work unit is that decision's separable part, sent ahead: the cohort record states the retirement removes today's
mechanism so the redesign starts fresh rather than preserving it. ARC is pre-public-release, so no compatibility
handling is owed.

## Direction

Remove the mechanism in full, and keep only what a CLI-fired redesign would build on. The substrate splits into three
layers:

1. **Agent-firing plumbing — remove.** Workflow declarations and markers, the active-extensions probe slot and its
   threading, `arc extensions`, the marker scanner and validators, the push-site audit, the hook and integrity checks,
   and the checkpoint's always-null `extensionReport` slot. All of it exists because the agent must decide at each
   site whether to fire; a CLI-fired design moves that decision into the verb, so this layer has no successor role.
2. **Storage format — remove.** One markdown file per event with an `active` flag and free-form prose `.actions`, its
   frontmatter parser, and its Configurable classification. Reusable in principle, but it is exactly what the
   replacement must decide: deterministic hooks likely belong in the check declaration (`arc-checks.yml`, which
   already carries commit, push, and merge deadlines) and judgment hooks in verb-result directives, while
   `strategy-pm-composition-evolution.md` Principle 6 argues against encoding synchronization as free-form extension
   prose. Keeping it would prejudge the redesign and leave `active:` switches that fire nothing.
3. **Event contracts — carry forward.** The design knowledge the files hold: the event vocabulary and naming rule
   (`{pre|post}-{lifecycle-event}`, firing frequency matching the name), each event's placement, the payload contracts
   (`pre-pr-open`'s `proposedChangeRequest = { repositoryRef, baseRef, headRef, headSha }`, `post-pr-open`'s
   `openedChangeRequest = { repositoryRef, hostRef, headSha }`), and the per-event execution contracts (ordered with
   halt-on-fail; `pre-pr-open` retry-safe, `post-pr-open` idempotent across re-entry, `pre-merge` read-only,
   idempotent, or retry-safe once per ready head, with no commit or push after readiness). The superseding ADR records
   this inventory and names the pre-removal commit, so the redesign starts from the contracts and can recover the code
   from history.

## Decisions

### D1 — Removal boundary: layers 1 and 2 whole

Every extension file, declaration, marker, command, probe slot, validator, check, and audit branch that serves the
mechanism goes in one change. No reserved name, `active:` switch, or placeholder file survives. A partial removal —
markers only, or files kept for later — leaves a documented switch that fires nothing.

### D2 — PM-facing hooks: remove all; amend the provisional strategy

`post-task-completion`, `post-work-unit-activate`, and `post-work-unit-archive` are the documented tracker-sync route
for `pm.mode: external` (`03_configure-external-integration.md` Step 3; ADR-008's Core↔PM interface).
`strategy-pm-composition-evolution.md` § Interim Boundaries says "Preserve provider-neutral lifecycle fire points, but
do not promise that existing free-form extensions form a complete integration contract."

They go with the rest. All three ship inactive, so keeping them preserves no working integration, and external PM mode
has no consumers before public release. The change amends that interim boundary so the lifecycle-event replacement
carries its intent. In adopter-facing text, external setup loses its notify step outright; nothing points at a future
mechanism (`DEV-RULES.PROJECT.md` § Audience Boundaries leak pattern).

### D3 — ADR: supersede ADR-003 Part 2 and its dependents

Reversing an accepted decision is a supersession (`strategy-adr-methodology.md` § Tier 3), so a new ADR records the
removal. It supersedes ADR-003 Part 2 and the extension half of Part 4, and marks the parts that depend on it in their
status lines, in the repository's existing "Accepted (Parts N superseded by ADR-0xx)" shape:

- ADR-003 — Part 2 (extension points) and Part 4's extension half.
- ADR-008 — the extension-point Core↔PM interface.
- ADR-013 — the extension half of the per-file layout and `arc.methods` / `arc.extensions` load contract.
- ADR-009 — Part 1's "Extension point relevance" bullet and Part 3's (ADR-008 Dispositions) row recording ADR-008's
  extension points as preserved.

The new ADR carries the layer-3 event-contract inventory and the pre-removal commit. Other ADRs that mention extensions
stay as point-in-time record: accepted ADR-002, 004, 005, 007, 012, 022, 030, 035, and 036, and Proposed ADR-025.
ADR-020 is Proposed and leans on extensions firing by active-set membership; its owner reconciles it (§ Coupling).

### D4 — Adopter-facing customization model after removal

The customization model states what remains: config, the check declaration, method overrides, QUICK-REFERENCE, and
the content channels (project strategies, project workflows, domain rules). After removal ARC offers no supported way
to insert a step into one of its workflows — a project workflow runs beside ARC's and cannot add a step inside one —
and that gap is accepted, as D2 accepts it for tracker sync. The decision-tree row "adds new steps at a workflow point →
extension" is removed. The convention-inventory rows that route through extensions (P7 task-list checkboxes, planning
checkpoint review) stay, since the conventions still exist, with their Configurability Path set to **None**; the
strategy's "Configurability path definitions" list gains "**None** — the convention has no supported customization
path" and drops **Extension**. Text states what is, with no forward pointer.

### D5 — Installed-project residue: no migration

Per the pre-public-release posture, no migration or cleanup step ships. An installed project that updates keeps the 11
Configurable files on disk, reported once as "kept for review" (the `Configurable` arm of the removals loop in
`applyChangePlan`, `manifest/apply.ts`), and loses the Framework-classified README; nothing reads the kept files. This
repository's `.arc/` copies and their `.internal/manifest.json` entries go in the same change.

### D6 — CLI output contracts change in place

Pre-public, the contracts change without compatibility shims:

- The `extensions` slot leaves the session-init, recovery, and full status envelopes, and the `extensions-session-init`
  schema id leaves the session-envelope registry (visible through `arc schema list`).
- `arc extensions` is removed.
- `arc integrate checkpoint`'s interlock surface drops `extensionReport` from the strict
  `CheckpointInterlockSurfaceSchema` (`interlock-surface.ts`), along with the agent-rendered "Extension report" step in
  `integrate-work-unit` and `run-errand`.
- The unused `activeExtensions` input leaves the derived-locus, recovery-context, compaction-seed, and load-set paths,
  and the derived-locus memo key in `handlers/status.ts`.

Removing an extension step keeps every workflow rule that shares its paragraph, reworded without hooks — no hook as a
sentence's subject, no "after any hook action" qualifier:

- `integrate-work-unit` keeps "No commit or push may occur after `ready`"; `run-errand` keeps "No review-authored
  commit or push may occur after this checkpoint".
- Both keep the open-PR binding and the pre-create requirement that the remote branch carry the exact creation head.
- `run-errand` keeps composing `openedChangeRequest` and its exact-head checks, which its later review steps read.
- `integrate-work-unit` drops `openedChangeRequest` and its "Every hook and review invocation shares this exact-head
  contract" sentence: no step outside the hook reads it, and its review steps bind the exact head through typed review
  results (the Candidate match; an exact open PR at the current head).
- `proposedChangeRequest` has no consumer besides `pre-pr-open` and goes from both.

### D7 — Validation narrows to methods; stale declarations become parse errors

`validate-extension-points.ts` and `CHECK[extension-point-references]` go. `CHECK[frontmatter-schema]`,
`CHECK[package-source-neutrality]`, and `validate-package-neutrality.ts` narrow to methods; `validate-frontmatter.ts`
drops its extension branch and keeps its method and domain-rules branches (`CHECK[domain-rules-frontmatter]` runs it).
`audit-method-triggers.ts` keeps method coverage and drops extension coverage and `auditPushExtensionCoverage`;
`"extensions"` leaves `WORKFLOW_ARC_FRONTMATTER_FIELDS`, so a leftover `arc.extensions` declaration fails to parse — the
same treatment method files already get from `METHOD_ARC_FRONTMATTER_FIELDS`. `verify-integrity.sh` stops requiring
`system/extensions`.

### D8 — The marker scanner is not kept for method fire-points

`composable-workflows` records an approach that would extend the extension marker's validation to method fire-points
("Demote frontmatter-declared methods…": "the `· #name` fire-point marker is validated by `point-scanner.ts` CHECK 16"),
and `strategy-workflow-authoring.md` notes fire-point reachability is unvalidated "until a point validator exists".
`scanExtensionPoints` matches only the extension grammar (`EXTENSION_POINT_PATTERN`), and `validate-extension-points.ts`
resolves what it finds against `system/extensions/`; a method validator chooses its own marker grammar, which is that
work unit's design. The scanner, orphan detector, and validator are about 250 lines, recoverable from the pre-removal
commit, and removal frees `#name` for `composable-workflows`' anchor decision. Routed to it at draft close.

## Alternatives

- **Keep the three PM hooks, remove the other eight.** Honors the interim boundary literally, but keeps every layer-1
  surface alive for three inactive hooks. Rejected (D2).
- **Hold the removal until the replacement ships, then swap.** Keeps the instruction cost and audit friction in the
  meantime and reverses the cohort's recorded sequencing. Rejected.
- **Keep the storage format; remove only markers and probe.** Prejudges the replacement's hook shape and leaves
  switches that fire nothing. Rejected (Direction, layer 2).
- **Keep the marker scanner as a method fire-point validator seed.** Different grammar, no shipped consumer, and the
  consumer's design picks the grammar. Rejected (D8).
- **Amend ADR-003 in place.** Tier 2 amendments cannot change a Decision section. Rejected (D3).

## Boundary, Class, and proportionality

- **Boundary fit — stays one WU.** The coupling is mechanical in both directions: `auditPushExtensionCoverage` requires
  `pre-push-review` declared and marked at every push site, so workflow prose cannot land first; `session-init` and
  `session-recover` dispatch on `extensions.value.active`, so the probe slot cannot go first. One delivery member with
  chunked review.
- **Class — `Heavy`, on scale.** Design is bounded and composed (`medium` drafting depth). A correct plan needs a
  substantial mapping pass: the minted stub's inventory undercounted declarations, workflows, and tests, and missed the
  checkpoint contract slot, the shipped hook check, `verify-integrity.sh`, `change-facts.ts`, and the external-PM
  coupling. Raised from the `Light` estimate at this draft.
- **Proportionality.** The change removes mechanism and adds none; the only additive artifact is the ADR the
  methodology requires for a reversed decision.

## Scope inventory

Grounded at `11df0e9c3`. This is a file-level orientation map, not a site list. Two sweeps are the completeness
authorities the spec and task plan derive line-level sites from: the success-signal search for references to the
mechanism, and the renumbering sweep (below) for step citations. Section notes point at the main sites only. Package
source is authoritative; each `packages/arc-framework/arc/` file named here has its `.arc/` mirror (rendered
`.template.md` workflows regenerate).

**Extension content and install surface**

- The 11 extension files and `system/extensions/README.md`.
- `init-recipe.json` `include_files`; `CONFIGURABLE_FILES` in `classification.ts`;
  `.arc/system/.internal/manifest.json`.
- `arc-checks.yml` `format:tables` inputs; `CODE_SURFACE_GLOBS` and `PACKAGED_CONTENT_SENSITIVE_GLOBS` in
  `change-facts.ts`.
- The coupling audit's `extension-root` and `arc-extensions-key` classes (`audits/coupling-blast-radius/manifest.json`,
  `routing-ledger.json`).

**Workflow prose**

- Declarations in `create-spec`, `process-task-loop`, `session-handoff`, `session-init`, `session-recover`,
  `deliver-stack`, `prepare-commits`, `run-errand`, and the `activate`, `archive`, `deactivate`, `decompose`,
  `integrate`, `park`, `init`, `reopen`, and `resume` work-unit workflows.
- Fire steps: the tagged marker lines; the untagged steps in `activate-work-unit` (§ 2, § 8), `archive-work-unit` (§ 5),
  `integrate-work-unit` and `run-errand` (`pre-pr-open`, `post-pr-open`, the "Extension report" step, the push
  extension contract); `session-init` and `session-recover` § 4; the `arc-commit` skill's `#pre-commit-review` step.
- References to removed steps: `integrate-work-unit`'s five "Repeat the Step 1 push extension contract" lines and its
  resume-table cell "Step 2 (`post-pr-open` → review iteration)"; the hook-phrased sentences in `integrate-work-unit`
  and `run-errand` (D6); the `integration-interlock` callouts in both that name the extension report;
  `process-task-loop`'s "completion extension" skips; the pre-push extension mentions in `decompose-work-unit` and
  `session-handoff`; `create-spec`'s "any team extension"; `session-init`'s contributor-routing line ("Step 4 and
  Step 7 apply universally") and its "Never include" list; `session-recover` § 3's "Frontmatter-declared methods and
  extensions".
- Renumbering: removing a numbered section renumbers or reletters its successors. The removals are `session-init`
  § 4, `session-recover` § 4, `activate-work-unit` § 2, `archive-work-unit` § 5, `03_configure-external-integration`
  Step 3, and `integrate-external-content` Step 3b. Each step citation is made correct against the new numbering,
  never decremented mechanically — `archive-work-unit`'s "archival commit (Step 5)" is already stale and becomes
  correct. Sites come from a step-citation sweep, separate from the success-signal search: each renumbered workflow's
  name with `Step N` / `§ N` across `packages/arc-framework/` and `.arc/`, bare `Step N` / `§ N` inside the workflow
  and its companions (`session-init.contributor.md`, `session-init/probe-envelope.md`), and `src/` comments. Known
  citers at `11df0e9c3` include `deactivate-work-unit` ("the inverse of `activate-work-unit.md` Step 4"),
  `strategy-session-operations` ("`activate-work-unit.md` Step 4 creation"), `strategy-work-organization`,
  `probe-envelope.md`'s Step 5 and Step 6 references, and the "Step 6" comment in `commands/status/types.ts`. In-file
  heading-slug links (`#6-confirm-orientation`, `#step-3c-…`, `#step-3d-…`) are checked by markdownlint MD051 under
  `lint:md`. Backlog drafts that cite step numbers are other work units' records and are not edited.
- `template-workflow.md`; the `extensions` and `loadSet` rows in `session-init/probe-envelope.md`; the `arc-task-review`
  skill's "final `pre-merge`".

**Adopter-facing guidance**

- `strategy-configurability-architecture.md` (purpose and scope lines, customization model, decision tree, convention
  inventory and path definitions, § Extension Points, discovery, the method section's cross-references, § Agent
  lifecycle hooks).
- `strategy-session-operations.md` (§ Context Loading Model, § Probe pattern's slot list and `arc extensions status`,
  § Classification Criteria, workflow-embedded fire-point directives, § Method and Extension Loading, extension schema
  and body shape, active-extensions enumeration, review-authority line), `strategy-workflow-authoring.md`
  (`arc.extensions` schema and declaration rule, class-tag-routing exception).
- `strategy-team-coordination.md` § External Tracker Integration, `strategy-planning-module.md`,
  `strategy-file-classification.md`, `STRATEGY-INDEX.md` firing lines, the shipped `strategies/project/README.md`.
- `DEV-RULES.ARC.md` § Method and extension loading and § Rule Authority's kind list; `AGENT-BRIEF.ARC.md`'s methods and
  extensions and review-authority lines; `self-review.md`'s "lifecycle extensions" line; `methods/README.md`'s loading
  cross-reference; `.internal/scripts/README.md`.
- Initial setup `01_verify-and-configure.md` and `03_configure-external-integration.md` (purpose, Step 1, Step 3,
  summary); `integrate-external-content.md`; `verify-arc-integrity.md` (when-to-run list, § Methods and Extensions).

**CLI**

- Whole files: `commands/extensions.ts` and `commands/extensions/{status,types,format}.ts`, `handlers/extensions.ts`,
  `lib/extensions/{point-scanner,orphan-detector}.ts`, `lib/frontmatter/extension.ts`.
- `cli.ts` registration, `command-input-registrations.ts`, `cli-help-content.ts`, `cli-help-summaries.ts`,
  `lib/frontmatter/index.ts` re-exports.
- Status envelope: `commands/status/{run,schema,types,format}.ts`, `handlers/status.ts`, `handlers/status/session.ts`,
  `handlers/recover-probes.ts`, `session-envelope/registry.ts`.
- `activeExtensions` threading: `derived-locus-state-probe.ts`, `locus/derived-reader.ts`, `locus/subject-meta.ts`,
  `recover/locus-context.ts`, `compaction-seed/emitter.ts`, `load-set/projection.ts`.
- `scripts/integration/interlock-surface.ts` and its `checkpoint.ts` consumer; the `"pr-open-extensions"` filter in
  `local-vitest-runner.ts`.
- Comments naming the mechanism in `manifest/apply.ts`, `fs/walk-markdown.ts`, and `frontmatter/generic.ts`.

**Validation, gates, and CI**

- `validate-extension-points.ts`; the extension branches of `validate-frontmatter.ts`, `validate-package-neutrality.ts`,
  and `audit-method-triggers.ts`.
- Pre-commit hook (both copies): `CHECK[extension-point-references]` removed; `CHECK[frontmatter-schema]` and
  `CHECK[package-source-neutrality]` narrowed. `verify-integrity.sh` (both copies).
- The `src/handlers/extensions.ts` entry in `eslint-suppressions.json`. No check id changes, so
  `.github/check-plumbing.yml` and CI are untouched; `lint:arc:triggers` stays, for methods.

**Tests** — six mechanism-only files deleted (`integration/extensions.test.ts`, `unit/extensions-format.test.ts`,
`unit/extensions/{orphan-detector,point-scanner}.test.ts`, `unit/frontmatter/extension.test.ts`,
`unit/scripts/validate-extension-points.test.ts`); about 45 files, 2 helpers, and the 7 session-envelope fixtures
edited (envelope and probe stubs, validator and audit suites, install and update suites, change-facts, the checkpoint
surface, and workflow-prose contract suites). `pr-open-extensions.test.ts` is mixed: most of it tests PR-lifecycle
ordering.

**Internal-dev surfaces** — the new ADR and the ADR-003, ADR-008, ADR-009, and ADR-013 status lines;
`strategy-pm-composition-evolution.md` (Principle 6, § Compatibility Ladder, § Interim Boundaries, § Known Tensions);
`strategy-storage-evolution.md`'s project-machinery row; `PROJECT-PRD.md`; `TECHNICAL-OVERVIEW.md`;
`strategy-package-project-sync.md` (Configurable list and count, Framework count, installed total); root `README.md`.

## Ordering constraints

- Workflow declarations leave no later than `"extensions"` leaves `WORKFLOW_ARC_FRONTMATTER_FIELDS`; otherwise the
  parser, `lint:arc:triggers`, and the four contract suites that assert `parseError === undefined` fail.
- `validate-extension-points.ts` and `CHECK[extension-point-references]` leave in the same commit, in both hook copies —
  the hook invokes the script, so deleting it first breaks the commit gate.
- `auditPushExtensionCoverage` leaves with or before the push-site markers; the `session-init` / `session-recover`
  steps that read `extensions.value.active` leave with or before the probe slot.
- Deleting `handlers/extensions.ts` orphans its suppression entry; prune with a whole-project `lint:ts
  --prune-suppressions` run.

## Unknowns and Assumptions

- **Assumption:** no installed projects exist outside this repository (pre-public), so D5's residue reaches no one.
- **Unknown:** how this repository's `.arc/` deletions and `.internal/manifest.json` entries propagate under
  package-project sync (`check-package-sync.sh` reads the manifest's classification). Resolve during spec grounding.
- **Assumption (verified):** the earlier retirement path in `bootstrap-extraction.ts` reads only the already-removed
  `post-task-quality.md` and `post-unit-quality.md` (`sources.postTask`, `sources.postUnit`), so it is independent of
  this removal.

## Success signal

- No live reference to the mechanism remains. Across `packages/arc-framework/` and `.arc/`:
    - a case-insensitive search for `extension` finds only allowlisted senses that are not this mechanism — file
      extensions, `hooks.skip_extensions`, `micromark-extension-*`, the session operations strategy's probe-pattern
      "Extension contract" and "structural extension", and the `post-task-quality` bootstrap path (the spec pins the
      final allowlist);
    - the nine distinctive hook names (all but `pre-merge` and `pre-activation`) find nothing, and `pre-merge` and
      `pre-activation` find nothing in their mechanism forms (`#name`, backticked, "`name` extension");
    - `activeExtensions` and `arc extensions` find nothing in `src/`, and `hook` finds no extension-hook sense in
      `integrate-work-unit` or `run-errand`;
    - in every term above, negative assertions under `__tests__/**` that name the mechanism only to assert its absence
      are allowlisted.

  Excluded: `.arc/completed/**`, `.arc/user/**`, `.arc/backlog/**` (other work units' records, routed in § Coupling),
  ADR bodies, historical analyses, attestation records, and this work unit's own artifacts.
- `arc status --session-init --json` and the recovery envelope carry no `extensions` slot, `arc extensions` is not a
  command, and `arc integrate checkpoint`'s interlock surface has no `extensionReport`.
- A fresh `arc init` installs no `system/extensions/` directory.
- Every declared gate passes, including `lint:arc:triggers` with method coverage intact, and the pre-commit hook runs
  without `CHECK[extension-point-references]`.

## Scope boundary (Won't Do)

- No replacement mechanism — `customization-arch-realign` owns it.
- No edits to `docs/` or `mkdocs.yml`; their content is staged for `docs-content-sweep` by capture.
- No migration or cleanup for installed projects' kept extension files (D5).
- No rewrite of ADR bodies, historical analyses under `supplemental/analysis/`, or candidate attestation records —
  only the four status lines and the new ADR.
- No change to `bootstrap-extraction.ts`'s earlier retirement path.
- No method fire-point validator (D8).
- `hooks.skip_extensions` stays — it names file extensions, not this mechanism.

## Coupling

Routed at draft close by `USER-INBOX` captures, never by editing sibling buffers:

- **`customization-arch-realign`** — § Proposed Principle ("Extensions = hook slots"; "Extensions stay as-is") and its
  decision-tree row no longer describe ARC. Its inbound entry "Replace agent-fired extension markers with CLI-fired
  lifecycle events" gains the ADR's event-contract inventory and the pre-removal commit; "Extension
  firing-proportionality" loses its subject and re-scopes onto the replacement; "Settle whether method overrides need a
  workflow-pointer variant" loses its premise that "lifecycle extensions invoke its project workflow directly".
- **`session-retitle`** — its design is an extension with two fire points; the premise goes with this removal.
- **`release-lifecycle`** — proposes a `post-integration` extension fire point.
- **`composable-workflows`** — D1's `extensions` declaration family; `#name` freed for anchors; `point-scanner`, which
  D1's declared-and-validated conditional entries, D2's "point-scanner-enforced" private visibility, and the "Demote
  frontmatter-declared methods…" entry all build on, is gone (D8).
- **`external-pm-composition`** — its "Retain `Origin` plus project-authored extension prose" option loses its
  substrate; the interim boundary it inherits is amended (D2).
- **`scalable-core`** — its design has `post-task-completion` / `post-work-unit-activate` extensions firing on
  active-set membership, and the Proposed ADR-020 it carries recommends the extension mechanism for conditionally
  loaded fragments.
- **`storage-cutover`** — its design reorders the `post-task-completion` extension step.
- **`knowledge-lint`** — counts `point-scanner` among existing lint machinery.
- **`rules-restructure`** — its meta weighs an extension declaration as one candidate trigger model for its wiring.
- **`state-storage` cohort record** — its storage-coupling register names extensions among the readers of
  repository state.
- **Other drafts that mention extensions** (at `11df0e9c3`) — `instruction-optimization`, `arc-reinforce`,
  `naming-conventions`, `workflow-template-loads`, `docs-content-sweep` (notes), `skill-infrastructure-cleanup`,
  provisional `cross-wu-forward-compat` and `arcd-rebrand`, and `ROADMAP.md`. Route only those whose decisions the
  removal shapes.
- **Working memory** — the "Declared methods load at their fire-point" entry names "the extension marker check" as the
  analogue in its removal trigger; propose rewording at handoff.

## Readiness

- **State:** formalization-ready.
- **Resolved:** direction and D1–D8; `Class` `Heavy`; boundary stays one WU; success signal stated.
- **Carried to spec (detail, not design):** the wording of the `strategy-pm-composition-evolution.md` interim-boundary
  amendment; the success signal's final allowlist; the package-project sync deletion mechanics (grounding).
- **Next:** `create-spec`.

---

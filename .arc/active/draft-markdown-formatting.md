# Draft: Markdown Formatting Hygiene

**Purpose:** Establish a deterministic, authority-aware Markdown house style for this repository, normalize the
accumulated drift in one mechanically verified pass, and enforce the resulting table, emphasis, and task-list
formatting invariants at local and merge boundaries without imposing the repository's author preferences on ARC
projects.

- **State:** Formalization-ready — the direction, scope, audience boundaries, width model, remediation paths,
  exact-index enforcement, and coordination transfers are settled; remaining choices are implementation details.

- **Created:** 2026-06-05; re-synthesized 2026-07-20 after reconciling the draft with the shipped codebase and
  toolchain.

- **Origin:** [internal] — began as a captured request for deterministic table formatting and grew into a WU when
  the source/instance authority split, enforcement boundary, and adjacent Markdown conventions proved
  design-bearing.

- **Cohort:** [none] — one cohesive repository-hygiene WU. It coordinates with `quality-gate-hooks`,
  `adopter-markdown-contract`, and `task-list-conventions` without absorbing their broader concerns.

- **Class:** Heavy — the implementation is mostly mechanical, but a correct plan must coordinate a large Markdown
  surface, generated artifacts, the package/project mirror, and distinct internal-versus-adopter policy layers.

- **Priority:** P3 — overdue quality-of-life work with high-frequency agent and maintainer friction.

---

## Problem

ARC's Markdown is intentionally readable in source, but the repository does not consistently produce or enforce
that form. Agents commonly emit compact GFM tables whose rendered output is valid while their raw columns are hard
to scan. File-local `MD049` consistency repeatedly forces authors to discover which italic marker a file happened
to use before editing it. The task-list strategy currently instructs descriptor clusters to stay tight even when
their entries wrap, contrary to the maintainer's loose-list preference and the direction already recorded in
`draft-task-list-conventions.md`.

These are small costs per edit and large costs in aggregate. The desired outcome is one controlled normalization
pass followed by mechanical prevention, so sessions stop spending attention on recurring table repair, emphasis
marker reconciliation, and descriptor-spacing correction.

The repository's two-copy architecture makes this more than a blind formatter sweep:

- Framework Markdown is authoritative under `packages/arc-framework/arc/` and renders into `.arc/`.
- Project-owned Markdown lives directly in `.arc/`, the repository root, `docs/`, and other package surfaces.
- Some Markdown tables are fully generated while meta core tables are managed projections embedded in otherwise
  hand-preserved files; remediation must distinguish those authority shapes.
- Internal repository style, ARC-authored document shape, and adopter lint policy are related but distinct
  contracts.

---

## Reconciliation With What Shipped Since The Original Draft

The June draft's central assumptions no longer hold unchanged.

### Standard table enforcement now exists

The repository upgraded from `markdownlint-cli2` 0.21.0 to 0.22.1 on 2026-06-06. Its bundled markdownlint 0.40.0
includes `MD060/table-column-style`, added in markdownlint 0.39.0. Configuring
`MD060: { style: "aligned" }` enforces vertically aligned pipe positions by visual display width, including emoji
and CJK characters.

A read-only probe over the current tracked project scope found:

- 461 Markdown files checked;
- 15 files with non-aligned tables;
- 557 pipe-position violations.

The existing configuration leaves `MD060` at its permissive `any` default, so compact but internally consistent
tables currently pass. The original conclusion that a custom formatter check was the only enforcement seam is
therefore obsolete.

### The original formatter is not a complete remedy

`markdown-table-formatter` 1.7.0 is table-only and honors explicit paths, but it is unsuitable as the canonical
remedy for the new display-width contract. Its underlying engine counts a limited set of CJK ranges as wide and
does not use the same Unicode display-width algorithm as `MD060`; emoji and other composed glyphs can remain
misaligned after its fix.

Its `--check` result is also broader than repository correctness. It reports 182 files as needing formatting,
primarily because it rewrites a visually aligned delimiter row from the spaced form:

```markdown
| ---------- | --------- |
```

to the unspaced form:

```markdown
|------------|-----------|
```

Both forms align their pipes and pass `MD060` in `aligned` mode. Making those formatter bytes canonical would
create a large cosmetic migration and would fight table renderers shipped since the draft, which deliberately emit
the spaced form. The contract should be source column-width alignment, and the remedy must share the linter's
display-width model rather than inherit this tool's output contract.

### Generated table authorities now matter

CLI renderers now produce width-padded meta and project-readiness tables, but both currently size cells with
JavaScript `.length` / `padEnd`, unlike `MD060`'s `string-width` calculation. This WU must move every table producer
onto one shared display-width helper.

Fully derived project-readiness output routes to its renderer and regeneration. Meta files need a different path:
their core table is managed, but a full `renderMetaFile` would discard narrative, ordering, and hand edits. Expose a
content-preserving meta-core normalization primitive over the existing core-table rewrite engine; it reparses the
five current cell values and replaces only the header, delimiter, and value rows. The repository table command uses
that primitive for meta files rather than a full-file render or a generic derived-output refusal.

### The global emoji ban is neither necessary nor coherent

The original formatter measured some wide glyphs incorrectly, motivating an emoji ban. Current `MD060` aligned
mode measures display width, while existing ARC guidance and examples intentionally use symbols in some contexts.
A repository-wide emoji prohibition would conflict with shipped practice. Instead, the fixer and every CLI table
renderer must use the same `string-width` model as the enforcing rule. No emoji ban belongs in this WU.

### Emphasis drift is larger, but the boundary is clean

Current measurements for `MD049: { style: "underscore" }` are:

- 3,792 violations across 146 files in the current project lint scope;
- another 580 violations across 35 authoritative non-template package-source files;
- 4,372 conversions across 181 unique tracked files in the combined normalization surface.

`MD050` asterisk-style strong emphasis is already effectively clean. The large `MD049` migration is an expected
one-time mechanical cost, not a reason to retain recurring file-local style churn.

---

## Formatting Contract And Audience Boundary

The design separates three layers that must not be collapsed into one global Markdown policy.

### ARC semantic and structural conventions

ARC-authored task lists use formatting to communicate role:

- work descriptors are italic;
- file metadata and actionable task titles are bold;
- nested task structure uses ARC's stable four-space hierarchy;
- multi-line descriptor clusters use loose-list spacing after this WU.

These are document-shape conventions. They may be reflected in shipped strategies, templates, workflow guidance,
and ARC-generated output.

### Repository house style

This repository authors italics as `_underscore_` and strong emphasis as `**asterisk**`. The root Markdown
configuration, project CI, project Husky hook, and formatter scripts enforce that spelling across repository-owned
Markdown, including authoritative package source.

This is internal development policy. State it in `DEV-RULES.PROJECT.md`; do not turn it into a universal rule in
`DEV-RULES.ARC.md`. Package contents necessarily carry concrete marker bytes, but ARC does not ship this project's
lint rule or require projects to apply the same preference to their own Markdown.

### Project lint autonomy

Projects may choose their own Markdown style. The broader contract for keeping managed ARC content compatible with
or outside a project's linter belongs to `adopter-markdown-contract`: parser-required invariants must be separated
from author preference, and any optional shared configuration must remain overridable. This WU must not pre-empt
that design by shipping the root formatter, config, or Husky policy to projects.

---

## Table Design

### Invariant

Use **source column-width alignment** as the precise term:

> In a monospaced editor, every pipe belonging to the same table column lands at the same visual position,
> accounting for wide characters.

This is distinct from semantic left/center/right alignment encoded by colons in a GFM delimiter row.

The invariant deliberately permits both spaced and unspaced delimiter-row cells when their pipes align. That
avoids custom enforcement for a cosmetic distinction and lets generated and formatter-produced tables coexist.

### Enforcement and remediation

- Configure standard `MD060` with `style: "aligned"`; `lint:md` becomes the authority for correctness.
- Establish one shared `displayWidth` helper backed by a direct `string-width` dependency. CLI meta/status table
  renderers and repository formatting code use that helper rather than `.length` or an ad hoc wide-character range.
- Implement the table-only remedy with the standard micromark/mdast GFM-table parser/serializer and
  `gfmTableToMarkdown({ stringLength: displayWidth })`. Parse the whole document for correct GFM cell semantics, but
  splice only the source ranges belonging to table nodes so prose, list indentation, emphasis, and blank lines remain
  byte-identical.
- The fixer's public interface accepts one or more explicit paths, rejects empty/no-argument invocation, and is
  idempotent. For a rendered Framework path, it refuses the wrong-direction edit and identifies the authoritative
  package source. For a fully derived project-readiness file, it identifies the renderer/regeneration command. For a
  meta file, it invokes the content-preserving core-table normalizer.
- A failing local check should print the exact fix command for the affected file rather than relying on an
  always-loaded command catalog.
- The fixer may produce either accepted delimiter-row spelling; its bytes do not define the lint contract.
- Display-width fixtures cover CJK, emoji with variation selectors/ZWJ sequences, combining marks, and ordinary
  ASCII, and prove the fixer and both CLI renderers pass aligned `MD060` under the same inputs.

`markdown-table-formatter` and whole-document formatters such as Prettier are rejected as the shipped remedy. The
former has an incompatible display-width model; the latter rewrite unrelated prose and list indentation, including
ARC's four-space nested-list shape.

---

## Emphasis Design

Configure and enforce:

```json
{
  "MD049": { "style": "underscore" },
  "MD050": { "style": "asterisk" }
}
```

These rules choose marker spelling only; they do not replace ARC's semantic distinction between italic
descriptors and bold structural elements. An authority-aware `markdownlint --fix` migration normalizes the full
current corpus once. Verification must demonstrate that the sweep changed only emphasis delimiters and preserved
rendered meaning, code spans, links, and task-list structure.

The sweep should land as an isolated mechanical review increment so its scale does not obscure the table,
enforcement, or guidance changes.

---

## Task-List Descriptor Spacing

Pull forward only the Markdown-relevant descriptor-spacing slice from `task-list-conventions`; leave its
requirement-anchor, inserted-phase, interlock-language, and other task-grammar concerns in that WU.

Replace the live tight-cluster carve-out with the ordinary loose-list rule for a task's root descriptor block:

- When every descriptor is one physical line, the descriptor cluster may remain tight.
- When any descriptor spans two or more lines, place a blank line between every descriptor entry in the cluster.
- The cluster includes `_Goal:_`, peer descriptors such as `_Context:_` and `_Rationale:_`, and an optional
  `**Additional Context:**` entry.
- Existing boundary rules before operational children and `_Outcome:_` remain intact.

Update the authoritative task-list strategy, template, and generation checklist together, then render/sync their
project instances. Add canonical examples and a focused repository check over task lists so this repository does
not regress. Treat the check as internal formatting enforcement, not a parser-required adopter hook: the shipped
guidance and generated examples carry ARC's preferred shape, while `adopter-markdown-contract` retains authority
over which author preferences a project must enforce.

---

## Authority-Aware Scope

Formatting and checks operate on authoritative content, not merely whatever copy the current lint glob happens to
find.

- **Framework files:** fix and check `packages/arc-framework/arc/`, then render/sync `.arc/` through the existing
  classification-aware path.
- **Configurable files:** change framework sections in package source and project sections in `.arc/` separately;
  never copy one whole file over the other.
- **Scaffolded and project-owned files:** fix their owning repository path directly.
- **Fully generated artifacts:** correct the generator, test the emitted bytes, and regenerate.
- **Managed meta core tables:** normalize only their three table rows through the shared meta projection engine;
  preserve every bullet, narrative field, ordering choice, and trailing section byte-for-byte.
- **Excluded historical/private surfaces:** preserve the existing completed, temporary, and personal-state
  exclusions unless a file is deliberately selected for the one-time migration.

Expand the repository lint scope to check both authoritative package Markdown and rendered/project Markdown. The
duplicate validation of mirrored Framework files is intentional: source enforcement prevents bad content from
shipping, while rendered-copy enforcement catches template/render and sync drift. The fixer remains
authority-sensitive even though the check reads both copies.

Centralize fixer classification in a small repository script rather than duplicating complex `git ls-files`
path expressions across package scripts and documentation. The script must be safe from any linked worktree and
make its classification decisions inspectable in tests.

---

## Enforcement Boundary

This WU ships real enforcement rather than waiting for the broader quality-gate backlog.

### In this WU

- CI/merge enforcement through the existing `lint:md` job with explicit `MD049`, `MD050`, and aligned `MD060`.
- A project-local Husky check-only Markdown gate for fast feedback before commit. When Markdown or its checking
  configuration is staged, enumerate the full selected Markdown scope from the Git index, read each candidate blob
  from `:<path>`, and lint those strings under the indexed configuration. The current 487-file worktree baseline
  takes roughly four seconds, which is proportionate; reading index blobs makes the gate certify the candidate
  commit rather than unstaged worktree bytes.
- The focused repository task-list descriptor-spacing check.
- Generator and canonical-fixture tests for Markdown produced by the CLI.
- Failure output that names the affected file and exact remediation command.

Use check-only local enforcement. The index-backed runner may report a fix command against the worktree but never
mutates or restages it. This avoids both partial-staging failure modes: an unstaged fix cannot mask invalid indexed
content, and an unstaged violation cannot block a clean indexed commit.

### Remaining in `quality-gate-hooks`

- generalized configurable gate dispatch;
- pre-push and tier orchestration;
- reusable, adopter-configurable staged-content dispatch beyond this repository-specific Markdown runner;
- index-safe auto-fix and auto-restage behavior;
- adopter-facing hook policy and installation choices.

The dev-only check follows the existing package/project boundary: project checks live in `.husky/pre-commit` and
repository scripts, while the shipped ARC pre-commit hook remains reserved for universal ARC invariants.

---

## Coordination Transfers

This re-scope supersedes two entries that remain recorded in adjacent drafts. Planning close must route durable
`WU_Target` captures to their authoritative homes before activation; do not carry the routing as implementation
tasks or edit sibling WU drafts from this branch.

- **`quality-gate-hooks`:** retire its stale Markdown-specific ownership entry (table-check CI plus commit-time
  table auto-fix/emphasis/emoji wiring). Record that this WU now ships the repository-specific CI and exact-index
  check-only pre-commit gate. Preserve `quality-gate-hooks` ownership of generalized configurable dispatch,
  pre-push/tier orchestration, and future index-safe auto-fix/restage machinery.
- **`task-list-conventions`:** remove the tight-to-loose descriptor-cluster concern from its inbound buffer,
  purpose, and scope after this WU lands. Preserve its requirement-anchor, inserted-phase, interlock-language,
  completion-shape, and other task-list concerns.

The future spec carries these seams in its cross-cutting record, and planning close verifies both captures were
routed. Until the sibling drafts consume those captures, this design's narrower ownership statement is the current
decision and their overlapping entries are stale coordination debt, not parallel implementation authority.

---

## Discoverability

The June inbound concern is resolved by a three-part remedy rather than another duplicated always-loaded command:

- replace the interim direct `npx --yes markdown-table-formatter <file>` instruction in `DEV-RULES.PROJECT.md`
  with the width-aware repository script;
- remove or replace the stale `markdown-table-prettify` command in `QUICK-REFERENCE.md`;
- make the failing gate emit the exact fix command.

`DEV-RULES.PROJECT.md` remains the internal house-style authority. The gate output is the primary point-of-need
remedy; `QUICK-REFERENCE.md` may list the command without becoming a second normative explanation.

---

## One-Time Migration And Verification

The expected large mechanical diff is part of the WU's purpose. Execute it in separable, reviewable passes:

1. Establish and test authority-aware selection plus the check/fix commands.
2. Introduce the shared display-width helper, move the meta/status renderers onto it, add the in-place meta-table
   normalizer, and land the AST-based table-only remedy.
3. Enable aligned `MD060`, fix the genuinely non-aligned tables, and regenerate fully derived failures.
4. Enable `MD049`/`MD050` and run the source-first emphasis sweep, then render/sync instance copies.
5. Update descriptor-spacing guidance/examples and normalize affected live task lists.
6. Wire CI and exact-index local enforcement, then reconcile discoverability surfaces.

Each mechanical pass verifies its own diff shape before the full gate suite runs. Final verification includes:

- Markdown lint clean under the new rules;
- table fixer idempotence on ASCII and wide-glyph hand-authored fixtures;
- meta/status generator output aligned under the same display-width fixtures;
- meta core-table normalization changes only its three table rows;
- pre-commit tests prove unstaged fixes cannot mask invalid index blobs and unstaged violations cannot block a clean
  indexed commit;
- package/project sync clean;
- task-list canonical fixtures and descriptor-spacing check clean;
- no changes outside the authority-aware selected surface;
- full repository quality gates appropriate to the touched scripts and CLI tests.

---

## Scope

### In scope

- The authority-aware Markdown path selector and display-width-aware, AST-based explicit-file table remedy.
- A shared display-width helper used by the table remedy and CLI table renderers.
- Content-preserving meta core-table normalization and fully derived table regeneration.
- Standard aligned-table, underscore-italic, and asterisk-strong lint configuration.
- One-time table and emphasis normalization across authoritative current surfaces.
- Generated-table compatibility and regression tests.
- The loose descriptor-cluster slice from `task-list-conventions`, including internal regression enforcement.
- Existing CI and project-local pre-commit Markdown enforcement.
- Project-rule and command-reference reconciliation.

### Out of scope

- A global emoji or symbol ban.
- Exact canonical bytes for GFM delimiter-row cell padding.
- Whole-document Markdown formatting or switching away from markdownlint.
- Continued use of `markdown-table-formatter` as the repository remedy.
- Generalized staged auto-fix/restage and gate-dispatch architecture (`quality-gate-hooks`).
- The broad adopter lint/parser/configuration contract (`adopter-markdown-contract`).
- Other task-list grammar concerns currently collected in `task-list-conventions`.
- Reformatting completed work-unit history or private user state by default.

---

## Resolved, Open, Next

### Resolved

- The WU remains one Heavy work unit on the high drafting path; the concerns share one authority selector,
  normalization migration, and enforcement boundary.
- Table correctness means visual source column-width alignment, enforced by standard aligned `MD060`.
- The fixer and every CLI table renderer share `string-width`; wide glyphs are supported rather than banned.
- Formatter-specific delimiter spelling is not canonical.
- The WU ships CI and exact-index local check-only enforcement; it does not wait for `quality-gate-hooks`.
- `_italics_` and `**bold**` are enforced as this repository's internal house style and are not an adopter mandate.
- The one-time emphasis sweep is accepted despite its large mechanical diff.
- The global emoji-ban proposal is dropped.
- The loose descriptor-cluster concern moves here; the rest of `task-list-conventions` stays put.
- Fully derived tables regenerate; managed meta core tables normalize in place without full-file rendering.
- Planning close routes explicit ownership-transfer captures to `quality-gate-hooks` and `task-list-conventions`.

### Open

- Select the focused descriptor-spacing check's implementation form and fixture coverage without turning the rule
  into parser-required adopter policy.
- Pin the migration diff-verification technique used to prove table-only and emphasis-only mechanical passes.

### Next

Optionally run the second and final Heavy-class adversarial pass against the settled mechanisms; otherwise present
the coherent draft for capture and advance to spec creation.

---

# Draft: projected-markdown-checks — Markdown checks over projected state

- **Origin:** [internal] — the split of the `state-storage` register's lint clause (Owner, 2026-10-16), relayed by
  `storage-projection` during its task generation; minted planned, P1, `Heavy`, in the `state-storage` cohort the same
  day.
- **Purpose:** Give projected state the Markdown checks tracked Markdown gets today — lint rules, link resolution, and a
  table fixer — at a deadline projected files reach and keyed on their content, so the flip does not leave every
  planning artifact outside every gate's Markdown checks.

---

## Continuity

- **Readiness:** groomed for draft-design. The gap is verified against `main` at `c45c3e908` (§ Problem / Motivation);
  the design is this work unit's own, and nothing in § Open questions is settled beyond § Settled.
- **Timing:** a `state-storage` member that must land before the flip, so `storage-cutover` depends on it. It takes no
  edge on `storage-projection` (§ Settled), so it plans and builds now, off the program's critical path.
- **Next:** `arc start projected-markdown-checks`, then draft-design:
    1. Load `strategy-quality-gates` before choosing the deadline (question 1), and read `spec-quality-gate-hooks.md`
       D12 (§ Constraints).
    2. Read the selection's interface in `storage-projection`'s spec. If its forward amendment has not landed yet,
       settle the interface with that work unit's session rather than assuming one.
    3. Settle § Open questions, the deadline first: the key, the shipped hook, and tool neutrality follow from it.

## Problem / Motivation

### What each Markdown check reads today

- `lint:md` lists files through Git with `--cached --others --exclude-standard` (`enumerateTrackedMarkdownPaths`,
  `lib/markdown/selection.ts`), and `lint:md:staged` reads the index. A gitignored file is in neither view.
- `lint:arc:links` lists files with `git ls-files -- .arc` (`audit-links.ts`).
- `lint:md:underwrap` checks changed indexed Markdown files.
- The shipped pre-commit hook's `CHECK[markdown-links]` runs `validate-links.sh` over `git diff --cached` Markdown
  files only. It ships through `init-recipe.json`, the only Markdown lint or link check ARC installs in other projects.
- Editor lint still sees projected files, since the root `.markdownlint-cli2.jsonc` sets `gitignore: false`. That is
  feedback, never a gate.

### What changes at the flip

From the flip, projected state is gitignored and never staged. Every check above then skips every meta, draft, spec,
task list, and notes file — the planning corpus this repository's zero-tolerance Markdown gate exists for.
`notes-storage-projection.md` § Spike 4 found the same edge from the other side: every conflicted sample fails lint
(MD003, MD022, MD032), "so a conflict stays visible to an editor's linter" — and from the flip, only there.

### What the check key assumes

`arc check` keys a recorded pass on Git-tree content (`resolveCheckKey`, `lib/checks/key-resolver.ts`), `lint:md`
caches by default, and changed-input selection (`selectChangedInputs`, `lib/checks/matching.ts`) works from tracked
changes. None of them sees a projected file change. That is by design: `quality-gate-hooks` made selection and reuse
keys follow Git's exclude rules so the projection never enters them (§ Constraints).

## Settled

- **The split (Owner, 2026-10-16).** The register row on ARC's own lint and contract checks reads "checks run where
  state is written, lint included". Its lint clause now has two owners: `storage-projection` adds only the selection —
  the projected Markdown files this checkout may edit, read from its index — as a forward amendment before its
  activation, and this work unit owns the check itself.
- **Not inside save.** Declined earlier the same day, since save would then depend on a quality-check tool;
  `seam-status-roadmap` records the decision. A built-in check that depends on no such tool may reopen that placement
  (question 3).
- **No edge on `storage-projection` (Owner, 2026-10-16).** This work unit builds against the selection's interface,
  which `storage-projection`'s spec fixes, and whichever of the two lands second connects them — the pattern
  `storage-ref-backend` and `seam-locus` follow for locus's sync port. An edge would put this work unit's whole duration
  between the projection and the cutover on the critical path; little of it needs the projection itself.
- **The departure is recorded.** `seam-status-roadmap`'s draft records that from the flip no Markdown check a gate runs
  reads projected state. This work unit closes it.

## Constraints

- **Do not widen the shared Markdown view.** The selection is a separate input. `prepareMarkdownMigrationInputs`
  (`lib/markdown/migration-audit.ts`) throws `markdown.audit-baseline` for a selected path with no baseline at `HEAD`,
  which every projected path lacks. `validateExplicitMarkdownPaths` (`lib/markdown/selection.ts`) admits any path the
  shared view selects, so widening the view would start admitting projected paths there.
- **`quality-gate-hooks` D12 invariant 1** — "Gates check repository content only. … Operational and planning state are
  validated by their own record kinds when written, never by a gate … Selection and reuse keys follow Git's exclude
  rules, so the projection, excluded per clone, never enters them." It lives in that work unit's completed spec and in
  the check machinery's behavior, not in live doctrine; `strategy-quality-gates` does not carry it. A check in the
  record-kind write path works within it. A gate keyed over projected files amends it, which the spec states
  explicitly. Its Non-Goals entry ("no new Markdown gate over `.arc/` state") bounded that work unit's scope only.
- **Content rules are not this work unit's.** The register row on lifecycle hook checks (`storage-cutover`) removes
  them at the cutover and moves their content rules into record-family parsers, which `storage-seam` builds —
  `CHECK[task-numbering]` and `lint:md:descriptors` among them. This work unit owns the generic Markdown checks: lint
  rules, link resolution, line wrapping, and table alignment.

## Open questions

1. **The deadline.** The event before which the check over projected files must pass. Candidates:
    - a projection-aware gate, such as pre-push;
    - `arc sync`, where state publishes;
    - the record-kind write path, with a built-in check (question 3).

   Each candidate's relation to D12 invariant 1 is part of the choice (§ Constraints).

2. **The key.** A content key over the selection, so a recorded pass is reused and changed-input selection sees a
   projected file change, without the projection entering Git-tree keys.
3. **Tool neutrality.** Whether the check runs the project's configured Markdown linter over the selection, or ARC
   carries a built-in check over its own records. `adopter-markdown-contract` (provisional) is defining what ARC
   requires of a project's Markdown linter versus author preference — a natural rule set for a built-in check.
4. **What other projects get.** `CHECK[markdown-links]` is the only Markdown link check ARC ships, and from the flip it
   sees no projected file. Decide what the shipped hook, or its replacement at the chosen deadline, checks in a project
   that installs ARC.
5. **Which checks join.** `lint:md`'s rules, `lint:md:underwrap`, and the two link checks. `knowledge-lint`'s inbound
   buffer plans to absorb `lint:arc:links` and `validate-links.sh` into its cross-reference and relocatability families,
   so decide whether links extend to the selection here or wait for that work unit.
6. **A table fixer.** MD060 alignment needs a fixer that reaches projected files. `format:tables` takes explicit paths
   and admits explicitly named ignored ones (`allowIgnoredPaths`, `lib/markdown/format-plan.ts`), so check whether it
   already reaches projected files under the projection's write rules before building one.

## Coordination

- **`storage-projection`** — supplies the selection, with no edge either way. If this work unit lands first, connecting
  the selection falls to `storage-projection`.
- **`storage-cutover`** — depends on this work unit.
- **`seam-status-roadmap`** — records the departure, and amends `cohort-storage-seam.md` at its own draft close.
- **`storage-seam`** — keeps the rest of the register row: workflows, overrides, scripts, and contract checks read by
  projected path or through an `arc` command.
- **`storage-ref-backend`** builds the store side of sync and **`storage-cutover`** rewires `arc sync`, so a deadline
  in `arc sync` coordinates with both.
- **`knowledge-lint`** (planned) — a neighbor. Its charter covers the durable corpus and leaves the format layer and
  the managed records out; its link-check absorption meets question 5.
- **`adopter-markdown-contract`** (provisional) — a neighbor through question 3.
- **`operational-state-docs`** — owns record conformance, a neighbor rather than a home.

## Scope (provisional)

- **In:** Markdown lint, link, wrap, and table checks over the selection of projected Markdown files; their deadline,
  key, and fixer; what the shipped hook gives other projects.
- **Out:** the selection itself (`storage-projection`); structural record rules (record-family parsers); removing the
  lifecycle hook checks (`storage-cutover`); content checks over the durable corpus (`knowledge-lint`).

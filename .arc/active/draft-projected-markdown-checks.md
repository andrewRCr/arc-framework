# Draft: projected-markdown-checks — Markdown checks over projected state

- **Origin:** [internal] — the split of the `state-storage` register's lint clause (Owner, 2026-10-16), relayed by
  `storage-projection` during its task generation; minted planned, P1, `Heavy`, in the `state-storage` cohort the same
  day.
- **Purpose:** Keep projected state inside ARC's Markdown checks from the flip, in two layers. In every project, a
  record refuses, where it is written, the links ARC cannot keep valid as records move; and a project's own Markdown
  checks reach the projected files a checkout changed as feedback, surfaced before its ceremonies commit or save
  state, while its fixers reach them on demand. Neither layer leaves a planning artifact outside every Markdown check
  at the flip.

---

## Continuity

- **Readiness:** formalization-ready (2026-10-17). The direction and its detail design are settled (§ Direction,
  Owner, 2026-10-17), and the selection's interface is agreed with `storage-projection`. The gap was re-verified against
  `main` at `3922295eb`, and the two inbound items from `storage-projection` are folded into § Problem / Motivation and
  § Direction.
- **Timing:** a `state-storage` member that must land before the flip, so `storage-cutover` depends on it. It takes no
  edge on `storage-projection` (§ Settled), so it plans and builds now, off the program's critical path.
- **Next:** `create-spec`. Draft-close routing (§ Coordination) amends the cohort document with the capture — its
  `_Exposes:_` line, the reason for `storage-cutover`'s edge, and the register row — and captures hand `storage-cutover`
  the movable set, the increment request its rewrites keep, and the flip's notice; `storage-projection` the selection's
  agreed shape; and `seam-status-roadmap` the two of its records this design changes.

## Problem / Motivation

### What each Markdown check reads today

- `lint:md` lists files through Git with `--cached --others --exclude-standard` (`enumerateTrackedMarkdownPaths`,
  `lib/markdown/selection.ts`), and `lint:md:staged` reads the index. A gitignored file is in neither view.
- `lint:arc:links` lists files with `git ls-files -- .arc` (`audit-links.ts`).
- `lint:md:underwrap` checks changed indexed Markdown files.
- The shipped pre-commit hook's `CHECK[markdown-links]` runs `validate-links.sh` over `git diff --cached` Markdown
  files only. It ships through `init-recipe.json`, the only Markdown lint or link check ARC installs in other projects.
  It refuses a relative-path link from a movable artifact, any other link whose target does not exist, and a
  reference-style usage with no definition in its file, and skips anything under `completed/` (`validate_file`,
  `validate_target`).
- `lint:md:fix` runs `markdownlint-cli2 --fix "**/*.md"` (root `package.json`), which globs from disk rather than
  listing through Git. markdownlint-cli2 hands its `gitignore` setting to globby (`createDirInfos`,
  `markdownlint-cli2.mjs`), and globby's `gitignore` option reads only `.gitignore` files (`GITIGNORE_FILES_PATTERN`,
  globby 16.2.4), never `.git/info/exclude`. It is not a declared check.
- Editor lint checks whatever file is open, whatever the ignore settings say. That is feedback, never a gate.

### What changes at the flip

From the flip, projected state is gitignored and never staged. Every check above then skips every meta, draft, spec,
task list, and notes file — the planning corpus this repository's zero-tolerance Markdown gate exists for.
`notes-storage-projection.md` § Spike 4 found the same edge from the other side: every conflicted sample fails lint
(MD003, MD022, MD032), "so a conflict stays visible to an editor's linter" — and from the flip, only there.

The one Markdown command that does reach projected files is the fixer nothing gates. The projection writes its three
shared roots' entries into `.git/info/exclude` and keeps only `.arc/user/*/` in `.gitignore`
(`spec-storage-projection.md` § 11.1), so `lint:md:fix` globs `active/` and `backlog/` under either `gitignore`
setting; the root config's `ignores` already leave out `completed/`, `USER-INBOX.md`, and `WORKING-MEMORY.md`
(`.markdownlint-cli2.jsonc`), and its `gitignore: false` decides only `.arc/user/*/`, already reaching today's gitignored
`SESSION-NOTES.md`. From the flip its rewrites reach write-back as hand edits, files holding conflict markers included.

### What the check machinery assumes

`arc check` keys a recorded pass on Git-tree content (`resolveCheckKey`, `lib/checks/key-resolver.ts`), `lint:md`
caches by default, and changed-input selection (`selectChangedInputs`, `lib/checks/matching.ts`) works from tracked
changes. None of them sees a projected file change. That is by design: `quality-gate-hooks` made selection and reuse
keys follow Git's exclude rules so the projection never enters them (its D12 invariant 1), which `selection` checks
depart from (§ The request).

## Settled

- **The split (Owner, 2026-10-16).** The register row on ARC's own lint and contract checks reads "checks run where
  state is written, lint included". Its lint clause now has two owners: `storage-projection` adds only the selection —
  the projected Markdown files this checkout may edit, read from its index — as a forward amendment before its
  activation, and this work unit owns the check itself.
- **Not inside save.** Declined earlier the same day, since save would then depend on a quality-check tool.
  Reopened for a tool-free check only (Owner, 2026-10-17): ARC's link rules run inside write-back and `arc save`
  (§ Direction), while a project's linter stays out of both.
- **No edge on `storage-projection` (Owner, 2026-10-16).** This work unit builds against the selection's interface,
  which `storage-projection`'s spec fixes, and whichever of the two lands second connects them — the pattern
  `storage-ref-backend` and `seam-locus` follow for locus's sync port. An edge would put this work unit's whole duration
  between the projection and the cutover on the critical path; little of it needs the projection itself.
- **The departure is recorded.** `spec-seam-status-roadmap.md` § 9.3 records that from the flip no Markdown check a
  gate runs reads projected state. That stays true by design (§ Alternatives); this work unit answers the gap it
  leaves, with ARC's link rules where records are written and the project's own checks as feedback.
- **Industry idiom is the bar (Owner, 2026-10-17).** What this work unit builds meets established practice, or at
  least never violates it. A tool validates what it manages where it is saved and refuses what would break it
  (`visudo`, `kubectl edit`); a team's own linter configuration governs what its people write; a pre-commit check
  examines what the commit carries; and no gate runs only locally.
- **One work unit** (draft-design entry, 2026-10-17; re-read at the two-layer direction). ARC's layer is a few content
  rules on the record kinds' existing write-check seam and the shipped hook, below a work unit's warrant on its own,
  and both layers must land before the flip; the program lands single-branch with chunked review, so the layers become
  review chunks, not deliverables.

## Direction (Owner, 2026-10-17)

Where a check over projected state runs, and by what deadline, follows who owns its rules. Each layer meets § Settled's
idiom.

### ARC's layer: link rules refused where records are written

- **What.** The rules a record's content and reference settle on their own: no relative-path link from a movable
  record, whose projected path moves with its lifecycle and differs by checkout (`active/current/` in its own,
  `active/in-flight/<slug>/` elsewhere, `completed/`; `spec-storage-projection.md` § 10.1); no link from any record to
  a file under a projected root, which resolves only where a projection lays it; and every reference-style usage
  defined in its own file. The projected-root rule is one rule for every record, since records name one another by
  backticked filename, as the relocatability rule already has them name movable artifacts; its cost is refusing a
  personal record's link to the same person's other records, which would resolve. No anchor checks, no external links,
  and no style rule.
- **Where.** A write check at write-back and `arc save`, refusing as a parser rule refuses: the refused edit stays in
  its file, is reported, and holds the checkout's removal (`spec-storage-projection.md` § 7.6, § 12.2), as a failed
  commit gate holds an edit in the worktree today. It is tool-free, so it stays within the ground "Not inside save"
  named (§ Settled). Mechanics (Owner, 2026-10-17):
    - registered once in the production registration set (`lib/store/kinds/registrations.ts`) for every kind the
      projection lays as files — a projection in `KIND_MECHANISMS` other than `"never"` and an address in the layout
      schema. `personal/errand-queue` has none and projects nothing (`spec-storage-projection.md` § 10.1), and
      `project-machinery/prose` and `constitution/prose` have no ref and stay tracked files in the standard profile
      (`FAMILY_REGISTRY`, `lib/store/registry.ts`). It reads only a record whose file is Markdown: every name-keyed
      record is, a companion's file being `<key>-<slug>.md` (`companionArtifactName`, `lib/store/companion-name.ts`),
      while a path-keyed companion or personal document whose path does not end in `.md` is left alone (§ 3.7). No kind
      module changes — those belong to `storage-seam`'s members — and kinds with no registration yet are covered:
      `PRODUCTION_REGISTRATIONS` holds the meta, task list, draft, spec, companion, cohort, Errand, and lineage kinds,
      which leaves out notes, both inboxes, working memory, and personal documents, among others;
    - refusing only a violation the write introduces: one in `next` that `prior` lacks, a violation being its rule with
      its link target or reference label, counted per file rather than by line, after the idiom of gating new
      violations only. A write to a record imported with an old link is never refused for it, so fixing a typo on a
      line that holds one passes; deleting a definition a usage still needs is refused; and archived records need no
      exemption, a correction adding a bad link being refused like any write;
    - verb writes checked as hand edits are. A verb that writes a person's text can be refused naming the link — a
      route carrying an inbox entry, `arc pause`'s reason and resume notes (`lib/work-unit/verbs/pause-handover.ts`),
      `arc stub`'s `--origin` (`lib/work-unit/verbs/stub.ts`) — and the text is corrected and the verb run again; a
      verb's own rendered text carries no link, as promotion renders an Errand's new meta from its options alone
      (`renderMetaFile`, `lib/errand/promote-store.ts`);
    - from the flip every work-item and cohort record counts as movable, its path varying by lifecycle and by checkout,
      while personal records under `.arc/user/<id>/` stay put; `storage-cutover`'s rewrite of the relocatability rule
      states the set, which this draft hands it at draft close;
    - a leading `/` reads as the repository root, as `audit-links.ts` reads it (`resolveTarget`) and as GitHub and VS
      Code render it, in ARC's write check and in `validate-links.sh`, which today reads it as a filesystem path;
    - a record may hold a root-absolute link to a tracked file — the relocatability rule forbids only relative links,
      and the source's move never breaks one — and keeps some of the click-through a backticked name lacks; whether
      its target exists is the project's layer's feedback;
    - a record whose path is fixed — a personal record, or the project inbox — keeps relative links legal, and they are
      resolved against the path the layout authority gives the record (`resolveArcPath`, `lib/layout/projection.ts`)
      to test the projected-root rule, so the check needs no checkout.
- **The other end of the rule (Owner, 2026-10-17).** Tracked Markdown may not link to a movable artifact either, the
  half of `DEV-RULES.ARC` § `.arc/` artifact references nothing enforces today, nor to a file under `.arc/` that Git
  ignores (`git check-ignore`): from the flip every projected file, which exists only where a projection lays it, and
  before it the personal roots `.arc/user/<identity>/`, never the tracked `.arc/user/README.md`. Keyed on what Git
  ignores, the rule needs no probe of the flip from a shell hook; a CI clone, which holds no projection's exclude
  entries, finds no such target and refuses it as missing. The shipped hook's `CHECK[markdown-links]` refuses both in
  every project, and `lint:arc:links` here. It lands with today's two violations fixed: `adr-021`'s link into
  `completed/`, refused now, and `02_define-project`'s link to `backlog/ROADMAP.md`, which the flip breaks.
- **Target existence is not a write check.** `validate-links.sh` also refuses a link whose target does not exist, but
  that is a checkout fact: `WriteCheckInput` (`lib/store/write-check.ts`) carries no checkout tree, the backend runs the
  same check on verb writes where none is bound, and a tracked target differs by branch (`storage-projection`'s session,
  2026-10-17). A record's links to tracked files take existence feedback from the project's layer instead — here,
  `lint:arc:links` over the selection (§ The project's layer).
- **Every project.** From the flip `CHECK[markdown-links]` sees no projected file. This layer takes over its link-form
  rules over state — no relative link from a movable record, every reference-style usage defined in its file — and the
  hook goes on checking staged tracked Markdown. Whether a record's link target exists leaves the shipped checks: a
  project keeps it by declaring `validate-links.sh`, which takes the files it checks as arguments, as a `selection`
  check, the worked example the mode's documentation gives. A project's own Markdown checks change at its flip by how
  they find files: one listing through Git or reading the index stops seeing state, while one globbing from disk keeps
  reading the shared roots, which the projection excludes only through `.git/info/exclude`
  (`spec-storage-projection.md` § 11.1), conflict-marker files included, and a fixer among them rewrites projected
  files that write-back persists as hand edits, as this repository's `lint:md:fix` does today (§ Problem / Motivation).
  The mode's documentation and the flip's notice, which is `storage-cutover`'s (§ Coordination), tell a project to hand
  each Markdown tool exactly the paths it should read, with the tool's own globbing and ignore-file filtering turned
  off: Git's list for tracked files, and the selection, through a `selection` check, for state. A tool recipe the
  documentation gives is verified by running it, not by reading the tool: markdownlint-cli2 alone has several settings
  that add or drop paths it is handed (`getBaseOptions`, `enumerateFiles`, `markdownlint-cli2.mjs`). This repository's
  own explicit-path run holds — `runExplicitMarkdownlint` (`lib/markdown/worktree-lint.ts`) validates its paths and
  configuration and hands each path as a literal — and its markdownlint `selection` check goes through it, as
  `lint:md:fix` follows its rules (§ The project's layer).

### The project's layer: the project's own linter, as feedback

- **What.** Checks the project declares in its check declaration over the selection (§ Coordination), with the project's
  own linter and configuration, each opting in on its own, as a pre-commit.com hook declares its `stages`.
- **The declaration (Owner, 2026-10-17).** A third `mode` value beside `files` and `project`, the field that already
  says what paths a check receives (`CheckDeclarationSchema`, `lib/checks/declaration.ts`): a `selection` check
  receives selection paths among its own `inputs` (§ The request). Those `inputs`, `!` entries included, filter
  selection paths at every request, `run` included, with the meaning they carry for tracked paths and in agreement with
  each script's own refusal, letter case included; the spec names the matcher. They take no part in the Git-side
  request, neither selecting the check from a Git change nor counting toward the coverage that decides widening
  (`resolveCheckSelection`, `lib/checks/selection.ts`), since the check reads no tracked path. Its `cache` and `widen`
  default to `false`, and the declaration's refinements refuse what would tie it to Git or a gate: a `gate`, since no
  gate reads state (§ Alternatives); an explicit `cache: true`, since nothing keys it; an explicit `widen: true`, since
  widening answers a change to Git's view (`selectCheckInputs`), which says nothing about which state changed;
  `ci_only` and `reads_index`; and `fixes`, since the check verb finds a fixer's rewrites only through Git
  (`refreshFixerContent`, `lib/checks/fixers.ts`), so it would neither report nor refuse a rewrite of a projected file.
  The value's name follows the selection command's, which `storage-projection`'s amendment fixes.
- **The request (Owner, 2026-10-17).** `arc check increment`, whose composition gains every `selection` check as
  feedback, beside the `files` checks declared `gate: push` it already reports that way (`quality-gate-hooks` D3), and
  `arc check segment`, which runs everything `increment` runs; `selectRequestChecks` (`lib/checks/gates.ts`) composes
  both. There a `selection` check receives the selection's changed part — the files this checkout changed since its
  last `arc save`, which the selection command prints with `--changed` (§ Coordination) — as a Git-backed check at
  `increment` receives the change against `HEAD`, and is selected when that part holds a path among its inputs. The
  anchor moves wherever workflows call `arc save`, which `storage-cutover`'s flip rewrite sets; between saves the part
  accumulates, as an uncommitted change does. Selecting by the projection's changed part departs from
  `quality-gate-hooks`' rule that selection follows Git's exclude rules (its D12 invariant 1), for `selection` checks
  alone and only as feedback: no gate's result depends on the projection. `arc check run <id>` runs one on demand over
  the whole selection. No hook, gate, or CI request selects one, since it joins no gate; a check with no gate is
  already declared here (`test:integration:content`), so D9's parity holds. Before the flip the selection is empty, so
  each is `not selected` for want of a path, with no condition on the flip.
- **The fire sites (Owner, 2026-10-17).** A review increment closes with a structured approval stop, workflow stages
  included (`AGENT-BRIEF.ARC` § Vocabulary). Every ceremony that commits or saves only state requests
  `arc check increment` over the state it authored: before its approval stop for what it writes before the stop, as
  `strategy-quality-gates` has a workflow check report before its existing approval gate, and before its commit or
  save for text it writes after the stop or where it has none — `amend-design` stops before it writes, `create-spec`
  migrates a draft's content into `notes-*` after its Gate 2, and handoff's invocation is its approval
  (`session-handoff.template.md`). Text a verb renders from its options — `arc set-stage`'s, `arc finalize`'s, and
  `arc repoint-design`'s fields, or the scaffold a spawned `arc start` writes and commits itself — needs no request of
  its own; `adopter-markdown-contract` keeps it clean. The spec places each request from the shipped workflows, among
  them `draft-design`'s capture, `create-spec`, `generate-tasks`, `amend-design`, `decompose-work-unit`,
  `init-work-unit`'s in-place and promotion paths, `drain-inbox`'s routing, handoff, and the lifecycle ceremonies that
  commit text someone wrote, and keeps each ceremony's existing lint step, such as handoff's lint of its staged meta.
  Only `integrate-work-unit`'s completion-content step requests it today. The request reports the checkout's whole
  change, as at any increment boundary, and a failure is handled under `DEV-RULES.ARC` § Quality gate failure, with
  one exception the handoff workflow states: a failure in work the session leaves unfinished, state or code, is named
  in the handoff's notes as remaining work, with no stop to ask. The requests land now rather than at the flip, so a
  lint failure in planning prose surfaces before the commit or save that carries it.
- **Feedback, not enforcement.** A failure surfaces before the ceremony's commit or save, where `DEV-RULES.ARC`
  § Quality gate failure has it fixed or carried by name. A ceremony is no repository event, so enforcing there would
  take a new gate running the project's tool inside save, the form "Not inside save" declined. The cost: planning prose
  in this repository leaves mechanical zero-tolerance, and the ceremonies hold it instead.
- **No key (Owner, 2026-10-17).** A `selection` check runs uncached; a content key waits until reruns prove costly. This
  narrows the cohort document's `_Exposes:_` line, which names "a content key over the selection".
- **This repository's declarations.** `selection` checks running this repository's markdownlint configuration through
  `lint:md:file`'s explicit-path route (`runExplicitMarkdownlint`), `lint:md:underwrap`, and `lint:arc:links` — the
  last for a record's links to tracked files, which ARC's layer cannot test. Its Markdown scripts refuse ignored paths
  by design (`validateExplicitMarkdownPaths` raises `markdown.ignored`; underwrap's path mode reads the index), so each
  admits a named selection path as `format:tables` already admits named ones (`allowIgnoredPaths`); `lint:arc:links`,
  which lists through `git ls-files -- .arc` and takes no paths (`audit-links.ts`), gains a mode that takes named ones.
  Each `selection` check's `inputs` exclude what its own script refuses, so no selection path reaches a script that
  refuses it: the markdownlint check's, the root configuration's `ignores` verbatim (`MARKDOWN_SELECTION.ignores`,
  which `runExplicitMarkdownlint` refuses with `markdown.excluded`, `lib/markdown/worktree-lint.ts`), `WORKING-MEMORY.md`
  and `USER-INBOX.md` at any depth under a personal root among them; underwrap's, the exclusions its declaration
  already carries (`.arc/system/arc-checks.yml`). A meta `format:tables` rewrites is a hand edit that write-back persists
  through the meta kind's write check, as `spec-seam-status-roadmap.md` § 9.3 records, so its normalization needs
  nothing more.
- **`lint:md:fix` (agreed with `storage-projection`, 2026-10-17).** It fixes exactly the files lint reads: the Markdown
  files Git lists (`--cached --others --exclude-standard`) that are present in the worktree, so a tracked file deleted
  but not yet staged is skipped as lint skips it, plus the selection, less the root configuration's `ignores`
  (`MARKDOWN_SELECTION.ignores`, `lib/markdown/selection.ts`). It hands each to the tool as a literal path validated as
  a write (`operation: "mutate"`, `validateExplicitMarkdownPaths`), never through a glob of its own, as
  `runExplicitMarkdownlint` hands a lint read its paths; `lint:md:fix:file` follows the same rules for the paths it is
  given, and the spec settles the route. That needs no condition on the flip — before it the selection is empty and
  Git lists the tracked state; after it `--exclude-standard` drops the projected roots and the selection adds back the
  editable ones — and the selection already leaves out what a fixer must not touch. Fixing the selection is on demand:
  `lint:md:fix` over that list, and `format:tables` given selection paths by name.
- **Tables and the merge.** A fixer's re-aligned table rewrites every row, the edit that clashes in a line merge today.
  Run on demand, such a clash is an ordinary conflict, recorded and resolved by hand, never lost data; the `USER-INBOX`
  Errand "Merge aligned Markdown tables without clashing on column padding" removes it.

## Alternatives

- **A gate over the selection** (commit, push, merge). From the flip a work unit in planning takes no commits —
  `storage-seam`'s branchless planning, and the register row that turns a ceremony commit carrying only state into
  `arc save` — and D12 invariant 7 fires no gate for a planning flow that takes none, so a commit or push gate would
  first meet a draft at some later, unrelated code commit, against the idiom that a pre-commit check examines what the
  commit carries. A CI clone holds no state refs and no `arc.identity`, so it projects nothing
  (`spec-storage-projection.md` § 2.5), and the merge gate could not vouch for such a check without the local-only label
  D9 leaves out. Its one gain, the project's own linter, the project's layer keeps as feedback.
- **`arc sync`**, where state publishes. It would hold state off the remote over formatting and amend D12 invariant 2,
  which runs no gate on a push carrying only state refs, while `storage-ref-backend` and `storage-cutover` rebuild sync.
- **ARC's own style rules over records.** ARC's parsers need what each kind's parser and write check already refuse,
  not style, and ARC's writers edit fields in place (`lib/store/kinds/meta/`), the idiom for files people and tools both
  edit. A second rule set would meet the project's linter on the same file, in the editor of the person writing it.
- **The project's linter inside write-back or save.** Declined (§ Settled): durability would depend on a quality tool.

## Constraints

- **Do not widen the shared Markdown view.** The selection is a separate input. `prepareMarkdownMigrationInputs`
  (`lib/markdown/migration-audit.ts`) throws `markdown.audit-baseline` for a selected path with no baseline at `HEAD`,
  which every projected path lacks. `validateExplicitMarkdownPaths` (`lib/markdown/selection.ts`) admits any path the
  shared view selects, so widening the view would start admitting projected paths there.
- **Content rules are not this work unit's.** The register row on lifecycle hook checks (`storage-cutover`) removes
  them at the cutover and moves their content rules into record-family parsers, which `storage-seam` builds —
  `CHECK[task-numbering]` and `lint:md:descriptors` among them. This work unit owns ARC's link rules over records and
  what carries a project's own Markdown checks to the selection; the lint rules are the project's.

## Coordination

- **`storage-projection`** — supplies the selection, with no edge either way. If this work unit lands first, connecting
  the selection falls to `storage-projection`. Agreed with its session (Owner, 2026-10-17); its forward amendment to
  `spec-storage-projection.md` lands in its pre-activation verification, once `seam-locus` and `storage-ref-backend`
  ship, and fixes the command's name, while this shape is the one to build against:
    - **Scope:** the projected Markdown files the checkout may edit, read from its index after the take-in every command
      runs at its start, so new files are adopted and conflict and protected marks are current. It leaves out
      `completed/` (write-back's scope, § 15.1; an archived correction still persists at `arc save`), protected files,
      files holding conflict markers, and the personal root's `.internal/` and `scratch/`.
    - **Delivery:** an `arc` command printing one repository-relative path per line, or `{ "paths": [...] }` with
      `--json`. Over the in-repo implementation it prints an empty list rather than refusing, so a check wired before
      the flip does nothing until it.
    - **`--changed`** (agreed 2026-10-17; its mark rules corrected and re-confirmed the same day): the part of the
      selection this checkout changed since its last `arc save`, in the same format, from a per-file mark in the
      projection index. Every command's start writes edits back (§ 2.2), so the mark is set whenever write-back finds an
      edit in a file, whatever comes of it — landed, refused, skipped for failing to parse, or left pending — on the
      checkout whose file holds the edit, whichever process takes it in (§ 5.1); and by this checkout's own verb
      writes. A refresh that only rewrites a file, from a sibling's write or a pull, never sets it. Under the projection
      lock `arc save` clears every mark except on a file still holding an edit the store lacks — one left refused,
      failing to parse, pending, withheld, or held for a resolution; the mark follows its record when the path moves;
      and an index rebuilt because none was usable marks every file until the next save, over-including rather than
      missing an edit. The store cannot derive it: provenance names no checkout, and state versions carry no order.
    - **`lint:md:fix` is this work unit's** (§ The project's layer); the amendment's Non-Goals leave it out.
    - A capture hands `storage-projection` this shape at draft close, so its amendment holds it from its own record.
- **`storage-cutover`** — depends on this work unit. Its documentation pass rewrites the relocatability rule (register
  row on archival), which ARC's layer follows (§ Direction), and this draft hands it the movable set from the flip. Its
  flip rewrite of every ceremony step whose commit carried only state (register row on workflow commit steps) keeps the
  `arc check increment` request each now carries before its commit or save, and the flip's notice tells a project how
  its Markdown checks change (§ Direction, Every project). All three are draft-close routing.
- **`seam-status-roadmap`** — records the departure (`spec-seam-status-roadmap.md` § 9.3). A capture hands it, at
  draft close, two of its records this design changes: § 9.3's "until it ships those files go unchecked by any gate",
  though no gate checks them after this work unit ships either, by design (§ Settled); and § 1.1's account of this work
  unit as designing "a check's deadline, pass key, and file selection", where a `selection` check has neither a
  deadline nor a key (§ Direction).
- **`storage-seam`** — keeps the rest of the register row: workflows, overrides, scripts, and contract checks read by
  projected path or through an `arc` command.
- **`state-storage` cohort document** — amended with this draft's capture: this work unit's `_Exposes:_` line, which
  names a content key over the selection that § Direction defers; the reason § Coordination gives for `storage-cutover`'s
  edge, which names gates; and the register row's "lint included", which the project's layer keeps out of save.
- **`knowledge-lint`** (planned) — a neighbor. Its charter covers the durable corpus and leaves the format layer and
  the managed records out; it plans to absorb `lint:arc:links` and `validate-links.sh` into its cross-reference and
  relocatability families, and ARC's layer is the minimal form it absorbs.
- **`adopter-markdown-contract`** (provisional) — a neighbor: it defines what ARC requires of a project's Markdown linter
  and keeps the text ARC itself writes clean under common defaults, which the project's layer leaves to it.
- **`operational-state-docs`** — owns record conformance, a neighbor rather than a home.

## Success signal

- A write-back or `arc save` that adds a relative link to a movable record, or a link from any record into a projected
  root, is refused and reported, and the edit stays in its file; a write that leaves such a link untouched is not.
- A staged tracked Markdown file linking to a movable artifact, or to a file under `.arc/` that Git ignores, fails the
  shipped hook's `CHECK[markdown-links]`, and, for tracked Markdown under `.arc/`, fails `lint:arc:links` here.
- Before a ceremony commits or saves state, `arc check increment` reports this repository's Markdown lint, underwrap,
  and link findings as feedback over the projected files this checkout changed since its last `arc save`, and, outside
  an index rebuild, none over files it did not; before the flip it reports each `selection` check `not selected`.
- `lint:md:fix` rewrites nothing outside Git's list and the selection, so from the flip no projected file holding
  conflict markers.

## Scope (provisional)

- **In:** ARC's link rules as a write check over records, and their other end over tracked Markdown in the shipped hook
  and `lint:arc:links`, with today's two violating links fixed; the `selection` mode, its refinements, and `increment`'s
  and `segment`'s composition; the `arc check increment` fire sites in every ceremony that commits or saves only state;
  this repository's `selection` checks and `lint:md:fix`'s list; and documenting the mode and that composition where
  the check verb's help, its declaration schema, and `strategy-quality-gates` describe checks.
- **Out:** the selection itself (`storage-projection`); structural record rules (record-family parsers); removing the
  lifecycle hook checks (`storage-cutover`); content checks over the durable corpus, anchors, and external links
  (`knowledge-lint`); style rules over records, and what ARC requires of a project's linter
  (`adopter-markdown-contract`); a content key over the selection, until reruns prove costly.

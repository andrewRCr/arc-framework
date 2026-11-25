# Spec (`detailed` · `RFC`): projected-markdown-checks

- **Origin:** [internal]

- **Purpose:** Keep ARC's planning state inside Markdown checks once it lives in the store rather than in tracked files,
  in two layers. ARC refuses, wherever a record is written, the links it cannot keep valid as records move; a project's
  own Markdown checks reach the projected files a checkout changed as feedback before its ceremonies commit or save
  state, and its fixers reach them on demand. From the flip no planning artifact sits outside every Markdown check.

---

## Introduction / Context

Code paths are relative to `packages/arc-framework/src/`, and `__tests__/` paths to `packages/arc-framework/`, except
where a path begins `packages/` or `.arc/`.

### State, records, and the projection

ARC's operational and planning state — metas, drafts, specifications, task lists, notes, companions, cohort documents,
inboxes, working memory, and session context — is moving out of tracked branch files into same-repository `refs/arc/*`
refs behind one storage contract (`Store`, `lib/store/contract.ts`). Each stored item is a **record** of a registered
**kind** (`KIND_SHAPES`, `lib/store/catalog.ts`; `KIND_MECHANISMS`, `lib/store/registry.ts`). From the flip, people
and agents keep editing state as Markdown at the familiar `.arc/` paths: a **projection** lays each record as a file
there and Git ignores it — the shared roots `.arc/active/`, `.arc/backlog/`, and `.arc/completed/` through
`.git/info/exclude`, and each personal root `.arc/user/<identity>/` through `.gitignore`, as it already does today.
These four are the **projected roots**.

Three projection behaviors this design builds on. None has shipped: each is an expected contract, available when the
projection lands (§ 1.4).

- **Write-back.** At the start of every `arc` command the projection takes in each edited projected file and persists
  it as a record write with a hand-edit writer. `arc save` persists every pending edit explicitly. An edit the record's
  kind refuses stays in its file, is reported, and holds the checkout's removal until it is corrected.
- **Placement.** A work item's records project under `.arc/active/current/` in the checkout that claims it, under
  `.arc/active/in-flight/<slug>/` in other checkouts, under `.arc/backlog/` while planned, and under `.arc/completed/`
  once archived. A cohort document projects at its home — under `.arc/backlog/` while its cohort is open and under
  `.arc/completed/` once it closes (`resolveArcPath`, `lib/layout/projection.ts`) — and as a copy beside each member
  work unit. Personal records and the project inbox keep one path.
- **The selection.** The projected Markdown files this checkout may edit, and the part of them it changed since its
  last `arc save` (§ 1.4).

**The flip** is the point at which this repository's state moves into the store and the projection becomes its working
copy. Before it, state is tracked files, the in-repo implementation serves the storage contract over them, and nothing
is projected. From it, the **ref backend** — the contract's implementation over `refs/arc/*` — serves the contract, and
the projection lays state at the projected roots.

### What each Markdown check reads today

- `lint:md` lists files through Git with `--cached --others --exclude-standard` (`enumerateTrackedMarkdownPaths`,
  `lib/markdown/selection.ts`), and `lint:md:staged` reads the index. A file Git ignores is in neither view.
- `lint:arc:links` lists files with `git ls-files -- .arc` and checks each tracked `.arc/` Markdown file outside the
  archive and the template sources (`selectLinkAuditFiles`, `scripts/audit-links.ts`): every link, image, and reference
  definition that is not external or anchor-only must name an existing file or directory, and a fragment into a
  Markdown file must name a heading or HTML anchor it renders (`checkTarget`). It reads a leading `/` as the repository
  root (`resolveTarget`).
- `lint:md:underwrap` checks changed indexed Markdown files, and with `--worktree` explicit worktree files
  (`scripts/lint-markdown-underwrap.ts`).
- `format:tables`, a declared fixer at the commit gate, formats the changed files `arc check` hands it, and formats
  paths given by name even when Git ignores them (`allowIgnoredPaths`, `prepareExplicitMarkdownFormat`,
  `lib/markdown/format-plan.ts`).
- The shipped pre-commit hook's `CHECK[markdown-links]` runs `validate-links.sh` over the staged Markdown files
  (`git diff --cached --name-only --diff-filter=ACMR`). It ships through `init-recipe.json` and is the only Markdown
  link check ARC installs in other projects; like the hook's other checks over Markdown, `CHECK[merge-conflict-markers]`
  and `CHECK[task-numbering]` among them, it reads only what is staged. It refuses a relative link from a movable
  artifact — a `<prefix>-<name>.md` file with a lowercase prefix under `.arc/active/` or `.arc/backlog/`
  (`is_movable`) — any other link whose target does not exist and has no `.template.md` counterpart, and a full
  reference `[text][label]` whose label has no definition in its file (`validate_file`, `validate_target`). It skips
  template sources and anything under `completed/`, and reads a leading `/` as a filesystem path.
- `lint:md:fix` runs `markdownlint-cli2 --fix "**/*.md"` (root `package.json`), which globs from disk rather than
  listing through Git. markdownlint-cli2 hands its `gitignore` setting to globby (`createDirInfos`,
  `markdownlint-cli2.mjs`), and globby's `gitignore` option reads only `.gitignore` files (`GITIGNORE_FILES_PATTERN`,
  globby 16.2.4), never `.git/info/exclude`. `lint:md:fix:file` runs `markdownlint-cli2 --fix --no-globs` over the paths
  it is given. Neither is a declared check.
- Editor lint checks whatever file is open. That is feedback, never a gate.

### What changes at the flip

From the flip projected state is ignored by Git and never staged, so every check above except the fixers and the editor
skips every meta, draft, specification, task list, and notes file — the planning corpus this repository's
zero-tolerance Markdown gate exists for.

Of the commands above, only the fixers reach projected files: `format:tables` when given them by name, and
`lint:md:fix`, which nothing gates, through its own glob. Because the shared roots are excluded only through
`.git/info/exclude`, `lint:md:fix` globs `.arc/active/` and `.arc/backlog/` under either `gitignore` setting; the root
configuration's `ignores` already leave out `.arc/completed/`, `USER-INBOX.md`, and `WORKING-MEMORY.md`
(`.markdownlint-cli2.jsonc`, `MARKDOWN_SELECTION`), and among the projected roots its `gitignore: false` decides only
`.arc/user/*/`, already reaching today's ignored `SESSION-NOTES.md`. From the flip its rewrites reach write-back as hand
edits, files holding conflict markers included.

### What the check machinery assumes

`arc check` keys a recorded pass on Git-tree content (`resolveCheckKey`, `lib/checks/key-resolver.ts`), caches by
default, and selects a check from the change Git sees to its declared inputs (`selectChangedInputs`,
`lib/checks/matching.ts`; `resolveCheckSelection`, `lib/checks/selection.ts`). None of them sees a projected file change.
That is by design: selection and reuse keys follow Git's exclude rules, so the projection, excluded per clone, never
enters them, and planning state is validated by its own record kinds when written, never by a gate. This design keeps
both properties for every gate and departs from the first only for one new kind of check, and only as feedback (§ 4).

A **record write check** (`WriteCheck`, `lib/store/write-check.ts`) is the store's seam for rules a write of a kind must
satisfy. A kind registers it beside its parser in the production registration set (`PRODUCTION_REGISTRATIONS`,
`lib/store/kinds/registrations.ts`), from which a backend builds its registry (`createKindRegistry`,
`lib/store/registry.ts`, which refuses a second registration for one kind), as the in-repo implementation does
(`lib/store/in-repo/context.ts`). The **reference backend**, the in-memory whole-contract implementation the tests run
(`__tests__/helpers/store/reference-backend.ts`), runs every check registered in the registry it is given in its
`write` and `batch` paths (`checkPreparedWrites`, `__tests__/helpers/store/write-checks.ts`), and is given the production
set where a test injects it (`LifecycleReferenceBackend`); the in-repo implementation runs none, since before the flip
every state write is a commit behind today's pre-commit checks.

## Goals

1. **Links ARC cannot keep valid are refused where records are written.** No relative link from a record whose path
   moves; no link from any record into a projected root; every full reference defined in its own file — in every
   project, refused at write-back, at `arc save`, and on a verb's write, and only where the write introduces the
   violation.
2. **The rule's other end holds for tracked Markdown.** No tracked Markdown file links to a movable artifact or to a file
   under `.arc/` that Git ignores, refused by the shipped hook in every project and by `lint:arc:links` here.
3. **A project's own Markdown checks reach changed state as feedback.** A check declared in the new `selection` mode
   receives the projected files this checkout changed since its last save, at every increment and segment request, and
   the whole selection on demand.
4. **Every ceremony whose commit or save carries only state, text written in that ceremony among it, asks for that
   feedback** before its approval stop or, for text written after it, before its commit or save — except where § 5.1
   finds nothing for a Markdown check to read.
5. **This repository keeps its Markdown checks over state** — markdownlint, underwrap, and the link audit as
   `selection` checks — and `lint:md:fix` rewrites exactly the files lint reads.
6. **Nothing waits on the projection to land.** Before the flip the selection is empty and every `selection` check
   reports `not selected`; whichever of this change and the selection lands second connects them at one function.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **No gate over projected state.** No commit, push, or merge gate, no hook, and no CI request this repository makes
  selects a `selection` check, and no gate's result depends on the projection (§ Alternatives & Rationale).
- **No project linter inside write-back or `arc save`.** Saving state never depends on a quality tool; only ARC's
  tool-free link rules run there.
- **No style rules over records.** Records carry the rules their kinds' parsers and write checks already enforce, plus
  the link rules here; style belongs to the project's own linter configuration.
- **No target-existence, anchor, or external-link checks in the write check.** Whether a record's link target exists
  is a checkout fact the write check cannot see (§ 2.5); it stays feedback from the project's checks.
- **No content key for `selection` checks.** They run uncached; a key waits until reruns prove costly.
- **The selection is consumed, not built.** Its command, its index, its marks, and its scope are an expected contract
  (§ 1.4).
- **No structural record rules,** such as task numbering or descriptor spacing, which belong to record-kind parsers,
  and no removal of the lifecycle hook checks, which run until state leaves tracked files.
- **No checks over the durable tracked corpus beyond the link rules here,** and no statement of what ARC requires of a
  project's Markdown linter.
- **No change to the selection or reuse rules of `files` and `project` checks.**

## Proposed Design

### 1. Boundary, scope, and order

#### 1.1 One work unit

The boundary test returns **stays one work unit**. The concern is one: keeping planning state inside Markdown checks
across the move to the store. ARC's layer is a few content rules on the record kinds' existing write-check seam and the
shipped hook — below a work unit's warrant on its own — and both layers must be in place before the flip. They share
one subject, the links and lint over records, and one landing deadline, so they are review chunks of one change, not
separate deliverables: neither is independently useful to land on `main` ahead of the other, since the project's layer
does nothing before the flip and ARC's layer runs nowhere before it either.

#### 1.2 Review chunks

The design falls into five contract-closed chunks, in this order: ARC's link rules over records (§ 2); their other end
over tracked Markdown (§ 3); the `selection` mode in the check verb, with its matcher and the selection function (§ 4);
the fire sites in shipped workflows (§ 5); and this repository's declarations and fixer (§ 6), with the documentation
(§ 7) riding the chunk whose surface it describes. Chunks 1 and 2 are independent of 3–5; chunk 4 needs only that
`arc check increment` exists, which it does.

#### 1.3 Before the flip

Everything here ships live, but most of it has nothing to act on until the flip:

- The link rules register in the production set from this change. The reference backend, given that set, runs them in
  tests; the in-repo implementation runs no write check, so no state write in a project is refused by them before the
  flip.
- The hook's and `lint:arc:links`' new rules are live at once, over tracked Markdown.
- `selection` checks resolve, and before the flip the selection is empty, so each is `not selected`.
- The workflow requests land at once. Before the flip the prose is tracked, and an `increment` request's Markdown
  checks reach it as far as Git already holds it — `lint:md:staged` and `lint:md:underwrap` read the index
  (`reads_index`, `.arc/system/arc-checks.yml`), and `lint:arc:links` audits tracked paths only — so the commit gate
  checks the rest at its commit. From the flip the `selection` checks read the edited files themselves.
- `lint:md:fix`'s new list needs no condition on the flip: before it the selection is empty and Git lists the tracked
  state.

#### 1.4 Expected contracts

This design consumes behavior other changes build. Each is stated as the behavior this design relies on and when it
becomes available; until then the stated fallback holds.

- **The projection's take-in and placement,** as the Introduction describes them: each `arc` command's start takes in
  edited projected files, and records project at the placements named there. _Available_ when the projection lands;
  until then nothing is projected, and the selection is empty.
- **The selection.** An `arc` command, whose name its own change fixes, that prints the projected Markdown files the
  checkout may edit, one repository-relative path per line, or `{ "paths": [...] }` with `--json`. It reads them from the
  projection's index after the take-in every command runs at its start, so new files are adopted and conflict and
  protected marks are current. It leaves out `.arc/completed/`, protected files, files holding conflict markers, and
  each personal root's `.internal/` and `scratch/`. With `--changed` it prints the part of the selection this checkout
  changed since its last `arc save`, from a per-file mark the projection sets whenever write-back finds an edit in a
  file — whatever comes of the edit — and on this checkout's own verb writes, never on a refresh that only rewrites a
  file; `arc save` clears every mark except on a file still holding an edit the store lacks, and an index rebuilt for
  want of a usable one marks every file until the next save. Over the in-repo implementation it prints an empty list
  rather than refusing. _Available_ when the projection lands; _until connected_, the selection function (§ 4.6)
  returns an empty list.
- **Write-back and `arc save` call each kind's registered write check** with a hand-edit writer
  (`{ kind: "hand-edit" }`), the stored version as `prior`, and the merged content as `next`, report every rule the
  check returns, and keep a refused edit in its file. _Available_ with the projection.
- **The ref backend runs every registered check** in its `write` and `batch` paths and refuses a breaking write with
  `record-malformed`, naming the first broken rule, as the reference backend does. A merge after fetch it never gates:
  it runs each merged record's write check over the merged result and reports each broken rule as a `rule-broken`
  notice, storing the merged record. _Available_ with the ref backend.
- **A companion keyed by its path.** Today a companion is keyed by name and its file is `<key>-<slug>.md`, or
  `spec-<slug>-prd.md` and `spec-<slug>-rfc.md` for a paired specification's halves (`companionArtifactName`,
  `lib/store/companion-name.ts`); the ref backend's change keys a companion whose file is not of those forms by its path
  below its work item's folder. _Available_ with the ref backend; § 2.2 reads both.
- **The flip keeps what this design adds.** The flip's rewrite of each ceremony step whose commit carried only state
  keeps the `arc check increment` request that step now makes (§ 5); the rewritten relocatability rule states that from
  the flip every work-item and cohort record is movable while personal records and the project inbox keep one path,
  the set § 2.1 encodes; and the flip's notice tells a project how its Markdown checks change (§ 7.3).

### 2. ARC's layer: link rules over records

#### 2.1 Terms

- **A link** is a `link`, `image`, or `definition` node of the record's content parsed as GitHub-flavored Markdown —
  the parse and node set `lint:arc:links` uses (`fromMarkdown` with `gfm()` and `gfmFromMarkdown()`, `LINK_NODE_TYPES`,
  `audit-links.ts`). Its **path part** is its URL up to the first `?` or `#`, percent-decoded. A link is **external**
  when its URL begins with a scheme (`EXTERNAL_TARGET`, `^[a-z][a-z0-9+.-]*:`, case-insensitive) and **anchor-only**
  when it begins with `#` or its path part is empty; neither is ever checked. A link is **root-absolute** when its path
  part begins with `/`, which reads as the repository root, and **relative** otherwise.
- **A full reference** is `[text][label]` matched within the source span of one of the content's `text` nodes, as the
  parse above gives them — so it is never read in code, HTML, a link's destination, or a footnote reference, and a
  backslash-escaped bracket (`\[`) never opens one; a reference that inline formatting splits across nodes is not
  read. It is **undefined** when no `definition` in the same content carries its label under CommonMark's label
  matching (case-folded, inner whitespace collapsed). Collapsed (`[label][]`) and shortcut (`[label]`) references are
  not checked, as the hook does not check them. The hook reads full references differently: it masks only backtick
  fences and single-backtick spans before matching (`sanitize`, `validate-links.sh`), and matches a label ignoring
  letter case alone.
- **A movable record** is a record of the `work-item` or `cohort` family, whose projected path varies by lifecycle and
  by checkout (§ Introduction). **A fixed-path record** is a record of the `personal` or `project-inbox` family. Its path
  is the layout resolver's for its kind (`resolveArcPath`, `lib/layout/projection.ts`) — the project inbox's
  `.arc/backlog/ATOMIC-INBOX.md`, a person's `USER-INBOX.md`, `WORKING-MEMORY.md`, and `<work-unit>/SESSION-NOTES.md`
  under `.arc/user/<identity>/` — and, for a personal document, its key below its owner's personal root, the key being
  the managed path below that root (`personalFileReference`, `lib/store/in-repo/personal-paths.ts`).
- **A link's target** is the repository-relative path its path part names: the path part less its leading `/` when
  root-absolute; resolved against the record's own directory when relative and the record is fixed-path; and
  unresolvable when relative and the record is movable, since the record's directory differs by checkout. Targets are
  normalized (`posix.normalize`), and a trailing `/` dropped.
- **Under a projected root** means equal to, or beneath, `.arc/active`, `.arc/backlog`, `.arc/completed`, or
  `.arc/user/<identity>` for any identity slug (`SlugSchema`), so the tracked `.arc/user/README.md` is under none.
  `lib/layout/` declares these roots once, as layout data exported from `lib/layout/index.ts`, the one layout module
  code outside it may import (`layout-private`, `eslint/architecture-imports.ts`), and this check, `audit-links.ts`
  (§ 3.3), and the projection's exclude writer each read that one declaration — `src/` outside `lib/layout/` may not
  add a `.arc/active/` literal (`SURFACE_NAME`, `eslint/architecture-imports.ts`, applied by `eslint.config.js`).
  Whichever of this change and the projection's lands first adds it.

#### 2.2 The rules

Each rule is a **shape** rule: it binds every writer, hand edit and verb alike.

| Rule                        | Refuses when the write introduces                                |
| --------------------------- | ---------------------------------------------------------------- |
| `links.relative-in-movable` | A relative link in a movable record.                             |
| `links.into-projection`     | A link, in any record, whose target lies under a projected root. |
| `links.undefined-reference` | An undefined full reference, in any record.                      |

- **Why each.** A movable record's path moves with its lifecycle and differs by checkout, so a relative link from it
  breaks on its next move or in another checkout. A file under a projected root exists only where a projection lays it —
  save a tracked file a root also holds, such as `.arc/completed/README.md`, which the rule refuses too, since no record
  needs to link one — so a link into one resolves in one checkout and nowhere else: CI and every reader of the
  repository on its host see a broken link. Records name one another by backticked filename, as movable artifacts
  already must (`DEV-RULES.ARC` § `.arc/` artifact references), so the projected-root rule is one rule for every
  record. Its cost is refusing a personal record's link to the same person's other records, which would resolve in that
  person's checkouts.
- **What stays legal.** A root-absolute link to a tracked file from any record: the relocatability rule forbids only
  relative links, the source's move never breaks one, and it keeps some of the click-through a backticked name lacks.
  A relative link from a fixed-path record whose target lies outside every projected root. Whether either target exists
  is the project's layer's feedback (§ 2.5).
- **Markdown only.** The rules read every record as Markdown except a path-keyed companion or personal document whose
  key does not end in `.md`, which is admitted unchecked.

#### 2.3 Refusing only what a write introduces

A **violation** is a rule with its key: the link's URL for `links.relative-in-movable`, its target for
`links.into-projection`, and the normalized label for `links.undefined-reference`. The check counts each violation in
`prior` and in `next`, per file rather than by line, and refuses each one whose count in `next` exceeds its count in
`prior`; with no `prior` — a creation, or an adopted file the store does not yet hold — every violation in `next`
counts. A write with no `next`, a removal, is admitted. This is the idiom of gating new violations only:

- A write to a record imported with an old link is never refused for that link, so fixing a typo on a line that holds
  one passes, and archived records need no exemption.
- Deleting a definition a usage still needs is refused, since the usage's violation is new.
- A `prior` that fails its kind's parser still carries its content, which is all the rules read.

Each broken rule is reported as a `BrokenRule` (`lib/store/write-check.ts`) whose `condition` names every new
violation of that rule by its URL or label, with its line and column in `next`, the record's content as stored, and
whose `remedy` names the correction:

- `links.relative-in-movable` — "Name the target by its backticked filename, or link a tracked file from the
  repository root (`/path`), then save again."
- `links.into-projection` — "Name the record by its backticked filename instead of linking it, then save again."
- `links.undefined-reference` — "Define each reference in this file, or remove it, then save again."

#### 2.4 Registration

The rules live in one module under `lib/store/kinds/` that is no kind's module, and register through the production
set: `registrations.ts` composes them into the exported `PRODUCTION_REGISTRATIONS`, so every backend that builds its
registry from the set runs them and no kind module changes. For each covered kind the composed list carries exactly one
registration — the kind's own, its `check` replaced by one returning the kind's own broken rules followed by the link
rules', or, for a kind with no registration yet, a registration carrying only the link check — so `createKindRegistry`'s
one-registration-per-kind rule holds, and a kind that registers later is composed the same way.

**Covered kinds** are derived, never listed by hand: every kind whose mechanism projects it (`projection` other than
`"never"`, `KIND_MECHANISMS`) and whose family has a ref (`FAMILY_REGISTRY`), except `personal/errand-queue`, the one
fixed-path kind with no home in the layout (`entry(unhomed)`, `KIND_MECHANISMS`), so a relative link in it would have no
directory to resolve against. Today that is the meta, task list, draft, specification, notes, companion, description,
and inbound kinds of `work-item`; `cohort/document`; `project-inbox/inbox`; and `personal/inbox`,
`personal/working-memory`, `personal/document`, and `personal/session-context`. The `project-machinery` and
`constitution` prose kinds have no ref (`ref: null`) and are tracked files in the standard profile, where the hook
checks them as tracked Markdown (§ 3); a change that gives either family a ref brings its kind inside the derivation. A
test asserts the derived set, so a new kind that projects is covered unless deliberately excepted.

**Verb writes are checked as hand edits are.** A verb that writes a person's text can be refused naming the link —
`arc pause`'s reason and resume notes (`lib/work-unit/verbs/pause-handover.ts`), `arc stub`'s `--origin`
(`lib/work-unit/verbs/stub.ts`) — and the person corrects the text and runs the verb again. A verb's own rendered text
carries no link, as Errand promotion renders a new meta from its options and the Errand's slug and claim
(`renderMetaFile`, `lib/store/kinds/meta/projection.ts`, called from `lib/errand/promote-store.ts`). A merge after
fetch is never refused. Today no merge runs a write check — the contract's sync result carries no broken rule
(`SyncResultSchema`, `lib/store/sync.ts`), and the reference backend's sync and merge run none — and from the flip the
ref backend reports a merged violation as a `rule-broken` notice without gating the merge (§ 1.4). A merged result can
so hold a violation neither write introduced; the next write to that record admits it as already present (§ 2.3), and
the project's layer reports it as feedback where the project checks for it — here markdownlint's undefined-reference
rule and the link audit (§ 6.1).

#### 2.5 Target existence stays out of the write check

`validate-links.sh` also refuses a link whose target does not exist, but that is a checkout fact: `WriteCheckInput`
(`lib/store/write-check.ts`) carries no checkout tree, a backend runs the same check on verb writes where no checkout is
bound, and a tracked target differs by branch. A record's links to tracked files take existence feedback from the
project's layer instead — here, `lint:arc:links` over the selection (§ 6.1). For the same reason the check reads no
anchors and no external links, and the check needs no checkout: a fixed-path record's directory comes from the layout
resolver, not from a file.

#### 2.6 Every project

From the flip `CHECK[markdown-links]` sees no projected file. This layer takes over the hook's link-form rules over
state — no relative link from a movable record, and every full reference defined in its file, read from the parse
rather than by the hook's masking (§ 2.1) — and the hook goes on checking staged tracked Markdown. Whether a record's
link target exists leaves the shipped checks; a project keeps it by declaring `validate-links.sh` as a `selection`
check, the worked example the mode's documentation gives (§ 7.2).

### 3. The other end: tracked Markdown

#### 3.1 The rules

Tracked Markdown may not link to a movable artifact — the half of `DEV-RULES.ARC` § `.arc/` artifact references nothing
enforces today — nor to a file under `.arc/` that Git ignores. For a link whose target lies under `.arc/`:

- **`link to movable artifact`** — the target lies under `.arc/active/`, `.arc/backlog/`, or `.arc/completed/` and its
  basename is a `<prefix>-<name>.md` file with a lowercase prefix, the test `is_movable` applies to a source today.
- **`link to ignored ARC path`** — `git check-ignore` reports the target ignored. Git reports a tracked file as not
  ignored, so the tracked `.arc/user/README.md` stays linkable; before the flip the rule catches each personal root, and
  from it every projected file. Keyed on what Git ignores, the rule needs no probe of the flip from a shell hook, and a
  CI clone, which holds no projection's exclude entries, finds no such target and refuses it as missing.

Both are refused whether the link is relative or root-absolute, and whether or not the target exists.

#### 3.2 The shipped hook

`validate-links.sh` gains both rules for every file it validates, its existing skips (template sources, `completed/`)
unchanged. It resolves each target to a repository-relative path, normalizing `.` and `..` segments without relying on
GNU-only `realpath` options, so the rules and `git check-ignore` see the same path on Linux, macOS, and Git for Windows.
A leading `/` now reads as the repository root, as `audit-links.ts` reads it and as GitHub and VS Code render it,
rather than as a filesystem path. Each refusal is one diagnostic line naming the source, the rule, and the link, and
`CHECK[markdown-links]`'s closing advice names the backticked-filename correction for both new rules. The rules reach
every project through `arc update`, since the hook and the script ship as framework files; an existing violation
surfaces when its file is next staged.

#### 3.3 `lint:arc:links`

`audit-links.ts` applies both rules to every file it audits, with one `git check-ignore --stdin` call over the targets
under `.arc/` that resolve, and reports each as it reports a broken link. The movable-target rule takes its three
shared roots from the projected-roots declaration (§ 2.1). It also gains a mode that takes named paths: given
operands, it audits exactly those Markdown files under `.arc/` instead of listing through `git ls-files`, with every
rule it applies to a listed file — the mode this repository's `selection` check runs (§ 6.1).

#### 3.4 Today's violations

The change lands with the corpus clean under its own rules:

- `adr-021-introduce-errand-work-class.md` links into `.arc/completed/` (`[cohort]`, a cohort document); the link
  becomes the backticked filename `cohort-agile-parallelism.md`. The new movable-target rule refuses it today.
- `02_define-project` links to `backlog/ROADMAP.md` (`[roadmap]`), which the flip makes a projected file; the link
  becomes the backticked path, in the package template and its installed copy. Neither rule refuses it today, and the
  flip would.

### 4. The project's layer: the `selection` check mode

A project's own Markdown checks reach projected state through its check declaration, each opting in on its own, as a
pre-commit.com hook declares its `stages`.

#### 4.1 The declaration

`mode` (`CheckDeclarationSchema`, `lib/checks/declaration.ts`), the field that already says what paths a check receives,
gains a third value, `selection`, beside `files` and `project`. Its name follows the selection command's: if that
command's own change names it otherwise before this one lands, the mode takes the command's name. A `selection` check
receives selection paths among its own `inputs` (§ 4.2, § 4.3), passed as arguments in batches as a `files` check's
are (`checkArgumentBatches`, `lib/checks/batching.ts`), relative to its `root`.

Its `cache` and `widen` default to `false`, where both default to `true` for the other modes; the schema resolves the
defaults by mode so an explicit value stays distinguishable. The declaration's refinements refuse, each with a message
naming why:

| Field               | Refused on a `selection` check because                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gate`              | No gate reads projected state.                                                                                                                   |
| `cache: true`       | Nothing keys a selection check's content.                                                                                                        |
| `widen: true`       | Widening answers a change to Git's view, which says nothing about which state changed.                                                           |
| `ci_only`           | A CI clone projects nothing.                                                                                                                     |
| `reads_index`       | Projected files are never in the index.                                                                                                          |
| `fixes`             | The verb finds a fixer's rewrites only through Git (`refreshFixerContent`), so it would neither report nor refuse a rewrite of a projected file. |
| `shell`             | As for a `files` check, a shell command cannot receive argument batches.                                                                         |
| `pass_paths: false` | As for a `project` check, only a `files` check may withhold its paths.                                                                           |

`runtime_inputs` stays legal and does nothing for a check with no key (`resolveCheckKey`). The declaration's
`global_inputs` never select a `selection` check, which no Git change selects (§ 4.2) and whose divergence read is
skipped (§ 4.4). The generated editor schema (`.arc/system/.internal/schemas/check-declaration.schema.json`) carries
the new value through the schema registration (`registerCheckDeclarationSchemas`) and its regeneration, with a
description of each mode.

#### 4.2 Input matching

A `selection` check's `inputs`, `!` entries included, filter selection paths at every request, `run` included, with the
meaning they carry for tracked paths. The matcher is Git's own pathspec matching over the pathspecs `inputPathspecs`
builds today (`:(glob)` for an input, `:(glob,exclude)` for a `!` input; `lib/checks/matching.ts`): the selection paths
are written to a temporary index file with `git update-index --add --index-info`, each entry naming the empty blob's
object ID without writing the object, and `git ls-files -z -- <pathspecs>` against that index returns the paths that
match. So a pattern selects exactly the projected paths it would select were they tracked: `**` crosses
dot-directories such as `.arc/`, and letter case is significant on every platform. `node:path`'s `matchesGlob` is not
used: it does not let `**` cross a dot-directory, and it ignores letter case on macOS and Windows. The index file lives
in a temporary directory the matcher creates and removes before it returns, and `inputPathspecs`, private to
`matching.ts` today, is exported for it.

The inputs take no part in the Git-side request. A `selection` check is never selected by a Git change, contributes no
entry to `resolveCheckSelection`'s own-input map, and its inputs never count toward the coverage that decides widening,
so declaring one never narrows or widens any other check's selection.

#### 4.3 The requests

- **Composition.** `selectRequestChecks` (`lib/checks/gates.ts`) adds every `selection` check to `increment`'s
  composition, beside the `files` checks declared `gate: push` it already adds, and to `segment`'s, so `segment` still
  runs everything `increment` runs. No other form — `pre-commit`, `pre-push`, `gate`, or `new-head` — selects one, so
  no hook or gate runs one; only a `run` naming one by id does, and this repository's CI names none. A check with no
  gate is already declared here (`test:integration:content`), so CI parity by construction holds: the merge quality
  gate's list carries every gated check, and a `selection` check is none.
- **Increment and segment** give a `selection` check the selection's changed part — the files this checkout changed
  since its last `arc save` — as a Git-backed check at `increment` receives the change against `HEAD`. Between saves the
  part accumulates, as an uncommitted change does; the anchor moves wherever workflows call `arc save`.
- **`arc check run <id>`** gives it the whole selection with no scope or `--all`, the named paths the selection holds
  with `--paths`, and the changed part with any other scope (`--changed`, `--staged`, `--range`), each naming a change
  in Git's terms whose one counterpart for state is the change since the last save. `--ci` changes nothing for it.
- **Selected or not.** After the inputs filter its paths, a `selection` check with none is `not selected` with the
  reason `no files to check`, the reason a `files` check with no paths reports. Before the flip the selection is empty,
  so each is `not selected`, with no condition on the flip anywhere in the verb.
- **Result kind.** With no gate its result is always `feedback` (`checkResultKind`). A failure is `failed` and makes the
  request exit `1`, as a failed feedback check does today (`declaredChecksExitCode`); the caller handles it under
  `DEV-RULES.ARC` § Quality gate failure.

This departs from the rule that selection follows Git's exclude rules for `selection` checks alone and only as
feedback: no gate's selection, key, or result depends on the projection.

#### 4.4 Execution

A selected `selection` check runs as a `files` check runs, with these differences:

- **No key, no reuse.** It runs every time (`cache: false`), records no pass, and reports `not-recordable`.
- **No divergence read.** The verb's tree-versus-worktree divergence read (`readCheckDivergence`) is skipped, since the
  check's declared inputs select projected paths, which no tree holds.
- **No merged-in filtering.** The range's merged-in paths (`readRangeMergedInPaths`) are Git facts and are not read.
- **Retry remedy.** A failed one names `arc check run <id> --changed` after an `increment` or `segment` request, and the
  original request's scope otherwise (`checkRetryCommand`, `lib/checks/remedies.ts`).
- **Dry run.** `--dry-run` resolves the selection and the inputs, and forecasts its batches as for a `files` check
  (`resolveCheckForecast`), whose `mode` field gains the value.
- **An unavailable selection.** When the selection cannot be read — its command refuses, or its reader fails — every
  `selection` check in the request reports `couldn't run` with the reason the selection gave, never `not selected` and
  never a pass, and the request exits `2`, as for any check that couldn't run (`declaredChecksExitCode`): the feedback
  never ran, and its caller re-runs once the selection is readable.

#### 4.5 Help text

`arc check increment`'s and `arc check segment`'s descriptions (`cli.ts`) name the `selection` checks in their
composition, and `arc check run`'s says which paths a `selection` check receives under each scope.

#### 4.6 The selection function

The check verb, `lint:md:fix`, and `lint:md:fix:file` read the selection only through one function, which this change
adds in `lib/checks/` and its consumers reach through the verb's injected dependencies (`DeclaredCheckDependencies`) or
by import:

```ts
/** The projected Markdown files this checkout may edit, or the part changed since its last save. */
declare function readProjectedSelection(root: string, options: { changed: boolean }):
  Promise<{ status: "ok"; paths: readonly string[] } | { status: "unavailable"; reason: string }>;
```

- **Until connected** it returns `{ status: "ok", paths: [] }`.
- **Connected,** it returns what the selection command prints for the same checkout and `--changed` flag, after that
  command's start has taken in pending edits. Inside an `arc` command, whose own start has already taken them in, the
  connection may read the projection's index directly; from a script, which runs no `arc` start, it runs the command
  through the checkout's own `arc` (`npx arc` in this repository). Its failures map to `unavailable` with the command's
  or reader's reason, a refusal of the run itself, such as a stale build's, among them.
- **Whichever lands second connects them.** If this change lands first, the selection's change replaces the function's
  body; if the selection lands first, this change connects it. Either way the function is the one point that changes,
  and every consumer here and its tests read the selection through it.

### 5. Fire sites in shipped workflows

#### 5.1 The rule

A review increment closes with a structured approval stop, workflow stages included (`AGENT-BRIEF.ARC` § Vocabulary).
Every ceremony step whose commit or save carries only state, and whose state includes text a person or agent wrote
in that ceremony, requests `arc check increment` over it:

- **Before its approval stop** for text written before the stop, so the result is reported at the stop, as the
  quality-gates strategy has a workflow check report before its existing approval gate.
- **Before its commit or save** for text written after the stop, or where the ceremony has no stop of its own; where
  text is written on both sides of a stop, the second request runs only when text changed after the first.
- **Not at all** where the commit carries only fields a verb renders from its options — `arc set-stage`'s,
  `arc finalize`'s, `arc repoint-design`'s, `arc activate`'s, `arc park`'s, or `arc publish`'s, free-text options
  included — moves, deletions, a rendered ROADMAP, or a scaffold a spawned `arc start` writes and commits itself. ARC's
  layer refuses such text's links where the verb writes it (§ 2.4), and its formatting is ARC's own to keep clean.
  The same holds for a value set by hand from a field's closed vocabulary, such as `**Class:**`, which carries no prose
  for a Markdown check to find, and for text written only where no Markdown check reads it, such as under
  `.arc/completed/`.

A ceremony keeps its existing lint step, such as handoff's lint of its staged meta, `generate-tasks`'
`lint:md:descriptors`, and handoff's explicit lint of `SESSION-NOTES.md`. The request reports the checkout's whole
change, code included, as at any increment boundary, and a failure is handled under `DEV-RULES.ARC` § Quality gate
failure, with the one exception § 5.3 states. The requests land now rather than at the flip (§ 1.3).

Today `arc check increment` is requested at `integrate-work-unit`'s completion-content step, the one work-unit
ceremony commit carrying only state that requests it; at every `run-errand` pass, a route-only Errand's state-only
commit included; and at every `process-task-loop` task, so the verification commit and a task's inbox outcomes are
already covered. Review-fix rounds in `prepare-work-unit` and `integrate-work-unit` request `arc check gate commit`,
which selects no `selection` check (§ 4.3); `run-errand`'s request `arc check increment`.

Before a review-fix commit in `prepare-work-unit` or `integrate-work-unit`, request increment feedback when the fix
includes authored state text the Markdown checks read. The same request covers ordinary corrections and spec-changing
amendments; an ordinary notes-only correction needs no amendment to receive it. Retain the existing gate requests and
approval machinery. At a review site, `amend-design` uses this caller-owned request rather than adding a duplicate;
at a task site it continues to use the task's increment request.

#### 5.2 The sites

Every listed site inherits § 5.1's exclusions. An integration repair confined to completed files takes no new request;
a repair that includes authored text the checks read requests feedback at the listed boundary. This applies under
both archive cadences, without widening the selection or the Markdown checks to include completed files.
`integrate-work-unit.md`'s Step 8 cadence dispatch archives the meta before the later composition-correction branch
under `with-integration`, and its merged-PR guard can resolve an already completed meta; under `manual`, the meta stays
active until the separate archive. Verification checks which edited files receive feedback, not just that a request ran.

| Workflow (package source)                        | Step                                                                          | Request                                                                                                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft-design.md`                                | Capture the draft                                                             | Before the readiness `workflow-interlock`; again before the capture commit when the post-settle re-read changed text                                                               |
| `create-spec.md`                                 | Finalize                                                                      | Before Gate 1; again before the `create spec` commit, over the `notes-*` migration and post-settle edits written after Gate 2                                                      |
| `generate-tasks.template.md`                     | Settled task list and the `generate tasks` commit                             | After the final post-settle coherence reread, immediately before the `workflow-interlock`; repeat if subsequent authored text changes before commit                                |
| `supplemental/amend-design.md`                   | The capture commit; task and review sites                                     | Before the capture commit, after `spec-review`'s grounding slice; task and review sites use their caller's increment request before the shared commit, without a duplicate request |
| `work-unit-lifecycle/decompose-work-unit.md`     | Review the distributed result; finish source extraction                       | Before the distribution `workflow-interlock`; before the finish release commit, over the owner's reconciliation written after the apply stop                                       |
| `work-unit-lifecycle/planning/init-work-unit.md` | Step 4, Create or Reconcile Meta File (in-place and resumed paths)            | Before the init commit                                                                                                                                                             |
| `supplemental/drain-inbox.md`                    | § 5 Route — write to homes                                                    | Before each routing commit: the grooming branch's under full protection, each direct base commit under partial                                                                     |
| `session-lifecycle/session-handoff.template.md`  | Update the active meta file + commit                                          | Before the `handoff` commit, after staging and linting the meta; `SESSION-NOTES.md`, written after that commit, keeps its explicit lint                                            |
| `work-unit-lifecycle/activate-work-unit.md`      | Step 3, the `activate` transition                                             | Before the activation commit, when it carries a fold's spec or task-list edits                                                                                                     |
| `work-unit-lifecycle/integrate-work-unit.md`     | Step 7, Commit completion content                                             | Unchanged: it already requests `arc check increment`                                                                                                                               |
| `work-unit-lifecycle/integrate-work-unit.md`     | The merged-PR guard, when Completion Notes or Release Notes are missing       | Before the repair commit when it includes authored text the checks read; completed-only repairs remain exempt                                                                      |
| `work-unit-lifecycle/integrate-work-unit.md`     | A composition correction after a redirect at the `integration-interlock`      | Before the correction commit, beside affected gates, when it includes authored text the checks read; completed-only repairs remain exempt                                          |
| `work-unit-lifecycle/integrate-work-unit.md`     | Step 10, the reconcile's `pending` arm, when advisories are corrected by hand | After the correction, before the reconcile reruns                                                                                                                                  |
| `work-unit-lifecycle/prepare-work-unit.md`       | The publish step, when an advisory-only reconcile is corrected by hand        | After the correction, before `arc publish` reruns                                                                                                                                  |
| `work-unit-lifecycle/resume-work-unit.md`        | Step 5, the reconcile's `pending` arm, when advisories are corrected by hand  | After the correction, before the reconcile reruns                                                                                                                                  |
| `work-unit-lifecycle/deactivate-work-unit.md`    | Case C, the deactivation pull request                                         | Before its commit, over the reversed meta fields                                                                                                                                   |
| `work-unit-lifecycle/prepare-work-unit.md`       | Approved review fixes, ordinary corrections and amendments included           | Before the review-fix commit when the fix includes authored state text the checks read; retain its existing gate requests                                                          |
| `work-unit-lifecycle/integrate-work-unit.md`     | Approved review fixes, ordinary corrections and amendments included           | Before the review-fix commit when the fix includes authored state text the checks read; retain its existing gate requests                                                          |

Every other commit step in the shipped workflows — the spawned and graduate `arc start`, ROADMAP refreshes, inbox
absorption, the Errand promotion's receipt commit, `deactivate`'s, `abandon`'s, `park`'s, `promote`'s (its hand-set
`**Class:**` included), `reopen`'s, and `resume`'s transitions, `draft-design`'s `low`-path capture of the meta's
`**Class:**` alone, `publish` with no hand correction, a reconcile's `applied` commit, decomposition's base advance,
the archive commit, whose one written text, a final member's cohort Closeout, lies under `.arc/completed/`, which no
Markdown check reads, and the integration records, boundaries, attestations, and base merge — carries no text written
in its ceremony that a Markdown check reads, or carries code and already requests `arc check increment`, and takes no
request. Each workflow names the request in one line at the step that makes the commit, whether the step names that
commit in a callout or in prose, with no change to the machinery around it.

#### 5.3 Handoff's exception

Handoff's invocation is its approval (`session-handoff.template.md`), so its request has no stop to report at, and a
handoff ends the session rather than continuing the work. A failure in work the session leaves unfinished, state or
code, is therefore named in the handoff's notes as remaining work, with no stop to ask fix-now or defer. A failure in
the handoff's own meta edit is fixed before the commit, as its staged-meta lint already is.

### 6. This repository's declarations and fixer

#### 6.1 The `selection` checks

`.arc/system/arc-checks.yml` declares three, none with a gate:

| Check                         | Command                                                      | `inputs`                                                                             |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `lint:md:selection`           | `npm run -s lint:md:file -- --allow-ignored`                 | `**/*.md`, less each entry of `MARKDOWN_SELECTION.ignores` as a `!` input            |
| `lint:md:underwrap:selection` | `npm run -s lint:md:underwrap -- --worktree --allow-ignored` | `**/*.md`, less the exclusions `lint:md:underwrap` declares, and `!**/.venv*`        |
| `lint:arc:links:selection`    | `npm run -s lint:arc:links --`                               | `.arc/**/*.md`, less `.arc/completed/**`, `**/*.template.md`, and `**/template-*.md` |

- **markdownlint** runs this repository's configuration through `lint:md:file`'s explicit-path route
  (`runExplicitMarkdownlint`, `lib/markdown/worktree-lint.ts`), which validates its paths and configuration and hands
  each path to the tool as a literal (`--no-globs`, `:path`). A tool recipe is verified by running it, not by reading
  the tool — markdownlint-cli2 alone has several settings that add or drop paths it is handed (`getBaseOptions`,
  `enumerateFiles`, and `lintFiles`, which drops a literal path its configuration's `ignores` match;
  `markdownlint-cli2.mjs`) — so a test hands the check a selection fixture in which every admitted path holds a known
  violation and asserts each is reported.
- **underwrap** runs its `--worktree` mode, which reads the named files from the worktree.
- **The link audit** runs `audit-links.ts`'s named-path mode (§ 3.3), for a record's links to tracked files: their
  existence and anchors, which ARC's layer cannot test (§ 2.5).

#### 6.2 What the scripts admit

The Markdown scripts refuse ignored paths by design: `validateExplicitMarkdownPaths` raises `markdown.ignored` for a
path the shared Git view does not select, and underwrap's `--worktree` mode validates through it. Each gains an
`--allow-ignored` option that admits its operands as `format:tables` already admits named ones (`allowIgnoredPaths`,
`prepareExplicitMarkdownFormat`, `lib/markdown/format-plan.ts`): Git's selection is bypassed, and every physical and
authority check — a repository-contained regular file, outside Git's administration directories — still applies. The
lint scripts only read, so admitting an ignored operand risks nothing. `audit-links.ts`' named-path mode lists nothing
through Git and needs no option.

Each check's `inputs` exclude at least what its own script refuses, so no selection path reaches a script that refuses
it:

- **markdownlint** refuses `MARKDOWN_SELECTION.ignores` with `markdown.excluded` (`runExplicitMarkdownlint`). That test
  moves from `node:path`'s `matchesGlob` to the matcher of § 4.2, so the inputs and the refusal agree on dot-directories
  and letter case on every platform; the check's inputs carry the same patterns, `WORKING-MEMORY.md` and `USER-INBOX.md`
  at any depth under a personal root among them.
- **underwrap** refuses `isMarkdownPathExcluded` (`lib/markdown/authority.ts`) with `markdown.excluded-path`. Its
  check's inputs carry the exclusions `lint:md:underwrap` already declares, plus `!**/.venv*`, since the predicate
  refuses any path segment, a file's name included, that begins `.venv`.
- A unit test feeds each script's refusal every fixture path its check's inputs admit, one per exclusion class and
  letter case, and asserts none is refused.

A meta `format:tables` rewrites is a hand edit that write-back persists through the meta kind's write check, so its
normalization needs nothing more.

#### 6.3 `lint:md:fix` and `lint:md:fix:file`

`lint:md:fix` fixes exactly the files lint reads: the Markdown files `lint:md` lists (`enumerateTrackedMarkdownPaths`)
that are present in the worktree, plus the selection (§ 4.6) less `MARKDOWN_SELECTION.ignores` by the matcher of
§ 4.2. A script under `packages/arc-framework/src/scripts/` replaces the glob command. It validates each path as a write
(`operation: "mutate"`, `validateExplicitMarkdownPaths`), admitting the selection's paths as ignored
(`allowIgnoredPaths`), and reports and skips a listed path that validation refuses — a path through a symbolic link,
which lint reads but a fixer must not write through. It loads and validates the worktree configuration
(`loadWorktreeMarkdownConfigurations`) and hands each path to markdownlint-cli2 as a literal with `--fix --no-globs`,
never through a glob of its own, as `runExplicitMarkdownlint` hands a lint read its paths. `lint:md:fix:file` runs the
same script over the paths it is given, refusing a path outside that list with the reason the list excludes it.

Resolve the complete corpus, validate every explicit operand's membership, apply write-authority validation, and load
and validate configuration before the first fixer invocation. Run the admitted literal operands in bounded batches
using `batchCheckPaths` (`lib/checks/batching.ts`), budgeting the actual command, flags, and literal path arguments for
the platform. Each admitted path appears in exactly one batch; any nonzero batch result makes the fix command return
nonzero. A large-corpus test proves complete, nonduplicated coverage, untouched exclusions, and failure reporting.

`enumerateTrackedMarkdownPaths` refuses an empty Git list with `markdown.empty-selection` (`lib/markdown/selection.ts`);
for these fixers that one result contributes an empty set to the union, so a projected-only corpus still works.
Other enumeration failures remain failures. If the whole union is empty, report that there is nothing to fix without
invoking the tool with no path operands.

When the selection is unavailable, both fail closed: each refuses with the selection's reason and fixes nothing, so no
run rewrites a list other than the one lint reads, and the same command succeeds once the selection can be read.

That needs no condition on the flip: before it the selection is empty and Git lists the tracked state; after it
`--exclude-standard` drops the projected roots and the selection adds back the editable ones. The selection already
leaves out what a fixer must not touch: `completed/`, protected files, files holding conflict markers, and the personal
roots' `.internal/` and `scratch/`. Fixing state stays on demand — `lint:md:fix` over that list, and `format:tables`
given selection paths by name — never a `selection` check (§ 4.1).

**Tables and the merge.** A fixer's re-aligned table rewrites every row, the edit that clashes in a line merge. Run on
demand, such a clash is an ordinary conflict, recorded and resolved by hand, never lost data.

### 7. Documentation

#### 7.1 The verb and the schema

`arc check`'s help (§ 4.5) and the generated declaration schema (§ 4.1) describe the mode, its refinements, and its
place in `increment` and `segment`.

#### 7.2 `strategy-quality-gates`

The quality-gates strategy (`.arc/reference/strategies/arc/strategy-quality-gates.md`, from its package source) gains a
section on checking state where it is edited:

- From the flip a project's Markdown checks change by how they find files: one that lists through Git or reads the index
  stops seeing state, while one that globs from disk keeps reading the shared projected roots, which only
  `.git/info/exclude` excludes, files holding conflict markers included — unless its ignore filtering reads that file —
  and a fixer among them rewrites projected files that write-back persists as hand edits.
- So hand each Markdown tool exactly the paths it should read, with the tool's own globbing and ignore-file filtering
  turned off: Git's list for tracked files, and, for state, the selection through a `selection` check. A tool recipe is
  verified by running it.
- `selection` checks are feedback at the increment and segment boundaries and on demand, never a gate, and receive the
  files changed since the last save.
- The worked example declares the shipped `validate-links.sh`, which takes the files it checks as arguments, as a
  `selection` check over `**/*.md`, so a record's links to tracked files keep their existence check.

The section states what is, without naming this repository's internal work.

#### 7.3 The flip's notice

The notice the flip gives a project — how its Markdown checks change — draws on § 7.2's text. Writing and publishing it
belongs to the flip, not to this change.

## Alternatives & Rationale

**The bar.** What this design builds meets established practice, or at least never violates it. A tool validates what
it manages where it is saved and refuses what would break it (`visudo`, `kubectl edit`); a team's own linter
configuration governs what its people write; a pre-commit check examines what the commit carries; and no gate runs
only locally. Each layer follows from who owns its rules: ARC owns the link rules its relocation makes necessary, so
it refuses them where it saves; the project owns its linter, so it runs as the project's feedback.

- **A gate over the selection** (commit, push, or merge). From the flip a work unit in planning takes no commits, a
  ceremony commit that carried only state becomes `arc save`, and a planning flow that takes no commits fires no gate,
  so a commit or push gate would first meet a draft at some later, unrelated code commit — against the idiom that a
  pre-commit check examines what the commit carries. A CI clone holds no state refs and no `arc.identity`, so it
  projects nothing, and the merge gate could not vouch for such a check without a local-only label that CI parity by
  construction leaves out. Its one gain, the project's own linter over state, the project's layer keeps as feedback.
  The cost of declining it: from the flip this repository's planning prose leaves its mechanical zero-tolerance Markdown
  gate, and the ceremonies' requests (§ 5) hold it instead, as feedback whose failures are fixed or carried by name
  (`DEV-RULES.ARC` § Quality gate failure).
- **`arc sync`**, where state publishes. It would hold state off the remote over formatting, and run a gate on a push
  carrying only state refs, which today runs none.
- **The project's linter inside write-back or `arc save`.** Saving would then depend on a quality tool and on the
  project's configuration being runnable wherever state is written, including verb writes with no checkout bound;
  durability must not. ARC's rules qualify only because they are tool-free and settle on a record's content alone.
- **ARC's own style rules over records.** ARC's parsers need what each kind's parser and write check already refuse,
  not style, and ARC's writers edit fields in place (`lib/store/kinds/meta/`), the idiom for files people and tools both
  edit. A second rule set would meet the project's linter on the same file, in the editor of the person writing it.
- **Target existence in the write check.** Refused for want of a checkout (§ 2.5).
- **Refusing every violation rather than introduced ones.** Imported and archived records predate the rules, so a
  whole-file rule would refuse a typo fix next to an old link and need an exemption for the archive; gating only new
  violations needs neither.
- **One rule set per kind, written into each kind's module.** It would scatter one cross-kind rule across modules that
  belong to other changes and leave unregistered kinds uncovered; one composition in the production set covers every
  projecting kind, present and future.
- **Widening the shared Markdown view to admit projected paths.** `prepareMarkdownMigrationInputs`
  (`lib/markdown/migration-audit.ts`) throws `markdown.audit-baseline` for a selected path with no baseline at `HEAD`,
  which every projected path lacks, and `validateExplicitMarkdownPaths` admits any path the shared view selects, so a
  wider view would start admitting projected paths everywhere it is read. The selection stays a separate input.
- **Selecting `selection` checks by Git change, or keying them.** Git sees no projected file, so neither can work
  without the selection's own change record; the changed part is that record.
- **`node:path`'s `matchesGlob` as the matcher.** It disagrees with Git's pathspecs on dot-directories and, on macOS and
  Windows, on letter case (§ 4.2), so inputs would mean one thing for tracked paths and another for state.
- **A fixer as a `selection` check.** The verb cannot see a projected rewrite, so it could neither report nor refuse
  one; fixing state stays on demand.

## Cross-cutting Considerations

- **Trust boundaries.** The link rules bind every writer and grant nothing: they only refuse. Write-back sets the
  writer from its own provenance, never from file content, so a hand edit cannot pass as a verb to escape a rule, and
  these rules bind verbs too. A `selection` check runs the project's own declared command, as every declared check
  does; the selection function reads only the checkout's own projection. `--allow-ignored` admits only read-only lint
  over repository-contained regular files.
- **Compatibility.** The new `mode` value is additive, and existing declarations validate unchanged. The hook's new
  refusals reach every project at its next `arc update` and surface an existing violation only when its file is next
  staged. Before the flip, `lint:md:fix:file` refuses a named ignored file that no lint reads — a personal file such as
  `SESSION-NOTES.md` — where today it fixes it; from the flip that file is in the selection. ARC is pre-public-release,
  so no compatibility alias is added.
- **Performance.** The write check parses a record's `prior` and `next` once each per write, as the design kinds'
  purpose reader already parses (`readDesignPurpose`, `lib/store/kinds/design/purpose-reader.ts`), with the parser the
  CLI already bundles (`mdast-util-from-markdown`). The GFM extensions it adds (`micromark-extension-gfm`,
  `mdast-util-gfm`), which `lint:arc:links` already uses, join the bundle as `readDesignPurpose`'s parser did, from the
  package's development dependencies. A `selection` check adds one selection read per request and two Git calls for
  its matcher, over the changed part, which is small between saves; the hook adds one `git check-ignore` per target
  under `.arc/`, and `lint:arc:links` one batched call.
- **Testing.**
    - Unit: each link rule, refused and admitted; a full reference's reading, escaped brackets and brackets in code,
      HTML, link destinations, and footnote references admitted; introduced-only counting, including a removed
      definition and an untouched old link; movable versus fixed-path resolution, root-absolute links, external and
      anchor-only links, non-Markdown companions and personal documents; the composed registration for a kind with and
      without its own check; the derived covered-kind set; and the reference backend, given the production set,
      refusing a verb write that introduces a violation.
    - Unit: the declaration's defaults and every refinement; `selectRequestChecks` for each form; selection-check
      exclusion from own-input selection and widening coverage; the matcher against Git over every input pattern this
      repository declares, dot-directories and letter case included; the selection function's unconnected empty list;
      `not selected` with an empty selection; `couldn't run` with an unavailable one; the retry remedy.
    - Integration: `validate-links.sh` and `audit-links.ts` for both new rules, the root-absolute reading, a tracked
      `.arc/user/README.md` link admitted, and the named-path mode; the scripts' `--allow-ignored`; the agreement test
      of § 6.2; the markdownlint recipe test of § 6.1; and `lint:md:fix`'s list.
    - End to end: `arc check increment` over an injected selection reporting a changed projected file runs each
      `selection` check over it as feedback, and over an empty one reports each `not selected`.
- **Rollout.** Nothing is migrated, and no state changes. Every piece is live on landing and acts on state only from
  the flip (§ 1.3).
- **Package sync.** The hook, `validate-links.sh`, the workflows, and the strategy change in the package source and sync
  to this repository's `.arc/` copy, as framework content does.

## Success Criteria

1. A write that adds a relative link to a movable record, a link from any record into a projected root, or an undefined
   full reference to any record is refused with the matching `links.*` rule — at the `write` and `batch` of a
   reference backend given the production set, and by the registered check whatever its writer — and a write that
   leaves such a link untouched is admitted.
2. Every kind the derivation of § 2.4 covers carries the link rules beside its own check, and no kind registers twice.
3. A staged tracked Markdown file linking to a movable artifact, or to a file under `.arc/` that Git ignores, fails the
   shipped hook's `CHECK[markdown-links]`, and, for tracked Markdown under `.arc/`, fails `lint:arc:links`; a link to
   the tracked `.arc/user/README.md` passes both; and a leading `/` resolves from the repository root in both.
4. `adr-021-introduce-errand-work-class.md` and `02_define-project` carry no link the new rules refuse, and
   `lint:arc:links` passes over the whole tracked corpus.
5. A declaration with a `selection` check validates, and one adding `gate`, `cache: true`, `widen: true`, `ci_only`,
   `reads_index`, `fixes`, `shell`, or `pass_paths: false` to one is refused naming the field.
6. Given a selection whose changed part holds a matching path, `arc check increment` and `arc check segment` run each
   `selection` check over the changed part only and report it as feedback; `arc check run <id>` runs it over the whole
   selection; no hook, gate, or `new-head` request selects one; and with the selection function unconnected, each
   reports `not selected`.
7. A `selection` check's inputs select exactly the paths Git's pathspecs would select were they tracked.
8. Every non-exempt ceremony § 5 names requests `arc check increment` at the point § 5 places it, after the last
   authored-text change that boundary must report. Ordinary notes-only review fixes and spec-changing amendments in
   preparation and integration share one feedback request before commit, preserving their existing gate requests.
   Completed-only integration repairs remain exempt under either archive cadence, and handoff names an unfinished
   failure in its notes without stopping.
9. Given a selection whose changed part holds projected files with known findings, `arc check increment` reports this
   repository's markdownlint, underwrap, and link-audit findings over exactly those files, and none over the rest of the
   selection; every path the three checks' inputs admit reaches its script unrefused.
10. Given a selection, `lint:md:fix` rewrites exactly the Markdown files `lint:md` lists that are present in the
    worktree, plus the selection less the root configuration's `ignores`, and nothing else, naming any listed path it
    skips because the write validation refuses it; `lint:md:fix:file` refuses a path outside that list, naming why; and
    with the selection unavailable, both refuse naming its reason and rewrite nothing. Large corpora use bounded
    literal batches with each admitted path processed once and nonzero batch results retained; an empty Git list still
    permits fixing the projected corpus, and an entirely empty union invokes no fixer.
11. The quality gates pass at every gate this repository declares.

## Open Questions

None blocks starting. Each expected contract in § 1.4 states what holds until its change lands, and none leaves this
design open.

## Amendments

- **A1** — 2026-10-17 — task: preserve field-specific selection diagnostics through `readTypedProjectFile`.
  _Supersedes:_ none. _Trigger:_ 3.6 segment. _Work:_ 3.R. _Revalidated:_ 3.6.

- **A2** — 2026-10-17 — task: install the resumption and deactivation ceremonies through `resolveFileList`.
  _Supersedes:_ none. _Trigger:_ 4.6 must-stop. _Work:_ 4.6.R. _Revalidated:_ 4.7.

- **A3** — 2026-10-17 — task: preserve ordinary diagnostics through `CheckDeclarationSchema`'s mode dispatch.
  _Supersedes:_ none. _Trigger:_ 5.2 must-stop. _Work:_ 3.R2. _Revalidated:_ 5.6.

---

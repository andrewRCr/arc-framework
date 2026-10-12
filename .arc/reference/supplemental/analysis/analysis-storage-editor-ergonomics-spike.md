# Spike: Editor Ergonomics of a Gitignored Projection (2026-09)

**Purpose:** Test whether a person can find, open, search, and edit any artifact in a gitignored projection from the
editor they already use, and choose the projection's ignore strategy from a per-editor matrix: rows 5 and 6 of
[the storage analysis][storage-analysis] § 7, against the editor-ergonomics bar its § 11 set.

**State:** Point-in-time record of runs on 2026-09-24. The storage analysis carries the chosen strategy in § 6.5 and
what the spike settled in § 11.2; the analysis and ADR-035 govern wherever they differ. The scratch repositories and
their scripts stayed outside this repository.

## Surfaces a person reaches artifacts through

Each surface's role, stated once, so a miss in one is never excused by another. Only the first row counts toward
the pass bar.

| Surface                                     | Standing                                          | Role                                                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct editor access to the projection      | The requirement (Owner, 2026-09-24)               | Find, open, search and edit any artifact by name — spec, backlog, inbox — in whatever editor a person uses. Carries the pass bar alone                                      |
| Agent tools (Read, Grep, Glob; Codex; `rg`) | Always present                                    | Agent sessions' access to the same files; must find and search what a person can                                                                                            |
| `arc view <kind>`                           | Shipped: glow or bat into a pager                 | Read one artifact resolved from the current context without knowing its path. Reading only — no search, no editing, poor for long documents                                 |
| `arc view` path and editor handoff          | Captured 2026-09-24, not built                    | Resolve an artifact to its path (`--path`, composable) or open it in `$VISUAL` / `$EDITOR`. Removes "where does ARC keep it"; a bridge into the first row, not a substitute |
| `arc status [slug]`                         | Shipped                                           | Probe of state — lifecycle, predicates, dependency edges. Not document access                                                                                               |
| `status-hud` card and watch panel           | Provisional stub                                  | Orientation: where a work unit is and live progress. Projections about the work, not documents of it                                                                        |
| `STATUS.USER.md`                            | Shipped, generated                                | A personal roster that is itself a projected file, reached through the first row                                                                                            |
| Forge UI                                    | Custom-ref commits not browsable (analysis § 5.2) | None for operational state                                                                                                                                                  |

## Setup

`~/dev/scratch/arc-storage-spike/editor/`, rebuilt exactly by `build.sh`. Each variant is its own repository with a
linked worktree beside it (`<variant>-wt`), each carrying its own copy of the projection — the per-worktree model
[the hard-problems research][hard-problems] leans toward (§ 1, candidate 3). Tracked: `.arc/system/`,
`.arc/reference/`, `src/`, `README.md`. Projected and gitignored: `.arc/active/` (from `plan-amendment`),
`.arc/backlog/`, `.arc/completed/`, `.arc/user/andrew/` (flat files) — 736 files. `.idea/`, `.vscode/` and `.zed/` are
gitignored, as in arc-framework.

| Variant                   | Ignore mechanism                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `a-gitignore`             | `.gitignore`: `.arc/active/`, `.arc/backlog/`, `.arc/completed/`, `.arc/user/*/` (the real pattern)                 |
| `b-ignore-negation`       | A, plus a tracked root `.ignore` negating each pattern (`!.arc/user/*/` …)                                          |
| `c-info-exclude`          | The projection patterns in `.git/info/exclude` (shared by every worktree), not `.gitignore`                         |
| `d1-zed-scan-inclusions`  | A, plus `.zed/settings.json` `file_scan_inclusions` scoped to the four projection directories                       |
| `d2-zed-include-ignored`  | A, plus `.zed/settings.json` `file_finder.include_ignored: "all"` and `search.include_ignored: true`                |
| `e-exclude-plus-negation` | C plus B's tracked `.ignore` negation: ignored only through `.git/info/exclude`, re-included for the ripgrep family |

D3 has no directory of its own: A opened with D1's globs in Zed's user-level settings instead of `.zed/settings.json`.

Needles: `NEEDLE-PROJ-SPEC-4F2A` in the projected spec, `NEEDLE-PROJ-INBOX-8C1E` in the projected inbox,
`NEEDLE-TRACKED-2B7D` in a tracked file (the control). `rewrite.sh [variant]` rewrites the projected spec from outside
any editor the way a refresh would — a temporary file renamed over the original, mode kept — inserting a timestamped
line under the title. `-i` rewrites in place instead (same inode, no temporary file in the checkout). It runs from
anywhere; with no variant it takes the one the shell is inside.

## Results

### Terminal, agent and Git-based tools (run 2026-09-24)

Every variant and every linked worktree keeps `git status` clean. In this harness (Claude Code 2.1.282) there are no
dedicated Grep or Glob tools: `grep`, `rg` and `find` in the agent's shell are functions that run Claude Code's
embedded ugrep, ripgrep and bfs — so these rows are the agent's own search tools, not a stand-in for them.

| Tool                                                                              | A    | B    | C    | E    | Notes                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | ---- | ---- | ---- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rg --hidden`, `fd -H` (files and content)                                        | none | all  | none | all  | All 736 files, primary and worktree. `!.arc/user/*/` re-includes even though Git cannot re-include under an excluded directory — ripgrep ranks `.ignore` above both Git sources |
| `rg`, `fd` without `--hidden`                                                     | none | none | none | none | `.arc/` is a dot directory, so default ripgrep and fd skip it entirely — tracked `.arc/` files too. Pre-existing, not caused by the projection                                  |
| Agent `grep` (embedded ugrep, `--ignore-files --hidden`), run inside the checkout | none | none | all  | all  | Reads `.gitignore` only — not `.ignore`, not `.git/info/exclude`. Given an absolute path instead, it returned ignored files in every variant                                    |
| Agent `find` (embedded bfs)                                                       | all  | all  | all  | all  | No ignore handling                                                                                                                                                              |
| Agent Read                                                                        | all  | all  | all  | all  | Opens an ignored file by path                                                                                                                                                   |
| `git grep`, `git ls-files -co --exclude-standard`                                 | none | none | none | none | Tracked and untracked-unignored only; `--exclude-standard` reads `.gitignore` and `.git/info/exclude` alike                                                                     |
| Emacs `project.el` (find-file, find-regexp)                                       | none | none | none | none | Emacs 31.1: the VC backend hard-codes `git ls-files … --exclude-standard` and no option includes ignored files. Tracked `.arc/` files appear; `dired` browsing works            |
| Neovim pickers, Helix                                                             | —    | —    | —    | —    | By construction they shell out to `rg --files` or `fd` (Helix uses the same `ignore` crate), so they follow the ripgrep rows. Pickers default to skipping hidden files (lead)   |
| Codex CLI                                                                         | —    | —    | —    | —    | Shell searches are `rg`. The `@` picker misses gitignored files today (Owner); it walks with the `ignore` crate's defaults, so it should follow the ripgrep rows (lead)         |

D1 and D2 differ from A only in Zed settings and behave as A for every tool above.

**So far:**

- **E is the leading variant.** It is the only one both the ripgrep family and the agent's `grep` see, `git status`
  stays clean, and it reaches every worktree with nothing written per checkout: `.git/info/exclude` lives in the
  common Git directory, and `.ignore` is tracked. Its costs: ARC writes `.git/info/exclude` once per clone (first
  run already installs a fetch refspec, analysis § 7 row 10, so the moment exists), and `arc init` adds a tracked
  root `.ignore` to the project.
- **B and C each cover half.** B reaches the ripgrep family but not the agent's `grep`; C the reverse. Each alone
  leaves agent sessions with a search tool that misses the projection.
- **The Git-based family cannot see a gitignored projection under any variant.** For Emacs that means the built-in
  project commands miss every artifact; `consult-ripgrep` or `consult-fd` (ripgrep family) would work under B or E,
  as would the held `arc view --path` handoff. Emacs is not first-tier in § 11, but it is the first concrete editor
  the pass bar's "within reason" has to answer for.
- **Agent search depends on invocation form.** Plain `rg` misses all of `.arc/`, tracked files included; `grep` by
  absolute path ignores the ignore files. Agent-facing guidance should name one form that works.
- **A tracked `.ignore` has a side effect here:** this repository ignores `.ignore` today (`.gitignore` line 33,
  for Marksman), so under B or E Marksman would read it and start indexing the projection.

### Zed and VS Code (Owner)

Zed ran as Windows Zed over its WSL remote (Ubuntu), so scanning and Git ran inside WSL; Zed was quit completely
between variants, so no file was open from an earlier run. E and D3 were checked in their worktrees too; the other
worktrees add nothing where the primary already fails. VS Code also ran over its WSL remote; C's control search
was not reported.

| Check                                       | Zed E | Zed B | Zed C | Zed A | Zed D1 | Zed D2 | Zed D3 | VS Code E | VS Code B | VS Code C |
| ------------------------------------------- | ----- | ----- | ----- | ----- | ------ | ------ | ------ | --------- | --------- | --------- |
| Tree shows the spec and the inbox           | yes   | yes   | yes   | yes   | yes    | yes    | yes    | yes       | yes       | yes       |
| Quick-open finds `spec-plan-amendment`      | no    | no    | no    | no    | yes    | no     | yes    | yes       | yes       | no        |
| Quick-open finds `USER-INBOX`               | no    | no    | no    | no    | yes    | no     | yes    | yes       | yes       | no        |
| Search hits `NEEDLE-PROJ-SPEC-4F2A`         | no    | no    | no    | no    | yes    | no     | yes    | yes       | yes       | no        |
| Search hits `NEEDLE-PROJ-INBOX-8C1E`        | no    | no    | no    | no    | yes    | no     | yes    | yes       | yes       | no        |
| Search hits `NEEDLE-TRACKED-2B7D` (control) | yes   | yes   | yes   | yes   | yes    | yes    | yes    | yes       | yes       | —         |
| Same results in `<variant>-wt`              | yes   | —     | —     | —     | —      | —      | yes    | yes       | yes       | —         |

**Zed so far:**

- **Zed follows Git's ignore sources and nothing else.** `.ignore` negation (B, E) changes nothing, and
  `.git/info/exclude` (C) hides the projection exactly as `.gitignore` does, so E's ripgrep-family win does not
  reach Zed.
- **Scoped `file_scan_inclusions` works (D1).** It differs from A only in `.zed/settings.json`, and it turns every
  quick-open and search miss into a hit, with Zed started fresh. That reverses the earlier judgment that the
  2026-09-24 arc-framework observation was a false positive.
- **The blunter `include_ignored` settings do not (D2).** `file_finder.include_ignored: "all"` and
  `search.include_ignored: true` left quick-open and search exactly as A.
- **D1 is per checkout as built.** `.zed/` is gitignored, so `d1-zed-scan-inclusions-wt` has no settings file and
  can only fail as A does. A project-level route means ARC writes `.zed/settings.json` at `arc init` and at every
  worktree spawn, or the project tracks it.
- **The same globs in Zed's user-level settings work everywhere (D3).** Set once in Windows Zed's user settings, they
  reached the primary and its worktree over the WSL remote, with nothing written to any checkout — the lightest route
  for Zed. The cost is one setting per machine per person, the same class of step as installing the CLI; the Owner
  loosened the pass bar to allow it (2026-09-24), where it had read "nothing to redo per machine". The patterns
  name only ARC paths, so the setting is inert in other projects. It replaces Zed's default list, so it must keep
  `.env*`.

**Zed once-per-editor checks, on D1 (rewrite by rename):**

- Edit and save: works.
- External rewrite into an open, unmodified buffer: not picked up. The change appeared only after reloading the
  workspace.
- Unsaved edit, then an external rewrite, then save: Zed saved silently over the rewrite. The local edit was kept,
  the external change is gone from disk, and there was no prompt. Zed never registered the rewrite in the previous
  check, so this may be that same miss rather than a separate one.
- Markdown preview: renders, plainly.

That breaks the refresh model of [the hard-problems research][hard-problems] (§ 1, candidate 2). It expects a refresh
under an open buffer to surface through the editor's changed-on-disk prompt. Once the editor saves over a refresh, ARC's
per-path base record cannot tell: the refresh moved the base forward, so the stale save reads as a deliberate edit that
undoes the refresh. A possible guard is to keep the previous base and treat a write-back that reverts exactly the last
refresh as a same-entry conflict (write-then-gate), which [the concurrency spike][concurrency-spike] went on to test.
The cause cannot be isolated on this setup: Zed over a remote is poor at noticing external changes in the Owner's
experience, as reported for WSL in zed #41614. Native is not a clean pass either: zed #63174 (open, 2026-08-24) reports
this exact symptom on native Linux for write-temp-then-rename. Either way, Zed cannot be counted on to catch a refresh.
Agent sessions writing a file open in Zed, such as today's `USER-INBOX`, carry the same exposure.

**VS Code once-per-editor checks, on E (rewrite by rename):**

- Edit and save: works.
- External rewrite into an open, unmodified buffer: reloads by itself. VS Code watches from inside WSL as Zed does,
  so Zed's missed reload is Zed's own, not the WSL remote's.
- Unsaved edit, then an external rewrite, then save: VS Code refuses the save with its newer-on-disk conflict prompt.
  The first attempt did not exercise it: the Owner's VS Code has `files.autoSave: onFocusChange`, so moving to the
  terminal saved the edit before the script ran, and the rewrite built on it and reloaded into a clean buffer,
  keeping both. The prompt appeared once the rewrite landed on a delay while focus stayed in the editor. Autosave
  narrows the window; the prompt covers what remains.
- Markdown preview: renders.

Once per editor, on its best variant: edit and save; external rewrite (`rewrite.sh <variant>`) reloads into an open,
unmodified buffer; an unsaved edit plus an external rewrite is surfaced on save rather than silently overwritten;
Markdown preview renders. Record the mode each editor ran in (Windows against WSL, or SSH remote).

### Packaging tools (run 2026-09-24)

Moving a pattern from `.gitignore` to `.git/info/exclude` hides it from Git but not from tools that read `.gitignore`
alone. `npm pack --dry-run` on a scratch package with no `files` field and no `.npmignore`: under A it packs
`.arc/system/` only; under E it also packs `.arc/active/`, `.arc/user/andrew/USER-INBOX.md` and `.ignore`. So
`npm publish` from such a project would ship the Owner's private notes. The shared surfaces are tracked today and
already ship under the same conditions, so only `.arc/user/<id>/` is new exposure. `.npmignore` is no fix: its
presence makes npm stop reading `.gitignore` entirely. Leads, not checked: gcloud's generated `.gcloudignore`
includes `.gitignore` only, and Hatch's sdist reads `.gitignore`.

## Chosen ignore strategy (Owner, 2026-09-24)

E, split by privacy class:

- `.git/info/exclude` carries `.arc/active/`, `.arc/backlog/` and `.arc/completed/` — the shared surfaces, which are
  tracked and published under today's layout anyway. ARC writes it once per clone, when it first materializes the
  projection.
- `.gitignore` keeps `.arc/user/*/`, as today, so packaging tools that read only `.gitignore` never ship private
  notes.
- A tracked root `.ignore` re-includes all four for the ripgrep family: VS Code search and quick-open, `rg` and
  `fd`, Neovim and Helix pickers. `arc init` adds it, and a repository that ignores `.ignore` (this one, for
  Marksman) stops doing so.
- Zed: one user-level `file_scan_inclusions` setting per machine, which `arc init` can print rather than write.

What it gives up: the agent's `grep` (embedded ugrep, `.gitignore` only) misses `.arc/user/<id>/`, as it does today.
Agent guidance names `rg --hidden` as the form that sees everything, and the load set reads those files by path.
Emacs's built-in project commands see none of the projection under any variant; `consult-ripgrep`, `consult-fd` or
`arc view --path` reach it. Refresh safety is separate: VS Code prompts on a conflicting save, Zed does not, so the
guard has to be ARC's; [the concurrency spike][concurrency-spike] tested one.

## Not run here

The storage analysis § 11.7 tracks what stays open.

- Optional: Codex's `@` picker on E, to confirm the lead; JetBrains once installed (a free edition).

---

[hard-problems]: ../research/research-storage-hard-problems.md
[storage-analysis]: analysis-storage-substrate-direction.md
[concurrency-spike]: analysis-storage-concurrency-spike.md

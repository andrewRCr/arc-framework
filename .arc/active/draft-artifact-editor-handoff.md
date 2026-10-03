# Draft: Artifact Editor Handoff

- **Origin:** [internal] — minted at the 2026-09-30 housekeep drain from a `USER-INBOX` capture, "Let `arc view` open
  an artifact in the person's editor", made during storage-program discussion in the `delivery-rebuild-continuity`
  worktree (2026-09-24). Re-triaged from an Errand: the editor mode crosses the design floor despite its small CLI
  surface.
- **Purpose:** Bridge ARC's semantic artifact resolution into a person's editor, so opening an ARC artifact for
  reading or editing does not require knowing where ARC keeps it.
- **Planning posture:** `P3`; `Light`; formalization-ready.

---

## Problem / Motivation

Opening an ARC document in an editor should not require navigating its file tree or composing a shell command.
`runView` already resolves an artifact by semantic kind and, with `--path`, prints its absolute path. The missing
convenience is handing that same file to the person's editor in one invocation.

`renderViewWithPager` already supports task-position anchors; richer navigation is not this change's requirement.
The goal is access to the whole real document in a familiar editor, for reading or editing.

The editor-ergonomics spike is complete (`spike-editor-ergonomics.md`, storage-program runway step 6, personal). It
assigns path and editor handoff the role of bridging ARC's semantic artifact resolution into a person's editor;
direct editor access remains the requirement, while `arc view` and `status-hud` keep their separate roles.

## Decisions

### Command surface

Add `arc view [kind] --editor`, with `-e` as its short form. The kind and existing `--for` / `--project` selectors
retain their meanings, including the default artifact when kind is omitted. The flag selects the destination;
artifact selection stays shared with rendering and `--path`.

Refuse `--editor --path` and `--editor --current` before resolution or launch. Current-task positioning is deferred;
the command must not accept a positioning request and silently open at an arbitrary location instead.

### Editor selection and launch

Use non-empty `ARC_EDITOR` first, otherwise the command returned by `git var GIT_EDITOR`. Preserve Git's full
selection order and fallback: `GIT_EDITOR`, `core.editor`, `VISUAL`, `EDITOR`, then [Git's compile-time default][git-editor],
usually `vi`. Do not substitute another ARC default or require configuration solely because Git chose its fallback.

Honor Git-style editor command semantics, including arguments, quoted executable paths, and shell expansion in the
configured command. Pass the resolved absolute artifact path as data, separately from that command; spaces and shell
metacharacters in an artifact path must not alter the invocation.

Inherit terminal streams and await the selected command's process. Do not add or remove wait flags: a GUI launcher
can return after opening the file, while a terminal editor or a command configured with `--wait` keeps ARC waiting.
A successful process exit confirms the handoff, not that editing, saving, or persistence completed.

If Git cannot resolve an editor, launching fails, or the editor exits unsuccessfully, report the failure on stderr
and return nonzero, with `ARC_EDITOR` as the override remedy. A configured-but-broken editor does not trigger a
silent retry with another editor.

### Interaction and artifact boundary

Editor launch follows the existing invocation policy. `resolveInteractionContext` forbids interaction under
`--no-input`, CI, or noninteractive prompt streams; editor mode refuses in that state before selecting or launching
an editor. It must not fall through to rendering or print a path as a substitute for the requested action.

Open precisely the absolute file that the same selection's `--path` mode would return. An absent artifact or failed
resolution reports a nonzero result without launching an editor. Open the actual file, with no temporary excerpt,
rendered header, or formatted copy, and bypass document formatting and renderer discovery.

The storage contract and projection own which file that resolver returns and how edits persist. This feature adds
no projection, refresh, save, sync, or lifecycle operation of its own.

### Work-unit boundary

Stays one WU: one additive editor mode over existing artifact resolution, with a small process-launch boundary.
The command option, orchestration, launcher, and verification form one cohesive capability; no separate delivery
plan is warranted.

## Alternatives

- **`arc open [kind]`:** shorter and visible directly in top-level help, but ambiguous about text editor versus
  the system-associated application. `view --editor` names the destination and keeps one artifact-access command.
  GitHub CLI's [`gh issue view --web`][gh-view] is a comparable destination flag.
- **Refuse without explicit editor configuration:** avoids an unfamiliar fallback, but diverges from the fallback
  pattern documented by [Git][git-editor], [kubectl][kubectl-editor], [chezmoi][chezmoi-editor], and [npm][npm-editor].
  Reusing Git's resolver composes with existing preferences.
- **Current-task positioning:** useful sugar, but requires editor-specific invocation syntax. Opening the whole
  file satisfies the convenience goal; navigation can be evaluated separately if it becomes necessary.

## Success signal

For a resolved artifact, `arc view <kind> --editor` hands the configured editor exactly the absolute path returned
by `arc view <kind> --path`, without modifying the artifact itself. Verification covers the override and Git
fallback, command arguments and path quoting, failure reporting, incompatible flags, and forbidden interaction.
Tests use an injectable launcher and never open a real editor.

## Unknowns and Assumptions

No open product decisions remain. Git is already a runtime dependency; the launcher must preserve the editor
command's shell semantics on supported platforms. Editor launch success does not attest an editor buffer's state.

## Boundaries

Scope is semantic artifact resolution followed by editor handoff. Current-task navigation, editor detection or
capability adapters, OS-associated opening, and automatic persistence are outside it. Distinct from `status-hud`'s
status projections and from `arc-view-completed-targets`' archive lookup.

Keep the resolver and `VIEW_KINDS` unchanged. The storage seam's view-resolution work can replace the path producer
without changing the editor consumer.

## Files

`packages/arc-framework/src/cli.ts`, `src/handlers/view.ts`, `src/commands/view/run.ts`, and `src/lib/view/types.ts`
for the option, input policy, orchestration, and mode contract; a small launcher helper and focused view tests.
Document the editor option, override, and fallback in existing command help and reference surfaces.

---

[git-editor]: https://git-scm.com/docs/git-var
[gh-view]: https://cli.github.com/manual/gh_issue_view
[kubectl-editor]: https://kubernetes.io/docs/reference/kubectl/generated/kubectl_edit/
[chezmoi-editor]: https://www.chezmoi.io/reference/configuration-file/editor/
[npm-editor]: https://docs.npmjs.com/cli/v11/using-npm/config/

# Spec (`outline`): artifact-editor-handoff

- **Origin:** [internal]
- **Purpose:** Open a resolved ARC artifact in the person's editor with one command, without navigating the file
  tree or composing a shell invocation.

---

## Problem / Context

`runView` resolves artifacts by semantic kind and can print an absolute file path with `--path`. Opening that file
in an editor currently requires another command. Add editor handoff as a destination of the existing viewer.

This is one cohesive change over existing resolution: the option, orchestration, injectable launcher, and tests
produce one capability. No separate delivery plan is needed.

## Decisions

### 1. Preserve artifact selection; add an editor destination

Add `--editor`, with `-e` as its short form, to `arc view [kind]`. Preserve every existing kind, selector, and
validation rule, including `--for` and `--project` behavior.

Bare `arc view` must preserve its existing default and terminal-rendering behavior. `resolveFurthestPresent` checks
**tasks → spec → draft → meta** and selects the first available artifact. `arc view --editor` uses that same
selection and opens its file; it does not require an explicit kind.

With an explicit kind, open exactly the absolute path the same invocation with `--path` would return. Continue
using the existing resolver and `VIEW_KINDS`, so editor handoff consumes whichever path resolution supplies.

Refuse `--editor --path` and `--editor --current` before artifact resolution or editor launch. Opening the whole
artifact meets the goal; editor-specific current-task positioning is deferred.

### 2. Reuse Git's editor selection and command conventions

Use non-empty `ARC_EDITOR` when supplied. Otherwise use the command returned by `git var GIT_EDITOR`, including
[Git's selection and fallback][git-editor]: `GIT_EDITOR`, `core.editor`, `VISUAL`, `EDITOR`, then its compile-time
default, usually `vi`. Do not require explicit configuration solely because Git chose its fallback.

Interpret the selected command with Git-compatible shell semantics, preserving arguments, quoted executable
paths, and command-side shell expansion on supported platforms. Pass the absolute artifact path separately as
data; spaces and shell metacharacters in the file path must not change the command or its arguments.

Inherit terminal streams and wait for the selected command's process to exit. Do not add or remove wait flags.
This honors both terminal editors and GUI launchers, including a command configured with `--wait`.

### 3. Preserve the interaction boundary and report failures

`resolveInteractionContext` forbids interaction under `--no-input`, CI, or noninteractive prompt streams. Editor
mode refuses when that policy forbids interaction, before selecting or launching an editor. Refusal returns a
nonzero result and a diagnostic; it does not substitute rendering or path output.

An absent artifact or failed resolution must also return nonzero without launching an editor. If editor
selection or launch fails, or the editor exits unsuccessfully, report the failure on stderr, return nonzero,
and name `ARC_EDITOR` as the editor-override remedy. Do not silently try a different editor.

A successful handoff emits no ARC document content. Editor-owned terminal output can pass through inherited
streams. Success describes the selected command's exit, not proof that an editor buffer was opened or saved.

### 4. Hand off the real file through an injectable process boundary

Open the actual resolved file, with no temporary excerpt, rendered header, or formatted copy. Editor mode
bypasses document reading for presentation, formatting, and renderer discovery. ARC orchestration does not
rewrite artifact content; the person's editor can edit the file normally. Add no save, sync, refresh, or lifecycle
operation of ARC's own.

Keep process effects in the adapter and supply the launcher through an injectable dependency. Extend the view
option/input contract and command-owned interaction declarations; retain the existing artifact resolver and
kind registry. Tests must never launch a real editor.

Document the option, short form, editor override, Git fallback, and wait behavior in command help and existing
command-reference surfaces.

## Scope boundary (No-gos)

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

Scope is one editor destination for the existing artifact viewer. Current-task positioning, editor detection
or capability adapters, OS-associated opening, additional target kinds or completed-target lookup, status
dashboards, projection behavior, and automatic persistence are outside it. No separate `arc open` command or
additional dependency is introduced.

## Consequences & Risks

- Git's fallback may choose an unfamiliar editor. This conventional behavior is accepted; `ARC_EDITOR` provides
  a direct override without recreating editor-selection policy.
- Configured commands are executable preferences and retain shell semantics. Artifact paths must remain literal
  arguments; verify quoting and argument transport rather than treating file paths as shell expressions.
- A GUI launcher can exit before editing ends; a wait-enabled command can block until its editor releases the
  file. ARC honors that choice and makes no buffer-state or persistence claim.
- Opening a projected file follows the same path boundary as `--path`. The existing storage/projection authority
  owns refresh and persistence; this mode must not create a competing path or write contract.

## Success Criteria

- Bare `arc view` retains default selection and rendering. Omitting kind with `--editor` selects the same artifact;
  verify each fallback in the tasks → spec → draft → meta order.
- Explicit-kind editor handoff passes exactly the absolute path returned by matching `--path` selection, including
  permitted `--for` and `--project` selections, without ARC adding presentation content or rewriting the artifact.
- Editor selection honors `ARC_EDITOR` and otherwise delegates to Git, including its fallback. Launcher checks
  cover command arguments, quoted executables, literal paths with spaces/metacharacters, inherited streams, and
  waiting for process completion without changing configured wait flags.
- Invalid flag combinations, forbidden interaction, missing/error artifacts, failed selection/launch, and
  unsuccessful editor exits return nonzero with diagnostics. Refused paths never launch an editor; editor failures
  never silently switch editors.
- Existing rendering, `--path`, and `--current` behavior stays compatible. Editor mode bypasses presentation
  dependencies, command help/reference material describes the feature, and tests use an injectable launcher.

## Open items

None. Internal launcher plumbing is implementation detail within the command and path-transport contracts above.

## Amendments

None.

---

[git-editor]: https://git-scm.com/docs/git-var

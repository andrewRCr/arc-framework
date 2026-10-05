# Editor Handoff Rationale

## Command destination

`view --editor` keeps one artifact-access command and names the destination explicitly. A standalone `open` verb
would be shorter and visible in top-level help, but could suggest the system-associated application instead of
a text editor. GitHub CLI's [`gh issue view --web`][gh-view] uses a comparable destination flag.

Current-task positioning is optional convenience beyond whole-file access. It would require editor-specific
invocation conventions; accepting `--current` while ignoring positioning would be misleading.

## Existing seams

`runView` resolves an artifact before its path-output branch and before document reading, formatting, or renderer
discovery. Editor handoff can use the same boundary. `resolveFurthestPresent` owns the tasks → spec → draft → meta
default; editor mode inherits it.

`resolveInteractionContext` supplies the existing interactive/noninteractive decision. The Git process adapter's
`applyInteractionEnvironment` sets `GIT_EDITOR=true` when terminal prompts are forbidden. Refuse editor mode before
editor selection so that synthetic setting is never interpreted as the person's preference.

[Git's `prepare_shell_cmd`][git-process] appends additional arguments through `"$@"` when a command needs shell
interpretation. The launcher's configured command can retain shell semantics while the artifact path stays data.
The editor configuration is an executable preference; filenames are not shell commands.

## Editor defaults

[Git][git-editor] uses its compile-time editor fallback, usually `vi`. Providing a fallback is also documented by
[kubectl][kubectl-editor], [chezmoi][chezmoi-editor], and [npm][npm-editor]; those tools use a platform default when
no preference is configured. Refusing solely because no preference exists would add setup friction. Delegating to
Git preserves an existing choice without maintaining a second precedence or fallback policy.

---

[gh-view]: https://cli.github.com/manual/gh_issue_view
[git-process]: https://raw.githubusercontent.com/git/git/v2.45.0/run-command.c
[git-editor]: https://git-scm.com/docs/git-var
[kubectl-editor]: https://kubernetes.io/docs/reference/kubectl/generated/kubectl_edit/
[chezmoi-editor]: https://www.chezmoi.io/reference/configuration-file/editor/
[npm-editor]: https://docs.npmjs.com/cli/v11/using-npm/config/

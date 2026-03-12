# User Directory

Personal workspace for each developer. Each `{identity}/` subdirectory is gitignored —
personal files stay local and travel across machines via git notes (`arc user save/load`).

## Structure

```text
user/
  README.md                    # This file (tracked)
  {identity}/                  # Gitignored personal workspace
    SESSION-NOTES.md           # Session context (all modes)
    ATOMIC-INBOX.md            # Task capture (arc-in-git only)
    ...                        # Freeform personal files
```

## Identity

Resolved from `git config arc.identity`. Fallback: slugified `git config user.name`.
Set during `arc init` or manually: `git config --local arc.identity yourname`.

## Adding Team Members

Create a new `user/{name}/` directory — no migration, no structural change.

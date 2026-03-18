# .arc-internal — Internal ARC Instance

This is the internal ARC instance used for developing the ARC Framework itself. Where `.arc/`
contains the deployable template system (what ships to adopters), `.arc-internal/` contains the
live working state for this project.

Same structure, different role: `.arc/` files are templates with placeholders; `.arc-internal/`
files are populated and actively maintained.

## Directory Structure

- **`active/`** — Current work: task lists, PRDs, and project status
- **`backlog/`** — Future work pipeline: roadmap, queued plans
- **`reference/`** — Stable project docs: constitution, strategies, ADRs, archives
- **`system/`** — Agent configuration, workflows, and framework settings
- **`user/`** — Per-developer session state (gitignored)

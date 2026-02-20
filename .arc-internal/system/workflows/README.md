# Workflows - Framework Development

Framework-specific workflow documentation for ARC development.

## Directory Structure

- **`arc/supplemental/`** - Framework-specific supplemental workflows
    - `session-init.md` - Framework development session initialization
- **`project/`** - Framework-project-specific workflows
    - `sync-cinexplorer-refinements.md` - Sync refinements from CineXplorer to framework
    - `sync-with-arc-framework.md` - Sync framework updates to adopting projects

## Core Workflows

Core ARC workflows (define-constitution, create-prd, generate-tasks, process-task-loop) are maintained
in the template system and should be referenced from `.arc/system/workflows/arc/`:

- [define-constitution.md](../../../.arc/system/workflows/arc/setup/define-constitution.md)
- [1_create-prd.md](../../../.arc/system/workflows/arc/1_create-prd.md)
- [2_generate-tasks.md](../../../.arc/system/workflows/arc/2_generate-tasks.md)
- [3_process-task-loop.md](../../../.arc/system/workflows/arc/3_process-task-loop.md)

## Supplemental Workflows

Standard supplemental workflows are also in `.arc/system/workflows/arc/supplemental/`.
Only framework-specific supplemental workflows live in this directory.

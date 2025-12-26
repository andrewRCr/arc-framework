# Workflows - Framework Development

Framework-specific workflow documentation for ARC development.

## Directory Structure

This directory contains workflow documentation specific to framework development:

- **`supplemental/`** - Framework-specific supplemental workflows
    - `session-init.md` - Framework development session initialization
    - `sync-cinexplorer-refinements.md` - Sync refinements from CineXplorer to framework
    - `sync-with-arc-framework.md` - Sync framework updates to adopting projects

## Core Workflows

Core ARC workflows (define-constitution, create-prd, generate-tasks, process-task-loop) are maintained
in the template system and should be referenced from `.arc/reference/workflows/`:

- [0_define-constitution.md](../../.arc/reference/workflows/0_define-constitution.md)
- [1_create-prd.md](../../.arc/reference/workflows/1_create-prd.md)
- [2_generate-tasks.md](../../.arc/reference/workflows/2_generate-tasks.md)
- [3_process-task-loop.md](../../.arc/reference/workflows/3_process-task-loop.md)

## Supplemental Workflows

Standard supplemental workflows are also in `.arc/reference/workflows/supplemental/`.
Only framework-specific supplemental workflows live in this directory.

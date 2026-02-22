# Workflows - Framework Development

Framework-specific workflow documentation for ARC development.

## Directory Structure

- **`arc/supplemental/`** - Framework-specific supplemental workflows
    - `session-init.md` - Framework development session initialization
- **`project/`** - Framework-project-specific workflows
    - `sync-cinexplorer-refinements.md` - Sync refinements from CineXplorer to framework
    - `sync-with-arc-framework.md` - Sync framework updates to adopting projects

## Core Workflows

Core ARC workflows (setup, create-prd, generate-tasks, process-task-loop) are maintained
in the template system and should be referenced from `.arc/system/workflows/arc/`:

- [setup/01_initialize-arc.md][init-arc] + [setup/02_define-project.md][define-project]
- [1_create-prd.md][create-prd]
- [2_generate-tasks.md][generate-tasks]
- [3_process-task-loop.md][process-task-loop]

## Supplemental Workflows

Standard supplemental workflows are also in `.arc/system/workflows/arc/supplemental/`.
Only framework-specific supplemental workflows live in this directory.

---

[init-arc]: ../../../.arc/system/workflows/arc/setup/01_initialize-arc.md
[define-project]: ../../../.arc/system/workflows/arc/setup/02_define-project.md
[create-prd]: ../../../.arc/system/workflows/arc/1_create-prd.md
[generate-tasks]: ../../../.arc/system/workflows/arc/2_generate-tasks.md
[process-task-loop]: ../../../.arc/system/workflows/arc/3_process-task-loop.md

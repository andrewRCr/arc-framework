# Project Overview

This directory contains the ARC Agentic Development System, a documentation-only framework for structured, hands-on
AI-human software development. The system is designed to be copied into other projects to provide a consistent and
reusable set of development processes and templates.

## AI Instructions

This file provides a general overview of the project. For more specific instructions on how to interact with the project
as an AI agent, please refer to the `AI-SHARED.md` file in this directory.

## Key Files and Directories

* `README.md`: The main entry point for understanding the project, its philosophy, and high-level structure.
* `ADOPTION.md`: Provides detailed instructions on how to adopt and upgrade the ARC system in your own projects.
* `_docs/`: The core of the system, containing workflows, reference docs, and examples intended to be copied into other projects.
* `__docs_internal/`: A directory for the internal development of the ARC system itself.
  It contains development rules, project status, and other internal documentation.
* `_docs/workflows/`: Contains Markdown files that describe various development workflows, such as creating PRDs,
  generating tasks, and managing commits.
* `templates/`: A collection of templates for key project documents, such as:
  * `META-PRD.template.md`
  * `PROJECT-STATUS.template.md`
  * `TECHNICAL-ARCHITECTURE.template.md`
* `profiles/`: Optional stack overlays that extend the baseline development rules for specific environments.
* `__docs_internal/DEVELOPMENT-RULES.md`: Defines the development rules, standards, and commands for working on the ARC
  system itself.

## Usage

The primary use of this directory is to serve as a source for the ARC system.
The `_docs/` directory should be copied into a target project to establish the development framework.

### Development Commands

The main development command is for linting the Markdown files to ensure consistency and correctness.

**Markdown Linting:**

```bash
npx markdownlint-cli2 "**/*.md" "!__docs_internal/notes/**" "!__docs_internal/CURRENT-SESSION.md" "!_docs/notes/**"
```

**Auto-fix formatting issues:**

```bash
npx markdownlint-cli2 --fix "**/*.md" "!__docs_internal/notes/**" "!__docs_internal/CURRENT-SESSION.md" "!_docs/notes/**"
```

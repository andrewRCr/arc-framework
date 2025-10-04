# Adoption Guide

This repo provides the ARC (Agentic Recursive Coordination) system - a structured framework for coordinated AI-human development. The system emphasizes directed collaboration with constant human oversight, serving as an alternative to unstructured "vibe coding" approaches.

The reusable system lives under `/_docs`.

Recommended flow:

1. Copy the entire `_docs` folder into your project as `_docs`
2. Instantiate templates from `_docs/templates` into their target locations
3. Replace UPPER_SNAKE tokens (e.g., `{{PROJECT_NAME}}`, `{{DEFAULT_BRANCH}}`)
4. Optionally apply a profile (`_docs/profiles/...`) by merging its commands into your local DEVELOPMENT-RULES
5. Delete or keep `*.example.md` as learning aids

Token catalog (starter): `{{PROJECT_NAME}}`, `{{PRIMARY_STACK}}`, `{{DEFAULT_BRANCH}}`, `{{FEATURE_BRANCH_PREFIX}}`, `{{DOCKER_COMPOSE_FILE}}`, `{{BACKEND_TEST_CMD}}`, `{{FRONTEND_TEST_CMD}}`, `{{BACKEND_LINT_CMD}}`, `{{FRONTEND_LINT_CMD}}`, `{{TS_TYPECHECK_CMD}}`, `{{MARKDOWN_LINT_CMD}}`

---

## Upgrade Guide

You can keep projects aligned with system updates in several ways.

### 1) Copy-based adoption (simple)

- Use a diff tool to compare your project’s `_docs` with this repo’s `_docs` and selectively copy updates.
- Recommended cadence: when you tag new versions of this repo (see `SYSTEM-VERSION.md` + `CHANGELOG.md`).

### 2) Submodule (managed linkage)

- Add this repo as a submodule (replace with your published URL or fork):
  - `git submodule add -b main {{ARC_SYSTEM_REPO_URL}} vendor/arc-agentic-system`
  - `git submodule update --init --recursive`
- Pull updates later:
  - `git -C vendor/arc-agentic-system fetch origin`
  - `git -C vendor/arc-agentic-system checkout main`
  - `git -C vendor/arc-agentic-system pull --ff-only`
- Copy desired changes from `vendor/arc-agentic-system/_docs` into your project’s `_docs`.

### 3) Git subtree (no submodule overhead)

- Add subtree (one-time):
  - `git subtree add --prefix vendor/arc-agentic-system {{ARC_SYSTEM_REPO_URL}} main --squash`
- Pull updates later:
  - `git subtree pull --prefix vendor/arc-agentic-system {{ARC_SYSTEM_REPO_URL}} main --squash`
- Copy desired changes from `vendor/arc-agentic-system/_docs` into your project’s `_docs`.

### Line endings

A `.gitattributes` is included to normalize line endings across platforms. For existing projects, run:

- `git add --renormalize .`
- `git status` to review changes
- then commit (after your quality checks and review)

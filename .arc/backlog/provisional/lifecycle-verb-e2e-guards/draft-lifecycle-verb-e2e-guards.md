# Draft: Lifecycle Verb E2E Guards

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-10-09); captured during `quality-gate-hooks` draft close,
  2026-10-07 (first captured during `decompose-matrix` Phase 5, 2026-06-21).
- **Purpose:** Keep the next destructive lifecycle verb from shipping without a test that drives it through the CLI.

---

## Problem / Motivation

The `decompose@planning` and `park@Planning` self-teardown defect shipped uncaught because
integration tests called the verb cores (`runDecompose`, `runPark`) with hand-fed cross-worktree inputs the CLI
never generates, and no E2E test drove those verbs through the CLI. E2E coverage now exists for decompose, park,
abandon, and `teardown --force` (checked at `c009ab198`); nothing keeps the next destructive verb from shipping
without it.

`testing-standards` already states the rule — a destructive verb requires real-CLI end-to-end coverage, and
integration tests drive verb cores through CLI-generated inputs. Nothing enforces it.

## Direction

Candidate guards — an E2E-coverage requirement for new lifecycle and destructive verbs, and a lint
flagging integration tests that assert on core call arguments instead of CLI-seam outcomes. The bug class to close:
a test constructs inputs the production path never generates.

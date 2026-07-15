# Metadata: commit-message-submission

| **State**     | **Owner** | **Branch**                       | **Class** | **Priority** |
| ------------- | --------- | -------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/commit-message-submission` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-commit-message-submission.md`
- **Task List:** `tasks-commit-message-submission.md`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Open the PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

ARC commit-message validation now uses one TypeScript implementation across standalone checks, installed hooks, and
release-wrapper preflight. Deterministic multiline messages can be submitted through byte-preserving file or stdin
transport, rejected before staged-content hooks when invalid, and reused from a private worktree-local retry file when
Git later fails.

### Added

- `arc check commit-msg` validates message files or stdin with stable human, JSON, and exit-code contracts.
- Release-commit preflight validates deterministic `-m` and `-F` sources before Git starts and preserves approved
  message bytes for exact retry after a later Git failure.

### Changed

- The installed `commit-msg` hook now delegates local-first to the versioned CLI while retaining cheap disabled and
  merge exemptions and failing closed when enabled validation cannot resolve a CLI.
- Release-commit file and stdin sources are captured once for both validation and Git transport, and release audit
  entries use schema version 2 with a typed preflight-refusal outcome.

### Fixed

- Commit diagnostics identify exact message or configuration locations and suggest focused legal `Context:` trailer
  forms instead of dumping the complete grammar.
- Hook installation and manager integration preserve executable policy and message-file paths, including repositories
  whose paths contain spaces.

### Security

- Release audit sanitization redacts commit-message payloads across supported option forms, and private snapshots and
  retry files use restrictive permissions with race-safe replacement and cleanup.

## Completion Notes

Commit-message enforcement now has one canonical parser and policy layer shared by `arc check commit-msg`, installed
hook delegation, and in-process release-wrapper preflight. The validator preserves the existing three-valued policy,
adds typed findings and configuration failures, formalizes `Context:` as a final Git trailer, and isolates repository
artifact lookup behind an injectable resolver. The Bash grammar was retired only after the shared fixture corpus proved
parity apart from the five deliberate migration decisions recorded in the design.

The release wrapper now classifies deterministic message sources without guessing Git-owned grammar, validates exact
post-cleanup bytes before Git begins, and transports captured file or stdin content without reopening mutable inputs.
Approved messages survive later Git failures in a private worktree-local retry file; successful consumption removes
only the generation that was actually read. The same change cut the release audit schema to version 2, added refusal
code 16, strengthened message redaction and destructive-flag parsing, synchronized hook installation and manager
forwarding, and made safe multiline submission discoverable in the durable commit guidance.

Implementation stayed within the designed scope. Review-driven follow-through hardened trailer boundaries, artifact
resolution, diagnostics, process environments, transport failures, retry locking and generation identity, option
parsing, and regression timeouts without changing the settled public contract. Final-head Markdown, TypeScript, and
shell linting, source and test typechecks, build, and the full test suite passed: 446 files passed with one skipped and
5,621 tests passed with one skipped. CodeRabbit's incremental review of that exact head reported no further actionable
findings, and all review threads are resolved.

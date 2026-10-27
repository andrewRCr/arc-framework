# Check repository fixtures

`repository.ts` creates a committed Git repository with a check declaration, source and documentation inputs, and a
command that records received file arguments. It leaves one source edit in the worktree so built-CLI tests can compare
request scopes and reuse against the same starting content. Each caller removes its repository after the test.
Its optional hook installer copies the shipped commit hook and installs a local wrapper for the qualified built CLI.

`nested-git.ts` supplies a declared-check program that commits in an independent temporary repository and records
the observed content and repository-local Git variable names. It removes its nested repository before exiting.

`hook-manager.ts` initializes committed source inputs through the built CLI, installs real Husky, Lefthook,
pre-commit.com, or native Git hooks, and supplies actual Git commit results and declared-check execution receipts.
Commit process overrides stay within each fixture; pre-commit.com's patch cache lives in its disposable Git directory.

`runner.ts` builds on the declared repository producer with captured source, explicit inputs, injectable source I/O and
an independent adapter-state directory. Callers register every owned directory for retry-safe `removeGitBackedDirs`
cleanup. Its default configuration launches the actual standalone local example; it adds no framework-private runtime
imports to that executable.

`prepared-execution.ts` supplies standalone scripted conversations over the same repository fixture. Valid singles and
groups run real children; selected modes inject preparation refusals, corruption, cancellation gates, runtime drift,
malformed frames or transport loss. Faulted groups close their one launched child before losing transport, preserving its
native outcome while leaving remaining required work incomplete.

`runner-protocol.ts` builds public-shaped plans and replies for schema and correlation cases. `runner-streams.ts` provides
reactive process streams for deterministic unit-level transport faults without child processes or Git repositories.
`source-manifest-vectors.ts` supplies independent canonical-manifest digest vectors.

`runner-machine.ts` writes an isolated machine-home runner configuration for real CLI subprocesses, keeping machine
settings and execution receipts outside the captured source repository.

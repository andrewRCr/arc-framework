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

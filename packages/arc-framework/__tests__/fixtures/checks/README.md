# Check repository fixtures

`repository.ts` creates a committed Git repository with a check declaration, source and documentation inputs, and a
command that records received file arguments. It leaves one source edit in the worktree so built-CLI tests can compare
request scopes and reuse against the same starting content. Each caller removes its repository after the test.

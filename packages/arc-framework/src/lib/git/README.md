# Git process boundaries

Git executors retain command, byte-output and interaction policies while scoping repository selection to each
caller's working directory. `process-executor.ts` exposes the shared repository selector set and supplied-environment
sanitizer.

`repository-environment.mjs` contains their dependency-free implementation so source entry points executed directly
by Node can share the same policy as the bundled CLI. Checked JSDoc supplies its TypeScript types under the package's
`allowJs`/`checkJs` settings, without a loader, package dependencies or a separate compilation step for those entry
points. Selector removal matches names case-insensitively for every Git child, as Windows environment lookup does.

`executable.mjs` names the executable each Git child starts, and is dependency-free for the same reason. On Windows,
when the first `git` on `PATH` is Git for Windows' `cmd\git.exe` launcher, it starts the binary that launcher would
start, saving a second process start on every call. Any other `git` found first keeps the bare name. So does a child
given `MSYSTEM`, for which the binary skips the setup the launcher always does, and a user whose home has a `bin`
directory, which the binary would put ahead of Git's own tools on `PATH`.

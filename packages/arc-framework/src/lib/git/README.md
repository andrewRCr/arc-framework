# Git process boundaries

Git executors retain command, byte-output and interaction policies while scoping repository selection to each
caller's working directory. `process-executor.ts` exposes the shared repository selector set and supplied-environment
sanitizer.

`repository-environment.mjs` contains their dependency-free implementation so source entry points executed directly
by Node can share the same policy as the bundled CLI. Checked JSDoc supplies its TypeScript types under the package's
`allowJs`/`checkJs` settings, without a loader, package dependencies or a separate compilation step for those entry
points. Selector removal matches names case-insensitively for every Git child, as Windows environment lookup does.

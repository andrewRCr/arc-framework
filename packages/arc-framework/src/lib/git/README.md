# Git process boundaries

Git executors retain command, byte-output and interaction policies while scoping repository selection to each
caller's working directory. `process-executor.ts` exposes the shared repository selector set and supplied-environment
sanitizer.

`repository-environment.mjs` contains their dependency-free implementation so source entry points executed directly
by Node can share the same policy as the bundled CLI. Its declaration companion supplies TypeScript types without
requiring a loader, package dependencies or a separate compilation step for those entry points.

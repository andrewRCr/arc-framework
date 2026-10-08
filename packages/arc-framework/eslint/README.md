# Architecture lint support

Module-local architecture predicates run through ESLint using its parsed TypeScript source.

Architecture bans live in the ESLint configuration as one table. Rooted directory scopes use
`**/*.{ts,tsx,cts,mts}`; exact files express narrower scopes and exceptions. Composition partitions those anchors
without enumerating current source files, so future modules receive every matching row's rules.

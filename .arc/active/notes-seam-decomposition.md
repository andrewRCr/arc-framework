# Notes: Seam Decomposition

## Corrections to the consumer map

The storage contract's consumer map (`notes-storage-contract.md`, archived) is not edited. Its decomposition rows were
re-verified against the code at `5b82bb851`, and these corrections stand here. Under the spec, a row matters only as
carried or deleted (§ 1.5, § 13).

- **Dead in production:** `git-decompose-v3-retirement-delta.ts` has no production importer — the delta is computed in
  `decompose-v3-repository-plan.ts` from trees already read; and `repointDependsOn` (`decompose-sweep.ts`) has no
  production caller, though its import is that file's `store-raw-state` floor entry.
- **Not decomposition's:** `git-decomposition-object-readers.ts` has no decomposition importer; its ten callers are
  delivery, review, integration, status, and session-init modules. Its row's owner, `storage-cutover`, stands.
- **Misread:** `git-decompose-v3-destination-validation.ts` does no Git I/O despite its name, and serves extraction's
  finish alone; `--finish` refuses a retirement map (`map:authoring-shape`, `git-decompose-v3-finish.ts`) rather than
  passing over it.
- **Not shared after all:** `seam-lifecycle` changed teardown's injected removal callback
  (`tryCleanupDecomposeCandidate`, `verbs/teardown.ts`), not `git-owned-decompose-candidate-cleanup.ts`, and teardown's
  store arm (`runStoreTeardown`) handles no candidate. The store version stages no candidate, so the file leaves with
  the in-repo arm.
- **Unrowed but coupled:** `handlers/decompose.ts`, `decompose-v3-operation.ts`, `decompose-transition-record.ts`,
  `decompose-v3-repository-projections.ts`, `decompose-v3-materializer.ts`, `decompose-v3-finish-operation.ts`,
  `decompose-result-occupation.ts`, `decompose-candidate.ts`, and the candidate cleanup. `decompose-candidate.ts` has
  callers outside the machine: teardown and `lib/git/in-flight-derivation.ts`.
- **Sharer missing:** `terminal-transition-record-writer.ts`'s row names no sharer, though decomposition
  (`decompose-v3-operation.ts`, `git-decompose-v3-operation.ts`) and lifecycle (`verbs/abandon.ts`, `verbs/rename.ts`,
  `handlers/lifecycle.ts`, `commands/rename.ts`) both import it.

---

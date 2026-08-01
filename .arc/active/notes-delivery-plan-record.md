# Notes: delivery-plan-record

- [Verified substrate facts](#verified-substrate-facts)
- [Claims that did not hold](#claims-that-did-not-hold)
- [Field-evidence anchors](#field-evidence-anchors)

---

## Verified substrate facts

Each was checked against source during spec authoring. Line anchors are as of the base merged at spec time; treat
them as starting points rather than guarantees, but the facts themselves gated design decisions.

**Schema kernel.** `strict-current` is a real registered `MigrationPosture`, not a phrase — `lib/kernel/schema/`
`registry.ts` defines the union and validates it at registration, and the posture is registered widely across the
session-envelope, layout, validation-surface, and review-gate roots. Canonical serialization sorts keys by UTF-8
byte order via `Buffer.compare` (explicitly not `localeCompare`), which is what makes the digests byte-stable.
Domain-separated preimages are pervasive: strict Zod objects carrying a `domain: z.literal(...)` field parsed
before digesting, with roughly fifteen distinct domains already in use.

**The local record store.** `RepositoryGitCommonStatePublisher` resolves its root through
`git rev-parse --git-common-dir`, so every linked worktree agrees on the path and checkout relocation cannot move
it. It takes a bounded-wait advisory lockfile, reads, applies, and writes through a temp-file rename. The store
above it refuses a stale `expectedVersion` with a typed `version-conflict`.

Four properties bound how much of this delivery can reuse:

- the publisher hardcodes a `<git-common-dir>/arc/review-gate/<namespace>` root;
- its namespace type is a **closed** five-member union of review names;
- the store above it is typed to review operation state;
- it lives under the scripts tree, and the library tree does not import from there (zero imports; the dependency
  runs the other way).

So the reuse is a pattern plus a concurrency model, not a callable class. The compare-and-swap is an **integer
revision counter** with no predecessor pointer anywhere in it, and the store holds **one record per name** — which
is why only the assurance store's publication shape is priced as new work.

**Ref namespaces get nothing for free.** No `remote.*.fetch` refspec is ever written by any install or join path,
and the previously shipped notes refspec was deliberately removed. Refs under `refs/arc/**` therefore do not arrive
on a clone or on any ordinary fetch or pull. The only working cross-machine record transport is the notes shape: an
explicit named fetch into a unique temp ref with `--refmap=`, an ancestry classification, and a compare-and-swap
`update-ref` onto the live ref, driven by a dedicated command. The pushed `refs/arc/**` refs that do exist are
identity-partitioned, and the sync-state one is written and pushed but **never fetched to be read** — its own module
doc describes a sibling-clone scenario no transport in the codebase delivers.

**Work-unit identity is the slug.** The metadata record carries no identity field; the active unit's name is
recovered from its artifact path. `arc rename <slug> <new-slug>` ships and renames a work unit "and its branch,
workspace, remote, marker, and worktree identities" while the unit is live.

**Rename evidence is forward-keyed and ref-scoped.** A rename writes a retirement receipt keyed on the **old** slug
as its subject, carrying the new one as `result.targetSlug`. The disposition query matches on the subject, so a
query keyed on a unit's current name matches nothing. Receipts are **tracked** content under
`.arc/system/.internal/retirement-receipts/` enumerated with `git ls-tree` against a ref, so visibility depends on
which ref is read. A transitive resolver with cycle detection already exists and returns a closed result set;
rename preflight refuses only a self-rename and checks only live occupancy of the target, so an `A → B` then
`B → A` cycle is accepted and both receipts stand.

**Completion protocol.** `Goal` is preserved verbatim at completion. `Outcome` is a second protected surface but is
**added** at completion and only when it earns signal, so it is absent from authoring-time state. `Goal` is required
on parents and opt-in, default-absent on subtasks, and the formatting standard's own diagnostic pushes toward
dropping noise-shaped subtask goals. No rule anywhere directs a title change at completion.

**Commit-footer attribution.** The task-reference grammar is two-level only — single, range, non-contiguous — and
does not mention subtasks. Real practice has outrun it: a clear majority of recent task-naming footers carry a
deeper id, dominated by letter-suffixed subtask forms, and the revision family (`X.Y.R` at subtask level, `X.R` as a
phase-level follow-on, with their own children) is live. `X.R` resolves to no parent implementation task, which is
why unresolvable references are advisory on the derived entry.

## Claims that did not hold

The design repeatedly rested on substrate guarantees it had asserted rather than established. Four were caught
during drafting; several more during spec authoring. The pattern is worth carrying into implementation: **check the
substrate before writing the sentence that depends on it.**

Corrected during spec authoring:

- `refs/arc/**` was described as a **shared** tenancy. Every pushed ref under it is identity-partitioned, and no
  project-scoped pushed namespace exists. This is what moved storage to a local-only v1.
- The completion protocol was said to direct a **title update** at completion. No such rule exists anywhere.
- The footer contract was said to admit **subtask-granular ids**. The shipped grammar is two-level only.
- Rename resolution was first specified in the direction that **cannot find the plan** — querying by the current
  name, which is a receipt's target and never its subject.
- The plan record was given a `landed` discriminant whose refusal required a **landing observation the constructor
  cannot see**, contradicting the rule that host-derived position is not writable state.

Two identities were removed as unsupported machinery after failing a goal-to-mechanism trace — a stored intermediate
chunk identity and a stored seam identity — each a registered preimage and a durable schema commitment with no
reader. When adding an identity, name its consumer first.

## Field-evidence anchors

**The two hand-run cuts the success signal round-trips.** The seven-slice stack plus its terminal merge is fully
shipped; its slice branches have since been reaped, so base and head pairs must be reconstructed from the recorded
merge parents. The thirteen-slice cut's branches still exist locally.

**A base merge sits inside a delivery slice.** Commit `a0e6d1533` — "Merge current base into legacy delivery" — is a
genuine two-parent merge inside slice 06 of the shipped stack, and its second parent is the previous slice's merge
into the base. This is the concrete case that forces the partition to run over work-unit-owned contribution along
the first parent rather than over raw commits, and any implementation of the retrofit entry should use it as a test
fixture rather than a hypothetical.

**Attribution is sparse by design, not by accident.** A substantial minority of a branch's commits name no task at
all — review-driven fixes above all — and the footer contract blesses `code review`, `maintenance`, and
`incidental during …` alongside a task reference. A member whose range is mostly review fixes deriving no task ids
is a valid member, not a composition failure.

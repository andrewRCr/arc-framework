# Draft: cli-layout-resolver

- **Origin:** [internal]
- **Cohort:** `cli-substrate-adoption`
- **Purpose:** Replace repeated ARC path construction with one typed projection authority while preserving the
  current layout and keeping storage, lifecycle, discovery, and worktree policy outside that authority.
- **Readiness:** `formalization-ready` — the contract, owner boundaries, caller-shape reconciliation, and
  forward-compatibility checks are settled; exhaustive per-hit ledger production is downstream grounding work.

---

## Problem / Motivation

ARC layout knowledge is repeated across code and tests. Callers concatenate directory names, lifecycle placements,
artifact prefixes, user-document names, and template suffixes directly. A layout or naming change therefore has a
large blast radius, and invalid path operands can reach filesystem or Git boundaries before they are rejected.

The immediate goal is not to change the layout or create a storage backend. It is to establish one typed projection
boundary for the concrete path classes identified by the coupling audit. That boundary should also be usable by a
future materializer, without pretending that path projection is the future storage abstraction itself.

## Goals

- Own the validated layout-token and semantic-address schemas for the audited ARC path classes.
- Resolve semantic addresses to canonical, repository-relative `ManagedPath` values without filesystem or Git I/O.
- Convert a managed path to a native absolute filesystem path only through an explicit caller-supplied root.
- Migrate the audited semantic production and test callers away from reproducing the covered layout rules.
- Preserve current path behavior and reject unsafe or structurally invalid operands instead of normalizing them.
- Reconcile the audit's tracked-planning Git-operation packet against the shipped Git executor and current procedure
  boundaries without inventing a second Git adapter.

## Non-Goals

- Move an artifact, rename a document, or change the current directory layout.
- Implement a storage backend, artifact repository, virtual filesystem, or version-checked write port.
- Infer lifecycle state, discover work units, choose a completion sequence, parse cohort policy, select a primary
  worktree, or check whether a path exists.
- Reverse-parse exact paths returned by discovery, record, or pointer owners merely to reconstruct an address.
- Generalize every filesystem path in the CLI. The audited classes and the composition required to resolve them are
  the migration boundary.
- Rewrite procedure prose merely to remove literals. A procedure migrates when an owning CLI verb replaces its
  mechanics.

## Design Decisions

### Pure projection boundary

The resolver sits between semantic authorities and effectful consumers:

```text
lifecycle / cohort / completion / user-root authority
                        |
                        v
               validated layout address
                        |
                        v
              resolveArcPath(address)
                        |
                        v
        repository-relative POSIX ManagedPath
                        |
                        v
       materializeArcPath(root, managedPath)
                        |
                        v
                filesystem / Git / store
```

`resolveArcPath` is pure and synchronous. It has no `cwd`, filesystem, Git executor, clock, environment lookup,
existence probe, or worktree-topology dependency. `materializeArcPath` is a small platform adapter: the caller
supplies the root selected by its own policy, and the adapter produces the native absolute path used for filesystem
I/O. Git and persisted contracts keep the canonical `ManagedPath` instead of native separators.

This separation is load-bearing. For example, current user-surface policy decides that identity-global files use
the primary worktree while per-WU session notes use the current worktree. The layout module renders either address;
it does not make that root-selection decision.

### Ownership map

| Concern | Authority | What layout receives |
| --- | --- | --- |
| WU and cohort segment grammar | Kernel `SlugSchema` plus the cohort semantic owner | Branded `Slug` segments |
| Lifecycle state and path interpretation | Lifecycle modules | An explicit physical placement descriptor |
| Cohort nesting rules and record-field parsing | Cohort modules | Zero to two validated cohort segments |
| Archive coordinate selection | Completed-index/archive modules | Validated quarter and sequence operands |
| Current-vs-primary worktree selection | User-surface resolver | The selected materialization root |
| I/O, scans, existence, and Git effects | Calling subsystem or later storage port | A managed or materialized path |
| Layout tokens and projections | This work unit | N/A — owned and registered here |

The kernel contributes neutral `Slug`, `ManagedPath`, `ArcError`, `Result`, and registry primitives. It does not own
placements, prefixes, suffixes, subsystem record identities, or the layout address union. This drains the prior
inbound ownership correction and matches the shipped kernel and cohort contracts.

### Schema and registry contract

The exported schema/type pairs are fixed as follows:

- `ArcPlacementTierSchema` / `ArcPlacementTier`: `active | planned | provisional | completed`;
- `WorkUnitArtifactKindSchema` / `WorkUnitArtifactKind`: `meta | draft | spec | tasks | notes`;
- `ProcedureFamilySchema` / `ProcedureFamily`: `methods | workflows`;
- `ArchiveQuarterSchema` / `ArchiveQuarter`: branded `YYYY-q[1-4]`;
- `ArchiveSequenceSchema` / `ArchiveSequence`: branded `01`–`09`, then unbounded non-zero decimal values;
- `WorkUnitPlacementSchema` / `WorkUnitPlacement`: the physical placement union below;
- `TemplateRelativePathSchema` / `TemplateRelativePath`: a branded, forward-slash, non-empty relative path with
  the same lexical safety invariants as `ManagedPath`, but relative to the package template root;
- `TemplateOutputPathSchema` / `TemplateOutputPath`: the separately branded result of the template transform; and
- `ArcLayoutAddressSchema` / `ArcLayoutAddress`: the complete strict discriminated address union below.

`ArchiveSequenceSchema` uses `^(?:0[1-9]|[1-9][0-9]+)$`: it rejects `00`, unpadded `1`–`9`, and redundant
leading zeroes while preserving the completed-index owner's current `padStart(2, "0")` output. Both template
path schemas reject empty, absolute, drive-prefixed, backslash, NUL, empty-segment, dot-segment, malformed-Unicode,
and non-NFC values. They are different brands even though they share that lexical grammar because only the output
brand names the post-transform role; the public output schema still validates any value explicitly parsed through
it, so callers do not treat branding as provenance.

Record identities continue to use their semantic owners. In particular, a generic safe path segment is a projection
operand, not a new identity type. User identities already generated by ARC satisfy the kernel `SlugSchema`; direct
`arc.identity` values must be validated by the identity owner before layout receives the branded slug.

This work unit forward-migrates that owner boundary rather than inventing a layout-specific identity adapter.
`resolveIdentity` returns `Promise<Slug | null>`: values derived from `user.name` or interactive input are slugified
and parsed through `SlugSchema`, while an existing `arc.identity` is parsed without normalization. A present invalid
configured value throws `UserFacingError` with this exact owner-side contract:

```ts
{
  code: "identity.invalid",
  whatHappened: "Configured ARC identity is invalid",
  why: "arc.identity must be a lowercase alphanumeric slug whose segments are separated by single hyphens.",
  whatToDo: "Set a valid identity with:\n    git config --local arc.identity <identity>",
}
```

Missing identity remains `null`, preserving callers' existing missing-vs-present flow. Because `Slug` is a branded
string subtype, successful callers need no parallel result union; invalid configuration propagates through the
existing `UserFacingError` boundary and is never misreported as missing or as `layout.invalid-address`.

The stable registry identity map is also part of the public contract:

```ts
export const LAYOUT_SCHEMA_IDS = {
  address: "layout-address",
  archiveQuarter: "layout-archive-quarter",
  archiveSequence: "layout-archive-sequence",
  artifactKind: "layout-artifact-kind",
  placementTier: "layout-placement-tier",
  procedureFamily: "layout-procedure-family",
  templateOutputPath: "layout-template-output-path",
  templateRelativePath: "layout-template-relative-path",
  workUnitPlacement: "layout-work-unit-placement",
} as const;
```

`createLayoutRegistry()` starts from a fresh kernel registry and registers exactly those nine independently
consumable roots at version `1` with `strict-current` migration posture. Private schemas used only inside the
address union do not acquire parallel registry identities. Registration does not publish these schemas in the
kernel JSON Schema bundle; publication remains a separate build decision, matching the shipped session-envelope
precedent.

### Semantic address algebra

All object schemas are strict. `WorkUnitPlacementSchema` is discriminated by `kind` and has these exact fields:

```ts
type WorkUnitPlacement =
  | { readonly kind: "active" }
  | {
      readonly kind: "backlog";
      readonly commitment: "planned" | "provisional";
      readonly cohort: readonly Slug[]; // required, length 0..2
    }
  | {
      readonly kind: "completed";
      readonly quarter: ArchiveQuarter;
      readonly sequence: ArchiveSequence;
    };
```

The public address union is discriminated by `kind` and has these exact fields:

```ts
type ArcLayoutAddress =
  | { readonly kind: "arc-root" }
  | { readonly kind: "placement-root"; readonly tier: ArcPlacementTier }
  | { readonly kind: "work-unit-container"; readonly placement: WorkUnitPlacement; readonly slug: Slug }
  | {
      readonly kind: "work-unit-artifact";
      readonly placement: WorkUnitPlacement;
      readonly slug: Slug;
      readonly artifact: WorkUnitArtifactKind;
    }
  | {
      readonly kind: "cohort-document";
      readonly cohort: readonly [Slug] | readonly [Slug, Slug];
      readonly placement:
        | { readonly kind: "planned" }
        | {
            readonly kind: "completed";
            readonly quarter: ArchiveQuarter;
            readonly sequence: ArchiveSequence;
            readonly closeout: "leaf" | "parent";
          };
    }
  | { readonly kind: "procedure-root"; readonly family: ProcedureFamily }
  | { readonly kind: "project-document"; readonly document: "roadmap" }
  | {
      readonly kind: "user-document";
      readonly identity: Slug;
      readonly document:
        | { readonly kind: "session-notes"; readonly workUnit: Slug }
        | { readonly kind: "working-memory" };
    };
```

Container projection preserves each current shape: active returns the shared flat `.arc/active` container; backlog
includes any cohort segments and the WU slug; completed includes the quarter and `{sequence}_{slug}` archive entry.
The caller always supplies the slug even though active's container is shared, so the same descriptor can resolve the
artifact path without rediscovering identity.

The backlog commitment accepts both `planned` and `provisional` so the physical model is complete. Requiring an
explicit empty `cohort` array keeps the wire shape canonical instead of defaulting a missing field during parse.
The audit's `provisional-placement` caller migration remains outside the 15-class packet and must be accounted for
separately by its existing lifecycle owner; supporting the value here does not silently absorb that migration.

For completed cohort closeouts, the archive owner supplies the semantic closeout level (`leaf` or `parent`) plus the
quarter, sequence, and the target document's validated cohort coordinate. A parent closeout therefore supplies the
parent coordinate, not the member's original nested coordinate. Layout alone maps `leaf` to the `a` archive suffix,
`parent` to `b`, and the coordinate's last segment to the `cohort-{slug}.md` name. Procedure-root resolution
similarly stops at the `methods` or `workflows` root; procedure identity and any nested `arc/` layout remain with the
procedure subsystem.

The projections are fixed to the current layout:

| Address | Projection |
| --- | --- |
| ARC root | `.arc` |
| Placement root | `.arc/active`, `.arc/backlog/{planned\|provisional}`, or `.arc/completed` |
| Active WU container | `.arc/active` |
| Backlog WU container | `.arc/backlog/{commitment}/{cohort...}/{slug}` |
| Completed WU container | `.arc/completed/{quarter}/{sequence}_{slug}` |
| WU artifact | `{container}/{artifact}-{slug}.md` |
| Planned cohort document | `.arc/backlog/planned/{cohort...}/cohort-{last}.md` |
| Completed cohort document | `.arc/completed/{quarter}/{sequence}{a\|b}_cohort-{last}/cohort-{last}.md` |
| Procedure root | `.arc/system/{family}` |
| Project readiness document | `.arc/backlog/ROADMAP.md` |
| Per-WU session notes | `.arc/user/{identity}/{workUnit}/SESSION-NOTES.md` |
| Identity-global working memory | `.arc/user/{identity}/WORKING-MEMORY.md` |

Template binding is a companion validated-path transform rather than an ARC-address variant. It exports
`TEMPLATE_BINDING_SUFFIX = ".template"` and applies the current
`templatePath.replace(/\.template(\.[^/]+)$/, "$1")` rule exactly. Templated and untemplated paths are both valid
inputs, so the transform preserves current copy-as-is behavior and leaves classification/rendering policy with the
template subsystem.

The transform does **not** brand its value as `ManagedPath`: existing inputs are relative to the package template
root, not necessarily the repository root that `ManagedPath` semantically denotes. It owns a narrow validated
template-source/template-output path type instead. A caller that projects the output into a repository still resolves
that destination through the appropriate ARC address or its existing installer boundary.

The public surface is deliberately small:

- `resolveArcPath(address): ManagedPath`;
- `materializeArcPath(root, managedPath): string`;
- `resolveTemplateOutputPath(templatePath: string): TemplateOutputPath`;
- the nine schemas and inferred types named above;
- `LAYOUT_SCHEMA_IDS`, `TEMPLATE_BINDING_SUFFIX`, `LayoutError`, and `LayoutErrorCode`; and
- `createLayoutRegistry()`.

One-off convenience wrappers require demonstrated repeated use; the migration must not recreate the old scattering
as a resolver method per caller.

### Validation and failure behavior

The public schemas are the runtime authority. The exported functions throw a typed `LayoutError` rooted in
`ArcError`; they do not return `Result`, because these synchronous construction failures are invalid boundary input,
not an expected effect outcome. The locally exhaustive code contract is:

```ts
type LayoutErrorCode =
  | "layout.invalid-address"
  | "layout.invalid-template-path"
  | "layout.invalid-managed-path"
  | "layout.invalid-materialization-root";
```

`resolveArcPath` reparses the complete typed address defensively so JavaScript and unsafe casts cannot bypass the
schema. `resolveTemplateOutputPath` parses its string before applying the transform and validates the result under
the output brand. `materializeArcPath` revalidates the branded managed path and requires a non-empty, NUL-free,
well-formed, absolute native root; the caller must select that root explicitly, so the function never consults
ambient `cwd`. No function trims, slugifies, repairs separators, or collapses dot segments in an address or template
operand on behalf of a caller.

Valid resolution finishes by constructing a forward-slash path and validating it as `ManagedPath`. Invalid slug,
cohort shape, archive coordinate, placement, artifact kind, suffix shape, absolute operand, backslash, or traversal
input is rejected before an effect boundary.

Native materialization splits the managed path on `/` before resolving its segments under the validated root, so
canonical separators never leak into platform selection. The production export uses the host path implementation;
a non-published helper accepts POSIX or Windows path semantics for deterministic cross-platform unit tests. Neither
path performs filesystem I/O.

ARC-created identities already use the same lowercase-hyphen grammar as `SlugSchema`. A manually configured invalid
`arc.identity` is rejected under the owner-side contract above and is never automatically slugified or moved: silent
normalization could select a different user's directory. Layout defensively validates the branded operand as part of
the whole address but does not own the identity error.

### Audited class mapping

The 15 abstraction candidates map into the contract as follows:

| Audit classes | Owning contract |
| --- | --- |
| `arc-root` | Root address and all composed addresses |
| `active-placement`, `planned-placement`, `completed-placement` | Placement and container addresses |
| `meta-prefix`, `draft-prefix`, `spec-prefix`, `tasks-prefix`, `notes-prefix` | Artifact kind and filename projection |
| `method-root`, `workflow-root` | Procedure-root address |
| `roadmap-name` | Project-document address |
| `session-notes-name`, `working-memory-name` | User-document address |
| `template-suffix` | Template-output managed-path transform |

The coupling report's `388` for `arc-root` and `243` for `active-placement` are total per-class file fan-out, not
production/test reference counts. Scope is therefore measured from the digest-pinned class membership and evidence
records, then refreshed against current `HEAD`; the draft no longer treats those two fan-out values as a production
and test estimate.

### Migration ledger

The digest-pinned audit is the baseline, not a forever-current file list. Before task generation, refresh the 15
class memberships against current `HEAD` and produce one ledger entry per current hit:

- migrated to a semantic layout call;
- migrated at the selected ARC root while an unselected subsystem-relative suffix remains with its semantic owner;
- retained as an exact pre-resolved path or custom pointer supplied by a discovery, record, or configuration owner;
- retained as the layout module's single token or projection definition;
- retained in a semantic owner because it interprets policy rather than constructs a path;
- classified as a scanner false positive with its evidence retained;
- retained as independent test-oracle, fixture, documentation, or template evidence; or
- out of scope with a named owning work unit or cohort-tail destination.

New hits are classified rather than silently appended. Removed hits are recorded as already converged. The final
migration test asserts the allowed residual set, so the tail member can distinguish deliberate ownership from an
unnoticed leftover.

A lightweight replay of the audit's exact class patterns against `b46732a8b` confirms meaningful but bounded drift:
the corpus grew from 1,225 to 1,297 tracked files, and most additions come from the shipped session-envelope fixtures
and the new semantic `view` surface. This replay refreshes class file membership, not the audit's broader candidate
dispositions; the implementation ledger still needs the full evidence-level classification.

| Class | Audit files | Current files | Net |
| --- | ---: | ---: | ---: |
| `arc-root` | 388 | 406 | +18 |
| `active-placement` | 243 | 261 | +18 |
| `planned-placement` | 91 | 98 | +7 |
| `completed-placement` | 86 | 87 | +1 |
| `meta-prefix` | 210 | 220 | +10 |
| `tasks-prefix` | 76 | 87 | +11 |
| `draft-prefix` | 82 | 82 | 0 |
| `spec-prefix` | 60 | 63 | +3 |
| `notes-prefix` | 45 | 45 | 0 |
| `roadmap-name` | 44 | 44 | 0 |
| `session-notes-name` | 58 | 63 | +5 |
| `working-memory-name` | 37 | 46 | +9 |
| `workflow-root` | 60 | 63 | +3 |
| `method-root` | 42 | 42 | 0 |
| `template-suffix` | 24 | 26 | +2 |

The evidence-level caller-shape reconciliation introduces no further address variant:

- **Semantic construction** — lifecycle verbs, archive destinations, cohort closeouts, conventional WU companions,
  procedure roots, roadmap, and selected user documents can supply the address fields above and migrate directly.
- **Root-only composition** — installers, config readers, hooks, and commands that own an unselected descendant may
  resolve `arc-root`, then compose and validate their own subsystem-relative suffix. Layout does not export a generic
  descendant-join escape hatch. For example, `arc view --project inbox` owns the unselected `ATOMIC-INBOX.md` suffix;
  that `arc-root` hit does not add an inbox address variant to this 15-class contract.
- **Pre-resolved paths and pointers** — discovery outputs, lifecycle-index entries, manifest outputs, and configured
  task-list pointers remain authoritative. Callers do not reverse-parse them merely to route through layout. When a
  caller must project a conventional sibling, its adapter carries the structured placement coordinate alongside the
  exact pointer; the pointer still wins for the artifact it names.
- **Recognition rather than construction** — lifecycle scanners, policy gates, and migration checks may need to
  recognize current layout tokens. Their semantic interpretation remains with the reader; where practical they derive
  comparison prefixes from layout projections, but they do not move lifecycle or policy meaning into layout.
- **Non-semantic hits** — import paths such as `../active/...`, prose examples, expected-path golden strings, and
  template fixtures remain independent evidence rather than becoming resolver calls.

Two current viewer/index edge cases sharpen that rule. Both production callers of
`buildLifecycleIndexFromRecords` pass the record's exact `source.path`; its pathless flat fallback is only a synthetic
record/diagnostic projection and cannot identify cohort or archive coordinates, so it stays lifecycle-index-owned and
does not become a lossy address variant. The `arc view` target likewise preserves its exact discovered `metaPath` and
custom task-list pointer. Its adapter supplies active or backlog placement data only when resolving conventional
siblings; it never recomputes the pointer or infers placement by parsing the path backward.

### Tracked-planning Git-operation packet

The audit packet is a four-file **evidence set**, not a required four-file runtime adapter:

- `strategy-work-planning.md` describes a direct `git rm` mechanic;
- `pre-commit` uses direct `git diff` reads for hook enforcement;
- `activate-work-unit.md` performs the direct `git rm` mechanic; and
- `relocate-artifacts.ts` discusses `git mv` and now executes moves through the shipped injectable `GitExec` seam.

The current draft's proposed resolver/contract-test/Git-adapter/integration-test packet had no source in the audit
and would duplicate the shipped executor. It is removed.

This work unit must reconcile all four evidence files, but only path construction belongs automatically to layout.
The TypeScript relocation effect already uses the cohort's executor contract. The procedure/strategy pair should
move together when an owning lifecycle verb replaces the mechanic. The hook's read-only Git inspection must either
be justified as hook-owned enforcement or routed to an existing CLI check; wrapping it in a layout-specific adapter
would not improve the boundary.

Current disposition: retain the hook's direct index inspection as hook-owned enforcement; it is neither a reusable
TypeScript Git-execution seam nor a layout effect. Route the workflow's residual draft cleanup and the strategy prose
that describes it to `composable-workflows`, whose code-tier verb adoption owns removal of deterministic mechanics
from procedure. The cohort tail verifies that routing and the layout residual ledger; it does not create another Git
executor.

The audit packet's recommendation that no direct operation survive is therefore **consciously narrowed at the
ownership boundary**, not left as an unmet promise. Layout closeout requires no direct Git operation in a
layout-owned TypeScript consumer; it permits these exact named residuals:

- the hook's read-only index inspection, owned by hook enforcement; and
- `activate-work-unit.md` plus `strategy-work-planning.md`'s guarded residual-draft retirement, owned together by
  `composable-workflows`' lifecycle-verb adoption.

The second residual has an identity-global `USER-INBOX` routing capture with `WU_Target: composable-workflows`; the
planning-closeout check must confirm that capture still exists or has drained into that WU's authoritative planning
artifact. `cli-substrate-complete-migration` records the two files as a named external-owner residual when it builds
its post-cohort matrix, using its existing rule that a finding may close when shown to belong to an already-named
owner outside the cohort. The substrate cohort does **not** depend on `composable-workflows` landing this verb.

`cli-substrate-complete-migration` is not the primary owner because its cutline is mechanical adoption of contracts
already delivered by the six substrate members. The current `arc activate` verb explicitly leaves draft retirement
outside its executor, so removing the prose mechanic requires a lifecycle-verb contract change, not merely adopting
the landed layout or Git seam. If that owner lands the verb before the cohort tail runs, the tail consumes any
remaining mechanical caller migration and removes the residual entry; otherwise it verifies the named route and may
close without inventing the verb itself.

### Storage evolution

The resolver is a **projection seam**, not the future storage seam. A future record-backed materializer may use the
same address algebra to render today's `.arc/` view under a caller-supplied root. A future storage port will still
need to own reads, version-checked writes, synchronization, absence, and failure behavior; replacing joins with this
resolver does not complete that work.

No storage mode or per-artifact boolean is introduced. The design remains compatible with a current in-repo root, a
private local backing store materialized into a worktree, or a shared store materialized into several worktrees.

### Forward-compatibility checks

The three architectural check-docs resolve as follows:

- **Procedure evolution — directly applicable and aligned.** Deterministic path resolution moves into typed CLI
  code; workflows invoke lifecycle verbs instead of constructing paths or narrating Git/file mechanics; and the
  Zod/TypeScript schemas remain the single source for any generated contract documentation. Layout introduces no
  agent-interpreted control flow, markup, prompt text, or agenda policy. Its `procedure-root` address deliberately
  stops at `.arc/system/{methods|workflows}`: `composable-workflows` D2 still owns procedure/fragment identity,
  discovery, and its `slug → artifact` resolver, which may consume the layout root rather than duplicate it.
- **Storage evolution — directly applicable and aligned.** Semantic projection is separate from caller-selected
  materialization, workflows remain storage-mode agnostic, and no read/write/version/sync semantics or configuration
  axes leak into layout. The resolver describes today's `.arc/` view; a backing store remains free to hold canonical
  records elsewhere and materialize that view under the selected root.
- **Knowledge evolution — only peripherally applicable and aligned.** This WU changes no guidance placement,
  loading trigger, index, always-loaded surface, or document-family taxonomy. Centralizing current document names
  makes later projection or rename work cheaper without claiming ownership of knowledge-unit identity, section
  addressing, load-set policy, or audience projection. Template-suffix handling remains an install-path transform,
  not a knowledge-loading mechanism.

## Delivery and Verification

- Start from the digest-pinned audit and check in or generate a deterministic current-tree reconciliation ledger.
- Unit-test every address variant and invalid operand class through the public contract.
- Keep golden expected strings independent from the implementation. Test input builders may construct typed
  addresses, but expected paths must not be produced by the resolver under test.
- Test canonical managed output separately from native POSIX and Windows materialization.
- Characterize identity resolution for valid configured, invalid configured, derived, prompted, missing, and
  cancelled inputs; assert the branded success type and exact `identity.invalid` remediation contract.
- Add integration coverage at representative lifecycle, planning, procedure-load, template, and user-surface
  consumers; do not duplicate every unit assertion at integration level.
- Run the full CLI suite because path failures cross session, lifecycle, install/update, status, and user-state flows.
- Prove the migration ledger has no unexplained current-tree hit and that allowed residuals name their authority;
  pin the two tracked-planning residual dispositions separately from layout-owned migrated callers.

## Alternatives

- **Central constants only:** rejected because callers would still own composition and dynamic operand placement.
- **A resolver pre-bound to `cwd`:** rejected because it conflates canonical projection with materialization and
  cannot express current-vs-primary user roots cleanly.
- **A virtual filesystem or storage repository in this work unit:** rejected as a separate effect and persistence
  boundary.
- **One convenience function per caller:** rejected because it recreates distributed layout policy behind a new
  module name.
- **Use the resolver to generate test expectations:** rejected because implementation and oracle would share the
  same defect.

## Risks

- The fan-out is large enough that a mechanical migration can accidentally absorb discovery or lifecycle policy.
- A broad generic `join` escape hatch would make the new authority nominal rather than real.
- Treating all returned strings alike can leak native separators into Git or persisted wire contracts.
- Existing `arc.identity` values are read directly from Git config in some flows; strict validation will expose a
  manually configured unsafe or non-canonical value and must provide actionable remediation.
- The audit predates shipped cohort work, so stale counts or already-migrated callers can distort task sizing.
- The tracked-planning evidence set crosses TypeScript, shell-hook, workflow, and strategy boundaries; forcing one
  adapter over all four would be category error.

## Resolved / Open / Next

### Resolved

- `Heavy` remains the right Class: the design composes shipped primitives, while the migration surface is broad.
- Layout owns subsystem path schemas; the kernel owns only neutral shared primitives.
- Canonical managed projection and native materialization are separate APIs.
- Lifecycle, cohort, archive-allocation, user-root, discovery, existence, and storage semantics stay with their
  current or future semantic owners.
- The audit's four-file tracked-planning set is reconciliation evidence, not a prescribed adapter package.
- `resolveIdentity` returns `Slug | null`; invalid configured identities throw the exact `identity.invalid`
  `UserFacingError` above, while missing identity remains `null` and ARC never silently normalizes one directory
  identity into another.
- Hook-owned Git index inspection remains in the shell gate; residual workflow cleanup routes to
  `composable-workflows` verb adoption as a named external-owner residual. The cohort tail verifies that route but
  does not depend on the verb landing or invent it.
- Storage compatibility means projection-root independence, not claiming to have implemented the storage port.
- Address field names, registry identities, template behavior, and all four layout error codes are frozen above.
- Cohort fit resolves to one WU: the contract and its caller migration are one concern, while broad delivery is split
  into task/review increments rather than additional contract owners.
- Procedure, storage, and knowledge evolution checks introduce no incompatible seam; the procedure check sharpens
  the boundary between layout roots and `composable-workflows`' semantic procedure resolver.
- Root-only consumers, pre-resolved pointers, path recognizers, and scanner false positives are distinct ledger
  dispositions; none requires a generic layout join or a broader address algebra.
- Record-backed lifecycle callers and `arc view` confirm that structured sibling projection can coexist with exact
  discovered/custom pointers without reverse-parsing or inventing incomplete physical placements.

### Open

No settle-able design decision remains. The exhaustive per-hit ledger, implementation task sizing, and final allowed-
residual fixture are downstream grounding and verification work, not open contract questions.

### Next

Re-read the post-review folds for coherence, then surface the formalization-ready draft at the workflow interlock.
After approval, create the spec; the later grounding pass produces the exhaustive ledger before task generation.

---

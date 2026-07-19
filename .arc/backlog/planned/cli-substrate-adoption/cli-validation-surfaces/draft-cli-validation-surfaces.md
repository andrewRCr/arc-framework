# Draft: cli-validation-surfaces

- **Origin:** [internal]
- **Cohort:** `cli-substrate-adoption`
- **Purpose:** Adopt runtime schemas at the CLI's priority non-session trust boundaries without centralizing
  subsystem semantics.

---

## Problem / Motivation

Several CLI boundaries accept JSON, YAML-derived objects, Git porcelain, or structured records whose runtime
validation is manual, partial, or coupled to TypeScript assertions. These are the places where external drift can
be mistaken for valid internal state. They need schema-backed validation, but a wholesale migration would obscure
compatibility decisions and turn one work unit into an unreviewable grab bag.

This member covers the priority non-session boundaries identified in the substrate audit. Session, compaction, and
recovery envelopes belong wholly to `cli-session-envelope`.

## Goals

- Give each selected boundary a co-located Zod schema composed from kernel primitives.
- Replace unsafe casts and ad hoc structural checks with deliberate `parse` or `safeParse` behavior.
- Preserve the compatibility policy of each existing wire or persisted format.
- Register externally meaningful schemas through the kernel registry.
- Eliminate the selected canonical-JSON outlier by routing it through the existing canonical core.

## Non-Goals

- Convert every CLI type or validation helper to Zod.
- Own session-init, compaction-seed, or recovery envelope schemas.
- Introduce a generalized Markdown parser or validate agent-authored prose as structured control flow.
- Reform configuration axes, lifecycle policy, or subsystem behavior.
- Convert every fallible API to Result solely because the kernel exposes it.

## Design Decisions

### Priority boundary set

The member owns runtime schemas and boundary integration for:

- audit-log schema version 2 only;
- meta frontmatter and shipped meta-record shapes, coordinated with `operational-state-docs`;
- the parsed `arc-config` object, without renaming or restructuring configuration axes;
- sync-state after dropping the dead `priorFileList` field while retaining backward-compatible reads;
- the decompose cut-map format and its current migration behavior;
- Git worktree porcelain records;
- the branch-gone evidence discriminated union;
- the five cold-start spec-input variants;
- cross-work-unit note payloads;
- the review-gate identity snapshot or any equivalent peripheral canonical-JSON outlier found by the audit.

The implementation inventory must map every item to its owning module, schema identity, compatibility posture, and
tests. A newly discovered boundary is included only when it is the same audited concern and can be reviewed without
expanding the work into a general migration.

### Ownership and composition

- Each subsystem keeps a `schemas.ts` or equivalently clear co-located schema module.
- Subsystem schemas compose shared primitives from `cli-schema-kernel` and register only when another boundary or
  introspection consumer needs stable discovery.
- Export TypeScript types through `z.infer`; do not maintain parallel structural interfaces.
- The kernel owns vocabulary and registration mechanics, not the semantic rules encoded here.

### Parse policy

- Use `parse` for trusted internal assembly where failure means a programming defect and should stop the operation.
- Use `safeParse` for files, subprocess output, configuration input, cross-checkout records, and compatibility reads
  where failure must become an actionable domain error.
- Validation errors retain field paths and boundary context while avoiding raw data leakage.
- Strictness is decided per boundary from the existing compatibility contract, not applied uniformly for style.

### Compatibility decisions

- Audit logs target version 2; this member does not add a new audit-log version.
- Sync-state may read the obsolete `priorFileList` field and ignore it, while new writes omit it. No version bump is
  required for that tolerant removal.
- Decompose cut-map parsing preserves its migration contract and emits the current canonical form.
- Git porcelain parsers reject structurally incomplete records but preserve supported Git-version variation.
- Meta-record validation coordinates with `operational-state-docs`; schema ownership here must not pre-decide that
  work unit's documentation or operational-state policy.

### Results and canonical JSON

- Evaluate the existing `AuthorizationDecision` result shape against the kernel Result abstraction. Retain the
  domain payload if conversion makes authorization outcomes less explicit; adoption is not a goal by itself.
- Route the identified canonical JSON outlier through the blessed `lib/canonical/` core rather than adding another
  serializer or changing identity bytes.

## Delivery and Verification

- Characterize accepted, rejected, and backward-compatible fixtures for each boundary before replacement.
- Add schema tests beside each owning subsystem and command/integration tests at externally observable boundaries.
- Test validation diagnostics without snapshotting unstable library prose wholesale.
- Measure hot-path validation where a boundary is invoked repeatedly; investigate material regressions.
- Reconcile the completed inventory against the source audit so no listed surface disappears silently.

## Alternatives

- **One global schema module:** rejected because semantic ownership and compatibility context would be lost.
- **Validate everything in one migration:** rejected because unrelated policy decisions could hide in mechanical
  churn.
- **Keep bespoke validators:** rejected for these priority boundaries because composition, inference, and registry
  discovery are requirements.
- **Force Result onto authorization:** rejected as a blanket rule; clarity of the domain discriminant wins.

## Risks

- The cross-subsystem surface is substantial and can conceal behavior changes inside apparently mechanical schemas.
- Schema and exported type drift returns if any module keeps hand-written parallel interfaces.
- Incorrect strictness can reject forward-compatible input or admit malformed state.
- Version metadata can imply migration support the subsystem does not actually provide.
- Repeated validation may add measurable latency on command hot paths.

## Unknowns and Assumptions

- Settle object strictness individually from fixtures and existing consumer behavior during spec formalization.
- Confirm whether `AuthorizationDecision` materially benefits from Result; the recommended default is to defer that
  conversion when it weakens the payload.
- Assume the review-gate snapshot is the only canonical JSON outlier in the audited set; inventory drift must be
  classified explicitly.

## Scope Estimate

Large (week+). Class `Heavy`: multiple compatibility surfaces require separate characterization and coordinated
review. Depends on `work-organization-reform` and `cli-schema-kernel`.

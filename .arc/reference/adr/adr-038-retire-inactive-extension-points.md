# ADR-038: Retire Inactive Extension Points and Preserve Event Contracts

## Status

Accepted

## Context

[ADR-003][adr-003] introduced extension points as a convention-level workflow insertion mechanism. [ADR-008][adr-008]
used them as the Core↔PM interface, [ADR-009][adr-009] retained that interface, and [ADR-013][adr-013] recorded their
per-file layout and declaration/loading model alongside surviving methods.

Eleven Configurable files supplied an activation flag and project-authored action sequence. All eleven shipped
inactive and remained inactive in this repository. Even that empty configuration required directory enumeration,
active-name threading through status and recovery, workflow declarations and markers, conditional dispatch,
scanners, validators, and an empty checkpoint report. The mechanism provided agent instructions; it supplied no
CLI-fired lifecycle-event executor.

Keeping only PM-facing events would retain the same infrastructure without a working tracker integration. Keeping
storage after removing firing would imply supported behavior and constrain a future design. Waiting for a
replacement would retain the present instruction and audit costs. Reusing the scanner for method validation would
carry its extension-marker grammar into a consumer whose grammar and reachability obligations remain undecided.

## Decision

We retire the extension mechanism in full: files, activation switches, declarations, markers, action dispatch,
commands, probes, scanners, validators, and empty report fields. We retain independent method loading and validation,
domain-rule validation, project checks, review obligations, exact-head binding, and merge authorization.

Supported customization consists of configuration, check declarations, method overrides, QUICK-REFERENCE commands,
and project strategy/workflow/domain-rule content. Project workflows may run beside ARC workflows and use methods.
ARC supplies no supported insertion of additional steps inside its workflows and no lifecycle tracker notification
or synchronization mechanism. `Origin` remains linkage. Harness-native lifecycle hooks remain a separate facility.
The task-list checkbox and planning-checkpoint conventions survive with no supported customization path.

Existing update policy retains removed Configurable documents for review as unmanaged content, deletes the removed
Framework README, and drops all twelve paths from manifest/pristine membership. Later updates do not rediscover or
read those documents. This repository deliberately deletes its installed copies alongside package membership.
We introduce no migration, compatibility alias, replacement format, reserved callable names, or delivery promise.

This decision partially supersedes ADR-003 Part 2 and the extension half of Part 4; ADR-008's extension-point
Core↔PM interface; ADR-013's extension half of per-file layout and declaration/loading; and ADR-009 Part 1's extension
relevance bullet and Part 3's disposition preserving ADR-008 extension points. Their historical bodies and prior
supersession annotations remain intact.

### Historical lifecycle-event inventory

The following names and contracts are retired design inputs, not an executable interface or namespace reservation.
The naming rule was `{pre|post}-{lifecycle-event}`: a name described the actual boundary and its firing frequency
matched that promise. All events shared these constraints:

- Numbered actions executed in authored order, stopped before later actions on the first failure, and surfaced an
  actionable failure to the calling workflow. A retry or continuation past failure required explicit developer
  direction; callers could not assume permission to proceed.
- Added actions augmented core behavior rather than replacing existing workflow steps or approval obligations.
- Repeated boundaries required the event-specific retry/idempotence contract. Final-head actions could repeat
  without unsafe mutation; no commit or push could occur after readiness was established.

| Event                          | Retired placement, frequency, and constraints                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post-context-load`            | After standard session context loading, before orientation; additional project context at session entry, also used after recovery loading.                                        |
| `pre-spec-finalization-review` | After spec self-review, before approval/finalization; optional team ceremony at each spec-finalization gate, without prescribing a team's cadence.                                |
| `post-task-completion`         | After marking the task and updating its description, before verification/report; additional notifications on task completion, preserving the core update.                         |
| `pre-activation`               | After activation prerequisites, before state flip/branch rename; once per activation. Failure held activation for explicit fix-and-retry or developer-directed continuation.      |
| `post-work-unit-activate`      | After core activation, absorption when applicable, and ROADMAP work; additional project actions per activation, preserving core PM updates.                                       |
| `pre-commit-review`            | After staging, before commit creation; agent-layer review per managed commit, distinct from independent mechanical Git pre-commit hooks.                                          |
| `pre-push-review`              | Before each managed push; high frequency required lightweight actions. The file promised wrapper-wide invocation, while actual enforcement audited workflow declarations/markers. |
| `pre-pr-open`                  | After push, immediately before change-request creation; retry-safe because creation could fail afterward; skipped on open-request reuse.                                          |
| `post-pr-open`                 | After creating or resolving an existing open request, before review; idempotent across create/re-entry, deriving current host state from the supplied reference.                  |
| `pre-merge`                    | Once per ready head, between final evidence and merge authorization; actions read-only, idempotent, or retry-safe across repeated settlement; no later commit or push.            |
| `post-work-unit-archive`       | After core archival, applicable cohort closeout, and ROADMAP work, before the archival commit; additional project actions per archive, preserving core PM updates.                |

The two request events accepted opaque payloads:

```text
pre-pr-open: proposedChangeRequest = { repositoryRef, baseRef, headRef, headSha }
post-pr-open: openedChangeRequest = { repositoryRef, hostRef, headSha }
```

Callers supplied coordinates; host adapters validated and converted them. Actions inferred neither branch/work-unit
state nor one-work-unit/one-change-request cardinality. Open-request actions derived current host state from the
supplied `hostRef`, and current-head bindings refreshed when the head moved. Creation required the exact pushed
remote head immediately before create. None of these coordinates conferred review or merge authority.

The `pre-push-review` file's wrapper-wide promise exceeded the implementation. `auditPushExtensionCoverage` scanned
agent-managed push sites in workflow Markdown and required declarations plus a preceding local marker or
workflow-wide contract. It validated workflow instructions; neither `arc release push` nor `arc sync` supplied a
CLI executor for project-authored actions. The historical promise is preserved here with that enforcement limit,
not as a claim that every wrapper invocation executed a hook.

### Source retrieval

The full revision immediately before implementation removal is:

```text
966ecb587628cf2643e281f7c9a4823fc494ff74
```

This is a retrieval anchor, not a live runtime dependency or future compatibility requirement. Use
`git show <revision>:<path>` to recover the original source. Recoverable loci include:

- `packages/arc-framework/arc/system/extensions/README.md` and the eleven same-directory event files named above.
  The installed counterparts are under `.arc/system/extensions/` at the same revision.
- `packages/arc-framework/arc/system/workflows/arc/session-lifecycle/session-init.template.md` and
  `session-recover.md`; `process-task-loop.template.md` and `create-spec.md` under the workflow root.
- `packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/activate-work-unit.md`,
  `archive-work-unit.md`, and `integrate-work-unit.md`.
- `packages/arc-framework/arc/system/workflows/arc/supplemental/run-errand.md` and `prepare-commits.md`, and
  `packages/arc-framework/arc/system/.internal/skills/arc-commit/SKILL.md`.
- `packages/arc-framework/src/scripts/audit-method-triggers.ts` for `auditPushExtensionCoverage`,
  `src/lib/extensions/point-scanner.ts` for the old marker grammar, and `src/lib/extensions/orphan-detector.ts`;
  the latter two paths share the `packages/arc-framework/` prefix.
- `packages/arc-framework/src/commands/extensions/status.ts`, `src/lib/frontmatter/extension.ts`, and
  `src/commands/status/run.ts` under the same package prefix for enumeration, parsing, and probe composition.

The historical source records instructions and implementation separately. A future lifecycle-event design may
reuse its boundary knowledge while choosing its own execution, authority, payload, and configuration contracts.

## Consequences

### Positive

- Session/status/recovery pipelines and workflow instructions no longer carry inactive hook infrastructure.
- Supported customization and notification boundaries are explicit; a missing seam cannot masquerade as integration.
- Method validation, mechanical checks, PR/readiness contracts, and independent approval controls remain intact.
- All eleven event contracts and retrievable source survive without constraining a replacement's representation.

### Negative

- Teams have no supported workflow-step insertion or lifecycle tracker-notification route through ARC.
- Previously customized extension files become inert unmanaged residue that teams must review themselves.
- CLI and typed-envelope removals change unpublished contracts in place under the pre-public-release posture.
- Historical analyses may require revision-bound links when their original live targets disappear.

---

[adr-003]: adr-003-design-configuration-and-extension-point-system.md
[adr-008]: adr-008-decompose-framework-into-core-and-pm-layers.md
[adr-009]: adr-009-simplify-pm-layers-to-mode-based-selection.md
[adr-013]: adr-013-adopt-on-demand-method-loading.md

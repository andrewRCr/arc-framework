# Coupling Blast-Radius Audit

A deterministic projection of the settled coupling inventory and reconciled finding ledger.

## Provenance and method

- Manifest digest: `f6ed9b14829116cf9068db5263cc6e551f01764a431dd82d5ded7006f94d0395`
- Result digest: `8ff94473a49cb4a55ba79626d27c9e420770cf6a329e63ac95b332f47cc9956c`
- Corpus: 1225 tracked files; files digest `7f3d8bb0b6885a06643b3e27603d1841a094ae9ef1bc1fb47be130f8851d8cf5`
- Classified candidates: 9051
- Dismissed candidates: 92949
- Unresolved candidates: 0
- Dispositions: 64 exact; 7 bulk

A class is high fan-out when any surface count reaches its cutoff. Test, code, workflow, template, and config
cutoffs use the observed upper quartile; prose uses the 87.5th percentile. Mixed surfaces rank by maximum
count-to-cutoff ratio, then quadrant verdict, total fan-out, and stable class ID.

Cutoffs: test 25; code 12; workflow 8; template 2; prose 20; config 3.

## Ranked inventory

Canonical file membership remains in
`packages/arc-framework/audits/coupling-blast-radius/scan-result.json → classes[classId].files`.

| Class | Rank | Verdict | Fan-out | Hits | Test | Code | Workflow | Template | Prose | Config | Volatility evidence |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| <a id="class-arc-root"></a>`arc-root` | 1 | `abstract` | 388 | 2934 | 200 | 117 | 20 | 5 | 40 | 6 | arc-backend: strategy-storage-evolution.md#Forward-Compat Principles § 1; roster=planned; snapshot=2026-07-18 |
| <a id="class-active-placement"></a>`active-placement` | 2 | `abstract` | 243 | 1350 | 124 | 72 | 20 | 3 | 20 | 4 | wu-lifecycle-state-model: draft-arc-backend.md#Placement Is a Record, Not an Address; roster=planned; snapshot=2026-07-18 |
| <a id="class-typed-branch-prefixes"></a>`typed-branch-prefixes` | 3 | `abstract` | 202 | 2013 | 133 | 38 | 16 | 0 | 12 | 3 | arc-backend: strategy-storage-evolution.md#Forward-Compat Principles § 5; roster=planned; snapshot=2026-07-18 |
| <a id="class-meta-prefix"></a>`meta-prefix` | 4 | `abstract` | 210 | 2079 | 121 | 45 | 21 | 3 | 19 | 1 | arc-backend: draft-arc-backend.md#The Storage Model § The line: tracked vs. materialized; roster=planned; snapshot=2026-07-18 |
| <a id="class-strategy-family"></a>`strategy-family` | 5 | `abstract` | 82 | 317 | 10 | 5 | 24 | 9 | 30 | 4 | knowledge-architecture: draft-knowledge-architecture.md#The four-kind verdict and Naming; roster=planned; snapshot=2026-07-18 |
| <a id="class-domain-rules-name"></a>`domain-rules-name` | 6 | `abstract` | 78 | 192 | 19 | 7 | 24 | 2 | 24 | 2 | rules-restructure: draft-rules-restructure.md#Scope; roster=planned; snapshot=2026-07-18 |
| <a id="class-spec-prefix"></a>`spec-prefix` | 7 | `abstract` | 60 | 264 | 25 | 7 | 8 | 5 | 14 | 1 | arc-backend: draft-arc-backend.md#The Storage Model § The line: tracked vs. materialized; roster=planned; snapshot=2026-07-18 |
| <a id="class-completed-placement"></a>`completed-placement` | 8 | `abstract` | 86 | 249 | 39 | 29 | 7 | 0 | 8 | 3 | wu-lifecycle-state-model: draft-arc-backend.md#Placement Is a Record, Not an Address; roster=planned; snapshot=2026-07-18 |
| <a id="class-planned-placement"></a>`planned-placement` | 9 | `abstract` | 91 | 432 | 54 | 24 | 7 | 0 | 5 | 1 | wu-lifecycle-state-model: draft-arc-backend.md#Placement Is a Record, Not an Address; roster=planned; snapshot=2026-07-18 |
| <a id="class-pm-mode-key"></a>`pm-mode-key` | 10 | `abstract` | 71 | 256 | 23 | 13 | 16 | 0 | 15 | 4 | scalable-core: draft-scalable-core.md#What this work unit owns vs. steers; roster=planned; snapshot=2026-07-18 |
| <a id="class-workflow-root"></a>`workflow-root` | 11 | `abstract` | 60 | 176 | 16 | 10 | 4 | 4 | 24 | 2 | composable-workflows: draft-composable-workflows.md#D2 — Decomposed-workflow layout; roster=planned; snapshot=2026-07-18 |
| <a id="class-tasks-prefix"></a>`tasks-prefix` | 12 | `abstract` | 76 | 453 | 41 | 9 | 8 | 2 | 15 | 1 | arc-backend: draft-arc-backend.md#The Storage Model § The line: tracked vs. materialized; roster=planned; snapshot=2026-07-18 |
| <a id="class-draft-prefix"></a>`draft-prefix` | 13 | `abstract` | 82 | 406 | 33 | 11 | 13 | 2 | 20 | 3 | arc-backend: draft-arc-backend.md#The Storage Model § The line: tracked vs. materialized; roster=planned; snapshot=2026-07-18 |
| <a id="class-session-notes-name"></a>`session-notes-name` | 14 | `abstract` | 58 | 478 | 25 | 16 | 7 | 0 | 9 | 1 | naming-conventions: draft-naming-conventions.md#Renames; roster=planned; snapshot=2026-07-18 |
| <a id="class-method-root"></a>`method-root` | 15 | `abstract` | 42 | 142 | 12 | 4 | 4 | 1 | 17 | 4 | composable-workflows: draft-composable-workflows.md#D2 — The fragment substrate; roster=planned; snapshot=2026-07-18 |
| <a id="class-team-mode-key"></a>`team-mode-key` | 16 | `abstract` | 37 | 77 | 18 | 10 | 0 | 0 | 5 | 4 | local-mode: draft-local-mode.md#Team mode and the substrate; roster=planned; snapshot=2026-07-18 |
| <a id="class-notes-prefix"></a>`notes-prefix` | 17 | `abstract` | 45 | 143 | 18 | 3 | 8 | 2 | 13 | 1 | arc-backend: draft-arc-backend.md#The Storage Model § The line: tracked vs. materialized; roster=planned; snapshot=2026-07-18 |
| <a id="class-roadmap-name"></a>`roadmap-name` | 18 | `abstract` | 44 | 143 | 17 | 12 | 6 | 0 | 8 | 1 | roadmap-tooling: draft-roadmap-tooling.md#ROADMAP to STATUS.PROJECT rename; roster=planned; snapshot=2026-07-18 |
| <a id="class-working-memory-name"></a>`working-memory-name` | 19 | `abstract` | 37 | 509 | 25 | 6 | 3 | 0 | 1 | 2 | naming-conventions: draft-naming-conventions.md#Renames; roster=planned; snapshot=2026-07-18 |
| <a id="class-template-suffix"></a>`template-suffix` | 20 | `abstract` | 24 | 134 | 11 | 6 | 0 | 0 | 4 | 3 | composable-workflows: draft-composable-workflows.md#D3 — Binding-time rule; roster=planned; snapshot=2026-07-18 |
| <a id="class-load-set-name"></a>`load-set-name` | 21 | `change-with-mover` | 22 | 188 | 9 | 11 | 1 | 0 | 0 | 1 | composable-workflows: draft-composable-workflows.md#D3 — The session-agenda compiler; roster=planned; snapshot=2026-07-18 |
| <a id="class-user-inbox-name"></a>`user-inbox-name` | 22 | `change-with-mover` | 39 | 148 | 20 | 10 | 1 | 0 | 6 | 2 | naming-conventions: draft-naming-conventions.md#Renames; roster=planned; snapshot=2026-07-18 |
| <a id="class-extension-root"></a>`extension-root` | 23 | `change-with-mover` | 42 | 165 | 18 | 7 | 6 | 0 | 9 | 2 | composable-workflows: draft-composable-workflows.md#D1 — The workflow contract shape; roster=planned; snapshot=2026-07-18 |
| <a id="class-agent-briefs-root"></a>`agent-briefs-root` | 24 | `change-with-mover` | 33 | 62 | 11 | 6 | 6 | 1 | 7 | 2 | naming-conventions: draft-naming-conventions.md#Rename reference/briefs to reference/agent-briefs; roster=planned; snapshot=2026-07-18 |
| <a id="class-strategy-index-name"></a>`strategy-index-name` | 25 | `change-with-mover` | 21 | 51 | 3 | 3 | 5 | 0 | 8 | 2 | knowledge-architecture: draft-knowledge-architecture.md#Architecture § Access paths are derived; roster=planned; snapshot=2026-07-18 |
| <a id="class-internal-skill-root"></a>`internal-skill-root` | 26 | `change-with-mover` | 15 | 32 | 5 | 5 | 1 | 0 | 2 | 2 | knowledge-architecture: strategy-knowledge-evolution.md#Target Model and access paths; roster=planned; snapshot=2026-07-18 |
| <a id="class-provisional-placement"></a>`provisional-placement` | 27 | `change-with-mover` | 25 | 70 | 12 | 6 | 2 | 0 | 4 | 1 | wu-lifecycle-state-model: draft-arc-backend.md#Placement Is a Record, Not an Address; roster=planned; snapshot=2026-07-18 |
| <a id="class-recommended-text-family"></a>`recommended-text-family` | 28 | `change-with-mover` | 11 | 196 | 5 | 3 | 3 | 0 | 0 | 0 | composable-workflows: strategy-procedure-evolution.md#Forward-Compat Principles § 6; roster=planned; snapshot=2026-07-18 |
| <a id="class-atomic-inbox-name"></a>`atomic-inbox-name` | 29 | `change-with-mover` | 16 | 54 | 7 | 0 | 2 | 0 | 6 | 1 | naming-conventions: draft-naming-conventions.md#Renames; roster=planned; snapshot=2026-07-18 |
| <a id="class-arc-extensions-key"></a>`arc-extensions-key` | 30 | `change-with-mover` | 8 | 16 | 1 | 1 | 0 | 0 | 5 | 1 | composable-workflows: draft-composable-workflows.md#D1 — Frontmatter is the contract; roster=planned; snapshot=2026-07-18 |
| <a id="class-arc-methods-key"></a>`arc-methods-key` | 31 | `change-with-mover` | 8 | 19 | 1 | 1 | 0 | 0 | 5 | 1 | composable-workflows: draft-composable-workflows.md#D1 — Frontmatter is the contract; roster=planned; snapshot=2026-07-18 |
| <a id="class-tracked-planning-git-operations"></a>`tracked-planning-git-operations` | 32 | `change-with-mover` | 4 | 5 | 0 | 2 | 1 | 0 | 1 | 0 | cli-substrate-adoption: strategy-storage-evolution.md#Forward-Compat Principles § 1; roster=planned; snapshot=2026-07-18 |

## Substrate abstraction input

| Class | Inventory | Idioms | Evidence records |
| --- | --- | --- | ---: |
| `arc-root` | [ranked row](#class-arc-root) | `filename-prefix`, `git-tracked-path`, `path-literal` | 2934 |
| `active-placement` | [ranked row](#class-active-placement) | `directory-state`, `filename-prefix`, `git-tracked-path`, `path-literal` | 1350 |
| `meta-prefix` | [ranked row](#class-meta-prefix) | `directory-state`, `filename-prefix`, `path-literal` | 1191 |
| `spec-prefix` | [ranked row](#class-spec-prefix) | `filename-prefix`, `path-literal` | 40 |
| `completed-placement` | [ranked row](#class-completed-placement) | `directory-state`, `filename-prefix`, `path-literal` | 249 |
| `planned-placement` | [ranked row](#class-planned-placement) | `directory-state`, `filename-prefix`, `git-tracked-path`, `path-literal` | 432 |
| `workflow-root` | [ranked row](#class-workflow-root) | `directory-state`, `path-literal` | 176 |
| `tasks-prefix` | [ranked row](#class-tasks-prefix) | `directory-state`, `path-literal` | 231 |
| `draft-prefix` | [ranked row](#class-draft-prefix) | `filename-prefix`, `path-literal` | 69 |
| `session-notes-name` | [ranked row](#class-session-notes-name) | `path-literal` | 183 |
| `method-root` | [ranked row](#class-method-root) | `directory-state`, `path-literal` | 142 |
| `notes-prefix` | [ranked row](#class-notes-prefix) | `path-literal` | 41 |
| `roadmap-name` | [ranked row](#class-roadmap-name) | `git-tracked-path`, `path-literal` | 66 |
| `working-memory-name` | [ranked row](#class-working-memory-name) | `path-literal` | 169 |
| `template-suffix` | [ranked row](#class-template-suffix) | `directory-state`, `filename-prefix`, `path-literal` | 134 |

## Placement readers

Classes: `active-placement`, `completed-placement`, `planned-placement`, `provisional-placement`.

Reader idioms: `directory-state`, `filename-prefix`.

| Reader/parser path | Classes | Evidence records |
| --- | --- | ---: |
| `packages/arc-framework/arc/system/.internal/githooks/pre-commit` | `active-placement`, `planned-placement` | 6 |
| `packages/arc-framework/arc/system/.internal/scripts/validate-links.sh` | `completed-placement` | 2 |
| `packages/arc-framework/arc/system/.internal/scripts/verify-integrity.sh` | `active-placement` | 1 |
| `packages/arc-framework/src/cli.ts` | `completed-placement`, `planned-placement` | 2 |
| `packages/arc-framework/src/commands/active/types.ts` | `active-placement` | 3 |
| `packages/arc-framework/src/commands/start.ts` | `active-placement` | 3 |
| `packages/arc-framework/src/commands/status/types.ts` | `active-placement`, `completed-placement`, `planned-placement` | 4 |
| `packages/arc-framework/src/commands/user/drift.ts` | `completed-placement` | 1 |
| `packages/arc-framework/src/commands/user/save-load.ts` | `completed-placement` | 1 |
| `packages/arc-framework/src/commands/user/sync-status.ts` | `completed-placement` | 1 |
| `packages/arc-framework/src/handlers/lifecycle.ts` | `active-placement`, `completed-placement` | 9 |
| `packages/arc-framework/src/handlers/plan.ts` | `active-placement` | 2 |
| `packages/arc-framework/src/lib/active/cohort-consistency.ts` | `active-placement`, `completed-placement`, `planned-placement` | 12 |
| `packages/arc-framework/src/lib/active/meta-reader.ts` | `active-placement` | 1 |
| `packages/arc-framework/src/lib/base-drift/current-adapters.ts` | `completed-placement` | 1 |
| `packages/arc-framework/src/lib/git/remote-ref-reader.ts` | `active-placement` | 2 |
| `packages/arc-framework/src/lib/git/worktree-roster.ts` | `active-placement` | 3 |
| `packages/arc-framework/src/lib/release/interlock-validation.ts` | `active-placement` | 1 |
| `packages/arc-framework/src/lib/release/wu-resolution.ts` | `active-placement` | 1 |
| `packages/arc-framework/src/lib/session-init/cohort-doc.ts` | `planned-placement` | 2 |
| `packages/arc-framework/src/lib/session-init/in-flight-work-unit-sweep.ts` | `active-placement`, `completed-placement` | 4 |
| `packages/arc-framework/src/lib/session-init/orphan-branch-sweep.ts` | `completed-placement` | 3 |
| `packages/arc-framework/src/lib/session-init/retired-subdir-detection.ts` | `completed-placement` | 1 |
| `packages/arc-framework/src/lib/session-init/stale-worktree-sweep.ts` | `completed-placement` | 1 |
| `packages/arc-framework/src/lib/status/project-view.ts` | `provisional-placement` | 1 |
| `packages/arc-framework/src/lib/status/ready-mine-source.ts` | `completed-placement`, `planned-placement` | 2 |
| `packages/arc-framework/src/lib/status/ready-mine.ts` | `planned-placement` | 2 |
| `packages/arc-framework/src/lib/user-sync/retired-subdir.ts` | `completed-placement` | 1 |
| `packages/arc-framework/src/lib/work-unit/backlog-stub.ts` | `planned-placement`, `provisional-placement` | 2 |
| `packages/arc-framework/src/lib/work-unit/completed-index.ts` | `completed-placement` | 13 |
| `packages/arc-framework/src/lib/work-unit/lifecycle-deps.ts` | `completed-placement` | 1 |
| `packages/arc-framework/src/lib/work-unit/lifecycle-guards.ts` | `active-placement` | 9 |
| `packages/arc-framework/src/lib/work-unit/lifecycle-index.ts` | `active-placement`, `completed-placement`, `planned-placement`, `provisional-placement` | 5 |
| `packages/arc-framework/src/lib/work-unit/lifecycle-membership.ts` | `active-placement`, `completed-placement`, `planned-placement` | 8 |
| `packages/arc-framework/src/lib/work-unit/lifecycle-resolver.ts` | `active-placement`, `completed-placement` | 3 |
| `packages/arc-framework/src/lib/work-unit/lifecycle-state.ts` | `active-placement`, `completed-placement`, `planned-placement`, `provisional-placement` | 5 |
| `packages/arc-framework/src/lib/work-unit/lifecycle-transitions.ts` | `active-placement`, `planned-placement` | 3 |
| `packages/arc-framework/src/lib/work-unit/mutators/relocate-artifacts.ts` | `active-placement` | 2 |
| `packages/arc-framework/src/lib/work-unit/pointer-record.ts` | `planned-placement` | 1 |
| `packages/arc-framework/src/lib/work-unit/side-effects/discharge-dep-edges.ts` | `completed-placement` | 1 |
| `packages/arc-framework/src/lib/work-unit/verbs/abandon.ts` | `active-placement` | 1 |
| `packages/arc-framework/src/lib/work-unit/verbs/activate-deactivate.ts` | `active-placement` | 4 |
| `packages/arc-framework/src/lib/work-unit/verbs/archive.ts` | `active-placement`, `completed-placement`, `planned-placement` | 8 |
| `packages/arc-framework/src/lib/work-unit/verbs/decompose.ts` | `active-placement`, `planned-placement` | 3 |
| `packages/arc-framework/src/lib/work-unit/verbs/finalize-stage.ts` | `active-placement` | 1 |
| `packages/arc-framework/src/lib/work-unit/verbs/materialize.ts` | `active-placement` | 1 |
| `packages/arc-framework/src/lib/work-unit/verbs/park-resume.ts` | `active-placement`, `planned-placement` | 14 |
| `packages/arc-framework/src/lib/work-unit/verbs/repoint-design.ts` | `active-placement` | 1 |
| `packages/arc-framework/src/lib/work-unit/verbs/set-stage.ts` | `active-placement` | 1 |
| `packages/arc-framework/src/lib/work-unit/verbs/stub.ts` | `planned-placement` | 2 |
| `packages/arc-framework/src/lib/work-unit/verbs/teardown.ts` | `completed-placement` | 11 |
| `packages/arc-framework/src/scripts/review-gate/hosts/github/lifecycle-tail.ts` | `completed-placement` | 1 |
| `packages/arc-framework/src/scripts/review-gate/policy/self-hosting/lane.ts` | `planned-placement`, `provisional-placement` | 2 |
| `packages/arc-framework/src/scripts/review-gate/policy/self-hosting/schema.ts` | `active-placement` | 1 |
| `packages/arc-framework/src/scripts/validate-cohort-consistency.ts` | `active-placement`, `completed-placement`, `planned-placement`, `provisional-placement` | 10 |
| `packages/arc-framework/src/scripts/validate-meta-spec.ts` | `active-placement` | 1 |

## Routed findings

| Packet | Target | Concern | Classes | State | Design implication | Grooming recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| `packet-171d37a721a6cda7aef7dbd7` | `scalable-core` | `pm-mode-schema-reform` | `pm-mode-key` | `captured-awaiting-housekeep` | Replacing the pm.mode enum crosses 71 files and is an abstraction and compatibility-boundary problem rather than a rename cascade. | At grooming, settle the boolean key name and central-access boundary, then use the ranked inventory as the migration and verification matrix. |
| `packet-188c5fab90090e83fdbc4591` | `wu-lifecycle-state-model` | `placement-reader-input` | `active-placement`, `completed-placement`, `planned-placement`, `provisional-placement` | `captured-awaiting-housekeep` | Four lifecycle placement assumptions currently encode state in directory layout and reach 55 code reader/parser files. | Use the mandatory placement-reader extract at grooming to define the record-field boundary and account for every linked reader before changing projection layout. |
| `packet-297d2244598b0bafebe59474` | `rules-restructure` | `domain-rules-name` | `domain-rules-name` | `captured-awaiting-housekeep` | The domain-rules name is an abstract 78-file document-family assumption. | At grooming, establish the target rule-family access path and use the canonical class evidence to bound the cascade. |
| `packet-3806e82ced300db6ee9c2ba6` | `composable-workflows` | `procedure-surface-moves` | `arc-extensions-key`, `arc-methods-key`, `extension-root`, `load-set-name`, `method-root`, `recommended-text-family`, `template-suffix`, `workflow-root` | `captured-awaiting-housekeep` | The compiled-procedure target moves eight workflow, method, extension, load-set, and binding-time surfaces spanning both abstraction quadrants. | At grooming, use the per-class ranks to separate substrate-owned abstractions from low-fan-out changes that should move with the workflow compiler. |
| `packet-77df5c8e478dd5711fd41ba3` | `cli-substrate-adoption` | `tracked-planning-git-operations` | `tracked-planning-git-operations` | `captured-awaiting-housekeep` | Direct tracked-planning Git operations remain a low-fan-out but high-volatility mechanism that the CLI verb substrate is intended to replace. | Groom the four-file evidence set as explicit verb-adoption scope and verify no direct operation survives the boundary. |
| `packet-9ba27bc90a49239e2b82b1ef` | `naming-conventions` | `state-document-renames` | `agent-briefs-root`, `atomic-inbox-name`, `session-notes-name`, `user-inbox-name`, `working-memory-name` | `captured-awaiting-housekeep` | Five planned document/root renames have materially different fan-out, including two abstract state-document names. | Use the ranked classes at grooming to decide which names need resolver-backed indirection and which can change atomically with the mover. |
| `packet-9fd430233e343d1a3fb3157e` | `cli-substrate-adoption` | `substrate-abstraction-input` | `active-placement`, `arc-root`, `completed-placement`, `draft-prefix`, `meta-prefix`, `method-root`, `notes-prefix`, `planned-placement`, `roadmap-name`, `session-notes-name`, `spec-prefix`, `tasks-prefix`, `template-suffix`, `workflow-root`, `working-memory-name` | `captured-awaiting-housekeep` | Fifteen abstract concrete-path classes require one resolver/substrate ownership decision rather than independent path-literal migrations. | Use the mandatory substrate extract at grooming to define resolver responsibilities and consciously accept or reject each linked class. |
| `packet-d2d9f3e4799c94470c55111c` | `knowledge-architecture` | `knowledge-access-path-moves` | `internal-skill-root`, `strategy-family`, `strategy-index-name` | `captured-awaiting-housekeep` | The target knowledge model changes the strategy family, strategy index, and internal skill root across high- and low-fan-out quadrants. | Groom these classes as access-path consequences of the knowledge model and retain their canonical file sets for cascade planning. |
| `packet-dbd2103ffa3c4df953f89138` | `local-mode` | `team-mode-key` | `team-mode-key` | `captured-awaiting-housekeep` | The pending team-mode key change is an abstract configuration assumption spanning 37 files. | At grooming, settle the access and compatibility seam before scheduling the key rename. |
| `packet-edfd7344100348f1f6b6659c` | `arc-backend` | `storage-address-assumptions` | `arc-root`, `draft-prefix`, `meta-prefix`, `notes-prefix`, `spec-prefix`, `tasks-prefix`, `typed-branch-prefixes` | `captured-awaiting-housekeep` | The materialized backing-store design changes seven high-volatility address and artifact-family assumptions, all currently ranked abstract. | During grooming, decide which assumptions become backing-store or materialization contracts and preserve the ranked evidence as migration input. |
| `packet-ff5dc5d126f20b5461b3c71c` | `roadmap-tooling` | `roadmap-name` | `roadmap-name` | `captured-awaiting-housekeep` | The ROADMAP rename is an abstract 44-file document/path assumption with tracked-path evidence. | At grooming, make the project-readiness view name a single owned contract before planning the rename cascade. |

---

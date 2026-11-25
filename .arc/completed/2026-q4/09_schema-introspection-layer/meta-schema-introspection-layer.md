# Metadata: Schema-Driven CLI Introspection Layer

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P3`         |

- **Cohort:** `architecture-remediation`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-schema-introspection-layer.md`
- **Task List:** `tasks-schema-introspection-layer.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:e6c0a9a217dcebc7756bb2dd0486c661e5ec8faf42381bdf04f0afdb44214b88`

- **Current Workflow:** [none]
- **Last Completed:** Task 6.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** [none]

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/841>
- **Completed:** 2026-10-08

## Release Notes Entry

Registered CLI contracts are discoverable by name as self-contained JSON Schemas, with an editor publication channel
for contracts that opt in.

### Added

- `arc schema list` and `arc schema get <id>` expose live production registry identities, versions, migration
  postures, and Draft 2020-12 documents.
- `arc schema install` generates ignored, checkout-local documents for contracts marked for editor use. Checkout
  provisioning installs the same documents, and reference helpers support JSON and YAML project files.

### Changed

- Authored request contracts publish their input shape, keeping defaulted fields optional. Existing review and
  delivery schema commands use the shared self-contained projection while retaining their verbs and envelopes.

### Removed

- The build-time schema bundle and its separate producer and build identity.

### Fixed

- Tuple schemas retain their length bounds and compile under strict validation, including empty tuples.
- Reference folding preserves `$ref` keys inside instance data such as defaults, constants, and examples.

## Completion Notes

Delivered the registry publication design across discovery, reference folding, authored-side projection, cut-map
composition, editor generation and installation, and checkout provisioning. The build now qualifies CLI and metafile
output without a second schema publication channel. Fixture-owned seams retain build coordination and failure-path
coverage. No production contract opts into editor documents yet; the channel and its provisioning behavior are ready
for those consumers.

The accepted boundaries remain intact: one active schema per identity, no historical catalog or version selector,
no publication of configuration or managed operational-state schemas, and no change to the configuration reader or
managed Git ignore lists. Verification found and corrected reference rewriting inside JSON instance data without
widening the design. All 23 success criteria were met; none were superseded.

The full local gate passed Markdown, TypeScript and shell lint, ARC contract checks, both type checks, 17,010
unit/integration cases, and the full build. Another 61 focused built-CLI cases covered discovery, emitters,
installation and provisioning. Live checks established compact, self-contained schemas, authored input defaults,
strict validation, and actionable unknown-identity refusal. Provisioning fault injection covered rollback and
repaired retry.

The fresh criteria review converged on its first pass. A separate chunked standard review covered the complete source
target at `4039f1553`, including the three source chunks, lifecycle and contract seams, and fresh aggregate evaluation.
It converged on Pass 1 of 2 with no findings and a native exact-target receipt. The aggregate verified 147 changed
paths and 282 hunks; a proposed lost-concern finding was refuted by the existing draft-triage routing record.

---

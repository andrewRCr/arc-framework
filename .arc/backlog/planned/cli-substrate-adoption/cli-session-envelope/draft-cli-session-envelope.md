# Draft: cli-session-envelope

- **Origin:** [internal]
- **Cohort:** `cli-substrate-adoption`
- **Purpose:** Give the session-init and recovery envelope family one validated wire contract while preserving its
  existing protocol.

---

## Problem / Motivation

Session initialization is a high-value CLI-to-agent boundary with a broad structured payload, but its related
envelopes are enforced mainly through TypeScript types and consumer assumptions. A malformed producer can
therefore fail late in an agent workflow. The same area contains internal `Probe<T>` pipelines that duplicate
success/failure composition now supplied by the cohort kernel.

This member makes the entire envelope family explicit and validated without changing what agents receive.

## Goals

- Define schemas for session-init, compaction, recovery, and the nested load-set/task-cursor records they share.
- Validate producer output before it crosses the CLI boundary and validate external consumption gracefully.
- Replace internal asynchronous `Probe<T>` composition with the kernel's Result abstractions.
- Preserve all existing wire keys, variants, optionality, and error behavior.

## Non-Goals

- Redesign the session lifecycle, recovery verdict, context-loading policy, or workflow semantics.
- Change the wire envelope from `{ ok, value } | { ok, error }`.
- Migrate validators outside the session/compaction/recovery envelope family.
- Introduce an alternate transport or a public schema-introspection interface.

## Design Decisions

### Envelope ownership

This member owns schemas for the complete family so sibling validation work does not split one protocol across
two work units:

- the session-init response and its roughly 25 top-level/nested slots;
- load-set manifests, entries, read modes, and task-cursor records;
- compaction-seed payloads;
- recovery audit reports, comparisons, stop reasons, and verdicts;
- the shared `{ ok, value } | { ok, error }` envelope shape.

Schemas compose primitives from `cli-schema-kernel` and remain co-located with the session/recovery domain.

### Boundary behavior

- The CLI parses its assembled payload before emitting JSON. Producer-side schema failure is an internal defect and
  returns a deterministic non-zero command failure rather than invalid JSON.
- Consumers use `safeParse` for data read from disk, subprocess output, or another checkout. Validation failures
  enter the existing graceful error path with actionable path/context details.
- Producer validation is always on unless measurement shows material command latency. Any proposal to disable it
  requires evidence and a replacement invariant.
- Tests validate both successful emitted payloads and intentional malformed cases against the same registered
  schemas.

### Result migration

- Convert the session domain's internal asynchronous `Probe<T>` pipelines to `Result`/`ResultAsync` composition.
- Keep command and wire boundaries unchanged; unwrap results only at the established boundary adapters.
- Preserve error kinds and user-facing messages unless stronger structured context can be added compatibly.
- Do not use this focused migration as precedent for converting unrelated promise-returning APIs.

### Compatibility

The exact JSON representation is a compatibility surface. Key names, nesting, absence versus `null`, array order,
and the success/error discriminant must be characterized before refactoring and remain unchanged afterward.

## Delivery and Verification

- Capture representative ready, stop, malformed, planning, execution, integration, and cursorless recovery
  fixtures before changing production assembly.
- Add schema unit tests plus command-level tests that parse actual emitted JSON.
- Run consumer tests against malformed, older-compatible, and current payloads.
- Benchmark session-init producer validation in a warm and cold CLI process; retain always-on validation unless the
  cost is material.

## Alternatives

- **Validate only in consumers:** rejected because producer defects would still cross the trust boundary.
- **Validate only on emit:** rejected because disk and subprocess inputs remain untrusted at the consumer.
- **Split recovery into `cli-validation-surfaces`:** rejected because the envelope family evolves as one protocol.
- **Redesign the envelope while adding schemas:** rejected because it combines compatibility change with contract
  adoption.

## Risks

- A schema that encodes current TypeScript types incorrectly can create a wire regression while appearing safer.
- Producer validation can add noticeable cold-start latency if the schema graph is assembled inefficiently.
- Hand-written types could drift from schemas unless exports consistently use `z.infer`.
- Result conversion can accidentally alter short-circuit order or error context.

## Unknowns and Assumptions

- Confirm with measurement that always-on emit validation is effectively free; this is the recommended default.
- Inventory whether any consumers intentionally tolerate undocumented extra keys before choosing strictness at each
  nested object boundary.
- Assume the existing envelope compatibility tests are incomplete; characterization is part of this member.

## Scope Estimate

Medium (days-week). Class `Light`: the contract is determinate and contained despite its broad payload. Depends on
`cli-schema-kernel`.

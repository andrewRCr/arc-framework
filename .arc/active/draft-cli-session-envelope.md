# Draft: cli-session-envelope

- **Origin:** [internal]
- **Cohort:** `cli-substrate-adoption`
- **Purpose:** Give the session-init, recovery, and compaction-seed envelope family one validated wire contract —
  runtime-checked at the CLI boundary and typed off a single schema authority — while preserving its existing
  protocol byte-for-byte.

---

## Problem / Motivation

Session initialization is a high-value CLI-to-agent boundary with a broad structured payload, but its envelope
family is enforced mainly through hand-written TypeScript types and consumer assumptions. A malformed producer can
therefore fail late in an agent workflow rather than at the boundary that produced it. The same area carries
internal `Probe<T>` pipelines that duplicate the success/failure composition the cohort kernel now supplies as a
Result abstraction.

The envelope is a flat object of independently-fallible slots: the top level is a bare `{ mode, ...slots }` object
emitted by raw `JSON.stringify`, and each of the roughly 25 slots is a single-level `{ ok, value } | { ok, error }`
probe (plus a few bare scalar slots). Those slot values are rich domain types — around 28 distinct top-level value
types fanning out to roughly a hundred nested types — most owned by session-init, git, and per-command modules, not
by a cohort sibling. That shape is a compatibility surface many agent workflows dispatch on directly. This member
makes the envelope explicit and validated without changing what agents receive, and settles a defensible depth for
that validation rather than pretending every nested field is in reach at `Light`.

## Goals

- Define schemas for the session-init, recovery, and compaction-seed envelopes and the nested load-set and
  task-cursor records they share, composed from `cli-schema-kernel` primitives.
- Validate producer output before it crosses the CLI boundary, and validate external consumption gracefully — at a
  depth that always covers the envelope structure, the error channel, and the discriminant fields agents dispatch
  on (see § Validation depth for the full policy).
- Replace internal asynchronous `Probe<T>` composition with the kernel's `Result` / `ResultAsync` abstractions.
- Preserve every existing wire key, variant, optionality, and error behavior — including exact key order and
  absence-versus-`null` — so the emitted bytes are unchanged.

## Non-Goals

- Redesign the session lifecycle, recovery verdict, context-loading policy, or workflow semantics.
- Change the emitted wire shape: the bare `{ mode, ...slots }` top level and the per-slot
  `{ ok, value } | { ok, error }` algebra both stay exactly as they are. Internal Result composition may nest
  (a Result of Result-valued slots), but it is unwrapped at the emit boundary — no top-level `{ ok, value }` wrap
  reaches the wire.
- Add a version field to the top-level session-init or recovery envelope. They are computed fresh, consumed
  immediately, and have no deserializing re-reader; a version marker there would be an unused axis.
- Migrate the shared-infrastructure and deep-nested value types to schema-authority. Converting the git-lib
  primitives, the per-command `*SessionInitResult` types, and the husk / in-flight-oracle / base-drift nested webs
  to schema-as-authority ripples across sibling commands and the shared git API — a wholesale migration that routes
  to `cli-substrate-complete-migration` (see § Cross-cutting coordination). This member validates those slots'
  discriminants at the boundary but leaves their hand-written types authoritative.
- Build a public schema-introspection interface, or introduce an alternate transport. JSON over the existing
  command boundary stays the carrier.

## Design Decisions

### Envelope ownership and schema shape

This member owns schemas for the complete family so sibling validation work does not split one protocol across two
work units:

- the session-init response and its roughly 25 top-level and nested slots;
- load-set manifests, entries, read modes, and task-cursor records;
- compaction-seed payloads;
- recovery audit reports, comparisons, stop reasons, and verdicts;
- the shared per-slot `{ ok, value } | { ok, error }` probe shape.

The shape is flat, not recursive: a single reusable `probe(valueSchema)` combinator wraps each fallible slot, and
the handful of bare scalar slots (`inFlightComposition`, `cohortDocPath`, `recommendedCombinedPrompt`,
`compactionSeedWrite`) are typed directly. Schemas compose kernel vocabulary primitives and stay co-located with
the session and recovery domain. The envelope's slot views are this member's own; where one overlaps a record a
parallel fan member owns independently (`cli-validation-surfaces`' standalone config, meta-record, or sync-state
schemas), the two stay distinct — this member schematizes the envelope view, not the sibling's record, and does not
depend on it.

Schemas register with the kernel registry under stable ids for identity and internal composition. Registration is
not the same as publication: the shipped `schemas/kernel.json` bundle is projected from a fixed built-in vocabulary
seed, so appearing there — and thereby reaching the downstream introspection consumer — requires a separate build
wiring decision, tracked as a coordination seam rather than assumed (see § Cross-cutting coordination).

### Validation depth

Validation depth is set per slot class rather than uniformly, because the ~28 slot value types split cleanly by
ownership and reach:

- **Envelope structure and error channel — full, always.** The `{ ok, value } | { ok, error }` probe algebra, the
  `{ kind, message }` error shape, slot presence/absence, and the bare `{ mode, ...slots }` top level are fully
  schematized.
- **Genuine family records — full.** load-set, task-cursor, compaction-seed, and the recovery-audit verdict are the
  envelope family's own records; each gets a full schema, and the seed's existing hand-rolled validator is replaced
  by it.
- **Contained session-init advisory slots — full, schema-authority.** The roughly ten flat advisory slots with no
  external consumers (inbox-state, errand-staleness, partial-push-marker, materializable-work-units, orphan-branch,
  retired-subdir, recommended-action, class-composition, cascade, base-branch-sync, and peers) get a full Zod
  schema authored in their home module; the type derives via `z.infer` and the hand-written declaration is retired.
  Migrating their authority is contained — they have zero-to-one external importers — so drift is structurally
  eliminated where this member owns the surface.
- **Shared-infra and deep-nested slots — dispatch-discriminant only, here.** The git-lib primitives (dirty-state,
  worktree-sync, base-distance, worktree-roster), the per-command `*SessionInitResult` types, and the slots whose
  faithful schema would drag in shared nested webs (husk / cleanup / retirement-authority, the in-flight oracle,
  the base-drift analyzer, user session-init) are validated by a thin schema that pins the discriminant enums an
  agent branches on (`worktree.state`, `active.resolution`, `recommendedAction`, the base-drift verdict, the
  recovery stop-kind) and passes the rest of the payload through. Their hand-written types stay authoritative; full
  schema-authority migration routes to the tail (§ Cross-cutting coordination).

The thin schema is a deliberate runtime subset, not a mirror: it asserts only the discriminants, so it never
rejects otherwise-valid data and creates no full second definition to drift against. The dispatch enums it re-
encodes are the exact fields whose corruption would misroute a workflow, so the highest-value producer defects are
caught at the boundary today, and the tail tightens these to full schemas as it migrates their authority.

### Boundary behavior

- The CLI parses its assembled payload before emitting JSON. Producer-side schema failure is an internal defect and
  returns a deterministic non-zero command failure rather than invalid JSON.
- Producer validation is **validate-but-emit-the-original**: parse the assembled object for its throw-on-defect
  effect, then serialize the original assembled object, never the parsed copy. Emission is a raw `JSON.stringify`
  of an object literal whose key order is source order and whose absent-versus-`null` semantics come from
  conditional spreads; emitting a re-parsed object would risk reordering keys or turning an absent slot into a
  `null` one. Validation must not perturb the bytes.
- Consumers use `safeParse` for data read from disk, a subprocess, or another checkout. Validation failures enter
  the existing graceful error path with actionable path and context detail, and classify against the kernel error
  taxonomy.
- Producer validation is always on unless measurement shows material command latency. Any proposal to disable it
  requires evidence and a replacement invariant.
- Tests validate both successful emitted payloads and intentional malformed cases against the same schemas.

### Version and migration posture

Each schema registers with the kernel's `{ id, version, migrationPosture }` metadata. This metadata is
**declarative** — the registry validates and stores it but does not itself enforce parse behavior; the version
posture is a recorded intent that the schema's own parse path honors, not a mechanism the registry supplies.

- **Posture is `strict-current` across the whole family** — session-init, recovery, and the compaction-seed alike;
  `backward-compatible` is used nowhere. The only persisted, potentially cross-version artifact is the
  compaction-seed (a per-worktree file re-read by recovery after a harness compaction), and it is ephemeral:
  regenerated each session and torn down with its worktree. A version mismatch there safely degrades to seedless
  live recovery, so reject-and-recompute is correct and cross-version seed tolerance is unneeded.
- The seed's reject-on-mismatch and the load-set manifest-version guard stay hand-rolled in the parse path;
  registration records their version and posture but does not replace the enforcement. The top-level session-init
  and recovery envelopes stay versionless (no re-reader).
- Unknown-field tolerance (stripping extra keys on a consumer read) is orthogonal shape-hygiene, retained where it
  exists today; it is not the version posture.

### Result migration

- Convert the session domain's internal asynchronous `Probe<T>` pipelines to `Result` / `ResultAsync` composition.
  Adoption is greenfield — the kernel Result has no production consumers yet — and centers on the `safeProbe` seam
  and the handful of orchestrators that assemble the session-init, recovery, and handoff results, plus the
  `Promise<T>` slot producers that become `ResultAsync<T, ProbeError>`.
- Import `Result` / `ResultAsync` only through the kernel barrel; a compile-time boundary audit forbids importing
  the underlying library directly.
- Keep command and wire boundaries unchanged; unwrap results only at the established boundary adapters. Internal
  composition may be a Result of Result-valued slots; the emitted top level stays the bare `{ mode, ...slots }`
  object.
- **Error-channel byte-stability.** The wire per-slot error stays `{ kind: "identity-missing" | "runtime",
  message }`. Internally, error kinds may subclass the kernel error base (with a locally-exhaustive dotted-code
  union) for richer structured context, but an explicit boundary adapter maps that internal error back to the
  legacy `{ kind, message }` shape on emit. Emitting the dotted code, or a stringified error object, would be a
  silent wire regression — the mapping is required, not optional.
- Do not use this focused migration as precedent for converting unrelated promise-returning APIs.

### Compatibility

The exact JSON representation is a compatibility surface. Key names, nesting, absence versus `null`, array order,
and the success/error discriminant must be characterized before refactoring and remain unchanged afterward. Because
the payload is emitted as a raw `JSON.stringify` of a conditional-spread object literal, key order and
absent-versus-`null` are emergent from the producer code, not enforced anywhere today — the characterization golden
is what locks them.

## Cross-cutting coordination

- **Shared value-type authority migration → `cli-substrate-complete-migration`.** Full schema-authority (`z.infer`,
  hand-written type retired) for the ten shared-infra / command-owned value types and the deep nested webs (git
  primitives; the `*SessionInitResult` per-command types; the husk / cleanup / retirement-authority, in-flight
  oracle, base-drift, and user-session-init nested types) routes to the tail member, whose charter is first-party
  consumers on their final owning modules. This member hands the tail the enumerated inventory — the per-type
  table with the private/shared split, blast radius, and size buckets — so the tail inherits a scoped migration,
  not an open discovery. The tail also tightens this member's thin-discriminant slots to full schemas as it
  migrates their authority.
- **Shipped-bundle publication + introspection availability.** Making the registered envelope schemas appear in the
  shipped `schemas/kernel.json` (and thereby reach `schema-introspection-layer`) requires wiring a composed
  registry into the build projection, which currently emits a fixed vocabulary seed. Tracked as a seam, not
  claimed as an automatic effect of registration; resolved as a bounded follow-up rather than expanded into this
  member.
- **Routing mechanics.** These seams are recorded here as the planning record. The hand-off to the tail's stub is a
  gitignored `USER-INBOX` `WU_Target` capture made at planning close — not an edit to a sibling's tracked buffer
  from this branch.

## Delivery and Verification

- Characterize first, and mind the gap: the compaction-seed already has exact-shape characterization (whole-object
  round-trip, unknown-field stripping, all error kinds). The session-init and recovery-audit full shapes are
  effectively greenfield — existing end-to-end coverage spot-checks a few fields and re-declares slots loosely.
  Build a full-shape golden for the session-init and recovery-audit envelopes — with machine-specific values
  (paths, object ids, timestamps) normalized — before changing production assembly.
- Add schema unit tests plus command-level tests that parse actual emitted JSON. For the contained advisory slots,
  test the full schema; for the thin-discriminant slots, test that the dispatch enums are rejected when corrupted
  and that valid payloads pass through unperturbed.
- Run consumer tests against malformed, older-seed, and current payloads on the seed read path.
- Benchmark session-init producer validation in a warm and a cold CLI process; retain always-on validation unless
  the cost is material.

## Alternatives

- **Validate only in consumers:** rejected because producer defects would still cross the trust boundary.
- **Validate only on emit:** rejected because disk and subprocess inputs remain untrusted at the consumer.
- **Split recovery into a sibling validation member:** rejected because the envelope family evolves as one protocol.
- **Redesign the envelope while adding schemas:** rejected because it combines a compatibility change with contract
  adoption.
- **Wrap the top-level envelope in `{ ok, value }` (probe-of-probes on the wire):** rejected. It would break the
  bare top-level shape agent workflows dispatch on directly, for little gain — total assembly failure is already
  handled by the workflow's probe-failure fallback, and the one failure mode that benefits from a structured parse
  result (reading the persisted seed) already has one on the consumer side. The compositional value lives in the
  internal Result pipeline, captured by unwrapping at the boundary rather than by changing the wire.
- **`backward-compatible` posture for the compaction-seed:** rejected because the seed is ephemeral and safely
  recomputed; `strict-current` with graceful fallback is the composable choice.
- **Uniform deep schemas for every slot value (full C, in this member):** rejected on scope. The ~28 value types
  fan out to roughly a hundred nested types across git primitives, sibling commands, and three deep webs; half
  carry dispatch unions the schema must re-encode exactly. Doing all of it here is a week-plus, cross-subsystem job
  that crosses this member's family boundary — it belongs at the tail. The seam-aligned split (full authority for
  the contained advisories, discriminant validation for the rest, full migration routed onward) is the depth that
  fits `Light`.
- **Structural-only validation for the shared slots (`probe(z.unknown())`):** rejected as the interim posture. It
  adds no duplication but leaves the dispatch discriminants — the defects that actually misroute a workflow —
  unvalidated until the tail lands. The thin-discriminant check is a small, bounded cost for real interim
  protection.

## Risks

- A schema that encodes current TypeScript types incorrectly can create a wire regression while appearing safer —
  mitigated by characterizing the exact shape first and locking it with a golden.
- Emitting a re-parsed object instead of the original could silently reorder keys or flip absence to `null`;
  validate-but-emit-the-original plus the golden guard against it.
- A naive error conversion (emitting a dotted code or stringified error) would regress the wire error shape; the
  explicit internal-to-`{ kind, message }` boundary adapter is the guard.
- Producer validation can add noticeable cold-start latency if the schema graph is assembled inefficiently —
  measured, not assumed.
- Result conversion can accidentally alter short-circuit order or error context.
- Drift is structurally removed only where this member takes schema-authority (the contained advisories and family
  records, via `z.infer`). The shared and deep value types keep a hand-written type plus a thin discriminant schema
  until the tail migrates them; the golden and the compose-site typecheck bound that interim exposure, and the
  routed inventory keeps the follow-up from being lost.

## Unknowns and Assumptions

- Confirm with measurement that always-on emit validation is effectively free; this is the recommended default.
- Assume the ~28-type sizing (private/shared split, blast radius) holds as the schemas are authored; a value type
  that proves to have more external reach than sized moves from the contained set to the tail-routed set, not into
  a wider in-member scope.

## Scope Estimate

Medium (days–week). Class `Light`, at the upper edge. The in-member work is bounded and mostly mechanical: the
envelope-structure, error-channel, and four family-record schemas; full schema-authority for roughly ten flat,
zero-consumer advisory slots (a few-days job on precise existing types); thin-discriminant schemas for the shared
slots; and a greenfield `Probe<T>`-to-`Result` migration under a byte-stability constraint. The genuinely `Heavy`
part — full authority migration of the shared-infra and deep-nested value types across sibling commands and the
git API — is routed to `cli-substrate-complete-migration`, which is what keeps this member `Light`. Depends on
`cli-schema-kernel` (shipped).

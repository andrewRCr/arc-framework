# Spec (`outline`): cli-session-envelope

- **Origin:** [internal]

- **Purpose:** Give the session-init, recovery, and compaction-seed envelope family one validated wire contract —
  runtime-checked at the CLI boundary and typed off a single schema authority — while preserving its existing
  protocol byte-for-byte.

---

## Problem / Context

Session initialization is a high-value CLI-to-agent boundary carrying a broad structured payload, but its envelope
family is enforced mainly through hand-written TypeScript types and consumer assumptions. A malformed producer can
therefore fail late inside an agent workflow rather than at the boundary that produced it. The same area still runs
internal asynchronous `Probe<T>` pipelines that duplicate the success/failure composition the cohort kernel now
supplies as a `Result` abstraction.

The envelope is a flat object of independently-fallible slots: the top level is a bare `{ mode, ...slots }` object
emitted by raw `JSON.stringify`, and each of the roughly 25 slots is a single-level `{ ok, value } | { ok, error }`
probe (plus a few bare scalar slots). Those slot values are rich domain types — around 28 distinct top-level value
types fanning out to roughly a hundred nested types — most owned by session-init, git, and per-command modules, not
by a cohort sibling. That exact shape is a compatibility surface many agent workflows dispatch on directly. This
member makes the envelope explicit and validated without changing what agents receive, and settles a defensible
depth for that validation rather than pretending every nested field is in reach at `Light`.

## Decision(s)

- **Own schemas for the complete envelope family, in one member.** We will define schemas for the session-init
  response and its roughly 25 top-level and nested slots, the load-set manifests / entries / read-modes and
  task-cursor records they share, compaction-seed payloads, and recovery audit reports / comparisons / stop-reasons
  / verdicts — plus the shared per-slot `{ ok, value } | { ok, error }` probe shape. Splitting one protocol across
  two work units would fracture the contract, so the whole family lands here; `cli-validation-surfaces` keeps its
  standalone config / meta-record / sync-state schemas, and where an envelope slot view overlaps one of those
  records the two stay distinct (this member schematizes the envelope view, not the sibling's record, and does not
  depend on it).

- **Compose, don't recurse: a flat `probe()` combinator.** The shape is flat, not recursive — a single reusable
  `probe(valueSchema)` combinator wraps each fallible slot, and the handful of bare scalar slots
  (`inFlightComposition`, `cohortDocPath`, `recommendedCombinedPrompt`, `compactionSeedWrite`) are typed directly.
  Schemas compose kernel vocabulary primitives and stay co-located with the session and recovery domain.

- **Register under stable ids; registration is not publication.** Schemas register with the kernel registry under
  stable ids for identity and internal composition. Appearing in the shipped `schemas/kernel.json` bundle (and
  thereby reaching the downstream introspection consumer) is projected from a fixed vocabulary seed and requires a
  separate build-wiring decision — tracked as a coordination seam, not assumed (see § Cross-cutting coordination).

- **Set validation depth per slot class, not uniformly** — because the ~28 slot value types split cleanly by
  ownership and reach:
    - **Envelope structure and error channel — full, always.** The `{ ok, value } | { ok, error }` probe algebra,
      the `{ kind, message }` error shape, slot presence/absence, and the bare `{ mode, ...slots }` top level are
      fully schematized.
    - **Genuine family records — full.** Load-set, task-cursor, compaction-seed, and the recovery-audit verdict are
      the family's own records; each gets a full schema, and the seed's existing hand-rolled validator is replaced
      by it.
    - **Contained advisory slots — full, schema-authority.** The roughly ten flat advisory slots with zero-to-one
      external consumers (inbox-state, errand-staleness, partial-push-marker, materializable-work-units,
      orphan-branch, retired-subdir, class-composition, cascade, and base-branch-sync — `recommendedAction` is a
      discriminant embedded in shared slots, not a slot of its own) get a full Zod schema authored in their home
      module; the type derives via `z.infer` and the hand-written
      declaration is retired. Their contained reach makes taking authority safe, so drift is structurally
      eliminated where this member owns the surface.
    - **Shared-infra and deep-nested slots — dispatch-discriminant only, here.** The git-lib primitives
      (dirty-state, worktree-sync, base-distance, worktree-roster), the per-command `*SessionInitResult` types, and
      the slots whose faithful schema would drag in shared nested webs (husk / cleanup / retirement-authority, the
      in-flight oracle, the base-drift analyzer, user session-init) are validated by a thin schema that pins the
      discriminant enums an agent branches on (`worktree.state`, `active.resolution`, `recommendedAction`, and the
      base-drift verdict) and passes the rest of the payload through. Their hand-written
      types stay authoritative; full schema-authority migration routes to the tail (see § Cross-cutting
      coordination). The thin schema is a deliberate runtime subset, not a mirror — it asserts only the
      discriminants, so it never rejects otherwise-valid data and creates no second definition to drift against,
      while catching the exact producer defects that would misroute a workflow.

- **Validate-but-emit-the-original at the producer boundary.** The CLI parses its assembled payload for the
  throw-on-defect effect, then serializes the **original** assembled object, never the parsed copy. Emission is a
  raw `JSON.stringify` of an object literal whose key order is source order and whose absent-versus-`null`
  semantics come from conditional spreads; emitting a re-parsed object would risk reordering keys or turning an
  absent slot into a `null` one. A producer-side schema failure on the session-init or recovery envelope is an
  internal defect and returns a deterministic non-zero command failure rather than invalid JSON. The
  compaction-seed producer is the deliberate exception — it runs as a non-fatal side effect of session-init, so a
  seed schema failure folds into the `compactionSeedWrite` slot and the session-init envelope still emits; a seed
  defect never blocks compaction or fails the command. Producer validation stays always-on unless measurement shows
  material command latency, and any proposal to disable it requires evidence and a replacement invariant.

- **Consumers use `safeParse` on untrusted reads.** Data read from disk, a subprocess, or another checkout parses
  through `safeParse`; validation failures enter the existing graceful error path with actionable path and context
  detail and classify against the kernel error taxonomy.

- **`strict-current` posture across the whole family.** Each schema registers with the kernel's
  `{ id, version, migrationPosture }` metadata, which is **declarative** — the registry validates and stores it
  but does not itself enforce parse behavior. Posture is `strict-current` for session-init, recovery, and the
  compaction-seed alike; `backward-compatible` is used nowhere. The only persisted, potentially cross-version
  artifact is the compaction-seed — ephemeral, regenerated each session and torn down with its worktree — and a
  version mismatch there safely degrades to seedless live recovery, so reject-and-recompute is correct and
  cross-version seed tolerance is unneeded. The seed's reject-on-mismatch and the load-set manifest-version guard
  stay hand-rolled in the parse path; registration records their version and posture but does not replace the
  enforcement. The top-level session-init and recovery envelopes stay versionless — they are computed fresh,
  consumed immediately, and have no deserializing re-reader, so a version marker there would be an unused axis.

- **Migrate internal `Probe<T>` to kernel `Result` / `ResultAsync`.** Convert the session domain's internal
  asynchronous `Probe<T>` pipelines to `Result` / `ResultAsync` composition — greenfield adoption (the kernel
  Result has no production consumers yet), centered on the `safeProbe` seam, the orchestrators that assemble the
  session-init / recovery / handoff results, and the `Promise<T>` slot producers that become
  `ResultAsync<T, ProbeError>`. Import `Result` / `ResultAsync` only through the kernel barrel, enforced by a
  compile-time boundary audit. Internal composition may nest as a Result of Result-valued slots, but it is
  unwrapped at the established boundary adapters — the emitted top level stays the bare `{ mode, ...slots }`
  object. This focused migration is not precedent for converting unrelated promise-returning APIs.

- **Preserve the wire error shape with an explicit boundary adapter.** The wire per-slot error stays
  `{ kind: "identity-missing" | "runtime", message }`. Internal error kinds may subclass the kernel error base
  (with a locally-exhaustive dotted-code union) for richer structured context, but an explicit boundary adapter
  maps that internal error back to the legacy `{ kind, message }` shape on emit. Emitting the dotted code, or a
  stringified error object, would be a silent wire regression — the mapping is required, not optional.

- **Lock the exact JSON representation with a characterization golden.** Key names, nesting, absence-versus-`null`,
  array order, and the success/error discriminant are a compatibility surface. Because the payload is emitted as a
  raw `JSON.stringify` of a conditional-spread object literal, that order and absence semantics are emergent from
  the producer code and enforced nowhere today — a full-shape characterization golden (machine-specific values
  normalized) is what locks them, built before production assembly changes.

## Scope boundary (No-gos)

- **No lifecycle redesign.** The session lifecycle, recovery verdict, context-loading policy, and workflow
  semantics are untouched — this is a validation-and-composition change, not a behavior change.
- **No change to the emitted wire shape.** The bare `{ mode, ...slots }` top level and the per-slot
  `{ ok, value } | { ok, error }` algebra both stay exactly as they are. Internal Result composition may nest, but
  it is unwrapped at the emit boundary — no top-level `{ ok, value }` wrap reaches the wire.
- **No version field on the top-level session-init or recovery envelope.** They are computed fresh, consumed
  immediately, and have no deserializing re-reader; a version marker there would be an unused axis.
- **No schema-authority migration of the shared-infra and deep-nested value types.** Converting the git-lib
  primitives, the per-command `*SessionInitResult` types, and the husk / in-flight-oracle / base-drift nested webs
  to schema-as-authority ripples across sibling commands and the shared git API — a wholesale migration that
  routes to `cli-substrate-complete-migration`. This member validates those slots' discriminants at the boundary
  but leaves their hand-written types authoritative.
- **No validation or characterization golden for the handoff or full-mode `status` envelopes.** The
  `Probe<T>`→`Result` migration touches the shared `safeProbe` / `buildSessionSharedSlots` seam that the handoff
  (`session-handoff`) and full-mode (`full`) `status` orchestrators also ride, but those envelopes sit outside this
  member's charter — the cohort scopes it to the session-init, recovery, and compaction-seed family. Their shared
  slots stay byte-covered transitively by the session-init golden (they are the same `buildSessionSharedSlots`
  shapes), and their unique-slot producer changes are bounded by the compose-site typecheck; full schema and golden
  coverage for those envelopes is left to their own future work, not silently absorbed here.
- **No public schema-introspection interface and no alternate transport.** JSON over the existing command boundary
  stays the carrier.

## Consequences & Risks

- **Drift is structurally removed only where this member takes schema-authority** — the contained advisories and
  family records, via `z.infer`. The shared and deep value types keep a hand-written type plus a thin discriminant
  schema until the tail migrates them; the characterization golden and the compose-site typecheck bound that
  interim exposure, and the routed inventory keeps the follow-up from being lost.
- **A schema that encodes a current TypeScript type incorrectly could create a wire regression while appearing
  safer** — mitigated by characterizing the exact shape first and locking it with the golden.
- **Emitting a re-parsed object instead of the original could silently reorder keys or flip absence to `null`** —
  guarded by validate-but-emit-the-original plus the golden.
- **A naive error conversion (emitting a dotted code or a stringified error) would regress the wire error shape** —
  guarded by the explicit internal-to-`{ kind, message }` boundary adapter.
- **Producer validation can add noticeable cold-start latency if the schema graph is assembled inefficiently** —
  measured, not assumed; always-on validation is retained unless the cost proves material.
- **Result conversion can accidentally alter short-circuit order or error context** — contained by unwrapping only
  at the established boundary adapters and keeping command/wire boundaries unchanged.

## Success Criteria

- A full-shape characterization golden exists for the session-init and recovery-audit envelopes, with
  machine-specific values (paths, object ids, timestamps) normalized, and lands **before** production assembly
  changes; the emitted bytes match it afterward — key order, nesting, absence-versus-`null`, array order, and the
  success/error discriminant all unchanged.
- The session-init, recovery, and compaction-seed envelopes and the shared load-set and task-cursor records
  validate through schemas composed from kernel primitives at the producer boundary; an intentional producer
  defect returns a deterministic non-zero command failure rather than invalid JSON.
- The roughly ten contained advisory slots derive their type via `z.infer` from a home-module schema, and their
  hand-written declarations are retired.
- The shared-infra and deep-nested slots validate their dispatch discriminants (`worktree.state`,
  `active.resolution`, `recommendedAction`, the base-drift verdict, the recovery stop-kind) at the boundary:
  a corrupted discriminant is rejected, and an otherwise-valid payload passes through unperturbed.
- The compaction-seed's hand-rolled validator is replaced by its schema; a version or shape mismatch degrades to
  seedless live recovery (reject-and-recompute), verified on the seed read path against malformed, older-seed, and
  current payloads.
- The session domain's internal asynchronous `Probe<T>` pipelines compose via kernel `Result` / `ResultAsync`,
  imported only through the kernel barrel — a compile-time boundary audit forbids importing the underlying library
  directly — while the emitted top level stays the bare `{ mode, ...slots }` object and the per-slot wire error
  stays `{ kind, message }`.
- Producer validation is always-on, and a benchmark in a warm and a cold CLI process shows no material added
  latency; if the cost is material, an evidence-backed decision and a replacement invariant are recorded instead.
- Tests cover both successful emitted payloads and intentional malformed cases against the same schemas: the full
  schema for the contained advisory slots, and dispatch-enum rejection plus unperturbed pass-through for the
  thin-discriminant slots.

## Cross-cutting coordination

Recorded here as the planning record and verified at planning close — not as implementation-phase work. The
hand-off to a sibling's stub is a gitignored `USER-INBOX` `WU_Target` capture, never an edit to a sibling's
tracked buffer from this branch.

- **Shared value-type authority migration → `cli-substrate-complete-migration`.** Full schema-authority
  (`z.infer`, hand-written type retired) for the shared-infra / command-owned value types and the deep nested webs
  (git primitives; the `*SessionInitResult` per-command types; the husk / cleanup / retirement-authority,
  in-flight oracle, base-drift, and user-session-init nested types) routes to the tail member. This member hands
  the tail the **enumerated inventory of that routed set** — each type with its home module, external blast-radius,
  and size bucket — so the tail inherits a scoped migration rather than an open re-discovery. The tail also
  tightens this member's thin-discriminant slots to full schemas as it migrates their authority. The inventory is
  graduated into a `notes-cli-session-envelope.md` companion at this stage's finalize and carried on the routed
  capture.
- **Shipped-bundle publication and introspection availability.** Making the registered envelope schemas appear in
  the shipped `schemas/kernel.json` (and thereby reach `schema-introspection-layer`) requires wiring a composed
  registry into the build projection, which currently emits a fixed vocabulary seed. Tracked as a bounded
  follow-up seam, not claimed as an automatic effect of registration.

## Open items

- Confirm by measurement that always-on producer/emit validation adds no material command latency — the
  recommended default is to keep it on; a material result triggers the evidence-plus-replacement-invariant path
  above rather than a silent disable.
- The ~28-type sizing (the private/shared split and each type's blast-radius) is assumed to hold as the schemas are
  authored. A slot that proves to have more external reach than sized moves from the contained set to the
  tail-routed set — not into a wider in-member scope.

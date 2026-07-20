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
depth for that validation rather than pretending every nested field belongs in one bounded member.

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
  `probe(valueSchema)` combinator wraps each fallible slot, and the handful of non-probe slots
  (`inFlightComposition`, `cohortDocPath`, `recommendedCombinedPrompt`, `compactionSeedWrite`) compose directly.
  Schemas compose kernel vocabulary primitives and stay co-located with the session and recovery domain.

- **Register under stable ids; registration is not publication.** A fresh `createSessionEnvelopeRegistry()` starts
  from `createKernelRegistry()` and centrally registers subsystem roots exported from their owning modules. The
  initial registered roots are fixed below; each uses version 1 and `strict-current` posture.

  | Registry id                            | Schema root                              |
  |----------------------------------------|------------------------------------------|
  | `load-set-manifest`                    | load-set manifest                        |
  | `task-list-cursor`                     | durable task-list cursor                 |
  | `task-list-cursor-file-result`         | file-backed cursor result                |
  | `compaction-seed`                      | persisted compaction seed                |
  | `load-set-audit-verdict`               | load-set recovery comparison             |
  | `recovery-audit-verdict`               | deterministic recovery verdict           |
  | `inbox-state`                          | inbox-state advisory                     |
  | `errand-staleness-sweep`               | stale-errand advisory                    |
  | `notes-compaction-session-advisory`    | notes-compaction session advisory        |
  | `materializable-work-units`            | materializable-work-unit advisory        |
  | `orphan-branch-sweep`                  | orphan-branch advisory                   |
  | `retired-subdir-detection`             | retired-subdirectory advisory            |
  | `partial-push-marker-surface`          | partial-push-marker advisory             |
  | `class-composition`                    | resolved-Class composition               |
  | `cascade-resolution`                   | branch-gone cascade resolution           |
  | `base-branch-sync`                     | base-branch synchronization advisory     |
  | `session-init-envelope`                | complete session-init envelope           |
  | `session-recover-envelope`             | lean session-recovery envelope           |
  | `recovery-audit-report`                | recovery-audit handler report            |

  Thin pass-through views are deliberately incomplete composition helpers, not independently meaningful schema
  roots, so they do not receive registry identities. The registry contains full authoritative records and the
  three complete top-level contracts above.

  Appearing in the shipped `schemas/kernel.json` bundle (and thereby reaching the downstream introspection consumer)
  is projected from a fixed vocabulary seed and requires a separate build-wiring decision — tracked as a
  coordination seam, not assumed (see § Cross-cutting coordination).

- **Set validation depth per slot class, not uniformly** — because the ~28 slot value types split cleanly by
  ownership and reach:
    - **Envelope structure and error channel — full, always.** The `{ ok, value } | { ok, error }` probe algebra,
      the `{ kind, message }` error shape, slot presence/absence, and the bare `{ mode, ...slots }` top level are
      fully schematized. Conditional-slot refinements encode the observable producer domain: two-way presence
      where the current envelope exposes a deterministic gate, one-way `present implies gate` constraints where a
      degraded or hidden helper can legitimately omit the slot, and invocation-only optionality for
      `compactionSeedWrite`. They do not reconstruct cleanup-roster results or command flags that are absent from
      the wire contract.
    - **Genuine family records — full.** Load-set, task-cursor, compaction-seed, and the recovery-audit verdict are
      the family's own records; each gets a full schema, and the seed's existing hand-rolled validator is replaced
      by it.
    - **Contained advisory slots — full, schema-authority.** The ten flat advisory slots with zero-to-one external
      consumers (inbox-state, errand-staleness, notes-compaction, partial-push-marker,
      materializable-work-units, orphan-branch, retired-subdir, class-composition, cascade, and base-branch-sync —
      `recommendedAction` is a discriminant embedded in shared slots, not a slot of its own) get a full Zod schema
      authored in their home module; the type derives via `z.infer` and the hand-written declaration is retired.
      Full schemas encode the actual producer domain, including derived-field consistency and valid discriminated
      arms, rather than accepting structurally plausible records the producer cannot emit. Their contained reach
      makes taking authority safe, so drift is structurally eliminated where this member owns the surface.
      Notes-compaction takes authority only for its local session-envelope view; the shared
      `NotesCompactionAdvisory` and `NudgeMarkerState` contracts remain handwritten and outside this migration.
      Genuine work-unit identities compose the kernel `SlugSchema`, while the stale-errand payload's legacy `slug`
      field remains a non-empty inbox-entry title rather than being reinterpreted as a path-safe slug. The
      stale-errand `created` field retains the producer's existing `Date.parse` compatibility domain, including its
      normalization of regex-shaped impossible dates; strict calendar validation is a separate behavior correction,
      not part of this byte-stable migration.
    - **Shared-infra and deep-nested slots — routing-field only, here.** The git-lib primitives
      (dirty-state, worktree-sync, base-distance, worktree-roster), the per-command `*SessionInitResult` types, and
      the slots whose faithful schema would drag in shared nested webs (husk / cleanup / retirement-authority, the
      in-flight oracle, the base-drift analyzer, user session-init) are validated by a thin schema that pins only
      the routing fields an agent branches on, including nested kind/state/action enums, resumability and nudge
      gates, worktree identity, and the session config policy domains. The exact projection lives in
      `notes-cli-session-envelope.md` § Thin validation field map. Every unowned field passes through. Their
      hand-written types stay authoritative; full schema-authority migration routes to the tail (see
      § Cross-cutting coordination). The thin schema is a deliberate runtime subset, not a mirror, so it catches
      producer defects that would misroute a workflow without creating a second full definition to drift against.

- **Typecheck the deliberate subset in one direction.** `SessionInitProbeResult` and `SessionRecoverProbeResult`
  must remain assignable to their composed schema input types, proving the handwritten producers fit every pinned
  field. The reverse direction is intentionally false because thin pass-through views do not claim full type
  authority. Full family and contained records still derive from their schemas through `z.infer`.

- **Validate-but-emit-the-original at the producer boundary.** The CLI parses its assembled payload for the
  throw-on-defect effect, then serializes the **original** assembled object, never the parsed copy. Emission is a
  raw `JSON.stringify` of an object literal whose key order is source order and whose absent-versus-`null`
  semantics come from conditional spreads; emitting a re-parsed object would risk reordering keys or turning an
  absent slot into a `null` one. The session-init, lean-recovery, and recovery-report roots are strict objects:
  undeclared top-level keys fail validation rather than being stripped from the discarded parsed copy and then
  leaking from the original object at serialization. A producer-side schema failure on the session-init or recovery
  envelope is an internal defect and returns a deterministic non-zero command failure rather than invalid JSON. The
  compaction-seed producer is the deliberate exception — it runs as a non-fatal side effect of session-init, so a
  seed schema failure folds into the `compactionSeedWrite` slot and the session-init envelope still emits; a seed
  defect never blocks compaction or fails the command. Producer validation stays always-on unless measurement shows
  material command latency under the protocol below, and any proposal to disable it requires evidence and a
  replacement invariant. A shared assertion boundary gives internal producer defects a stable
  `session-envelope.invalid` error with the contract id and normalized issue paths; the existing top-level CLI error
  boundary owns the non-zero exit and stderr rendering, so no handler emits partial JSON or locally reinterprets the
  defect.

- **Consumers use `safeParse` on untrusted reads.** Data read from disk, a subprocess, or another checkout parses
  through `safeParse`; validation failures enter the existing graceful error path with actionable path and context
  detail and classify against the kernel error taxonomy. A malformed, schema-invalid, or version-mismatched persisted
  compaction seed produces a valid `recover-audit` report stopped with `seed-invalid`; it does not throw, run the live
  recovery probes, or invent a replacement audit baseline.

- **Owned producer records and complete wire roots are strict; the persisted seed reader retains unknown-key
  stripping.** Full producer schemas reject branch-specific leakage, and the three top-level wire roots reject
  undeclared keys because producer validation emits the original object. Nested thin routing views remain
  pass-through by design. The compaction-seed reader preserves its established compatibility behavior: unknown keys
  at the seed, cursor, load-set, entry, and read-mode levels are stripped before the canonical value returns. Strict
  producer schemas and stripping reader variants derive from the same field-shape definitions, so compatibility
  does not create a second type authority.

- **`strict-current` posture across the whole family.** Each schema registers with the kernel's
  `{ id, version, migrationPosture }` metadata, which is **declarative** — the registry validates and stores it
  but does not itself enforce parse behavior. Posture is `strict-current` for session-init, recovery, and the
  compaction-seed alike; `backward-compatible` is used nowhere. The only persisted, potentially cross-version
  artifact is the compaction-seed — ephemeral, regenerated each session and torn down with its worktree — and a
  version mismatch there fails closed as a structured `seed-invalid` recovery stop, so cross-version seed tolerance
  is unneeded. Recovery cannot recompute a trustworthy audit baseline from live state alone; proceeding requires
  direction or a fresh seed at a new boundary. The seed's reject-on-mismatch and the load-set manifest-version guard
  stay hand-rolled in the parse path; registration records their version and posture but does not replace the
  enforcement. The top-level session-init and recovery envelopes stay versionless — they are computed fresh,
  consumed immediately, and have no deserializing re-reader, so a version marker there would be an unused axis.

- **Migrate each present `Probe<T>` slot to an independent kernel `Result` / `ResultAsync`.** Convert the session
  domain's internal asynchronous probe pipelines to `ResultAsync<T, SessionStatusError>` — greenfield adoption
  (the kernel Result has no production consumers yet), centered on the shared `safeProbe` seam and the four status
  orchestrators. Start eager probes independently and resolve their individual Results through the existing
  `Promise.all` fan-out; do not aggregate sibling slots with `ResultAsync.combine`, because one failed Result must
  not erase the other slots' outcomes. Optional absence stays outside the Result algebra as `undefined` or `null`,
  never `Ok(undefined)`, while mandatory identity absence is an `Err`. Each present slot converts once at final
  envelope construction, so the emitted top level remains the bare `{ mode, ...slots }` object. The kernel Result
  surface adds `okAsync` / `errAsync` for immediate branches, and every Result import enters through the kernel
  barrel under the existing compile-time boundary audit. This focused migration is not precedent for converting
  unrelated promise-returning APIs.

- **Preserve the wire error shape with an explicit boundary adapter.** The wire per-slot error stays
  `{ kind: "identity-missing" | "runtime", message }`. A focused `commands/status/result-composition.ts` module
  owns `SessionIdentityMissingError` (`session.identity-missing`), `SessionProbeError` (`session.probe-failed`),
  `SessionCompositionError` (`session.composition-failed`), the Result helpers, and the sole `toProbe()` adapter.
  Probe errors retain slot context, composition errors retain operation/slot context, and both preserve the
  original cause; messages retain `Error.message` or `String(cause)` for non-`Error` failures. The adapter maps
  identity absence to wire `identity-missing` and both failure variants to wire `runtime`, preserving the message.
  Known synchronous load-set projection failures enter the composition variant explicitly; pure enrichment and
  other programmer defects are not blanket-caught into arbitrary slots. Emitting a dotted internal code or a
  stringified error object would be a silent wire regression.

- **Lock the exact JSON representation with a characterization golden matrix.** Key names, nesting,
  absence-versus-`null`, array order, and the success/error discriminant are a compatibility surface. Because the
  payload is emitted as a raw `JSON.stringify` of a conditional-spread object literal, that order and absence
  semantics are emergent from the producer code and enforced nowhere today. Four normalized successful
  session-init arms — Orient/materialization, linked active resume, linked branchless current-husk, and branch-gone
  recovery — lock every conditional insertion region without testing the Cartesian product; ready and stopped
  recovery-audit goldens lock the report family. These baselines land before production assembly changes.

- **Measure validation without a production bypass.** A dev-only, non-CI benchmark pairs the real session-init
  assertion with a no-op fixture consumption in-process, using the same valid pre-normalization characterization
  fixture. It separately measures repeated cold process invocations of the production built CLI against a stable,
  local-only session fixture; the CLI validation path is never disabled. The default run discards 20 warm samples
  then records 1,000 paired warm samples, and discards 5 cold CLI samples then records 30. It reports runtime,
  Node/npm versions, sample counts, fixture/build procedure, p50, and p95. Cost is material when validation p50
  exceeds 5 ms or 5% of cold-command p50, or validation p95 exceeds 20 ms. The benchmark is evidence rather than a
  flaky CI assertion; crossing a threshold stops for an evidence-plus-replacement-invariant decision.

## Scope boundary (No-gos)

- **No lifecycle redesign.** The session lifecycle, recovery verdict, context-loading policy, and workflow
  semantics are untouched — this is a validation-and-composition change, not a behavior change.
- **No change to the emitted wire shape.** The bare `{ mode, ...slots }` top level and the per-slot
  `{ ok, value } | { ok, error }` algebra both stay exactly as they are. Internal Results remain independent per
  present slot, optional absence remains outside the algebra, and each slot is unwrapped at the emit boundary — no
  top-level `{ ok, value }` wrap reaches the wire.
- **No version field on the top-level session-init or recovery envelope.** They are computed fresh, consumed
  immediately, and have no deserializing re-reader; a version marker there would be an unused axis.
- **No schema-authority migration of the shared-infra and deep-nested value types.** Converting the git-lib
  primitives, the per-command `*SessionInitResult` types, and the husk / in-flight-oracle / base-drift nested webs
  to schema-as-authority ripples across sibling commands and the shared git API — a wholesale migration that
  routes to `cli-substrate-complete-migration`. This member validates those slots' mapped routing fields at the
  boundary but leaves their hand-written types authoritative.
- **No validation or characterization golden for the handoff or full-mode `status` envelopes.** The
  `Probe<T>`→`Result` migration touches the shared `safeProbe` / `buildSessionSharedSlots` seam that the handoff
  (`session-handoff`) and full-mode (`full`) `status` orchestrators also ride, but those envelopes sit outside this
  member's charter — the cohort scopes it to the session-init, recovery, and compaction-seed family. Their shared
  slots stay byte-covered transitively by the session-init golden matrix (they are the same
  `buildSessionSharedSlots` shapes), and their unique-slot producer changes are bounded by the compose-site
  typecheck; full schema and golden coverage for those envelopes is left to their own future work, not silently
  absorbed here.
- **No public schema-introspection interface and no alternate transport.** JSON over the existing command boundary
  stays the carrier.

## Consequences & Risks

- **Drift is structurally removed only where this member takes schema-authority** — the contained advisories and
  family records, via `z.infer`. The shared and deep value types keep a hand-written type plus a thin routing-field
  schema until the tail migrates them; the characterization golden matrix and the compose-site typecheck bound that
  interim exposure, and the routed inventory keeps the follow-up from being lost.
- **A schema that encodes a current TypeScript type incorrectly could create a wire regression while appearing
  safer** — mitigated by characterizing the exact shape first and locking it with the golden.
- **Emitting a re-parsed object instead of the original could silently reorder keys or flip absence to `null`** —
  guarded by validate-but-emit-the-original plus the golden.
- **A naive error conversion (emitting a dotted code or a stringified error) would regress the wire error shape** —
  guarded by the explicit internal-to-`{ kind, message }` boundary adapter.
- **Producer validation can add noticeable cold-start latency if the schema graph is assembled inefficiently** —
  measured under the fixed warm/cold protocol without a production bypass; always-on validation is retained unless
  the declared threshold is crossed.
- **Result conversion can accidentally alter short-circuit order or error context** — contained by unwrapping only
  at the established boundary adapters and keeping command/wire boundaries unchanged.

## Success Criteria

- A full-shape characterization golden matrix exists for the session-init and recovery-audit envelopes, with
  machine-specific values (paths, object ids, timestamps) normalized, and lands **before** production assembly
  changes. The four successful session-init assembly arms cover every conditional insertion region, and the emitted
  bytes match afterward — key order, nesting, absence-versus-`null`, array order, and the success/error discriminant
  all unchanged.
- The session-init, recovery, and compaction-seed envelopes and the shared load-set and task-cursor records
  validate through schemas composed from kernel primitives at their boundaries. An intentional session-init,
  recovery-envelope, or recovery-report producer defect returns a deterministic non-zero command failure rather
  than invalid JSON; a compaction-seed producer defect follows its explicit non-fatal exception. The complete
  session-init schema also enforces the conditional-slot policy in `notes-cli-session-envelope.md` § Top-level slot
  presence contract: deterministic visible gates are two-way, degraded or hidden-helper gates are one-way, and
  invocation-only state is not inferred from the payload. Session-init, lean-recovery, and recovery-report roots
  reject undeclared top-level keys before the original objects reach serialization.
- The ten contained advisory slots derive their type via `z.infer` from a home-module schema, and their
  hand-written declarations are retired.
- The shared-infra and deep-nested slots validate every routing field enumerated in
  `notes-cli-session-envelope.md` § Thin validation field map at the boundary: a corrupted mapped field is rejected,
  and an otherwise-valid payload passes through unperturbed.
- The compaction-seed's hand-rolled validator is replaced by its schema; a version or shape mismatch yields a valid,
  non-crashing `seed-invalid` recovery stop without running live recovery probes, verified on the seed read path
  against malformed, older-seed, and current payloads.
- The session domain's present asynchronous probe slots compose as independent kernel `Result` / `ResultAsync`
  values, imported only through the kernel barrel; eager siblings resolve concurrently without aggregate
  short-circuiting, optional absence stays outside the Result algebra, and one adapter preserves the bare top level
  plus the exact per-slot `{ kind, message }` wire error.
- Producer validation is always-on, and the fixed warm assertion/no-op and cold production-CLI benchmark remains
  below its declared p50/p95 materiality thresholds; if a threshold is crossed, an evidence-backed decision and a
  replacement invariant are recorded before changing the posture.
- Tests cover both successful emitted payloads and intentional malformed cases against the same schemas: the full
  schema for the contained advisory slots, and mapped-routing-field rejection plus unperturbed pass-through for the
  thin views.

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
  tightens this member's thin routing views to full schemas as it migrates their authority. The inventory is
  graduated into a `notes-cli-session-envelope.md` companion at this stage's finalize and carried on the routed
  capture.
- **Shipped-bundle publication and introspection availability.** Making the registered envelope schemas appear in
  the shipped `schemas/kernel.json` (and thereby reach `schema-introspection-layer`) requires wiring a composed
  registry into the build projection, which currently emits a fixed vocabulary seed. Tracked as a bounded
  follow-up seam, not claimed as an automatic effect of registration.

## Open items

- Confirm by the fixed warm/cold protocol that always-on producer/emit validation stays below the declared
  materiality thresholds. The recommended default is to keep it on; crossing a threshold triggers the
  evidence-plus-replacement-invariant path above rather than a silent disable.
- The ~28-type sizing (the private/shared split and each type's blast-radius) is assumed to hold as the schemas are
  authored. A slot that proves to have more external reach than sized moves from the contained set to the
  tail-routed set — not into a wider in-member scope.

# Task List: Base Drift Guidance

- **Design:** `spec-base-drift-guidance.md`

---

## **Phase 1:** Shared analyzer foundation

_Purpose:_ Establish the typed contract and invocation-owned Git boundary that every later evidence and consumer
path relies on.

### `[x]` **1.1 Define the shared base-drift result, modes, and semantic ports**

- _Goal:_ Advisory and authoritative consumers share one storage-neutral result whose typed evidence enriches, but
  can never replace, the raw Git distance verdict.

    - `[x]` **1.1.a Establish the result and invocation contracts**
        - Added the shared typed result, verdict, evidence, overlap, register, and unavailable-reason contracts while
          retaining the compatible distance fields and exporting the analyzer surface through the Git domain index.

    - `[x]` **1.1.b Define narrow injected semantic capabilities**
        - Added separate topology-enrichment and single-parent-proof resolver operations, a path-to-behavior
          classifier, a base-OID-bound resolver factory, and injectable token generation without storage concepts.

- _Outcome:_ The analyzer contract separates immutable Git safety facts from replaceable semantic evidence ports.

### `[x]` **1.2 Acquire and clean up an immutable fetched base before measuring raw distance**

- _Goal:_ Every healthy reading is anchored to one validated, invocation-owned fetched OID, and no failed path can
  claim parity or silently leave analyzer-owned refs behind.

    - `[x]` **1.2.a Validate and fetch the configured base into an invocation ref**
        - Advisory skip now precedes Git I/O; authoritative reads validate `refs/heads/<base>` and bounded-fetch it
          with `--no-write-fetch-head` into an internally generated `refs/arc/base-drift/<token>` ref.

    - `[x]` **1.2.b Return a strict raw-distance snapshot from the immutable OID**
        - Distance and enhancement reads use the verified fetched commit OID while its invocation ref remains live;
          the shared count parser now rejects malformed, partial, negative, extra-field, and unsafe-integer output.

    - `[x]` **1.2.c Make cleanup part of the analyzer's safety result**
        - Every post-fetch path deletes the exact owned ref; typed validation, fetch, OID, distance, and cleanup
          failures fail closed, with cleanup failure overriding an otherwise healthy result.

    - `[x]` **1.2.d Preserve strict-parser failure behavior across shared distance callers**
        - Existing callers retain their degraded/refusal contracts; inbound pull now surfaces malformed distance
          before reading dirt or attempting a merge, with regression coverage around the strict shared parser.

- _Outcome:_ Healthy readings are pinned to one fetched OID and cannot survive an unreported temporary-ref cleanup
  failure; malformed distance output can no longer masquerade as parity anywhere in the shared caller set.

## **Phase 2:** Integration-event evidence

_Purpose:_ Turn first-parent history into proof-bounded integration events while preserving every unsupported commit
as explicit unclassified movement.

### `[x]` **2.1 Scan and classify topology and resolver evidence without double-counting commits**

- _Goal:_ First-parent movement is reported as disjoint proven events plus honest unclassified commits, with coverage
  and limitations that exactly reflect what the analyzer established.

    - `[x]` **2.1.a Parse and classify the bounded first-parent scan**
        - Added one oldest-first, NUL-framed, cap-plus-one first-parent scan with strict record validation, exact merge
          subject parsing, topology event proof, and terminal suffix identity hints that never prove events alone.

    - `[x]` **2.1.b Reconcile resolver evidence with topology proof**
        - Resolver results now enrich topology in place or prove disjoint single-parent membership; out-of-range,
          overlapping, empty, or topology-consuming responses are rejected atomically as invalid evidence.

    - `[x]` **2.1.c Derive coverage and limitations without guessing**
        - Coverage derives from exact classified membership, resolver state, and proven truncation; tests cover merge,
          suffix-only movement, resolver membership and rejection, malformed framing, ordering, and cap-plus-one.

- _Outcome:_ First-parent movement is now a deterministic partition of proven events and explicitly unclassified
  commits; evidence coverage cannot inflate event counts or alter raw distance.

### `[x]` **2.2 Add a status-bearing completed-record reader and current resolver adapter**

- _Goal:_ The current completed-meta adapter can prove only evidence its archive reads actually support, while existing
  shipped-work-unit consumers retain their compatibility API.

    - `[x]` **2.2.a Expose lossless completed evidence beside the compatibility reader**
        - Completed records now include parsed PR identity and expose available/partial/unavailable evidence reads;
          the existing lossy map/set APIs remain compatible and bounded blob concurrency is preserved.

    - `[x]` **2.2.b Implement the in-repository resolver adapter**
        - The current adapter caches one base-OID archive read, enriches by same-commit meta or unique PR match, and
          proves squash events only from strict no-renames added-meta framing plus matching same-commit PR evidence.

    - `[x]` **2.2.c Prove adapter availability and archive-cadence behavior**
        - Tests cover archive availability states, PR parsing, cached indexing, unique topology enrichment, matching
          and mismatched squash facts, and malformed status degradation; unsupported histories remain unclassified.

- _Outcome:_ Completed Markdown remains a replaceable current-tier adapter: resolver operations expose only code
  OIDs and optional display identity, while archive/storage failures degrade evidence without changing safety.

## **Phase 3:** Reconciliation evidence and guidance

_Purpose:_ Distinguish substantive contention, regenerable projection churn, and unavailable enhancement evidence,
then compose one deterministic register without weakening raw Git safety facts.

### `[x]` **3.1 Classify conservative path overlap through an injected reconciliation policy**

- _Goal:_ A healthy distance reports whether overlap was available and partitions every shared changed path by
  reconciliation behavior without coupling Git analysis to operational-state ownership.

    - `[x]` **3.1.a Return explicit, rename-conservative overlap evidence**
        - Overlap now uses strict NUL-framed `--no-renames` diffs against the immutable OID, short-circuits provable
          empty cases, and preserves separate merge-base, branch-diff, and base-diff failure reasons.

    - `[x]` **3.1.b Bind the production reconciliation classifier**
        - An above-Git composition adapter injects exact `ROADMAP_PATH` regeneration behavior and treats every other
          path as substantive; output arrays are deduplicated and sorted before bounded rendering.

- _Outcome:_ Available-empty and unavailable overlap are now distinct, and rename-sensitive contention is analyzed
  conservatively without coupling the Git analyzer to readiness-view ownership.

### `[x]` **3.2 Compose drift registers and assemble the shared analyzer**

- _Goal:_ One deterministic register communicates the strongest established fact, preserves evidence limitations,
  and never changes the verdict or safety action implied by raw distance.

    - `[x]` **3.2.a Implement precedence and proof-strength vocabulary**
        - Register composition applies attention/degraded/calm precedence, proof-strength vocabulary, and three-path
          samples while retaining complete typed evidence in the result.

    - `[x]` **3.2.b Cover every register composition boundary**
        - Tests cover calm named integration output, regenerable overlap, attention plus degradation, deterministic
          sampling, unavailable overlap, and mode-specific unavailable registers.

    - `[x]` **3.2.c Assemble evidence and register composition behind the raw-distance boundary**
        - Zero-behind returns complete empty evidence without enhancement reads; reconcile runs both evidence analyses
          against the same reachable OID, preserves their independent degradation, and remains cleanup-governed.

- _Outcome:_ One analyzer now owns raw verdict, typed enhancements, and precomposed guidance; evidence tone never
  changes the raw reconcile requirement.

## **Phase 4:** CLI and session guidance consumers

_Purpose:_ Expose authoritative drift reads through `arc base` and migrate session initialization to the same
analyzer and precomposed guidance contract.

### `[x]` **4.1 Add authoritative `arc base drift` command handling and rendering**

- _Goal:_ `arc base drift` gives humans and workflows the same fresh authoritative result, JSON, and exit semantics
  without duplicating analysis in command glue.

    - `[x]` **4.1.a Wire the authoritative command through the existing base family**
        - Added declarative `base drift`, authoritative handler composition through the shared current adapters,
          machine-readable JSON on every outcome, typed exit semantics, and policy-equivalent Clack rendering.

    - `[x]` **4.1.b Prove command behavior in real repositories**
        - Real-repository E2E coverage proves clean, reconcile, missing-origin, invalid-base, disabled advisory sync,
          JSON/human exit policy, and invocation-ref cleanup after healthy and degraded reads.

- _Outcome:_ Humans and workflows now reach the same fresh authoritative analyzer through `arc base drift` without
  duplicating Git or policy logic in command glue.

### `[x]` **4.2 Migrate session-init probing, recommendations, and envelope documentation**

- _Goal:_ Session initialization consumes the shared analyzer advisorily and renders its precomposed register without
  re-reading Git or independently reconstructing policy.

    - `[x]` **4.2.a Bind the analyzer into the status composition root**
        - Session-init now invokes the shared analyzer in advisory mode with the same adapters; distinct real-repo
          fixtures prove typed reconcile passthrough and pre-Git disabled-sync skip behavior.

    - `[x]` **4.2.b Derive recommendations directly from analyzer output**
        - Recommendation inference now surfaces only reconcile and passes `register.text` through byte-for-byte;
          clean, skipped, unavailable, and failed slots skip without a second overlap or wording implementation.

    - `[x]` **4.2.c Migrate status slot types and enrichment**
        - The eager slot retains compatible distance facts through the shared result type and enriches verdict,
          evidence, overlap, and register with recommendation fields without rereading or mutating analyzer facts.

    - `[x]` **4.2.d Retire legacy envelope fixtures and overlap assumptions**
        - Status fixtures now use the typed envelope, and the TypeScript source/test tree has no remaining
          `overlappingPaths` or independently composed distance-only guidance consumer.

    - `[x]` **4.2.e Update the shipped and self-hosting envelope guidance together**
        - Package and self-hosting session workflows now render the analyzer register verbatim; both envelope
          references document the typed contract and remain byte-identical.

- _Outcome:_ Session initialization is an advisory consumer of the same analyzer and emitted register as the
  authoritative CLI, with no prose-side policy or stale legacy overlap shape.

## **Phase 5:** Integration gate convergence

_Purpose:_ Replace duplicated workflow Git mechanics with the authoritative analyzer and close both approval windows
against a fresh immutable base identity.

### `[x]` **5.1 Drive behind-base reconciliation from authoritative drift verdicts**

- _Goal:_ The final integration gate fails closed on unavailable distance, binds each approval to a fresh `baseOid`,
  and permits merge invocation only immediately after a post-approval clean reading.
    - `[x]` **5.1.a Replace manual fetch and distance mechanics with verdict dispatch**
        - Replaced raw fetch, distance, and remote-ref merge mechanics with strict authoritative verdict dispatch,
          typed failure stops, register surfacing, and immutable `baseOid` reconciliation.

    - `[x]` **5.1.b Close the integration-approval freshness window**
        - Added immediate post-approval drift readings so changed bases return to reconciliation and only a fresh clean
          result can flow directly into the merge invocation.

    - `[x]` **5.1.c Keep workflow language storage- and installation-neutral**
        - Kept both workflow copies byte-identical and expressed the gate through shipped verbs and analyzer output
          while preserving resume, review, push, close, and teardown behavior.

- _Outcome:_ Reconcile and integration approvals are bound to fresh analyzer readings, eliminating mutable remote-ref
  decisions from the final merge gate.

### `[x]` **5.2 Prove the cross-consumer safety and compatibility matrix**

- _Goal:_ The assembled CLI, session-init, and integration workflow demonstrate one analyzer contract across real Git
  behavior, typed degradation, and both framework copies.

    - `[x]` **5.2.a Lock the workflow contract and two-copy parity**
        - Added focused integration assertions for copy parity, authoritative command use, fail-closed handling, both
          freshness windows, and removal of the duplicated raw Git mechanics.

    - `[x]` **5.2.b Run the assembled compatibility checkpoint**
        - Exercised the assembled analyzer and consumer matrix, confirmed framework sync, and found no legacy overlap
          consumer or prohibited integration-workflow base calculation.

- _Outcome:_ The shared contract now has end-to-end coverage across CLI consumers and synchronized workflow copies,
  including typed degradation and approval-window safety.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Base movement is reported as raw distance, proven integrations, and explicit unclassified commits without
  inflating integration count.
- `[ ]` Squash evidence requires matching same-commit archive and PR-subject facts, while unsupported squash and
  rebase history remains unclassified.
- `[ ]` Only raw `ahead` and `behind` determine `clean` versus `reconcile`.
- `[ ]` Available empty overlap is distinguishable from unavailable overlap analysis.
- `[ ]` Regenerable-only overlap can render calmly, while substantive overlap always leads with attention.
- `[ ]` Rename-sensitive overlap cannot falsely report disjoint paths.
- `[ ]` Partial or unavailable integration evidence never suppresses contention or authorizes integration.
- `[ ]` Session-init and the integration workflow consume the same analyzer without re-deriving Git mechanics.
- `[ ]` `arc base drift --json` always emits typed JSON, ignores advisory sync policy, and fails closed when raw
  distance is unavailable; only a fresh post-integration-approval `clean` permits immediate merge invocation.
- `[ ]` Concurrent probes cannot change an invocation's base identity, and temporary-ref cleanup is proven or
  surfaced as unavailable.
- `[ ]` The implementation adds no host dependency, configuration axis, permanent projection-name contract, or
  storage-tier branch.
- `[ ]` A storage-owned or non-git resolver can replace the current completed-meta adapter without changing analyzer
  JSON or consumers.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.

# Task List: Distributed Check Shards

- **Design:** `spec-distributed-check-shards.md`

---

## **Phase 1:** Canonical shard plans and prepared identity

_Purpose:_ Give the existing selected-check path a complete shard matrix, scoped prepared identity and native parent
evidence before connecting them to runner execution.

_Mode:_ `slice` through Phase 2 — closes on trustworthy routed shard execution through the public runner facade.

_Design decisions:_ Consumer implementation starts after the runner foundation lands and its qualified exports are
re-grounded. This plan consumes that source, binding, protocol and lifetime implementation; it creates no substitute.

### `[x]` **1.1 Expand complete, portably bounded batch/shard plans — D3**

- _Goal:_ Every selected routed check has one deterministic, complete plan whose final commands fit every compatible
  placement before preparation or reuse can begin.

    - `[x]` **1.1.a Compose canonical batch/shard coordinates and invocation records**
        - Captured planning emits batch/shard order, immutable local coordinates and fresh wire IDs, preserving
          captured path spelling, cwd, probes and native command-content policy.

    - `[x]` **1.1.b Budget the complete final command before partitioning paths**
        - Shared shard batching reserves the largest final argument against both portable models before partitioning;
          shell invocations retain one command string. Fixed and single-path overflow carry shortening remedies.

    - `[x]` **1.1.c Keep native forecasts and routed plans consistent**
        - Native forecasts share final-argument expansion and retain native platform budgets. Coverage exercises
          ordered Unicode/quoted paths, multi-digit shards, invalid cwd/argv and repaired overflow.

    - `[x]` **1.1.d Expand routed shards only for checks that opt in**
        - Strict declarations admit `shards.routed`, default false; only opted-in routed plans expand. CI expansion
          ignores the opt-in, and ordinary declarations retain the foundation's unsharded batches.

- _Outcome:_ One expansion/budget boundary supplies native forecasts and captured routed plans without transporting
  local reporting coordinates through the runner protocol.

### `[x]` **1.2 Bind complete prepared runtime coverage to a scoped parent key — D4, D5**

- _Goal:_ A parent is reusable only for its full canonical matrix and applicable prepared inputs/runtimes, without
  making unrelated repository state or attempt identities dependencies.

    - `[x]` **1.2.a Verify the prepared runtime projection over the shard matrix**
        - Matrix tests bind reordered known observations in plan order, reject missing/duplicate/unknown coverage
          and withhold reuse for unknown qualification without caller-local probing.

    - `[x]` **1.2.b Confirm or extend the scoped key's matrix coverage**
        - Disposable key version 6 binds canonical prepared argv, cwd, shell and batch/shard coordinates: custom
          captured plans can differ despite identical declarations/paths/runtime. Wire IDs and raw content IDs stay
          excluded; real sharded preparation preserves unrelated-source and identical-file-location invariance.

    - `[x]` **1.2.c Preserve capture and execution requirements when reuse is unavailable**
        - Real basic-adapter siblings retain captured source and unset/empty/file bindings with caching disabled
          and unknown runtime. A changed known placement refuses both siblings before work; explicit retry qualifies
          the new placement and executes successfully.

- _Outcome:_ Prepared matrix identity supplements scoped content rather than hashing the whole captured container;
  runtime coverage and fixed-input lifetime remain owned by the shared foundation.

### `[x]` **1.3 Project shard coordinates through the shared native outcome reducer — D6**

- _Goal:_ The parent preserves native verdict meaning and useful completed failures while identifying exactly which
  expected pairs lack acceptable evidence.

    - `[x]` **1.3.a Associate validated terminal evidence with expected coordinates**
        - `reduceCheckPlanOutcomes` accounts for every planned pair using facade-validated observations. Missing
          pairs are explicit; correlation faults and lost final closure prevent success without discarding valid
          failures. Preparation owns frozen local coordinates alongside the validated wire plan; selected-check
          results can carry the complete coordinate/evidence projection.

    - `[x]` **1.3.b Preserve native no-evidence, kill and full exit-status semantics**
        - Parent projection composes the shared normalizer/reducer, preserving declared no-evidence precedence,
          mixed/all-no-evidence outcomes, notices, killed work and exact 256/high-bit/maximum unsigned statuses.

## **Phase 2:** Routed execution, diagnostics and lifetime closure

_Purpose:_ Connect the canonical plan to the foundation's prepared execution facade and prove serial/group execution,
reuse, failure and interruption through real protocol conversations.

_Exit criterion:_ A routed declared check runs every expected pair through group or basic serial playback, publishes
only a complete applicable parent pass, preserves completed failures beside missing work, and closes or retains its
context/capture under the specified lifecycle. The unconfigured command remains native and unsharded.

### `[x]` **2.1 Execute the fixed plan through serial or optional group dispatch — D1, D2, D6**

- _Goal:_ An eligible routed check executes its complete declared matrix through one prepared context, while the
  native path retains its existing single command and configured failures remain visible.

    - `[x]` **2.1.a Connect the consumer at the selected-check dispatch boundary**
        - The selected-check handler supplies captured planning through `buildPlan`. Native and opted-out routed
          checks retain their ordinary path; opted-in dry runs cannot capture, prepare or probe execution.

    - `[x]` **2.1.b Play back mandatory singles or submit the whole optional group**
        - `executePreparedCheckPlan` submits an opted-in matrix once when grouping is advertised, otherwise runs
          ordered singles. Ordinary failures collect the remaining work; complete-plan reduction retains missing pairs.

    - `[x]` **2.1.c Prove the production entry with a real adapter conversation**
        - Built-CLI scenarios execute three siblings through independent group/basic peers, retaining ordinary
          failures, exactly-once identities and closed captures. The standalone basic example executes real pairs.

    - `[x]` **2.1.d Preserve native command-content and repository environment boundaries**
        - Standalone selected-check scenarios preserve identical-argv files/project/probe policy, explicit empty
          values and symlink-file bytes despite caller/worker selectors targeting another repository. Opted-in
          declarations refuse all reserved names/case variants; a real refused declaration succeeds after repair.

### `[x]` **2.2 Retain attributable native failures and incomplete-work diagnostics — D6**

- _Goal:_ Human and JSON results retain their parent outcome conventions while showing each pair's valid native
  outcome, exit/notice and incomplete-work detail without treating progress or log persistence as authority.

    - `[x]` **2.2.a Keep independently observed outcomes through final-reply failures**
        - Production group-loss/malformed-closure scenarios retain the completed native result and identify every
          missing sibling, with failure taking precedence over incomplete work. Logs, clean process exit and partial
          success cannot close the missing matrix; captures retain actionable settlement guidance.

    - `[x]` **2.2.b Render attributable invocation details without changing parent conventions**
        - Human/JSON results retain canonical coordinates, native statuses/notices and incomplete reasons. Display
          collection decodes each invocation/stream independently; full reports label each pair and preserve adapter
          diagnostics. Optional report failure preserves complete evidence without printing captured bindings.

### `[x]` **2.3 Close reuse and completed execution before parent publication — D5, D8**

- _Goal:_ Parent reuse/publication and capture disposal occur only after their required context/output closure,
  while settled disposal/cache-storage warnings retain their advisory meaning.

    - `[x]` **2.3.a Complete the prepared cache-hit and successful-run paths**
        - Real grouped requests prove no publication or capture disposal before provider exit, one complete parent
          record, context release without execution on a hit, and explicit forced execution. Failed, incomplete and
          unknown-runtime matrices publish no pass; fresh attempts preserve equivalent parent identity.

    - `[x]` **2.3.b Preserve advisory persistence/disposal behavior after settlement**
        - Corrupt/unavailable records miss; occupied invalid records and unavailable pass/report directories preserve
          native success and recover after repair. Settled disposal warnings remain advisory during execution and
          reuse, while lost required output and abnormal provider exit prevent publication.

### `[x]` **2.4 Preserve settlement and recovery through refusal and interruption — D8**

- _Goal:_ Every cancellation/refusal/transport-loss path either proves settlement and safe disposal or retains the
  shared capture and actionable provider guidance without duplicate execution.

    - `[x]` **2.4.a Consume settled preparation refusal without inventing a context**
        - Complete shard plans consume settled refusal without release, including refusal before a late cancel
          acknowledgment. Missing settlement and abnormal exit retain captures and plan diagnostics; repaired
          declarations execute through fresh attempts without an engine fallback.

    - `[x]` **2.4.b Retain group recovery across interruption and conversation loss**
        - Actual grouped resistant children retain source through cancel acknowledgment and drain before release.
          Sharded pre-context loss, repeated interrupts and standalone descendant inspection/settlement preserve
          recovery ownership without duplicate execution. Refused recovery delivery launches no preparation probe.

### `[x]` **2.5 Prove the public consumer lifecycle** — validate exit criterion at segment scope

- _Goal:_ Executable production-entry scenarios prove the segment's complete public-consumer lifecycle and preserve
  the unconfigured native default before native/provider breadth is added.

- _Outcome:_ Production-entry scenarios exercised group/basic playback, fixed source and inputs, whole-parent reuse,
  native failure beside missing siblings, refusal/retry and interruption. Publication waited for provider closure;
  uncertain captures survived for explicit recovery, while settled groups and cache hits released their resources.
  Unconfigured checks remained native and unsharded.

## **Phase 3:** Private native writers and unchanged CI playback

_Purpose:_ Remove shared native cache/report writers and preserve existing forecast, late input delivery and
cross-platform qualification routes before native group qualification.

_Mode:_ `slice` through Phase 4 — closes on native tier coverage and completion with isolated writers.

### `[x]` **3.1 Isolate native cache and report writers while retaining controller ownership — D7**

- _Goal:_ Concurrent execution views do not alias native mutable outputs, even with shared dependencies, and native
  artifact ownership remains effective through controller closing.

    - `[x]` **3.1.a Keep native cache writers at their default locations in each prepared copy**
        - Retained native defaults: project-root `node_modules/.vite/vitest/<project hash>/results.json` and
          package-relative CI JSON reports. The adapter materializes a private execution root, installs/builds,
          then freezes generated roots before dispatch; package dependency roots are present in preparation.
          Real-tier sibling acceptance remains the external adapter proof in 5.1.a.

    - `[x]` **3.1.b Keep CI duration collection aligned with the native cache path**
        - CI clear/upload paths already match native caches. Retained tier-labelled shard artifacts and recursive
          `mergeDurationArtifacts` discovery of hashed native result documents, with no format or placement change.

    - `[x]` **3.1.c Prove writers remain private through native completion and closing**
        - Real integration controllers wait behind the checkout lease through asynchronous native closing.
          Separate copies finish independently with physically private default caches and package-relative JSON
          reports; serial and separate-copy native duration outputs merge with complete membership.

- _Outcome:_ Native writer qualification composes existing controller/build ownership through closing. Fixtures
  retain shared immutable dependencies while giving Vite mutable roots private ancestors; existing teardown and
  worker-cleanup failures still fail after passing cases.

### `[x]` **3.2 Preserve forecast and late-bound native CI shard inputs — D3, D9**

- _Goal:_ Forecasts and native CI playback preserve declared shard placement and bind actual delivered inputs at
  dispatch, without accidentally routing through a second capture path or freezing setup-time absence.

    - `[x]` **3.2.a Consume shared expansion and dispatch-time binding in CI playback**
        - Native CI playback consumes shared forecast batches and captures delivered inputs once per selected
          check, including shard-expanded jobs. Process cases preserve final shard/report arguments and cwd;
          declaration mismatches refuse with regeneration guidance and execute after repair.

    - `[x]` **3.2.b Keep forecast/dry-run paths descriptive and side-effect bounded**
        - Opted-in selected-check previews retain native shard forecasts without routing, then report unknown
          routed reuse without capture, adapter startup or probes. Sharded environment metadata preserves only
          names/kinds, including empty file selections, while native CI expansion remains independent of opt-in.

- _Outcome:_ Forecasts preserve the native CI matrix and defer explicit-input capture until actual dispatch.
  Configured routed previews omit native argv and require preparation for reuse rather than borrowing a local hit.

### `[x]` **3.3 Exercise consumer portability and exact native Windows statuses — D3, D6, D7**

- _Goal:_ Supported-platform feedback actually executes consumer budgeting/result/writer cases, and Windows status
  preservation is demonstrated through the parent rather than inferred from Linux-injected numbers alone.

    - `[x]` **3.3.a Select and classify the consumer's portability surface**
        - Portability execution includes consumer batching/forecast/key/output, shard process cases and native
          sequencer/writer/completion cases. Library/script classification covers their source, fixtures and tests;
          the actual expanded tier exercises those boundaries without changing ordinary tiers or CI placement.

    - `[x]` **3.3.R Correct Windows qualification fixture paths**
        - Budget fixtures retain costly literal Unicode, whitespace and shell metacharacters in Windows-valid
          filenames. Native cache assertions compare canonical private package roots, preserving isolation across
          Windows short/expanded temp-path spellings.

    - `[x]` **3.3.b Exercise Windows process statuses through parent reduction on the portability pair**

        - `[x]` **3.3.b.1 Exercise actual native statuses in complete and interrupted shard parents**
            - Existing process cases execute complete/interrupted three-shard groups and repaired serial playback,
              asserting each native status and missing sibling. Actual status 137 retains declared no-evidence
              precedence; platform-native results are exercised through the public parent and transport.

        - `[x]` **3.3.b.2 Record the Windows/macOS portability qualification**
            - Hosted run `40781020166` at `a84c27919f9d07a20d74a140bda1e4ebff855c8a` exercised the complete
              Windows/macOS portability pair. Actual Windows 256/high-bit/maximum unsigned statuses survived
              complete and interrupted shard parents; native status 137 retained declared no-evidence precedence.

## **Phase 4:** Native membership and completion qualification

_Purpose:_ Observe native discovery and actual partition assignments, then qualify each tier's selection, evidence
and closing contract without introducing a second partitioner.

_Exit criterion:_ Qualified unit, integration and store profiles show complete/disjoint native membership under
fixed inputs, preserve their distinct empty/no-evidence/failure outcomes, and keep native writers and leases isolated
through controller closing. Store qualification uses the native reach command landed by `storage-ref-backend`.

### `[x]` **4.1 Observe native selection and actual shard assignments in a qualification harness — D7**

- _Goal:_ Qualification can compare native unsharded selection with the actual executed shard assignments without
  changing native membership or partitioning the same selection twice.

    - `[x]` **4.1.a Collect native membership identities and actual assignments**
        - A qualification-only configuration observes full native discovery, one native shard/sort cycle and worker
          queue/end events with project/package-relative identities. Real pre-parsed controllers preserve equal
          filenames across projects and distinguish unassigned module presence from actual execution.

    - `[x]` **4.1.b Compare complete union and pairwise disjointness over fixed inputs**
        - The qualification helper rejects incomplete/duplicate membership, incompatible profiles, divergent input
          bases and incomplete worker observations. Native controllers retain exact assignments from the consumer's
          captured source and duration file after caller branch, test-file and duration edits.

### `[x]` **4.2 Qualify ordinary native tiers, filters and duration-input states — D4, D7**

- _Goal:_ Unit and integration retain their native selection and nonempty-completion requirements under the
  declared matrix and applicable execution profiles.

    - `[x]` **4.2.a Qualify unit and unit-mocks membership together**
        - The configured runner qualifies full and filtered native unit projects from one consumer capture, with
          recorded/fallback durations and unset, empty-value and zero-byte-file inputs. Native fixtures verify
          deletion/widening, exact membership and recorded ordering; profile evidence is in the notes.

    - `[x]` **4.2.R Isolate the native project-selection fixture from machine runners**
        - The native forecast fixture uses an empty machine home while a controlled ambient home declares a runner.
          Declaration-only E2E selection retains native argv evidence independently of developer machine settings.

    - `[x]` **4.2.b Qualify integration through its native controller**
        - Integration opts into four routed shards with an explicit handed-duration file while retaining CI-only
          selection. Full and filtered native runs prove exact membership and successful closing; ordinary unmatched,
          all-skipped and over-sharded selections stay nonpassing. Native profile evidence is recorded in the notes.

    - `[x]` **4.2.c Prove controller failure and output-isolation boundaries**
        - Native writers share immutable dependencies while keeping handed duration files, caches and reports private.
          Gated closing retains artifact ownership through success and teardown failure; separate copies finish
          independently and merge their native durations without altering handed inputs.

### `[x]` **4.3 Qualify landed store reach no-ops and empty shares — D7**

- _Goal:_ The landed store command uses the public runner with fixed selection inputs and retains its proved no-op
  and empty-share successes without granting success to incomplete, unmatched or all-skipped native work.

    - `[x]` **4.3.a Complete native store declaration and catalogue adoption**
        - The landed native entry opts into four routed shards and captures its handed duration file alongside the
          existing store selectors. Public preparation and CI forecasts retain native argv; replay preserves unset,
          empty and file states after caller edits. The actual reach catalogue has no retired-wrapper dependency.

    - `[x]` **4.3.R Establish native timing output during preparation**
        - Repository setup establishes the existing `.test-cost-runs` output root before the runner freezes generated
          additions. Later timing and `duration-input/` writes retain their paths; new and changed source still refuse.

    - `[x]` **4.3.S Preserve native qualification stderr**
        - Qualification retains per-invocation stdout and stderr through failed qualification and closure, while
          native observations continue to parse stdout alone.

    - `[x]` **4.3.b Qualify full and selected native store membership**
        - The real declaration and catalogue qualify default, full/burst, every and selected/deleted membership on
          Linux arm64, Node 26.3.0 and Vitest 4.1.11. Native unsharded/sharded unions retain captured duration states
          despite original source, catalogue and selector edits; preflight and execution assignments agree.

    - `[x]` **4.3.c Preserve successful reach no-ops and empty native shares**
        - Captured native reach derivation qualifies a no-affected selection without controller observations. Two
          actual suites qualify across four shares on Linux x64, including two empty controllers observed only after
          awaited close. Existing observations reject ordinary empty runs and native close failures.

### `[ ]` **4.4 Prove native membership, writers and completion** — validate exit criterion at segment scope

- _Goal:_ Recorded native runs demonstrate the segment's unit, integration and store membership/completion contract
  and isolation through actual native controllers on the profiles claimed as qualified.

    - Execute the recorded unsharded-versus-sharded cases for unit, integration and store, including
      filtered/duration states, reach no-op/empty shares, ordinary nonpassing empty work, shared-dependency writer
      isolation and closing errors.
    - Request `arc check segment`; record native membership and profile evidence, including the completed
      portability-pair status case. Missing native/store/platform evidence remains incomplete rather than a
      fixture-only success.

## **Phase 5:** Public adapter groups and external integration

_Purpose:_ Extend the foundation-qualified external adapter through the same optional group contract and demonstrate
generic local/remote execution under its existing placement and admission policy.

_Mode:_ `slice` through Phase 6 — closes on independently qualified integration and measured end-to-end benefit.

_Design decisions:_ External changes belong on their own branch in arc-offload. ARC consumes the public contract;
the external adapter retains generic use outside ARC and native test tools.

### `[ ]` **5.1 Extend the foundation-qualified external adapter with complete-plan grouping — D1, D8, D10**

- _Goal:_ The existing external adapter accelerates the complete prepared plan while preserving each invocation's
  evidence, resource accounting and settlement through the public protocol.

- _Note:_ See `notes-distributed-check-shards.md` § Implementation starting points for the proposed external entry
  and current transport actors. Re-ground the foundation-qualified adapter before extending it in its own repository.

    - `[ ]` **5.1.a Schedule complete groups through the qualified adapter**
        - Extend `arc_offload/arc_adapter.py` and `tests/test_arc_adapter.py`, reusing its fixed capture, explicit
          inputs, runtime qualification and recovery/lifetime primitives. Advertise group capability; verify and
          materialize the captured plan once locally and upload it to each placement that takes a sibling, where
          that placement prepares its own private copy.
        - Place siblings through the existing pool admission: estimated finish, one heavy job per machine and
          memory tokens, longest expected sibling first, with availability order where no record exists. A
          placement's further siblings run serially in its prepared copy.
        - Build `test-first` (one behavior at a time):
            - Optional group capability accepts every expected ID once under the same prepared source/input basis;
              local and remote placements cannot resnapshot the caller or substitute ambient duration inputs.
            - With fewer free heavy placements than siblings, no machine runs two heavy siblings at once; the rest
              wait and run serially in an already prepared copy instead of a second upload to that placement.
            - Each placement satisfies its prepared runtime binding or refuses before affected work; unknown
              coverage still executes without reuse. Existing generic single execution remains usable.
            - A placement running a second sibling of a real native tier passes per-invocation source
              verification in its prepared copy.
            - No hidden rebatching, automatic retry or second ARC-specific adapter entry is introduced.

    - `[ ]` **5.1.b Present one context across placements and recover every placement**
        - The adapter is built around one placement per plan today: one placement choice, one journal `remote`,
          one stage per plan ID and backend frames forwarded unchanged. Track the group's own pending and prepared
          placements so no two siblings target one placement at once; record every remote placement in the plan
          journal with inspect/settle covering all of them; rewrite backend context identities to the group's one
          context; persist the staged materialization for later uploads; release each placement's permits after its
          last sibling settles.
        - Build `test-first` (one behavior at a time):
            - With two remote placements and one local, ARC sees one context, every frame passes its identity check,
              and each placement's permits release after its own last sibling settles.
            - Losing the conversation mid-group leaves recovery guidance that inspects and settles every placement.

    - `[ ]` **5.1.c Fall back before launch when a placement refuses admission**
        - A runner with a wake probe launches without waiting, so a sibling that loses the admission race receives
          a busy receipt before its backend starts. Wait for that placement or place the sibling elsewhere; never
          re-run work whose backend started.
        - Build `test-first` (one behavior at a time):
            - Two groups racing for one guarded runner both complete, with every sibling executed exactly once.
            - A refusal after backend start remains a failure or uncertain outcome, never a silent re-run.

    - `[ ]` **5.1.d Record sibling timings and report each sibling's placement**
        - Extend the provider's routed-plan record (`PlanRecord` in `arc_offload/arc_record.py`) per sibling:
          sample each completed sibling under its own argv key with its placement, admission wait and phase timings,
          and report each sibling's placement and admission wait in its invocation output, so ordering, 5.2.a and
          Phase 6 have a source. Add no second recording path.
        - Build `test-first` (one behavior at a time):
            - A later group places siblings in descending recorded duration; with no record, availability order
              applies.
            - Each invocation's output names its placement and admission wait; telemetry never becomes pass
              authority.

    - `[ ]` **5.1.e Retain group evidence and resource ownership through failures**
        - Extend the provider's fake-SSH/drop/stop fixtures around its qualified attempt accounting and pool permits.
          Keep protocol framing and required-output drainage in the shared adapter implementation.
        - Build `test-first` (one behavior at a time):
            - Ordinary failure preserves completed outcomes and allows remaining planned work; terminal evidence
              remains attributable through partial output, transport loss and cancellation.
            - Release follows settlement/collection for every launched sibling; uncertain work retains the common
              input and plan recovery guidance. Cancellation acknowledgement alone releases no permit or capture.
            - Provider recovery can inspect/settle preparation and execution after conversation loss; failure to
              flush guidance launches no work. Settled no-context refusal needs no release and repairs successfully.

### `[ ]` **5.2 Qualify common-input local and remote groups under existing policy — D4, D6, D8, D10**

- _Goal:_ Real local and remote placements satisfy the same public consumer contract and native compatibility
  requirements while the existing pool remains the sole placement and resource-admission authority.

    - `[ ]` **5.2.a Exercise the public contract on real local and remote placements**
        - Run the independent fixture scenarios against the qualified personal adapter with a small frozen native
          selection, then apply Phase 4's native membership checks on the profiles claimed as compatible.
        - Record source/code coordinates, fixed selection/duration states, runtime coverage, actual assignments,
          exact native failures and output/settlement closure. Edit originals after capture to expose live reads.
        - Exercise group/basic playback, native failure beside incomplete work and repaired refusal/recovery. Public
          fixtures cover known/unknown reuse and hit release; actual placements exercise their advertised coverage.
          Honest unknown runtime qualifies execution without reuse, not a cache-hit or unexercised profile claim.
        - Run a four-shard store group on the pool as it stands; record each sibling's placement and admission
          wait, and whether a machine ran two siblings serially because heavy capacity was short.

    - `[ ]` **5.2.b Preserve provider policy and generic use**
        - Use the live registry, measured selection and current routing mode; retain shared job/heavy-job admission,
          memory ceilings and inherited caller CPU policy. Do not change the Owner's mode or assume host ordering.
        - Extend existing policy/resource fixtures for grouped local/remote work, including required-remote refusal
          and capacity loss. Confirm the adapter remains usable outside ARC and Vitest with generic commands.
        - Keep provider configuration, inventory, fallback/admission and transport internals outside ARC declarations,
          protocol semantics and native test grammar.

### `[ ]` **5.3 Document declaration-driven shards through the public runner seam — D2, D9, D10**

- _Goal:_ A team can declare native shards and use any conforming runner with clear defaults, failure/recovery
  behavior and qualification limits, without adopting the personal provider's deployment settings.

    - Extend the foundation's public runner documentation/examples in the package/root READMEs and installed quality
      gate guidance. Edit shipped framework source before project sync; leave the deliberately deferred `docs/` site.
    - Describe native single-command defaults, optional complete-group capability, basic serial playback, explicit
      value/file inputs, native membership constraints, parent reuse and incomplete/recovery diagnostics. State
      that a basic adapter runs an opted-in matrix serially at the native sharding overhead.
    - Show a provider-neutral example using the standalone adapter. It is a basic adapter, so document group
      capability from the contract rather than from the example. Distinguish measured profiles from unmeasured
      deployments. Keep internal work-unit references out of shipped text and retain foundation-owned migration/ADR
      closeout rather than duplicating them. Validate examples against executable fixtures with test-after feedback.

## **Phase 6:** End-to-end latency and concurrent throughput

_Purpose:_ Measure fresh complete gates with fixed inputs, including capture and queueing, so coverage and aggregate
completion determine whether the distributed path improves the intended workload.

_Exit criterion:_ Interleaved repeated routed-unsharded and distributed runs report idle-pool and named-workload
median/range, coverage, aggregate completion and admission. Any claimed idle-pool improvement exceeds observed
variation, and a named-workload slowdown above 10% keeps qualification open.

### `[ ]` **6.1 Build a reproducible whole-gate comparison harness — D10**

- _Goal:_ Comparisons measure fresh complete gates over equivalent inputs and retain enough observations to detect
  coverage loss, preparation cost and aggregate regression rather than merely faster job submission.

- _Note:_ See `notes-distributed-check-shards.md` § Implementation starting points for existing provider telemetry
  and native test-cost limits; neither is already a complete gate benchmark.

    - `[ ]` **6.1.a Fix equivalent native and distributed comparison requests**
        - Add a bounded qualification harness using the production check/controller path and Phase 4 membership
          observer; select one fixed source, native selection, duration definition and requested complete check set.
        - Vary the plan in memory through the selected-check handler's injected `readDeclaration`, one process per
          gate, so both arms read the same on-disk declaration and store's reach selection is identical.
        - Build `test-first` (one behavior at a time):
            - Routed unsharded and declaration-derived plans differ only in shard expansion, with forced fresh work;
              fully native local runs are recorded as context. The harness changes no source/declaration or
              production sharding-toggle setting.
            - Original-checkout edits and pass reuse cannot contaminate comparisons; failures or coverage mismatch
              remain recorded unsuccessful runs rather than being dropped from the sample.

    - `[ ]` **6.1.b Record complete timing, coverage and admission observations**
        - Capture controller start through final collection, including capture/transport/preparation, runtime
          qualification, admission/queueing and execution; reuse provider telemetry without making it pass authority.
        - Build `test-first` (one behavior at a time):
            - Aggregation preserves raw observations and reports per-gate median/range plus concurrent makespan and
              aggregate completion; partial/failed runs cannot become completed-gate speedup samples.
            - Native coverage and admission/resource observations accompany every comparison; report actual sample
              counts and limits. Write live-run artifacts under `~/dev/` so interrupted runs remain inspectable.

### `[ ]` **6.2 Qualify fresh idle-pool gate latency with equivalent coverage — D10**

- _Goal:_ An idle-pool improvement claim rests on repeated complete capture-through-collection runs with equivalent
  native coverage and a gain greater than observed run-to-run variation.

    - Run repeated interleaved routed-unsharded baselines and distributed complete gates with an otherwise idle pool;
      record source/selection/duration/check-set identities, qualified profiles and fresh execution for every sample.
    - Report raw timings, median/range, phase costs and exact native coverage. Include preparation and queueing rather
      than comparing warmed remote execution with a fresh native gate.
    - Treat speedup within observed variation as unestablished. Keep basic serial adapters correct without assigning
      them an acceleration requirement or extrapolating measurements to unqualified deployments.

### `[ ]` **6.3 Qualify named-workload aggregate completion and admission — D10**

- _Goal:_ The intended concurrent workload completes equivalent useful gates without hiding an aggregate throughput
  regression behind a single faster gate or bypassing shared resource admission.

    - Repeat the interleaved baseline/distributed experiment under the named workload: two concurrent forced merge
      gates that each select store, plus one concurrent push gate, recording the routing mode in force. Record
      per-gate median/range, complete-set makespan, aggregate completion, native coverage and queue/admission behavior.
    - Keep controllers local under the host CPU-yielding policy and all heavy work pool-routed under the current mode,
      registry and ceilings. Check/gate any separately launched memory-heavy local process under host policy; do not
      defeat shared admission or the local serial guard to create benchmark concurrency.
    - Retain all failures/incomplete runs. Report the aggregate slowdown or gain against the routed-unsharded
      baseline with its measured size, and address a slowdown above 10% before claiming completed qualification. Do
      not change shard counts, fairness, timeout policy or routing mode to conceal the result.

### `[ ]` **6.4 Validate integrated execution and measured benefit** — validate exit criterion at segment scope

- _Goal:_ The external integration and measured workloads demonstrate the stated public contract and useful gate
  behavior, with explicit limits for profiles or deployments not actually exercised.

    - Walk the public independent/external adapter scenarios and native profile evidence, then the repeated idle and
      named-workload observations; verify equivalent coverage, full timing costs, aggregate completion and admission.
    - Request `arc check segment`; record actual evidence and unresolved measurements. A concurrent regression or
      missing required qualification keeps this exit criterion open and needs separate corrective work.

## **Phase 7:** Verification

_Purpose:_ Verify the complete implementation against its success criteria and required project checks.

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ Every success criterion is backed by evidence at the final implementation head, with required checks and
  integration readiness established through the work-unit verification workflow.

## Success Criteria

- `[ ]` Native/unconfigured checks retain their single command without source preparation; routed dry-run performs
  no capture, adapter launch or runtime probe. Configured-runner failure never triggers an ARC bypass.

- `[ ]` Complete canonical batch/shard plans precede prepare/reuse, retain command/cwd/selection semantics and fit
  compatible POSIX/Windows final-argument limits. Oversize/escaping-cwd refusals succeed after explicit repair.

- `[ ]` Group dispatch submits the complete plan once; mandatory serial playback executes the identical plan in order
  and continues ordinary failures. Every expected pair executes at most once with distinct correlation identity.

- `[ ]` Source bytes/coordinates, selection and explicit absent/empty/value/file bindings stay fixed across siblings,
  probes and disabled-cache runs after original edits; relative/symlink file behavior follows the native boundary.

- `[ ]` Identical-argv project/files commands and probes retain their distinct engine-owned content bindings. Poisoned
  caller/worker Git selectors cannot redirect execution; every reserved name/case variant refuses explicit replay,
  and removing the conflict restores successful captured-source execution with ordinary explicit inputs.

- `[ ]` Parent reuse covers the complete scoped input/matrix/runtime vector. Relevant changes miss while unrelated
  source/state, host paths, provider labels and attempt IDs do not. Unknown runtime executes without reuse;
  malformed claimed coverage refuses, and changed known placement requires fresh qualification before work.

- `[ ]` A complete hit launches no invocation and closes/releases its context. A successful miss publishes one parent
  only after complete acceptable evidence, required output, settlement and normal closure; failed/incomplete/unknown
  parents publish none. Disposable pass read/write failures retain their miss/advisory semantics.

- `[ ]` Missing/duplicate/conflicting/unknown IDs, wrong source, cancellation, transport loss, killed work or required
  output loss never pass. Valid native failures survive beside incomplete work, including exact unsigned 32-bit
  statuses; no-evidence/137/notice precedence stays native and all-no-evidence work never gains a pass.

- `[ ]` Human/JSON output retains parent conventions and attributable batch/shard outcomes, exact native statuses and
  incomplete reasons. Progress, adapter exit and optional log persistence never substitute for terminal evidence.

- `[ ]` Settled no-context preparation refusal drains and exits normally without release, including a cancellation
  race and successful explicit retry after repair. Abnormal closure or absent settlement retains uncertainty.

- `[ ]` Interruption waits for actual settlement; acknowledgement or second interruption is insufficient. Lost
  preparation/execution conversations retain capture and usable pre-work recovery guidance by plan ID; failed
  guidance writes launch no work. ARC performs no automatic recovery, replacement or retry.

- `[ ]` Settled leftover-directory/log disposal is advisory, while missing required output, unsettled children and
  native controller-close errors remain substantive. Capture and build/test ownership survive required closing.

- `[ ]` Actual unit, integration, landed reach-store and E2E shard assignments have complete/disjoint native union
  across qualified profiles, filters, deletion/widening and frozen available/absent/empty duration states. The landed
  store declaration uses ordinary eligible argv and captured selector gates; its catalogue works without the retired
  wrapper, including when native store adoption occurs after the foundation closes.

- `[ ]` Actual reach no-affected-suite and empty-share successes retain native meaning, while ordinary unmatched,
  all-skipped and empty-execution cases remain nonpassing through native controllers and closing.

- `[ ]` Concurrent views sharing dependencies do not alias mutable native cache/report writers; private native
  `results.json` artifacts merge correctly and existing artifact leases remain held through closing.

- `[ ]` Forecasts describe binding names/kinds without payloads or setup-time capture. Native CI binds after artifact
  delivery, mismatch/regeneration repairs successfully, and native placement/shards/artifact names remain intact
  with the private clear/upload paths. Consumer portability selectors/classifiers cover the changed surface.

- `[ ]` A completed native Windows run proves exact 256/high-bit parent failure handling; other supported-platform
  budget/path/result cases execute through their selected portability routes rather than classification alone.

- `[ ]` Independent public fixtures and real local/remote personal placements meet the same contract and qualified
  native profiles. Generic external use, current registry/routing/admission, memory ceilings and caller CPU policy
  remain effective without provider deployment settings or test grammar entering ARC.

- `[ ]` Repeated fresh complete-gate comparisons report idle and five-or-six-gate median/range, raw samples, aggregate
  completion, native coverage and admission including capture through collection. Claimed improvement exceeds
  observed variation; any concurrent regression or missing required evidence remains unresolved qualification.

- `[ ]` Public guidance/examples explain generic runner use, native defaults, evidence/recovery and qualification
  limits, and match executable scenarios without depending on the personal provider.

- `[ ]` Actual unit, integration and landed reach-store shard assignments have complete/disjoint native union across
  qualified profiles, filters, deletion/widening and frozen available/absent/empty duration states. E2E stays native
  and CI-only with its existing membership validation. The store declaration uses ordinary eligible argv and captured
  selector gates and works without the retired wrapper.

- `[ ]` A completed Windows/macOS portability-pair run executes the consumer's fixture-backed 256/high-bit parent
  reduction cases; other supported-platform budget/path/result cases execute through their selected portability
  routes rather than classification alone.

- `[ ]` The external adapter runs a complete group from one local materialization uploaded to each placement that
  takes a sibling. Each placement prepares a private copy, existing admission keeps at most one heavy sibling per
  machine, and a placement's further siblings run serially in its prepared copy.

- `[ ]` Only checks whose declaration sets `shards.routed: true` expand on the routed path. An opted-out check with
  shards routes one unsharded command, and CI's declared matrix and forecast are unchanged.

- `[ ]` Repeated forced comparisons against the same gates routed unsharded show an idle-pool per-gate gain beyond
  observed variation. Under two concurrent store-selecting merge gates plus one push gate, aggregate completion is at
  most 10% slower than that baseline and is reported with its measured size.

- `[ ]` Two groups racing for one placement both complete; a refusal before a backend starts leads to waiting or
  another placement, never an unavailable sibling. Recovery guidance from a group reaches every remote placement it
  used.

- `[ ]` All quality gates pass.

- `[ ]` Ready for integration.

---

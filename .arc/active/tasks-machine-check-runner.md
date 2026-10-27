# Task List: Machine Check Runner

- **Design:** `spec-machine-check-runner.md`

---

## **Phase 1:** Freeze explicit inputs in native checks and CI

_Purpose:_ Prove declared values/files and repository scoping through existing production execution before adding
relocation, preserving native defaults and checked-index ownership.

_Mode:_ `slice` — closes on native commands, runtime probes and CI playback sharing correctly captured bindings.

_Exit criterion:_ A declared value/file check runs natively and in CI with frozen bytes and presence semantics; reserved
selectors refuse with a successful repaired retry, while ordinary native checks retain their behavior.

### `[x]` **1.1 Share the native repository-local Git environment authority — D2, D8**

- _Goal:_ Native children and portable declaration validation use one complete repository-selector policy, while
  engine-owned checked-index execution still selects its intended index.

    - `[x]` **1.1.a Expose a reusable supplied-environment sanitizer**
        - Exported the shared readonly selector set and `sanitizeGitRepositoryEnvironment` from
          `src/lib/git/process-executor.ts`. Supplied environments lose all fifteen selectors and case variants without
          mutation; unrelated ambient, Git and adapter control variables remain available.

    - `[x]` **1.1.b Preserve native child and checked-index composition**
        - Native cwd and raw-Git execution share the dependency-free selector sanitizer, re-exported by
          `process-executor.ts`. Command and raw-output probe environments retain their policies; linked staged and
          worktree requests keep their selected temporary index after ambient selector removal. Indexed Markdown
          checker alignment follows native ESM dependencies through the same byte-matching boundary.

### `[x]` **1.2 Validate runner eligibility and explicit environment declarations — D1, D2**

- _Goal:_ Declarations express portable eligibility and explicit inputs without permitting bindings that override
  engine-derived execution channels or cwd-scoped Git selection.

    - `[x]` **1.2.a Validate eligibility and binding names in both declaration forms**
        - Ordinary and selection codecs preserve explicit value/file declarations with conservative defaults.
          `EnvironmentInputsSchema` validates portable names, kinds, case duplicates and shared Git/ARC reservations;
          owning-checkout runner opt-ins refuse with removal/retry guidance before machine configuration.

    - `[x]` **1.2.b Publish declaration metadata through existing schema generation**
        - Registry projections, typed reads, codecs and CLI-installed editor documents retain eligibility and explicit
          inputs. Regenerated editor documents through `arc schema install`; cross-field and reserved-name rules remain
          enforced by the runtime schema, with repaired declarations accepted on retry.

### `[x]` **1.3 Capture, identify and rebind explicit values and files — D2**

- _Goal:_ One check attempt uses immutable explicit input bytes and presence semantics across every probe and batch,
  without exposing file contents or making host paths part of identity.

    - `[x]` **1.3.a Capture bounded, stable value and file inputs**
        - Added injectable binding capture and bounded file copying/hashing with opened-handle stability checks.
          Unset/empty/value/file states remain distinct; cwd-relative paths and explicit external symlinks resolve to
          regular files. Unreadable, nonregular, changing or continuously growing inputs refuse with redacted retry
          guidance and stable repaired inputs remain capturable.

    - `[x]` **1.3.b Bind captured inputs and dispose their owned storage**
        - Added pure frozen-input replay with native environment-name semantics, immutable literals/file bytes and
          location-independent content identity. Partial captures clean up only owned storage; settled disposal is
          idempotent, while redacted cleanup failures remain retryable after repair. Valid own names survive capture
          and replay without treating inherited object properties as caller inputs.

### `[x]` **1.4 Bind native commands, runtime probes and scoped keys consistently — D2, D6, D8**

- _Goal:_ Native cache decisions, probes and commands describe the same captured explicit inputs, including when caching
  is disabled, and release their temporary files on every settled exit.

    - `[x]` **1.4.a Capture before native runtime qualification and reuse**
        - Native dispatch owns one binding scope before global/check runtime probes and pass lookup, including
          cache-disabled execution. Probes and all batches receive frozen inputs through the native process policy;
          cache hits, command failures and finalization exceptions dispose owned copies. Forecasts defer capture, and
          shared engine-channel policy composes explicit inputs before Git/index/content/notice bindings.

    - `[x]` **1.4.b Include explicit input identities in native scoped keys**
        - Versioned disposable keys include the binding scope's content identity while preserving declared inputs,
          divergence, historical scope and exact runtime outputs. Real CLI scenarios distinguish presence, literals and
          equal-size file changes, reuse identical bytes at another path, and retain reuse across unrelated source
          movement; native index, fixer, batching, notice and dry-run regressions retain their behavior.

- _Outcome:_ TypeScript/JSDoc checks the shared dependency-free native ES module directly; readonly source annotations
  keep its declaration and execution policy together without a companion declaration file.

### `[x]` **1.5 Carry names-only forecasts into late native CI capture — D2, D9**

- _Goal:_ CI binds the environment delivered to its execution step, while forecasts carry only enough declaration
  metadata to detect stale input contracts without capturing secrets or premature absence.

    - `[x]` **1.5.a Carry names and kinds across forecast serialization**
        - Forecasts copy names and kinds into text/JSON, including empty selections; CI decoding preserves the map.
          Selected declaration drift refuses before execution with a regenerate remedy; repaired forecasts run normally.

    - `[x]` **1.5.b Bind native CI playback after artifact delivery**
        - Native CI captures once after delivery and rebinds every batch, preserving presence and fixed file bytes.
          Invalid files refuse with repair/retry; empty batches skip capture, and command/preparation failures dispose
          owned inputs while preserving native status, workflow arguments, shard playback and index/fixer handling.

### `[x]` **1.6 Exercise captured native and CI inputs — D2, D9** — validate exit criterion at segment scope

- _Goal:_ Production native and CI entry points demonstrate the phase exit criterion using shared bindings and preserve
  existing native execution under conflicting ambient repository selectors.
- _Outcome:_ `check-environment-inputs.e2e` and `ci-check-runner` scenarios passed for late delivery, frozen mutations,
  presence, stale-forecast repair and cleanup. `check-index.e2e` and `check-git-environment.e2e` retained checked-index
  ownership and independent Git behavior. A built-CLI scenario refused a reserved mixed-case binding before execution
  (exit 2); removing it produced a passing native retry (exit 0) despite conflicting ambient Git selectors.

## **Phase 2:** Establish portable source and execution contracts

_Purpose:_ Complete the reusable source, configuration and planning substrate without mistaking Git tree identity for
execution bytes or assuming the caller's platform is the worker's.

_Mode:_ `layer` — closes on typed runner messages, a faithful self-contained source artifact and complete portable
plans.

_Exit criterion:_ The defining APIs validate the versioned wire contract, resolve only the machine runner key, capture
the selected source basis with independent Git coordinates, and budget complete argv for both platforms.

### `[x]` **2.1 Read the narrowly scoped machine runner configuration — D1**

- _Goal:_ Only selected eligible checks consult the machine's literal adapter argv, and malformed configuration gives a
  repairable refusal without changing global configuration ownership or invoking a local bypass.

    - `[x]` **2.1.a Parse only the flat machine runner key**
        - The narrow reader uses OS home and YAML node kinds to distinguish empty documents from invalid scalars.
          Literal argv preserves empty arguments and rejects invalid executable/NUL values; failures name the machine
          file and field with removal/repair remedies, without exposing unrelated settings.

    - `[x]` **2.1.b Resolve executable locations independently of project precedence**
        - Bare and absolute executables remain literal; directory-bearing relative paths resolve from the machine
          file. Ordinary native checks return before home/file reads, and repaired or removed keys take effect on retry.

### `[x]` **2.2 Define the shared version-one protocol contracts — D5**

- _Goal:_ One shared validator defines exactly what a version-one conversation can claim, including opaque IDs,
  full-width native statuses, complete known-runtime coverage and both settlement arms.

    - `[x]` **2.2.a Define envelopes and operation payload schemas**
        - Shared strict DTOs cover source manifests, captured bindings, fixed commands/probes, preparation, recovery,
          outcomes and both settlement arms. Delimiter-free JSON-RPC decoding enforces versions, string IDs and
          result/error envelopes; native uint32 statuses and decoded 64 KiB chunks retain exact representations.

    - `[x]` **2.2.b Validate correlated coverage against a fixed plan**
        - Indexed plans and known runtime bindings require exact unique invocation/probe coverage, preserving stdout;
          explicit unknown runtime remains executable without reuse. Recovery, source confirmation, RPC replies and
          settlement reject mismatched identities; protocol faults retain observed immutable outcomes and block evidence.

### `[x]` **2.3 Preserve selected source basis and verified HEAD evidence — D3**

- _Goal:_ Routed capture can distinguish worktree, index and commit code and certify a real HEAD or verified unborn
  repository, instead of silently substituting live files or treating an unresolved read as unborn.

    - `[x]` **2.3.a Preserve selected source evidence in request resolution**
        - Requests retain their worktree, selected-index or pushed-commit basis and logical HEAD evidence.
          `readCheckHead` verifies unborn branches; `requireSourceCoordinates` refuses unavailable or invalid
          coordinates with repair/retry/local remedies while native resolution retains its existing policy.

    - `[x]` **2.3.b Acquire and recheck the routed source boundary**
        - `acquireSourceBoundary` retains selected coordinates and raw path enumeration, rechecks their stability and
          releases its private worktree index on refusal. Index/commit guards remain bound to selected code.
          `resolveSourceCwd` checks lexical and resolved directory containment with actionable correction routes.

### `[x]` **2.4 Capture raw source entries and canonical manifest identity — D3**

- _Goal:_ The captured manifest describes actual execution presentation and remains unchanged by later original edits,
  with portable identity independent of descriptor paths and generated Git administration details.

    - `[x]` **2.4.a Freeze stable regular files and supported links**
        - `freezeSourcePresentation` freezes streamed bytes, modes, stored names and contained literal links, retaining
          a private catalog-to-presentation map. Its separate descriptor and owned cleanup accompany refusal/retry/local
          remedies for invalid, changed or unsupported entries, including unresolved Windows link types.

    - `[x]` **2.4.b Canonicalize and validate public source identity**
        - `identifySourceManifest` orders UTF-8 paths and public fields against independently generated digest vectors.
          `verifySourcePresentation` validates descriptors, coordinates and captured entries after relocation, with
          refusal and repair paths. `indexSourcePresentation` retains catalog labels, stored names and scoped material
          independently from whole-artifact identity; unresolved entries remain unavailable.

### `[x]` **2.5 Materialize selected code and self-contained Git metadata — D3**

- _Goal:_ Selected index/commit presentation and required Git code history survive relocation without the original
  gitdir, filters on the worker, private refs/configuration or a worker-dependent replacement view.

    - `[x]` **2.5.a Materialize the selected basis faithfully on the caller**
        - `freezeSelectedSource` uses a private index and selected attributes in the caller's Git context, preserving
          worktree bytes directly and freezing selected EOL, smudge and real local-object LFS output. Selected entry
          validation refuses lost link or executable fidelity; failed materialization cleans owned storage and supports
          repaired filter/link retries with keep-local remedies.

    - `[x]` **2.5.b Construct independent code-only Git metadata**
        - `addSourceGitMetadata` packs the selected code closure, installs independent HEAD/index administration and
          checks history connectivity in an empty hook context. Linked/unborn SHA-1 and SHA-256 captures survive original
          removal; incomplete history and unsupported formats refuse with cleanup and repaired retries, without copying
          caller configuration, hooks, private refs or dependent object stores.

### `[x]` **2.6 Build complete invocations and portable final-argv batches — D4, D5**

- _Goal:_ Placement receives a complete immutable plan whose actual final argv fits both platform budgets and whose
  execution channels match native files/project/probe policy.

    - `[x]` **2.6.a Export portable final-argument batching primitives**
        - `batchPortableCheckPaths` and `portableCheckArgumentBatches` budget complete fixed argv against both native
          calculations. Shared partitioning preserves literal path order and withholding without expanding shards;
          oversized commands or paths refuse with shortening remedies, including empty path sets and literal shell text.

    - `[x]` **2.6.b Form invocation and probe plans with distinct content policy**
        - `planCheckExecution` owns immutable argv, IDs and coordinates with root/check-scoped probes before placement.
          Physical source/cwd geometry retains intended file arguments through directory links while transporting the
          contained authored cwd. Files checks retain native content channels when paths are withheld; invalid plans
          and probe overflow have refusal and repair paths.

## **Phase 3:** Implement the run-scoped adapter conversation

_Purpose:_ Provide one provider-neutral prepared execution boundary and an independent runnable adapter using the same
public messages and captured-input definition.

_Mode:_ `slice` through Phase 4 — closes on a real configured check with sound reuse, native verdicts and settled
lifetime.

### `[x]` **3.1 Transport and validate ordered JSON-RPC conversations — D5**

- _Goal:_ A single adapter conversation preserves byte ordering and protocol authority across preparation, lookup,
  execution and closure, with diagnostics isolated from terminal evidence.

    - `[x]` **3.1.a Implement process-backed framing and RPC correlation**
        - Added injectable Execa transport with strict UTF-8 NDJSON/CRLF framing, unique correlated request IDs and
          ordered required notification delivery. Protocol and required-pipe faults remain distinct from best-effort
          stderr; process completion exposes observed start and exit status.

    - `[x]` **3.1.b Enforce recovery-before-ready and ordered requests**
        - Bound requests to one attempt/context, required retained recovery before ready, and enforced advertised
          groups, one outstanding execution and at-most-once invocation IDs. Cancellation can overlap preparation or
          execution without replacing settlement; immutable terminal observations survive protocol faults.

### `[x]` **3.2 Account for outcomes, settlement and both closure arms — D5, D7, D8**

- _Goal:_ Every observed terminal outcome remains immutable, and disposal requires the settlement and process closure
  appropriate to whether preparation granted a context.

    - `[x]` **3.2.a Track per-invocation outcomes and required output closure**
        - Verified exact terminal coverage, immutable prior outcomes and unsigned 32-bit statuses at the session
          boundary. Required protocol streams now fail explicitly on premature close; drain-aware process fixtures
          preserve the distinction between received terminal evidence and incomplete output or settlement.

    - `[x]` **3.2.b Model context-owning and no-context normal closure**
        - Added idempotent session closure requiring release or settled no-context preparation, drained protocol and
          observed exit zero. Optional cancel replies and settled cleanup warnings do not hold closure; incomplete
          work, malformed replies and abnormal exits remain uncertain, while never-started adapters are unavailable.

### `[x]` **3.3 Prepare captured execution through one injectable facade — D3, D5, D7**

- _Goal:_ Consumers prepare one fixed input/runtime context through a reusable boundary and can observe complete
  outcomes and lifetime evidence without reimplementing source capture or provider policy.

    - `[x]` **3.3.a Assemble preparation from generic plans and owned inputs**
        - Added `prepareSelectedCheckExecution` and `PreparedCheckExecution`, composing selected source, frozen explicit
          bindings, immutable native or consumer-built plans, fresh UUIDs and validated runtime readiness. One lifetime
          owner retains uncertain captures and recovery, disposes settled inputs, and reports failed local cleanup.

    - `[x]` **3.3.b Expose common run, optional group and lifetime operations**
        - Prepared singles/groups preserve per-ID outcomes and enforce fixed-plan dispatch. Attempt controls cover
          capture, pending preparation and execution; cancellation retains outstanding work until settlement, while
          termination retains uncertain captures and recovery. Drift refusal requires a fresh explicitly qualified
          attempt; cache-hit and executed closure share the same lifetime owner.

### `[x]` **3.4 Provide the standalone local adapter and process-backed fixtures — D5, D7, D10**

- _Goal:_ A team can implement the public contract using a small inspectable executable, and real process tests can
  drive settlement faults without depending on ARC-private imports.

    - `[x]` **3.4.a Implement mandatory singles in the standalone local example**
        - Added the builtin-only Linux example with mandatory singles, optional Node qualification, exact probe stdout
          and native environment/notice policy. Supervised groups retain plan ownership before work, drain descendants
          on cancel/EOF, and support documented inspection/settlement after frontend loss, including preparation.
          Recovery delivery precedes dispatch; unsupported platforms and changed inputs/runtime refuse explicitly.

    - `[x]` **3.4.b Provide reusable real-process conformance fixtures**
        - Added `runner.ts` over the declared-repository producer with independent adapter state and retry-safe cleanup.
          Shared scripted groups cover complete, malformed and lost conversations; actual binary frames, native signals
          and both closure arms use the public validators. The example refuses changed source/Git/explicit inputs and
          incompatible planned directories, retaining known failures while descendants settle or are cancelled.

## **Phase 4:** Compose routing, reusable evidence and native results

_Purpose:_ Wire the prepared boundary into actual check dispatch before cache lookup, retaining completed failures and
resources through errors, interruption and uncertain execution.

_Exit criterion:_ The real CLI routes an eligible check through the standalone adapter, qualifies known runtime reuse or
runs unknown runtime without reuse, preserves native outcomes, and closes or retains every resource correctly.

### `[x]` **4.1 Compose scoped content keys from prepared execution identity — D3, D6**

- _Goal:_ A pass describes scoped captured content and the actual prepared executor while unrelated source/store changes
  and transport handles cannot broaden its dependency set.

    - `[x]` **4.1.a Separate scoped content material from runtime observation**
        - Added probe-free `resolveCheckKeyMaterial` with captured Git and scoped raw presentation reads; native key
          composition preserves runtime/history ordering. Captured Git creates its empty-tree object before preparation,
          so later scoped matching preserves the prepared context after caller removal.

    - `[x]` **4.1.b Compose prepared identities and qualify reuse**
        - Versioned disposable keys to bind scoped raw presentation, captured explicit identity and each qualified
          executor's exact probe output. Added generic prepared-runtime projection and guarded composition; real adapter
          checks preserve keys across unrelated source, renamed handles and moved identical explicit files.

### `[x]` **4.2 Select and prepare routed checks before reusable lookup — D1, D5, D6, D9**

- _Goal:_ The real selected-check path qualifies routed execution before any applicable cache lookup, while native,
  forecast and dry-run retain their owning-checkout and no-side-effect contracts.

    - `[x]` **4.2.a Select the execution strategy before key resolution**
        - Wired machine configuration and prepared execution into selected-check dispatch before reusable lookup. Hits
          close without execution; misses run fixed portable singles, and unknown runtime stays live without recording.
          Native fallback retains its cwd and bypasses adapter launch; ordinary checks do not expand declared shards.
          Every check form classifies the adapter's engine-owned protocol stdin separately from terminal input.

    - `[x]` **4.2.b Preserve forecast, dry-run and repair routes**
        - Configured previews explain preparation-dependent reuse without probes or explicit-file capture. Preserved
          machine-file context, repair guidance and retained-attempt locations through text/JSON refusals and fresh
          retries; native forecast and CI playback retain their existing execution path.

### `[x]` **4.3 Reduce immutable invocation outcomes before pass publication — D6, D8, D9**

- _Goal:_ A check passes only after complete native-success evidence and normal closure; a known completed failure
  remains failed when another batch or transport is incomplete.

    - `[x]` **4.3.a Share invocation normalization and incomplete-result reduction**
        - Added shared native observation normalization and reduction in `src/lib/checks/result.ts`, retaining completed
          failures beside missing work and preserving no-evidence, killed, uint32 and valid empty-share semantics. Native
          batches and routed singles now share the same evidence model and notice precedence.

    - `[x]` **4.3.b Keep final verdict and publication in the handler**
        - `finalizeCheckRun` consumes structured invocation and closure evidence, preserving incomplete-work details
          beside failures. Real adapter faults block publication for wrong source, incomplete output, conflicting context
          and abnormal closure; native-only install interpretation and advisory report/pass-store failures retain scope.

### `[x]` **4.4 Preserve cancellation, recovery and capture lifetime at CLI exits — D5, D7, D9**

- _Goal:_ Every production exit either proves launched work and output settled before disposal or retains the capture
  with actionable provider recovery, without automatically replacing an ambiguous attempt.

    - `[x]` **4.4.a Wire interruption and exceptional exits through one lifetime owner**
        - One request owner spans concurrent preparations and pre-push refs, sends correlated cancellation on first
          interruption and local adapter termination on second, and waits for facade closure at exceptional exits.
          Queued checks refuse dispatch after interruption; settled work releases captures, while uncertain work
          retains its recovery coordinates.

    - `[x]` **4.4.b Report and retain uncertain attempts with usable recovery**
        - Retained preparation, execution and cache-hit closures report plan/context, adapter, inputs and provider
          recovery in text/JSON, including CI. Settled cleanup warnings remain advisory through refusal and reuse;
          provider inspection excludes dead owners. Real provider settlement permits capture removal before fresh retry.

### `[x]` **4.5 Wire foundation portability cases into actual execution — D4, D5, D8, D9**

- _Goal:_ The supported Windows route executes the foundation's process, plan and result cases, so a green portability
  run supplies the real platform evidence required by routed qualification.

    - `[x]` **4.5.a Exercise actual platform-aware process and result behavior**
        - Real-child status fixtures traverse native execution, prepared transport and CLI incomplete-work reduction,
          retaining each platform's native bits and repaired retry. Plans map forwarded paths and cwd to captured
          spelling, preserve withheld/deleted paths, and refuse unmapped selections. Windows catalog backslashes refuse
          before lookup; POSIX literal filenames and compatible case/Unicode directory behavior remain covered.

    - `[x]` **4.5.b Select and classify the foundation's supported-platform cases**
        - Production selection and source classification include foundation suites alongside native portability cases.
          CI run `40554990722` at `fe64e7752` records completed Windows/macOS execution, including real child DWORD
          statuses, captured path spelling, process-start/cleanup behavior and native directory-link receipts.

### `[x]` **4.6 Exercise routed checks — D3, D5, D6, D7, D8, D9** — validate exit criterion at segment scope

- _Goal:_ Production CLI dispatch demonstrates prepared reuse, faithful inputs, native verdict reduction and both
  settlement arms together, rather than proving only isolated protocol helpers.

- _Outcome:_ Built-CLI scenarios preserved index/commit bytes through live edits, mode/probe/Git bindings, scoped
  reuse through personal-store changes and binary output. Existing CLI fault/recovery cases and hosted run
  `40554990722` at `fe64e7752` cover settlement, repaired retry and actual Windows/macOS status preservation.

## **Phase 5:** Qualify public and external adapters

_Purpose:_ Prove the same seam with independent tooling, make the example and contract available to teams, and measure
the actual preparation and reuse costs without adding provider behavior to ARC.

_Mode:_ `slice` — closes on public standalone and external arc-offload adapters qualified through the same boundary.

_Exit criterion:_ The shipped example and external adapter satisfy single-check source, result and lifetime contracts;
admission/fallback remain provider-owned and cold/warm preparation costs are recorded honestly.

### `[x]` **5.1 Implement the external arc-offload adapter in its own repository — D10**

- _Goal:_ The personal pool can execute ARC's public captured-input plan through its ordinary registry/admission
  authority, with no privileged ARC integration or dependency in the installed framework.

    - `[x]` **5.1.a Consume public requests in the external repository**
        - The independent Python executable verifies and delivers captured source/files, preserves literal execution
          bindings, intersects provider routes before preparation and reports unknown runtime without reusable passes.

    - `[x]` **5.1.b Bind provider work to recovery before launch**
        - Plan-owned journals and launch barriers cover upload, preparation and execution; retained permits, immutable
          native outcomes and fresh inspect/settle close cancellation or loss without replacing an invocation.

- _Outcome:_ External arc-offload revision `a7b9602abc00a2e05587e57df4df8d20ce338d57` composes the public protocol with
  its existing admission authority. Linux process-group compatibility and unknown runtime remain explicit; captured
  bytes are disposable, cleanup warnings advisory and missing ownership or completion evidence uncertain.

### `[ ]` **5.2 Qualify external placement, recovery and at-most-once execution — D7, D10**

- _Goal:_ External qualification proves fixed inputs and settled ownership under real provider placement and failure,
  including permitted provider fallback while the host's required-remote reservation stays effective.

    - `[ ]` **5.2.a Exercise external source, runtime and placement conformance**
        - Extend proposed `tests/test_arc_adapter.py` with disposable Git/fake transport coverage and run the shared ARC
          process-backed contract against this executable, rather than a separate provider-only result contract.
        - Build `test-first` (one behavior at a time):
            - Dirty/index/commit bytes, external declared files and conflicting worker Git selectors preserve captured
              inputs.
            - Unavailable placement and changed known runtime refuse before execution; repaired placement supports
              explicit retry.
            - Independent writable views or serialization prevent one invocation from changing another's captured
              sources.

    - `[ ]` **5.2.b Qualify live policy and uncertainty without changing owner settings**
        - Record real remote success and unavailable placement under the active host policy; use isolated test
          configuration to demonstrate provider-permitted local fallback, never flip the owner's live mode.
        - Exercise transport loss before context and during execution, plan-ID inspect/settle, cancellation/output
          draining, no-context refusal, and at-most-once execution; retain uncertain artifacts until proven settled.
        - Run the external repository's required checks and ARC conformance; record separate repository
          revisions/evidence.

### `[ ]` **5.3 Publish the adapter guide and qualified standalone example — D10**

- _Goal:_ Teams can configure or implement an adapter in any language from shipped documentation and a runnable example,
  without ARC-private imports, personal runner installation or internal roadmap knowledge.

    - `[ ]` **5.3.a Document the complete public contract and configuration**
        - Create `packages/arc-framework/README.md` and the example directory README; document literal argv resolution,
          eligibility, explicit values/files, manifest encoding vectors and all operations/outcome/lifetime rules.
        - State the complete reserved Git/ARC policy, source/content-channel distinction, known/unknown runtime, uint32
          statuses, no-context closure, recovery-before-work and provider-owned admission/fallback.
        - Document inspect/settle/retry and each example limitation; measure implementation burden from the actual
          example.

    - `[ ]` **5.3.b Ship the example and installed quality-gates guidance**
        - Add the example to `packages/arc-framework/package.json` 's package inventory; ensure executable support
          files/READMEs are present in a package dry-run and runnable without source-package imports.
        - Update package-source `arc/reference/strategies/arc/strategy-quality-gates.md`, render its Framework copy
          through the project sync command and verify installation, preserving configurable project sections.
        - Test-after the documentation/configuration edit with public-example conformance, package inventory and
          installed-document checks; add no unnecessary CLI schema family, SDK, RPC dependency or docs-site changes.

### `[ ]` **5.4 Measure cold, warm and reusable-hit execution costs — D10**

- _Goal:_ Qualification makes actual setup and reusable-hit costs visible for both adapters and proves that native
  defaults incur no source-capture or adapter-preparation work.

    - Measure cold, warm and would-be-cache-hit runs for the standalone and external adapters, separating capture,
      materialization/dependency preparation, probes, command time and release; record environment/runtime disposition.
    - Count source-capture/preparation/spawn calls on the unconfigured route; measure declared-file capture separately
      where applicable instead of presenting it as source-capture overhead.
    - Record reproducible commands, fixture/revision, sample counts and observed costs in
      `notes-machine-check-runner.md`; keep live registry/credentials/private inventory outside tracked evidence and
      impose no invented performance threshold.

### `[ ]` **5.5 Exercise provider-neutral qualification — D10** — validate exit criterion at segment scope

- _Goal:_ The same public seam is independently usable by the small shipped executable and the personal provider, with
  source, verdict, output, recovery and placement-policy evidence visible at qualification.

    - Execute both real adapters through ARC with success, unavailable/repaired retry, known/unknown where supported,
      fixed explicit/source inputs, cancel/EOF and retained-uncertainty recovery scenarios.
    - Confirm the packaged example runs from installed inventory, record cold/warm/reuse costs and concurrent writer
      isolation/serialization, and verify no ARC provider dependency or alternative evidence path was introduced.
    - Request `npx arc check segment`; record evidence with external revision and supported platform coverage.
    - Leave failed exit criteria to owning tasks or revision parents ahead of this verifier.

## **Phase 6:** Adopt ordinary declarations and close the architecture

_Purpose:_ Replace this repository's prototype command prefixes only after qualification, preserve its active placement
policy, and reconcile the architectural record against the completed public contract.

_Mode:_ `slice` — closes on ordinary repository checks using the qualified runner and an evidence-backed ADR closeout.

_Exit criterion:_ All then-landed prototype-prefixed checks use ordinary commands with correct eligibility/input
declarations; the old wrapper is retired, native/default operation is preserved and ADR-039 reflects qualified behavior.

### `[ ]` **6.1 Replace prototype prefixes and retire all landed wrapper dependencies — D1, D2, D10**

- _Goal:_ Every then-landed wrapper consumer uses the qualified ordinary route without dangling command or catalogue
  dependencies, while the owner's placement reservation remains effective.

- _Note:_ See `notes-machine-check-runner.md` § Repository adoption inventory and § Store prerequisite adoption; the
  nine current checks are a baseline inventory, not a retirement ceiling or a new backend completion wait.

    - `[ ]` **6.1.a Re-ground and convert the full landed declaration surface**
        - Inventory wrapper-prefixed declarations and their actual environment readers in the execution checkout;
          replace prefixes with ordinary argv and `runner: true`, including `test:store` if it has landed.
        - For landed store selection, declare `ARC_STORE_CHECK` and `ARC_STORE_BURSTS` as explicit `value` inputs;
          retain the native reach command, mode, shard settings and applicable runtime probes.
        - Preserve deadline/root/selection settings for all current declarations; keep provider controls outside
          data-input maps and leave formatter/index/artifact-build declarations ineligible.
        - Test-after the declaration edit with schema/read/forecast checks and selected configured/native runs.

    - `[ ]` **6.1.b Remove obsolete reach-catalogue references before deleting the wrapper**
        - When the store catalogue is present, remove its obsolete exact `scripts/check-runner.sh` widening entry and
          re-ground remaining execution/selection dependencies against native reach behavior.
        - Add a wrapper-absent regression using the real reach selector: full, affected and valid no-op selections
          remain reachable, and both store selectors preserve captured absence/value semantics.
        - When the store prerequisite is absent, finish the available foundation adoption without waiting for it; the
          later native-store consumer owns that profile's remaining ordinary-command/input/catalogue alignment.

    - `[ ]` **6.1.c Retire discovery after policy-preserving configuration**
        - Configure the qualified external executable through the narrow machine key, preserving unrelated keys and live
          required-remote policy; verify the new route before deleting `scripts/check-runner.sh`.
        - Remove the wrapper's `global_inputs` and documentation dependencies, then search all then-present command and
          data consumers to prove no dangling executable or exact catalogue path remains.
        - Verify missing-key native execution in isolated configuration, never by disabling the owner's live policy.

### `[ ]` **6.2 Qualify the repository's configured and native check paths — D9, D10**

- _Goal:_ Repository declarations exercise the qualified configured route and the native default without changing gate
  semantics, CI ownership or projected-state/index/fixer boundaries.

    - `[ ]` **6.2.a Qualify configured repository check execution**
        - Run representative file/project checks and the declared gate through the external path under the active
          policy; include landed store selection when present. Verify explicit selectors/files, actual runtime
          disposition and complete outcomes.
        - Exercise unavailable execution and successful repair/retry without ARC bypass, preserving failure versus
          missing-result classification and machine-local disposable evidence.

    - `[ ]` **6.2.b Qualify native and storage-independent composition**
        - Exercise isolated unconfigured execution and native CI, fixer/index and projection selections; verify no
          ordinary local shard expansion, source artifact or adapter spawn on these routes.
        - Re-ground pass/report integration against landed backend/projection when available and exercise expected
          projection-layout fixtures; unrelated store/projection changes must not affect declared cache scope.
        - Keep real projection integration opportunistic while this work is open; no new storage wait or lifecycle
          write.

### `[ ]` **6.3 Reconcile approved implementation changes and accept ADR-039 — D10**

- _Goal:_ ADR-039's Accepted status describes approved, qualified architecture rather than an implementation-driven
  rewrite of pre-commitment or a claim that optional consumers already shipped.

    - Compare the completed contract, approved forward amendments and both adapters' qualification evidence with
      `adr-039-use-provider-neutral-check-runners.md`; reconcile rationale, consequences and actual limitations.
    - Keep unshipped optional consumers explicit and verify no durable review/delivery/lifecycle storage coupling was
      added; surface any new architectural delta through approval rather than editing the target to fit the code.
    - Mark the ADR Accepted only in this final implementation task's ordinary review and commit, after any approved
      implementation-time updates; retain Proposed until then.

### `[ ]` **6.4 Exercise ordinary repository declarations — D1, D10** — validate exit criterion at segment scope

- _Goal:_ The repository adoption exit criterion is backed by ordinary declarations using the public runner path,
  preserved native boundaries and an ADR accepted from actual qualification evidence.

    - Validate the full then-landed declaration/catalogue inventory and removal of wrapper references; exercise
      configured and isolated-native production entry points, required-remote refusal/repair and unchanged native
      CI/fixer/index behavior.
    - Confirm public package inventory/documentation, recorded external revision/measurements and ADR closeout.
    - Request `npx arc check segment`; record scenario results and regressions actually selected, keeping corrective
      work in a revision parent ahead of this evidence sink.

## **Phase 7:** Verification

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

- _Goal:_ Required gates and supported-platform CI pass at the verified head, and each success criterion has evidence
  before integration readiness is reported.

---

## Success Criteria

- `[ ]` Machine configuration tests prove literal argv/path resolution and eligibility; a real CLI check succeeds after
  invalid configuration or missing-executable repair, without a configured-runner local bypass.

- `[ ]` Native/default and native CI scenarios retain cwd, unsharded command, fixer/index and workflow-owned shard
  behavior; spies show no source capture/adapter preparation on unconfigured or dry-run routes (Tasks 1.6, 4.2, 6.2).

- `[ ]` Environment capture scenarios distinguish absence, empty strings, zero-byte and nonempty files; one frozen
  binding reaches commands/probes/batches, moving identical bytes preserves identity, and routine output is redacted.

- `[ ]` Forecast/CI round trips expose only `environmentInputs` names/kinds, capture after artifact delivery, refuse
  declaration mismatch and succeed after regeneration (Tasks 1.5–1.6).

- `[ ]` Reserved ARC/Git bindings and case variants refuse with removal/retry guidance; a repaired check's commands and
  probes still select captured Git under conflicting second-repository selectors, with native index behavior intact.

- `[ ]` Disposable-repository scenarios prove worktree dirty/untracked bytes and index/commit-selected presentation,
  fixed bytes after original edits, code-only self-contained Git, public manifest vectors and safe cwd/link boundaries.

- `[ ]` Filter/LFS/EOL, object-format, mode/link and changing-input scenarios establish fidelity or actionable refusal,
  with successful continuation after repair where supported; no worker filter or live-checkout substitution occurs.

- `[ ]` Routed plan tests budget complete fixed argv plus paths against both platforms, preserving literal argv,
  explicit shell policy, path order, cwd and distinct files/project/probe derived-coordinate policy (Tasks 2.6,
  4.5–4.6).

- `[ ]` Prepared-runtime reuse scenarios invalidate relevant source/value/file/runtime/probe changes, ignore unrelated
  content/store/path/worker changes, reject malformed known coverage and run unknown runtime without lookup/publication.

- `[ ]` Cache-hit production scenarios prepare and qualify first, run no check command, then release/drain/exit normally
  before disposal; no caller-runtime observation substitutes for applicable executor evidence (Tasks 4.1–4.6).

- `[ ]` Wire/process scenarios prove binary output order, correlated IDs, mandatory singles/optional groups and exact
  immutable outcomes; actual portability selection/classification reaches foundation cases, and a completed real Windows
  run preserves `256` and high-bit uint32 failures without truncation (Tasks 4.5–4.6).

- `[ ]` Native verdict scenarios preserve no-evidence/killed/no-op/controller-close meanings and a completed failure
  beside later missing work; wrong-source/incomplete/output-loss/conflicting/abnormal-close paths publish no pass.

- `[ ]` Context-owning success, failure and settled interruption close required work/output, release and exit before
  disposal; cleanup-only warnings and optional report/pass-store errors do not erase valid completed results.

- `[ ]` Settled unavailable/cancelled preparation drains/closes/exits without release; racing cancel acknowledgements do
  not hold closure, while acknowledgement alone or abnormal adapter exit never proves settlement (Tasks 3.2, 4.6).

- `[ ]` Pre-context and execution transport-loss scenarios retain capture plus usable plan-UUID recovery instructions;
  failed recovery writes dispatch no may-outlive work, and inspect/settle precedes fresh explicit retry without
  duplicates.

- `[ ]` Both actual adapters pass the public single-check conformance path, preserve/isolate writable inputs and record
  cold/warm/would-be-hit component costs; external unavailable and permitted fallback respect provider-owned policy.

- `[ ]` Package inventory contains the runnable independent example and complete contract/configuration guidance;
  installed quality-gates guidance resolves without internal artifact links or an ARC runtime dependency on arc-offload.

- `[ ]` At retirement, every then-landed wrapper consumer uses ordinary commands/eligibility and actual explicit inputs,
  all executable/catalogue wrapper dependencies are removed, and required-remote policy remains effective. When store
  has landed, real wrapper-absent reach selection and captured `ARC_STORE_CHECK` and `ARC_STORE_BURSTS` qualify; its later
  arrival introduces no new foundation completion wait.

- `[ ]` Final implementation closeout accepts ADR-039 after approved updates and qualification, states optional consumer
  status honestly and adds no durable lifecycle/review/delivery state or storage-cutover prerequisite.

- `[ ]` All quality gates pass.

- `[ ]` Ready for integration.

---

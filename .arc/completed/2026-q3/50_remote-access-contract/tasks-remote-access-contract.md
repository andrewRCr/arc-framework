# Task List: Remote Access Contract

- **Design:** `spec-remote-access-contract.md`

---

<!-- arc:delivery-plan:start -->
## Delivery Plan

- **Plan Revision:** `1`
- **Plan Digest:** `sha256:863350b54637a8ea609924520205dd715b62a90e7b69975a36fa723ee508775d`
- **Projection:** `stack-to-main`

| # | Member                                         | Chunk key                   | Tasks                                              | Design elements                               | Landability              |
| - | ---------------------------------------------- | --------------------------- | -------------------------------------------------- | --------------------------------------------- | ------------------------ |
| 1 | Remote evidence substrate and analyzers        | `substrate-analyzers`       | `1.1`<br>`1.2`<br>`1.3`<br>`2.1`<br>`2.2`<br>`2.3` | `detailed:remote-evidence-analysis`           | `independently-landable` |
| 2 | Explicit materialization and initial consumers | `materialization-consumers` | `3.1`<br>`3.2`<br>`4.1`                            | `detailed:explicit-materialization-consumers` | `independently-landable` |
| 3 | Evidence-qualified cleanup and recovery        | `cleanup-recovery`          | `4.2`<br>`4.3`                                     | `detailed:recovery-cleanup`                   | `independently-landable` |
| 4 | Read-only discovery and explicit expansion     | `discovery-expansion`       | `5.1`<br>`5.2`                                     | `detailed:discovery-expansion`                | `independently-landable` |
| 5 | Session composition and rollout                | `composition-rollout`       | `6.1`<br>`6.2`<br>`6.3`<br>`7.1`<br>`7.2`<br>`7.3` | `detailed:session-composition-rollout`        | `independently-landable` |
| 6 | Hermetic gates and lifecycle tail              | `hermetic-lifecycle-tail`   | `8.1`<br>`8.2`<br>`8.3`                            | `detailed:hermetic-lifecycle-closeout`        | `independently-landable` |

### Named seams

| Seam                                  | Incident members | Owner | Acceptance                                                                                                                      | Design elements |
| ------------------------------------- | ---------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Materialization to recovery evidence  | 2, 3             | 3     | Cleanup and recovery preserve exact advertised-object evidence and fail closed when materialization cannot establish it.        | —               |
| Discovery to session composition      | 4, 5             | 5     | Explicit expansion consumes the request-scoped snapshot and reports incomplete acquisition without hidden fallback reads.       | —               |
| Analysis to materialization authority | 1, 2             | 2     | Materializing consumers act only from the typed evidence emitted by passive analyzers and never broaden passive read authority. | —               |
| Recovery to discovery snapshot        | 3, 4             | 4     | Recovery and discovery interpret one remote generation with identical absence, availability, and degradation semantics.         | —               |
| Composition to terminal closeout      | 5, 6             | 6     | The composed control head passes whole-work-unit verification before the terminal member carries finalized lifecycle artifacts. | —               |
<!-- arc:delivery-plan:end -->

## **Phase 1:** Remote evidence substrate

_Purpose:_ Establish one typed, bounded, read-only authority for advertised refs and local object availability before
any analyzer or command adopts the new contract.

### `[x]` **1.1 Define the shared remote-evidence schema vocabulary**

- _Goal:_ Every remote-aware surface derives valid evidence and failure combinations from one schema authority.

    - `[x]` **1.1.a Add the evidence and failure primitives**
        - Added strict kernel enum schemas and inferred public types for the four remote-evidence values and four
          bounded remote-failure classes, with rejection coverage for every out-of-contract literal.

    - `[x]` **1.1.b Encode evidence-dependent field pairings**
        - Added a strict schema compositor that requires a bounded failure class only for unreachable evidence,
          forbids it on every other arm, and preserves each domain schema's own required-field and unknown-key rules.

    - `[x]` **1.1.c Register the shared vocabulary in the kernel schema bundle**
        - Registered stable `remote-evidence` and `remote-failure-reason` identities in every fresh kernel registry
          and deterministic generated bundle, with downstream composed registries inheriting both identities.

### `[x]` **1.2 Extend bounded remote reads and local proof checks**

- _Goal:_ One non-interactive remote query can prove branch membership and classify failure while one local batch
  query establishes which advertised commits are analyzable without writing Git metadata.

    - `[x]` **1.2.a Return a typed remote-head snapshot from the existing reader**
        - Added strict exact and all-heads snapshot results with bounded timeout, network, authentication, and error
          classifications; every remote read now closes stdin, forbids prompts, and pins diagnostics to the C locale
          without exposing raw process output.

    - `[x]` **1.2.b Add one batch local-object availability query**
        - Added a deduplicated, order-checked `cat-file --batch-check` helper that returns complete commit facts or
          bounded execution/malformed unavailability. Both text executors now pair local-only argv and environment
          guards, with a real promisor fixture proving a missing commit stays unmaterialized.

    - `[x]` **1.2.c Establish local history completeness for graph proofs**
        - Added a strict complete/shallow/local-unavailable prerequisite and proof policy that preserves
          non-traversal facts while allowing graph-derived conclusions only from complete local history.

    - `[x]` **1.2.d Prove each substrate component is bounded and read-only**
        - Locked each helper to one expected process, rejected every mutation or unexpected subcommand, and proved
          local-only executor policy leaves ordinary and explicit acquisition behavior unchanged.

- _Outcome:_ Remote membership, local commit availability, and graph-history sufficiency now form independent,
  typed prerequisites; none creates refs, fetches objects, or converts a local inspection failure into remote
  evidence.

### `[x]` **1.3 Close local-only compatibility and byte-reader seams**

- _Goal:_ Every production path that reads Git objects passively has an enforceable no-lazy-fetch capability on the
  declared platform floor, including byte-preserving tree and blob reads outside the text executors.

    - `[x]` **1.3.a Declare and verify the supported Git capability**
        - Raised package and lockfile metadata to Git 2.45, with contract coverage proving the paired global option
          and environment guard fail before object inspection on an unsupported client while ordinary acquisition
          remains unchanged.

    - `[x]` **1.3.b Add local-only byte-preserving object access**
        - Routed NUL-framed tree and index resolution plus byte-exact blob reads through the raw Git seam, paired
          both local-only guards on every passive subprocess, and selected that policy from status-side callers.
          Explicit lifecycle and decomposition reads retain their existing materializing default.

- _Outcome:_ The declared Git floor and both text and byte-preserving execution seams now enforce the same paired
  no-lazy-fetch contract; promisor fixtures prove passive commit, tree, and blob inspection leaves missing objects
  absent while explicit acquisition behavior remains available.

## **Phase 2:** Snapshot-driven core analyzers

_Purpose:_ Convert each fetch-owning session analyzer into pure analysis over advertised OIDs while preserving
explicit materialization where the command boundary authorizes it.

### `[x]` **2.1 Separate worktree relation analysis from remote acquisition**

- _Goal:_ A worktree relation has identical semantics for a supplied advertised OID regardless of how that OID was
  acquired, and incomplete evidence cannot masquerade as a stale exact relation.

    - `[x]` **2.1.a Extract pure snapshot-driven worktree analysis**
        - Added supplied-snapshot worktree analysis with exact, branch-gone, pending-fetch, and typed unreachable
          outcomes. Exact identity bypasses graph traversal, while distance reads require complete history, use
          local-only object access, and propagate execution or malformed-output failures to the runtime boundary.

    - `[x]` **2.1.b Remove tracking-ref and fetch-error authority from classification**
        - Moved disabled-sync, detached-head, no-remote, and no-upstream precedence into supplied-input analysis
          with explicit not-applicable evidence. Deleted-branch and pending results now depend only on snapshot
          membership and advertised-object availability, never stale tracking refs or fetch diagnostics.

- _Outcome:_ Worktree classification now derives exactness from advertised OIDs while preserving the shared
  ref-parameterized count primitive and the fetch-owning compatibility wrapper for later caller migration.

### `[x]` **2.2 Rework base analyzers around advertised OIDs**

- _Goal:_ Base orientation is exact only against the advertised base commit, distinguishes local and remote absence,
  and leaves materialization to explicit guarded operations.

    - `[x]` **2.2.a Extract OID-driven base-distance analysis**
        - Added snapshot-driven base-distance analysis with exact advertised-OID, pending-object, exact-absence, and
          typed-unreachable outcomes. Graph reads require complete history and local-only object access; unexpected
          local failures propagate while the fetch-owning compatibility shell remains intact for the later cutover.

    - `[x]` **2.2.b Extract direct local-base comparison against advertised evidence**
        - Added OID-driven local-base comparison with exact identity and graph relations, pending-object and typed
          unreachable evidence, and distinct exact local/remote absence. Safe materialization routes through a
          structured `arc base sync --json` remedy while the fetch-owning session adapter remains intact.

    - `[x]` **2.2.c Preserve authoritative base materialization as an explicit action**
        - Authoritative drift now bounded-fetches and resolves `refs/remotes/origin/<base>` before invoking the same
          OID analyzer, with visible acquisition failures and no ARC temporary ref. The advisory compatibility shell
          temporarily retains its private ref, while `arc base sync` remains the sole local-base mutation path.

- _Outcome:_ Base orientation now separates advertised-OID analysis from acquisition: passive analyzers preserve
  exact and incomplete evidence, authoritative drift materializes explicitly, and local-base movement stays behind
  the guarded base-sync command.

### `[x]` **2.3 Rework user-reference authority around typed base evidence**

- _Goal:_ Full-protection edit and retirement authority is granted only from exact advertised-base evidence, while
  degraded states retain useful orientation without producing a reconciliation plan.

    - `[x]` **2.3.a Inject advertised-base evidence into reconciliation**
        - Added supplied-evidence authority analysis: full protection enumerates only at a local advertised base OID,
          partial protection retains the local base ref, and incomplete remote evidence carries no transitions.
          Pending, unreachable, and exact remote-base absence stay typed; local enumeration failures propagate.

    - `[x]` **2.3.b Preserve explicit user-reference materialization**
        - Full-protection reconciliation now bounded-fetches and resolves the configured base before invoking the
          shared analyzer; acquisition failures retain typed evidence, emit no plan, and exit nonzero. Partial
          protection remains local-only, while the existing plan/apply lock and atomic-write path is unchanged.

- _Outcome:_ User-reference authority now separates evidence analysis from command-owned acquisition: passive
  orientation can remain degraded, while explicit reconciliation either proves exact advertised-base authority or
  stops visibly before planning or mutation.

## **Phase 3:** Explicit acquisition policy outside session-init

_Purpose:_ Give every non-session worktree-sync consumer a named passive or materializing acquisition policy while
the existing session acquisition shell remains intact for the dependent-analyzer migration.

### `[x]` **3.1 Migrate passive exact worktree inspections**

- _Goal:_ Handoff, recovery, and user-status inspection obtain fresh branch evidence without mutating shared Git
  metadata or silently choosing a different acquisition policy.

    - `[x]` **3.1.a Add the named passive exact inspection entry point**
        - Added `runPassiveWorktreeInspection`, which resolves local applicability before one bounded exact-ref read,
          checks the advertised object locally, and delegates relation classification to the snapshot analyzer. It
          returns exact, pending, unreachable, branch-gone, and not-applicable evidence without metadata writes;
          local prerequisite failures remain runtime errors.

    - `[x]` **3.1.b Move passive callers to the exact reader**
        - Migrated session-handoff, compaction recovery, and `arc user status` to passive exact inspection; their
          typed envelopes and formatting preserve exact, pending, and unreachable evidence without action advice,
          while offline and disabled modes issue no remote read.

### `[x]` **3.2 Preserve fail-closed materializing worktree operations**

- _Goal:_ Commands that push, pull, or synchronize continue to require materialized exact relations and expose any
  denied fetch as a command failure.

    - `[x]` **3.2.a Name the explicit materializing inspection entry point**
        - Added `runMaterializingWorktreeInspection`, which resolves the post-fetch OID and delegates relation
          classification to the pure analyzer. Its type excludes skipped and unavailable results, local
          inapplicability remains explicit, and acquisition or graph failures reject before any action matrix runs.

    - `[x]` **3.2.b Migrate explicit action callers**
        - Moved `arc sync`, release-push pushability, and `arc user sync` to fail-closed materializing inspection,
          independent of automatic session policy. Existing exact decision matrices and explicit inbound fetch legs
          remain intact, while acquisition failures stop before push, pull, notes, or sync mutation.

## **Phase 4:** Remote-truth dependents and recovery

_Purpose:_ Remove hidden authority from refreshed tracking refs across completion-tail, cleanup, and recovery logic
by making every dependent analyzer accept supplied advertised evidence before the session composition cutover.

_Design decisions:_ Every passive graph, index, record, tree, or blob read uses local-only object access. Graph-
derived authority additionally requires complete local history; shallow-history gaps remain local probe failures.

### `[x]` **4.1 Parameterize supersession and completion-tail base relations**

- _Goal:_ Supersession, behind-base, and mergeability claims reflect the advertised commits or explicitly state
  that required evidence is unavailable.

    - `[x]` **4.1.a Derive supersession from the advertised branch OID**
        - Added the supplied-snapshot analyzer with exact, pending-fetch, unreachable, and exact-absence outcomes;
          graph analysis requires complete history and uses strict, local-only `git cherry` reads. Unexpected local
          execution and malformed-output failures now propagate to the runtime probe boundary.

    - `[x]` **4.1.b Replace the behind-base boolean with a typed relation**
        - Replaced completion-tail booleans with evidence-qualified relations and added advertised-base analysis for
          known, pending-fetch, unreachable, exact remote-base-absent, and not-applicable outcomes. Shallow history,
          unavailable prerequisites, and malformed or failed local graph reads now propagate as probe failures.

    - `[x]` **4.1.c Make completion-tail mergeability evidence-aware**
        - Added `mergeability-unavailable` with evidence-specific, precomputed guidance across classification,
          recommendation, schema, and workflow rendering. Merged and blocked precedence remains stronger; only a
          known relation permits `mergeable`, and only known true retains the behind-base qualifier.

- _Outcome:_ Completion-tail reset and mergeability authority now derives from advertised OIDs and explicit
  evidence relations; incomplete remote evidence suppresses authority while local analysis defects remain probe
  failures.

### `[x]` **4.2 Parameterize sweep and retirement merge proofs**

- _Goal:_ Cleanup and retirement paths authorize destructive action only from graph proofs against the exact
  advertised base commit.

    - `[x]` **4.2.a Inject complete operands into stale, orphan, and errand checks**
        - Added supplied-snapshot paths for stale worktrees, orphan branches, Errands, and retired user directories.
          Exact advertised base and remote-only source OIDs now drive strict local-only graph and completed-index
          reads; checked-out Errands retain their local branch operand, incomplete evidence grants no cleanup
          authority, and unexpected local failures propagate. Compatibility callers retain legacy acquisition until
          the shared composition cutover.

    - `[x]` **4.2.b Remove landed-retirement acquisition from the sweep**
        - Removed base fetching from landed-retirement inspection and threaded stale-sweep evidence into exact-OID
          record enumeration and authorization. Incomplete evidence retains blocked candidates without teardown;
          exact record and graph reads are local-only, and unexpected record, graph, or required-blob failures now
          propagate instead of degrading to manual-cleanup warnings.

    - `[x]` **4.2.c Revalidate husk retirement against the advertised base**
        - Extended the husk callback with the supplied base OID and added strict local-only receipt and shipped-proof
          revalidation. Exact evidence ignores stale tracking refs; missing objects and shallow history block cleanup
          with guidance, while malformed graph, record, and blob reads propagate. Legacy explicit lifecycle callers
          retain their fail-closed revalidator until the shared composition cutover.

    - `[x]` **4.2.d Project degraded cleanup evidence without destructive remedies**
        - Added required cleanup evidence to stale-worktree, orphan, Errand, and landed-retirement results and their
          envelope views. Incomplete proofs retain blocked candidates with `evidence-unavailable`, preserve local-safe
          inspection and warnings, and cannot validate removable, merged-cleanup, or teardown authority.

### `[x]` **4.3 Derive branch-gone recency and pending recovery from snapshot OIDs**

- _Goal:_ Branch-gone recovery never auto-selects from an incomplete remote tier and remains deterministic when
  complete advertised commit dates are locally readable.

    - `[x]` **4.3.a Parameterize the local-worktree recovery tier**
        - Local recovery candidates now prove removability against the locally available advertised base OID with
          strict local-only graph reads. Incomplete objects, absent or unreachable base evidence, disabled inspection,
          and shallow history retain switch or external candidates without removal authority; local failures propagate.

    - `[x]` **4.3.b Read recent remote candidates by advertised OID**
        - Added a supplied-snapshot analyzer that applies exclusions before object inspection, counts eligible missing
          tips, and sorts verified recent branches by strict local-only OID date reads. Tracking refs cannot affect the
          result; shallow history, malformed dates, incomplete local facts, and execution failures propagate.

    - `[x]` **4.3.c Add the incomplete recent-tier recovery outcome**
        - Added the schema-backed `pending` recovery result with verified candidates, a positive unseen-tip count,
          and the exact live in-flight refresh remedy. An incomplete recent tier cannot auto-select or fall back;
          a non-empty local-worktree tier still resolves independently, and complete tiers keep existing behavior.

    - `[x]` **4.3.d Carry evidence into workflow-facing recovery guidance**
        - Exact recovery arms now carry exact evidence into the session envelope, while CLI-side composition emits
          schema-validated switch, prompt, or manual guidance. Pending evidence offers only the structured live
          refresh or manual recovery; workflow prose renders the composed result without comparing evidence or counts.

## **Phase 5:** Read-only discovery and explicit expansion

_Purpose:_ Preserve verified materialization candidates without probe-path prune or fetch writes, while making live
expansion failures typed and visible to command callers.

### `[x]` **5.1 Make discovery analyzers consume supplied snapshot evidence**

- _Goal:_ The no-active-work-unit oracle distinguishes verified candidates, unseen objects, remote failure, and
  disabled discovery from caller-supplied evidence without inferring ownership from branch names.

    - `[x]` **5.1.a Feed supplied snapshot heads into derivation**
        - Added a public supplied-evidence analyzer over exact all-heads OIDs and caller-provided availability,
          local-ref, worktree, and transient-record facts, while retaining `deriveInFlight` as the compatibility
          acquisition wrapper. The analyzer uses local-only object reads, retains changed advertised generations,
          and excludes only the configured base and exact transient-record branches.

    - `[x]` **5.1.b Verify candidates only from locally available advertised objects**
        - The supplied analyzer classifies only locally available advertised OIDs, counts unseen eligible heads
          without deriving identity from their names, and preserves zero pending only after complete classification.
          Incomplete local facts, history, object availability, or advertised metadata now reject at the runtime
          boundary instead of degrading into an evidence result.

    - `[x]` **5.1.c Define the complete materializable-work-unit domain contract**
        - Added a strict discovery-domain schema for exact, pending-fetch, unreachable, and not-applicable results,
          including evidence-qualified pending counts, failure reasons, warnings, and the exact structured live
          refresh remedy. The existing session-status projection remains unchanged for the Phase 6 cutover.

### `[x]` **5.2 Make live in-flight expansion explicit and fail-visible**

- _Goal:_ `arc active in-flight` materializes remote candidates only when requested, reports partial or failed
  expansion through its typed result, and returns a failing exit status whenever live expansion is incomplete.

    - `[x]` **5.2.a Add evidence and candidate-expansion schema arms**
        - `ActiveInFlightResult` now carries schema-validated complete, partial, failed, or not-requested expansion
          state paired respectively with exact, pending-fetch, unreachable, or not-applicable evidence. Partial
          requires a positive pending count, every other arm requires zero, and only failure carries a reason.

    - `[x]` **5.2.b Materialize only at the explicit active-command boundary**
        - Added an explicit expansion coordinator that pins one all-heads snapshot, excludes the configured base and
          exact transient-record branches, fetches only eligible missing generations, and rechecks the captured OIDs
          before strict supplied-evidence classification. Snapshot failure is typed as failed; post-snapshot fetch
          gaps remain partial, local mode stays read-only, and incomplete local facts remain runtime failures.

    - `[x]` **5.2.c Assign acquisition policy to every in-flight caller**
        - Routed live active discovery, materialize, start, transform, and rename composition through the explicit
          coordinator and its snapshot-pinned supplied result. Project composition now requires local, passive-live,
          or materialized-live policy explicitly; status and user views, Errand overlap, and the foreign-write hook
          remain on passive or local no-fetch paths while the session compatibility wrapper remains available.

    - `[x]` **5.2.d Propagate expansion failure through CLI behavior**
        - Live JSON and human output now expose distinct partial and failed expansion states before returning a
          non-zero exit status, while complete and local-only inspection remain successful. A two-clone integration
          proves explicit expansion turns a pending supplied-evidence re-probe into an exact verified candidate.

- _Outcome:_ Every in-flight caller now declares whether it reads local/passive evidence or explicitly materializes
  one pinned remote generation. The CLI fails visibly on incomplete acquisition, and successful expansion leaves the
  captured objects available for exact request-scoped session-init classification without tracking-ref authority.

## **Phase 6:** Shared session-init composition

_Purpose:_ Cut session-init over only after every analyzer can consume supplied evidence, so one immutable remote
context replaces the compatibility acquisition shells without leaving a stale tracking-ref authority window.

### `[x]` **6.1 Build and stage the request-scoped remote context**

- _Goal:_ Session-init acquires remote truth once, establishes local availability once, and preserves independent
  local orientation when either prerequisite degrades.

    - `[x]` **6.1.a Build one memoized handler-level context**
        - Added a handler-layer memoized reader that preserves one immutable all-heads snapshot, one deduplicated
          availability batch, and one complete, shallow, or unavailable history result. Disabled sync and proven
          no-origin states skip acquisition, while configuration, object, and history inspection failures remain
          internal prerequisite arms distinct from unreachable remote evidence.

    - `[x]` **6.1.b Compose explicit prerequisite and dependent stages**
        - Split shared local probes from session-init remote dependents, threaded one context identity through eager
          and gated callbacks, and retained handoff's zero-argument passive worktree adapter. Prerequisite failures
          remain per-slot runtime errors without entering the public envelope or erasing independent orientation.

- _Outcome:_ Session-init now owns one memoized, immutable remote prerequisite stage whose snapshot, availability,
  and history evidence can be projected independently by every dependent analyzer without coupling handoff or local
  orientation to that acquisition.

### `[x]` **6.2 Cut every session analyzer over to supplied evidence**

- _Goal:_ Removing the compatibility acquisition shells changes no authority source: core, dependent, recovery, and
  discovery slots all consume the same request generation.

    - `[x]` **6.2.a Wire the four core slots and remove their compatibility reads**
        - Worktree sync, advisory base distance, base-branch sync, and user-reference authority now project the shared
          snapshot and local prerequisites through their pure analyzers. Disabled/no-origin arms remain local, and
          the handler no longer fetches or creates temporary/tracking refs for these session-init slots.

    - `[x]` **6.2.a.1 Keep compaction recovery identity independent of remote slots**
        - The compaction seed now takes branch, HEAD, and dirty paths from its local Git snapshot. A degraded
          remote-dependent worktree slot can no longer manufacture `branch: HEAD` and block recovery with a false
          branch mismatch; failure to read the local branch instead fails seed emission visibly.

    - `[x]` **6.2.b Wire side-effect dependents and recovery to the same context**
        - Supersession, completion-tail state, stale/orphan/Errand cleanup, husk revalidation, retired-subdirectory
          detection, and branch-gone recovery now consume the request's original advertised OIDs and local
          prerequisites. Incomplete evidence suppresses destructive or reset authority, and compatibility tracking
          refs remain reachable only from callers that do not supply the session context.

    - `[x]` **6.2.c Wire no-WU discovery and remove probe-path pruning**
        - No-WU discovery now classifies the shared advertised map with caller-supplied local refs and worktree
          facts, preserving exact, pending, unreachable, and not-applicable outcomes without pruning or reacquiring
          code refs. The transient-identity snapshot remains a separately typed operational read and cannot replace
          the code-repository evidence.

- _Outcome:_ Every session-init authority and discovery surface now derives from one immutable advertised
  generation. Tracking-ref compatibility remains outside the composed handler path, while incomplete evidence
  consistently removes cleanup, reset, recovery, and materialization authority.

### `[x]` **6.3 Publish and prove the composed status contract**

- _Goal:_ Public envelopes expose only schema-valid evidence/remedy combinations, and request-wide tests prove the
  one-generation and failure-isolation guarantees at the real handler boundary.

    - `[x]` **6.3.a Widen schemas, recommendations, formatting, and fixtures together**
        - Qualified base-sync and discovery schemas now enforce exact evidence/failure/remedy combinations, compose
          pending and unreachable guidance, distinguish pending formatting, and register only public result roots.
          Golden envelopes and typed fixtures now carry the widened contract; request-only context stays internal.

    - `[x]` **6.3.b Prove one request generation at the handler boundary**
        - Real-CLI command recording now proves one all-heads generation, one deduplicated local availability batch,
          no code-ref mutation, and separately identifiable notes and transient-record operations. Handler and
          compositor regressions preserve local orientation, exact snapshot-only absence, shallow non-traversal
          facts, and local-only omitted-descendant failures as typed per-slot errors.

- _Outcome:_ The composed session envelope now publishes only qualified evidence while every dependent analyzer
  consumes one request generation. Runtime prerequisite failures remain isolated, and facts that need no object or
  graph traversal survive independently of degraded local prerequisites.

## **Phase 7:** Contract integration and rollout

_Purpose:_ Align generated schemas, workflow dispatch, adopter documentation, and end-to-end verification with the
completed passive-versus-explicit write boundary.

### `[x]` **7.1 Align the session workflow and envelope contract**

- _Goal:_ Widened remote-evidence paths consume typed CLI verdicts without encoding evidence comparison or
  acquisition mechanics in prose, while unrelated state-spine dispatch remains unchanged.

- **Additional Context:** `strategy-workflow-authoring.md` § Body Conventions and
  `strategy-procedure-evolution.md` § Self-Check: run this before building

    - `[x]` **7.1.a Update the authoritative session workflow sources**
        - The package-source workflow now isolates failed remote-aware slots and dispatches CLI-composed actions,
          text, and structured remedies. The reference documents one internal request generation, qualified public
          semantics, and the generated production schema bundle as shape authority; the build now publishes the
          registered session-envelope family into that bundle.

    - `[x]` **7.1.b Render and validate the self-hosted copies**
        - Rendered both authoritative sources into the project instance and validated the schema family, generated
          artifact, package/project sync, links, locus methodology contracts, compatible envelopes, and real
          session-init behavior.

- _Outcome:_ Session-init prose now stays on the typed-contract side of the CLI boundary: one generated schema
  bundle defines shape, one request generation supplies remote evidence, and per-slot failures retain local-safe
  orientation without granting unavailable action authority.

### `[x]` **7.2 Document the remote-access boundary and retained exclusions**

- _Goal:_ Teams can predict which commands are read-only, which may write shared Git metadata, and how to recover
  from pending or unreachable evidence without relying on a particular sandbox product.

    - `[x]` **7.2.a Explain passive and explicit command behavior in package source**
        - The session-operations strategy and both command references now define the one-generation passive probe,
          exact/pending/unreachable/not-applicable evidence, shallow and partial-clone limits, linked-worktree
          common-directory boundary, explicit acquisition verbs, and the Node.js 24 / Git 2.45 prerequisites.

    - `[x]` **7.2.b Preserve scope and audience boundaries**
        - Kept user-notes and transient Errand-record transport as explicit exclusions, described permission prompts
          only as one generic Git-metadata-boundary symptom, rendered the Framework strategy, and preserved the
          project quick reference's intentional self-hosting and quality-gate differences.

- _Outcome:_ Teams can now distinguish passive code-head inspection from explicit acquisition without coupling the
  contract to one harness. Shipped guidance preserves local-safe orientation and separate operational channels
  while naming the exact Git capabilities and version floor each command requires.

### `[x]` **7.3 Verify linked worktrees and retire temporary Codex guidance**

- _Goal:_ A real linked-worktree proof demonstrates that passive probes need no shared-metadata write permission,
  after which the repository no longer carries the temporary escalation workaround.

- **Additional Context:** `notes-remote-access-contract.md` § Incident evidence

    - `[x]` **7.3.a Add linked-worktree boundary coverage**
        - Added real linked-worktree, promisor, omitted-descendant, and shallow/full-history E2E fixtures; the proofs
          separate code-repository reads from the intentionally excluded notes and transient-record operations.

    - `[x]` **7.3.b Cover explicit denial and retry end to end**
        - Proved typed nonzero denial and successful retry through the built CLI; explicit fetch now disables partial-
          clone filtering so candidate metadata is locally readable before strict classification.

    - `[x]` **7.3.c Remove the temporary root guidance after the proof passes**
        - Removed only the temporary Codex sandbox section from root `AGENTS.md`, retaining the development bootstrap
          and hosted-review contract.

- _Outcome:_ Real Git fixtures closed two descendant-availability gaps: explicit expansion materializes the candidate
  closure, while passive base-drift archive discovery propagates local-only access through its tree scan.

## **Phase 8:** Hermetic quality-gate execution

_Purpose:_ Make routine verification obey the same passive-versus-explicit ownership boundary as the product, so
gates need no ambient write authority outside their workspace-owned fixtures and scratch state.

### `[x]` **8.1 Isolate gate-owned mutable state**

- _Goal:_ Tests that exercise mutation write only within disposable state owned by the test run.

    - `[x]` **8.1.a Move Git-note mutation into a disposable repository**
        - The large-note stdin executor now round-trips and cleans its ref in a disposable repository while an
          exact ambient notes-ref inventory assertion proves the gate leaves the developer checkout unchanged.

    - `[x]` **8.1.b Isolate package-manager cache and log state**
        - Package inventory and dry-run subprocesses now route npm cache and logs into test-owned temporary state,
          assert the isolated identity home stays untouched, and remove the complete state tree after each run.

- _Outcome:_ Routine test mutations now stay inside disposable repositories and package-manager state rather than
  requiring write access to the developer checkout's shared Git metadata or identity-global npm cache.

### `[x]` **8.2 Remove avoidable IPC from one-shot TypeScript gates**

- _Goal:_ One-shot validation scripts execute directly without depending on an auxiliary listener forbidden by a
  constrained workspace harness.

    - `[x]` **8.2.a Route one-shot scripts through the TypeScript loader**
        - Root and package validation, generation, audit, formatting, inventory, and benchmark scripts now use
          `node --import tsx`; the long-running Vitest watch command remains on its dedicated runner.

    - `[x]` **8.2.b Lock the entrypoint contract with representative coverage**
        - A real npm-script probe preserves inventory arguments, output routing, and failure status while an armed
          `Server.listen` rejection proves both successful and failing bounded invocations open no listener.

- _Outcome:_ Bounded TypeScript gates now execute in-process under Node's loader contract, removing the CLI parent
  process and its IPC server without changing their command-line or process-stream behavior.

### `[x]` **8.3 Prove the constrained gate boundary**

- _Goal:_ The canonical routine gate suite completes with only workspace and disposable scratch writes.
- _Outcome:_ Source-mode fixtures resolve the TypeScript loader explicitly, historical merge-tree inspection runs in
  a disposable shared clone, and the constrained proof attributed every gate-owned mutation to scratch while shared
  Git metadata remained unchanged and an armed listener rejection stayed silent across the complete suite.

## **Phase 9:** Verification

### `[x]` **9.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ Markdown lint, ARC trigger/domain/section-reference contracts, TypeScript and shell lint, source
  and test typechecks, 10,071 tests with one skipped, and build — all passed in the constrained linked-worktree
  environment.
- _Success criteria:_ 23 criteria: 23 met.

---

## Success Criteria

- `[x]` Session-init issues exactly one all-heads code-repository read and attempts no metadata-writing
  code-repository Git command; excluded user-notes and transient-record operations remain independently typed.
- `[x]` Every widened slot accepts only schema-valid evidence, failure, count, and remedy combinations.
- `[x]` Local remote-configuration, object-inspection, or analyzer failures surface as runtime probe errors, never
  proven no-remote or false remote evidence.
- `[x]` Passive object and graph reads disable Git lazy fetching; real promisor coverage proves they perform no
  nested fetch, maintenance, pack/object write, or ref write.
- `[x]` Byte-preserving status readers use the same local-only policy; a present commit with an omitted tree/blob
  fails locally without materialization, while explicit lifecycle readers retain their intentional default.
- `[x]` Exact analysis uses advertised OIDs; missing local objects produce neutral pending results, never stale
  tracking-ref relations.
- `[x]` Shallow history cannot produce graph-derived exact relations even when both compared tip objects are local;
  snapshot absence and non-traversal identity facts remain usable.
- `[x]` Package metadata requires Git 2.45 or newer; all three production executor seams pair the global
  `--no-lazy-fetch` option with `GIT_NO_LAZY_FETCH=1`, and incompatible Git fails before object inspection.
- `[x]` Timeout, network, authentication, and unclassified failures remain distinct from exact remote-ref absence.
- `[x]` Base distance and base sync distinguish remote-base absence, local-base absence, and missing local objects
  without advisory temporary refs.
- `[x]` User-reference, supersession, completion-tail, shipped-index, remote-only Errand, sweep, recovery, and
  retirement paths grant no authority from incomplete remote evidence or stale tracking refs.
- `[x]` Branch-gone recovery cannot auto-select or fall back from an incomplete recent-tip tier.
- `[x]` No-WU discovery returns only verified candidates and distinguishes exact-empty, pending, unreachable, and
  not-applicable outcomes without pruning or fetching.
- `[x]` Explicit sync, release, user-sync, base, and active-expansion commands materialize or fail visibly before
  entering an exact action matrix, even when automatic session inspection is disabled.
- `[x]` A remote-head failure leaves independent local slots, orientation, planning, and local inspection usable.
- `[x]` Linked-worktree coverage proves passive exact and pending behavior with read-only shared Git metadata.
- `[x]` Shipped workflow and reference copies describe the typed passive-versus-explicit contract and retained
  exclusions without harness-specific requirements.
- `[x]` The temporary root Codex escalation guidance is absent after linked-worktree verification.
- `[x]` Git-mutating integration tests create refs and notes only in disposable fixture repositories and leave the
  checkout running the gate unchanged.
- `[x]` Packaging subprocesses use disposable cache and log state, and one-shot TypeScript gates require no
  auxiliary IPC listener.
- `[x]` Canonical routine gates pass in a constrained linked worktree without ambient writes to shared Git metadata
  or identity-global package-manager state; explicit repository mutation remains separately authorized.
- `[x]` All quality gates pass (tests, linting, type checking, build, contract checks, and package sync).
- `[x]` Ready for integration

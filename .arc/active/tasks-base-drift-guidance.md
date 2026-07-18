# Task List: Base Drift Guidance

- **Design:** `spec-base-drift-guidance.md`

---

## **Phase 1:** Shared analyzer foundation

_Purpose:_ Establish the typed contract and invocation-owned Git boundary that every later evidence and consumer
path relies on.

### `[ ]` **1.1 Define the shared base-drift result, modes, and semantic ports**

- _Goal:_ Advisory and authoritative consumers share one storage-neutral result whose typed evidence enriches, but
  can never replace, the raw Git distance verdict.

    - `[ ]` **1.1.a Establish the result and invocation contracts**
        - Replace the current distance-only shape in `src/lib/git/base-distance.ts` (or a focused successor module)
          with the `mode`, `verdict`, immutable `baseOid`, typed unavailable reason, integration evidence, overlap,
          and register contracts from the design.
        - Preserve the compatible `state`, `ahead`, `behind`, `base`, and `failureReason` fields until every in-repo
          consumer has migrated; export the public analyzer surface through `src/lib/git/index.ts`.

    - `[ ]` **1.1.b Define narrow injected semantic capabilities**
        - Model `IntegrationEvidenceResolver` with separate operations for enriching an already topology-proven event
          and proving membership over otherwise-unclassified ordered single-parent inputs; both operate only on
          analyzer-supplied commit OIDs and optional display identity.
        - Model the reconciliation classifier as path-to-behavior only.
        - Keep archive paths, Markdown records, lifecycle placement, `pm.mode`, storage settings, and readiness-view
          filenames out of the analyzer contract; make token generation injectable without exposing it as config.

### `[ ]` **1.2 Acquire and clean up an immutable fetched base before measuring raw distance**

- _Goal:_ Every healthy reading is anchored to one validated, invocation-owned fetched OID, and no failed path can
  claim parity or silently leave analyzer-owned refs behind.
- _Note:_ Existing `boundedFetch()` supports only ordinary branch fetches, `fetchRefBounded()` writes `FETCH_HEAD`,
  and `uniqueRefToken()` is a useful concurrency pattern but not the injectable collision-resistant contract. Extend
  the argument-array bounded-execution seam deliberately rather than reusing an incompatible helper.

    - `[ ]` **1.2.a Validate and fetch the configured base into an invocation ref**
        - Build `refs/heads/<base>`, reject invalid or option-shaped refs through `git check-ref-format`, resolve the
          current branch and `origin`, and retain the advisory-only `session.remote_sync` skip before Git I/O.
        - Extend the bounded Git seam as needed to fetch with `--no-write-fetch-head` and an explicit source-to-
          `refs/arc/base-drift/<token>` refspec; never resolve through `FETCH_HEAD` or a shared tracking ref.

    - `[ ]` **1.2.b Return a strict raw-distance snapshot from the immutable OID**
        - Resolve `<invocation-ref>^{commit}` and expose `baseOid` plus the compatible `state`, `ahead`, and `behind`
          facts through a scoped callback boundary; do not dispatch not-yet-implemented enhancement analyses from
          this foundational task or return after deleting the ref they still need.
        - Keep the invocation ref live until the supplied callback settles so Phase 3 can perform every enhancement
          read while the fetched object remains reachable.
        - Harden the shared `countAheadBehindRef()` parser to accept exactly two non-negative decimal integers and
          throw on malformed, partial, negative, or extra-field output so every caller degrades rather than falsely
          reporting parity.

    - `[ ]` **1.2.c Make cleanup part of the analyzer's safety result**
        - Delete the exact invocation ref with `git update-ref -d` from a `finally` path after the scoped callback
          settles on success or failure; make forgotten cleanup impossible at the call site.
        - Map validation, fetch timeout/failure, OID resolution, distance read, and cleanup failure to distinct typed
          reasons; a cleanup failure overrides a healthy reading with `temporary-ref-cleanup-failed`.
        - Build `test-first` (one behavior at a time):
            - advisory skip performs no Git call, while authoritative mode ignores the advisory sync setting;
            - invalid base, detached `HEAD`, missing `origin`, fetch/OID/distance failures, and cleanup failure fail
              without presenting meaningful zero counts;
            - malformed, partial, negative, or extra-field distance output fails closed through the shared primitive;
            - the fetch uses the validated full source ref and owned destination, never writes `FETCH_HEAD`, and all
              revision reads use `baseOid`;
            - deterministic token injection and concurrent tracking-ref movement cannot change the reading, and the
              callback observes the pinned OID before the owned ref is removed on every return path;
            - callback rejection still cleans up, while cleanup failure overrides an otherwise healthy callback
              result.

    - `[ ]` **1.2.d Preserve strict-parser failure behavior across shared distance callers**
        - Keep each existing `countAheadBehindRef()` caller's failure contract when malformed output begins throwing:
          worktree and base probes degrade to `remote-unavailable`, base sync refuses with `distance-unavailable`,
          start reports origin relation unavailable, and in-flight WU state records one soft warning.
        - Catch the currently unhandled distance failure in `executeInboundPull()` and return its existing degraded
          surface result with no mutation and zero non-meaningful counts.
        - Build `test-first` (one behavior at a time): malformed inbound-pull distance output surfaces without reading
          dirt or attempting a merge; malformed base-sync distance refuses without moving the base; and the existing
          thrown-distance regressions for worktree sync, base-branch sync, start provenance, and WU state remain green.

## **Phase 2:** Integration-event evidence

_Purpose:_ Turn first-parent history into proof-bounded integration events while preserving every unsupported commit
as explicit unclassified movement.

### `[ ]` **2.1 Scan and classify topology and resolver evidence without double-counting commits**

- _Goal:_ First-parent movement is reported as disjoint proven events plus honest unclassified commits, with coverage
  and limitations that exactly reflect what the analyzer established.

    - `[ ]` **2.1.a Parse and classify the bounded first-parent scan**
        - Read ordered commit OIDs, parents, and complete subjects from `HEAD..<baseOid>` in one bounded operation,
          normalizing scan inputs and event membership oldest-to-newest.
        - Use strict fixed-arity NUL framing for the untrusted Git output and reject malformed records. Read one input
          beyond the implementation-owned scan cap, classify only the capped prefix, and set `truncated` only when the
          extra record proves more history exists.
        - Treat multi-parent commits as topology-proven events; accept PR identity only through the exact merge-subject
          grammar, and treat a terminal squash suffix as identity evidence rather than proof.

    - `[ ]` **2.1.b Reconcile resolver evidence with topology proof**
        - Let the resolver enrich topology events and prove membership over otherwise-unclassified ordered
          single-parent inputs; validate that returned OIDs are in-range, disjoint, and do not consume topology events.
        - Validate each complete resolver response atomically before accepting any event from it. Deduplicate
          topology-plus-resolver identity into one event, reject an invalid response as `resolver-invalid`, and
          preserve valid topology or a separate resolver operation's results when one evidence source degrades.

    - `[ ]` **2.1.c Derive coverage and limitations without guessing**
        - Return complete coverage only when the scan is untruncated and every input belongs to a proven event;
          otherwise retain exact unclassified counts and typed partial limitations.
        - Build `test-first` (one behavior at a time): merge, squash, and rebase shapes; exact and rejected subject
          grammar; duplicate, overlapping, and out-of-range resolver evidence; resolver unavailable/invalid; scan
          failure; malformed framing; cap-edge and cap-plus-one truncation; deterministic ordering; and zero
          double-counting.

### `[ ]` **2.2 Add a status-bearing completed-record reader and current resolver adapter**

- _Goal:_ The current completed-meta adapter can prove only evidence its archive reads actually support, while existing
  shipped-work-unit consumers retain their compatibility API.
- **Additional Context:** `strategy-storage-evolution.md` § Forward-Compat Principles 1, 2, 5, and 6.

    - `[ ]` **2.2.a Expose lossless completed evidence beside the compatibility reader**
        - Extend `src/lib/work-unit/completed-index.ts` records with parsed `PR URL` identity through
          `parseMetaRecord`, and add the available/partial/unavailable evidence read without changing existing callers'
          lossy `Map` and shipped-slug behavior.
        - Preserve the bounded meta-blob read pattern, distinguish archive-tree failure from per-meta failure, and
          treat an absent archive or readable record without a valid PR URL as available negative evidence.

    - `[ ]` **2.2.b Implement the in-repository resolver adapter**
        - Build one status-bearing completed-record index at `baseOid` per analyzer invocation and reuse it across all
          topology-enrichment and single-parent-proof calls; never rescan the archive once per event or candidate.
        - Enrich topology events from one same-commit archived meta or one unique accepted-PR match visible at
          `baseOid`; missing, malformed, or duplicate matches remain unnamed.
        - Read same-commit additions through strict `diff-tree --name-status -z --no-renames` framing, accept only
          valid added completed-meta paths, and prove a one-commit squash event only when exactly one such meta's parsed
          PR number matches the exact terminal subject suffix in that commit.
        - Translate archive-tree, blob, and same-commit history failures to `resolver-unavailable` while preserving
          successfully read identities and all topology proof; malformed status framing or invalid archive paths are
          failures, not negative evidence.

    - `[ ]` **2.2.c Prove adapter availability and archive-cadence behavior**
        - Build `test-first` (one behavior at a time): complete/partial/unavailable archive reads; PR URL parsing;
          bounded concurrency; topology enrichment before or after archive; unique and duplicate PR matches; matching
          and mismatched same-commit squash facts; malformed status/path records; one archive-index read per analyzer
          invocation; manual archive; and rebase history remaining unclassified.

## **Phase 3:** Reconciliation evidence and guidance

_Purpose:_ Distinguish substantive contention, regenerable projection churn, and unavailable enhancement evidence,
then compose one deterministic register without weakening raw Git safety facts.

### `[ ]` **3.1 Classify conservative path overlap through an injected reconciliation policy**

- _Goal:_ A healthy distance reports whether overlap was available and partitions every shared changed path by
  reconciliation behavior without coupling Git analysis to operational-state ownership.

    - `[ ]` **3.1.a Return explicit, rename-conservative overlap evidence**
        - Compute `merge-base..HEAD` and `merge-base..<baseOid>` changed paths with
          `git diff --name-only -z --no-renames`, strict NUL parsing, and no whitespace trimming; short-circuit to
          available-empty when either side has no unique commits.
        - Preserve separate `merge-base-failed`, `branch-diff-failed`, and `base-diff-failed` arms; never translate an
          analysis failure, empty/malformed merge-base output, or malformed path framing into an available empty
          intersection.

    - `[ ]` **3.1.b Bind the production reconciliation classifier**
        - Place the current production classifier in an adapter/composition module above `lib/git`: import the exact
          canonical `ROADMAP_PATH` there, classify only that path as regenerable, and inject the classifier through the
          analyzer port. Never pull `status/roadmap-regeneration-assert.ts` or project-view machinery into the Git
          analyzer.
        - Classify every other path as substantive; do not extend `PathSurface`, mint a registry, add configuration,
          or encode a future projection name.
        - Deduplicate and lexicographically sort both complete JSON arrays before rendered sampling.
        - Build `test-first` (one behavior at a time): disjoint, substantive, regenerable-only, mixed, unavailable,
          rename-versus-old-path-edit, and divergent-rename histories with `--no-renames` asserted.

### `[ ]` **3.2 Compose drift registers and assemble the shared analyzer**

- _Goal:_ One deterministic register communicates the strongest established fact, preserves evidence limitations,
  and never changes the verdict or safety action implied by raw distance.

    - `[ ]` **3.2.a Implement precedence and proof-strength vocabulary**
        - Lead with attention whenever substantive overlap is known, appending any integration-evidence degradation;
          lead with degraded when overlap is unavailable or no contention is known under incomplete evidence; use calm
          only for available non-substantive overlap plus complete integration coverage.
        - Name resolver-identified events as sibling integrations, topology-only events as integrations, and everything
          else as unclassified base movement; retain full arrays in JSON while sampling at most three paths in text.

    - `[ ]` **3.2.b Cover every register composition boundary**
        - Build `test-first` (one behavior at a time): calm with named/unnamed integrations and regenerable overlap;
          attention with complete/partial/unavailable integration evidence; degraded overlap/scan/resolver states;
          deterministic samples; and `null` registers for clean/skipped or advisory-unavailable results.
        - Ensure authoritative unavailable results carry a usable degraded explanation while advisory unavailable
          results preserve session-init's silent skip behavior.

    - `[ ]` **3.2.c Assemble evidence and register composition behind the raw-distance boundary**
        - Build the production analyzer only after the Phase 2 integration analysis and Task 3.1 overlap analysis
          exist: enter the scoped raw-distance callback, return complete empty evidence without enhancement subprocesses
          when `behind === 0`, and otherwise run both analyses against the same still-reachable `baseOid`.
        - Isolate enhancement failures so one unavailable arm never invalidates the healthy raw verdict or suppresses
          the other arm; compose the register from both settled results and retain the compatible distance fields.
        - Build `test-first` (one behavior at a time): zero-behind short-circuit, both enhancements receiving the same
          OID, either enhancement failing alone, both failing, raw distance staying authoritative, and cleanup still
          governing the final unavailable result.

## **Phase 4:** CLI and session guidance consumers

_Purpose:_ Expose authoritative drift reads through `arc base` and migrate session initialization to the same
analyzer and precomposed guidance contract.

### `[ ]` **4.1 Add authoritative `arc base drift` command handling and rendering**

- _Goal:_ `arc base drift` gives humans and workflows the same fresh authoritative result, JSON, and exit semantics
  without duplicating analysis in command glue.

    - `[ ]` **4.1.a Wire the authoritative command through the existing base family**
        - Add declarative `base drift` registration in `src/cli.ts`; extend `src/handlers/base.ts` to read
          `branch.base` and invoke the shared analyzer in authoritative mode.
        - Establish one reusable current-adapter composition helper in the above-`lib/git` adapter layer from Phase 3;
          bind the production resolver and reconciliation classifier there so every consumer receives the same
          analyzer dependencies without importing one handler from another.
        - Emit JSON to stdout for clean, reconcile, and unavailable outcomes; exit `0` for valid readings and `1` only
          after emitting unavailable JSON. Render the same facts and register through the existing Clack style when
          `--json` is absent.

    - `[ ]` **4.1.b Prove command behavior in real repositories**
        - Add focused CLI coverage beside `base-sync.e2e.test.ts` for clean, reconcile, missing-remote, invalid-base,
          and fetch-failure outcomes; assert disabled `session.remote_sync` does not suppress authoritative work.
        - Assert stdout stays machine-parseable on every JSON path, human rendering does not change policy, exit codes
          match verdicts, and invocation refs are absent after success and failure.

### `[ ]` **4.2 Migrate session-init probing, recommendations, and envelope documentation**

- _Goal:_ Session initialization consumes the shared analyzer advisorily and renders its precomposed register without
  re-reading Git or independently reconstructing policy.
- **Additional Context:** `strategy-procedure-evolution.md` § Forward-Compat Principles 1 and 6;
  `strategy-package-project-sync.md` § Template Counterparts.

    - `[ ]` **4.2.a Bind the analyzer into the status composition root**
        - Replace `runBaseDistanceStatus` in `src/handlers/status.ts` with the advisory analyzer using the resolved
          sync setting and the reusable production composition helper established for `arc base drift`.
        - Build `test-first` in `session-init.e2e.test.ts`: add a real behind-base branch fixture that proves the
          handler emits `reconcile`, typed evidence, the analyzer register, and a `surface` recommendation whose text
          equals `register.text`; prove disabled `session.remote_sync` yields advisory `skipped` with no recommendation.
        - Keep this fixture distinct from the existing stale-local-base coverage, which exercises `baseBranchSync`
          while its feature `HEAD` is already at the remote base.

    - `[ ]` **4.2.b Derive recommendations directly from analyzer output**
        - Update `inferBaseDistance` so only `reconcile` surfaces the analyzer's register text; clean, unavailable, and
          skipped return `skip` with an empty prompt.
        - Remove the legacy overlap-text composer and retain no second path or state inference.
        - Build `test-first` (one behavior at a time): advisory skip, healthy clean/reconcile, typed unavailable,
          precomposed text passthrough, and no locally composed overlap guidance.

    - `[ ]` **4.2.c Migrate status slot types and enrichment**
        - Preserve the eager `baseDistance` envelope slot and its compatible fields while extending
          `commands/status/types.ts` with the analyzer's verdict, evidence, overlap, and register shape.
        - Update `commands/status/run.ts` to enrich the analyzer result with the recommendation pair without rereading
          Git or changing any analyzer-owned field.
        - Build `test-first` in `unit/status/run.test.ts`: slot enrichment, clean/reconcile/unavailable/skipped mapping,
          register-text identity, probe-failure isolation, and composite-envelope compatibility.

    - `[ ]` **4.2.d Retire legacy envelope fixtures and overlap assumptions**
        - Migrate the base-distance fixtures in `integration/status.test.ts` and `unit/status-format.test.ts` to the new
          envelope contract without weakening their existing composite assertions.
        - Search every TypeScript source and test after the migration; remove all remaining consumer dependencies on
          the distance-only legacy shape and every `overlappingPaths` assumption, leaving only the analyzer's explicit
          overlap evidence without forcing an otherwise-unnecessary type rename.

    - `[ ]` **4.2.e Update the shipped and self-hosting envelope guidance together**
        - Update package `session-init.template.md` plus its rendered `.arc/` counterpart to describe and render the
          analyzer-owned register verbatim without adding an agent-side conditional or prompt.
        - Update both `session-init/probe-envelope.md` copies to replace `overlappingPaths` with the typed evidence and
          register contract while preserving the slot name and recommendation pair.

## **Phase 5:** Integration gate convergence

_Purpose:_ Replace duplicated workflow Git mechanics with the authoritative analyzer and close both approval windows
against a fresh immutable base identity.

### `[ ]` **5.1 Drive behind-base reconciliation from authoritative drift verdicts**

- _Goal:_ The final integration gate fails closed on unavailable distance, binds each approval to a fresh `baseOid`,
  and permits merge invocation only immediately after a post-approval clean reading.
- **Additional Context:** `strategy-procedure-evolution.md` § Forward-Compat Principles 1, 3, and 6;
  `strategy-package-project-sync.md` § Edit Flow Rules.

    - `[ ]` **5.1.a Replace manual fetch and distance mechanics with verdict dispatch**
        - Update the package-source and self-hosting `integrate-work-unit.md` copies together to invoke
          `arc base drift --json`; accept only a well-formed authoritative result with a recognized verdict and its
          required fields. Stop and surface the typed reason or parse failure for unavailable, skipped, unrecognized,
          or malformed output.
        - Surface the register on reconcile and carry the returned `baseOid` as the only freshness anchor.
        - After reconcile direction, invoke the command again: route newly clean results to the clean path, re-surface
          changed OIDs and re-fire the reconcile interlock, and permit `git merge --no-edit <baseOid>` only when the
          refreshed OID matches the approved one with no intervening fetch or stop.

    - `[ ]` **5.1.b Close the integration-approval freshness window**
        - Preserve the existing reconcile checks, review coordinator, extension, push, and exact-head ordering, then
          invoke `arc base drift --json` again immediately after integration approval.
        - Surface and stop on malformed, unrecognized, skipped, or unavailable results; return reconcile to the
          reconcile loop, and require a new integration interlock after either route settles.
        - Allow only a well-formed fresh clean result to proceed directly to `gh pr merge` with no intervening review
          action, lifecycle mutation, commit, push, Git fetch, or human stop.

    - `[ ]` **5.1.c Keep workflow language storage- and installation-neutral**
        - Use shipped bare `arc` invocations, verbs, verdicts, and precomposed output rather than narrating analyzer Git
          internals; preserve the already-merged resume arm and post-merge close/teardown behavior.
        - Keep both Framework copies byte-identical and avoid internal WU names, storage tiers, or future projection
          names in adopter-facing workflow prose.

### `[ ]` **5.2 Prove the cross-consumer safety and compatibility matrix**

- _Goal:_ The assembled CLI, session-init, and integration workflow demonstrate one analyzer contract across real Git
  behavior, typed degradation, and both framework copies.

    - `[ ]` **5.2.a Lock the workflow contract and two-copy parity**
        - Extend `integration/review-gate-workflows.test.ts` with focused assertions that both integration-workflow
          copies match, use `arc base drift --json`, and contain no raw base fetch, `rev-list` distance, or
          `origin/<base>` merge path.
        - Lock both safety windows: malformed or unavailable results stop, changed reconcile OIDs re-fire approval, a
          refreshed matching OID immediately precedes the base merge, and only a post-integration-approval clean result
          immediately precedes `gh pr merge`.
        - Run the existing `integration/framework-sync.test.ts` as the authoritative package/self-hosting and rendered-
          template parity check; do not add duplicate session-init parity machinery.

    - `[ ]` **5.2.b Run the assembled compatibility checkpoint**
        - Exercise the focused analyzer, completed-evidence, recommendation, status-composite, CLI,
          `review-gate-workflows.test.ts`, and `framework-sync.test.ts` suites.
        - Search the TypeScript tree for any remaining independent base-drift overlap calculation or
          `overlappingPaths` consumer; search both integration-workflow copies for raw base fetch/distance derivation
          or a remote-ref base merge without flagging the separate base-sync implementation.
        - Confirm storage-neutral resolver fakes can supply, omit, or return stale/out-of-range record evidence without
          changing the raw verdict, JSON shape, or consumer safety action.

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

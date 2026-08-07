# Task List: decompose-transition-record

- **Design:** `spec-decompose-transition-record.md`

---

## **Phase 1:** Establish the lean transition record

_Purpose:_ Add the origin-keyed historical substrate and its final projection APIs, co-stage terminal history with
the still-required receipts, and admit the exact namespace through the generic planning lane without cutting a live
receipt consumer before migration and authorization re-derivation.

### `[x]` **1.1 Establish the origin-keyed transition record substrate**

- _Goal:_ Terminal transitions have one closed, human-legible schema and an exclusive origin-slug store that
  preserves authored history without integrity identities or transaction evidence.

    - `[x]` **1.1.a Define and parse the schema-v1 record**
        - Added the closed `TransitionRecord` schema and whitespace-tolerant parser, with deterministic canonical
          serialization, kind-specific cardinality, canonical set ordering, and strict malformed-input rejection.

    - `[x]` **1.1.b Add the origin-keyed transitions store**
        - Added the exclusive `.arc/system/.internal/transitions/<origin>.json` store with pre-mutation record
          validation and real-directory checks, leaving the digest-keyed receipt namespace unchanged.

- _Outcome:_ Untrusted JSON now narrows into a closed record that can be written only at its validated origin path;
  no receipt identity, authentication, or transaction evidence crosses the new substrate.

### `[x]` **1.2 Converge terminal-transition writers on the lean record**

- _Goal:_ Decompose, rename, and abandon persist only the historical facts their consumers need, while park
  continues without creating terminal-transition history.

    - `[x]` **1.2.a Project decompose authoring into the lean record**
        - Added validated completed-map projection and co-staged the lean record with v3 finalization; mismatch,
          occupied-origin, staging, and projection-race paths leave prior receipt history and attempted records safe.

    - `[x]` **1.2.b Converge direct terminal writers and exclude park**
        - Added the typed direct-transition writer and wired rename and abandon to co-stage exact origin-keyed
          history with their legacy receipts; occupied origins refuse stably, later rename commit failure removes
          only the attempted record, and real-CLI coverage proves park-planning leaves the namespace untouched.

- _Outcome:_ Every terminal writer now co-stages lean history without granting it authorization weight: legacy
  receipt validators admit the exact companion path while preserving old candidates, teardown proofs, and park's
  receipt-only lifecycle until their later cutover.

### `[x]` **1.3 Enumerate origin-keyed records fail-closed from Git**

- _Goal:_ Every query sees a deterministic current-ref snapshot whose content-origin grouping and global parse
  failures cannot be weakened by filenames, worktree state, or unrelated history.

    - `[x]` **1.3.a Validate and group a complete namespace snapshot**
        - Added a path-free byte-entry validator with deterministic content-origin groups, preserved duplicate
          records, fatal UTF-8 decoding, and fail-closed filename, object-kind, and schema validation.

    - `[x]` **1.3.b Read only the selected Git tree**
        - Added a raw Git adapter that snapshots the requested ref by object ID, reads blobs without text coercion,
          and leaves the existing receipt enumerator and its consumers unchanged.

- _Outcome:_ Lean enumeration now authenticates one complete selected-tree snapshot before any origin projection;
  unreachable history and ambient worktree bytes cannot influence its deterministic grouped result.

### `[x]` **1.4 Rebuild disposition queries around dependent slugs**

- _Goal:_ Retirement consumers receive the same authored action by origin and dependent without digest-edge
  indirection, evidence-quality pass-through, or digest-filename conflicts.

    - `[x]` **1.4.a Close the lean query result contract**
        - Added the evidence-quality-free lean query and port types with direct-transition projection,
          dependent-keyed decompose lookup, origin-local ambiguity, and global corruption outcomes.

    - `[x]` **1.4.b Preserve Git reachability at the query port**
        - Added the Git lean-query port over selected-ref enumeration with no receipt fallback, while leaving the
          production receipt query unchanged for the later cutover.

- _Outcome:_ Lean queries now return only record-authored transition actions and closed lean failures; digest
  identity, evidence quality, successor inference, and the legacy namespace remain outside the new port.

### `[x]` **1.5 Project lean transitions into reconcile and dependency discharge**

- _Goal:_ Reference repair and dependency discharge retain their observable rename, removal, replacement, and
  drop behavior while consuming only lean transition contracts.

    - `[x]` **1.5.a Map lean kinds into reference transitions**
        - Added a parallel lean reference projector for rename, removed, and decompose outcomes that refuses all
          duplicate-origin groups before outcome de-duplication and carries no digest-conflict arm.

    - `[x]` **1.5.b Discharge dependency edges without evidence quality**
        - Added a parallel lean planner entry that adapts only the legacy compatibility field, then exercises the
          final recursive resolver across retarget, abandon, replace, drop, and all lean refusal outcomes.

- _Outcome:_ Reference repair and dependency discharge now have receipt-independent projection seams with lean
  multiplicity and failure semantics, while the production receipt ports remain intact for the Phase 2 switch.

### `[x]` **1.6 Admit transition records through the generic planning lane**

- _Goal:_ Local and hosted review gates classify only exact transition-record leaves as planning artifacts, while
  adjacent executable `.internal` content remains review-bearing.

    - `[x]` **1.6.a Add the exact generic predicate entry**
        - Extended the shared planning predicate for one immediate slug-named transition JSON leaf, with exact
          grammar, two-endpoint rename checks, and regular-file mode requirements preserving adjacent review scope.

    - `[x]` **1.6.b Prove one predicate governs local and hosted verdicts**
        - Added real-Git, built-handler, shell-command, path-lane, and workflow-contract coverage proving exact
          transition leaves agree on planning admission, adjacent executables force review, and legacy receipts
          retain their specialized exception while transition records use the generic fallback.

- _Outcome:_ One exact predicate now governs both local scheduling and hosted exact-ref clearance for lean
  transition history, with executable `.internal` neighbors remaining review-bearing across every adapter.

## **Phase 2:** Convert live retirement history

_Purpose:_ Preserve the eight terminal decisions that cannot be regenerated, prove their consumer answers before
and after conversion, and leave the non-terminal park record for its authorization trace.

### `[x]` **2.1 Characterize every live terminal record's consumer answers**

- _Goal:_ A reviewable golden inventory freezes the consumer-visible meaning of all eight terminal decisions
  before their bytes move, without treating sealed fields as required behavior.

    - `[x]` **2.1.a Inventory the terminal and park records**
        - Added byte-identical fixtures for all nine live receipts and an independent literal oracle covering the
          eight terminal origins, successor sets, query vectors, reference projections, and explicit park exclusion.

    - `[x]` **2.1.b Freeze old-reader answers**
        - Added old-codec characterization for two dependents per terminal origin and every reference transition,
          comparing only consumer semantics while excluding evidence quality, identities, digests, and sealing terms.

- _Outcome:_ The live migration now has a byte-exact legacy input set and reader-independent semantic authority;
  both disposition and reference regressions are detectable before any repository record moves.

### `[x]` **2.2 Convert the eight terminal records to the lean namespace**

- _Goal:_ The repository contains exactly eight schema-v1 terminal records that losslessly project past authored
  decisions, while the park receipt remains available until its authorization consumer trace completes.

    - `[x]` **2.2.a Materialize the direct-transition records**
        - Added canonical origin-named records for the five abandon and two rename histories while preserving all
          nine retirement receipts byte-for-byte for the remaining authorization and removal traces.

    - `[x]` **2.2.b Materialize the decompose transition**
        - Added the canonical `chunked-delivery` record with its four ordered successors and no edges or sealed
          fields; repository assertions require exactly eight lean origins, no park record, and unchanged old bytes.

- _Outcome:_ The repository now carries exactly the eight terminal decisions in canonical lean form while the
  complete legacy namespace remains intact for equivalence and authorization cutover.

### `[x]` **2.3 Prove live query and reconcile equivalence**

- _Goal:_ Every characterized consumer read has the same semantic result from the lean record as from its sealed
  predecessor before production loses access to the old namespace.

    - `[x]` **2.3.a Compare disposition answers through test-only adapters**
        - Compared every legacy and lean answer independently against the literal oracle and against each other,
          including arbitrary rename and abandon dependents plus unmapped decomposition dependents.

    - `[x]` **2.3.b Compare reference projections and inventory completeness**
        - Proved identical reference projections across the exact eight-origin lean manifest, retained the literal
          oracle and legacy fixtures, and kept the park transition excluded.

    - `[x]` **2.3.c Cut production history consumers over once**
        - Switched every named semantic consumer to the lean query, enumeration, and reference ports while preserving
          receipt-specific callers; dependency evidence now carries subjects only and lean conflicts omit sealed
          version vocabulary. A three-ref integration proof keeps old authority live through migration, then shows
          the lean delivery reader remains authoritative even when the legacy namespace is malformed.

- _Outcome:_ Live reconciliation and delivery semantics now read one origin-keyed namespace without fallback or
  namespace merging. Real-Git coverage also corrected ancestor-tree handling in the byte-oriented enumerator so the
  selected namespace is reachable through ordinary repository trees.

### `[x]` **2.4 Prove migration reachability and namespace failure behavior**

- _Goal:_ Converted history remains ref-local and fail-closed under real Git reads, while content-authoritative
  naming and same-origin ambiguity behave exactly as designed.

    - `[x]` **2.4.a Exercise converted records across divergent refs**
        - Proved real-Git ref locality across uncommitted bytes, divergent branches, current-WU `HEAD`, local partial
          authority, refreshed remote authority, and an explicit delivery ref; failed refresh remains unavailable
          without enumeration or legacy fallback.

    - `[x]` **2.4.b Exercise the migration failure matrix**
        - Proved namespace-wide poisoning for malformed, unknown-version, and duplicate-dependent records;
          content-authoritative filename mismatch; origin-local duplicate ambiguity; and the eight-origin migration
          manifest with park excluded.

- _Outcome:_ Converted history now has real-Git evidence for every production authority selection and a closed
  corruption matrix: global record invalidity poisons the namespace, while valid same-origin multiplicity stays
  local and does not contaminate unrelated origins.

## **Phase 3:** Re-derive retirement authorization from Git

_Purpose:_ Replace receipt-carried authorization with committed-tree proofs one arm at a time, retaining parity
coverage before any receipt-consuming predecessor is removed.

### `[x]` **3.1 Re-derive abandon teardown authorization from transition trees**

- _Goal:_ Abandon teardown authorizes only when committed Git proves the exact structural abandon transition and
  conservation across its source and result trees, without trusting a transition-record payload.

    - `[x]` **3.1.a Locate the abandon transition structurally**
        - Added direct and landed Git-history location with closed absent, unique, ambiguous, and unavailable
          outcomes, strict single-parent topology, exact relevant-delta validation, and semantic-refusal mapping.

    - `[x]` **3.1.b Prove conservation from the two trees**
        - Validated the complete parsed source group, branch and planned-cohort placement, result absence, and cleared
          lifecycle index from pinned trees while leaving transition-record bytes unread.

- _Outcome:_ Abandon history is now independently locatable and conservation-checked from committed trees; malformed,
  duplicate, ambiguous, unrelated, or structurally invalid candidates fail closed without receipt evidence.

### `[x]` **3.2 Authenticate park landing from the relocation commit**

- _Goal:_ Partial-protection park landing accepts only an owned exact single-parent commit whose complete relevant
  diff is a blob-identical relocation of the planned artifact group, with no receipt path or content involved.

    - `[x]` **3.2.a Derive the landing proof and result from commit structure**
        - Reduced the landing transition and result to the owned commit, subject, and planned files; exact relocation
          bytes, complete path coverage, and valid optional `ROADMAP` movement now establish the result.

    - `[x]` **3.2.b Retain landing concurrency safeguards**
        - Preserved tip and owner rechecks, base/index compare-and-set, dual ref leases, and rollback while removing
          the retirement namespace from source validation, conflict inventory, staging, and CLI output.

- _Outcome:_ Partial-protection landing now materializes only the commit-proven planned artifact group and rejects
  content, conservation, topology, ownership, or concurrency drift without consulting or copying receipt state.

### `[x]` **3.3 Re-derive park teardown from planned-artifact bytes**

- _Goal:_ Park teardown authorizes only when the retiring head and effective base contain complete, cohort-correct,
  byte-identical planned artifact groups computed at proof time.

    - `[x]` **3.3.a Make the park proof receipt-independent**
        - Removed receipt bytes and receipt-shaped inputs from the pure park proof; matching complete planned groups
          now yield one path-sorted content inventory and every lifecycle, placement, membership, or byte mismatch
          closes as a semantic refusal.

    - `[x]` **3.3.b Preserve protection-mode target selection**
        - Wired teardown and lifecycle residue discovery through one protection-aware selector that pins the exact
          refreshed remote or local integrating base head before proof, and fails closed when that head is unreadable.

- _Outcome:_ Park authorization now depends only on identical committed planned-artifact bytes at two pinned heads;
  transition-record presence and the retired receipt payload cannot affect the proof or its canonical result.

### `[x]` **3.4 Replace receipt-backed husk stamp evidence**

- _Goal:_ A husk stamp carries only a receipt-free replay pointer and a digest of its pinned Git-derived result,
  while preserving shipped evidence, remote-ref intent, and fail-closed decoding.

    - `[x]` **3.4.a Define the receipt-free evidence and digest contracts**
        - Replaced non-shipped receipt references with the closed `git-transition` shape, derived lifecycle from its
          transition, and added one versioned digest over exact heads and UTF-8-byte-sorted result inventory. Strict
          decoding preserves shipped legacy and unknown-future handling while rejecting retired or malformed shapes.

    - `[x]` **3.4.b Stamp only the result established by Git authorization**
        - Structural authorization now binds its actual retiring and result heads plus canonical inventory into the
          shared digest, preserves remote/ref revalidation, and passes the resulting evidence unchanged into the
          terminal marker for both abandon and park transitions.

- _Outcome:_ Non-shipped husks now persist a minimal replay pointer whose digest is wholly determined by pinned Git
  proof; transition-record content, receipt identity, mutable worktree bytes, and caller-supplied lifecycle are absent.

### `[x]` **3.5 Revalidate husks from stamped Git state**

- _Goal:_ A decoded non-shipped husk stamp grants cleanup authority only after its transition-specific structural
  proof and shared result digest are recomputed from pinned Git state.

    - `[x]` **3.5.a Replace receipt evidence validation with proof replay**
        - Replaced receipt validation with exact-base abandon or park replay and shared digest recomputation, rejecting
          missing, ambiguous, cross-kind, copied, mismatched, or byte-divergent evidence without record reads.

    - `[x]` **3.5.b Preserve each replay consumer's failure behavior**
        - Routed decoded husks through the receipt-free replay result so status falls back to detached orientation,
          stale sweeps block as manual-only, and teardown preserves the husk whenever committed proof fails.

- _Outcome:_ A structurally valid non-shipped stamp is now only a replay request; cleanup authority emerges again
  from immutable Git topology and bytes, and every detached-husk consumer shares the same fail-closed verdict.

### `[x]` **3.6 Prove receipt-free authorization parity across lifecycle seams**

- _Goal:_ All four retirement-adjacent arms retain their material grants and refusals end to end with no receipt
  lookup, and lifecycle callers consume the re-derived authority consistently.

    - `[x]` **3.6.a Establish the authorization parity matrix**
        - Preserved the structural grants and fail-closed refusal classes across abandon teardown, park landing and
          teardown, and detached-husk replay, with integration boundaries that reject any legacy receipt read.

    - `[x]` **3.6.b Exercise command and lifecycle integration seams**
        - Replaced landed-residue receipt enumeration with per-candidate abandon proof from the selected base, keeping
          clean-worktree gating and actionable/blocked lifecycle projections while exercising the full command seams.

    - `[x]` **3.6.c Retire direct-transition receipt co-staging**
        - Replaced direct receipt writes with record-neutral snapshot/completion CAS: rename and abandon co-stage lean
          history, park completes with no record, rollback restores transition state, and abandon lifecycle has no
          receipt authority while the decompose arm remains isolated.

- _Outcome:_ Direct retirement authorization now crosses every lifecycle seam through pinned Git proof and lean
  terminal history only; no rename, abandon, park, cleanup, or replay contract retains the sealed receipt namespace.

## **Phase 4:** Retire the sealed receipt apparatus

_Purpose:_ Establish ordinary candidate cleanup and receipt-free terminal/base-mobility paths before cutting their
respective predecessors, then retire the old namespace only after every surviving consumer is authoritative.

### `[ ]` **4.1 Trace the claim store against Git collision coverage**

- _Goal:_ Every retained transient-claim behavior has a surviving independent consumer, while Git ref creation and
  worktree registration own collision exclusion wherever they already provide the guarantee.

- _Approach:_ Preserve any independently necessary claim behavior unchanged; this trace authorizes subtraction,
  not a redesigned claim successor.

    - `[x]` **4.1.a Trace claim readers, writers, and collision authority**
        - Follow `decompose-transient-claim-store.ts`, `decompose-transient-claim.ts`, operation I/O, result
          occupation, base advancement, local cleanup, cleanup gate, and in-flight derivation.
        - Produce a retain/delete matrix distinguishing concurrency exclusion from in-flight residue suppression,
          owned-candidate identity, landed cleanup authorization, and terminal release.
        - Make the matrix the binding input to Tasks 4.2, 4.4, and 4.7: any retained claim port and state transition
          remains unchanged, and no later deletion may silently assume the whole store retired.

        - _Outcome:_ The binding trace selected no independently necessary transient-claim behavior:

          | Concern                    | Surviving authority                                                    | Claim decision |
          | -------------------------- | ---------------------------------------------------------------------- | -------------- |
          | creation concurrency       | atomic candidate ref creation plus Git worktree registration           | delete         |
          | live in-flight suppression | exact candidate registration plus its ARC branch marker                | delete         |
          | owned-candidate identity   | deterministic branch, one registered path, and matching marker         | delete         |
          | landed cleanup             | authenticated landing, pinned candidate head, registration, and marker | delete         |
          | terminal retry/release     | idempotent absence checks and compare-delete of the observed ref       | delete         |

          Tasks 4.2, 4.4, and 4.7 must preserve these Git/marker replacements; none may retain claim state merely
          as copied provenance.

    - `[ ]` **4.1.b Prove material creation and residue interleavings**
        - Build `test-first` (one behavior at a time):
            - Simultaneous same-origin creation is serialized by the named branch/ref and worktree registration.
            - Pre-existing unregistered branches and registered worktrees with moved branches refuse safely.
            - Crash residue between branch and worktree creation remains discoverable and cleanable.
            - In-flight derivation suppresses an owned live candidate without hiding unrelated branch residue.
            - Landed cleanup retains equivalent authorization and release behavior from either existing Git/marker
              facts or the unchanged claim contract selected by the trace.
        - Retain claim projection only if a traced consumer needs provenance unavailable from Git refs or worktree
          markers; otherwise delete the dead store and transitions.

### `[x]` **4.2 Remove candidate exactness and discard machinery**

- _Goal:_ Every stranded decomposition candidate is destroyable through ordinary branch/worktree cleanup, without
  the four exactness-created refusal states or a dedicated discard path.

    - `[x]` **4.2.a Define the owned-candidate cleanup boundary**
        - Require agreement among the deterministic candidate branch, its registered worktree/path, the existing
          decomposition-candidate marker, and any retained claim identity; refuse missing, malformed, ambiguous, or
          cross-worktree identity rather than guessing ownership.
        - After ownership is established, pin the observed candidate head and allow staged path-set or index-content
          drift to be reset as candidate-local state; preserve refusal for unstaged/untracked user content, an
          unrelated checked-out worktree, identity drift, and a raced ref deletion.
        - Build `test-first` (one behavior at a time):
            - Destroy candidates corresponding to `candidate-cleanup-failed`, `candidate-not-exact`,
              `candidate-index-changed`, and `candidate-path-set-changed` through the surviving cleanup route.
            - Retry partial worktree/branch cleanup idempotently and compare-delete the exact observed ref head.
            - Preserve unrelated-worktree, user-content, marker, registration, and ref-race refusals.

        - _Outcome:_ One ordinary Git-owned candidate cleanup boundary now authenticates the deterministic branch,
          unique registration/path, and branch marker; resets staged/index-only drift; preserves unstaged and
          untracked content; retries worktree/branch absence; and refuses marker, topology, head, and deletion races.
          Landed cleanup uses that boundary while its receipt-era authorization remains temporarily upstream.

    - `[x]` **4.2.b Delete candidate-only exactness and discard surfaces**
        - Deleted the pure and Git discard modules, their dedicated tests and handler mock, the already-disconnected
          command-mode fixture, and all four candidate-exactness refusal codes. Full-candidate failures now expose
          only the ordinary cleanup facts from 4.2.a; source-worktree, marker, registration, user-content, and ref-race
          protections remain in that shared boundary.

### `[ ]` **4.3 Remove the decomposition-specific planning-lane trio**

- _Goal:_ Generic `isPlanningArtifactPath()` classification is the sole local and hosted authority for
  decomposition planning changes.

    - `[ ]` **4.3.a Remove the exception modules and receipt fact assembly**
        - Delete `decomposition-planning-lane.ts`, `git-decomposition-planning-lane.ts`, and
          `git-decomposition-fact-assembler.ts`; remove object readers whose consumer trace becomes empty.
        - Replace the review handler's exception-specific dependency/result type with the exact-ref adapter
          `resolveChangeSet()` → `classifyPlanningLane()`; retain the existing closed stdout and failure behavior.

    - `[x]` **4.3.b Close local and hosted exception coverage**
        - Delete exception-specific tests and fixtures while retaining the exact transitions-namespace and
          never-widen coverage established in Task 1.6.
        - Prove local and host verdicts remain identical for both admitted records and adjacent reviewed content.

        - _Outcome:_ The public review adapter now reduces exact Git changes through the generic planning grammar;
          receipt-exception tests are gone, while local and hosted classification remain aligned for the lean
          transition namespace and adjacent reviewed content.

### `[x]` **4.4 Establish receipt-free terminal execution and base mobility**

- _Goal:_ Receipt-free paths are authoritative before any preparation, finalization, or advancement predecessor is
  disconnected, so every subsequent subtraction leaves a compiling, operable tree.

    - `[x]` **4.4.a Stage the complete transition in one execution operation**
        - Add a direct execution boundary that consumes the validated completed map and existing plan, topology,
          conservation, materializer, and occupation facts without creating or parsing a preparation or receipt.
        - Return a closed `staged` result: partial protection carries the exact staged paths; full protection also
          carries the deterministic candidate branch and worktree. The refusal arm retains existing applicable
          preflight, planning, occupation, materialization, and rollback results but no receipt, discard, readiness,
          or follow-up-finalize member.
        - Invoke the Phase 1 `TerminalTransitionRecordWriter` exactly once inside the same operation as the transform;
          success requires the transform and lean record in one staged tree, and a writer or later staging failure
          follows the existing protection-specific rollback without reporting a half-transition as complete.
        - Build `test-first` (one behavior at a time):
            - Stage the exact partial- and full-protection transforms with one lean origin record and no old record.
            - Refuse incomplete dispositions or occupied origins before success and never invoke the writer twice.
            - Restore the partial preimage or leave an explicitly owned, ordinarily cleanable full candidate after
              a record-write, staging, or post-write revalidation failure.

        - _Outcome:_ Execution now occupies and revalidates the existing plan, materializes its exact byte transform,
          writes and stages one lean decomposition record, and returns only a closed `staged` result. Partial failures
          restore exact transform preimages; full failures expose ordinary candidate cleanup facts; post-stage drift
          rolls back both lean history and owned mutations. No plan mutation, result, remedy, or created member meta
          carries a preparation, receipt placeholder, discard successor, continuation, or finalize instruction.

    - `[x]` **4.4.b Re-derive append-only base advancement from the candidate transition**
        - Added a receipt-free cut-map boundary that authenticates the deterministic candidate registration and
          marker, its unique single-parent transform, and every prior first-parent base merge. It rejects altered
          map/result trees, malformed history, regressions, new incoming dependencies, unrelated commits, and both
          ref races; successful advancement stages an exact append-only merge and all mutation failures restore the
          pinned candidate. The Task 4.1 trace retained no claim contract to restate.

### `[ ]` **4.5 Cut over commands and remove live publication consumers**

- _Goal:_ Production reaches only the receipt-free execution and advancement paths, while lifecycle/status replaces
  handoff and readiness projection before their now-dead schema modules are removed.

    - `[ ]` **4.5.a Contract the public decomposition modes**
        - Route `--execute <cut-map>` to Task 4.4's one-step result and `--advance-base <cut-map>` to its receipt-free
          proof; retain `--preflight`, keep `--discard` absent, and remove `--finalize`, `--continuation`, and
          `--handoff`.
        - Rewrite the authoritative packaged `decompose-work-unit.md` workflow around one-step execution,
          receipt-free base advancement, ordinary owned-candidate cleanup, and lifecycle/status readiness; sync the
          self-host installed copy through the package-project sync path rather than editing the mirrors
          independently.
        - Remove the retired options from `cli.ts`, input registration/schema/exclusivity, machine-readable routing,
          help and command renderers, handler branches, no-input fixtures, and command-mode tests.
        - Replace the workflow-contract assertions with coverage for `--preflight`, `--execute <cut-map>`, and
          `--advance-base <cut-map>`, plus explicit absence of `--discard`, `--finalize`, `--continuation`, and
          `--handoff` from both shipped and self-host workflow surfaces.
        - Assert no production result renders a receipt ID, continuation file, discard remedy, handoff payload, or
          prescribed next successor.

    - `[ ]` **4.5.b Retire landed handoff and readiness consumers**
        - Characterize the destination ready/blocked frontier through lifecycle composition and ordinary status,
          then delete `landed-decomposition-publication.ts`, `landed-decomposition-handoff.ts`,
          `git-landed-decomposition-handoff.ts`, their E2E path, and response shaping.
        - Disconnect `decompose-launch-readiness.ts` and `decompose-continuation.ts` from every production caller;
          keep their dead receipt/finalization schema dependencies isolated until Task 4.7 removes that cluster.
        - Prove lifecycle and status report the same reconstructed frontier without an adapter, launch advice,
          publication object, or another wrapper around ready/blocked state.

### `[ ]` **4.6 Remove preparation and candidate-publication sealing state**

- _Goal:_ The authoritative execution path carries validated authored plan facts directly, while the unreachable
  two-stage persistence path is dismantled without deleting any fact the new path still consumes.

    - `[ ]` **4.6.a Extract the surviving authored-fact contract**
        - Move any still-required path-state, completed-map, topology, conservation, destination, incoming-disposition,
          occupation, and materialization types/helpers out of preparation-shaped modules into their existing plan or
          direct-execution owners before deleting a producer.
        - Build `test-first` (one behavior at a time):
            - Produce the same staged transform and lean projection from validated authored inputs.
            - Preserve topology, conservation, disposition, occupation, and materialization failures before success.
            - Keep every new production import free of preparation, publication, receipt, and finalization types.

    - `[ ]` **4.6.b Delete the two-stage preparation path**
        - Remove `decompose-preparation.ts`, `prepareV3`, operation persistence of prepared records,
          prepared-record staging/replacement, `preparationId`, `V3CandidatePublication`, prospective publication
          fields, and preparation-only authority sealing from production paths and results.
        - Update operation, repository-plan, materializer, handler, fixture, and test seams; retain only isolated dead
          schema definitions still imported by the receipt/finalization cluster Task 4.7 deletes next.

### `[ ]` **4.7 Remove finalization, receipt projection, and recovery state**

- _Goal:_ The cut-over production tree retains the one-step transform, lean write, and structural Git safeguards,
  with every unreachable receipt/finalization schema and special publication consumer physically gone.

    - `[ ]` **4.7.a Delete the sealed finalization cluster**
        - Remove `decompose-v3-receipt.ts`, the remaining preparation schema, finalization drivers,
          `decompose-finalization-recovery.ts`, `decompose-launch-readiness.ts`, `decompose-continuation.ts`, and their
          unreachable adapters, result unions, schemas, codes, fixtures, and tests.
        - Remove `receiptId`, `preparationId`, managed-path and destination digests, sealed transition patches,
          refresh/restatement, prepared-to-finalized replacement, the legacy decompose co-staging leg, and the six
          provider-only plus continuation-only refusal codes.
        - Retain the Phase 1 staged lean write as the sole invocation in Task 4.4's operation; do not rewrite it,
          invoke it again, or move it outside the established transform rollback boundary.
        - Build `test-first` (one behavior at a time):
            - Complete a valid transform with exactly one origin record and refuse an occupied origin.
            - Leave no successful half-transition after transform, record-write, or rollback failure.
            - Find no provider, continuation, preparation, finalization, refresh, or receipt-shaped result vocabulary.

    - `[ ]` **4.7.b Resolve structural and graduation consumers before deleting their carriers**
        - Produce a caller-and-check matrix for configured-base anchors, descendant landing, integration anchors,
          merge overlays, roadmap regeneration, local cleanup, and base advancement. Mark each check
          publication/receipt-only or independently required for Git topology, ancestry, dependency, ref-race,
          occupation, rollback, or lifecycle correctness.
        - Route every retained check and test through Task 4.4's receipt-free plan/Git contracts before removing old
          anchor, overlay, validation, base-advancement, and retirement-driver projections; delete rather than rename
          every check whose sole authority was receipt content.
        - Remove the `Decomposition Receipt` meta field and parser/renderer, `decomposition-receipt-marker.ts`, marker
          injection in the plan composer, the decomposition-only planning-tuple arm, and graduation/start anchor
          lookup; ordinary planning validation and start behavior remain authoritative.
        - Preserve generic ancestry/object-ID/ref-reread, topology, conservation, dependency snapshot, merge,
          worktree-ownership, CAS, rollback, and lifecycle tests under their surviving callers.

### `[ ]` **4.8 Close surviving consumers and deleted-state vocabulary**

- _Goal:_ No production path imports, reads, renders, or authorizes from deleted decomposition transaction state,
  while unrelated receipt systems and surviving structural checks remain intact.

    - `[ ]` **4.8.a Resolve every surviving transaction consumer**
        - Trace roadmap regeneration, in-repo retirement authority, merge overlays, descendant-base landing,
          configured-base and integration anchors, local cleanup, in-flight derivation, active-meta schema/readers,
          decomposition planning tuples, graduation transactions, start and lifecycle handlers, CLI modes, and
          command renderers/registrations.
        - Remove obsolete result unions, CLI rendering, fixtures, mocks, and workflow-contract assertions only after
          each locus is deleted or rewritten around a surviving structural fact.

    - `[ ]` **4.8.b Add an absence boundary for the retired vocabulary**
        - Extend the decomposition authority-boundary contract to prohibit production uses of `receiptId`,
          `preparationId`, `V3DecomposeReceipt`, `V3CandidatePublication`, `initialContinuation`, sealed result fields,
          exception types, readiness-provider codes, and candidate-discard codes.
        - Prohibit transitional dual-write/co-staging adapters, coexistence branches, old-to-new aliases, receipt
          fallbacks, and the retired `--discard`, `--finalize`, `--continuation`, and `--handoff` modes after the old
          paths retire; require the surviving advancement path to import no old codec or authority.
        - Exclude review-gate receipts, errand identity transactions, notes-publication proofs, and any generic
          retirement authority that Phase 3 did not supersede.

### `[ ]` **4.9 Retire the receipt namespace and validator last**

- _Goal:_ The digest-keyed retirement-receipts substrate disappears only after lean records and Git-derived proofs
  are the sole production authorities, leaving no compatibility or dual-read route.

    - `[ ]` **4.9.a Remove the validator and old codec/store branches**
        - Delete `validate-decompose-record.ts`, its CLI and input-policy registrations, old-format codec branches,
          digest-key path helpers, and old enumeration variants.
        - Remove `hook-validate-decompose-record` from the package hook source and self-host installed hook, command
          help/input/no-input matrices, generated E2E invocations, shell-contract fixtures, and every shipped
          workflow/template registration; shape validation remains owned by the transition writer and lean parser.

    - `[ ]` **4.9.b Delete old namespace data and prove one-way closure**
        - Remove `.arc/system/.internal/retirement-receipts/**`, including the traced park record, after the eight
          terminal migrations and all four authorization arms are green.
        - Delete the temporary verbatim migration inputs and old-reader test adapters while retaining the lean-only
          semantic oracle and expected-origin manifest.
        - Build `test-first` (one behavior at a time):
            - Preserve lean fail-closed parsing, duplicate-origin ambiguity, and existing-origin write refusal.
            - Find no old namespace, digest filename handling, compatibility reader, alias, or dual-read fallback in
              production, shipped configuration, fixtures, or repository data.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A planned-artifact + `ROADMAP` + exact transition-record change classifies `planning` through the generic
  predicate in both local and hosted checks; adjacent `.arc/system/.internal/**` content remains reviewed.

- `[ ]` Exactly eight live terminal decisions exist as schema-v1 origin-keyed transition records, the park record
  is not converted, and query/reference answers match the characterized predecessor answers for every live read.

- `[ ]` Disposition and reference consumers expose only the lean closed result vocabulary, preserve namespace-level
  fail-closed behavior, and treat content origin—not filename—as authoritative.

- `[ ]` Abandon teardown, husk revalidation, park landing, and park teardown grant and refuse through committed-Git
  proofs with parity coverage and no transition-record or receipt content used as authorization evidence.

- `[ ]` `decompose --execute <cut-map>` is the sole terminal mutation path, stages one lean record with the
  transform under both protection modes, and exposes no preparation/finalization follow-up.

- `[ ]` Full-protection `--advance-base <cut-map>` preserves append-only descendant-base mobility through pinned
  Git/map proof, with no receipt or transition-record content used as mutation authority.

- `[ ]` The planning-lane exception trio, launch/readiness adapter, initial continuation, landed publication/handoff,
  decomposition receipt marker/start special case, candidate discard/exactness, preparation, sealing, and
  receipt-shaped recovery clusters are absent.

- `[ ]` The four stranded candidate states formerly reported as `candidate-cleanup-failed`, `candidate-not-exact`,
  `candidate-index-changed`, and `candidate-path-set-changed` are destroyable through surviving cleanup behavior.

- `[ ]` No production or shipped configuration path reads or writes decomposition `receiptId`, `preparationId`,
  sealed receipt fields, the digest-keyed retirement-receipts namespace, or its validator; no transitional
  co-staging, coexistence branch, alias, fallback, or retired decomposition command mode remains.

- `[ ]` The landed diff adds no integrity machinery, invented lifecycle state, parallel readiness vocabulary,
  widened `.internal` predicate, retention policy, storage lift, compatibility reader, or redesigned refusal scheme.

- `[ ]` Unrelated receipt systems and independently necessary Git, lifecycle, topology, conservation, merge, and
  cleanup safeguards remain covered and operational.

- `[ ]` All quality gates pass (tests, linting, type checking).

- `[ ]` Ready for integration.

# Task List: Review Gate Enforcement Cutover

- **Design:** `spec-review-gate-enforcement-cutover.md`

---

## **Phase 1:** Versioned request and receipt foundation

_Purpose:_ Establish the append-only v2 identity and ledger substrate before any new execution, provider, or
settlement behavior depends on it, while preserving byte-stable v1 interpretation and audit continuity.

_Design decisions:_ Schema-specific parsing, hashing, and semantics remain explicit. The only mixed ledger is the
terminally-proven `v1* → schema-upgrade(v2) → v2*` transition; ambiguous legacy effects fail closed. Boundary
codecs expose stable parse façades and explicit schema name/version metadata so a later schema-library migration can
replace their internals without changing consumers; this work adds no schema dependency or public registry.

### `[ ]` **1.1 Introduce discriminated v2 request, receipt, and lifecycle-payload contracts**

- _Goal:_ New requests can carry the causal, head-flight, actor, trigger, and settlement identity required by the
  cutover without changing any schema-v1 byte or interpretation, and later schema tooling can replace one co-located
  boundary codec rather than parallel hand-written types and validators.

    - `[ ]` **1.1.a Define schema-v2 request and receipt identities**
        - Extract or extend cohesive schema-specific modules behind the existing `parse*` façades with discriminated
          v1/v2 unions and the
          v2 request mechanism, actor, generation, trigger, timing, contamination, supersession, and settlement
          fields from Proposed Design §1.
        - Co-locate hand-written types and boundary guards, expose explicit contract name/version constants, and
          avoid a second consumer-facing type definition. A later schema-first implementation must be able to infer
          the same internal types without changing callers.
        - Keep exported neutral types free of GitHub, provider, and self-hosting policy assumptions.

    - `[ ]` **1.1.b Define v2 terminal-evidence and finding-lifecycle receipt payloads**
        - Carry exact full-head terminal references, trigger ownership, finding origin, carried-head lifecycle, and
          settlement references in v2 receipts and cohesive lifecycle payloads.
        - Preserve the existing normalized `Evidence` schema unless a source-grounded implementation need proves it
          cannot represent provider observations; do not introduce a parallel v2 evidence contract by default.

    - `[ ]` **1.1.c Validate closed schema-v2 shapes test-first**
        - Build `test-first` (one behavior at a time):
            - Round-trip every v2 variant and reject unknown or missing causal fields.
            - Reject incongruent request, evidence, finding, and settlement identities.
            - Prove v1 fixtures still parse to the exact existing types and semantics.

### `[ ]` **1.2 Preserve exact v1 identity and add schema-dispatched parsing, serialization, and hashing**

- _Goal:_ Historical v1 request keys, receipt hashes, and serialized comments remain stable while new records use
  explicit v2 algorithms selected by their discriminant.

    - `[ ]` **1.2.a Split request-key and receipt-identity behavior by schema version**
        - Refactor `core/request-key.ts` into explicit v1 and v2 paths without routing v1 through v2 defaults.
        - Add literal, non-generated golden fixtures for existing request keys, receipt hashes, and canonical
          serialization so a shared implementation bug cannot rewrite both the fixture and expectation.

    - `[ ]` **1.2.b Add explicit v1/v2 receipt creators and migrate production producers to v2**
        - Preserve v1 creation only for historical fixtures and compatibility tests. Update runtime request,
          authorized-command, and attestation producers to use the v2 creator so every new/empty production ledger
          begins with a v2 receipt.

    - `[ ]` **1.2.c Dispatch comment parsing and storage serialization across the versioned union**
        - Update `hosts/github/receipt-comment.ts`, `receipt-store.ts`, and their tests to preserve each envelope's
          original schema identity and reject implicit upgrades.

### `[ ]` **1.3 Enforce the append-only v1-to-v2 upgrade protocol and legacy terminal-proof barrier**

- _Goal:_ An existing PR can enter v2 only when every legacy effect is separately proven terminal, and an
  unprovable ledger cannot be reset, replayed, upgraded, or used to satisfy current policy.

    - `[ ]` **1.3.a Add the single legal `schema-upgrade` receipt and predecessor contract**
        - Extend `core/receipt-ledger.ts` with `v1* → schema-upgrade(v2) → v2*` ordering, v1-tip identity, new
          semantics version, and rejection of every other mixed-schema shape.

    - `[ ]` **1.3.b Resolve legacy effect terminality through an injected proof port**
        - Add durable terminal/cancellation proof references for every v1 request effect not already closed by
          qualifying provider-native terminal evidence. Include reserved, acknowledged, and `terminal-failure`
          histories; treat every v1 `terminal-failure` as effect-ambiguous regardless of its stored reason.
        - Return an explicit close-and-replace repair state when terminality cannot be established.

    - `[ ]` **1.3.c Derive legal append mode from ledger history without changing the anchor contract**
        - Keep the schema-v1 anchor's repository, change-request, monotonic version, and count shape unchanged.
        - Resolve empty → v2, pre-upgrade v1 → upgrade-only, and post-upgrade → v2 append modes from the validated
          receipt sequence; never persist a second schema-mode authority in the mutable anchor.

    - `[ ]` **1.3.d Prove upgrade, refusal, and malformed-history behavior test-first**
        - Build `test-first` (one behavior at a time):
            - Empty ledgers begin at v2 with no upgrade record.
            - Fully terminal v1 ledgers accept exactly one valid upgrade.
            - Ambiguous, malformed, post-upgrade-v1, duplicate-upgrade, and reset attempts fail closed.
            - Historical v1 evidence remains readable but cannot satisfy v2 reduction.

    - `[ ]` **1.3.e Reconstruct the legal mixed ledger through the GitHub comment store**
        - Add an integration case spanning versioned comment parsing, authenticated store reconstruction, unchanged
          anchor repair, and `v1* → schema-upgrade(v2) → v2*` semantic validation.

### `[ ]` **1.4 Complete versioned storage, reduction, and extraction boundaries**

- _Goal:_ The host-neutral controller can consume the versioned ledger and exclude historical v1 authority through
  stable injected boundaries, while behavior-specific ports remain vertically owned by the later phases that
  implement them.

    - `[ ]` **1.4.a Extend only the versioned ledger and terminal-proof ports**
        - Update `core/ports.ts` with schema-preserving ledger reads/appends, effective append mode, and legacy
          terminal-proof resolution. Add pending projection, trigger, actor action, and settlement ports vertically
          in Phases 2, 3, and 5 with their implementations.

    - `[ ]` **1.4.b Exclude v1 evidence and actions from v2 satisfaction without weakening degradation**
        - Update `core/reduction.ts`, `requirement-state.ts`, `verdict.ts`, and `projection.ts` to preserve historical
          audit visibility while reducing only post-upgrade v2 authority for current satisfaction. Malformed history
          remains a failure; behavior-specific flight, contamination, and settlement states land in their owning
          phases.

    - `[ ]` **1.4.c Prove neutral dependency direction, version dispatch, and migration-ready codec boundaries**
        - Extend core unit coverage and `review-gate-controller-contract.test.ts` to reject self-hosting/GitHub
          imports, exercise v1 audit/v2 satisfaction projection, and ensure consumers import stable parsed types and
          façades rather than duplicating boundary shapes.

## **Phase 2:** Pending-first execution and exact-head control

_Purpose:_ Make every provider effect controller-owned and head-safe: durable reservation and confirmed pending
projection precede execution, actor-dependent work becomes typed state, and active request flights freeze pushes.

_Design decisions:_ Ambiguous writes are adopted only through canonical re-query. Head changes require an explicit,
single-use authorization tied to terminal findings; no repository-wide network pre-push hook is introduced. The
aggregate check keeps its stable PR/change-set/context identity: pending confirmation pairs a pinned exact-head check
read with a separate canonical read of the matching reservation and ledger version rather than minting a check per
request generation.

### `[ ]` **2.1 Implement pending-first reservation, projection confirmation, and request acknowledgement**

- _Goal:_ No provider effect or trigger-required action becomes live until its reservation and App-authored pending
  aggregate check are durable and canonically confirmed on the exact frozen head.

    - `[ ]` **2.1.a Extend the neutral execution protocol to publish and confirm pending before effect**
        - Evolve `core/request-execution.ts` from reserve-confirm-invoke to reserve → publish pending → canonical
          pending confirmation → expose/perform effect → bind acknowledgement and terminal observations.
        - Rewrite `runtime/reconcile.ts` and `ReconcileRuntime` so the orchestrator publishes the reserved pending
          projection before `execute()`, re-reads around each effect boundary, and still publishes the final reduced
          projection only from current state.

    - `[ ]` **2.1.b Compose pending confirmation through the GitHub host adapter**
        - Extend `hosts/github/check-runs.ts`, `adapter.ts`, and the receipt store so confirmation pins App id, check
          name, stable aggregate external id, and exact head, then independently confirms the matching request key,
          generation, and ledger version from the authenticated receipt store.

    - `[ ]` **2.1.c Prove ordering and fail-closed interruption test-first**
        - Build `test-first` (one behavior at a time):
            - No provider call or exposed action occurs before pending confirmation.
            - Stale, foreign-App, missing, failed-write, and ambiguous confirmation paths perform no effect.
            - Re-entry adopts the durable reservation/projection without duplicating the generation.
            - The reconcile orchestrator cannot regress to effect-before-publish ordering or publish stale final state.

### `[ ]` **2.2 Add typed next-action and developer-authenticated action execution launchers**

- _Goal:_ A PR-opening agent can discover and consume one actor-bound hosted trigger from authenticated controller
  state without parsing display prose or borrowing App credentials.

    - `[ ]` **2.2.a Model `needs-user-trigger` and terminal/attention actions in the neutral reducer**
        - Include request key, provider, full head, generation, exact command, and immutable required actor id.
        - Resolve hosted Codex's required actor from the admitted PR author through the host capability boundary.

    - `[ ]` **2.2.b Implement dependency-injectable next-action and perform-action mains**
        - Add runtime mains that re-read the exact PR/head, validate the current typed action and `gh` actor, post
          once, adopt only an exact actor/body/time match after ambiguous delivery, and dispatch reconciliation.
        - Keep developer-authenticated `gh` execution behind an injected process/host-action port so the later
          process-runner substrate migration changes one boundary rather than the action semantics.

    - `[ ]` **2.2.c Add repository-only launcher scripts and JSON contracts**
        - Expose `review-gate:next-action` and `review-gate:perform-action` through thin `tsx` launchers and private
          root scripts; keep credentials in the current developer's `gh` session.

    - `[ ]` **2.2.d Cover actor mismatch, replay, adoption, and stale-action behavior**
        - Add unit and integration cases for wrong actors, changed heads/generations, exact ambiguous-post adoption,
          duplicate consumption, dispatch failure, and typed output stability.

### `[ ]` **2.3 Model active flights, `begin-fix`, supersession, and one-shot head-update authorization**

- _Goal:_ Request activity and terminal findings produce an explicit mutability state, so every allowed new head is
  attributable to one authorized repair and every old-head finding remains in the lifecycle tail.

    - `[ ]` **2.3.a Reduce exact-head flight and mutability state**
        - Add a neutral query over receipts and host state for pending trigger, acknowledged, queued, running,
          terminal, contaminated, abandoned, superseded, and ambiguous generations.

    - `[ ]` **2.3.b Add `begin-fix` and carried-finding receipt semantics**
        - Require authorized terminal findings, exact old head, carried finding ids, and one target head-update
          authorization; reject non-terminal, reused, unrelated, or stale authorizations.

    - `[ ]` **2.3.c Consume authorization on the first reconciled new head**
        - Supersede the old generation for satisfaction, retain its finding tail, and admit follow-up review only
          after the new head's pending projection is confirmed.

    - `[ ]` **2.3.d Cover abandon, supersede, repair, and replay transitions test-first**
        - Build `test-first` (one behavior at a time) across active-flight refusal, same-head DEFER/REJECT, one FIX
          push, unused authorization, unexpected head, and carried-tail persistence.

### `[ ]` **2.4 Expose and compose the exact-head mutability guard at workflow push fire sites**

- _Goal:_ Workflow-driven pushes for an opened PR stop immediately before transport unless canonical controller
  state authorizes that exact head transition, while pre-PR pushes remain network-hook free.

    - `[ ]` **2.4.a Add `review-gate:assert-head-mutable` as a repository-only launcher**
        - Bind repository, PR, canonical remote PR head, proposed outgoing local head/change set, and optional
          `begin-fix` authorization to the neutral query; emit typed allow/refuse diagnostics for that exact
          transition without consuming authorization before the new head is canonically observed.

    - `[ ]` **2.4.b Insert the guard at canonical integration and errand push fire sites**
        - Update package-source and `.arc/` copies of `integrate-work-unit.md` and `run-errand.md`, preserving
          project overrides and invoking the guard only when `openedChangeRequest` exists.
        - Guard the review-fix push in project-owned `coordinate-pr-review.md`; initial pre-PR pushes remain outside
          the query because no opened change request or review flight exists yet.

    - `[ ]` **2.4.c Extend workflow contract tests for guard placement and no-pre-PR behavior**
        - Cover initial push, review-fix push, lifecycle-final push, base-reconcile push, errand push, current/outgoing
          head argument order, and refusal before transport.

## **Phase 3:** Causal provider evidence and deterministic fallback

_Purpose:_ Qualify hosted provider artifacts through one uncontaminated, immutable trigger generation and exact
frozen head, while retaining partial capabilities and admitting fallback only after effect terminality is proven.

_Design decisions:_ Provider identity, grammar, request transport, and settlement capability are independently
versioned. Native status and approval remain observations rather than aggregate authority. Trigger-deletion
tombstones follow the managed-record principle that deletion is an explicit non-projected event, but remain
domain-specific immutable review-ledger receipts: PR-scoped, actor/head/digest-bound, and retained with the ledger
rather than sharing user-record projection, sync, TTL, or garbage-collection machinery.

### `[ ]` **3.1 Build the PR-wide exclusive-trigger window and mutation tombstone model**

- _Goal:_ A terminal provider artifact can satisfy only the controller generation that owns the sole immutable
  trigger window across the entire PR, including trigger edits, deletions, labels, and old-head effects.
- **Additional Context:** `draft-operational-state-docs.md` § Treat deletion as an explicit record event, not a
  state diff. Reuse the principle, not its managed-document storage/projection substrate.

    - `[ ]` **3.1.a Define neutral trigger-event and contamination reduction**
        - Model comment/label event id, actor, digest, event time, observed canonical head, ownership, mutation,
          terminal proof, and generation-wide contamination in cohesive core modules.

    - `[ ]` **3.1.b Read complete GitHub command and label history with immutable provenance**
        - Extend REST/GraphQL clients and host adapters to scan PR-wide comments and timeline label events rather
          than current-head artifacts only.

    - `[ ]` **3.1.c Capture bounded deletion tombstones before canonical comments disappear**
        - Add a closed v2 `trigger-deleted` receipt payload containing comment id, actor, prior body digest, event
          time, observed PR head, provider/trigger classification, and authenticated event reference.
        - Route `issue_comment: deleted` directly through `.github/workflows/review-gate.yml`'s default-branch
          discovery/writer lane so the payload survives long enough to append the receipt before canonical re-query;
          do not rely on the payload-losing `workflow_run` relay for this event.
        - Reconcile tombstones with scheduled canonical scans. Keep them non-projected and ledger-retained—no user-
          record sync, rendered Markdown marker, TTL, or GC contract.

    - `[ ]` **3.1.d Prove contamination and terminal-release rules test-first**
        - Build `test-first` (one behavior at a time) for unowned, edited, deleted, competing, old-head, and
          provider-terminal event sequences; reject time/head-only attribution.
        - Cover the direct deleted-event workflow route, payload authentication/bounds, append-before-re-query
          ordering, exact replay, and scheduled reconciliation after a missed non-deletion event.

### `[ ]` **3.2 Qualify CodeRabbit capabilities and full-coverage request generations**

- _Goal:_ CodeRabbit contributes only capabilities proven under the resolved repository configuration, with native
  approval and progress unable to impersonate substantive exact-head evidence.

    - `[ ]` **3.2.a Expand the capability declaration and resolved-configuration audit**
        - Update `providers/coderabbit/config.ts` and `adapter.ts` for automatic/inherited/global/keyword path
          exclusion, settlement capability, durable clean/findings, exact coverage, and request mechanisms.

    - `[ ]` **3.2.b Bind generation-zero labels and later full-review comments to owned trigger events**
        - Extend `github-trigger.ts`, locators, and observation normalization with immutable event/head identity and
          full-coverage generation semantics.
        - Enumerate CodeRabbit inline review comments and correlate each finding to its pinned bot, submitted review,
          thread, stable locus, exact head, and durable URL; the existing signal normalizer alone is insufficient
          until the GitHub observation boundary actually produces `finding` signals.

    - `[ ]` **3.2.c Separate progress, native approval, substantive evidence, and capacity terminality**
        - Keep visible status, empty approval, paused/skipped/silent outcomes, and unknown capacity non-satisfying;
          admit fallback only for proven pre-effect or terminal outcomes.
        - Remove the production shortcut that maps a decisive native CodeRabbit approval directly to evidence;
          satisfying clean/findings outcomes must enter through `ReviewProviderAdapter.observe()` and
          `normalizeEvidence()` under the owned trigger window.

    - `[ ]` **3.2.d Add capability-matrix and provider-surface coverage**
        - Exercise satisfying and partial declarations, exact-head clean/findings, stale evidence, empty approval,
          ambiguous silence, quota rejection, and settlement capability.

### `[ ]` **3.3 Add the hosted Codex adapter, pinned evidence parsers, and rubric transport**

- _Goal:_ Hosted Codex can serve as a causally bound satisfying adapter through the PR author's identity, with
  versioned grammar and guidance that fail closed on every stale, edited, ambiguous, or unrelated artifact.
- **Additional Context:** `notes-review-gate-enforcement-cutover.md` § Live hosted-Codex probe.

    - `[ ]` **3.3.a Add `providers/codex` request, observation, and capability boundaries**
        - Implement actor-required request actions, pinned App id `1144995`, bot user id `199175422`, request-window
          correlation, and exact-head provider observations behind `ReviewProviderAdapter`.

    - `[ ]` **3.3.b Parse findings and clean outcomes with versioned fail-closed grammars**
        - Accept findings only from a standard submitted full-commit review; accept clean only from the unedited
          anchored issue-comment grammar with one uniquely resolved reviewed-commit marker.

    - `[ ]` **3.3.c Add repository review guidance and effective-guidance digest validation**
        - Add top-level `AGENTS.md` `## Review guidelines` for `independent-analysis/v1`; resolve nested guidance for
          every changed path and bind its digest plus the five focus dimensions to the owned trigger.
        - Resolve guidance through an injected exact-head git-object reader, not GitHub contents permission. Check
          both prior and destination paths for renames and the containing path for deletions; reject missing,
          conflicting, unreadable, or head-mismatched guidance before reservation.

    - `[ ]` **3.3.d Keep connected-account unavailability parser-only until production qualification**
        - Parse only the pinned response grammar/link in the exclusive window; require an admissible intentionally
          unconnected actor probe before enabling terminal fallback.

    - `[ ]` **3.3.e Cover probe fixtures, grammar drift, rubric transport, and stale rejection**
        - Include nested guidance precedence, rename/delete path coverage, exact-head object reads, conflicting
          guidance, ambiguous SHA prefixes, edited clean comments, and full-commit findings.

### `[ ]` **3.4 Enforce one-live-source fallback and explicit ambiguous-effect repair**

- _Goal:_ Provider order advances only after the prior source is proven unable to have a live effect, preventing
  duplicate quota spend and cross-generation satisfaction.

    - `[ ]` **3.4.a Extend admission and requirement reduction with source supersession**
        - Use self-hosting order `coderabbit-pr`, then `codex-pr`; skip disabled/non-qualified sources and persist
          supersession before admitting an alternate.
        - Add a v2 `source-superseded` receipt naming the prior source/generation, terminal or pre-effect proof,
          alternate source, actor, reason, and ledger predecessor. Canonically re-read that receipt before emitting
          the alternate reservation.

    - `[ ]` **3.4.b Distinguish legal fallback from blocking ambiguity test-first**
        - Cover explicit exhaustion, proven pre-effect rejection, terminal provider failure, unknown capacity's one
          attempt, acknowledged silence, ambiguous delivery, contamination, and explicit repair.
        - Prove an alternate cannot be selected from an in-memory decision alone or before durable supersession;
          retries converge on the same supersession and next generation.

    - `[ ]` **3.4.c Keep CLI-agent and qualified-human attestations explicit repair-only paths**

### `[ ]` **3.5 Compose provider qualification declarations into self-hosting policy and aggregate reduction**

- _Goal:_ The production runtime selects only live-qualified provider capabilities from versioned policy and reduces
  their evidence through the same neutral aggregate semantics.

    - `[ ]` **3.5.a Extend policy schema with ordered provider modes and capability outcomes**
        - Update `policy/self-hosting/schema.ts` and `qualification.ts` with enabled/partial/disabled declarations,
          semantic-parser versions, identities, guidance digest, and terminal-unavailable mode.
        - Define the pure baseline-result-to-declaration mapping used later by qualification activation; no operator-
          authored capability field may bypass the typed derivation.

    - `[ ]` **3.5.b Compose multiple provider adapters without widening the neutral port**
        - Refactor `runtime/composition.ts` and `reconcile-runtime.ts` to read capacity, request, observe, normalize,
          and settle through the selected adapter while retaining at most one live source.
        - Retire `resolveCodeRabbitDecisiveReview` / `mapCodeRabbitApprovalToEvidence` from the satisfying production
          path; native provider review remains observation input only.

    - `[ ]` **3.5.c Extend production composition and end-to-end reconcile coverage**
        - Drive CodeRabbit and Codex fixtures through reservation, pending, trigger, evidence, fallback, and
          projection with only transport boundaries faked.

## **Phase 4:** Passive waiting and coordination re-entry

_Purpose:_ Give the PR-opening agent a provider-neutral, model-free wait path that returns typed CI or aggregate
review state, while GitHub events and scheduled discovery reconcile the same canonical controller state.

_Design decisions:_ The watcher reads only source-pinned `ci-ok` or the ARC App projection for one exact head.
Provider parsing remains inside adapters, and scheduled discovery repairs event loss rather than defining latency.
The aggregate check retains a bounded machine marker beside its human summary so the watcher can validate typed
controller state without reconstructing provider semantics or scraping prose.

### `[ ]` **4.1 Implement the injected passive await state machine**

- _Goal:_ One reusable runtime waits on exact-head CI or aggregate review state with bounded API use, no provider
  parsing, no model inference, and explicit terminal or attention outcomes.

    - `[ ]` **4.1.a Define wait inputs, normalized transitions, and terminal results**
        - Add an injected runtime under `runtime/` for repository, PR, expected full head, wait kind, polling
          interval, timeout, host reads, clock, backoff, and output ports.

    - `[ ]` **4.1.b Implement source-pinned CI and aggregate-projection observation loops**
        - Verify the PR head every cycle, emit only changed normalized states, and terminate on success, failure,
          stale head, timeout, authentication failure, or malformed/ambiguous projection.
        - Extend App check publication with a bounded versioned machine marker carrying conclusion, blocker codes,
          ledger version, and receipt references. Add a read-side parser that pins App id, stable external id, check
          name, and exact head before returning typed aggregate state; `ci` continues to trust only source-pinned
          `ci-ok` status/conclusion.

    - `[ ]` **4.1.c Prove timing, backoff, silence, and every terminal arm test-first**
        - Use fake clock/read/output ports; assert no provider prose enters the watcher and no unchanged state emits.

### `[ ]` **4.2 Add the self-hosting await launcher and typed terminal output contract**

- _Goal:_ The coordinating developer process can block cheaply on canonical GitHub state and receive a stable JSON
  result without access to the App private key or installation token.

    - `[ ]` **4.2.a Implement a dependency-injectable await main over authenticated `gh` reads**
        - Keep the launcher read-only; validate exact repository/PR/head and map host errors into typed attention.
        - Reuse Phase 2's developer-authenticated process/host-action port for actor/session resolution and GitHub
          reads; do not create a second `gh` transport or error vocabulary.

    - `[ ]` **4.2.b Add the `review-gate:await` thin launcher and private root script**
        - Parse `ci|review`, interval, timeout, and exact head; write transition JSON only through the output port.

    - `[ ]` **4.2.c Add launcher contract and credential-boundary tests**

### `[ ]` **4.3 Expand canonical wake-up routing and scheduled repair coverage**

- _Goal:_ Every relevant GitHub mutation wakes exact-PR reconciliation or leaves scheduled discovery able to repair
  it, without trusting event payload state or recursively reacting to controller-owned output.

    - `[ ]` **4.3.a Extend wake-up normalization for the complete event set**
        - Keep provider review and review-comment events on the secretless `Review Gate Wakeup` proxy and normalize
          their downstream `workflow_run` event in `runtime/wakeup.ts`; the runtime never receives those original
          payloads directly.
        - Normalize direct pull-request/label, issue-comment create/edit/delete, status, check, CI/proxy workflow
          completion, dispatch, and schedule events through their actual transport paths.

    - `[ ]` **4.3.b Update privileged and secretless workflow routing**
        - Expand `.github/workflows/review-gate.yml` and `review-gate-wakeup.yml` with pinned actions, minimal explicit
          permissions, safe proxy coverage, exact-PR dispatch where the initiating coordinator has canonical
          coordinates, and recursion suppression.
        - Consume Phase 3's direct `issue_comment: deleted` tombstone route as an established input; do not define a
          second tombstone handoff, storage shape, or persistence path here.

    - `[ ]` **4.3.c Extend workflow and runtime integration tests**
        - Prove event-to-canonical-requery routing, missed-event scheduled recovery, empty discovery no-op, and no
          duplicate request generation.
        - Cover proxy `workflow_run` with and without populated PR coordinates, direct deletion consumption, and
          bounded all-open-PR repair only when a safe proxy cannot identify one PR.

### `[ ]` **4.4 Integrate action execution, passive waiting, and exact-head re-entry into PR coordination**

- _Goal:_ The PR-opening workflow repeatedly reads canonical action state, performs an admitted developer trigger,
  waits passively, and re-enters findings coordination until the exact head settles.

    - `[ ]` **4.4.a Rewrite `coordinate-pr-review.md` around typed action and await loops**
        - Replace provider-command and manual-completion prose with `next-action` → `perform-action` → `await` →
          canonical re-entry; preserve distinct provider-native and normalized finding authority.

    - `[ ]` **4.4.b Align work-unit and errand integration callers**
        - Update package-source and `.arc/` workflow copies so opened PR context, mutability guards, review re-entry,
          and final `pre-merge` checks share one exact-head contract.

    - `[ ]` **4.4.c Extend workflow trigger, package-sync, and prose-contract tests**
        - Verify shipped-content register, frontmatter declarations, paired copies, guard ordering, and inactive
          `post-pr-open`/`pre-merge` configuration.

## **Phase 5:** Conversation settlement and finding lifecycle tails

_Purpose:_ Keep provider satisfaction distinct from closure authority and settle every finding at its original
conversation locus through authorized, receipt-backed FIX, DEFER, REJECT, or provider-owned sequences.

_Design decisions:_ A FIX closes only after the new head has exact CI, qualifying follow-up review, durable direct
reply, and authorized receipt evidence. Thread resolution alone never removes a blocker. Coordinator-owned replies
and resolutions run through the authorized developer's GitHub identity; the App independently re-queries and records
them. Disposition authority is durable before resolution, while resolution is a subsequent observed transition.

### `[ ]` **5.1 Add settlement actions, authorization contracts, and lifecycle-tail reduction**

- _Goal:_ Every known finding remains blocking until a source-confirmed or policy-authorized lifecycle transition
  proves its disposition at the original locus and exact head sequence.

    - `[ ]` **5.1.a Define `begin-fix`, `fixed`, `deferred`, `rejected`, and provider-closure receipts**
        - Extend v2 action contracts with finding id, source, old/fix head, actor, rationale, direct reply, follow-up
          evidence, and verification references.
        - Keep `fixed`, `deferred`, and `rejected` receipts pre-resolution, as required by the settlement sequence.
          Add a distinct `conversation-resolved` transition (or equivalent canonical reducer input) that can exist
          only after authorized disposition and an exact host re-read of the resolved original thread.

    - `[ ]` **5.1.b Resolve authorized finding actors from maintain permission and policy**
        - Select the PR author only when maintain-capable; otherwise require the configured maintainer. Remove
          `knownHostActors` as a closure-authority shortcut.
        - Add one immutable fallback-maintainer actor address (login plus expected numeric actor id) to versioned
          self-hosting policy. Do not reuse `authorMap`, which maps repository authors to ARC ownership rather than
          settlement authority; revalidate live `maintain` permission before every coordinator-owned action.

    - `[ ]` **5.1.c Reduce finding lifecycle tails test-first**
        - Cover exact sequence, actor, head, evidence, recurrence, reply, and resolution requirements; reject bare
          resolution, generic approval, foreign findings, reordered steps, and overbroad actor membership.
        - Remove `native-review.ts`'s generic `host-native` finding closures from authority reduction. Native thread
          resolution remains an observation until it matches a source-confirmed closure or the authorized disposition
          plus `conversation-resolved` sequence.

### `[ ]` **5.2 Implement GitHub direct-reply and thread-resolution adapters with durable provenance**

- _Goal:_ The coordinator can reply and resolve at the original inline conversation while the reducer retains
  immutable, canonically re-queryable evidence for each mutation under the actor policy that authorized it.

    - `[ ]` **5.2.a Add direct inline-reply and thread-resolution host operations**
        - Reuse Phase 2's developer-authenticated action port for direct inline replies and GraphQL thread-resolution
          mutations; bind exact comment/thread ids, expected actor id, body digest, timestamps, and current head.
        - Keep the App-token GitHub client read-only for these mutations. The App controller performs the authoritative
          post-write read and receipt append after the developer-authenticated operation returns.

    - `[ ]` **5.2.b Adopt ambiguous replies and resolutions only after exact re-query**
        - Re-query through canonical App reads for the exact actor/body/time reply or thread state. Keep absence or
          mismatch blocking; never repeat a potentially successful mutation blindly.

    - `[ ]` **5.2.c Cover durable reply, permission, stale-thread, and ambiguity behavior**

### `[ ]` **5.3 Complete the coordinator-owned FIX sequence across old and new heads**

- _Goal:_ A FIX finding closes only after one authorized push, exact new-head CI, qualifying full-head follow-up
  review, non-recurrence, direct reply, durable `fixed` receipt, and thread resolution.

    - `[ ]` **5.3.a Carry terminal findings through `begin-fix` and one consumed push authorization**

    - `[ ]` **5.3.b Bind new-head CI and follow-up review evidence to the original finding**
        - Allow other new findings while rejecting a source-confirmed recurrence of the issue being closed.
        - Add an optional source-authenticated recurrence relation (for example `recursFindingId`) to normalized
          finding evidence. Only a qualified source's explicit relation blocks closure as recurrence; coordinator
          text similarity or shared locus does not manufacture that authority.

    - `[ ]` **5.3.c Record accurate direct-reply language and `fixed` authority before resolution**
        - State that the coordinator addressed and verified the fix; never claim individual provider verification
          without corresponding evidence.
        - Append and canonically confirm the `fixed` receipt naming the durable direct reply before resolving the
          thread; then observe/record `conversation-resolved` and reconcile the aggregate blocker set.

    - `[ ]` **5.3.d Exercise the full FIX path through runtime composition and GitHub fakes**

### `[ ]` **5.4 Complete DEFER, REJECT, and provider-owned closure paths**

- _Goal:_ Non-fix dispositions close on the unchanged head only through bounded rationale and durable reply, while
  provider-owned closure is accepted only from the qualified finding source.

    - `[ ]` **5.4.a Implement authorized DEFER and REJECT receipt/reply sequences**
        - On the unchanged head, post the bounded rationale as the authorized developer, append and confirm the
          disposition receipt with the direct-reply id, then resolve and observe the conversation separately.

    - `[ ]` **5.4.b Implement source-confirmed provider closure without coordinator impersonation**
        - Accept only a qualified source's explicit finding closure relation; a native resolved flag, coordinator
          mutation, or provider membership in a broad actor set is observation rather than provider-owned authority.

    - `[ ]` **5.4.c Update PR coordination triage and cover all closure-authority arms**

## **Phase 6:** Independent outage-repair authority

_Purpose:_ Preinstall a recovery path whose status authority does not depend on the ARC App, and prove that only
immutable default-branch repair code can write the Actions-pinned recovery context.

_Design decisions:_ GitHub Actions App identity is accepted only with a repository-wide exclusive-writer proof.
Repair validates bounded exact-head attestations and follows add-before-remove transitions without bypassing merge.
The emergency writer uses a dedicated `review-gate-repair` environment referenced by no other workflow and executes
only from immutable default-branch code.

### `[ ]` **6.1 Extend bounded attestation validation for exact-head repair authority**

- _Goal:_ Recovery accepts only fresh, bounded, authorized independent-analysis evidence for the live repository,
  PR, author, diff base, change set, exact head, policy, rubric, and runtime.

    - `[ ]` **6.1.a Extend the neutral attestation manifest and validator**
        - Update `core/attestations.ts` for repair purpose, exact controller identities, run/workflow references,
          freshness, author separation, and unchanged-validator constraints.
        - A repair status requires a qualifying `clean` result with full exact-head coverage and no findings or
          closures; a structurally valid findings manifest remains review evidence but cannot authorize success.

    - `[ ]` **6.1.b Add live GitHub context resolution for repair validation**
        - Resolve canonical PR/head/policy plus maintainer or authenticated non-author authority without App
          credentials.

    - `[ ]` **6.1.c Cover agent, human, stale, self-review, and changed-repair-code cases test-first**
        - Include valid-but-findings, closure-bearing, partial-coverage, wrong-purpose, and clean exact-head repair
          manifests so status success cannot collapse ordinary attestation validity into repair authority.

### `[ ]` **6.2 Build the default-branch workflow and call-graph exclusive-writer audit**

- _Goal:_ A `review-repair-ok` status is trusted only after the complete immutable default-branch Actions graph
  proves no other workflow, token, or protected-environment consumer can write that context.

    - `[ ]` **6.2.a Parse workflow permissions, calls, environments, and status-writing paths**
        - Add a deterministic validator over `.github/workflows/**` and reusable calls; default repository
          permissions must remain read-only and every workflow/job permission explicit.
        - Pair the immutable default-branch graph with a live GitHub settings read proving the repository Actions
          default token permission is read-only; static YAML cannot establish that repository-level fact.

    - `[ ]` **6.2.b Enforce the exclusive-writer and protected-environment invariants**
        - Require the read-only validation job to precede one writer job that alone has `statuses: write`. The writer
          uses no checkout, `uses`, called script, dependency install, repository/organization secret, or dynamic
          context and emits only the inline constant `review-repair-ok` status after rechecking the live head.
        - Require `review-gate-repair` to be the sole workflow/environment reference and verify the emitted context is
          from GitHub Actions App id `15368`; source pinning, rather than static secret inference, excludes PAT/other-
          App writers.

    - `[ ]` **6.2.c Add fixture and live-repository audit coverage**
        - Include direct, reusable-workflow, environment, permissions, forbidden writer-job step, secret injection,
          dynamic context, and protected-file self-change cases in unit/integration tests.
        - Cover repository-default permission drift and live/default-branch graph disagreement as dispatch blockers.

### `[ ]` **6.3 Add the dispatch-only `review-repair-ok` workflow and protected-environment contract**

- _Goal:_ A maintainer can create one Actions-pinned recovery status from audited default-branch code without the
  ARC App credential and without opening an alternate automatic authority path.

    - `[ ]` **6.3.a Provision and verify the dedicated `review-gate-repair` environment**
        - Add compare-and-stop runbook/setup logic that resolves the live default branch, creates or repairs the
          secretless environment with an exact default-branch deployment policy, and verifies its live state before
          every qualification or repair dispatch.

    - `[ ]` **6.3.b Add `.github/workflows/review-gate-repair.yml` with split minimal permissions**
        - Use only `workflow_dispatch` from immutable default-branch code and `GITHUB_TOKEN`; keep validation read-only
          and grant the dedicated `review-gate-repair` environment writer job exactly `contents: read`,
          `pull-requests: read`, and `statuses: write`.
        - Reject a dispatch whose selected ref is not the repository default branch; check out the workflow's
          immutable default-branch SHA with persisted credentials disabled only in the read-only validation job.

    - `[ ]` **6.3.c Implement validation output and the closed inline writer**
        - Validate attestation plus exclusivity before emitting a bounded result; the writer rechecks that result and
          live PR head, then links run id, workflow path/SHA, PR, and head without executing repository code under its
          write token. Refuse changes to repair authority code on the repaired PR.

    - `[ ]` **6.3.d Extend environment, permissions, secret-boundary, and source-id tests**
        - Include missing/unprotected/wrong-branch environment refusal, non-default dispatch refusal, the exact split
          permission/job shape, exclusive environment reference, and Actions App id `15368` verification.

### `[ ]` **6.4 Rehearse and document outage and restoration add-before-remove sequences**

- _Goal:_ Operators can replace or restore required review authority without an empty required-check interval,
  administrative bypass, or unproven source.

    - `[ ]` **6.4.a Add compare-and-stop outage and restoration procedures to `.github/review-gate.md`**
        - Prove CI, attestation, exclusivity, exact status source, and live head before each enforcement mutation.
        - When the repair changes the normal `ci-ok` producer, require separate unchanged CI/reviewer proof; never
          accept the repair PR's self-produced `ci-ok` as its own prerequisite.

    - `[ ]` **6.4.b Rehearse add-before-remove in shadow/non-required mode and retain sanitized evidence**

    - `[ ]` **6.4.c Add runbook contract tests for forbidden bypasses and ordering**
        - Replace `validateOutageRecovery()`'s blanket `repairTouchesCiProducer` refusal with an explicit independent-
          CI-proof contract, covering ordinary repair, producer-changing repair with proof, and self-proof refusal.

## **Phase 7:** Delivery qualification contract and extraction handoff

_Purpose:_ Assemble the inactive self-hosting delivery and the exact qualification/closeout machinery that will prove
it from default-branch code without changing legacy required-check or project-hook authority.

_Design decisions:_ The implementation PR carries a sanitized manifest schema, not invented live values, and leaves
the work `Integrating` under temporary manual archival. Baseline default-branch qualification feeds a policy-
activation housekeeping PR; the complete matrix then reruns through that enabled policy before a separate archival
closeout records final results, marks the Post-Merge Acceptance Gates, restores cadence, and completes teardown.
Phase 8 validates only the delivery Success Criteria below.

### `[ ]` **7.1 Complete controller composition and repository-only launcher packaging**

- _Goal:_ All new neutral modules, GitHub/provider adapters, launchers, workflows, and policy declarations compose
  into one inactive self-hosting controller without leaking repository mechanics into the extraction boundary.

    - `[ ]` **7.1.a Assemble production factories and runtime entry points**
        - Update `runtime/composition.ts`, reconcile/attest mains, and thin launchers to inject the versioned store,
          provider set, action executor, await runtime, conversation settlement, and repair validator.

    - `[ ]` **7.1.b Keep repository-only launchers outside the published CLI surface**
        - Keep launchers under `src/scripts/review-gate` and invoke them only from private root scripts or repository
          workflows; do not add tsup entries, CLI commands, provider registries, or published package scripts that
          reference source files absent from the tarball.

    - `[ ]` **7.1.c Extend packaging, architecture-boundary, and production-composition tests**
        - Prove neutral modules import only ports/core utilities and that every executable path emits typed,
          fail-closed output against injected fakes.
        - Preserve the existing `npm pack --dry-run` proof that repository controller source, policy, evidence, and
          workflows remain excluded while the public CLI bundle stays rooted only at `src/cli.ts`.

### `[ ]` **7.2 Build App identity, token-opacity, and secret-boundary qualification**

- _Goal:_ The default-branch acceptance tail can prove the pinned least-privilege App through the exact controller
  consumer across both token formats without exposing credentials or granting qualification code production authority.
- **Additional Context:** `notes-review-gate-enforcement-cutover.md` § GitHub App and token evidence.

    - `[ ]` **7.2.a Source-audit pinned Actions and controller token consumers**
        - Prove opaque token handling and exact selected-repository/permission boundaries; reject prefix, length,
          dot-count, regex, and storage-width assumptions.

    - `[ ]` **7.2.b Add qualification-only forced-format probes around the exact controller consumer**
        - Add `.github/workflows/review-gate-qualify.yml`, dispatchable only from the immutable default branch through
          the existing protected `review-gate` environment, for bounded App-authenticated and forced-token probes.
        - Direct-mint stateless and classic forms only inside that workflow, remove the temporary override after each
          proof, and expose only sanitized typed outcomes to the coordinator.

    - `[ ]` **7.2.c Cover App identity, repository selection, denied capabilities, and secret non-propagation**
        - Test the qualification runner with redacted fakes and contract fixtures before its live default-branch use.

### `[ ]` **7.3 Build the hosted-provider and controller acceptance matrix**

- _Goal:_ One fail-closed runner can exercise and record every required live capability against shipped default-branch
  code without allowing fixtures, partial probes, or unshipped implementations to satisfy acceptance.
- **Additional Context:** `notes-review-gate-enforcement-cutover.md` §§ Live hosted-Codex probe, CodeRabbit
  observations, and Qualification evidence boundaries.

    - `[ ]` **7.3.a Define the disposable-PR matrix and typed acceptance result**
        - Cover pending-first ordering, trigger lifecycle, provider outcomes, fallback, await, event repair, finding
          settlement, v1/v2 migration, token formats, and repair authority.
        - Define bounded repository, default-branch SHA, PR/head, matrix-cell, checkpoint, and sanitized-result schemas
          plus stable resume/refusal outcomes.
        - Include every input needed to derive policy without inference: source/actor identities, parser, rubric and
          guidance versions/digests, capability outcomes, terminal-unavailable mode, and checkpoint hashes.

    - `[ ]` **7.3.b Implement CodeRabbit and Codex controlled probe orchestration**
        - Require every rubric dimension, exact-head clean/findings/stale/unknown case, and configured trigger path;
          keep connected-account behavior parser-only/non-terminal unless an admissible actor proves it live.

    - `[ ]` **7.3.c Implement controller, watcher, settlement, migration, and recovery probe orchestration**
        - Add a repository-only `run-qualification.ts` coordinator and private root script. Require a clean checkout
          equal to the immutable remote default-branch SHA; use developer-authenticated `gh` only for actor-assigned
          actions, dispatch the protected workflow for App probes, re-query GitHub, and persist raw non-secret results
          only through an injected private checkpoint-store port.

    - `[ ]` **7.3.d Test incomplete, failed, resumed, and contaminated acceptance runs**
        - A failure restores or disables to the safe checkpoint, emits no passing manifest, and directs repair to a
          separate Errand or work unit before the affected tail repeats through shipped code.
        - Cover changed default branch, dirty checkout, wrong actor, missing checkpoint, result/checkpoint mismatch,
          fixture substitution, workflow ref drift, credential-shaped output, and exact idempotent resume.

### `[ ]` **7.4 Publish the runbook, technical overview, sanitized evidence schema, and extraction handoff**

- _Goal:_ Operators receive an exact default-branch qualification/closeout procedure, while downstream work receives
  a stable sanitized schema that later records observed values without conflating reusable contracts and self-hosting
  policy.

    - `[ ]` **7.4.a Complete `.github/review-gate.md` and `.github/review-gate-attestation.md`**
        - Document current operation, typed agent loop, exclusive trigger/finding authority, qualification, repair,
          safe checkpoints, and ordinary repository-language reviewer surfaces.

    - `[ ]` **7.4.b Add the self-hosting review-gate section to `.arc/reference/TECHNICAL-OVERVIEW.md`**
        - Keep internal implementation and extraction boundaries explicit without forward-claiming public adapter
          setup or promotion state.

    - `[ ]` **7.4.c Create the sanitized cutover evidence and handoff schema**
        - Add `.arc/reference/supplemental/research/research-review-gate-cutover-evidence.md`, separating neutral core
          contracts, GitHub/provider implementations, self-hosting policy, workflow assumptions, qualification result
          slots, source identities, and unresolved productization constraints.
        - Permit the implementation PR to contain schema/instructions and prior sanitized probe facts only. The
          qualification-activation PR records baseline-proven declarations provisionally; only the acceptance-
          closeout PR records final enabled-policy default-branch values.
        - Define `CutoverAcceptanceProof` with implementation/activation PR identities, live default-branch SHA,
          enabled policy/rubric/guidance/parser digests, complete required-matrix result, enforcement boundary, and
          raw-checkpoint hashes; credentials and raw responses remain structurally inadmissible.

    - `[ ]` **7.4.d Validate docs, workflow prose, secret redaction, and audience boundaries**

### `[ ]` **7.5 Prepare the deferred acceptance and archival closeout boundary**

- _Goal:_ Merging the inactive implementation leaves a recoverable `Integrating` work unit whose only successful
  closeout path records default-branch proof, restores normal archival cadence, and preserves WU2's promotion scope.

    - `[ ]` **7.5.a Make manual archival retain and later complete the physical lifecycle tail**
        - Set `.arc/system/arc-config.yml` to temporary manual archival for this delivery. Update package-source and
          project `integrate-work-unit.md` so manual cadence defers user-state close and teardown with the archive
          sweep; update both `archive-work-unit.md` copies so the standalone PR's post-merge tail owns those actions.
        - Cover both cadences, resume after attended/unattended merges, retained branch/worktree state, standalone
          archive-PR merge, user-state close, merged-safe teardown, and idempotent partial cleanup.
        - Add the optional Post-Merge Acceptance Gates contract to package/project task-list formatting and make the
          archive verb reject a present section with missing, malformed, or non-terminal markers before any computed
          destination or relocation side effect.
        - Place the section after the verification phase and before the Success Criteria separator; Phase 8 never
          marks it, its text remains immutable, and only the named post-merge closeout authority may mark it terminal.

    - `[ ]` **7.5.b Define the post-merge acceptance and failure procedure**
        - Implement a deterministic activation compiler from baseline result plus current policy to exact declaration
          and provisional-manifest patches. Bind identities, versions/digests, capabilities, terminal-unavailable
          mode, baseline SHA, and checkpoint hashes.
        - Validate the qualification-activation PR diff against that candidate, allowing only the generated policy and
          manifest fields/paths and rejecting manual additions, omissions, stale inputs, version drift, or extra diff.
          Do not archive or restore cadence in that PR.
        - After activation merges, rerun the complete matrix through the enabled default-branch policy; require at
          least one hosted satisfying adapter, complete settlement/repair proof, and exact source/controller handoffs.
        - On failure, restore/disable to the safe checkpoint, keep the work unarchived, ship a separate repair, and
          rerun only through the repaired default branch.

    - `[ ]` **7.5.c Define the acceptance-closeout housekeeping PR and WU2 handoff**
        - Add a repository-only `review-gate:closeout` main/private root script that validates
          `CutoverAcceptanceProof` against private checkpoints and live GitHub, writes the final sanitized manifest,
          marks Post-Merge Acceptance Gates, then alone invokes its injected archive port with the implementation PR
          URL. Restore `archive.cadence: with-integration` in the same closeout PR.
        - Refuse before archive mutation on missing, malformed, partial, failed, stale, wrong-head, wrong-policy,
          incomplete-matrix, checkpoint-mismatch, or replayed proof. Add a pre-commit contract that rejects a marked/
          archived acceptance section whose sanitized proof does not validate.
        - After that PR merges, close the retained WU user workspace and run `arc teardown
          review-gate-enforcement-cutover`; prove the branch/worktree and user-state tail is fully retired.
        - Require `post-pr-open` and `pre-merge` inactive, legacy `merge-ok` required, and CodeRabbit native request-
          changes enabled; WU2 starts only after this PR merges and re-proves the recorded state before mutation.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

## Post-Merge Acceptance Gates

- `[ ]` CodeRabbit has a live capability table whose non-satisfying observations cannot grant authority.
- `[ ]` Hosted Codex is live-proven for every required result, grammar, rubric, trigger, and settlement behavior.
- `[ ]` At least one hosted adapter is enabled as satisfying, with only legal terminal/pre-effect fallback and one
  live source per generation.
- `[ ]` Both token forms, pinned App identity, least privilege, repository selection, denied capabilities, and
  credential isolation pass through shipped default-branch code.
- `[ ]` The Actions-pinned, exclusive-writer-proven repair authority passes exact-head attestation and outage/restore
  rehearsal while the App projection remains non-required.
- `[ ]` A qualification-activation housekeeping PR writes only baseline-proven hosted declarations, after which the
  complete disposable-PR matrix passes through the enabled default-branch policy.
- `[ ]` The final matrix populates `.arc/reference/supplemental/research/research-review-gate-cutover-evidence.md` with
  sanitized capability, source, controller, enforcement-boundary, and evidence-hash values.
- `[ ]` The acceptance-closeout housekeeping PR preserves legacy authority and inactive hooks, archives with the
  implementation PR URL only after machine-validating the complete live proof, restores
  `archive.cadence: with-integration`, and is followed by complete user-state, branch, and worktree teardown before
  promotion begins.

---

## Success Criteria

- `[ ]` Every provider effect is preceded by a durable reservation and confirmed App-authored pending projection on
  the exact head.
- `[ ]` Satisfying evidence is causally bound to pinned identity, versioned policy/rubric, full frozen head, and one
  uncontaminated immutable trigger generation.
- `[ ]` CodeRabbit capability declarations fail closed, and the acceptance runner can record the final observed
  capability table without treating native status or empty approval as authority.
- `[ ]` Hosted Codex parsers, rubric transport, trigger ownership, and settlement contracts cover every required
  outcome while connected-account behavior remains parser-only until admissible live proof exists.
- `[ ]` Provider order permits fallback only after a legal terminal/pre-effect condition, and acceptance refuses to
  close without at least one hosted satisfying adapter.
- `[ ]` Passive CI/review waiting returns typed exact-head state changes without provider parsing or model work.
- `[ ]` Every configured event path and scheduled repair converges on the same canonical state without duplicate
  generations or recursive controller wake-ups.
- `[ ]` Active flights freeze pushes, and every finding disposition satisfies its exact-head authorization and
  original-conversation lifecycle contract.
- `[ ]` V1 ledgers remain byte-stable and audit-readable, with only the terminally-proven append-only v2 transition
  accepted.
- `[ ]` Qualification-only token probes treat both formats as opaque, remove every temporary override, and emit no
  credential-bearing result.
- `[ ]` App validation pins identity, least privilege, selected-repository scope, denied capabilities, and secret
  isolation across every consumer boundary.
- `[ ]` `review-repair-ok` is bound to a live-verified secretless environment, immutable default-branch Actions code,
  one closed writer job, an exact-head attestation, and an add-before-remove recovery procedure.
- `[ ]` Coordinator FIX, DEFER, REJECT, and provider-owned closure retain their distinct exact-head authority and
  original-conversation lifecycle contracts.
- `[ ]` The single implementation delivery leaves legacy `merge-ok` required and project hooks inactive, installs the
  deterministic qualification-activation compiler/diff validator and machine-gated requalification/closeout
  procedure, and defers archival plus teardown safely.
- `[ ]` Neutral core modules depend only on injected ports, and the sanitized handoff schema separates reusable
  contracts from self-hosting policy and later live values.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.

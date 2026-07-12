# Task List: Review Gate Enforcement Cutover

- **Design:** `spec-review-gate-enforcement-cutover.md`

---

## **Phase 1:** Request and receipt foundation

_Purpose:_ Establish the controller's initial causal request, receipt, and ledger contract before execution,
provider, or settlement behavior depends on it.

_Design decisions:_ No live or persisted review-gate receipts exist and the project hooks remain inactive, so the
merged-but-unused development schema is replaced before activation rather than treated as migration history. One
closed schema-v1 codec owns parsing, hashing, and semantics. It exposes stable contract name/version metadata so a
later schema-library implementation can replace its internals without changing consumers; this work adds no schema
dependency or public registry.

### `[x]` **1.1 Define the initial causal request, receipt, and lifecycle-payload contracts**

- _Goal:_ The first live schema carries the causal, head-flight, actor, trigger, timing, contamination, supersession,
  terminal-evidence, and finding-settlement identity required by the controller behind one replaceable boundary codec.

    - `[x]` **1.1.a Define the closed request and receipt identities**
        - Added explicit contract and semantics identities plus required mechanism, actor, generation, and payload
          fields behind the existing neutral parsing façades.

    - `[x]` **1.1.b Define terminal-evidence and finding-lifecycle payloads**
        - Added a closed payload union for reservation, acknowledgement and trigger ownership, terminal evidence,
          finding lifecycle and settlement, contamination, supersession, and decisions while retaining normalized
          `Evidence` as the sole evidence contract.

    - `[x]` **1.1.c Validate closed contract shapes test-first**
        - Covered every payload family and the request/envelope boundary, including strict rejection of unknown,
          missing, obsolete, and causally incongruent shapes without defaults or upgrade paths.

- _Outcome:_ One initial schema now owns the complete causal lifecycle identity; persisted inputs cannot enter the
  controller through a partial or compatibility shape.

### `[x]` **1.2 Bind canonical identities and authenticated comment storage to the initial schema**

- _Goal:_ Request keys, receipt hashes, serialized comments, and reconstructed ledgers share one closed identity
  algorithm with literal golden fixtures and no alternate schema path.

    - `[x]` **1.2.a Extend request-key and receipt identity with causal fields**
        - Bound semantics, mechanism, required actor, lifecycle payload, and predecessor version into canonical
          identities, with literal fixtures fixing the request key, idempotency key, receipt hash, and serialized bytes.

    - `[x]` **1.2.b Update every production request and receipt producer**
        - Updated automatic reduction/runtime, authorized-command and refresh, attestation, and provider paths to emit
          the complete initial request and payload schema through the sole strict creator.

    - `[x]` **1.2.c Preserve the closed schema through authenticated comment storage**
        - Closed receipt-comment and anchor machine payloads to exact fields; authenticated reconstruction now degrades
          on obsolete, extended, edited, malformed, or scope-incongruent records.

- _Outcome:_ One canonical byte and hash path now spans request creation, receipt production, authenticated storage,
  and ledger reconstruction without a compatibility branch.

### `[x]` **1.3 Complete ledger, reduction, and extraction boundaries**

- _Goal:_ The host-neutral controller consumes the definitive ledger through stable injected boundaries, while
  behavior-specific ports remain vertically owned by the later phases that implement them.

    - `[x]` **1.3.a Keep the ledger port schema-complete and behavior-neutral**
        - Kept ledger reads and appends on the neutral parsed envelope/receipt types and added pre-write shape and
          identity validation; behavior-specific ports remain vertically owned by their implementation phases.

    - `[x]` **1.3.b Preserve degradation while reducing the definitive receipts**
        - Routed authenticated parsed ledger records through the existing requirement, verdict, and projection reducers;
          malformed history still degrades to failure while later phases retain ownership of new behavioral states.

    - `[x]` **1.3.c Prove neutral dependency direction and replaceable codec boundaries**
        - Extracted self-hosting policy composition from the neutral reducer and added contract checks rejecting policy,
          GitHub, or provider imports from core and duplicate request, receipt, or envelope declarations.

- _Outcome:_ The definitive receipt contract now crosses storage, ledger, reduction, and projection through one neutral
  dependency direction, with self-hosting qualification bound outside core.

## **Phase 2:** Pending-first execution and exact-head control

_Purpose:_ Make every provider effect controller-owned and head-safe: durable reservation and confirmed pending
projection precede execution, actor-dependent work becomes typed state, and active request flights freeze pushes.

_Design decisions:_ Ambiguous writes are adopted only through canonical re-query. Head changes require an explicit,
single-use authorization tied to terminal findings; no repository-wide network pre-push hook is introduced. The
aggregate check keeps its stable PR/change-set/context identity: pending confirmation pairs a pinned exact-head check
read with a separate canonical read of the matching reservation and ledger version rather than minting a check per
request generation.

### `[x]` **2.1 Implement pending-first reservation, projection confirmation, and request acknowledgement**

- _Goal:_ No provider effect or trigger-required action becomes live until its reservation and App-authored pending
  aggregate check are durable and canonically confirmed on the exact frozen head.

    - `[x]` **2.1.a Extend the neutral execution protocol to publish and confirm pending before effect**
        - Split reservation from confirmed execution and made reconciliation reserve, re-read, publish queued state,
          confirm pending, re-read, execute, and finally re-reduce before publishing current terminal state.

    - `[x]` **2.1.b Compose pending confirmation through the GitHub host adapter**
        - Added exact pending-check confirmation for pinned App, context, external id, and head, paired independently
          with authenticated request-key, generation, receipt-hash, and ledger-version confirmation.

    - `[x]` **2.1.c Prove ordering and fail-closed interruption test-first**
        - Covered strict publish/confirm/effect ordering, stale and foreign identities, missing or failed confirmation,
          interrupted reservation adoption without replay, and stale-final-state suppression through unit and composed
          GitHub integration tests.

- _Outcome:_ A provider effect is now unreachable until both durable controller state and its exact App-authored
  pending projection are canonically observable; interruption preserves pending state without duplicating spend.

### `[x]` **2.2 Add typed next-action and developer-authenticated action execution launchers**

- _Goal:_ A PR-opening agent can discover and consume one actor-bound hosted trigger from authenticated controller
  state without parsing display prose or borrowing App credentials.

    - `[x]` **2.2.a Model `needs-user-trigger` and terminal/attention actions in the neutral reducer**
        - Added strict typed next-state contracts carrying exact scope, request identity, generation, command, and
          immutable required actor identity; request commands now participate in canonical request identity.

    - `[x]` **2.2.b Implement dependency-injectable next-action and perform-action mains**
        - Added read-only next-action and actor-authenticated perform-action mains that revalidate exact controller
          state, expose triggers only after pending confirmation, post once, narrowly adopt ambiguity, and dispatch.

    - `[x]` **2.2.c Add repository-only launcher scripts and JSON contracts**
        - Added private root scripts and thin `tsx` launchers that use the current developer's `gh` session while
          keeping the published CLI package surface unchanged.

    - `[x]` **2.2.d Cover actor mismatch, replay, adoption, and stale-action behavior**
        - Covered wrong actors, changed heads and generations, exact ambiguous-post adoption, duplicate consumption,
          dispatch failure, pre-confirmation waiting, launcher isolation, and strict typed output parsing.

- _Outcome:_ Actor-dependent provider work now crosses a pending-confirmed, exact-head handoff: neutral reduction
  describes the single permitted trigger, while only the matching developer session can consume and reconcile it.

### `[x]` **2.3 Model active flights, `begin-fix`, supersession, and one-shot head-update authorization**

- _Goal:_ Request activity and terminal findings produce an explicit mutability state, so every allowed new head is
  attributable to one authorized repair and every old-head finding remains in the lifecycle tail.

    - `[x]` **2.3.a Reduce exact-head flight and mutability state**
        - Added neutral receipt and exact-host-observation reduction for pending trigger, queued, acknowledged,
          running, terminal, contaminated, abandoned, superseded, and ambiguous active generations.

    - `[x]` **2.3.b Add `begin-fix` and carried-finding receipt semantics**
        - Extended the strict initial receipt schema with flight, `begin-fix`, and head-consumption payloads; repair
          planning requires an authorized actor, exact terminal request/findings, old head, and one target head.

    - `[x]` **2.3.c Consume authorization on the first reconciled new head**
        - The first target-head reconciliation now appends consumption, supersession, and per-finding carry receipts
          before reserving follow-up review through the existing pending-confirmed execution protocol.

    - `[x]` **2.3.d Cover abandon, supersede, repair, and replay transitions test-first**
        - Covered active and ambiguous refusal, unchanged-head settlement, abandon/supersede/contamination states,
          exact FIX authorization, wrong targets/actors/findings, replay, strict identities, and runtime carry order.

- _Outcome:_ Every modeled head change is now attributable to a durable single-use transition: active review freezes
  mutation, while terminal findings cross exactly one authorized target with their original lifecycle authority intact.

### `[ ]` **2.4 Expose and compose the exact-head mutability guard at workflow push fire sites**

- _Goal:_ Workflow-driven pushes for an opened PR stop immediately before transport unless canonical controller
  state authorizes that exact head transition, while pre-PR pushes remain network-hook free.

    - `[ ]` **2.4.a Add `review-gate:assert-head-mutable` as a repository-only launcher**
        - Bind repository, PR, canonical remote PR head, proposed outgoing local head/change set, and optional
          `begin-fix` authorization to the neutral query; emit typed allow/refuse diagnostics for that exact
          transition without consuming authorization before the new head is canonically observed.

    - `[ ]` **2.4.b Insert the guard at canonical integration and errand push fire sites**
        - Update package-source and `.arc/` copies of `integrate-work-unit.md` and `supplemental/run-errand.md`,
          preserving project overrides and invoking the guard only when `openedChangeRequest` exists.
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
rather than sharing user-record projection, sync, TTL, or garbage-collection machinery. Every receipt variant added
below extends the still-inactive initial schema v1, its strict parser, and literal golden fixtures; no second receipt
schema, mixed-ledger mode, or upgrade transition is introduced before activation.

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
        - Add an initial-schema `trigger-deleted` receipt payload containing comment id, actor, prior body digest,
          event time, observed PR head, provider/trigger classification, and authenticated event reference; extend
          the strict parser and golden fixtures without adding a schema-version path.
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
        - Add an initial-schema `source-superseded` receipt naming the prior source/generation, terminal or pre-effect
          proof, alternate source, actor, reason, and ledger predecessor. Canonically re-read that receipt before
          emitting the alternate reservation.

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
        - Extend the initial action contracts with finding id, source, old/fix head, actor, rationale, direct reply,
          follow-up evidence, and verification references, updating the strict parser and golden fixtures in place
          before activation.
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

_Purpose:_ Assemble the inactive self-hosting delivery and the exact qualification machinery the dependent
qualification work unit will run from default-branch code without changing legacy required-check or project-hook
authority.

_Design decisions:_ The implementation PR carries the fail-closed qualification runner, activation compiler, diff
validator, and sanitized manifest schema, but no invented live values or post-merge acceptance state. It archives
normally after delivery verification; `review-gate-enforcement-qualification` owns baseline qualification, provider-
policy activation, and the provisional observed manifest; promotion owns enabled-policy requalification and the final
acceptance proof before enforcement mutation.

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

- _Goal:_ The dependent qualification work can prove the pinned least-privilege App through the exact controller
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
          settlement, receipt-ledger reconstruction, token formats, and repair authority.
        - Define bounded repository, default-branch SHA, PR/head, matrix-cell, checkpoint, and sanitized-result schemas
          plus stable resume/refusal outcomes.
        - Include every input needed to derive policy without inference: source/actor identities, parser, rubric and
          guidance versions/digests, capability outcomes, terminal-unavailable mode, and checkpoint hashes.

    - `[ ]` **7.3.b Implement CodeRabbit and Codex controlled probe orchestration**
        - Require every rubric dimension, exact-head clean/findings/stale/unknown case, and configured trigger path;
          keep connected-account behavior parser-only/non-terminal unless an admissible actor proves it live.

    - `[ ]` **7.3.c Implement controller, watcher, settlement, ledger, and recovery probe orchestration**
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

- _Goal:_ Operators receive an exact default-branch qualification and handoff procedure, while downstream work
  receives a stable sanitized schema that later records observed values without conflating reusable contracts and
  self-hosting policy.

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
          qualification work unit records baseline-proven declarations and provisional live values after executing
          shipped code; this delivery never pre-populates them.
        - Define `CutoverAcceptanceProof` with implementation/qualification PR identities, live default-branch SHA,
          enabled policy/rubric/guidance/parser digests, complete required-matrix result, enforcement boundary, and
          raw-checkpoint hashes; credentials and raw responses remain structurally inadmissible.

    - `[ ]` **7.4.d Validate docs, workflow prose, secret redaction, and audience boundaries**

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Every provider effect is preceded by a durable reservation and confirmed App-authored pending projection on
  the exact head.
- `[ ]` Satisfying evidence is causally bound to pinned identity, versioned policy/rubric, full frozen head, and one
  uncontaminated immutable trigger generation.
- `[ ]` CodeRabbit capability declarations fail closed, and the qualification runner can record an observed capability
  table without treating native status or empty approval as authority.
- `[ ]` Hosted Codex parsers, rubric transport, trigger ownership, and settlement contracts cover every required
  outcome while connected-account behavior remains parser-only until admissible live proof exists.
- `[ ]` Provider order permits fallback only after a legal terminal/pre-effect condition, and the qualification
  runner refuses a passing proof without at least one hosted satisfying adapter.
- `[ ]` Passive CI/review waiting returns typed exact-head state changes without provider parsing or model work.
- `[ ]` Every configured event path and scheduled repair converges on the same canonical state without duplicate
  generations or recursive controller wake-ups.
- `[ ]` Active flights freeze pushes, and every finding disposition satisfies its exact-head authorization and
  original-conversation lifecycle contract.
- `[ ]` Initial-schema ledgers remain byte-stable and audit-readable through one strict parser and identity algorithm;
  no mixed-version or upgrade path is accepted.
- `[ ]` Qualification-only token probes treat both formats as opaque, remove every temporary override, and emit no
  credential-bearing result.
- `[ ]` App validation pins identity, least privilege, selected-repository scope, denied capabilities, and secret
  isolation across every consumer boundary.
- `[ ]` `review-repair-ok` is bound to a live-verified secretless environment, immutable default-branch Actions code,
  one closed writer job, an exact-head attestation, and an add-before-remove recovery procedure.
- `[ ]` Coordinator FIX, DEFER, REJECT, and provider-owned closure retain their distinct exact-head authority and
  original-conversation lifecycle contracts.
- `[ ]` The single implementation delivery leaves legacy `merge-ok` required and project hooks inactive, installs the
  deterministic qualification compiler, activation-diff validator, machine-gated requalification runner, and
  sanitized handoff schema, and archives through the ordinary work-unit lifecycle.
- `[ ]` Neutral core modules depend only on injected ports, and the sanitized handoff schema separates reusable
  contracts from self-hosting policy and later live values.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.

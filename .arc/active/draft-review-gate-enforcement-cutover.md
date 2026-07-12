# Draft: Review Gate Enforcement Cutover

- **Origin:** Split from `review-gate-reconcile-composition` when the first authentication probe proved the accepted
  controller architecture had no production composition (2026-07-11).
- **Purpose:** Ship and live-qualify the provider-neutral request, wait, evidence, and conversation-settlement layer
  that makes the composed controller safe to promote. Leave required-check promotion to the dependent work unit.
- **Depends On:** `review-gate-reconcile-composition` — merged as PR #226 (`08e83a21`).
- **Class:** Heavy — provider qualification, asynchronous coordination, workflow behavior, App authentication, and
  fallback semantics require durable design and live evidence even though final host enforcement is split out.
- **Runbook:** `.github/review-gate.md` remains the cross-work-unit operational source. This work unit may extend it,
  but does not execute the required-check promotion owned by `review-gate-enforcement-promotion`.

---

## Decomposition and delivery truth

This is WU 1 of a two-work-unit sequence:

1. **`review-gate-enforcement-cutover` (this work):** build and qualify request automation, the pending-first ARC App
   projection, the passive watcher, provider adapters and fallback selection, conversation settlement, and workflow
   behavior guards. Deliver them in this work unit's one PR with project hooks still inactive while legacy CI
   `merge-ok` remains required. After merge, manually live-qualify the shipped default-branch controller as this work
   unit's acceptance tail before archive.
2. **`review-gate-enforcement-promotion`:** after WU 1 ships, reconcile GitHub enforcement and promote authenticated
   shadow → dual → final. Its tracked draft is coordinated now; its spec and task list wait for WU 1's observed final
   contracts.

Disposable probe PRs are test fixtures, not extra work-unit delivery PRs. No work unit claims multiple delivery PRs,
and no planning artifact fabricates a dependency for `finalize-parallelism`.

The post-merge acceptance tail is success-path qualification, not permission for a second WU 1 PR. On failure,
restore/disable to the last safe checkpoint, keep legacy authority intact, leave WU 1 unarchived, and route the defect
through an isolated repair Errand or work unit with its own PR. Re-run the acceptance tail after that repair ships.
WU 2 remains blocked until WU 1 passes and archives.

## Live baseline and spike evidence

The protected `review-gate` environment and repository App variables/secret metadata exist. The private App
authenticates as `arc-review-gate-andrewrcr` (App id `4268856`) with only metadata read, checks write, pull requests
write, and statuses read. Its selected-repository installation was moved add-before-remove from the sandbox toward
`arc-framework`; final one-repository scope remains a setup checkpoint until the sandbox selection is removed and
re-proved. `review-gate.yml` remains manually disabled pending the composed authentication probe;
`review-gate-wakeup.yml` and `review-gate-attest.yml` remain active.

Hosted Codex was live-probed on disposable PR #227 with a deliberately unsafe Head A and fixed Head B:

- A user-authored `@codex review` acknowledged via 👀 and completed findings in about 163 seconds. It submitted a
  standard `COMMENTED` review bound by full `commit_id` to Head A and one P1 inline comment bound to the same head.
- The fixed-head request acknowledged via 👀 and completed clean in about 82 seconds as an issue comment, not a
  GitHub review or native check. The comment was unedited, carried the reviewed SHA prefix, and was authored by bot
  user id `199175422` through Codex App id `1144995`.
- Head A's finding remained unresolved/outdated after the clean round. The coordinator replied at the original
  conversation locus and resolved the thread without user intervention, proving coordinator-owned settlement.
- An ARC-App-authored `@codex review` reached Codex but failed entitlement because the bot actor has no connected
  Codex account. Selective hosted-Codex requests therefore require the developer-authenticated PR-opening agent (or
  an explicitly configured user token); App-authored mentions are a typed request failure, never a silent retry.
- No Codex-native check exists. The ARC App must provide the pending and terminal merge projection.

The token-format compatibility probe forced both GitHub installation-token forms. The stateless `ghs_` JWT form
contained two dots and was much longer than the classic opaque form; both authenticated successfully. Code inspection
found no prefix, exact-length, regex, dot-count, or storage assumptions. The pinned token Action has no override input,
so qualification has two explicit parts: a protected direct-mint probe forces both forms through the exact controller
consumer on a disposable PR, while a pinned-Action source audit plus ordinary production run proves it passes its
token output opaquely. Leave no temporary rollout-override header in production.

## Design

### 1. Provider-neutral request ledger and pending-first projection

Admission policy classifies each PR/head as exempt, recommended, or required and selects an ordered adapter set. A
request record binds provider, PR, full head SHA, generation, request transport/actor, request and acknowledgement
times, terminal evidence ids, and supersession state. Request creation is idempotent for that tuple.

Request execution is ordered: append the durable reservation, publish the pending projection, confirm it on the exact
head, then initiate the provider effect. Required-check absence is also blocking after promotion, but it does not
replace this ordering contract. The projection stays non-success through provider latency, retry, rate limit,
unavailable transport, ambiguous result, or stale evidence. Only qualifying current-head settlement turns it green.

Provider output lacks a native request id, so attribution uses an exclusive trigger window. Prove automatic/unowned
provider paths disabled before admission; record the controller-owned label/comment event id and actor; require the
terminal artifact after that event with no intervening trigger through terminal. Scan the current head for earlier
unowned trigger activity before initiating. Any collaborator/provider trigger outside the owned event contaminates
the generation: its evidence cannot satisfy, no fallback starts while its effect may be live, and explicit repair
waits for it to terminate before reserving a new owned generation. Head equality and temporal order alone never prove
causation.

An adapter declares either a controller-executable effect or an actor-executable action. For the latter, canonical
state exposes one `needs-user-trigger` action containing request key, provider, full head, generation, exact command,
and required GitHub actor identity. The coordinating agent acts only after observing that pending action under the
same head and matching its authenticated `gh` actor. It posts once, then re-enters; the controller matches the exact
new comment id/actor/body to the reservation and transitions to acknowledged/running. If posting returns ambiguously,
re-query comments by reservation time/actor/body before any retry. Single-owner PR coordination plus the durable
action state is the concurrency boundary; no other session may issue the provider effect.

A head with an acknowledged/queued/running request is frozen. Do not push until terminal settlement. The only escape
is an explicit abandon/supersede/restart transition that invalidates the old generation before a new head is pushed.

### 2. One await transport, distinct CI and review semantics

Build one change-request await primitive over low-frequency GitHub reads and controller events. Waiting consumes no
model work; the process reports only state changes and returns a typed terminal result that re-enters the coordinator.
The transport is shared, but state machines are not:

- Exempt PRs await source-pinned `ci-ok` for the exact head.
- Reviewed PRs await the ARC App's aggregate projection, which includes CI, request, provider evidence, finding
  settlement, waiver, timeout, and fallback semantics.

Workflows must invoke the watcher explicitly after opening or updating a PR. The watcher never parses provider prose;
provider adapters reconcile native artifacts into the aggregate controller state. A coordinator-owned thread
mutation immediately dispatches exact-PR/head reconciliation. Provider-owned closure must qualify a review, review-
comment, status, or issue-comment proxy event; scheduled repair is only the backstop for a missed event.

### 3. Provider adapters and trigger transports

Adapters separate requestability/observability from satisfaction qualification and declare their conversation-
settlement capability.

**CodeRabbit hosted PR adapter**

- ARC admission adds the exclusive `arc-review-gate` label for generation zero; later generations may use the
  controller-authored `@coderabbitai full review` transport.
- Bind the App-authored label event or full-review comment id to the reservation. Prove inherited/global automatic
  paths do not bypass the exclusive label and treat every unowned CodeRabbit trigger in the window as contamination.
- Qualifying outcomes require pinned identity, full current-head coverage, durable distinct clean/findings evidence,
  policy/rubric binding, stale rejection, and lifecycle-tail handling. A completion status is wake-up evidence only.
- Provider-native closure is preferred: fixes are re-reviewed, while DEFER/REJECT requires a direct reply on the
  original finding before the provider can settle it.
- Capacity is per head. Paused, skipped, oversized, stale, or ambiguous observations are non-satisfying without
  globally disqualifying CodeRabbit. A proven pre-effect rate-limit rejection may advance to fallback; ambiguous
  delivery/result remains blocking unless an explicit terminal failure later proves no provider effect is live.
- PR #227 proved native approval is not substantive evidence: with no CodeRabbit label, request, walkthrough, or
  findings, `request_changes_workflow` submitted an empty approval after the coordinator resolved a Codex thread.
  Reject that approval absent a controller reservation and full-head evidence. Keep the native workflow only until
  the ARC App becomes required; WU 2 then disables it without opening an enforcement gap.

**Hosted Codex PR adapter**

- Default request transport is a developer-authenticated `@codex review` posted by the PR-opening agent immediately
  after ARC admission. Codex global automatic review is an optional repository mode when reviewing every PR is
  acceptable only under a separate qualification; this repository keeps it disabled for exclusive attribution.
  App-authored mention is explicitly unsupported by the live entitlement probe.
- Pin Codex App id `1144995` and bot user id `199175422`. Findings terminate through a standard submitted review and
  its review comments; require full `commit_id == requested head`.
- Clean terminates through an unedited App-authored issue comment. Resolve its displayed SHA prefix mechanically to
  one full repository commit and require equality with the request ledger's still-current frozen head. Reject an
  ambiguous prefix, edited comment, missing App/bot identity, or intervening head change.
- Semantic extraction is adapter-owned and versioned. A clean parser requires an anchored `Codex Review:` comment,
  the exact `Didn't find any major issues.` clause, and one `Reviewed commit` SHA marker; trailing presentation text
  is ignored. A known connected-account response may map to request-unavailable. Every other App comment or grammar
  drift is unknown/pending and can never become clean by absence of findings.
- The App-authenticated clean/findings loci are distinct and durable, but Codex does not resolve prior threads.
  Coordinator-owned settlement replies at the original thread and resolves it only after the applicable policy is
  met. Never claim Codex verified an individual fix merely because it later reported no major current-head issues.
- The connected-account failure parser is also versioned and correlated: require the pinned Codex App/bot, exact
  anchored response plus connector URL, creation after the reserved trigger comment and before any next-generation
  trigger, the same frozen head, and the recorded trigger actor/comment id. Only that earliest correlated response is
  terminal request-unavailable evidence, and only when the trigger window contains no competing `@codex review`.
  Stale, unrelated, changed, or contaminated prose remains unknown/pending.

Additional adapters remain provider modules behind the same contract. Do not evaluate Copilot, Grok, or API-billed
Codex unless hosted Codex fails the remaining qualification or capacity evidence makes another fallback necessary.

The versioned self-hosting policy owns deterministic order: `coderabbit-pr` first, `codex-pr` second. An enabled,
qualified hosted adapter with capacity `unknown` may receive one durably reserved request attempt because neither
provider exposes a reliable preflight quota lookup; explicit `exhausted` skips it, and a proven pre-effect rate-limit
rejection advances to the next entry. Authenticated CLI and qualified-human attestations are explicit repair paths,
never automatic fallbacks. Policy order and enabled qualifications change together under one semantics-version bump.

Fallback is automatic only after a proven pre-effect rejection/capacity exhaustion or an explicit terminal provider
failure, when no provider effect remains live. Record source supersession before selecting the qualified alternate.
An effect-ambiguous delivery, acknowledged silence, or ambiguous terminal artifact remains blocking and is never
blindly replayed or auto-fallen-back; explicit repair must first prove absence/cancellation or accept the consequences
under authorization. At most one source is live for a requirement generation.

### 4. Workflow behavior guards

Codify the following at the operation fire sites, including `coordinate-pr-review` and `integrate-work-unit`:

1. **Review-flight head freeze:** after acknowledgement/queue/running, no push until settlement or explicit
   supersession. A pre-push machine guard should enforce a live frozen-head record where practical.
2. **Conversation-locus disposition:** FIX lands before re-review; DEFER/REJECT replies directly to the original
   inline thread with repository-language rationale. Commit bodies and top-level PR comments are supplemental and
   never close a finding.
3. **Reader-language pass:** PR bodies, top-level comments, inline replies, and review summaries must be legible
   without methodology vocabulary. Translate internal work organization into ordinary change/follow-up language
   unless the PR substantively changes the named ARC concept itself.

### 5. Qualification matrix

Live-prove, on disposable exact heads, every adapter's request acknowledgement, clean/findings distinction, identity,
head binding, retrigger behavior, stale rejection, finding enumeration, settlement capability, timeout, capacity,
waiver/dismissal, fallback selection, event routing, repair, and lifecycle-tail behavior. Also prove:

- pending projection exists before provider completion and remains merge-blocking through latency;
- review, review-comment, status, and issue-comment events reconcile qualified provider loci without loops or
  duplicate generations; coordinator-owned thread settlement explicitly dispatches reconciliation;
- the watcher wakes on aggregate state changes and cannot miss a provider outcome merely because it used another
  native GitHub surface;
- a protected direct-mint qualification job forces stateless and classic tokens through the exact controller consumer;
  the pinned Action is source-audited/ordinarily run as an opaque producer, and the override is then absent;
- selected App repository scope is exactly `andrewRCr/arc-framework`, with no contents write or merge authority;
- missing or ambiguous evidence fails closed per head without unnecessarily disabling an otherwise useful provider.
- direct provider commands contaminate their generation and cannot be attributed to the reserved request; a later
  owned generation begins only after the unowned effect is terminal;
- a generic GitHub approval count is not represented as human governance because App/bot approvals can satisfy it;
  WU 2 either removes that count or replaces it with a genuinely human-constrained rule.

## WU 1 completion boundary

The delivery PR ships the request ledger, pending-first projection, watcher, CodeRabbit and hosted-Codex adapters with
explicit capability/qualification outcomes, fallback selection, the independent Actions `review-repair-ok` emergency
workflow, workflow behavior guards, tests, and the updated runbook. It keeps project
`post-pr-open` and `pre-merge` hooks inactive and does not mutate required-check authority. After merge, manually run
the authentication, token, provider, pending-gap, watcher, and settlement matrix through the shipped default-branch
controller. Legacy CI `merge-ok` remains required throughout.

Retain raw non-secret probe data in the private operator checkpoint store. Commit only a sanitized manifest of ids,
URLs, heads, timestamps, dispositions, enforcement summaries, and hashes; never store credentials, tokens, secret
values, or private-key material.

Completion evidence includes the final App installation/authentication proof, the provider capability table, both
token formats, pending-gap proof, watcher wake-up proof, conversation-settlement proof, behavioral workflow tests, a
source-pinned `review-repair-ok` outage rehearsal while the App remains non-required, a merged one-PR delivery, the
successful post-merge acceptance tail, and the exact handoff contract consumed by
`review-gate-enforcement-promotion`.

---

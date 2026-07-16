# Draft: review-architecture — coherent end-to-end review system

- **Origin:** [internal] — rescoped in place from `review-method-family` (2026-07-16); full lineage in
  § Provenance.
- **Purpose:** One holistic pass over every review surface ARC carries — local preflight, external code review
  (CLI and PR channels), finding triage and response, the review-gate's enforcement boundary, and the
  config/method/extension containers that hold them — partitioned once by an explicit layer model, with review
  spend metered by change weight. Replaces piecemeal patching of individual review surfaces, which is how the
  current incoherence accumulated.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

[none pending — the seven pre-rescope entries were integrated or dispositioned at the 2026-07-16 grooming;
ledger in § Provenance.]

## Problem / Motivation

Three strands, in the order they surfaced:

**The original method-family diagnosis (2026-04, carried forward).** `integrate-work-unit` Step 8 inlines
too-thin review-response guidance and assumes every PR receives review; `diff-review` conflates its
classification utility with self-review activity and its name reads as generic code review; there is no shipped
home for reviewing someone else's PR (peer review) or for the full respond-to-findings cycle — this project's
`address-pr-review.md` / `coordinate-pr-review.md` carry that ad hoc, project-locally.

**The parallelism forcing function (2026-07, wave-3 burn-in).** Multi-WU + errand parallelism saturated both
external review budgets within days — the GitHub Actions budget drained weeks early, and CodeRabbit's adaptive
fair-usage throttle engaged (95th-percentile identity; Pro degrades to 1 PR review/hour at 60+ reviews/week).
Key economics: CodeRabbit meters PR, IDE, and CLI reviews as **separate hourly pools**, and the adaptive
throttle tracks **PR reviews specifically** — so review _channel_ selection is a real lever, and unmetered
"every code PR gets full PR review, iterate until quiet" is not sustainable at parallel volume. Evidence:
`notes-finalize-parallelism.md` § Day-2 evidence. Supply-side fixes (tier upgrades) buy ~1.5× headroom and were
judged insufficient alone; the durable fix is demand-side metering — review depth and channel scaled to change
weight.

**The systemic incoherence (2026-07-16 audit).** The same review boundary is served by four container kinds
with no stated division of labor, and each past patch picked whichever container was nearest:

- `review.pre_merge` (config) gates a step that fires **pre-PR** — its own comment says "before pushing" — a
  misnamed boundary, and a config-gated built-in step whose relationship to the extension family is undefined.
- The finding-disposition approval guard (triage findings, verify, present to the user _before_ fixes land)
  exists only in the project-local `coordinate-pr-review.md`, PR-channel only — the shipped `review-triage`
  contract requires explicit dispositions but records them in the _commit message_, i.e. after acting. Local
  reviews and any adopter without the project workflow inherit the observed agent failure mode: accept findings
  and act without a user checkpoint.
- The fire-point extension family mixes naming conventions (`pre-commit-review` / `pre-push-review` carry an
  action suffix; `pre-pr-open` / `post-pr-open` / `pre-merge` are lifecycle-named), and `integrate-work-unit`
  gives `pre-push-review` a full callout twice while `pre-pr-open` gets an inline mention.
- `pre-merge` implies a guarantee agent-side hooks structurally cannot give — a manual host-UI merge bypasses
  every agent fire point. The actual merge-boundary guarantee is the host-side review-gate required check, and
  that division is documented nowhere.

## Charter

Inventory → layer model → re-partition. Every surface below gets an explicit target layer; nothing is patched
in place without a layer assignment.

| Surface                                                      | Today                                         | Problem                                                            |
|--------------------------------------------------------------|-----------------------------------------------|--------------------------------------------------------------------|
| `review-triage` (method)                                     | shipped; disposition contract                 | missing verify-against-source + pre-fix user-approval legs         |
| `diff-review` (method)                                       | shipped; gated by `review.pre_merge`          | misnamed (reads as code review); is the local-lane activity socket |
| `review.pre_merge` (config)                                  | gates `integrate-work-unit` Step 2            | fires pre-PR; misnamed boundary; container role undefined          |
| extension family (`pre-commit-review` … `pre-merge`)         | shipped, mostly inactive                      | mixed naming; inconsistent callouts; `pre-merge` overpromises      |
| `coordinate-pr-review.md` / `address-pr-review.md` (project) | project-local workflows                       | carry shipped-worthy invariants (approval guard, typed await loop) |
| review-gate (App, scripts, three pending WUs)                | shipping separately                           | needs a lane vocabulary as trigger policy; must not mint its own   |
| CI classify lane/weight (`scripts/classify-change.sh`)       | shipped, CI-side                              | proves the classification pattern; reusable as local lane input    |
| external-review trigger (manual `@coderabbitai review`)      | interim instruction in `address-pr-review.md` | the metering decision point, uncodified                            |

## Layer model — the doctrine

Five layers, each with one role. The re-partition rule: **policy that generalizes ships as a method; tool
bindings and host mechanics stay in the project/adapter layers; config never carries instructions.**

1. **Shipped method contract** — the invariants (the blockquote contract). Binds overrides: an override must
   satisfy the same invariant. This is where behavioral guards live so no project override can delete them.
2. **Shipped method default** — the default policy prose. Overridable: `replace`, or additive via
   `override-mode: augment` (rename of today's `extend`, see § Renames) — base contract stands, project layers
   "use THIS tool, with THIS policy" on top.
3. **Config knob** — toggles and enums only (`review.*`). Cheap on/off and lane selection; never prose, never
   invocation instructions (those need a method/override — provider bindings differ in invocation, triage
   approach, and caveats).
4. **Host adapter / coordinator** — channel mechanics: thread etiquette, await loops, provider trigger
   commands. Host-neutral skeleton ships; host specifics (GitHub threads, GitLab discussions) are adapter
   content; this repo's CodeRabbit specifics stay project-side.
5. **Project layer** — augment-overrides and extension `.actions`: genuinely project-arbitrary additions at
   lifecycle fire points.

## Proposed shape

### 1. `review-routing` method (new) — the lane vocabulary and metering policy

- **Lanes (working enum):** `none / local-only / local+pr / pr-only`. Final shape open (§ Unknowns).
- **Decision inputs:** change kind (docs vs code — the CI classifier's signals, reusable locally), diff scale,
  WU `Class`, work character (errand vs WU). Docs-only → `none`; light code (typical errands) → `local-only`
  frontline with PR review on demand; substantive code → `local+pr`; `Heavy`/`Novel` → full treatment.
- **Retrigger budget:** the _whether_ of another review round lives here — incremental re-reviews per round,
  full-pass reserved for the final pre-merge round; each retrigger spends PR quota _and_ re-runs heavy CI.
- **Explicitly not an erosion of the engineering bar.** `quality-gate-commands` is `Class`-invariant because it
  guards the bar; review _routing_ scales the **channel** that satisfies the bar, never the bar itself. The
  method states this contrast so the family reads coherently.
- Records the metering economics (separate pools, PR-specific adaptive throttle) as rationale.

### 2. Directional method family (carried from the pre-rescope draft — settled)

- `self-review` — rename of `diff-review`; content carries forward. The existing contract already anticipates
  the socket: "invokes no external review provider by default" — the local lane's activity.
- `peer-review` — new; reviewing someone else's pending changes. Default content and placement open.
- `review-response` — new; the respond-to-received-findings cycle, replacing Step 8's inline content.
- `review-triage` — unchanged position: source-agnostic classifier all three call.
- Reading test: `self-review` (own work) / `peer-review` (others' work) / `review-response` (received feedback)
  / `review-triage` (classify). Independent passes consume `adversarial-review`'s fresh-subagent primitive
  rather than reinventing invocation mechanics.

### 3. `review-triage` contract upgrade — the disposition invariant

Upgrade the contract block (override-proof) to three legs:

1. every finding gets an explicit, documented disposition (already present);
2. findings are **verified against source with the agent's own judgment** — never accepted on reviewer
   authority (anchors to DEV-RULES.ARC § Sub-agent scope: delegated outputs are advisory until verified);
3. the disposition set is **presented to the user for approval before fixes land** — classification,
   recommendation, and open questions surfaced as a report, so the user can redirect before any commit.

The procedure (four-way taxonomy, report format, commit-message record) stays in `.default`, overridable.
Open: whether a one-line DEV-RULES.ARC anchor also ships (the failure mode is behavioral and high-miss-cost;
constraints-never-on-demand argues for it).

### 4. Disposition etiquette — the channel split

- **Method (channel-neutral principles):** every finding's fate is recorded _where its audience can see it_;
  closure is explicit; never emit noise surfaces nobody reads.
- **Adapter/coordinator (host mechanics):** for GitHub — reject/defer dispositions reply in-thread when the
  finding has its own comment; findings without a dedicated comment get no response (no rollup-comment noise);
  threads are resolved when no further round is coming; when a round _is_ being triggered, the reviewer gets
  the chance to resolve first. Local reviews have no response surface — the disposition report is the record.
  `coordinate-pr-review`'s existing controller-normalized-findings vs provider-native-conversations split (with
  distinct closure authority) is the frame these rules slot into.
- **Routing method:** whether a retrigger is worth spending (§ 1).

### 5. Renames and family coherence

- `review.pre_merge` → `review.pre_pr` — or fold into the routing config key; shape open. The boundary it
  actually gates is pre-PR.
- `diff-review` → `self-review` — settled pre-rescope; carries forward.
- `override-mode: extend` → `override-mode: augment` — `extend` collides with the Extensions mechanism in the
  same frontmatter neighborhood. One live usage (`testing-standards`) + methods README + DEV-RULES.ARC, both
  copies; cheap now, costlier every release.
- Fire-point family naming (`pre-push-review`, `pre-commit-review` vs lifecycle-named peers): **engage** the
  Work Organization Reform naming lock (its R55–R57 settled lifecycle-named hooks) rather than rename past
  recorded rationale — settle family-wide whether the `-review` suffix carries meaning or drops, and reconcile
  `integrate-work-unit`'s inconsistent fire-point callouts in the same pass.

### 6. Enforcement division — documented honestly

Agent-side extensions are workflow ergonomics, best-effort by construction; the host-side review-gate required
check is the guarantee (it fires regardless of who presses merge — manual host-UI merges bypass every agent
hook). State this in the extension-family docs so `pre-merge` stops implying what it cannot deliver.

### 7. Coordinator graduation

Decide how much of `coordinate-pr-review.md` / `address-pr-review.md` graduates into a shipped host-neutral
skeleton + host adapter. The workflow-pointer `.override` variant (settled pre-rescope: an override may point
at `system/workflows/project/{name}.md` instead of inline content) is the mechanism; the interim manual-trigger
instruction in `address-pr-review.md` is subsumed by the routing method + trigger policy when this ships.

## Cross-cutting

- **Review-gate WUs consume the lane vocabulary.** `review-gate-enforcement-qualification` / `-promotion` /
  `review-gate-github-adapter` read the lane enum as trigger policy ("don't request a PR review the lane says
  not to spend") rather than minting a parallel classification. Reciprocal `USER-INBOX` capture filed
  2026-07-16. `spec-reviewed-lane-review-gate.md` already routes its proven decision/evidence vocabulary and
  hook/action split here — consume, don't fork.
- **Knowledge-architecture forward-compat.** This WU touches method/extension semantics directly (the `augment`
  rename, the workflow-pointer override variant). Check `strategy-knowledge-evolution.md` and
  `draft-knowledge-architecture.md` at spec time — fire-site declarations generalizing the methods mechanism is
  the north star; prefer shapes that declare at point of use.
- **Interim relief errand (2026-07).** A project-local `pre-pr-open` wiring errand ships the CLI-frontline
  interim (classify-gated CodeRabbit CLI review + disposition guard in the action text). This WU subsumes it:
  the shipped routing method + `self-review` socket replace the interim action.
- **`customization-arch-realign` coupling (carried).** That draft depends on this WU for the
  `review.pre_merge → diff-review.active`-style migration questions and the diff-review/review-triage reshape;
  its references were updated at the rescope. Coordinate at spec time.

## Alternatives

Carried from the pre-rescope draft (all still standing):

- **Promote `address-pr-review` to a top-level method** — rejected; name collided semantically with
  `review-triage`, missed the symmetric `peer-review` need.
- **Leave Step 8 inline; projects extend the workflow directly** — rejected; inline-only override forces
  out-of-tree workflow duplication.
- **Merge `self-review` + `peer-review` into one parameterized method** — rejected; peer review carries
  comment-posting/discussion semantics self-review lacks.

New at the rescope:

- **Fresh WU superseding `review-method-family`** — rejected in favor of rescope-in-place: the inbound buffer
  was live (entries through 2026-07-13, two of them earlier captures of the same metering problem), and a
  supersession ceremony would orphan routed captures for no design gain.
- **Supply-side remediation (CodeRabbit Pro+, additional providers) as the primary fix** — rejected as sole
  remediation: ~1.5× weekly headroom against unbounded parallel volume. Complementary providers remain an
  option _within_ lanes once metering exists.

## Unknowns and Assumptions

Carried (PRD-time):

- `peer-review` default content — sensible framework default across host protocols; worth research.
- `peer-review` entry workflow placement — framework-shipped vs adopter-templated.
- Extension fire cardinality at Step 9 final-state verification (one-fire-point-each vs override-internal).
- Precedence when an `.override` declares both inline content and a workflow-pointer (working assumption:
  pointer wins).

New at the rescope:

- Final lane enum shape and the config key that selects/overrides lanes (`review.routing`? absorb
  `review.pre_merge`?).
- Whether the disposition invariant also gets a DEV-RULES.ARC anchor line (lean: yes — behavioral,
  high-miss-cost).
- Fire-point family naming outcome after engaging the WOR lock.
- Gate consumption mechanics — how the review-gate reads the lane (computed classify signal, PR label, config)
  without turning a project tool into framework policy.
- Assumption to validate: the CI classifier's weight/lane logic is cleanly reusable as a local lane input
  (it runs from a git diff today; the verified-tree lookback is CI-only).

## Scope Estimate

**Medium-Large; `Class: Heavy`** (derivation — the layer model and lane design are real design; confirmed at
the 2026-07-16 grooming read, consistent with the recorded value). File ripple is wide (methods × both copies,
extension docs, `integrate-work-unit`, config, strategy docs, project workflows) but individually small; the
heavy part is the design, most of which is now settled here. Not started under the FP-first freeze —
groomed-to-state and parked; start is a post-FP scheduling decision.

**Cohort fit (2026-07-16 read):** stays one WU — one coherent concern (the layer model) re-partitioning one
surface family; the pieces are coupled by the shared doctrine, not orthogonal subsystems. Re-confirm at spec
time; `peer-review` (method + entry workflow) is the natural split candidate if the surface proves too wide.

## Readiness

**State: maturing** — scope known; fundamentals settled at the 2026-07-16 rescope grooming; open items are
detail-design (§ Unknowns), not direction.

- **Resolved:** holistic charter + layer model; lane vocabulary direction + metering economics; disposition
  invariant and its contract placement; etiquette channel split; the rename set; enforcement division;
  rescope-in-place disposition.
- **Open:** the § Unknowns list — none of it blocks spec entry except the lane enum + config key shape and the
  WOR naming engagement, which should settle first.
- **Next:** settle lane enum + config key shape; run the WOR naming engagement; then `assess-draft-readiness`
  toward create-spec.

## Provenance

Surfaced during interlock-foundation integration (PR #23 prep, 2026-04) as the Step 8 / review-method reshape;
graduated from `ATOMIC-INBOX.md` 2026-04-30. Scope reshaped during PR #23 review cycle 2 (directional family).
**Rescoped in place and renamed from `review-method-family` 2026-07-16**, after wave-3 parallelism burn-in
(`finalize-parallelism`) saturated external review/CI budgets and a design session settled the holistic
charter; grooming ran warm from that session.

Buffer disposition ledger (2026-07-16 rescope; entries integrated into the body above or already departed):

- _Reviewed-lane gate contract consumption_ (routed 2026-07-13) → integrated: § Cross-cutting (gate consumes
  the lane vocabulary; decision/evidence contracts consumed, not forked).
- _Reconcile charter with documented `MINOR FIX`_ (routed 2026-07-13) → integrated: body now written against
  the shipped four-way taxonomy; § 3 upgrades the contract without reintroducing `SILENT FIX`.
- _Consume `adversarial-review`'s fresh-subagent primitive_ (routed 2026-07-03) → integrated: § 2 wires the
  review directions onto the shipped invocation contract; the old `design-audit` buffer item stays departed.
- _PR body surfaces non-internal `Origin`_ (routed 2026-06-06) → integrated: § 7 coordinator graduation scope
  (PR-body composition decides what hoists from the meta).
- _Post-PR-open external-review trigger extension_ (routed 2026-06-08/21, interim noted 2026-06-24/07-10) →
  integrated: § 1 routing method + trigger policy own the decision; the `address-pr-review.md` interim
  instruction is subsumed at ship (§ 7); the errand-vs-WU cut becomes lane input rather than a special case.
- _Content/lane-gate review extensions for doc-only ceremonies_ (routed 2026-06-10, evidence 2026-07-10) →
  integrated: § 1 — the generic lane signal is the routing method; extension fire-sites gate on it.
- _`arc-design-audit` → departed to `adversarial-review`_ (2026-07-01) → unchanged: departed record stands;
  this WU is a consumer.

---

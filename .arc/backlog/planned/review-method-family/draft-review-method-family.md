# Draft: Review Method Family Reshape

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Consume `adversarial-review`'s fresh-subagent primitive**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: review-method-family`), housekeep drain (2026-07-03);
  captured during `adversarial-review` task generation.
- _Concern:_ `adversarial-review` now owns the fresh-subagent adversarial-review mechanism and the `design-audit`
  method. This WU should consume that primitive for its review-direction reshape rather than reinvent it.
- _Fold-in:_ wire RMF's self / peer / response review directions onto the shipped invocation contract, and drop
  the old `design-audit` / `arc-design-audit` buffer item as departed.

### `[ ]` **PR body orientation should surface non-internal `Origin`**

- _Routed from:_ `USER-INBOX § Backlog`, housekeep drain (2026-06-06); captured during
  `class-model-foundation` Phase 2 planning.
- _Concern:_ PR-body orientation points at `Design`, but when a WU carries a real external `Origin`, that provenance
  is also review-relevant. Surface `Origin` next to `Design` when it is non-internal, and use the pass to decide
  what the PR body should hoist from the meta versus leave in the meta.

### `[ ]` **Post-PR-open external-review _trigger_ extension (capture parts 2+3 shipped via errand)**

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: review-method-family`), housekeep drain (2026-06-08);
  captured at `scalable-authoring-pipeline` PR #67 review cycle. Parts 2+3 of the original capture
  (retry-round recommendation + body-comment/outside-diff handling in `address-pr-review.md`) were carved off
  and delivered as a standalone errand at this drain; only the trigger-extension part remains here.
- _Concern:_ In the manual-trigger review shape, after opening a WU PR the agent should ask whether to trigger
  an external AI review (rather than relying on automatic review). This is a new fire point, distinct from
  the pre-PR self-review method.
- _Proposed:_ Add an inactive-by-default extension around the post-PR-open trigger point (or nearest clean
  pre-review-response point), applying only to **work-unit** PRs, not Errand PRs. In this project it would ask
  the user whether to post `@coderabbitai review`; on approval, post the comment and wait for user signal without
  polling.
- _Relationship:_ this WU already owns `review-response` / `address-pr-review` integration; this adds the
  missing _trigger_ decision around that cycle. Touches the extension family + `integrate-work-unit.md` fire
  point (point-scanner CHECK 16) + the project `address-pr-review.md` override.
- _Merged in (housekeep drain 2026-06-21; from errand-lattice integration, PR #116 review step, 2026-06-21):_ a
  second capture of this same seam — adds three points. **(1)** The driver: CodeRabbit's GitHub-app auto-review
  would fire on _every_ PR including Errand PRs (which can cover anything, so CodeRabbit's own path/branch filters
  can't cleanly express the errand cut) — hence a managed trigger rather than the app's own filters. **(2)** Wire
  the extension's project-instance behavior as: confirm-with-recommendation → post `@coderabbitai review` → **then
  load `address-pr-review`** to process the findings (the existing entry stops at "post + wait"). **(3)** Distinct
  from content/lane gating of the broader review ceremony; this is the CodeRabbit-app-side auto-trigger plus the
  `post-pr-open` ARC seam that manages it. Confirms `review-method-family` as the shared home.
- _Interim (housekeep drain 2026-06-24):_ until this extension ships, the project workflow
  `address-pr-review.md` carries the manual-trigger instruction directly — CR is manual-trigger on this
  repo, so the initial review and each post-push re-review are requested via `@coderabbitai review`. When
  the trigger extension lands it owns that decision; remove/subsume the interim instruction from
  `address-pr-review.md` at that point.
- _Operational split (housekeep drain 2026-07-10):_ keep the repo's long-standing manual-trigger posture —
  `auto_review` remains disabled and `address-pr-review.md` remains the interim entry. A standalone
  repo-internal Errand owns restoring CodeRabbit's visible in-progress/failing review surface after that check
  disappeared; it does not pre-empt this WU's post-PR-open extension design.

### `[ ]` **Content/lane-gate review extensions for doc-only lifecycle ceremonies**

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: review-method-family`), housekeep drain (2026-06-10);
  captured during `decomposition-machinery` Task 4.1 while authoring the `decompose-work-unit` park PR step.
- _Concern:_ the code-review extension family (`pre-push-review` / `post-pr-open` / `pre-merge`, and the broader ceremony)
  fires on push / PR fire-points regardless of whether the change carries a code diff. Some ARC lifecycle
  ceremonies produce doc- or planning-artifact-only PRs; the new `decompose-work-unit.md` park PR is the live
  instance because it carries the `#pre-push-review` marker, mirroring `integrate` / `init`.
- _Scope:_ decide whether review extensions should key on change kind at their fire-point, and if so whether the
  gating belongs in the extension contract, the fire-site, or a review-method abstraction. Coordinate with
  `rules-restructure`'s extension-definition breadth and the auto-merge-lane "no human review" classification.
- _2026-07-10 evidence:_ this repo's CI already computes a generic `reviewed | auto` lane, while CodeRabbit's
  GitHub check stopped appearing even on manually-triggered passes. The repo-local recovery is being pulled
  forward, but the reusable ARC question remains here: how a post-PR review extension consumes a generic lane
  signal and holds integration while its review is active, without turning a project-specific tool into
  framework policy.

### `[ ]` **`arc-design-audit` → departed to `adversarial-review` (2026-07-01 drain)**

- _Disposition:_ design-**validation** (efficacy + fit) is the draft/spec **rubric** the fresh-subagent
  adversarial mechanism runs, so it re-homed to `adversarial-review` at the 2026-07-01 housekeep drain. Framings
  preserved there: it is the missing **destination** for `spec-review`'s "this reopens design" pointer, one rung
  above `arc-task-audit` (intent → artifact → tasks → code); a **read-only, standalone + optional** audit
  (efficacy = does the design solve the goal; fit = optimal + forward-compat, not merely non-conflicting),
  floored at a finished draft and point-agnostic above (draft / spec / post-task-gen / mid-impl).
- _Seam:_ `review-method-family` becomes a **consumer** of `adversarial-review`'s fresh-subagent primitive rather
  than the owner of this audit.

## Problem / Motivation

Two issues are entwined in the current review-related surface, both surfaced during interlock-foundation
integration (PR #23):

**Step 8 inlines too-thin guidance and assumes PR review always happens.** `integrate-work-unit.md` Step 8
(Address PR Review Findings) inlines generic guidance pointing at `review-triage` for classification —
accurate for the bare-classification case but missing the richer end-to-end response cycle some projects
want (this project's `address-pr-review.md` — fetch threads via gh
api → triage → fix-now commits → reply-and-resolve for defer/reject → completion-doc check → push →
final-state verification). The workflow also assumes every PR receives review feedback the agent should
act on — not always true (solo dev, low-stakes change, or human-handled review where the agent should
stay out).

**The current `diff-review` / `review-triage` pair conflates classification utility with self-review
activity.** `review-triage` is correctly source-agnostic (its frontmatter says "any code review —
self-review, AI tool, human reviewer"); `diff-review` is a local self-review activity that uses it. But
there's no symmetric place for two adjacent needs the framework should support: reviewing **someone
else's** pending changes (peer review of an external PR) and **responding to** received review feedback.
Today both fall into Step 8's inline content or sit unsupported.

**Why now:** the review-method family is a small enough surface to reshape cleanly before more workflows
accrete dependencies on the current shape. The inline-content gap also blocks a clean home for
`address-pr-review` (currently parked in `workflows/project/` with no extension contract binding it to
Step 8).

## Proposed Shape

Reshape the review surface so the position of "review" in each method name denotes direction, with no
"is this the one that..." ambiguity from the name alone.

### Methods (activity contracts)

- `review-triage` — unchanged. Classification scheme (fix-now / defer / reject / silent-fix).
  Source-agnostic; called by all three activities below.
- `self-review` — rename from `diff-review`. Agent reviews its own pending changes (current
  `diff-review.default` content carries forward). The `diff-` prefix was an implementation detail;
  `self-` is the actual semantic.
- `peer-review` — new. Agent reviews someone else's pending changes (external PR). Default: review the
  diff like self-review, post findings as comments, classify per `review-triage`.
- `review-response` — new. Agent responds to received review feedback. Default = current Step 8 inline
  content (classify via `review-triage`, fix-now commits, T1, `(code review)` footer).

Reading test: `self-review` (own work) / `peer-review` (others' work) / `review-response` (received
feedback) / `review-triage` (classify). Each name unambiguous in isolation.

### Extensions (lifecycle fire points)

Extension fire-point naming and the broader fire-point family are locked by Work Organization Reform
(WOR) — see `prd-work-organization-reform.md` R55–R57. This plan retains scope over **method** naming
and content (the WHAT side); the WHEN side is WOR territory. The former action-named pre-PR review extension was
removed in favor of lifecycle-named `pre-pr-open` and `post-pr-open` hooks. The final hook is `pre-merge`, named
for its genuine lifecycle event rather than an installed review action.

Lifecycle family around review coordination at `integrate-work-unit.md`:

- `pre-pr-open` and `post-pr-open` — bracket change-request creation and open-request entry without installing a
  review action. The local aggregate self-review remains a method invocation before PR creation.
- `review-response` (this plan; new) — fires at `integrate-work-unit` Step 8. **Default: not
  configured.** Projects that get PR review configure it; projects that don't (or handle review
  manually) leave it unconfigured and Step 8 no-ops.
- `pre-merge` — fires after `review-response`
  processes received feedback, before the actual merge action. **Default: not configured.**
  Reserved for final-state-check use cases (all threads resolved, CI green, last review pass).

### Workflows

- New top-level workflow for peer-review entry — projects don't enter `peer-review` through
  `integrate-work-unit` (it's not in their own work's lifecycle). Likely `review-pr.md` or similar;
  invokes `peer-review` method.
- This project's existing `workflows/project/address-pr-review.md` becomes the workflow-pointer override
  for `review-response`.

### Override mechanic extension

Extend `.override` shape so it may be inline content (today's pattern) OR a workflow-pointer
(`system/workflows/project/{name}.md`) when the override warrants its own structured workflow. Both
forms remain valid; the workflow-pointer variant is the clean path for projects whose review-response
flow involves multi-step tool-specific cycles (gh API, GitLab discussions, Gerrit patchsets).

## Scenario Coverage at Step 8

No "let user resolve" sentinel needed — the integration-interlock ([ADR-016][adr-016]) provides
structural safety:

| Scenario                          | Extension state                          | Behavior                                                |
|-----------------------------------|------------------------------------------|---------------------------------------------------------|
| No PR review (solo, low-stakes)   | unconfigured                             | Step 8 no-ops; Step 9 prompts human; human merges       |
| Review handled by agent           | configured (workflow-pointer override)   | Runs cycle + final-state verify                         |
| Review handled by human           | unconfigured                             | Step 8 no-ops; human resolves threads before merge      |

The agent never autonomously merges. If unresolved threads exist at Step 9, the human sees them at the
merge prompt and acts. Final-state verification (zero unresolved threads) lives inside the override
workflow when configured — that's where tool-specific knowledge belongs anyway.

## Alternatives

- **Promote `address-pr-review` to a top-level method (original framing).** Initially proposed in the
  inbox entry. Rejected during PR #23 review-cycle 2 — the name `address-pr-review` collided
  semantically with `review-triage` (both sounded like "the one that handles reviews") and missed the
  symmetric `peer-review` need entirely. Reshape gives the family directional clarity.
- **Leave Step 8 as inline content; let projects extend the workflow directly.** Current state.
  Rejected because inline-only override doesn't accommodate workflow-pointer overrides cleanly —
  projects with rich review flows end up duplicating workflow shape or maintaining out-of-tree workflow
  files with no extension contract. The workflow-pointer override variant is the clean path.
- **Combine `self-review` and `peer-review` into one method with a `subject: own | other` parameter.**
  Considered briefly. Rejected because the activities differ in more than subject — peer-review
  involves comment-posting / discussion semantics that self-review doesn't. Separate methods are
  cleaner contracts even if their default contents share structure.

## Unknowns and Assumptions

**Open design questions for PRD-time resolution:**

- `peer-review` method default content — what's a sensible framework default for "review someone else's
  PR"? Common protocols vary (GitHub line-comments, GitLab discussions, Gerrit patchsets); worth
  research.
- `peer-review` workflow placement — framework-shipped (`system/workflows/arc/`) vs adopter-templated
  (`workflows/project/`). Depends on how prescriptive ARC wants to be about peer-review protocol.
- Whether the `review-response` extension's `.actions` should also fire at `integrate-work-unit` Step 9
  for final-state verification, or whether keeping extensions one-fire-point-each (current lean) and
  letting the override workflow handle Step 9 verification internally is cleaner.
- Precedence rule when both inline content and a workflow-pointer are declared on the same `.override`.
  Working assumption: workflow-pointer wins if present; PRD codifies.

**Assumptions to validate during PRD:**

- Renaming `diff-review` → `self-review` is a clean find/replace across the codebase with no semantic
  gotchas. Cross-reference sweep listed in § Scope below — greppable.
- The override-mechanic extension doesn't introduce ambiguity for adopters reading existing
  `strategy-configurability-architecture.md` examples; minor doc cascade may be needed beyond the
  strategy edit listed in § Scope.

## Scope Estimate

**Small standalone WU.** Naming surface ripples across multiple files but each ripple is small. Not
atomic because design decisions (naming, override-mechanic shape, peer-review default content) warrant
a plan doc and PRD.

### File-level scope

- `system/methods/`: rename `diff-review.md` → `self-review.md` (content carries forward); new
  `peer-review.md`; new `review-response.md`. Both copies (package source + project instance).
- `system/extensions/`: new `review-response.md` extension shell. The surrounding family already provides
  `pre-pr-open.md` / `post-pr-open.md` around change-request entry and `pre-merge.md` after review response, so this
  plan adds the review-response activity at `integrate-work-unit` without restoring the removed action-named hook.
- `system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md`: Step 6 invocation reference
  (`diff-review` → `self-review`); Step 8 collapses inline content into extension fire point
  (`#review-response`).
- New `system/workflows/{arc,project}/review-pr.md` (or chosen name) for peer-review entry. Placement
  decision needed (see Unknowns).
- `reference/strategies/arc/strategy-configurability-architecture.md`: document the workflow-pointer
  override variant.
- This project's local config: hook `review-response` extension to point at
  `workflows/project/address-pr-review.md`.
- Cross-reference sweep: every `diff-review` reference across docs / strategies / workflows / templates
  renames to `self-review`. Greppable.

### Dependencies

- **No upstream blocker** — independent of Interlock Foundation and Session-Operational Flow. Can land
  any time after Interlock Foundation is integrated (already done).
- **Light coupling to extension surface design** — uses the existing extension fire-point pattern; the
  only new mechanic is the workflow-pointer variant of `.override`.

### Provenance

Originally surfaced during Interlock Foundation integration handoff (PR #23 prep) when noticing Step
8's inline content didn't match this project's actual gh-api-driven response flow. Scope expanded
during PR #23 review cycle 2 — the `address-pr-review` method name proposed in the original inbox
entry was found to collide semantically with `review-triage` and to miss the symmetric `peer-review`
need entirely. Design discussion reshaped the proposal from "promote Step 8" to "reshape the review
surface family." Graduated from `ATOMIC-INBOX.md` to plan-doc on 2026-04-30.

---

[adr-016]: ../../../reference/adr/adr-016-configurable-autonomy-interlocks-for-session-operations.md

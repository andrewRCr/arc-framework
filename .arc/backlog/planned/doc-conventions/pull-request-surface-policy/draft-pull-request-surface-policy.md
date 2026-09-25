# Draft: Pull-Request Surface Policy

- **Origin:** `USER-INBOX § Errand`, housekeep drain (2026-08-20).
- **Cohort:** `doc-conventions`
- **Purpose:** Define pull-request title and local-review marker conventions from their actual reviewer and history
  roles rather than from incidental workflow proxies.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Generate the host-side pull-request template from the canonical template**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-09-07); captured during
  `delivery-native-stack-composition` dogfooding.
- _Concern:_ repository-host PR creation still permits an empty or divergent description when the contributor does
  not enter through an ARC workflow. Establish a generated host template from the canonical ARC template so the
  ordinary host surface carries the same reviewer contract without becoming a second hand-maintained authority.
- _Fold-in:_ settle generation and drift enforcement with this WU's broader PR-surface policy, including the lean
  Errand and grooming-PR exceptions.

### `[ ]` **Settle whether pull-request titles carry Conventional Commits syntax at all**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-09-19).

- `WU_Target: pull-request-surface-policy`

- _Observation:_ the template's flat rule "PR titles follow ARC's commit-format method (Conventional Commits)"
  (`template-pull-request.md` § PR Title Format) states a requirement that this repository's own tooling cannot
  consume, and that the same file already contradicts twenty lines later. External grounding, gathered 2026-09-18:

    - The Conventional Commits spec is **commit-scoped**; it says nothing about pull-request titles.

    - Every PR-title linter (`amannn/action-semantic-pull-request`, commitlint PR-title recipes, semantic-release
      integrations) justifies itself by squash-merge promoting the PR title into the commit subject, plus
      changelog/release automation downstream of that. The enforcement is a **squash artifact**, not a principle.

    - Angular — which originated the convention — enforces on **commits**. So do Node, Kubernetes, Rust, React,
      VS Code, and TypeScript, or they impose no title rule at all. Vite and Deno are the exceptions and are
      changelog-driven, i.e. the squash case again.

    - No stacked-diff tool (Graphite, ghstack, Sapling, spr, git-town, GitHub native) writes stack position into a
      title; all carry it in the body, a bot comment, or UI chrome. Where position does live in a subject — the
      Linux kernel's `[PATCH vN i/M]` — it is safe only because every reroll regenerates the whole series.

- _Local evidence:_ `allow_squash_merge: false`, `merge_commit_title: MERGE_MESSAGE` (so the PR title is never a
  commit subject), `merge_commit_message: PR_TITLE` (it becomes the merge-commit body), no CI title check, no
  title-parsing tooling, and `commit-msg:19` exempts the one commit whose body carries the title. Practice across
  the last 40 merged PRs is roughly 50/50 Conventional Commits versus prose, with #644-#648 all prose.

- _Approach:_ decide the rule **per merge strategy** rather than flatly. Conventional Commits on a PR title is
  load-bearing exactly when a merge mode promotes or parses it, which is an adopter-configuration question
  (`merge.strategy`), not a universal one. `template-pull-request.md:38` already reasons this way for brackets; the
  § PR Title Format opening line is the imprecise surface. Keep the audience boundary in view: the answer for
  arc-framework-the-repo (inert) may differ from ARC-the-framework (load-bearing under squash).

- _Also:_ two defects found while scoping `delivery-request-identity`, both left unfixed there as out of scope:

    - `template-pull-request.md` § PR Title Format opens with a flat Conventional Commits requirement that the
      same file's "Merge-strategy note" (line 38) already makes conditional on merge mode.

    - `deliver-stack.md` states that "an exact existing request is adopted unchanged", while
      `reconcile` / `teardown-member` changes a delivery's member count. A non-terminal request's `[n/N]` position
      can therefore go stale against the plan. Pre-existing; `delivery-request-identity` inherits it without
      widening it.

    - `SLUG_PATTERN` (`kernel/schema/slug.ts:8`) admits a leading digit; ARC's own `SCOPE_PATTERN`
      (`commit-check/policy.ts`) requires `[a-z]` first. A work unit slugged `2fa-login` therefore composes a
      delivery request title whose scope ARC's commit-check would reject if a merge mode promoted the title into
      a commit subject. Inert under merge-commit strategy; it is exactly the merge-title question this entry owns.

- _Files:_ `.arc/backlog/planned/doc-conventions/pull-request-surface-policy/draft-pull-request-surface-policy.md`,
  `template-pull-request.md` § PR Title Format, `integrate-work-unit.md:150`.

- _Scope:_ policy only. `delivery-request-identity` settled the stacked-member title shape provisionally under the
  capture's interim boundary (retain the conventional portion); this entry owns whether that portion should exist.

- _Captured during:_ `delivery-request-identity` Errand scoping, 2026-09-18.

## Problem / Motivation

The canonical pull-request template universally requires Conventional Commits syntax for PR titles even though
ARC defaults to merge commits and validates the preserved commits themselves. The proxy is valid when a merge mode
promotes the PR title into history, but otherwise conflates review metadata with commit metadata.

The local-review marker has the complementary problem: a bare `Local` label renders a multi-pass, chunked,
seam-covered campaign identically to a single bounded pass, and names a harness where the reviewer model is the
capability-bearing identity.

## Direction

- Derive title guidance from reviewer navigation, configured merge strategy, and any downstream consumer that
  promotes or parses the title.
- Decide whether a readable work-unit slug belongs in ordinary and stacked PR titles, accounting for external
  readers, rename stability, private design storage, and ARC's public-surface boundaries.
- Content-gate any `Design` field by whether intended reviewers can actually resolve the referenced artifact.
- Define a small fixed local-review activity vocabulary over reviewer model plus activity shape, without outcome,
  finding, disposition, or clearance claims.
- Reconcile the canonical template, integration workflows, errand lane, and validation coverage without weakening
  commit-format enforcement.

---

# Analysis: Stacked Delivery — Build Versus Compose

**Purpose:** Map what ARC's stacked-delivery subsystem owns, why it was built the way it was, how it compares with
dedicated stacking tools, and which parts are principled ARC scope versus substrate-driven cost — so the domain's next
investments (the active `delivery-rebuild-continuity` work unit and the delivery work queued behind it) are decided
against an explicit model rather than momentum.

**State:** Point-in-time analysis taken 2026-09-24, while `delivery-rebuild-continuity` sat at create-spec Gate 1.
Read-only investigation — no code, planning artifact, or record was changed. Counts and line references are as of
`0917273bc` and drift with the code.

**Outcome:** after this analysis, the storage change it names as option 3 was scoped in the
[storage substrate analysis][storage-analysis] and selected over the recommended option 2; [ADR-035][adr-035] records
the direction. Stacked-delivery depth pauses until that change lands, and `delivery-rebuild-continuity` is held in
place at Planning with its spec as the design record.

**Created:** 2026-09-24

**Origin:** Owner question — has ARC partly turned itself into a stacking tool, and would thin platform-agnostic seams
over dedicated tooling (Graphite, GitHub native stacks, and similar) with agents handling operations per work unit have
been the saner design? Does ARC's methodology (append-only branches in particular) force a departure from industry
norms, and is that departure principled?

**Method:** Three read-only passes, then synthesis:

- a code inventory of the delivery subsystem (command surface, bucketed line counts, restack mechanics, host seams,
  history);
- a trace of the recorded rationale across ADRs, strategies, research, and archived work units;
- an external survey of stacked-change tooling as of September 2026.

The active spec and draft were read directly. Load-bearing internal citations were spot-checked against source.
External findings marked _unverified_ were not confirmed against a primary source (§ 11).

---

## Executive Summary

1. **Stacked delivery belongs in ARC.** Its purpose is per-member review surfaces — hosted agent review and human
   review UI per member, with per-member checks — while the work stays one work unit with one cohesive design space.
   Work-unit decomposition gives per-unit review but splits the design space; review-only chunking keeps the design
   space but gives no host-visible per-member surface. Only a stack gives both. No external tool provides the part of
   delivery that makes it ARC's: binding review and verification evidence to each member's exact head.

2. **For the most part ARC is not a stacking tool.** Stack mechanics — restacking, stack registration, retargeting,
   the stack merge — are delegated to GitHub's native stacks, and ARC never runs `git rebase` itself. Raw stack
   primitives are roughly 3K of about 36K production lines. Most of the subsystem is ARC's own authority and evidence
   model, plus a guarded-operation protocol around host calls.

3. **What reads as a homegrown stacking tool is the projection layer**, which the record already names "substrate
   tax, deliberately separable" (`spec-delivery-native-stack-composition.md` § Substrate seam). It exists because
   lifecycle artifacts ride the work unit's code history and the pushed work-unit branch is append-only. The storage
   direction schedules its retirement. It is also where delivery goes beyond anything a stacking tool does.

4. **The append-only concern is valid, but it lands on the work-unit branch, not the members.** Member branches are
   already force-updated presentations — the stacking idiom. The departure is treating a single-owner feature branch
   as shared history because ARC keeps its own state on it and syncs machines through it.

5. **The records disagree on whether that departure ends.** The storage direction's retirement item expects native
   restacking "end to end" including the top; the active draft argues append-only on the work-unit branch "is
   unaffected by the storage move". Whichever holds decides how much of the projection layer is permanent. It is the
   most load-bearing open decision in this domain (§ 8).

6. **Composition is blocked by the substrate, not by NIH.** Every mainstream stacking tool restacks by rebase and
   force-push; none can sit behind ARC's ports while the top is append-only and members are filtered reconstructions.
   Composing with GitHub native stacks rather than Graphite was the right call on licensing, host coverage, and
   harness-neutrality grounds.

7. **`delivery-rebuild-continuity`'s D4 is the one deliverable that crosses a recorded line.** Its constructor —
   net-contribution recut, attributed conflict resolutions, recorded resolutions keyed by three input trees, hunk-level
   carry — is the "rebase-and-conflict-resolution business" `delivery-native-stack-composition` excluded, built on the
   layer marked for retirement. The other deliverables sit in ARC's own layer, make existing routes reachable, or
   follow the compose-and-verify pattern.

8. **The end state this points at is observe-and-attest (§ 9).** ARC stops moving refs whose meaning it does not
   own: Git, a provider CLI, a stacking tool, or an agent performs every mutation, and ARC observes the result and
   attests it — binding evidence to exact heads and admitting it through gates — or refuses with a typed remedy. It
   matches what ARC is (judgment structure, evidence, gates), makes provider plurality nearly free, and fits all four
   evolution check-docs. It fully applies only once the storage substrate stops forcing reconstructed members.

9. **Recommendation (§ 10, option 2):** keep the ARC-owned layer fully in scope, keep mechanics delegate-only, and
   invest in the projection layer only as far as stacks must stay usable — preferring "the agent performs, ARC
   verifies" over "ARC constructs" — moving toward observe-and-attest within the current substrate while the storage
   change that retires the tax is scoped. Pulling that storage change forward (option 3) is the cleaner end state; it
   was scoped separately and selected (see **Outcome** above).

---

## 1. Question and Scope

The original motivation for native delivery: let ARC users hand routine stacked-delivery operations to agents, run
them efficiently and near-deterministically, and make the process predictable. The concern: ARC may have drifted into
being a stacking tool, which is not its purpose; composition with mature dedicated tooling generally beats
roll-your-own unless the divergence is principled; and ARC's own constraints (append-only in particular) may have
forced a departure from industry norms.

The owner fixed two constraints during the analysis:

- **Per-member review UI for hosted agents and humans is the primary motivation and not negotiable.** Any option
  that stops delivering it is out of scope. Per-member local verification is a secondary benefit (it can also be had
  independently, as review chunking does).
- **The distinctive value is per-member review while keeping one cohesive, holistic design space** — which is what
  distinguishes stacked delivery from work-unit decomposition (separate planning per unit) and from review-only
  chunking (one PR).

In scope: the delivery subsystem as shipped, its recorded rationale, the active work unit's design, the external
landscape, and the four evolution check-docs as lenses. Out of scope: re-deciding the landing window (ADR-034),
designing the storage change, and review-policy questions.

---

## 2. What Exists

### 2.1 How it was built

| Work unit                                 | Shipped    | What it added                                                                                                   |
| ----------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| `review-chunking`                         | 2026-07-24 | Review-only chunking of one PR; the chunk vocabulary; research advising no hard dependency on any stacking tool |
| `delivery-plan-record`                    | 2026-08-05 | Immutable plan revisions plus versioned delivery state; authoring from the task list or a branch                |
| `delivery-slice-review-vehicle`           | 2026-08-08 | Members enter exact-head review and merge lock as `delivery-member` vehicles                                    |
| `delivery-stack-topology`                 | 2026-08-14 | v1: eligibility, sequential landing, suffix reconciliation, lifecycle exclusion, separate control branch        |
| `delivery-native-stack-composition`       | 2026-09-05 | v2: work-unit branch as top, Stacks API registration, `gh stack` refresh, structural identity, native landing   |
| `delivery-post-landing-conflict-recovery` | 2026-09-18 | Typed remedies for post-landing movement, multiple merge bases, hand-resolved conflicts                         |

Contributing work outside the series: `integration-boundary-accuracy` (2026-08-20), `plan-segmentation` (2026-09-09),
`evidence-applicability` (2026-09-14), and about 22 chore and Errand pull requests touching delivery between
2026-09-08 and 2026-09-23. `delivery-integration-target` was retired unimplemented on 2026-08-15.

**Pace.** 618 non-merge commits touched `src/lib/delivery`, `src/handlers/delivery*.ts`, or `src/scripts/delivery`
between 2026-08-01 and 2026-09-22 (447 in August, 171 in September). Production size grew from about 6.5K lines
(2026-08-05) to 13.1K (2026-08-14), 30.7K (2026-09-05), and 33.8K (2026-09-19), per history sampling.

**Still queued in the domain:** `delivery-rebuild-continuity` (active, this analysis's trigger),
`delivery-correction-convergence`, `delivery-intent-integrity`, `delivery-review-cardinality`, and
`singleton-integration-continuity` (which describes itself as corrective delivery-runway work).

### 2.2 Command surface

`arc delivery` exposes 29 leaf verbs, all strict JSON in and out (`packages/arc-framework/src/cli.ts`, roughly lines
796–1080):

| Group             | Verbs                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan              | `plan from-tasks`, `plan from-branch`, `plan abandon`, `plan inventory schema`, `compose`, `transfer export`, `transfer import`                                                                |
| Private authoring | `authoring locate`, `authoring rematerialize`, `authoring rebind`, `eligibility prepare`, `eligibility close`                                                                                  |
| Publication       | `publish`, `position`, `checks observe`                                                                                                                                                        |
| Landing           | `land prepare`, `land apply`, `native observe`, `native link`, `native unlink`, `native land-select`, `native land-prepare`, `native land-submit`, `native land-status`, `native land-release` |
| Refresh           | `refresh plan`, `refresh execute`, `refresh adopt`                                                                                                                                             |
| Correction        | `review-fix continue`, `review-fix plan`, `review-fix publish`, `review-fix acknowledge`, `rewrite`, `rematerialize`, `reconcile`                                                              |
| Closeout          | `teardown`, `closeout`, `top-remedy`                                                                                                                                                           |

Delivery also reaches `review status --work-unit`, `review terminus accept` (member-scoped), `review merge-method
resolve`, the delivery arm of `integrate checkpoint`, and the position line in `status --session-init`. The agent
procedure is `deliver-stack.md` (793 lines, shipped).

### 2.3 Size

Production, delivery-dedicated files only:

| Area                                                              | Lines  |
| ----------------------------------------------------------------- | ------ |
| `src/lib/delivery/` (62 files)                                    | 23,380 |
| `src/handlers/delivery*.ts` (`delivery-execution.ts` alone 6,699) | 8,615  |
| `src/scripts/delivery/**` (host adapter)                          | 1,852  |
| Delivery-named review-gate files                                  | 1,183  |
| `src/lib/session-init/delivery-position*`                         | 623    |
| `src/scripts/integration/delivery-checkpoint.ts`                  | 128    |
| **Total**                                                         | ~35.8K |

Not counted: delivery branches inside shared files (`checkpoint-composition.ts`, `review-gate/status.ts`,
`status-composition.ts`, `readiness.ts` each mention delivery 47–140 times).

Tests, matched by file name (a lower bound): unit ~35.2K lines (71 files), integration ~9.3K (31), e2e ~4.1K (6),
helpers and fixtures ~5.9K — about 54.5K, roughly 1.5× production.

### 2.4 How restacking works, by ref

- **Registered non-terminal members are rebased by the provider, and ARC publishes the result.** The GitHub refresh
  adapter runs `gh stack checkout`, `gh stack view --json`, and `gh stack rebase --upstack` in a temporary isolated
  worktree (`src/scripts/delivery/hosts/github-refresh.ts`, around lines 1088–1130). ARC's only direct rebase call is
  `rebase --abort`. Adoption requires a reapply-and-compare proof (`merge-tree --write-tree --merge-base`,
  `git-contribution-proof.ts`), and ARC pushes with its own lease (`--force-with-lease=<ref>:<beforeHead>`,
  `git-materialization.ts:428–429`). It never calls `gh stack push`. One workaround exists for a provider behavior:
  `gh stack rebase --upstack --no-trunk` may use `merge-base --fork-point`, so ARC seeds the ref's reflog
  (`github-refresh.ts:946`).
- **Review-fix `rewrite` and `rematerialize` force-update members an operator or agent built.** ARC validates
  lifecycle exclusion and contribution, then force-with-leases. Today ARC constructs no member commits — its only
  commit construction is merge commits in `chain-absorption.ts` and `chain-adoption.ts`. The active spec confirms it:
  initial authoring "constructs nothing: recovery means hand-authoring normalized trees … commits, leased private-ref
  updates".
- **The top (the work-unit branch) is append-only.** Predecessor movement is merged in ("The terminal top remains
  outside provider mutation and absorbs predecessor movement append-only", `refresh.ts:94`), and
  `publishDeliveryTopRef` advances the branch with a plain push that refuses non-ancestor collisions.
- **The unlinked path only retargets** pull requests.

### 2.5 The GitHub adapter and its seams

- **Host features used:** the raw REST Stacks API through `gh api` (`repos/{r}/stacks` to register,
  `stacks/{n}/unstack` to unlink, `pulls/{n}/merge-async` for native landing), `gh pr create` / `gh pr merge`, a
  GraphQL reopen call, and the `gh stack` extension for refresh only. Registration deliberately avoids `gh stack
  link` because the porcelain "auto-corrects mismatched bases — silent repair".
- **What GitHub does:** stack registration and UI, automatic retargeting, the async stack merge, and the rebase
  algorithm.
- **What ARC keeps:** chain derivation, lease pushes, pull-request open and adopt, eligibility, landing order and
  guards, contribution proofs, conflict workspaces, and all state.
- **Seams are real interfaces with one implementation each** — `DeliveryHostPort`, `DeliveryTopRemedyHostPort`,
  `DeliveryNativeStackPort`, `DeliveryNativeMergeHostPort`, `DeliveryProviderRefreshPreparationPort`, and storage
  ports — implemented by `GhDeliveryHostPort` and `GhDeliveryProviderRefreshPort`.
- **Composition is hard-wired.** `new GhDeliveryHostPort(...)` is instantiated inline at about 29 sites; there is no
  factory or provider switch. GitHub policy leaks above the ports: port unions carry `"native-stack-required"` and
  `stackNumber`, the handler encodes GitHub's rule against squash on intermediate members, and `github.ts`
  classifies failures by regular expression over HTTP 422 text.
- **Recorded intent is deliberately narrow:** "A port exists to isolate an authority boundary used by v1, not to
  promise an adapter ecosystem" (`cohort-chunked-delivery.md`), and the cohort's non-goals exclude "a
  provider-general workflow engine". The domain types are provider-agnostic; the implementation supports one
  provider.

---

## 3. Recorded Rationale

### 3.1 Why delivery exists

- **The motivating problem is review quality, not merge speed.** `review-chunking` originated 2026-06-23 in the
  question of why ARC work units run broader than the small-PR norm. Its spec calls AI review "the **acute forcing
  case**": a large diff dilutes evaluator attention, and supporting material only increases the surface
  (`spec-review-chunking.md` § Introduction).
- **Field cases** (`cohort-chunked-delivery.md`, early revision `717dcc0bf`): `decompose-transform-integrity` at
  27.4k insertions across 146 files, and `session-locus-model` at 50.5k insertions across 375 files, which its
  author hand-cut into a thirteen-slice stack to `main`.
- **Decision chain:** `pr-decomposition` (2026-06-23) → "chunking is orthogonal to stacking", with stacking's
  tool-lock and rebase cascade noted and a work-unit integration branch as the default (2026-07-21) → split into
  `review-chunking` (review-only, one PR) and `chunked-delivery` → a four-member cohort (2026-07-30) → right-sized
  (2026-08-05) → re-groomed stack-first because "Both recorded field deliveries were stacks" (2026-08-05) → v1 in
  `delivery-stack-topology` → v1's own self-delivery exposed six costs, the integration target was retired, and v2
  (`delivery-native-stack-composition`) was minted (2026-08-15).
- **Owner statement (2026-09-24):** per-member review UI for hosted agents and humans is the primary value; stacked
  delivery is the only shape that provides it while keeping one design space.

The project's own review-chunking research concluded that "the industry-aligned answer for an already-built coherent
change is a review decomposition … **not** stacking tools". The owner's statement is the answer to that finding:
review decomposition inside one PR does not give hosted reviewers or humans a per-member review surface.

### 3.2 How composition was considered

Composition with GitHub's native stacks was deliberate from the start; the intended depth shrank over time.

- **2026-07-21 — thin verb over host-native stacking.** The `pr-decomposition` draft (commit `55c247c56`) named
  `gh-stack` "the forward-compat north star": "keep chunk identity/order data in ARC artifacts with topology as a
  projection; keep the orchestration verb thin so it can later drive `gh stack init/add/submit`. … the tool-lock
  objection inverts for host-native tooling." The same draft set the ref rule: "Rebase-freedom where no state lives;
  append-only where it does."
- **The cohort's original scope was plan, record, and proof — not ref arrangement:** "Integration branches and
  dependency-ordered pull requests are native Git and host capabilities. What this work unit adds is the canonical
  plan, the delivery record, and the terminal contribution proof — not the ability to arrange refs"
  (`cohort-chunked-delivery.md`, revision `717dcc0bf`).
- **Review-chunking research (July):** `gh-stack` was in waitlist-gated private preview, so "Do not build a hard
  dependency on native GitHub stacking, or on any single tool, now" (`research-review-chunking.md`).
- **`delivery-stack-topology` (v1):** rejected depending on the host stack for order or retargeting — "inverts
  authority — a preview-stage presentation surface would become correctness-load-bearing". Native stacks became an
  opt-in presentation, observed and never authoritative.
- **`delivery-native-stack-composition` (v2):** a three-analyst survey (ghstack, spr, Sapling, Jujutsu, Graphite,
  GitHub native stacks, Gerrit) shaped the design. Goal: "Total ceremony must not exceed what a team on Graphite or
  GitHub native stacks performs for the same topology." It rejected ARC-native restacking — "Providers already do
  this well, and building it would put ARC in the rebase-and-conflict-resolution business" — and recorded the
  non-goal "No ARC-native rebase, restack, conflict-resolution, temporary-base, or provider submission machinery."
  Its summary rule: "Delegate, reobserve, adopt on structural equivalence, refuse ambiguity."
- **Third-party tools were never evaluated as providers.** The earlier rejections of stacked-PR tooling concern how
  to group work units ("Tooling debt exceeds benefit", `research-wu-grouping-patterns.md`), not delivery. The likely
  reason (inference): the host is GitHub, and native stacks arrived just as the design formed.

### 3.3 Append-only: origin, scope, and stated reasons

- **Origin.** A 2026-06-10 incident: "a laptop-scaffolded branch was rebased and force-pushed from the primary
  worktree, orphaning the laptop's pre-rebase tip" (ADR-025). The lesson recorded: "a pushed branch serving as a live
  multi-machine sync target must never be rewritten."
- **Stated reasons.** `DEV-RULES.ARC` § Rebase scope: "rewriting published commits orphans the SHA-keyed git notes
  and forces a force-push". `strategy-concurrent-work` makes append-only until integration "the one **hard
  invariant**" of the strategy, with integration as the single sanctioned rewrite point. The 2026-07-21 draft tied it
  to notes directly: "The append-only rule protects SHA-keyed user notes on _pushed_ branches."
- **Scope.** It governs the work-unit branch. Member refs are "disposable projections" that "absorb the rewrites"
  (`spec-delivery-stack-topology.md`).
- **The tension with stacking idiom is recorded as substrate-caused.** `spec-delivery-native-stack-composition.md`
  § Substrate seam:

  > The design composes with the native-stack idiom everywhere except one layer, and the divergence is
  > substrate-caused, not doctrinal. … **Lifecycle artifacts ride the work unit's code history** … This is what forces
  > members to be filtered reconstructions rather than interior refs … **The pushed work-unit branch is append-only**
  > (SHA-keyed user notes, multi-machine sync). Idiomatic stacks rewrite branches freely; ARC's session substrate
  > cannot survive a rewrite of the top …
  >
  > The projection layer those contracts require … is **substrate tax, deliberately separable**.

- **Retirement is scheduled.** [Storage evolution][storage-evolution] § Holistic Design: "When operational state
  materializes off-branch and WU/session identity no longer couples to branch SHAs, replace that projection with
  ordinary interior-ref members, register the complete stack including the top, and permit native restacking end to
  end. Preserve the delivery-typed terminal-authorization arm and member-boundary verification."
- **The active draft takes the opposite position on the top.** `draft-delivery-rebuild-continuity.md` (§ The
  constructor): the notes rationale "would soften once operational state moves off-branch", but the
  multi-machine rationale "is mainstream Git practice rather than a local convention, and it is unaffected by the
  storage move."

Both positions are partly right. "Never rewrite shared history" is mainstream. Treating a single-owner feature branch
as shared is ARC's choice, driven by ARC keeping its own sync state on the branch. Mainstream stacking tools
(Graphite, `gh stack`, git-spice, Jujutsu) rewrite pushed single-owner branches under a lease as routine.

### 3.4 Recorded cost

`notes-delivery-native-stack-composition.md` § Evidence base, compressed (2026-08-31):

> Six integration days produced 255 distinct commits …: 45% repaired the delivery/review/lifecycle machinery itself
> under dogfood, 36% were attest/publish/reopen/renew/absorb ceremony, and 3% carried an actual hosted-review finding
> fix. … observed attended cost ran 45–105 minutes per cycle. Mature stacked-PR practice (Graphite, `gh stack`,
> git-machete, jj) lands the equivalent mechanical span as one command plus unattended CI wait …

By that measurement the v2 ceremony goal was not met at the time (the rescue that followed targeted the ceremony
bucket). The same notes set hard boundaries on the rescue: "minimal new investment in the filtered member-ref
projection machinery, which the storage direction already records for retirement … If the rescue cannot be built
inside these boundaries, stop expanding and finish the remaining members through a fixed manual runbook."

Other cost signals: a project strategy exists solely for the bootstrap case of delivery machinery delivering its own
changes ([self-hosting delivery recovery][self-hosting-recovery]); the active spec measures a three-member, 13-commit
rebuild at about 38 minutes end to end, and records two complete sets of three Tier 2 gates spent on a wrong-anchor
preflight gap.

### 3.5 Unreconciled doctrine

[ADR-024][adr-024] rejected "Model A — one WU sliced into stacked PRs" on three grounds: one-branch-per-WU makes it
inexpressible; "ARC's review grain is already sub-PR (per-task increment), so Model A's 'split for smaller reviewable
units' benefit is largely absorbed"; and a shared mutable spec and task list across branches. Stacked delivery avoids
the first and third by keeping one branch and treating members as projections. The second is answered by the owner's
statement — per-task increments give no hosted per-member review surface — but ADR-024 was never amended.
`strategy-work-organization` later treats pull-request count as a separate axis; the ADR still reads as rejecting
what delivery is.

---

## 4. External Landscape (September 2026)

| Tool                                   | Restack model                                              | Landing                                                | Hosts                                     | Agent surface                    | License / cost                                                         |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| GitHub native stacks + `gh stack`      | Server-side cascading rebase; force-push                   | Whole stack in one operation; merge, squash, or rebase | GitHub                                    | CLI extension; JSON _unverified_ | Free; public preview since 2026-07-30                                  |
| Graphite (`gt`)                        | Rebase; `gt submit` force-pushes                           | Merge queue; auto-restacks remainder                   | GitHub                                    | `gt mcp` server                  | Closed source since 2023-07; paid tiers; owned by Cursor since 2025-12 |
| git-spice                              | Rebase-based restack                                       | Host merge; bottom-up                                  | GitHub, GitLab, Bitbucket, Gitea, Forgejo | JSON output mode                 | GPL-3.0                                                                |
| Aviator (`av`)                         | Sync propagates to children; rebase-based _unverified_     | Hosted MergeQueue optional                             | GitHub                                    | CLI                              | CLI open source; queue hosted                                          |
| git-town                               | **Merge by default**; rebase and compress optional         | `ship`; fast-forward recommended for stacks            | GitHub, GitLab, Gitea, Bitbucket, Forgejo | `--dry-run`; no JSON found       | _unverified_ (reported MIT)                                            |
| ghstack                                | **Append-only**: `base`/`head` branches never force-pushed | `ghstack land` or a bot; not the host merge button     | GitHub                                    | CLI                              | MIT                                                                    |
| spr (getcord)                          | Mechanism _unverified_                                     | Squash-merge                                           | GitHub                                    | CLI                              | MIT                                                                    |
| `glab stack`                           | Linear chain, push-based                                   | Host merge                                             | GitLab                                    | CLI                              | Experimental status _unverified_                                       |
| Sapling + ReviewStack                  | Commit-level restack                                       | Via Sapling's Git backend                              | GitHub                                    | CLI                              | OSS; ReviewStack self-described prototype                              |
| Jujutsu (+ jj-stack)                   | Change-ID rewrites; `jj git push` force-pushes             | Host merge                                             | Any Git host                              | CLI                              | OSS                                                                    |
| `git rebase --update-refs` (Git 2.38+) | Rebase updating every stacked ref                          | —                                                      | —                                         | —                                | Git core                                                               |

**Findings:**

- **The 2026 norm** is rebase (increasingly via `--update-refs`) with `--force-with-lease`, bottom-up squash or merge,
  and forge-side retargeting of upper pull requests. GitHub's native stacks codify this server-side.
- **Merge-based stacking is an established minority**, not an invention: git-town's default sync strategy is merge,
  and ghstack keeps append-only `base` and `head` branches. Both pay for it in landing — ghstack cannot use the host
  merge button.
- **GitHub's documentation states** "A fully linear history between every branch in the stack is a strict
  requirement for merging." Whether that forbids merge commits inside a member or only requires each branch to sit on
  its predecessor's head was not verified; it matters for any design that keeps base merges in member history.
- **No tool binds review evidence to exact heads.** GitHub's stale-approval dismissal fires on merge-base change
  (reported inconsistent), and git-spice documents that dismissal-on-base-change is incompatible with stacking
  workflows. ARC's exact-head evidence ledger is its own under any backend.
- **Graphite is a poor dependency for ARC:** closed source since 2023-07 (community forks Charcoal and Freephite
  preserve an older open CLI), paid tiers, GitHub-only, and owned by an agent-harness vendor since December 2025 — at
  odds with PROJECT-PRD's "agnostic to agent, harness, IDE, and adjacent tools" principle.
- **Realistic providers once the substrate allows composition:** `gh stack` for GitHub (native UI and stack merge),
  and git-spice for other hosts (widest host coverage, JSON output; GPL-3.0, so invoke it as a separate binary rather
  than vendoring).

---

## 5. The Three-Layer Model

The inventory bucketed code by purpose. Re-cut by whether a piece is ARC's by nature, commodity, or caused by the
storage substrate:

| Layer                                     | Contents                                                                                                                                                                                                                         | Approx. production lines           | Who should own it                                                                  | Under the storage move       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------- |
| 1 — Authority and evidence                | Plan and authoring (task-derived members, one spec), member review vehicles, Candidate attestation and applicability, eligibility observation, terminal authorization, review-fix routing, session-init position, typed refusals | ~17–19K                            | ARC — no tool provides it                                                          | Survives                     |
| 2 — Mechanics and guarded host operations | Raw stack primitives (~3K), the reserve → reobserve → mutate → reobserve protocol and refusal tables (~7.7K), the GitHub adapter (~0.9K strictly GitHub)                                                                         | ~11K                               | Host or tool for mechanics; ARC for guards and compare-and-swap on its own records | Survives; may shrink (§ 5.2) |
| 3 — Projection ("substrate tax")          | Lifecycle exclusion, member filtering and reconstruction, absorption and adoption merges into the top, contribution proofs across reconstructions                                                                                | ~1–4K today; D4 adds substantially | Nobody — it exists only because of the substrate                                   | Retires                      |
| Plumbing                                  | Operation store, local stores, ports, transfer, schemas                                                                                                                                                                          | ~4.5K                              | ARC                                                                                | Survives                     |

Line figures are file-level estimates; many files mix concerns, and the layer-3 range depends on how shared
materialization and proof code is attributed.

### 5.1 Layer 1 is principled ARC scope

Nothing in the external survey binds review or verification evidence to exact heads, carries it across movement that
does not touch what it covers, or composes a terminal authorization from member evidence. It is also what turns a
stack into per-member review inside one design space — the owner's stated value. [PM composition][pm-composition]
Principle 2 ("Preserve the agent-native execution core") names design, verification evidence, review increments, and
integration procedure as core that external systems do not automatically replace.

### 5.2 Layer 2 is mostly right already, with one authority question

The mechanics are delegated, registration uses a fail-closed raw API rather than self-repairing porcelain (ADR-034
Decision 4), and ARC's guards keep compare-and-swap on its own writes — all consistent with the project's
[external-seam enforcement test][dev-rules-project]. The adapter is single-implementation and hard-wired; that is
proportionate while GitHub is the only provider, but it is not yet a seam a second provider could fill.

The open question is authority. ARC holds authority over stack order and member heads and treats the host stack as
"observed-never-authoritative". Holding that authority is what requires refresh planning, adoption, reconciliation,
and much of the guard protocol. The alternative split — the plan (which task ranges form which member) is ARC's;
member heads and stack order are the host's or the tool's; ARC observes them and binds evidence to what it observes —
is lighter (§ 9). It is only available once the projection layer is gone, because a reconstructed member cannot be
observed into existence.

### 5.3 Layer 3 is the problem

Everything that makes delivery feel like a stacking tool lives here, and it goes further than any stacking tool: the
active spec notes that no existing tool "takes a resolution recorded in a **later** merge as the source for an
**earlier** member" (§ Alternatives & Rationale). The record already classifies the layer as temporary tax, with a
written retirement path and a named set of survivors (terminal authorization and member-boundary verification).

---

## 6. `delivery-rebuild-continuity` Against the Model

| Deliverable | Summary                                                                | Layer                  | Note                                                                                              |
| ----------- | ---------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| D1          | The covered-input rule, stated in a shared surface                     | 1                      | Evidence that survives restacks by any engine — an enabler for later composition                  |
| D2          | Eligibility close admits non-covered movement, measured per member     | 1                      | Removes a blanket re-gate on any base movement                                                    |
| D3          | Anchor and completeness refusals carry direction and remedy            | 1                      | Emitted remedies — the procedure and knowledge direction                                          |
| D4          | Member constructor and the close-side `rebuild-required` reason        | 3 interior, 1 contract | Crosses the recorded "no ARC-native rebase or conflict resolution" line (§ 6.1)                   |
| D6          | Publication reads the attestation; the projection reaches the operator | 1                      | Removes local per-member Tier 2 (§ 6.2)                                                           |
| D8          | The correction continuation reaches its rebuild                        | 1/2                    | Makes an existing route reachable end to end                                                      |
| D9          | A conflicting restack onto a moved base is admitted under consent      | 2 (adoption side)      | Follows the compose pattern: the operator restacks with any tool, ARC proves and asks for consent |

### 6.1 D4 in detail

**What it builds.** One constructor, parameterized by the predecessor relation, for initial authoring and the bound
correction route. It recuts each member as one authored commit carrying its net contribution; anchors the chain on
the newest base the top absorbed; attributes a merge's recorded conflict resolution — and its departures from the
mechanical merge — to the earlier member that owns the content, composing the attributed version from three-way
merges and per-commit reverts; keys recorded resolutions by all three input trees; carries corrections hunk by hunk;
writes commit objects through `hash-object` to preserve authorship byte-exactly; and keeps stop-and-continue state
under the plan's candidate namespace.

**The tension.** That is the rebase-and-conflict-resolution business `delivery-native-stack-composition` rejected,
and it falls inside that work unit's non-goal "No ARC-native rebase, restack, conflict-resolution … machinery". It is
also the "new investment in the filtered member-ref projection machinery" that the same work unit's rescue boundaries
asked to keep minimal.

**The spec's defense** is that "One implementation is forced rather than chosen": before publication there is
nothing for a provider to rebase, and routing reconstruction through the host would bind correctness to one host's
stack support. The defense holds only given layer 3's causes. Members must be reconstructions because lifecycle
artifacts ride the code history, and ranges carry base merges "by rule" because the work-unit branch is append-only
(the spec cites `DEV-RULES.ARC` § Rebase scope). With interior-ref members on a rewritable branch, a first cut is
placing refs on existing commits and a rebuild is `git rebase --update-refs` or a provider restack.

**To its credit, D4 is designed for removal.** The spec (§ D4, Substrate contracts versus tracked-tier projection)
lists what retires — lifecycle normalization, net-contribution reapplication, the absorption merges and the
attributed resolution that places them, and commit construction with byte-exact authorship — and what survives: the
typed per-member result "degenerating to cutting and binding refs", the member-boundary and placement operands,
compare-and-swap on ARC-owned refs, and member-boundary verification. The exclusion set arrives through one resolver
seam, and the stages stay separable so retirement "deletes the middle two". That lowers the waste; it does not remove
it.

**Signals of mechanism weight.** The spec's Alternatives section records a long series of modelled constructions that
failed on specific shapes (including a "thirteenth pass" continuation). The draft classifies the work `Heavy` on an
invent-versus-compose scan that "lands on **compose**", while the spec states no existing tool performs its central
attribution step — an arguable `Novel` signal (inference, not a finding against the classification method).

**A narrower alternative worth putting to Gate 1:** stop at each conflict and hand it back, as rebase-based tools do;
the agent resolves it, optionally helped by `git rerere` seeded from the top's merges (`contrib/rerere-train.sh`);
ARC verifies through the contribution proof and a consent digest. The spec rejected handing back because the top has
already resolved the conflict, so the operator would re-resolve it per member on every rebuild that crosses it — a
real cost, since about a third of recorded refresh and absorption merges carried a resolution. The trade is more
attended stops against much less mechanism on a retiring layer.

### 6.2 D6 and local per-member verification

D6 removes the local per-member Tier 2 run from the prepublication window. Per-member checks run on the host after
publication, and publication reads the work-unit attestation instead of hand-composed gate results. The rationale is
well grounded (no mature stacked-change tool verifies locally before publication; the gate-identity digest had no
resolution source). The owner named per-member local verification as a secondary benefit of stacking, so the trade
deserves explicit confirmation. The spec also names one accepted transient: between the D1+D2 landing and D6's,
`arc delivery publish` reads no verification evidence of its own.

---

## 7. The Evolution Check-Docs as Lenses

### Procedure evolution

[Procedure evolution][procedure-evolution] argues **against** the "no internal machinery, agents work it out per work
unit" alternative. Principle 1 ("If the CLI can compute it, the CLI computes it") and Principle 3 ("Verbs over
mechanics") exist to keep deterministic logic out of prose executed by a stochastic interpreter; agent-improvised
restacks and lease pushes are exactly that. It does **not** say ARC must implement the engine. A typed verb can drive
a provider engine (`gh stack`, `git rebase --update-refs`, later git-spice) and return precomposed verdicts and
remedies (Principle 6). ARC owns the verb surface and the verdicts; it owns the engine only where nothing else can.

The owner's intuition — that CLI handling is justified because ARC serves agents as well as people — is right for the
**checker** role: agents run Git well, but they cannot reliably know whether a result is correct or whether evidence
still applies. It is weaker for the **actuator** role, where the engine is commodity.

### Storage evolution

[Storage evolution][storage-evolution] is the decisive lens. Layer 3 is storage debt with a written retirement path.
Every heavy investment in layer 3 before the storage change is spent on code the change deletes. Its Principle 5 (WU
identity decoupled from branch identity) is the precondition for interior-ref members, and its Principle 3
(version-checked writes) is already honored by delivery's leases and compare-and-swap.

### PM composition, in spirit

[PM composition][pm-composition] governs external trackers, not source hosts, but its principles transfer cleanly to
stack providers:

- **One mutable fact, one authority.** Member boundaries and evidence are ARC's facts; member heads and stack order
  could be the host's. Today ARC holds both and mirrors the host, which is what the refresh, adopt, and reconcile
  machinery pays for.
- **Keep standalone and composed use first-class.** The unlinked path is the standalone arm; native stacks are the
  composed arm. That shape is already right.
- **Prefer typed verbs and verdicts over adapter prose; avoid a lowest-common-denominator provider model.** Also
  already the posture.
- **Integration must earn its ceremony and maintenance.** The WU58 measurement (§ 3.4) is the direct test, and it
  had not been passed at the time.
- **Compatibility ladder.** Native stacks sit at roughly "observed" — ARC reads host stack state and treats it as
  presentation. Moving head authority to the host is a step up the ladder that removes duplicated mutable state
  rather than adding synchronization.

### Knowledge evolution

[Knowledge evolution][knowledge-evolution] bears less directly. Delivery added a large set of load-bearing terms
(candidate, eligibility windows, absorption, attribution, entangled chain, placement, continuation) and a 793-line
agent procedure, each of which agents and teams must carry. Its Principle 7 (emitted remedies over loaded documents)
favors D3's direction. The layer-3 vocabulary is the part the storage change deletes.

---

## 8. The Load-Bearing Open Decision: Is the Work-Unit Branch Rewritable?

**The two recorded positions:**

- Storage evolution's retirement item: once state is off-branch and identity no longer couples to branch SHAs,
  "register the complete stack including the top, and permit native restacking end to end" — which rewrites the top.
- The active draft: the multi-machine rationale for append-only "is unaffected by the storage move".

**If the top stays append-only after the storage change:** members can become interior refs, but the work-unit
branch still accumulates base merges, so members inherit them. Providers cannot restack the top, so an
absorption-and-adoption layer remains permanently, and GitHub's linear-history requirement for native merge may bite
(interpretation unverified, § 4). Much of layer 3 becomes permanent ARC scope.

**If the top is rewritable before integration:** members are interior refs; `git rebase --update-refs`, `gh stack`,
or git-spice restack the whole stack including the top; evidence carries across rewrites through the covered-input
rule and applicability (D1's durable value); multi-machine safety comes from `--force-with-lease` plus a typed resync
on other machines. Layer 3 retires almost entirely, and composition with providers becomes real.

**Lean:** allow a lease-guarded rewrite of the work-unit branch before integration once state is off-branch, with a
typed resync verb for other checkouts. It matches mainstream practice for single-owner branches and is the only path
on which composing with stacking tools works. The 2026-06-10 incident is the case a lease plus a typed resync
addresses; it is not an argument for append-only once ARC's own state no longer lives on the branch. Team-shared work
branches (several writers on one work-unit branch) would still want append-only, which argues for making it a
property of how a branch is shared rather than a global rule.

This decision belongs with the storage scoping, not with any delivery work unit.

---

## 9. The Inversion: Observe and Attest

The three-layer model points at an end state in which delivery's authority moves entirely into observation. This
section sketches that end state, because it is the clearest statement of what ARC's delivery role should be and it
orients both the containment option and the storage option below.

### 9.1 The principle

**ARC does not move refs whose meaning it does not own.** A mutation engine — plain Git, a provider CLI, a stacking
tool, or an agent — creates, restacks, and pushes member branches. ARC observes the result and either **attests** it
(binds evidence to exact heads, admits it through a gate) or **refuses** it with a typed verdict and a precomposed
remedy naming the provider operation that would clear it. Authority lives in the observation and the gate, never in
the act.

This is the split the record already reached for: the cohort's original scope was "the canonical plan, the delivery
record, and the terminal contribution proof — not the ability to arrange refs" (§ 3.2); v2's rule was "Delegate,
reobserve, adopt on structural equivalence, refuse ambiguity"; D9's adopt arm lets "the operator restack with whatever
tool they use". Observe-and-attest carries that posture through the whole lifecycle instead of stopping at refresh.

### 9.2 What ARC owns in the inverted model

| Responsibility          | Content                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan                    | Member boundaries as a declared cut over one work unit's tasks and history, their order, and the concern each member carries — one spec, one task list     |
| Observation             | Member heads, predecessor relations, and pull-request state read from Git and the host; the stack as it is, not as ARC last wrote it                       |
| Structural verification | Each member's contribution stays inside its declared boundary; the union of members equals the work-unit top; the chain is contained and ordered           |
| Evidence ledger         | Review results, checks, and attestation per member per exact head; the covered-input rule deciding what carries across an observed movement                |
| Gates                   | Publication readiness, landing readiness, and terminal authorization composed from evidence at exact observed heads; compare-and-swap on ARC's own records |
| Remedies                | Typed refusals naming the provider operation and the re-observe step, precomposed by the CLI                                                               |

Merge authority stays where it is: the integration interlock authorizes an exact head, and the merge act binds to
that head (GitHub's merge endpoint accepts a `sha` the head must match; `gh pr merge --match-head-commit` exposes it).

### 9.3 What the inversion deletes or demotes

- **Deleted with the substrate:** lifecycle exclusion, member reconstruction, the constructor's interior, absorption
  and adoption merges into the top, rematerialization, the private candidate namespace, conflict workspaces.
- **Shrunk:** the guarded-operation protocol, which exists largely because ARC performs mutations; refresh planning
  and execution; the correction controller, whose route becomes "fix, restack with any tool, re-observe, re-scope
  review by applicability".
- **Demoted to optional drivers:** convenience verbs remain worthwhile — [procedure evolution][procedure-evolution]
  forbids agents narrating Git mechanics — but a driver's contract is "delegate to the configured engine, then
  observe". A driver is swappable per project (`gh stack`, git-spice, `git rebase --update-refs`) and never trusted:
  its output is attested like any other movement.
- **The host adapter narrows** to observation, the exact-head merge, and review surfaces. A new provider then needs
  read access and a merge primitive, not a mutation adapter.

A first cut becomes cheap when history is already ordered by member: task-plan segments map tasks to members, so a
driver can place member refs at segment boundaries and refuse, with a reorder remedy, when commits interleave.

### 9.4 Why it fits what ARC is

- **ARC's value is judgment structure, evidence, and gates** — AGENT-BRIEF's review-authority posture ("Never infer
  merge safety from … a clean report, or passing local checks") is an observe-and-attest statement already.
- **It matches the owner's agent argument where that argument is strongest.** Agents run Git and provider CLIs well;
  what they cannot do reliably is decide whether a result is correct and which evidence still applies. The inversion
  gives ARC exactly that job.
- **It honors the check-docs.** Procedure evolution: deterministic verdicts and remedies in the CLI. Storage
  evolution Principle 4: external integration stays read-side. PM composition, in spirit: one authority per fact —
  plan and evidence are ARC's, refs and pull requests are Git's and the host's. PROJECT-PRD: agnostic to adjacent
  tools — a team already on Graphite or Jujutsu keeps it.
- **Provider plurality becomes nearly free**, because ARC reads branches rather than driving each tool.
- **Self-hosting gets easier.** A smaller, less stateful attestor is less exposed to the bootstrap problem of
  delivery machinery delivering its own changes.

### 9.5 What it costs and requires

- **Deterministic verdicts, not deterministic mutations.** The act-observe-verdict loop is Git's own idiom, but the
  owner's original goal of near-deterministic operations is met at the verdict layer, not the mutation layer.
- **Conflict resolution returns to the operator or agent**, as with every stacking tool. The constructor's reuse of a
  resolution the top already holds is lost; `git rerere` recovers part of it. About a third of recorded refresh and
  absorption merges carried a resolution, so this is a real, recurring cost.
- **Evidence must carry across rewrites by contribution, not commit identity.** Provider restacks move every head
  above the change. Without equivalence-based carry — a member whose contribution against its predecessor is
  unchanged keeps its evidence under the covered-input rule — every restack becomes a re-review storm. This is the
  most valuable ARC-owned piece to build, and it is layer 1. v2's rule "rewrite destroys applicability, retarget
  preserves it" (`spec-delivery-native-stack-composition.md` D8.6) is the current limitation it replaces.
- **Preconditions:** members must be real commits on real branches, so lifecycle state must be off the code branch;
  and members must be rewritable by tools, so the § 8 decision must allow at least member rewrites and, for the full
  inversion, a lease-guarded rewrite of the top before integration.

### 9.6 How far it can go before the storage change

Partway. Published members can already be restacked by any tool and adopted under proof and consent (D9); evidence
carry (D1, D2) and typed remedies (D3) are observe-and-attest pieces that work today. What cannot be inverted before
the storage change is anything that depends on reconstructed members — first cuts, pre-publication rebuilds, and
corrections that re-derive a member from the top — because a reconstructed member cannot be observed into existence.
That boundary is D4's territory, which is why the narrower-D4 question (§ 6.1) is the same question as "how much
inversion now".

---

## 10. Options Going Forward

Options that stop delivering per-member review surfaces are excluded by the owner's constraint (§ 1). All three
below keep stacked delivery.

| Option                              | Near-term cost                                                      | Risk                                                                                         | End state                                                            |
| ----------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1 — Stay the course                 | This work unit as specced, then the queued delivery work            | Continued heavy spend on layer 3; each field edge case produces new mechanism                | Rich native delivery; layer 3 retired later at the cost of the spend |
| 2 — Contain layer 3, then retire it | Triage each delivery work unit by layer; narrower D4 where possible | Some rebuilds stay attended or runbook-driven until the storage change lands                 | Layer 1 complete, layer 2 delegated, layer 3 minimal and removable   |
| 3 — Storage first                   | Pause delivery depth; scope and land the storage change             | Storage program is large and its direction is not settled; stacks stay on runbooks meanwhile | Cleanest: interior-ref members, provider restack end to end          |

### Option 1 — Stay the course

Finish `delivery-rebuild-continuity` as specced, then `delivery-correction-convergence`,
`delivery-intent-integrity`, `delivery-review-cardinality`, and `singleton-integration-continuity`. It keeps
momentum, and the design is careful and retirement-aware. The cost is that heavy effort keeps flowing into the layer
the record schedules for deletion, and the pattern of field edge cases producing new mechanism continues.

### Option 2 — Contain layer 3, then retire it (recommended)

A triage rule for delivery work from here:

- **Layer 1** (authority, evidence, refusals, remedies): fully in scope.
- **Layer 2** (mechanics): delegate-only; ARC keeps guards and compare-and-swap, never the engine.
- **Layer 3** (projection): the minimum needed to keep stacks usable, preferring "the agent performs, ARC verifies"
  over "ARC constructs". D9's adopt arm is the model: "Adopt accepts any restack shape the proof accepts — rebase or
  merge — so the operator restacks with whatever tool they use."

Apply it to this work unit at Gate 1 (the narrower-D4 question, § 6.1) and to each queued delivery work unit at its
planning. Each such decision is a step toward observe-and-attest (§ 9) inside the current substrate. In parallel,
scope the storage slice that retires the tax — operational state off the code branch, user notes no longer keyed to
code SHAs — together with the rewrite decision in § 8.

### Option 3 — Storage first

Pause delivery depth and pull the storage change forward. It is the cleanest end state — it dissolves D4's middle,
the lifecycle-exclusion machinery, and the barrier to composing with providers — but it is a large, cross-cutting
program whose direction is not settled, and stacks run on attended procedures in the meantime. It is also the only
option that reaches the full observe-and-attest inversion (§ 9.6). It was scoped in the
[storage substrate analysis][storage-analysis] and selected; [ADR-035][adr-035] records the direction.

### Sunk cost

The 36K production lines already shipped stay under every option; option 3 eventually removes layer 3's share of
them. The decision is about marginal spend: this work unit and the four queued behind it.

---

## 11. Caveats and Unverified Items

- **Line counts** are file-level estimates from one inventory pass; layer attribution of mixed files is judgment.
- **External items not confirmed against a primary source:** `gh stack` JSON and non-interactive flag coverage;
  git-town's license and `ship`'s effect on upper branches; getcord/spr's branch-update mechanism; `av sync`'s
  force-push behavior; `glab stack`'s current status; the interpretation of GitHub's linear-history requirement;
  consistency of GitHub's approval dismissal on merge-base change.
- **The rationale pass reported** that append-only is enforced mechanically only by a pre-push warning that never
  blocks and can be disabled; not re-verified here.
- **ADR-033's "fixes outnumbered feature commits 3:1"** concerns the locus and Errand machinery delivered through a
  stack, not the delivery machinery; it is excluded as delivery cost evidence.
- **Feasibility and sequencing of the storage change** are assessed in the [storage substrate
  analysis][storage-analysis], not here.

---

## Sources

**Movable work-unit artifacts** (cited by filename): `spec-delivery-rebuild-continuity.md`,
`draft-delivery-rebuild-continuity.md`, `spec-delivery-native-stack-composition.md`,
`notes-delivery-native-stack-composition.md`, `spec-delivery-stack-topology.md`, `spec-review-chunking.md`,
`research-review-chunking.md`, `cohort-chunked-delivery.md` (current and revision `717dcc0bf`),
`draft-pr-decomposition.md` (revision `55c247c56`).

**Stable internal documents:** [ADR-024][adr-024], [ADR-025][adr-025], [ADR-034][adr-034], [ADR-035][adr-035],
[Storage substrate analysis][storage-analysis], [DEV-RULES.ARC][dev-rules-arc], [DEV-RULES.PROJECT][dev-rules-project],
[Integration strategy][integration], [Concurrent work strategy][concurrent-work], [Storage evolution][storage-evolution],
[Procedure evolution][procedure-evolution], [Knowledge evolution][knowledge-evolution],
[PM composition evolution][pm-composition], [Self-hosting delivery recovery][self-hosting-recovery],
[WU grouping research][research-wu-grouping].

**Code:** `packages/arc-framework/src/lib/delivery/`, `src/handlers/delivery*.ts`,
`src/scripts/delivery/hosts/github.ts`, `src/scripts/delivery/hosts/github-refresh.ts`, `src/cli.ts`, and
`.arc/system/workflows/arc/supplemental/deliver-stack.md`.

**External:**

- [GitHub Changelog — Stacked pull requests are now in public preview (2026-07-30)][gh-stacked-preview]
- [GitHub Docs — Stacked pull requests reference][gh-stacked-ref]
- [GitHub Docs — Managing stacked pull requests][gh-stacked-manage]
- [github/gh-stack][gh-stack-repo]
- [GitHub community discussion #58535 — approval dismissal on merge-base change][gh-dismiss]
- [Graphite — GT MCP][graphite-mcp] and [pricing FAQ][graphite-pricing]
- [Cursor — Graphite is joining Cursor][graphite-cursor]
- [danerwilliams/charcoal][charcoal] and [agrinman/freephite][freephite]
- [abhinav/git-spice][git-spice] and [git-spice limitations][git-spice-limits]
- [git-town — sync feature strategy][git-town-sync]
- [ezyang/ghstack][ghstack]
- [getcord/spr][spr]
- [Aviator CLI][aviator]
- [GitLab — `glab stack sync`][glab-stack]
- [Sapling — ReviewStack][reviewstack]
- [Jujutsu — working with GitHub][jj-github]
- [Andrew Lock — stacked branches with `--update-refs`][update-refs]

---

[adr-024]: ../../adr/adr-024-cohort-decomposition-model.md
[adr-025]: ../../adr/adr-025-concurrent-work-by-convention.md
[adr-034]: ../../adr/adr-034-use-windowed-landing-around-agentic-review.md
[adr-035]: ../../adr/adr-035-keep-operational-state-in-repository-refs.md
[storage-analysis]: analysis-storage-substrate-direction.md
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
[dev-rules-project]: ../../../system/rules/DEV-RULES.PROJECT.md
[integration]: ../../strategies/arc/strategy-integration.md
[concurrent-work]: ../../strategies/arc/strategy-concurrent-work.md
[storage-evolution]: ../../strategies/project/strategy-storage-evolution.md
[procedure-evolution]: ../../strategies/project/strategy-procedure-evolution.md
[knowledge-evolution]: ../../strategies/project/strategy-knowledge-evolution.md
[pm-composition]: ../../strategies/project/strategy-pm-composition-evolution.md
[self-hosting-recovery]: ../../strategies/project/strategy-self-hosting-delivery-recovery.md
[research-wu-grouping]: ../research/research-wu-grouping-patterns.md
[gh-stacked-preview]: https://github.blog/changelog/2026-07-30-stacked-pull-requests-are-now-in-public-preview/
[gh-stacked-ref]: https://docs.github.com/en/pull-requests/reference/stacked-pull-requests
[gh-stacked-manage]: https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/managing-stacked-pull-requests
[gh-stack-repo]: https://github.com/github/gh-stack
[gh-dismiss]: https://github.com/orgs/community/discussions/58535
[graphite-mcp]: https://graphite.com/docs/gt-mcp
[graphite-pricing]: https://graphite.com/docs/pricing-faq
[graphite-cursor]: https://cursor.com/blog/graphite
[charcoal]: https://github.com/danerwilliams/charcoal
[freephite]: https://github.com/agrinman/freephite
[git-spice]: https://github.com/abhinav/git-spice
[git-spice-limits]: https://abhinav.github.io/git-spice/guide/limits/
[git-town-sync]: https://www.git-town.com/preferences/sync-feature-strategy.html
[ghstack]: https://github.com/ezyang/ghstack
[spr]: https://github.com/getcord/spr
[aviator]: https://docs.aviator.co/aviator-cli
[glab-stack]: https://docs.gitlab.com/cli/stack/sync/
[reviewstack]: https://sapling-scm.com/docs/addons/reviewstack/
[jj-github]: https://docs.jj-vcs.dev/latest/github/
[update-refs]: https://andrewlock.net/working-with-stacked-branches-in-git-is-easier-with-update-refs/

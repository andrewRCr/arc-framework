# Research: pr-decomposition

> _Captured 2026-06-23 from a deep-research run (fan-out web search → fetch → 3-vote adversarial verification →
> synthesis; 22 sources, 105 claims extracted, 25 verified, 24 confirmed / 1 killed). Grounding for
> `draft-review-chunking.md`. Findings are point-in-time; URLs are external sources, not internal references._

**Question:** How do teams reconcile a single coherent logical change (one concern — e.g. a cross-cutting
refactor or consistency sweep) with the industry norm of small, independently-reviewable / -mergeable PRs — and
should a `1 WU = 1 branch = 1 PR` methodology adopt emitting multiple PRs per WU, with seams planned up front?

## Headline

Teams reconcile the two through **stacking**: decomposing one conceptual unit into an ordered series of small,
individually-reviewable parts that merge incrementally in dependency order. The small-change doctrine is **strongly
evidenced for review quality, but not for velocity**. Mature prior art ("one logical unit → many coordinated
parts") is well-established and **planned up front**. Consistency-at-the-merge-boundary is achievable but must be
**designed into** the decomposition (the kernel bisectability rule), not discovered at integration.

## Verified findings

1. **Small-PR doctrine is strongly evidenced for review quality / defect detection.** Google guides erring toward
   too-small CLs (~100 lines reasonable, ~1000 too large, file-spread-sensitive); large changes demonstrably
   degrade review thoroughness. _(google.github.io/eng-practices — primary, 3-0)_
2. **Classic empirical basis (2006 SmartBear/Cisco: 2,500 reviews, 3.2M LOC):** defect-detection density highest
   below ~200 LOC, falling sharply past 300–500; reviewers most effective below ~400 LOC; effectiveness governed by
   inspection pace (<300–500 LOC/hr) and time (reviewers "wear out" after ~60 min). _(SmartBear/Cisco case study —
   primary, 3-0 / 2-1; observational, not RCT)_
3. **Google's own scale data:** >35% of changes touch one file, ~90% under 10 files, >10% single-line, **median 24
   lines** — smaller than peer firms, in line with open source. _(Sadowski et al., ICSE-SEIP 2018 — primary, 3-0)_
4. **Smaller changes get faster review _feedback_ but do NOT merge faster.** Google: median initial feedback <1h
   (small) vs ~5h (very large). But an **845,316-PR study across 10 languages** (Kudrjavets et al., MSR 2022) found
   PR size **does not correlate with time-to-merge** — "reducing change size does not increase code velocity." This
   refutes the _velocity_ premise while leaving the _review-quality_ premise intact. _(Google + arXiv:2203.05045 —
   primary, 3-0)_
5. **Google explicitly endorses up-front splitting strategies:** stacking, by-file, horizontal (layered), vertical
   (full-stack), plus an implementation-plan grid "where each cell is its own standalone CL." Direct prior art for
   planning seams during decomposition. _(google.github.io/eng-practices — primary, 3-0)_
6. **Stacked PRs/diffs are the primary tooling mechanism.** A stack is fundamentally a **dependency graph** that
   must merge **bottom-up**; tooling cannot treat entries as independent. `ghstack` maps each commit to its own PR
   (synthetic bases) → cannot merge via normal GitHub UI; needs a dedicated land workflow. _(Graphite + ghstack
   README — primary, 3-0)_
7. **Stacking carries real author-overhead scaling with cross-cutting-ness.** In `ghstack`'s per-commit-PR model,
   conflicts resolve in **each** PR on rebase, not once. Stack-aware merge queues (Graphite) mitigate by running CI
   only on the stack head, then fast-forward merging all PRs in dependency order. _(ghstack + Graphite — primary,
   3-0)_
8. **The Linux kernel patch-series + cover-letter model** is mature, institutionalized prior art, planned up
   front: each patch does "one thing only"; the cover letter (patch 0) narrates whole-series rationale + per-patch
   summaries; each logical change is a separate self-contained patch. _(kernelnewbies + kernel.org — primary, 3-0)_
9. **The kernel answers transient inconsistency on `main` with a hard bisectability rule:** when a change is
   divided into a series, **every intermediate state must build and run** — `main` is never left half-applied
   between entries. The consistency-at-the-merge-boundary discipline up-front decomposition must satisfy (implies
   expand → migrate → contract ordering, which must be _planned_). _(kernel.org submitting-patches — primary, 3-0)_

**Refuted (0-3):** "Each patch must be reviewable _without_ context from surrounding patches." The kernel does
**not** require this — patches may rely on series context for review (the cover letter exists precisely for that).

## Caveats

- The defect-detection evidence leans heavily on one 2006 single-org observational study (correlational, not
  causal); some figures (60-min wear-out, 300–400 LOC ceiling) are borrowed/derived, not measured there.
- "Smaller is better" splits by outcome variable: **strong** for review thoroughness, **explicitly not supported**
  for merge speed (and time-to-merge is genuinely noisy — some vendor analyses find larger PRs merge faster).
- Graphite sources are vendor self-descriptions (fine for tool-behavior facts, not independent benchmarks); the
  fast-forward-merge optimization is configurable.
- Google size stats are 2016–2018; native stacked-PR tooling has since evolved (GitHub, April 2026) — improves
  navigation without changing the synthetic-base merge model.
- The hardest case — **atomic consistency sweeps where `main` must be coherent at every merge** — is largely
  **inferential** from the kernel bisectability rule, not a dedicated study.

## Open questions (carried into the WU's planning)

- For an atomic consistency sweep (e.g. a verb renamed across files), what is the best decomposition pattern —
  expand/contract as separate mergeable units vs. a single non-splittable unit — and at what scope threshold does
  splitting stop being safe?
- Does deciding seams **up front** measurably beat discovering them at integration (review quality, rework, rebase
  cost), or is the kernel/Google success driven more by author skill than timing?
- True author-overhead delta of stacking for cross-cutting changes specifically; at what stack depth does it exceed
  the review-quality benefit?
- Can stack-eligibility be derived **mechanically** (each split leaves the build green and the tree semantically
  consistent)?

## Sources

Primary: `google.github.io/eng-practices/review/developer/small-cls.html` · SmartBear/Cisco case study (PDF) ·
Sadowski et al. ICSE-SEIP 2018 (Google, `storage.googleapis.com/.../4476.pdf`) · Kudrjavets et al. MSR 2022
(`arxiv.org/pdf/2203.05045`) · `graphite.com/blog/the-first-stack-aware-merge-queue` ·
`github.com/ezyang/ghstack` · `kernelnewbies.org/PatchSeries` · `docs.kernel.org/process/submitting-patches.html`.
Supporting (blog / secondary): `martinfowler.com/bliki/SemanticConflict.html` ·
`trunkbaseddevelopment.com/branch-by-abstraction` · `graphite.com/guides/stacked-diffs` ·
`michaelagreiler.com/stacked-pull-requests` · `infoq.com/news/2026/04/github-stacked-prs` · plus contrarian /
failure-mode posts (jg.gg, yykamei.dev, pragmaticengineer, HN).

---

## Idiom re-examination (2026-07-20)

> _Second research pass (heavy-research: 4 angles, 9 sources, 44 claims, 10 adversarially verified, 3 survived; run
> `woggn2yog`). Commissioned during grooming to pressure-test the stacked-PR mechanism against recent (2025–2026)
> criticism and its alternatives before committing. Confidence is labeled per finding; much of the comparative
> material is strong-but-unverified leads (past the 10-claim verify budget), not verified claims._

**Verified (survived adversarial verification):**

- **Native GitHub stacked PRs are not GA.** GitHub shipped a first-party `gh-stack` CLI extension, but it entered
  **private preview on 2026-04-13, waitlist-gated** — not generally available _(high confidence)_. → Do not build a
  hard dependency on native GitHub stacking, or on any single tool, now.
- **Rebase-cascade cost is real and unresolved.** Rebasing a stack's base branch forces manual rebasing of every
  downstream branch; 2026 tooling has not eliminated it _(medium — 2/3 skeptic votes)_.

**Strong leads (corroborated / primary-source, but past the verify budget):**

- **The "only Graphite" claim is weak.** Multiple tools automate stacking (Graphite, ghstack, git-town, spr,
  Sapling, Aviator, stax, Jujutsu); Google runs native stacking on internal tooling (Piper / Critique), independent
  of any third-party stack tool — so stacking-as-workflow is not Graphite-locked. _Caveat:_ on **native GitHub
  specifically**, dedicated tooling is still needed for key operations (merging only the approved leading portion;
  per-commit review), because the real gap is **GitHub's per-commit presentation** ("Files Changed" collapses a
  stack into one diff) — a product gap, not a property intrinsic to stacking (Gerrit reviews per-commit natively).
- **Squash / rebase merge breaks cross-stack commit-identity** — a tool-agnostic failure mode, and squash-merge is a
  common GitHub default. _Directly corroborates the inherited assurance algebra's tree-exact / commit-identity
  concern — that part is not over-engineered._
- **CI cost:** each stacked PR runs CI against its immediate base, not `main` — needs CI configured for non-main
  bases.
- **Depth ceiling ~3–4 PRs** (independently corroborated across InfoQ + dev.to; pullnotifier says 3–5): beyond that,
  inter-PR dependency-tracking overhead exceeds the review-quality benefit.

**Retrofit case (B) — the key finding for the live driving case:**

- **No verified finding supports retrofit-splitting; documented mature practice argues against it.** Google: plan
  ahead; if a change is _unavoidably_ large, keep it large with **advance reviewer consent + heightened scrutiny** —
  do not re-split. Linux kernel: decompose **up front** by logical concern, throttle posting (~15 patches at a
  time), and express inter-patch dependencies via **plain-text notation in the patch description**, not stacking
  tools.
- **Implication:** the industry-aligned answer for an already-built coherent change is a **review decomposition**
  (cover letter / reviewer's guide + logical-commit structure + guided review order + heightened scrutiny), **not**
  a re-split into a mergeable stack. This maps onto ARC's existing `spec` / `meta` / `cohort` (≈ cover letter) and
  task-list phases (≈ logical structure) — so retrofit is achievable with no new merge topology.

**Net for the design:** the reframe (reviewability = goal; stacking = one constrained mechanism) is well-supported.
Up-front stacking is viable **if** tool-neutral, depth-capped, and squash-merge-aware; retrofit is best served as a
review decomposition, not a stack.

**Sources (2026-07-20 pass):** `infoq.com/news/2026/04/github-stacked-prs` · `dev.to/alanwest/…stacked-prs` ·
`codex.danielvaughan.com/2026/04/16/…gh-stack-sapling…` · `pullnotifier.com/tools/stacked-prs` ·
`awesomecodereviews.com/best-practices/stacked-prs` · `graphite.com/docs/evaluating-tools` (vendor) ·
`google.github.io/eng-practices/review/developer/small-cls.html` ·
`docs.kernel.org/process/submitting-patches.html` · `lobste.rs` + HN practitioner threads.

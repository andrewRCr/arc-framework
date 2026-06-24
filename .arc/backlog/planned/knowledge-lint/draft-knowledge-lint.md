# Draft: Knowledge-Base Lint

- **Origin:** [internal] — surfaced during an OKF / LLM-wiki idiomatic-alignment exploration (2026-06-13).
- **State:** Provisional — captured from the alignment exploration; scope and cohort decision not yet planned.
- **Purpose:** Establish "Lint" as a named, first-class ARC operation — periodic knowledge-base health checks over
  the `.arc/` doc tree — and give the scattered mechanical doc-checks a correctly-named home, separate from
  `quality-gate-hooks`' (adopter-stack) gate dispatch.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Refresh the methods README Index to exhaustive directory coverage**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: knowledge-lint`), housekeep drain (2026-06-18); captured
  during `planning-pipeline-readiness` Task 1.1 — authoring `assess-draft-readiness` surfaced the gap.
- *Concern:* `system/methods/README.md` (package source and `.arc/` copy both) carries a stale `## Index` — it
  omits several existing methods (`resolve-planning-depth`, `branch-format`, `spec-review`, `assess-parallel-fit`,
  `assess-draft-readiness`; re-confirmed stale at drain, 2026-06-18). Not curated-by-design as first assumed; just
  lagging the directory.
- *Proposed:* restore Index ↔ `system/methods/*.md` parity as a one-time fix, then prefer a lint/consistency check
  that enforces it mechanically over hand-maintenance — a README-index↔directory parity check fits this WU's
  mechanical-lint remit directly.

### `[ ]` **Standing guard: assert durable docs match the shipped lifecycle verb register**

- *Routed from:* USER-INBOX housekeep drain (2026-06-24); captured at `lifecycle-closeout` Task 5.1.d
  (2026-06-23). Fits this WU's mechanical-lint tier (forbidden-pattern / stale-claim checks over the `.arc/` doc
  tree), distinct from `quality-gate-hooks`' adopter-stack gate dispatch.
- *Concern:* nothing standing asserts the durable doc corpus matches the shipped lifecycle verb register /
  transition table — the `lifecycle-closeout` certifying audit *was* that check, manual and one-shot. With only
  markdown-lint (format-only) gating the corpus, a retired-verb token can silently re-enter a durable surface; the
  audit caught exactly this live (`QUICK-REFERENCE` + `cli.ts` `--help` still reading "graduate a backlog stub in
  place" after the `graduate → promote` sweep).
- *Approach:* a forbidden-pattern check flagging retired transition-verb tokens (`graduate` / `graduation`
  as-transition, the `--lifecycle` flag spelling, slug-matched-drain language) in durable surfaces, carrying the
  known false-positive allowlist (`graduated lookup`, `draft-* → notes-*` content-promotion colloquial, the `src/`
  internal `graduate` arm name, ADR / historical snapshots). A richer variant asserts doc verb-mentions against
  the code transition table; the cheap variant is the token denylist + allowlist (seed already in closeout's
  `notes-*` A1 inventory).
- *Scope:* both copies. Verb-register-check ownership is itself unsettled (`idiomatic-alignment` excludes
  internal-vocab renaming) — coordinate which WU owns the token set.

---

## Problem / Motivation

Karpathy's LLM-wiki and Google's OKF both name three operations over a markdown knowledge base: ingest, query, and
**lint**. ARC has the first two richly built (session-lifecycle + housekeep + handoff = ingest/curate; session-init
load + on-demand strategy/method loading = query) but **no standing Lint operation at all**. The closest standing
machinery is `markdownlint` (format only), `point-scanner` (extension fire-points only), and the package-sync hooks.
`doc-cascade-sweep` was a *one-shot* reconciliation work unit, not a recurring mechanism — so nothing periodically
checks the knowledge base for consistency.

Karpathy's lint flags six things, verbatim: *contradictions between pages, stale claims that newer sources have
superseded, orphan pages with no inbound links, important concepts mentioned but lacking their own page, missing
cross-references, data gaps fillable by web search.* He frames lint as a **discovery tool, not an autofixer** — it
surfaces, the human/agent decides. That framing maps onto a clean two-tier split ARC's own instinct already matches.

## Lint checks vs. ARC today

| Lint check | ARC status |
| --- | --- |
| Missing / broken cross-references | **already captured** — `quality-gate-hooks` buffer ("Enhanced link validation": whole-tree broken-link scan, broken outbound links from moved files, anchor + dup-definition checks), but **mis-homed** there |
| Stale claims — mechanical (forbidden-pattern, relocatability) | **already captured** — same buffer ("Forbidden-pattern checks", "Relocatability enforcement"), also mis-homed |
| Orphan pages (no inbound links) | **new** — captured nowhere; small mechanical check |
| Contradictions / semantic stale-claims | **new** — the agent-run sweep; unowned, harder |
| Concepts-without-page / web-gap-fill | n/a — ARC's doc set is bounded, not an accreting research wiki |

## Design sketch

- **Two tiers, matching Karpathy's discovery framing.**
    - **Mechanical → hooks/CLI.** Orphan-artifact detection + dangling-link / broken-ref detection + the
      forbidden-pattern and relocatability checks. Deterministic, runnable at a gate or as `arc lint` (name TBD).
    - **Semantic → agent-run sweep.** Contradiction and stale-claim detection across artifacts — the standing,
      recurring sibling that `doc-cascade-sweep` was a one-shot instance of. Surfaces candidates; never auto-edits.
- **Absorb the mis-homed checks.** The link-validation / forbidden-pattern / relocatability entries currently parked
  in `quality-gate-hooks`' inbound buffer are *knowledge-base lint*, not adopter-stack gate dispatch — they migrate
  here. That keeps `quality-gate-hooks` narrow and correctly named (tier ↔ git-hook-stage mapping + adopter-command
  dispatch).
- **Name the operation.** Giving Lint a first-class identity (mirroring ingest/query) is itself the organizing win —
  it turns "assorted doc hooks" into a coherent capability with a clear charter.

## Relationship to other work

- **`quality-gate-hooks`** — sibling and likely **cohort** partner (decision deferred to planning). Both are
  "enforcement," at different layers: quality-gate-hooks gates the *adopter's stack* (linters/tests/typecheck at
  commit/push/handoff); this guards *ARC's own knowledge-base consistency*. The mechanical checks migrate from its
  buffer to here; coordinate the split and the cohort question at planning time.
- **`idiomatic-alignment`** — the convention-side sibling of the same OKF / LLM-wiki convergence; coordinate framing.
- **`naming-conventions`** — owns the forbidden-pattern *rules* this lints against; this owns their enforcement.

## Open questions

- Cohort with `quality-gate-hooks`, or standalone siblings? (Cohorting moves quality-gate-hooks' dir + adds a
  `cohort-*.md`; decide whether the coordination earns that ceremony.)
- Where the mechanical tier runs: a new `arc lint` command, a pre-commit/pre-push CHECK, a CI step, or several.
- Cadence for the semantic sweep: handoff-time, a periodic ceremony, or on-demand only.

## Scope estimate

Medium. The mechanical tier is mostly relocation + two new checks (orphan, dangling-link); the semantic agent-sweep
is the design-heavier, genuinely new part.

---

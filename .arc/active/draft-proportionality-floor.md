# Draft: proportionality-floor

- **Origin:** [internal]
- **Purpose:** Give ARC an always-loaded proportionality floor — a minimal universal rule that guards against
  scope creep and disproportionate mechanism at every moment the existing planning-time method cannot reach
  (implementation choices, review responses, proposed fixes, errands) — plus a spec-side scope-boundary chain
  that carries a work unit's Won't-Do commitments from draft through spec into implementation and review, where
  they become the reference point every proposed change is checked against.

---

## Problem / Motivation

ARC's proportionality doctrine is planning-only. `assess-design-proportionality` fires at the three planning
stages (`draft-design`, `create-spec`, `generate-tasks`) and nowhere else. The always-loaded rule set covers the
_scope_ half of the problem — Anti-rider, Discovered Work Routing, and the review finding mutation guard all
police whether out-of-scope work rides in — but nothing always-loaded polices the _complexity_ half: how much
machinery the in-scope change itself accumulates. Two recurring failure modes result:

1. **Execution-time over-engineering.** Mid-implementation and review-response work adds mechanism with no
   proportionality check in context. The worst instances are speculative edge-case hardening rabbitholes:
   imagined threat models that don't fit the surface being protected, where robustness is real but its cost is
   wildly disproportionate to the consequence of the path it guards. These have produced multi-thousand-line
   excursions recognized as unnecessary only after shipping.
2. **Drip-creep through reasonable-sounding suggestions.** A genuine finding gets a proposed fix that quietly
   exceeds the finding. The operator — typically attending a heavier session elsewhere — hears a plausible
   suggestion, approves it, and each approval feeds the next. By ship time a second work unit has been grafted
   on. The gap is informed consent: expansions were never _named_ as expansions, and the minimal response was
   never separated from the enhancement, so each decision looked smaller than it was.

Both failure modes need an _always-on_ guard, which puts the fix on the token-premium always-loaded surface —
so the rule must itself be minimal-sufficient, and its cost offset by consolidation where possible.

## Design (settled)

**1. The floor — one short section in `DEV-RULES.ARC` (~120–150 words, a default, not an invariant).**
Written as a compression of the method's own judgment questions so rule and method are one doctrine at two
altitudes, never two doctrines:

- **Necessity trace:** every material mechanism traces to a stated goal, real constraint, actual trust
  boundary, or observed failure. Plausibility, thoroughness, symmetry, and imagined threat models are not
  requirements.
- **Compose first:** prefer existing substrate over new mechanism.
- **Consequence-scaled rigor:** concentrate exactness where failure is destructive, authoritative, or
  irreversible; advisory and retryable paths get lighter treatment.
- **Bounded adequacy rail:** never simplify away behavior required for correctness, safety, or a stated goal —
  where "required" passes the _same_ necessity trace. The rail is symmetric with the trace by construction, so
  it cannot be read as license for speculative hardening.
- **Scope boundary binding:** a spec's scope boundary is pre-commitment text (§ Rule Authority); a proposal
  that crosses it is _named as a scope expansion_ and routed as a forward amendment — agent proposes, scope
  owner decides.
    - **Amendment model (settled):** the boundary _freezes at activation_ (Planning → Active). Before that,
      planning churn edits freely — amendment ceremony during authoring would be noise. After activation, the
      section still edits in place so the spec always reads as what IS, but every boundary change — expansion
      _or_ contraction (deferring committed scope out changes the commitment too) — appends a compact
      amendment record: date, the delta, what prompted it. Not a parallel ADR log; provenance lines inside the
      section, in the spirit of ADR amendment records.
    - **Boundary-only, deliberately.** The boundary is a _guard_ — pre-commitment text consulted at approval
      moments — so its provenance is load-bearing: the amendment trail is what keeps the check honest and
      makes drip visible. Other spec sections are _records_, whose provenance git history and task-list
      completion notes already carry. Generalizing amendment ceremony to every routed-back design refinement
      would tax exactly the behavior we want more of (routing emergent design to the spec) and push design
      debt back into code and notes. Generalize later only on observed need.
- **Decision unbundling:** the minimal in-scope response to a finding is proposed on its own; any enhancement
  beyond it is a separately-named, separately-decided proposal. Expansions never ride an approval for the fix
  they accompany.
- **Altitude pointer:** at planning boundaries the deep instrument is `assess-design-proportionality`;
  everywhere else, apply the trace as one inline judgment.

The unbundling + naming clauses are the anti-drip-creep mechanic: they keep each approval the size it appears
to be, and the forward-amendment record makes accumulation visible in the spec with no counting machinery.

**Candidate rule text** (~135 words; section "Proportionality", placed adjacent to § Scaled Process, Invariant
Discipline — that section says discipline never scales down, this one says machinery never scales up unearned):

> ## Proportionality
>
> Every material mechanism — in a design, an implementation, a proposed fix, a review response — traces to a
> stated goal, real constraint, actual trust boundary, or observed failure; plausibility, thoroughness,
> symmetry, and imagined threat models are not requirements. Prefer composing existing substrate over new
> mechanism. Concentrate rigor where failure is destructive, authoritative, or irreversible; advisory and
> retryable paths get lighter handling. The same trace bounds simplification: never drop behavior it marks as
> required.
>
> A spec's scope boundary is pre-commitment text (§ Rule Authority). Propose the minimal in-scope response to
> a finding on its own; anything beyond it is a separate proposal, named as a scope expansion, landing only by
> forward amendment — the scope owner decides with the expansion in plain sight. At planning boundaries the
> deep instrument is `assess-design-proportionality`; everywhere else, apply this trace as one inline
> judgment.

**2. The scope-boundary chain (design-process leg).**

- `template-draft.md`: **replace `## Scope Estimate` with a scope-boundary (Won't Do) section**, retaining the
  old section's "Dependencies on other work, if any" prompt inside the new section — dependency edges are
  boundary-adjacent content, and pre-meta drafts (pre-WU or grooming) need a home for them. The replacement
  grounding covers the size estimate only: verified no workflow or method consumes it (the sole reference is
  the template itself), and size estimation was speculative and misleading; boundary content is what
  downstream stages actually need.
- `draft-design` → `create-spec`: one carry-forward line each — the spec's scope section inherits and sharpens
  the draft's boundary, never silently drops it. All four spec forms already carry a boundary section (brief:
  in-paragraph clause; outline: `## Scope boundary (No-gos)`; PRD/RFC: `## Non-Goals`) — no new sections, but
  each of the four gains one shipped line inside its boundary section as the **amendment model's carrier**:
  _Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_ (the brief form
  appends amendment lines after its floor paragraph). The rule sits exactly where a mid-impl editor is looking
  when it fires; no `activate-work-unit` edit — a second carrier would be redundant machinery.
- No `generate-tasks` change — `template-tasks.md` already declares the design canonical for scope.

**3. Consolidation offsets (token budget).**

- `DEV-RULES.PROJECT` § Engineering Standards "Scope discipline" lines: **remove entirely** — the universal
  floor absorbs them, including the authority framing (scope decisions belong to whoever set the scope), which
  must survive in the floor's wording.
- During implementation, sweep `DEV-RULES.ARC` for phrasing-level consolidation opportunities (Anti-rider and
  Discovered Work Routing adjacency).
- **Two budgets, stated honestly:** `DEV-RULES.PROJECT` does not ship, so its removal offsets only this
  repository's always-loaded set (repo-local net ≈ zero). Adopters' always-loaded set grows by the floor's
  full length — capped at ≤150 words — with the `DEV-RULES.ARC` sweep as best-effort offset, not a guarantee.

**4. Reviewer boundary provisioning** (`adversarial-review` § Context provisioning — context, not a rubric
edit). Add the governing spec's scope boundary to the frontline/standard review artifact rows, plus one
finding-shape sentence: a finding whose remedy crosses the boundary must say so and ground the crossing in
behavior required for correctness, safety, or a stated goal — stated **self-contained**, because reviewers
never load `DEV-RULES` and cannot chase a rail cited by name. Grounding: at `verify-work-unit` reviewers
already receive the spec, but the frontline/standard rows supply only the change target + audit lens, and the
fixed orientation set is briefs-only, so neither the floor nor the boundary can reach them. Because those
lanes are fire-point rows of this one provisioning table, the single edit covers the agent-side review
architecture without touching any rubric method. Two-copy edit (package source + `.arc/`).

**Success signal:** `DEV-RULES.ARC` carries the Proportionality section (≤150 words) and `DEV-RULES.PROJECT`'s
Scope-discipline lines are gone — repo-local always-loaded growth near zero, adopter-side growth ≤150 words;
`template-draft.md`'s Scope Estimate is replaced by a scope-boundary section (dependencies prompt retained) that
`draft-design` and `create-spec` explicitly carry forward; each spec form's boundary section ships the one-line
amendment contract; `adversarial-review`'s frontline/standard artifact rows supply the governing spec's scope
boundary with the self-contained finding-shape rule — all as two-copy edits passing the framework-sync gate.

## Alternatives

- **Extend the method's fire-points into execution/review:** rejected — the method is a deep instrument with
  named inputs and a verdict contract; firing it per-change at execution is exactly the disproportionate-rigor
  it exists to catch. The floor is the right altitude for always-on.
- **A separate skill (MSW / ponytail shape):** rejected — harness-specific, opt-in, not universal. Their core
  insights (deletion test ≈ necessity trace; decision ladder ≈ compose-first) are absorbed into the floor in
  ARC vocabulary instead.
- **Review-method / rubric edits:** rejected — the standard-review rubric already carries an intent-and-scope
  dimension, and the floor governs the agent's own proposals; adding more surface would be self-defeating.

## Unknowns and Assumptions

- **Settled:** section name "Proportionality", placed adjacent to § Scaled Process, Invariant Discipline;
  candidate rule text approved at ~135 words (see Design). **Settled:** `template-dev-rules.md` is a
  placeholder skeleton with no scope-discipline analogue — nothing to trim there.
- Verify every touched file has an `init-recipe.json` disposition before shipping (working-memory caveat:
  presence in the package tree is not evidence a file ships).
- **Package-source-first editing** applies throughout (`packages/arc-framework/arc/**` → sync to `.arc/`);
  workflow edits require `strategy-workflow-authoring` loaded first.
- Assumption: the floor as a _default_ (not invariant) suffices — its scope-boundary clause leans on the
  existing pre-commitment-text invariant for the non-bypassable part.

## Scope boundary (Won't Do)

- No rubric-method edits (`frontline-review`, `standard-review`, severity model, exit gate) — Design item 4's
  § Context provisioning edit provisions context and is not a rubric change.
- **No hosted-review changes.** The static hosted guidance blocks are `review-protocol-alignment`'s (its
  design unit owning the guidance surface is mid-redesign), and hosted per-WU context provisioning is a
  design question inside that surface. The primary-side filter — the floor plus decision unbundling at
  triage — remains the universal backstop for hosted findings. The seam thought routes to `USER-INBOX` with
  the cohort as target, not into this WU.
- No changes to `assess-design-proportionality`'s body or contract — the floor points at it; the complement is
  achieved by compression, not by editing the method.
- No cumulative-expansion tracking, counters, or new machinery — amendment records in the spec are the
  visibility mechanism.
- No new methods, extensions, workflows, or CLI surface.
- No `generate-tasks` changes.
- Boundary adjustments to this list follow the floor's own protocol: named expansion, forward amendment,
  scope owner decides.

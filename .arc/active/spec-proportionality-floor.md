# Spec (`outline`): proportionality-floor

- **Origin:** [internal]

- **Purpose:** Give ARC an always-loaded proportionality floor — a minimal universal rule guarding against
  disproportionate mechanism at every moment the planning-time method cannot reach — plus a scope-boundary chain
  that carries a work unit's Won't-Do commitments from draft through spec into implementation and review, where
  they become the reference point every proposed change is checked against.

---

## Problem / Context

ARC's proportionality doctrine is planning-only. `assess-design-proportionality` fires at the three planning
stages and nowhere else. The always-loaded rule set covers the _scope_ half of the problem — Anti-rider,
Discovered Work Routing, and the review finding mutation guard all police whether out-of-scope work rides in —
but nothing always-loaded polices the _complexity_ half: how much machinery the in-scope change itself
accumulates. Two failure modes recur:

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

Both modes need an _always-on_ guard, which puts the fix on the token-premium always-loaded surface. The rule
must therefore be minimal-sufficient itself, and its cost offset by consolidation where possible.

The guard has a symmetric failure mode of its own, and preventing it is part of this work unit's charter. A
restraining rule read literally can produce under-delivery — an agent that treats a missed callsite or an
unfinished migration as "not requested scope." That failure is precedented: the shipped
`judgment-authority-model` records three observed instances of over-literal rule adherence and concludes that a
high-traffic rule must state its own derivation in its own text rather than trusting each reading to
reconstruct it. The floor answers the incomplete-change case directly, in its own text. The adjacent case — a
_defect_ discovered mid-change — stays with Discovered Work Routing and Anti-rider, which already resolve it
(fold in a same-concern fix; route a distinct concern). Nothing here narrows those rules, § Rule Authority, or
the issue-triage path; the floor must simply not appear to.

## Decision(s)

**D1 — A `## Proportionality` section lands in `DEV-RULES.ARC`, adjacent to § Scaled Process, Invariant
Discipline.** The adjacency carries the pairing: that section says discipline never scales down, this one says
machinery never scales up unearned. The section is written as a compression of `assess-design-proportionality`'s
own judgment questions, so rule and method are one doctrine at two altitudes rather than two doctrines. Capped
at ≤160 words. The approved text (160 words):

> ## Proportionality
>
> Every material mechanism — in a design, an implementation, a proposed fix, a review response — traces to a
> stated goal, real constraint, actual trust boundary, or observed failure; plausibility, thoroughness,
> symmetry, and imagined threat models are not requirements. Prefer composing existing substrate over new
> mechanism. Concentrate rigor where failure is destructive, authoritative, or irreversible; advisory and
> retryable paths get lighter handling. The same trace bounds simplification: never drop behavior it marks as
> required.
>
> A spec's scope boundary is pre-commitment text (§ Rule Authority); unrequested capability is a scope
> decision, not engineering taste. Propose the smallest complete in-scope response to a finding or request on
> its own; anything beyond it is a separate proposal, named as a scope expansion, landing only by forward
> amendment — the scope owner decides with the expansion in plain sight. Finishing what a change requires —
> callsites, migrations, tests — is completion, not expansion. At planning boundaries the deep instrument is
> `assess-design-proportionality`; everywhere else, apply this trace as one inline judgment.

Nine clauses are load-bearing and must survive any rewording: necessity trace, compose-first,
consequence-scaled rigor, bounded adequacy rail, scope-boundary binding, authority attribution, decision
unbundling, completion rail, altitude pointer.

**D2 — Every restraining clause sits adjacent to its counterweight.** The ordering is load-bearing, not
stylistic: consequence-scaled rigor (which licenses lighter handling) is immediately bounded by the adequacy
rail, and expansion-naming (which licenses withholding) is immediately bounded by the completion rail. No
clause that permits doing less appears without its bound in the same breath — this is what makes a literal
reading safe. The adequacy rail is symmetric with the trace by construction ("required" passes the _same_
necessity trace), so it cannot be read as license for speculative hardening; `requires` in the completion rail
inherits the same definition by parallel construction, and its concrete triple bounds it to mechanical
completion rather than "this change requires a redesign."

**D3 — The floor is a default, not an invariant.** The non-bypassable part is already carried: § Rule Authority
makes pre-commitment text non-rewritable by the agent, and the scope-boundary clause leans on that invariant
rather than minting a second one. Unbundling and naming are the anti-drip-creep mechanic — they keep each
approval the size it appears to be.

**D4 — A spec's scope boundary freezes at activation (Planning → Active); changes after that append a compact
amendment record.** Before activation, planning churn edits freely — amendment ceremony during authoring would
be noise. After activation the section still edits in place, so the spec always reads as what IS, but every
boundary change — expansion _or_ contraction, since deferring committed scope out changes the commitment too —
appends `Amended YYYY-MM-DD — <delta> — <prompt>`. Provenance lines inside the section, in the spirit of ADR
amendment records; not a parallel log.

**D5 — Amendment ceremony is boundary-only, deliberately.** The boundary is a _guard_ — pre-commitment text
consulted at approval moments — so its provenance is load-bearing: the amendment trail is what keeps the check
honest and makes drip visible. Other spec sections are _records_, whose provenance git history and task-list
completion notes already carry. Generalizing amendment ceremony to every routed-back design refinement would tax
exactly the behavior we want more of (routing emergent design to the spec) and push design debt back into code
and notes. Generalize later only on observed need.

**D6 — `template-draft.md` replaces `## Scope Estimate` with a scope-boundary (Won't Do) section, retaining the
old section's "Dependencies on other work, if any" prompt inside the new one.** Dependency edges are
boundary-adjacent content, and pre-meta drafts (pre-WU or grooming) need a home for them. The replacement is
grounded on the size estimate alone: no source consumes it — the remaining matches are draft instances and three
inline test fixtures, and nothing under `packages/arc-framework/src` reads any draft section name — while size
estimation was speculative and misleading and boundary content is what downstream stages actually need. The
change is forward-only.

**D7 — Each of the four spec forms gains one shipped carrier line at its existing boundary surface, and
`create-spec` is told to retain it on emit.** All four already carry a boundary surface — `brief`: an
in-paragraph clause; `outline`: `## Scope boundary (No-gos)`; PRD and RFC: `## Non-Goals`. Each gains the
amendment model's carrier: _Frozen at activation; changes after that append:
`Amended YYYY-MM-DD — <delta> — <prompt>`_. The rule sits exactly where a mid-implementation editor is looking
when it fires, so no `activate-work-unit` edit is needed — a second carrier would be redundant machinery. Three
structural cases are settled rather than left to the implementer:

- **Survival on emit.** A template's section body is author-replaced guidance, and `create-spec`
  § Write and save carries a closed strip contract listing what to _remove_ — so an unmarked line inside a
  replaced body is the most likely thing to be lost. That section gains an explicit retain instruction for the
  boundary carrier. Without it the carrier reaches no finalized spec and D4's amendment model has no delivery
  path, while every template-level criterion still passes.
- **`brief`.** The form has no boundary _section_ — one paragraph fuses intent, scope boundary, and the success
  signal, under a standing "revise in place" instruction. The carrier attaches to the **scope-boundary clause**
  and the freeze governs that clause alone, consistent with D5's boundary-only ceremony; amendment lines append
  after the paragraph. Intent and the success signal keep revising in place, unfrozen.
- **Paired PRD + RFC.** The RFC's `## Non-Goals` is flagged `omit-when-paired`, so a paired set drops it and the
  PRD's carrier is the surviving one: exactly one carrier governs each spec either way.

`draft-design` and `create-spec` each also gain one carry-forward line: the spec's boundary section inherits and
sharpens the draft's boundary, never silently drops it. `generate-tasks` is untouched — `template-tasks.md`
already declares the design canonical for scope.

**D8 — The Scope-discipline lines are removed from `DEV-RULES.PROJECT`, in both copies.** The file ships
(`init-recipe.json` `include_files`), so both copies carry the doctrine the floor now absorbs, under different
headings: `.arc/system/rules/DEV-RULES.PROJECT.md` § Engineering Standards, and
`packages/arc-framework/arc/system/rules/DEV-RULES.PROJECT.md` § Code Quality Principles. Both are removed; the
authority framing they carried survives in the floor's `unrequested capability is a scope decision, not
engineering taste` clause. A best-effort phrasing-level sweep of `DEV-RULES.ARC` (Anti-rider and Discovered Work
Routing adjacency) rides along as a further offset. `template-dev-rules.md` needs no trim: it is a placeholder
skeleton with no scope-discipline analogue.

**D9 — Reviewer provisioning is one edit to `adversarial-review` § Context provisioning, scoped in prose to the
frontline and standard rows.** That section gains the governing spec's scope boundary on those two artifact
rows, plus a finding-shape sentence bound to the same two rows: a finding whose remedy crosses the boundary must
say so and ground the crossing in behavior required for correctness, safety, or a stated goal — stated
**self-contained**, because reviewers cannot be assumed to load `DEV-RULES` and must not have to chase a rail
cited by name. Both apply only when the change under review is governed by a spec; frontline and standard passes
routinely run on Errands and off-WU work where no boundary exists. The explicit row scoping is required, not
stylistic: § Context provisioning is a single shared section, so an unqualified sentence there would read on
every fire-point, including the planning rows where the boundary is the artifact under audit.

**Alternative considered — `implementation-audit`'s finding floor.** That method is the effective lens for both
named lanes and already owns a finding floor, which makes it the better home on method-contract grounds
(`adversarial-review` states it "is not itself a rubric"). Rejected because it buys no reach and costs
coherence: the standard-review carrier projects its reviewer instructions from the **typed**
`implementation-audit/v1` contract registered in code, whose `findingFloor` carries four requirements — so the
markdown edit would reach exactly the `adversarial-review`-carried lanes it reaches here, while leaving the
markdown twin of a code-authoritative contract carrying a fifth requirement the contract does not. Closing that
gap would require bumping the typed floor, which trips the rubric-version guard and is a hosted-review change
this spec's boundary forbids.

## Scope boundary (No-gos)

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- **No rubric-method edits.** No changes to `frontline-review`, `standard-review`, `implementation-audit`, the
  severity model, or the exit gate; no dimension is added, removed, or reweighted. D9's `adversarial-review`
  edit provisions context and is not a rubric change.
- **No hosted-review changes.** The static hosted guidance blocks belong to `review-protocol-alignment` (its
  design unit owning the guidance surface is mid-redesign), and hosted per-WU context provisioning is a design
  question inside that surface. This also forecloses touching the typed `implementation-audit/v1` `findingFloor`
  or its rubric digest. The primary-side filter — the floor plus decision unbundling at triage — remains the
  universal backstop for hosted findings. The seam thought routes to `USER-INBOX` with that cohort as target,
  not into this WU.
- **No changes to `assess-design-proportionality`'s body or contract.** The floor points at it; the complement
  is achieved by compression, not by editing the method.
- **No changes to Discovered Work Routing, Anti-rider, or § Rule Authority.** The floor composes with them; a
  phrasing-level consolidation sweep (D8) may tighten wording but changes no rule's force or shape.
- **No cumulative-expansion tracking, counters, or new machinery.** Amendment records in the spec are the
  visibility mechanism.
- **No new methods, extensions, workflows, or CLI surface.**
- **No `generate-tasks` changes.**
- **No migration of existing drafts.** Drafts already carrying `## Scope Estimate` keep it until each is
  independently groomed; D6 is forward-only.
- Boundary adjustments to this list follow the floor's own protocol: named expansion, forward amendment, scope
  owner decides.

## Consequences & Risks

- **One budget, not two.** `DEV-RULES.PROJECT` ships, so its Scope-discipline removal (~30 words) offsets the
  adopter-side and repo-local always-loaded sets alike. Net growth is therefore roughly +130 words on both,
  with the `DEV-RULES.ARC` sweep as best-effort further offset, not a guarantee. Accepted: an always-on guard
  cannot be paid for anywhere but the always-loaded surface.
- **The cap moved from ≤150 to ≤160 words** to seat the completion rail and the authority attribution together.
  Recorded as a deliberate adjustment made pre-activation, not a silent slide — the alternative was dropping one
  of the two counterweights the floor's safe literal reading depends on.
- **The finding-shape obligation reaches `adversarial-review`-carried lanes only.** Adapter- and hosted-carrier
  evaluators receive their instructions from the typed `implementation-audit/v1` projection, which this work
  unit does not touch, so they get the four-requirement floor unchanged. Accepted: the primary-side filter is
  the backstop for those lanes, and closing the gap is a hosted-review change the boundary forbids.
- **A 160-word compression will under-determine hard cases.** Mitigated by the altitude pointer: planning
  boundaries route to the full method, and the floor claims only the everywhere-else inline judgment.
- **The floor is dischargeable, by construction (D3).** An agent may set it aside by naming the discharging fact
  in the surface the developer is already reading. The scope-boundary half is not dischargeable, because it
  inherits the pre-commitment-text invariant. Accepted: making the whole floor an invariant would over-fire on
  every proportionate mechanism.
- **Amendment records carry no enforcement.** Nothing checks that a boundary edit after activation appended a
  record; visibility is the mechanism, not a gate. Accepted deliberately — a checker is exactly the counting
  machinery the boundary rules out.
- **Existing drafts diverge from the template** until groomed (D6 forward-only). Consistent with the
  pre-public-release posture: no migrations for development-only state.
- **Two of the ten touched files are `Configurable`, not `Framework`,** so the framework-sync gate's
  byte-identity check does not cover them: `system/rules/DEV-RULES.PROJECT.md` (whose copies already differ, by
  heading) and `system/methods/adversarial-review.md` (whose copies already differ). Each takes a targeted edit
  in both copies — never `cp`, which the pre-commit guard blocks. `adversarial-review.md` additionally carries
  string-level assertions in `framework-sync.test.ts`; the D9 edit must leave them satisfied. The other eight
  are `Framework` and must be byte-identical. All ten carry an `init-recipe.json` disposition, so no edit lands
  in a file that reaches nobody.

## Success Criteria

1. `DEV-RULES.ARC` carries a `## Proportionality` section of ≤160 words — counted as whitespace-separated
   tokens containing a word character, excluding the section heading — placed adjacent to § Scaled Process,
   Invariant Discipline, containing all nine load-bearing clauses named in D1 and carrying no `[invariant]`
   marker.
2. Neither copy of `DEV-RULES.PROJECT` contains the Scope-discipline lines (`.arc/` § Engineering Standards,
   package source § Code Quality Principles), and the floor carries the authority attribution that replaces
   them.
3. `template-draft.md` contains no `## Scope Estimate`; it carries a scope-boundary (Won't Do) section that
   retains the dependencies prompt.
4. `draft-design.md` and `create-spec.md` each carry one boundary carry-forward line, and `create-spec`
   § Write and save instructs the author to retain the boundary carrier when emitting a spec.
5. All four spec templates carry the amendment-contract line at their boundary surface, with the `brief` form's
   carrier governing its scope-boundary clause alone; no new section was added to any of them.
6. `adversarial-review.md` § Context provisioning lists the governing spec's scope boundary on the frontline and
   standard review artifact rows and carries the self-contained finding-shape sentence, both explicitly scoped
   to those two rows and conditioned on the change being governed by a spec. Its existing `framework-sync`
   string assertions still pass. No rubric method is modified.
7. The eight `Framework` files among the touched set are byte-identical between `packages/arc-framework/arc/**`
   and `.arc/**` with the framework-sync gate green; the two `Configurable` files carry the intended edit in
   both copies, verified per-copy rather than by that gate.
8. Markdown lint and the ARC contract checks pass.

## Open items

- The yield of the best-effort `DEV-RULES.ARC` phrasing-consolidation sweep (D8) is discovered during
  implementation; it may be zero without failing any criterion above.
- Exact wording of the per-form carrier line and of `create-spec`'s retain instruction (D7). The semantics are
  settled in D7; only the phrasing is open.

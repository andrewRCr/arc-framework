# Research: PR Sizing and Work Unit Boundary Estimation

## Empirical Findings on Code Review Effectiveness and PR Size

Code review effectiveness is well-researched, and the data is remarkably consistent. The empirical
consensus centers on cognitive load as the primary constraint: beyond 400 lines of code (LOC),
defect detection rates degrade sharply, and review quality declines due to reviewer cognitive
overload rather than insufficient effort.

### The 200-400 LOC Sweet Spot

SmartBear's comprehensive 2006 study analyzed 2,500 code reviews across 3.2 million lines at Cisco
Systems. Key findings:

- **Optimal review size:** 200-400 LOC per review yields 70-90% defect discovery rate
- **Inspection rate constraint:** Reviewers maintain 200-300 LOC/hour inspection rate for optimal
  defect detection; rates above 300 LOC/hour (especially above 450) drop defect-detection
  effectiveness to 87% miss rate
- **Time constraint:** Reviews should not exceed 60-90 minutes; defect detection drops significantly
  after this window due to cognitive fatigue
- **Defect density observed:** Cisco reviews averaged 32 defects per 1,000 LOC; 61% of reviews
  uncovered zero defects (suggesting high variance in defect concentration across feature areas)

Importantly, this rate-based finding (300+ LOC/hour → degraded detection) reveals the mechanism:
**cognitive load, not size alone**. A reviewer scanning quickly enough to process 500 LOC/hour is
not carefully reasoning about the code — they are pattern-matching and missing subtle defects.

### Google's Small-Change Distribution

Google's Sadowski et al. research on modern code review at scale provides distribution data:

- **Median changelist size:** ~24 lines of code (dramatically smaller than most industry observations)
- **File breadth:** 90% of code reviews touch fewer than 10 files
- **Single-file reviews:** 35% of changes modify only one file
- **Review velocity:** Most changes receive one reviewer and no iteration comments
- **Impact:** Small, focused changesets directly enable fast review turnaround and high review
  participation rates

Google's internal practices (stacked PRs, small coherent units) are not universal, but the
distribution data demonstrates that teams optimizing for review velocity naturally land at
significantly smaller units than the 200-400 LOC ceiling.

### Time-Window Constraints: Bacchelli and Bird

Microsoft's Bacchelli and Bird (2013) study revealed a secondary finding critical for ARC:
code-review effectiveness is not purely about defects. They found:

- **Primary stated goal (defect detection) ≠ primary actual benefit.** Teams report defect-finding
  as their top motivation, but actual review discussions reveal other benefits dominating:
  knowledge transfer, team awareness, and alternative-solution exploration
- **Understanding cost dominates.** Developers employ diverse informal strategies (code navigation,
  history context, domain knowledge recall) to understand changes, and current tools often fail to
  support these needs
- **Modern code review definition:** Tool-based, informal (non-Fagan inspection), integrated into
  daily workflows at companies like Google, Microsoft, Facebook

**For ARC's context:** The secondary benefits of review (knowledge transfer, shared codebase
understanding) become more valuable in an agentic context where humans are integrating AI-generated
code into shared codebases. This suggests review-window sizing should balance defect detection with
**comprehensibility for knowledge transfer**, not just raw LOC / time tradeoffs.

### GitHub-Scale Observations: PR Size vs. Time to Merge

Analysis of 7+ million GitHub PRs confirms the pattern at ecosystem scale:

- **Merge-time spike at 1-2k LOC.** Highest review/merge delays occur when PRs reach 1-2k LOC —
  indicating either multi-round iteration or reviewer delays due to complexity
- **75% of PRs are reviewable.** At least 75% of GitHub PRs stay ≤500 LOC, aligning with
  industry best-practice recommendations
- **Smaller PRs merge faster.** Positive correlation: PRs under 500 LOC show faster review and
  merge cycles, with review time increasing nonlinearly above that threshold

---

## Estimation Approaches: Methodological Frameworks

Mature teams don't estimate at implementation time — they estimate during planning, using
structural and heuristic cues to predict reviewable size before code is written.

### Structural Estimation Cues

These observable characteristics during PRD/plan time predict downstream PR reviewability:

**1. File-breadth count.** A proposed change that spans N distinct modules/packages/files will
require reviewers to understand N separate contexts. Google's data shows 90% of reviews touch
≤10 files; Cisco's sweet spot suggests ≤8 files for 200-400 LOC alignment.

- **Signal:** "This change affects database schema, API layer, three service modules, and
  documentation." That's 5+ distinct contexts. If each context needs 50-100 LOC to make sense,
  the review is already 250-500 LOC before code is written. Check whether the change can be
  split by context boundary.

**2. Test-surface breadth.** A feature requiring changes to unit tests, integration tests, and
  e2e tests is typically larger than one requiring only unit tests. Same principle: each test
  tier is a separate cognitive context.

- **Signal:** "This adds a new field to the database schema. We need to migrate existing records,
  add tests for the new field in three test tiers, and update two API endpoints." That's
  6+ surface areas. Candidate for splitting into: (1) schema + migration + low-level tests,
  (2) API updates + integration tests, (3) e2e validation.

**3. Dependency-surface count.** How many other modules, packages, or services does this change
  interact with?

- **Signal:** "This change touches the audit system, the rate-limiting system, and the caching
  layer to propagate a new event type." That's 3+ orthogonal systems. Each requires a reviewer
  who understands both the target system and the change's interaction surface.

**4. Configuration / deployment surface.** Changes requiring config changes, environment setup,
  or deployment-pipeline alterations add cognitive load even if LOC is small.

- **Signal:** "We need to add a new environment variable, update the Docker build, and create
  a migration script." That's operational context orthogonal to code. Consider bundling carefully
  or separating from core logic changes.

### Heuristic Estimation Frameworks

**INVEST Criteria (Bill Wake, 2003).** Originally designed for user-story sizing, INVEST remains
applicable to PR-sized work units:

- **I — Independent.** Can the work stand alone, or does it require multiple PRs to be useful?
  If it requires sequencing with other PRs, it may be too wide for a single review boundary.
- **N — Negotiable.** Are requirements clear, or is scope still being negotiated? Unclear scope
  predicts size growth.
- **V — Valuable.** Does this PR deliver value to a reviewer's understanding, or is it
  intermediate scaffolding? Intermediate work (e.g., "refactor this layer in isolation before
  the feature PR") is harder to review because its value is deferred.
- **E — Estimable.** Can the team estimate effort? (Note: Bill Wake has recently suggested
  dropping this criterion, as it's often used to force false precision.)
- **S — Small.** For PR-context, interpret as "reviewable in one sitting without context
  switching."
- **T — Testable.** Can acceptance criteria be verified by code review + test observation?
  Unverifiable work tends to grow unbounded.

**Reference-Class Forecasting (Kahneman and Tversky).** Humans systematically underestimate task
duration and scope. Research shows that humans are optimistic due to overconfidence and
insufficient consideration of historical distributions.

- **Application to PRs:** If the team has shipped PRs of similar scope before, compare against the
  distribution of those PRs, not against intuitive size estimates. Example: "The last three
  authentication-system changes were 450, 520, and 380 LOC. This one claims to be 'similar
  scope' but your estimate is 150 LOC. Why?" Anchoring estimates to historical analogues
  achieves 70-80% accuracy vs. under 20% for unadjusted subjective estimates.

**3 Amigos + Example Mapping.** Pre-estimation discovery with business analyst, developer, and
QA identifies edge cases and acceptance criteria precision:

- **Process:** 0-5 min context; 5-20 min happy-path examples; 20-35 min edge cases + constraints;
  35-40 min sizing + dependencies
- **Size signal:** Extensive edge-case discussion predicts larger implementation. If the 3 Amigos
  session surfaces 5+ conditional paths, the PR will likely exceed 400 LOC.

**"If you can't list the diffs in your head" heuristic.** If the proposed change, when
explained, requires the explainer to reference code or diagrams (rather than speaking
the changes naturally), it's probably too large for a single PR.

- **Practical application:** During discovery, ask the proposer: "Walk me through what changes,
  without looking at code or sketching." If they need to reference code or draw diagrams,
  the change likely exceeds the 200-400 LOC review-window cognitive capacity.

### Team Practices: Trunk-Based Development PR Norms

Trunk-based development (TBD) teams, optimized for fast integration, operate under tighter PR-size
norms than feature-branch workflows:

- **TBD guideline:** ~400 LOC per PR, reviewable in 30 minutes, merged within same day
- **Review speed requirement:** Few minutes ideal, tens of minutes acceptable; hours acceptable
  only in exceptional cases
- **Practical enabler:** Feature flags allow decoupling deployment from release, enabling small
  PRs that don't expose incomplete features to users

**For ARC's context:** ARC does not mandate TBD, but TBD practices demonstrate that teams
operationally optimizing for high-frequency review and integration naturally converge on 400
LOC / 30-minute boundaries. This suggests the empirical ceiling is not a theoretical limit but
a natural operational equilibrium.

---

## Splitting Heuristics: Natural Seams and Anti-Patterns

Given a planning artifact (PRD, plan, acceptance criteria), practical signals indicate whether a
unit should be split and where natural boundaries lie.

### Vertical vs. Horizontal Slicing

**Vertical slicing (RECOMMENDED).** A full-stack thin slice delivers end-to-end value, touching
every layer (UI, API, database, logic) but only for a narrow feature subset.

- **Structure:** Feature → API endpoint → service logic → database schema, all cohesive
- **Review advantage:** Reviewers understand the whole flow in one PR; changes are
  interdependent and naturally reviewed together
- **Natural split signal:** Different vertical slices for different user-facing capabilities
  (e.g., "create order" vs. "list orders" as separate PRs)

**Horizontal slicing (NOT RECOMMENDED).** One PR per technical layer (database schema PR,
API-layer PR, logic PR) across multiple features.

- **Structure:** Database changes for features A, B, C → API changes for A, B, C → Logic for A, B, C
- **Review disadvantages:** Reviewers can't understand the feature's intent from a single PR;
  changes require coordination across PRs; API changes appear disconnected from the features
  they serve
- **When it appears:** Architectural rework (e.g., "refactor our database abstraction layer")
  may legitimately span layers, but this is rare and is an exception, not the pattern

**SPIDR framework (Cohn).** Five orthogonal splitting dimensions:

- **Spike (research):** A PR that explores a technical unknown, reducing risk for downstream PRs
- **Paths (user flows):** Different code paths a user can take; split by flow
- **Interfaces (client variation):** Different client types; split by platform/browser
- **Data (entity focus):** Different data entities or features; split by entity
- **Rules (complexity relaxation):** Remove edge-case handling, feature flags, or constraints to
  shrink scope

### Concrete Splitting Signals

**1. Risk isolation.** If a PR contains both high-risk and low-risk changes, consider separating
them.

- **Example:** "This PR adds a new payment method (high review risk, security surface) and
  updates unrelated UI labels (low risk)." Split into: payment method PR (subject to security
  review), UI labels PR (routine).
- **Benefit:** Security-sensitive code gets focused expert review; low-risk cosmetics don't
  dilute expert attention.

**2. Dependency direction.** If PR-A must land before PR-B for functionality (e.g., schema before
the application code that uses the schema), consider whether they should be separate.

- **Test:** Can PR-B be reviewed and approved while PR-A is still in review? If not, they may
  belong together in one PR; if yes, they're natural split points
- **Caution:** Splitting by strict dependency order can lead to incomplete vertical slices
  (e.g., "schema PR" that appears pointless until "the app code" lands). Keep slices
  independently valuable when possible.

**3. Test-surface expansion.** If a feature requires extensive test-writing in multiple tiers
(unit, integration, e2e), it may be too wide.

- **Indicator:** "We need to add 200 LOC of feature code but 400 LOC of tests across three
  tiers" = 600 LOC total, above the ceiling. Candidate for splitting by test tier or feature
  subset.

**4. Documentation scope.** If the PR introduces new concepts, APIs, or architectural patterns,
it requires reviewers to ingest both code AND documentation context.

- **Signal:** "We're introducing a new service; the PR includes the service logic, API contract,
  and getting-started guide." That's 3+ distinct documentation/code contexts. Consider:
  (1) service scaffold + basic docs, (2) core logic, (3) integration examples.

**5. Interaction surface count.** If the PR touches N distinct systems or modules, estimate that
each crossing point requires cognitive load.

- **Heuristic:** 4+ system interactions = likely too wide. 2-3 = optimal. 1 = likely too narrow
  (incomplete value).

### Anti-Pattern: Horizontal Slicing and Incomplete Vertical Slices

The most common mistake is incomplete vertical slicing: splitting by technical layer (database PR,
API PR) rather than by feature, resulting in PRs that deliver no user-visible value until multiple
PRs land.

- **Symptom:** A PR that says "database migration for the new checkout feature" lands, gets
  reviewed, and sits in "awaiting API layer" state for days before the API PR is ready
- **Root cause:** The author split by layer, not by feature. The database change is only valuable
  if reviewable as part of the whole feature flow
- **Fix:** Structure as "add new payment schema + basic API contract + sample application logic
  to wire them together" — one vertical slice, reviewable as a whole

---

## Integration with ARC: Codifiable Guidance

### Where Estimation Guidance Fits

The research suggests three integration points in ARC's workflow:

**1. PRD-generation time (discovery phase).** Before requirements are locked, the discovery
checklist should include a "reviewability size check" — a cue to think about splitting:

- "How many distinct file/package boundaries does this change cross?"
- "How many test tiers need updates?"
- "Can I describe the change in 2-3 sentences without referencing code?"
- "Are there 4+ independent systems involved?"

If any answer triggers concern, the response is not "make the PR small" (that's execution time),
but "does this PRD describe one unit or multiple units that should have separate PRDs?"

**2. Task-list generation time (PRD execution planning).** Once the PRD is written, the task list
should be structured so that each phase or coherent subset of tasks is reviewable as a PR in the
200-400 LOC / 30-60 minute window.

- Practical signal: "If we ship one PR per phase, would reviewers understand the feature from
  each PR, or would they need to wait for the next PR to understand this one?"

**3. PR-composition time (execution).** The `/arc-commit` skill and handoff ceremony should guide
authors toward atomicity preservation — bundling related changes and preventing "scattered
concerns" splits.

### Proposed Addition to `strategy-work-planning.md`

Insert a new section called **"Reviewability and Work-Unit Sizing"** into the discovery checklist,
positioned before PRD readiness assessment:

```
## Reviewability and Work-Unit Sizing

Before a PRD is locked, ensure the proposed work unit is appropriately scoped for review.

### Estimation Cues (Ask These Questions)

1. **File-breadth count.** How many distinct modules, packages, or services does this change touch?
   - 1-2: Good. Reviewers stay within one mental model.
   - 3-4: Acceptable. Change spans a few boundaries but remains coherent.
   - 5+: Yellow flag. Consider whether this unit should be split into multiple PRDs.

2. **Test-surface breadth.** How many test tiers need updates (unit, integration, e2e)?
   - One tier: Low complexity.
   - Two tiers: Expected for most features.
   - Three+ tiers: May indicate the unit is too wide. Can some test tiers be deferred to a
     follow-up PR or covered via a feature flag in the same PR?

3. **Dependency-direction clarity.** Can each piece of this work be reviewed independently, or
   must reviewers wait for subsequent PRs to understand this one?
   - Independently valuable: Good. PR stands alone.
   - Requires follow-up: Yellow flag. Consider merging into one PRD or reversing the order so
     foundation lands first.

4. **Explainability test.** Describe the change in 2-3 sentences without referencing code or
   diagrams. Is the description clear?
   - Yes: Likely reviewable.
   - No, requires diagrams or code reference: Likely too wide. Consider splitting.

5. **System-interaction count.** How many orthogonal systems or subsystems does this unit modify?
   - 1: Narrow, focused.
   - 2-3: Expected for most features.
   - 4+: Yellow flag. Each interaction is a separate reviewer cognitive context. Candidate for
     splitting.

### Splitting Heuristic

If the unit triggers multiple yellow flags (5+ file breadth, 4+ system interactions, requires
diagrams to explain), it likely represents multiple work units. Use the vertical-slicing approach:

- **Vertical slice:** One feature → one end-to-end flow through all layers. Split by *feature
  subset*, not by *technical layer*.
- **NOT:** "Database PR, API PR, Frontend PR." ← Horizontal slicing; don't do this.
- **YES:** "Add payment method (schema + API + UI for one flow) as one PR." ← Vertical slice;
  split into multiple PRs when adding additional payment methods (separate feature slices).

### Expected PR Size

Assuming the unit passes the above checks:

- **Target range:** 200-400 LOC per PR
- **Time to review:** 30-60 minutes (at 200-300 LOC/hour inspection rate)
- **Empirical baseline:** Teams optimizing for integration velocity (trunk-based development,
  Google's changelist practices) naturally land at this size
- **Exceptions:** Rare. Refactorings and architectural work may exceed this range; when they do,
  explicitly note in the PRD that review may be longer and plan accordingly.

### When Size Uncertainty Remains

If the planning conversation reveals uncertainty about final size, note it in the PRD under
**Open Questions** and plan to revisit during task-list generation. Better to discover size
risk during planning than during review.
```

### Smell-Test Checklist: Is This WU Too Big / Too Small / Right-Sized?

Add a **"Work Unit Sizing Smell Test"** as a quick reference during task-list generation:

**WU is too big if:**

- [ ] Spans 5+ distinct modules/packages without a unifying feature thread
- [ ] Test-surface work extends to 3+ tiers with significant assertion complexity
- [ ] Requires architectural diagrams to explain the change
- [ ] Acceptance criteria list includes 6+ distinct capability additions
- [ ] Task list exceeds 15-18 tasks across all phases
- [ ] Phase count exceeds 7-8 and each phase is not well-bounded

**WU is too small if:**

- [ ] Does not deliver end-to-end value (feels like scaffolding for another WU)
- [ ] Task count is 2-3 across all phases (likely under-scoped)
- [ ] Cannot justify a dedicated review cycle (should be bundled with related work)
- [ ] Acceptance criteria collapse to a single capability

**WU is right-sized if:**

- [ ] Deliverable is end-to-end and user-visible (or internally valuable as a cohesive increment)
- [ ] 5-12 tasks per phase, 6-7 phases (soft target; varies by work type)
- [ ] File-breadth review stays ≤8 files for the final PR composition
- [ ] Can explain the change in 2-3 sentences
- [ ] 2-3 system interactions, or 1 system with deep changes

---

## Sizing Assessment: The Interlock-Foundation WU

Given the PRD plan in `plan-session-operational-flow.md` (Phases 1-3 of
the interlock-foundation WU), here's an empirical assessment:

### Structural Analysis

**Phase breakdown (Phases 1-3):**

- **Phase 1 (Constitutional foundation):** Document-level (ADR landing, DEV-RULES.ARC amendments,
  planning-session active-surface edits, strategy-doc cascade). ~10-12 doc tasks, mostly edits.
- **Phase 2 (Status-file timing rule):** Workflow updates (process-task-loop, lifecycle workflows,
  session-handoff). ~8-10 workflow edits, strategy updates.
- **Phase 3 (Configuration surface + approval-signal vocabulary):** Configuration schema,
  session-init load-set adaptation, strategy updates. ~6-8 feature/config tasks.

**Total estimated task count (Phases 1-3):** ~24-30 tasks.

**File-breadth estimate:** 15-20 distinct files (workflows, config, strategy docs, DEV-RULES,
ADR, templates).

**System-interaction count:** 5-6 orthogonal subsystems (session-init, workflow engine, config
parsing, status-file conventions, strategy docs).

**Value articulation:** Constitutional reframing (commit control from principle to configurable
default) is the unifying thread. All three phases are foundational for downstream consumer plans.

### Sizing Verdict

**Assessment: Correctly sized or slightly large, contingent on Phase 4-7 split.**

**Reasoning:**

1. **Phases 1-3 are structurally sound.** Document-heavy phases (1-2) are lower risk than
   implementation-heavy phases (4-7). Splitting earlier removes risk for downstream plans.

2. **Task count (24-30) is at the higher end but acceptable for document/config work.** Document
   edits and workflow updates are lower-cognitive-load changes than implementation. At 2-3
   tasks per workflow, the total is manageable.

3. **System-interaction count (5-6) is high, but intentional and unified by framing.**
   Configuration, session-init, workflows, and docs interact because they're all part of the
   interlock architectural frame. This is not accidental scatter; it's structural necessity.

4. **File-breadth is appropriate for a constitutional amendment.** Constitutional changes are
   inherently wide. That's not a sizing problem — it's a characteristic of the work.

5. **The pre-approved split (WU-A Phases 1-3, WU-B Phases 4-7) is pragmatic.** WU-A is
   defensible as standalone (frames the constitution, configures the foundation, unblocks
   downstream). WU-B is separately valuable (implements autonomy modes, reversibility,
   metadata-state foundation).

**Conditional flags:**

- **If Phase 3 (configuration surface) reveals unexpected scope creep** (e.g., multiple
  configuration subsystems, complex schema), it might warrant its own phase or even a separate
  WU. Watch during PRD drafting.
- **If downstream plans (sync-UX, hooks, lifecycle) require structural changes to WU-A's
  framing**, the split point may need adjustment. This is low-probability (framing is explicit);
  validate at PRD time.

**Recommendation:** Ship Phases 1-3 as currently scoped, planning validation-window dogfooding
between WU-A and WU-B. If WU-B turns out to require frame revisits, better to surface this
after WU-A lands and is socialized than to bundle the risk into a 50-task megaunit now.

## Sources

**Empirical studies:**

- [SmartBear / Cisco code review case study (2006)][smartbear-cisco] — 2,500 reviews, 3.2M LOC
- [SmartBear: 11 Best Practices for Peer Code Review][smartbear-practices]
- [Sadowski et al., Modern Code Review at Google][google-sadowski]
- [Greiler — overview of code reviews at Google][google-review]
- [Bacchelli & Bird, Microsoft — Expectations, Outcomes, Challenges of Modern Code Review][microsoft-bacchelli]
- [Packmind — GitHub PR ecosystem analysis][github-analysis]
- [Graphite — GitHub PR metrics guide][github-metrics]
- [Baldawa — cognitive load cliff in PR review][cognitive-load]

**Methodological frameworks:**

- [Agile Alliance — INVEST criteria][invest-alliance]
- [Cohn — SPIDR (five ways to split stories)][spidr-cohn]
- [Agile Alliance — Three Amigos][three-amigos]
- [Wikipedia — reference-class forecasting][reference-class]

**Practices and patterns:**

- [Trunk-Based Development — continuous review practices][tbd-practices]
- [Vertical slicing best practices][vertical-slice]
- [Horizontal slicing anti-pattern][horizontal-antipattern]

---

[smartbear-cisco]: https://static0.smartbear.co/support/media/resources/cc/book/code-review-cisco-case-study.pdf
[smartbear-practices]: https://static1.smartbear.co/support/media/resources/cc/11_best_practices_for_peer_code_review_redirected.pdf
[google-sadowski]: https://storage.googleapis.com/gweb-research2023-media/pubtools/4476.pdf
[google-review]: https://www.michaelagreiler.com/code-reviews-at-google/
[microsoft-bacchelli]: https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ICSE202013-codereview.pdf
[github-analysis]: https://packmind.com/github-pull-requests-analyzed/
[github-metrics]: https://graphite.com/guides/github-pr-metrics
[invest-alliance]: https://agilealliance.org/glossary/invest/
[spidr-cohn]: https://www.mountaingoatsoftware.com/blog/five-simple-but-powerful-ways-to-split-user-stories
[vertical-slice]: https://monday.com/blog/rnd/vertical-slice/
[reference-class]: https://en.wikipedia.org/wiki/Reference_class_forecasting
[cognitive-load]: https://rishi.baldawa.com/posts/pr-throughput/cognitive-load-cliff/
[three-amigos]: https://agilealliance.org/glossary/three-amigos/
[tbd-practices]: https://trunkbaseddevelopment.com/continuous-review/
[horizontal-antipattern]: https://cedanet.com.au/antipatterns/horizontal-slicing.php

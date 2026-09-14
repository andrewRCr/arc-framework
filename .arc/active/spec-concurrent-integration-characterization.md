# Spec (`outline`): concurrent-integration-characterization

- **Origin:** [internal] — the anti-freeze characterization chartered in the personal release-gates steering map
  after `evidence-applicability` exposed that concurrent sessions were still pausing for each other's integration.

- **Purpose:** Characterize, in one pass, every post-execution boundary at which a protected-base advance under an
  independent checkout still stops or re-ceremonies the work, against the industry baseline of a base that is always
  moving; leave behind an armed probe net and a ledger in which every remaining stop has exactly one owner; and ship
  no fix here.

---

## Problem / Context

Concurrent work is viable only if another checkout's ordinary progress never forces an unrelated session to halt or
repeat verification, preparation, review, or integration. The industry baseline is concrete: the host runs CI on its
test-merge ref, "require branches to be up to date" is off, review binds to an exact head, and a team member neither
knows nor cares what a colleague merged an hour ago. `evidence-applicability` adopted the same doctrine — evidence
follows covered content, never head movement as such — and wired it at the checkpoint, review status, delivery
eligibility, and Errand merge.

Two things remain. The post-execution lifecycle has never been characterized as a whole against a moving base; each
gap so far was found by dogfood, mid-integration, and patched piecemeal, and the delivery-stabilization work is being
sequenced around stops nobody has reproduced. And the post-execution tail — verification, review, integration,
delivery — now costs far more attention per concern than planning or execution, with concurrency stops the largest
single contributor. Work units are also being minted faster than they complete, so the fixes this work routes must
land in as few new homes as the findings honestly allow.

The existing suite holds most of the substrate: a bare-origin multi-clone helper and a worktree-siblings variant that
shares one git common dir, a remote-branch advance in the in-flight-reshuffle helper (marker file only, disjoint
only), controlled-step barriers, and handler-level injection for the provider-bound review lane. What it lacks is a
base-advance primitive with path selection and movement kind, and any probe that advances the base _between_ a
boundary's precondition and its execution at four of the six boundaries.

## Decision(s)

**D1 — Probes name the idiomatic behavior and pin the observed stop until a fix lands.** Each probe is an e2e or
integration test that asserts what a moving base should do at its boundary under the baseline above; where ARC
doctrine already says the same, the assertion is that doctrine made executable. A probe that passes today is an
ordinary test. A probe that fails today calls one shared assertion helper (to be created under the test helpers)
with two shapes — the **observed** typed result, which it pins, and the **target** idiomatic result, which it
names. The helper is red on any third outcome, so a decayed probe never reads green, and red with a "retire this
pin" message the moment the target is met, so a fix's own CI run tells the fixer to replace the call with a plain
assertion. Vitest's `test.fails` is rejected because its runner converts every non-pass state to pass, which
disarms the net against decay. Test names and messages describe behavior only; the ledger cites test names, never
the reverse.

**D2 — The tree under test is this branch's build; base merges are re-runs.** Implementation-complete but unshipped
work is provisional evidence, never `main`'s current behavior. Probes read `main` as of the last base merge into this
branch; each base merge after a sibling lands is a re-run, and every ledger row records the base OID it was observed
against. No second tree and no provisional composition of unmerged branches.

**D3 — One probe per boundary × movement kind, plus a control row, at boundaries that read the base at all.**

- Boundaries and their typed seams: whole-work-unit verification (`arc attest`, the only typed verb the verify
  workflow invokes); Candidate and private-delivery prepublication (`arc review pre-publication` and the publication
  transition); public review and checks (`arc review status` and the hosted request/await handlers); member or
  singleton landing (`arc integrate checkpoint` / `merge`, and the delivery landing path); post-landing closeout
  (`arc teardown` and archival); the Errand review/merge path (`arc errand close` and the Errand's typed merge
  lane).
- Movement kinds: `disjoint`; `overlapping-substantive`; `overlapping-regenerable-only` (the tracked readiness
  projection, which the shipped overlap classifier already partitions apart); `unknown` (remote evidence that
  **goes** unavailable at the boundary, not merely a static precondition).
- Shapes: singleton by default. The delivery-member shape carries all four movement kinds plus a control row at
  landing, where the delivery path decides admissibility, and one `disjoint` row each at prepublication and closeout,
  where it only re-observes. The Errand shape is its own boundary row. Ceiling before not-applicable cells: thirty
  singleton and Errand probes, seven delivery-member probes, three isolation probes.
- Control row: one no-movement probe per boundary. A movement row's **excess** is its verb invocations and approval
  stops minus the control row's, and the idiomatic excess is zero. The control row's own count is the ceremony
  baseline; non-concurrency excess in it is routed, never fixed here. Probes assert typed outcomes only — the
  idiomatic result, or the pinned stop — never counts; counts are ledger observations taken from the probe's run, so
  deleting a control row under D9 never breaks a retained probe.
- Covered input per ceremony, which decides whether a repeat is justified: quality gates, the tree they ran over;
  attestation and verification currentness, the work unit's own subject digest; review clearance, the exact reviewed
  head and reviewed path set; checkpoint, the Candidate head and observed base relation; approval, the exact head it
  was given on.
- Lane per boundary: boundaries driven through spawned CLI verbs are e2e probes. The public-review boundary is an
  integration probe at the handler seam, where the existing tests inject the request and observer functions; a
  spawned CLI cannot. Both lanes run on pull requests that touch code, with two known exceptions the fixer must
  expect: CI skips both legs for a pull request classified light-weight, and the routine local test lane excludes
  e2e, so a pin retirement surfaces in CI rather than at the task gate.
- Exact-target read isolation is one additional family, not a boundary, run in the integration lane on the
  worktree-siblings helper: a sibling checkout whose build cannot parse this checkout's records, a foreign owner's
  Candidate record in the shared namespace, and a sibling left byte-identical after this checkout's reconcile. The
  first two are live field classes — three sibling checkouts' Candidate records were unreadable under this build's
  schema at this work unit's first session-init.
- Cells at which the boundary never reads the base are recorded as not-applicable, not probed. No exhaustive state
  cross-product.

| Boundary                   | Existing base-movement coverage                          | Nearest extendable test                                |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Whole-WU verification      | none: no probe moves the base between start and finalize | `integration/prepublication-workflow.test.ts`          |
| Candidate / prepublication | applicability covered; settle-to-submit window unmoved   | `e2e/publication-spine.e2e.test.ts`                    |
| Public review and checks   | none: caller branch moves under a pinned target only     | `integration/frontline-target-materialization.test.ts` |
| Member / singleton landing | unavailable-base and post-landing advance only           | `e2e/delivery-terminal-recovery.e2e.test.ts`           |
| Post-landing closeout      | one disjoint case; no overlapping, no unknown            | `integration/teardown.test.ts`                         |
| Errand review / merge      | movement at open only; close and respond never see one   | `e2e/errand.e2e.test.ts`                               |

**D4 — One ledger row per probe, in the notes companion.** `notes-concurrent-integration-characterization.md`
§ Characterization ledger, one row per probe: boundary, movement kind, shape, test name, base OID observed against,
observed typed result (reason and remedy as returned), verb invocations and approval stops observed, whether that
result carried a recommendation or was a bare fork, classification, owner, the fix's disposition at close, and the
retention disposition at close (D9). Classification is one of **tolerates** (proceeds,
no added ceremony), **redundant ceremony** (proceeds but repeats a ceremony whose covered input did not change),
**mechanical block** (a typed refusal or dead end with no continuation), or **fail-closed, correct** (a refusal the
baseline also requires). Prose-only gates — a workflow step that loops on a drift read with no typed verb behind it —
cannot be probed; they take ledger-only rows whose recorded fix is relocation into a typed verb.

**D5 — Fixes ship in their own homes; this work ships none.** Every non-passing row is routed at this work unit's
close — the verification boundary, once the probes have run: existing owner first (the four delivery-stabilization
targets — `delivery-post-landing-conflict-recovery`, `delivery-authoring-rebuild`,
`delivery-prepublication-evidence-applicability`, `delivery-correction-convergence` — and the review-side owners;
`evidence-applicability`'s success criteria make many probes acceptance checks of claimed behavior rather than
discovery); an Errand when the fix is one verb arm plus a pin retirement, which may run and land off-work-unit during
this work unit's lifetime; a new stub only for an unowned, spec-worthy mechanism, consolidated by mechanism rather
than by boundary. A row is owned only when it resolves to a `backlog/` stub, an inbox capture whose target is a work
unit already in flight, or an inbox capture whose fate is Errand. Any of the four stabilization targets that is still
only a capture at close is minted as a stub through the express lane the routing rules grant (scaffold a `backlog/`
stub directly), which discharges the between-work-units drain default for those four by name. The generalized
doctrine sentence in D7 takes one ledger row of its own; the rules-level half of D7's second principle is already
captured for its owner to resolve at drain and is not a row.

**D6 — One shared base-advance helper, extended from the one that exists.** The first deliverable extends the
in-flight-reshuffle helper's remote-branch advance with the paths to touch and the movement kind, composing the
multi-clone and worktree-sibling helpers for the second-checkout cases. New probes use it; the three hand-rolled
advance idioms elsewhere in the suite are not migrated.

**D7 — Fix-shape principles the routed fixes inherit.** A ceremony repeats only when a covered input changed; head or
base movement is never itself a covered input. This generalizes the review-admission sentence
`evidence-applicability` landed to every ceremony in the post-execution tail and is consistent with the one exactness
merge authority needs, since disjoint movement does not change the exact head it binds to. Every stop carries a
recommendation: the verb composes it where the facts are deterministic, the agent supplies it where a residual is
genuinely open; a bare "approve X?" is a defect the ledger records per stop. A fix that adds exactness beyond what
merge authority mechanically requires is a scope expansion, named as such in its capture.

**D8 — Probe cost is measured and the advisory budget is rebaselined deliberately.** The e2e and integration tiers
carry advisory wall-clock budgets in the package's test-cost record with a ten percent allowance, refreshed by hand.
Probes build on the prepared-repository template and the existing helpers, never the true-race harness, so each stays
in the low seconds. The suite's cost is measured before and after with the package's test-cost benchmark, and the
baselines are refreshed in a dedicated `perf(test-cost)` commit that states the delta; an exceeded budget is never
left as a CI summary warning.

**D9 — Probes are retained only where they guard coverage nothing else provides.** The probes have two lives: the
audit, which ends at close, and the regression net, which is the only reason to keep a test in the suite. At close,
each probe is kept only if it guards a boundary × movement cell, or an exact-target isolation case, that no other
test covers; a probe whose cell an existing test already exercises is deleted, and its ledger row keeps the
observation. Control rows exist for the baseline count and are expected to fall to this rule wherever the clean path
is already tested. Pinned probes are kept until their fix lands, since the pin is the handoff contract, and then
survive as ordinary guards under the same rule. The ledger records each probe's retention disposition.

**Boundary and Class (sticky from the draft).** `Class: Heavy` — the probe matrix, record contract, and routing
posture had to be authored before an engineer could start, and nothing is invented. Boundary fit: **stays one WU**
— the helper, probes, ledger, and routing are one concern with one review surface; the fixes are routed out by D5.

## Scope boundary (No-gos)

_Frozen at activation; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- No fix lands on this branch, including the doctrine sentence; every fix is routed under D5, and a routed Errand
  runs off-work-unit.
- No exhaustive state cross-product, no live-provider harness, no merge queue, no generic storage rewrite, and no
  promotion of recovery convenience into a near-term work-unit dependency.
- No migration of the three existing hand-rolled base-advance idioms onto the extended helper.
- No audit of non-concurrency ceremony beyond recording each control row's count and routing its excess.
- No second tree under test and no provisional composition of unmerged sibling branches.
- No new Vitest project, CI job, or budget row for the probes; they live in the existing e2e and integration lanes.

## Consequences & Risks

- **Pinned probes go stale as siblings land.** Sibling work landing during this work, including any routed fix,
  flips pins. Accepted: that is the re-run mechanism (D2) working; each base merge re-runs the suite
  and the ledger gains a row per changed observation.
- **Probe cost grows the e2e and integration tiers.** Mitigated by D8's low-seconds ceiling per probe, the
  prepared-repository template, and a stated rebaseline. Residual: the four CI e2e shards are hand-balanced with one
  heavyweight each; a new file lands in the remainder shard, so shard balance is re-read at the rebaseline.
- **The ledger and the tests can diverge.** The ledger cites test names and the tests cite nothing back, so a renamed
  probe silently orphans its row. Mitigated by one closing pass that resolves every ledger test name against the
  suite before routing.
- **This work unit integrates under the very movement it characterizes.** Accepted, and useful: its own
  prepublication and landing are field evidence, recorded as ordinary rows.
- **Stops that are agent behavior rather than typed results cannot be probed.** The recommendation-or-bare-fork
  column records what the verb returned, not what a session rendered; agent-side rendering defects are captured, not
  measured here.
- **The routing drain may find a gap with no honest owner.** D5 allows one or two new stubs; a third is a signal to
  consolidate by mechanism, not to mint, and is surfaced at the close rather than decided unilaterally.

## Success Criteria

1. Every boundary × movement-kind cell for the singleton and Errand shapes, every delivery-member cell D3 names,
   every control row, and every exact-target isolation case has either a probe in the suite or a ledger row marked
   not-applicable with the reason.
2. Every probe that does not pass on the current tree calls the shared pin helper with both shapes, and the suite is
   green with the pins in place. No probe uses `test.fails`, `todo`, or `skip`.
3. The extended base-advance helper accepts a path set and all four movement kinds, and every new probe advances the
   base through it.
4. Every ledger row carries every D4 column, and every non-passing row's owner resolves at close to a `backlog/`
   stub, a capture targeting an in-flight work unit, or a capture whose fate is Errand; stubs minted beyond the four
   targets D5 names number one or two.
5. Each of the four targets D5 names exists as a `backlog/` stub at close, and the generalized doctrine sentence has
   its own owned row.
6. The test-cost baselines are refreshed in a dedicated `perf(test-cost)` commit whose message states the measured
   delta, and no CI test-budget summary is left standing.
7. Both type checks, Markdown lint, the ARC contract checks, and the full suite are green; the e2e and integration
   lanes ran on the pull request.
8. Every probe in the suite at close guards a cell or isolation case no other test covers, and every deleted probe's
   ledger row records the observation and the covering test; the measured tier cost at close reflects only the
   retained set.

## Open items

- The exact cell list, including which cells are not-applicable and why, is enumerated at task generation from the
  matrix in D3 and confirmed against each boundary's typed seam as the first task.
- The extended helper's signature, its e2e composition (the prepared-repository template and the reshuffle helper
  are integration-lane fixtures today; e2e probes spawn the CLI over the same repository path), and whether
  `unknown` movement is produced by severing the remote or by withholding the fetched object, resolve at
  implementation.
- Which prose-only gates remain is read from the tree at each base merge, not assumed now.
- The pin helper's failure messages and the ledger's not-applicable wording resolve at implementation.

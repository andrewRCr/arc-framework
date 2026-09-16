# Draft: Delivery Post-Landing Conflict Recovery

- **Origin:** `USER-INBOX § Work Unit`, minted from the routing close-out of
  `concurrent-integration-characterization` (2026-09-14), which carried its captures and added field evidence.
- **Purpose:** Give a landed delivery member a typed route back to closeout when its retained suffix, its terminal
  binding, or the shape of the base history leaves the exact-head comparison unsatisfiable — without relaxing that
  comparison or turning an Owner authorization into a general escape contract.
- **Planning posture:** The failures are proven and reproduced under probe. The originating instance is retired, so
  nothing is blocked on this work today; what remains is that the mechanism which produced the residue is unfixed
  and the next stacked landing meets it again. The surface spans whole-work-unit verification, Candidate
  applicability, public review, landing, and closeout, which establishes `Class: Heavy` and a `P1` slot.
- **Readiness:** `rough`. Four adversarial passes (2026-09-16). The fourth ran the full rubric after the recovery
  half was re-settled on an existing protocol, and broke it again: adoption is not the straight lift the draft
  claimed, because the built protocol is coupled to a selection referent the native landing path does not have.
  Two blockers, four majors, all confirmed against source. The frozen half's mechanism claims held; its call-site
  inventory did not.

---

## Continuity

### Resolved — frozen

**Certified by three independent adversarial passes** (2026-09-16), each verifying these against source and, where
empirical, against a scratch repository. Each appears in every pass's `withstood` list. They are frozen: a later
pass attacks them again only on new evidence, not on re-reading.

- **Seven probe rows are owned here**, across three of the characterization's four axes — not the four loci the
  origin captures described. § The failure family.
- **The ambiguity seam has four verbs, not three**, and the fourth returns a wrong answer instead of refusing.
- **The rebind verb already works.** What is missing is a route to it from the verbs that read the binding.
- **The post-land refusal is correct.** Its defect is the guidance wrapped around it one layer up.
- **Cardinality is a refinement of divergence, and the resolver fork follows.** One relation-typed read answers
  both; cardinality is a field on the diverged variant, not a variant, and applicability is its only consumer.
- **The relation is extraction, not invention, and it is proportionate.** Four sites already derive it by hand
  under four return types. `assess-design-proportionality` returned `proportionate` with its scope guard.
- **The relation carries six variants over an ordered pair, split into a pure classifier and a thin reader per
  executor.** The reader produces the unavailable outcome, which is where the hand-rolled helpers collapse it.
- **Three readers want the shared base resolver; three want the relation.** Read-all, refuse-on-more-than-one,
  then diff or record from the single base. The staged arm of the subject collector takes the same rule; its
  probe is owed. § Reader inventory — Resolver or relation.
- **The subject's path set is base-relative, with cardinality refused rather than picked.** The commit-derived
  answer was falsified twice over: it cannot see a branch retaining its own side of a base-changed path across a
  base merge, and the content-inclusive digest inverts its movement-sensitivity claim. § The subject's path set.
- **Review readiness misses rather than mismatches**, because its lookup is keyed on the observed head. Resolve
  by the deliverable identity the reader already holds and compare second.
- **Merging the base in collapses cardinality, per coordinate pair.** It reaches the sites comparing a head
  against a base; it does not reach the two comparing a pinned durable baseline, whose route is re-baselining.
- **Closeout's conjunction owes a reason per term** — taken into scope by the Owner, 2026-09-16.
- **The settled fundamentals clear the four project check-docs and two unbuilt designs**, with three constraints
  adopted. § Forward-compatibility check.
- **The boundary holds: one work unit**, and the boundary with `delivery-correction-convergence` is settled on
  evidence. Re-raised and re-affirmed after pass three concentrated its findings in one half. § Boundaries.
- **The two routed captures are integrated.** § Retained capture detail keeps what the body does not restate.

**Two corrections have landed against this set**, both to evidence rather than to conclusions.

- **The call-site inventory was short twice.** A full sweep finds **fifteen distinct base-resolving call sites,
  seven of which pick silently**; the table carried seven sites and one silent pick. § Reader inventory now
  records the sweep command so a later pass can re-run it rather than re-eyeball it.
- **The silent pick is not unique to the Candidate subject collector.** `repository-target.ts` picks silently on
  the local review host's diff base — the review-evidence surface this draft's own argument is about.

The resolver fork's conclusion is unchanged and strengthened by both. What was wrong was the arithmetic, the
uniqueness claim, and the `source-verified` label.

### Resolved — recovery record

Re-settled 2026-09-16, then **half-broken by the fourth pass**. The split below is the point: the protocol's
_input_ side survived source verification intact, and its _output_ side did not.

**The input side stands** — disclosure, resubmission, and the predicate.

- **ARC already implements the disclose-and-resubmit protocol**, on the sibling provider path.
  `adoptExternalDeliverySuffixRefresh` collects the complete conflict set, returns `conflict-resolution-required`
  carrying a resubmittable disclosure, and waives proof for precisely the approved members.
- **The decision is a resubmitted disclosure, not a stored record.** ARC persists nothing on the input side, so
  nothing can go stale. What survives the wait is the reservation already durable in `activeOperation`. Retracts
  the pending-obligation record, the content-equality predicate, and `readEntries` as its primitive.
- **Arrival needs no new operation and no state-schema change.** The native path consumes the resubmitted
  disclosure in the same `land-status` call that settles, because its reservation is already held. Verified: the
  landing projection is passed unpersisted at the same revision, and every conflict refusal returns before the
  single state write.
- **The approval fires on genuine collisions only.** Identical trees take the `tree-equality` fast path and clean
  reapplies take `mechanical-reapply`, both silent. Movement alone never asks anyone anything.
- **Gerrit's asymmetry and ARC's standing acceptance rule agree** once movement is distinguished from change.

**The output side does not, and the cause is one referent.** The built protocol is gated end to end on a
`selectedDeliverableId` that the native landing case has no defined value for — it is required by the pending
schema, required by the state refinement to resolve to a plan-ordered state member, and it is the discriminator
on the disclosure's own `scope`. Adoption is therefore not a lift. Three consequences, all now open below: what
the selection referent is, what discharges the obligation, and what abort means.

### Open

Seven. Three are structural, and one of those was dropped from this list by a previous rewrite of it — see § Next
for the process fix that follows.

- **The selection referent, and whether one exists.** The built protocol is gated on `selectedDeliverableId`;
  the native landing case defines none. Three candidates and no lean: the **landed member** (just absorbed into
  the target), the **first conflicted suffix member**, or a **native arm on the pending record** that carries no
  selection at all. The schema constrains but does not decide — the referent must resolve to a state member and
  sit inside a plan-ordered `memberDeliverableIds`. § What the record may carry.
- **What discharges the waiver, and whether `pendingReviewFixVerification` can carry it.** Its projection emits a
  Tier-1 gate over the **terminal** tree with `coveredInputs: "unchanged"` — a check-reuse obligation. The
  retained capture requires new member heads to receive _fresh_ applicability, review, and checks. The field
  works as the closeout encumbrance and does not, as built, carry that success signal.
- **What abort means once the predecessor has landed.** The provider path's decline route restores refs to a
  coherent pre-decision state. On the native path the host merge has already happened, so there is no
  pre-decision state to return to — restoring suffix refs would re-base them on a predecessor the target no
  longer has, and the retarget does not revert. The semantics are unsettled, not merely unbuilt.
- **Whether the movement substrate unifies Axis A.** Carried from § Substrate, which names it as the first open
  question and which a previous rewrite of this list silently dropped. `terminalAuthoringMovement` is a two-value
  option at two call sites; whether the relation replaces it, sits beside it, or takes it as a policy layer is
  three materially different designs, and an in-flight Errand is declared downstream of the answer.
- **Which lookup route the readiness inversion takes.** Three exist and are non-equivalent, and the choice decides
  whether `absent` means _no member_ or _no hosted member_ — the meaning of one of the six variants, and so the
  remedy it dispatches. Previously labelled detail-design; that was wrong by the draft's own sentence.
- **Whether an all-neutral conflict set should settle without asking.** ARC classifies paths `reviewable` /
  `evidence-neutral` / `regenerable`; a collision confined to lifecycle projections carries no judgment. Gating
  the disclosure on at least one `reviewable` path is the proposal; the subset's reachability is unmeasured.
- **The word for the rewound variant, and whether the variant union is flat.** Two of the six are not relations —
  one a lookup outcome, one a read-availability outcome. Detail-design; the distinctions stand either way.

### Next

**Settle the selection referent first.** The discharge question and the abort question are both downstream of it,
and the fourth pass showed that reasoning about the protocol without pinning that referent reproduces the same
error at a new layer.

**A process fix, written here because it has now failed twice.** Both times § Continuity was rewritten wholesale,
an open item was lost — pass three caught four retracted claims left standing beside their replacements, and pass
four caught an open question deleted beneath an explicit "none structural". Before any commit that rewrites this
section, **diff the pre-rewrite § Open against the post-rewrite one and account for every item that left**. This
is bookkeeping, not design, and it is the failure most likely to reach the certifying pass.

**A whole-artifact certifying pass is still owed.** Pass four ran the full rubric and returned not-ready, so the
next pass inherits its findings as `prior-findings` rather than starting clean.

---

## Problem / Motivation

Ordinary movement after a member lands can leave a merged member under a reservation with no typed conflict
continuation. The exact-head comparisons that protect delivery are correct; what is missing is any route back when
independent evidence already proves the contribution landed and only the coordinate disagrees.

The originating instance is closed. `evidence-applicability` landed on `main` as `cbf075da7`, its final member
merged at head `841ddb632`, and `arc delivery closeout` refused `terminal-unsettled` because the retained terminal
member still bound reviewed head `57ce62b1d`. An execute-bound Errand retired that residue operationally; the work
unit is shipped and torn down, and `candidate-reroot-recovery-frame` is no longer queued behind it. Only the
instance was fixed. The durable route is this work unit's, and the next stacked landing reaches the same wall.

---

## The failure family

`concurrent-integration-characterization` widened to a second matrix specifically because its first — six
post-execution boundaries by base-movement kind — re-finds none of these failures. They move a bound record's head,
the shape of the history, or a ceremony's own writes, not the base. Seven of its rows resolve here.

Each row below is a recorded observation against base `cbf075da7`, not a claim.

### Shape coverage

This work unit's name skews delivery; its row set does not. **Four of the seven rows are recorded against a
`singleton`** — an ordinary single-request work unit with no delivery plan — and all four are Axis B. Only Axis
A's two rows and Axis D's one are `delivery-member`.

The distribution is not incidental. Axis B's condition is the shape of the history, which a singleton reaches
exactly as readily as a stack, and the most severe row here — the silent base pick — is a singleton row. Two of
the four readers it runs through, the subject collector and the overlap analyzer, serve both shapes, so the
majority of this work unit's value lands on the ordinary case rather than the stacked one.

**Axis A has no singleton row because the singleton path already gets it right.** Retirement containment compares
by ancestry, with `merge-base --is-ancestor` against the pinned base. Delivery terminal settlement asks the same
lifecycle question and compares `request.headSha === terminal.coordinates.head` — raw equality, no ancestry term.
One question, two implementations, and the older one is correct. The relation this design introduces is therefore
not a new concept for the codebase: it is the concept the singleton path already uses, which the delivery path
re-implemented worse.

That equality also sits inside an eight-term conjunction collapsing to a single `terminal-unsettled` reason, so
the refusal is cause-blind as well as ancestry-blind — which is why its remedy can only name a rerun over inputs
that never reach the term that actually failed.

**The risk this creates is in the fix, not the evidence.** Adopt the relation by reader, never by shape. A
delivery-scoped rollout would leave the singleton readers on whichever comparison they happen to carry, which is
how the two implementations diverged in the first place.

### Axis A — a reader compares a bound head with no ancestry term

The rebind verb itself is covered and works: `delivery-terminal-recovery.e2e.test.ts` observes it four ways,
including rebinding stale terminal coordinates to the independently settled current Candidate and renewing
verification for substantive movement past a settled record-only terminal. The matrix marks that cell
not-applicable for exactly that reason, and puts the probe on **the binding's readers** — with the note that this
is why every recorded failure survived that coverage.

- **Public review.** Readiness against a member whose branch advanced past the head its record binds returns
  `invalid` / `delivery-member-unbound`, no remedy. The probe asserts directly that this is the same result the
  same handler returns over a repository carrying no delivery state at all: the comparison is head equality and
  reads no ancestry, so **a stale binding and an absent binding are indistinguishable here**.
- **Closeout.** Against a terminal the host merged at a descendant of the bound head, closeout returns `blocked` /
  `terminal-unsettled` with a remedy directing a rerun over the same work-unit, repository, and remote inputs —
  none of which reaches the binding the comparison actually reads. Recorded `did-not-clear`.

Divergent — non-append-only — head movement is enumerated and closed. Every capture asks for append-only movement
to be recognized and for divergence to stay fail-closed, and none reports divergence being wrongly admitted.

### Axis B — merge-base cardinality is not one, and four readers disagree

One condition, four readers, four behaviours. Three refuse in three vocabularies; the fourth does not refuse.

| Reader                | Mechanism            | Result                                                 |
| --------------------- | -------------------- | ------------------------------------------------------ |
| Whole-WU verification | plain `merge-base`   | silently picks one; nothing records the choice         |
| Prepublication        | Candidate `--all`    | `classification-unavailable / merge-base-ambiguous`    |
| Public review         | sole-base resolver   | untyped throw, surfaced as a blocked obligation detail |
| Landing               | the overlap analyzer | `reconcile`; overlap `unavailable / merge-base-failed` |

- **Whole-WU verification is the severe one.** The collected subject named the base's own change and **omitted the
  branch's commit entirely** — no refusal, no reason, nothing recording that a choice between two ancestors was
  made. A companion case proves the subject digest differs across the two arrangements, and the digest is what
  currentness compares: identical branch work therefore reads as a changed Candidate and the ordinary fallback
  demands a fresh root. That is the mechanism behind the field's roughly 130 removed paths and its demand for a
  full new root over a terminal branch that already contained the landed predecessor. Classified
  `redundant ceremony`, and it is the only cell on this seam that returns a wrong answer rather than a stop.
- **Prepublication refuses the same condition the row above passes through silently.** Both readers are correct
  about the history and disagree about what follows from it: one boundary binds a subject derived from an
  arbitrary choice while the next declines to classify at all.
- **Public review sends the caller back to a checkpoint that already passed.** Status reports `base-moved` /
  `rerun-checkpoint`; the routed obligation reads `blocked` carrying "The Candidate target has no sole base
  coordinate." Nothing about the branch's contribution changed, and the rerun reads the same history and reaches
  the same reading — `did-not-clear`.
- **Landing degrades its evidence, not its verdict.** The drift read returns `reconcile` either way; only the
  overlap under it goes unavailable. That is what makes the consequence a classification failure rather than a
  drift failure — and it becomes a stop one layer up, at the checkpoint's
  `delivery-terminal-blocked / drift-classification-unavailable`.

A base with no common ancestor at all is enumerated and closed: the analyzer already gives it a distinct
`unrelated` status.

### Axis D — post-land suffix settlement composes before it reads the resolution

Replaying a pinned pre-landing contribution onto a landed predecessor returns `contribution-conflicted` naming the
path — and returns the **byte-identical refusal** once the operator resolves that path onto the landed predecessor.

The conflict is composed from three coordinates: the pinned predecessor as merge base, the pinned member, and the
observed landed predecessor. The resolved member head is consulted only after composition succeeds, so it cannot
affect a composition that conflicts. The probe proves the directed action is not an input to the outcome.

This sharpens the field record rather than repeating it. That record attributed the dead end to an external stack
rebase being unable to change the pinned replay; the pinned side is only half of it. The replay's other endpoint
does follow the operator, and still cannot help, because the conflict is decided before that endpoint is read.

The refusal is classified `fail-closed, correct` and is deliberately unpinned — a hand-resolved suffix is not a
mechanical reapply, and the proof is right not to call it one. **The defect is one layer up, at
`native-landing.ts`**, where the settlement wraps this result in guidance directing the operator to resolve the
listed paths and rerun `arc delivery native land-status`. That text names a remedy the row proves cannot clear it.
It is not covered by the in-flight drift-remedy Errand, whose sites are the integration checkpoint, its advisory
register, the drift continuation, and teardown.

**Source confirms what the probe measured, and shows why.** `proveGitDeliveryContribution` reaches its verdict
through `readMergeTreeComposition` on `(before.predecessor.head, after.predecessor.head, before.member.head)` —
the pre-landing predecessor as merge base, the landed predecessor, and the pre-landing member. The observed
member head reaches only the tree comparison that runs _after_ a clean composition. The invariance is structural,
not incidental: no act of the operator is an input to the composition that refuses them.

**The completing input has a name, and ARC has built half of it.** It is not the operator's resolution — it is
the operator's **acceptance** of a movement ARC cannot prove, which is exactly what the provider path obtains
through `conflict-resolution-required`. The obtaining half is adoptable as it stands; the discharging half is
gated on a selection referent this path does not have. § What the record may carry reads both from source.

The same guidance line is wrong a second way, and the fix is one arm wider than first recorded. Four of this
function's refusal arms omit "Keep the reservation", and **two of them share the shape**: the suffix-proof arm
above, and the terminal-absorption arm, which emits "Resolve the listed top absorption paths, then rerun" on a
`content-conflict` from `absorbTop`. An implementer taking the earlier wording literally would fix one and leave
its twin. Whether the absorption arm carries the same invariance is **not established** — its composition inputs
are untraced, and a probe is owed before it is claimed either way.

---

## What the field record got wrong

Recorded so an implementer starting from the origin captures does not inherit these.

- **"Three of the four loci are one ambiguity at three verbs."** Four verbs. The fourth is whole-WU verification,
  and it is the one that does not refuse.
- **Locus 2 attributed the fresh-root demand to the `attest` fallback.** The fallback behaves correctly on the
  subject it is given; the arbitrary ancestor choice upstream is what makes that subject wrong.
- **The post-land capture asks for a durable re-enterable settlement as though the replay were the defect.** The
  replay's refusal is correct. The narrower true defects are the guidance text and the absence of any completing
  input.
- **The origin captures frame loci 3 and 4 as needing a recovery route to be invented.** The rebind verb exists,
  is covered, and works. The gap is that the readers refuse without offering it.
- **The posture said "live and currently blocking."** The instance was retired by its Errand before this session.

---

## Reader inventory — derived by sweep

Re-derived 2026-09-16 after two successive undercounts. The label changed deliberately: `source-verified` was
claimed twice over a table that was short both times, so the method is recorded instead of the assurance.

```sh
grep -rn '"merge-base"' packages/arc-framework/src --include=*.ts \
  | grep -v __tests__ | grep -v is-ancestor | grep -v independent
```

That returns sixteen hits at **fifteen distinct call sites** (one site contributes both its invocation and its
error-reporting args). **Seven pick silently** — no `--all`, one of N bases taken as the answer. Every reader
resolves its base independently; there is no shared primitive today.

| Locus                                      | Call                   | Disposition                            |
| ------------------------------------------ | ---------------------- | -------------------------------------- |
| `git-candidate-subject.ts`                 | `merge-base` (no flag) | silent pick — Axis B's wrong answer    |
| `repository-target.ts`                     | `merge-base` (no flag) | silent pick — review diff base         |
| `git-candidate-applicability.ts`           | `merge-base --all`     | typed `merge-base-ambiguous`           |
| `git-candidate-effective-target.ts`        | `merge-base --all`     | untyped `throw` — Axis B's fourth verb |
| `base-overlap.ts`                          | `merge-base --all`     | `unavailable / merge-base-failed`      |
| `git-contribution-proof.ts`                | `merge-base --all`     | `null` — endpoints-unverified          |
| `git-review-contribution-applicability.ts` | `merge-base --all`     | typed `merge-base-ambiguous`           |
| `git-decompose-v3-repository-plan.ts`      | `merge-base --all`     | typed `ambiguous-merge-base`           |
| `git-decompose-v3-retirement-delta.ts`     | `merge-base --all`     | typed `ambiguous-merge-base`           |

Five further silent picks sit outside this work unit's concerns and are listed for the sweep's completeness
rather than for treatment: `identity-transaction.ts`, `from-branch.ts`, `github-refresh.ts` (one of its two),
`committed-progress.ts`, and `hosted-reservation-discharge.ts`. `github-refresh.ts` also carries an `--all` site.

The untyped throw carries "The Candidate target has no sole base coordinate." — the same string the ledger records
as a blocked obligation's `detail`, confirming the surfaced message is an exception text rather than a result.

**`repository-target.ts` is taken into scope, and it is the strongest trace in the table.** Its silently picked
base becomes `diffBaseSha` and `diffBaseTree` — the local review host's diff base. That value is review-target
_identity_: it is asserted in the gate's identity module, compared on admission, and the reviewed change set is
computed as `base..head` from it. So a silent pick here means the review examined the wrong change set, which is
this draft's own central argument about silent picks landing on the review-evidence surface itself. It carries no
probe row, which is why the earlier scope line excluded it; the Owner scoped it in on the argument instead,
2026-09-16. Its refusal channel already exists — the function throws a closed-union derivation error on this
line today — and the base-merge remedy reaches it, because it compares a `(head, base)` pair.

**`git-review-contribution-applicability.ts` is a near-twin of Candidate applicability**, asking the same
"how has the base moved under my pinned prior" question over `(priorHead, currentBase)` under the same typed
reason. § Resolver or relation classifies readers by question and does not yet carry it, or the proof gate.

The two decomposition sites remain outside: they reached the same read-all-then-refuse shape independently, under
a third spelling of the reason code, with no observed failure behind either. Fifteen call sites, five
dispositions, three spellings of the reason and one refusal that never names it. Whatever is settled here is
settling a repetition ARC already carries, not introducing an abstraction it lacks.

### Resolver or relation

Classified 2026-09-16 and **re-classified after an adversarial pass falsified the first attempt**. The first
reading split these readers into membership questions and relation questions, and sent the two path-selecting
readers down a commit-derived route that removed their need for a base. That was wrong, and the way it was wrong
is recorded here because the correction is the design.

| Reader                              | Question it asks                         | Needs                 |
| ----------------------------------- | ---------------------------------------- | --------------------- |
| `git-candidate-subject.ts`          | what content did I contribute            | the base resolver     |
| `base-overlap.ts`                   | do both sides change the same content    | the base resolver     |
| `git-candidate-effective-target.ts` | which single base coordinate do I record | the base resolver     |
| `git-candidate-applicability.ts`    | how has the base moved under my baseline | the relation          |
| review readiness                    | is the bound head still the observed one | lookup, then relation |
| closeout                            | is the bound head still the observed one | the relation          |

**Why the commit-derived route failed.** Paths derived from a branch's own commits are cardinality-independent,
which is what made the route attractive. But a branch contributes content relative to a base, and after the base
is merged in, keeping the branch's side of a path the base changed is a substantive contribution that no
branch-side commit records on its own. Every commit-derived mode either misses it or admits the base's own
changes — demonstrated in a scratch repository, with the merge carrying the reversion rather than a commit after
it. That is the omission class § Established practice raises above every other row, reachable **by design**
rather than by hostility, because this design names merging the base in as its cardinality remedy.

**The subject was on the right side of Git's line all along.** It asks a content question and answers it with a
content tool; what it lacked was cardinality handling, not a different question. The correction is therefore the
smallest one available: read the base with `--all` and refuse typed when the count is not one, which is what
three of these readers already do. Under that rule the base-relative diff is well defined, because the ambiguity
it was fragile to has been refused rather than silently resolved.

**Three readers want the shared base resolver; three want the relation.** The resolver is read-all,
refuse-on-more-than-one, then diff or record from the single base. It is not a new primitive — it is the shape
`base-overlap.ts` and `git-candidate-effective-target.ts` already implement separately, and the one the
decomposition call sites reached independently under a third spelling.

**The staged arm follows the same rule.** When the subject collector is given no revision it compares the index
against the base, and that arm is live: `git-candidate-effective-target.ts` takes it whenever no target is
supplied and feeds the result into Candidate currentness. It needs the identical treatment — resolve with
`--all`, refuse on more than one, else diff the index against the single base. A probe is owed for it; the
existing pin exercises only the committed arm and would otherwise retire green over an untouched silent pick.

**What the resolver does not settle** is the coordinate obligation under cardinality above one. No consumer can
take a base _set_ — reading tree entries needs one ref and rematerialization needs one predecessor — so the
base-set arm is dead and the coordinate readers refuse. Only Candidate applicability carries cardinality onward,
as a field on the diverged variant, because it alone consumes the relation rather than a coordinate.

`lib/git/ancestry.ts` is the existing ancestry-helper module and already wraps `merge-base --independent`, so
both primitives have a home rather than needing one invented.

**Scope line on the repetition.** The readers carrying this work unit's rows have observed failures behind them
and are in scope. The two decomposition call sites do not; unifying them would be symmetry rather than a traced
need, so the shared primitives should be _available_ to them without this work unit retrofitting them.

## Substrate: one observation mode, three postures

`terminalAuthoringMovement` already exists and is the nearest thing ARC has to a typed movement classification.
Source-verified 2026-09-16: the _option_ is a two-value union — `allow-append-only` and
`allow-append-only-frozen-request` — set at two handler call sites, while the _fact_ it produces is a record
carrying the deliverable, before and after coordinates, and a publication lease head. The ledger's count of five
observation modes passing the allowance is recorded there and is not re-derived here.

The characterization records that its consumers disagree:

- the position verb passes one value — the allowance makes the movement an observable **fact** rather than
  admitting it, and the verb then refuses on that fact's presence;
- session-init passes none, so the strictest posture is the default for the surface that only reads;
- review readiness and closeout read head equality with no ancestry term at all, so the fact never reaches them.

Three consumers, three postures, three recorded failures. Whether this is the unifying substrate for Axis A — or
for the whole family — is the first open question in § Continuity.

---

## Established practice

Surveyed 2026-09-16 against three questions this design turns on, primary sources preferred. Two results are
decisive, one closes an open question, and two candidate arms are eliminated.

### Cardinality is a refinement of divergence, not a second axis

Verified here rather than taken on report. If X is an ancestor of Y then X is itself a common ancestor of the
pair, and every other common ancestor is an ancestor of X — so X uniquely dominates and `merge-base --all`
returns exactly one. Cardinality above one therefore implies neither revision reaches the other. Confirmed
empirically: an ancestor/descendant pair returns one base, a criss-cross returns two with neither side an
ancestor of the other.

**This settles the resolver fork.** Axis B's condition is reachable only inside Axis A's diverged outcome, so the
two are not parallel mechanisms waiting to be unified by preference. One relation-typed read answers both,
carrying base cardinality and its consequences as fields on the diverged variant. Two independent primitives
would each have to re-derive the same reachability to know whether the second even applies.

### Git draws a line here, and the lesson is narrower than it first appears

`git log A...B` is defined as `r1 r2 --not $(git merge-base --all r1 r2)` — commit-set membership computed
against every base, cardinality-independent by construction. `git diff A...B` is defined as
`git diff $(git merge-base A B) B` — a tree diff against one arbitrary base, cardinality-fragile. Git answers
"which commits are mine" safely and "what content changed" fragilely, and documents both.

**The tempting inference from that is wrong, and this draft made it before correcting it.** The fragility is in
`merge-base` picking arbitrarily, not in asking a content question. A reader that genuinely asks what content it
contributed cannot be rescued by switching to the membership form: § Reader inventory records the case that
breaks it, where a branch's contribution is the retention of its own side of a path the base changed and no
branch-side commit carries it. What Git's line actually licenses is narrower — resolve the base with `--all` and
refuse when the count is not one, and the content form is then exactly as sound as the membership form.

### The silent pick is a recognized vulnerability class, not a rough edge

Azure DevOps detects multiple merge bases per pull request and surfaces "Multiple merge bases detected. The list
of commits displayed might be incomplete", framing it as security awareness: the single-base diff can be abused
so that changes present in the branch are absent from the review surface, creating "treacherous logic gaps".
GitLab carries an open issue for the same defect, where its diff view and its code-owner-approval calculation can
pick different bases.

ARC's exposure is the same shape and lands on evidence rather than a UI: the subject digest feeds Candidate
currentness and review applicability, so a silently-chosen base produces review evidence that omits changes. That
raises the whole-WU verification row above the other three rather than leaving it one of four.

### Arms eliminated

- **Union or intersection of changed paths across all bases** — no precedent, and the arithmetic defeats it. The
  diff from one base necessarily contains the other base's own changes, so requiring agreement refuses in
  essentially every real criss-cross. It is "refuse whenever cardinality exceeds one" in a selective-looking
  disguise.
- **A synthesized virtual base** — Git's own merge strategy, but merge-producing: it commits to an answer.
  Mercurial rejected it deliberately in favour of bid merge, recording that a virtual ancestor can make
  already-resolved conflicts reappear and reversed changes oscillate. It does not fit a read-only classification.
- **Refusing on disagreement across all bases** — defensible, but not idiom. Mercurial's bid merge prefers
  unanimity and degrades to majority; Azure and GitLab disclose rather than refuse. Prepublication may keep this
  as a deliberately stricter local policy, provided it is not claimed as established practice.

### Comparing a bound coordinate: add a term, never relax the lock

Git keeps exact equality at the layer that must not weaken — `update-ref`'s `old-oid` precondition — and adds
reachability above it. Its transaction outcomes stay textually distinct for a ref that already exists, a ref
missing but expected, and a ref at an unexpected value. Git does not collapse absent into changed at any layer.
This work unit's readiness reader does.

`--force-if-includes` is the nearest precedent: Git had an equality lease, found it defeated by a compatible
advance it could not see through, and closed the gap by adding a reachability check **on top of** the lease
rather than loosening it. `%(upstream:track)` then carries the vocabulary in porcelain — up to date, ahead,
behind, ahead and behind, upstream gone, and no upstream configured — the distinctions needed here, already
shipped and already separate from the write-time check.

There is no canonical name for the combined result type. The nearest named vocabulary is Git's own
fast-forward / non-fast-forward and the version-vector lineage's _descends_ versus _concurrent_, which Dynamo
splits as syntactic against semantic reconciliation. Adopt the shape and the layering; the type is ours to name.

### Gerrit types what ARC hand-rolls

Verified against Gerrit's own source and current documentation 2026-09-16.

Gerrit classifies every new patch set by `ChangeKind`, which carries six values: `NO_CHANGE`, `NO_CODE_CHANGE`,
`TRIVIAL_REBASE`, `TRIVIAL_REBASE_WITH_MESSAGE_UPDATE`, `MERGE_FIRST_PARENT_UPDATE`, and `REWORK`. They form a
hierarchy — a more trivial kind also satisfies a query for a less trivial one — and `changekind:REWORK` is
documented as equivalent to `is:ANY`, making it the catch-all rather than a selective filter. The kind is computed
by comparing the new tree against what cherry-picking the prior commit onto the new parent would produce, with a
separate delta check and a commit-message comparison. The repository's merge strategy is an input, so it is
deterministic given fixed commits _and_ fixed configuration, not from commit content alone.

`copyCondition` is the per-label query deciding which approvals survive a new patch set. Two defaults matter, and
they are different things:

- **Gerrit core with no `copyCondition` configured** — nothing is copied, for any change kind; the evaluation is
  skipped outright.
- **A stock install's own project config** — Code-Review carries
  `changekind:NO_CHANGE OR changekind:TRIVIAL_REBASE OR is:MIN`, and Verified carries
  `changekind:NO_CHANGE OR changekind:NO_CODE_CHANGE`.

So a rework inherits no positive review, **but a standing minimum score survives it**, because `is:MIN` is
change-kind-agnostic. That asymmetry is the precedent worth taking, and it is a sharper one than a blanket
"nothing carries": the signal that survives arbitrary movement is the fail-closed one, and only that one. A veto
persists until it is answered; an approval does not outlive the thing it approved.

What ARC has in place of this is an observation-mode flag three consumers read three ways. The intent matches;
the typing and the explicit policy layer are what is missing.

### Axis D: the refusal is the industry boundary

No surveyed system — GitHub, Gerrit, Graphite, Zuul, bors, or Google's tooling — consumes an operator's
out-of-band conflict resolution back into a pinned mechanical replay. The universal pattern is to stop, evict,
and require a new artifact that re-enters verification. Gerrit's most conflict-tolerant primitive is its rebase
with conflicts allowed, which produces a patch set whose files carry Git conflict markers and reports that fact
back through `containsGitConflicts`; a human still has to resolve the markers in a further patch set, and it
cannot be combined with rebasing on behalf of the uploader, precisely so unseen conflict edits are never treated
as approved. The pinned replay's byte-identical refusal is therefore the standard boundary rather than a defect,
and the remaining question is not whether to consume the resolution but what this work unit's new-contribution
path looks like. Gerrit's change-kind and copy-condition model is the fullest precedent for how much prior
verification such a contribution inherits — no positive review, with a standing veto surviving. That a conflicted
patch set classifies as `REWORK` follows from the two mechanisms but is not documented as such; treat it as
derived.

`git rerere` is the one mechanism that carries a resolution across a moved base — it fingerprints normalized
conflict hunks rather than commit identity, so it is base-agnostic by construction. It is also local, opt-in, and
consulted only inside Git's own three-way merge; no server-side queue reads it. Recorded as considered and
inapplicable rather than unexamined. Jujutsu's structural conflict propagation is the same note from the other
side: real prior art, single-repository, with no review or landing system built on it.

### Merge-queue composition — the mechanism, and what does not follow from it

GitHub's merge queue builds a temporary branch carrying the base plus every queued request ahead of the
subject, and lands that. The landed commit is structurally not the request's own head.

**The stronger reading of that fact does not survive source.** Both affected readers compare a _change-request_
head rather than the landed commit — `retirement.ts` tests `request.headSha === terminal.coordinates.head`, and
review readiness reads `request.pullRequest.headSha` — so a queue that leaves the request's own head alone is
orthogonal to this comparison, and it does not follow that such a project would meet `delivery-member-unbound`
on every landing. What remains true is the constraint in § Boundaries: whatever replaces the equality comparison
must not assume the landed head is the head ARC bound, because a rebase-style submit strategy does move the
request head. Whether any given queue configuration does so is unverified, and no probe covers an external
mover.

## The relation

Authored 2026-09-16 against the layering § Established practice establishes: exact equality preserved at the
write boundary, reachability added above it.

### ARC already computes this, once, by hand

`scripts/base/merge.ts` derives the relation inline, in exactly that layering. `endpointMovement` holds the
equality check first; two directional `merge-base --is-ancestor` reads then add reachability above it, and the
two directions select three outcomes that already carry distinct next actions:

| Directional read                | State                    | Next action          |
| ------------------------------- | ------------------------ | -------------------- |
| bound base reaches the head     | `skipped-clean`          | `continue-reconcile` |
| the head reaches the bound base | `head-contained-by-base` | `rerun-checkpoint`   |
| neither                         | falls through to merge   | —                    |

Three of the distinctions this design needs, already computed, already separated by remedy. The relation is
ARC-internal precedent as well as Git's, and the work here is extraction rather than invention. § The failure
family already recorded the other half of that: retirement containment compares by ancestry while delivery
terminal settlement compares by equality.

**Extraction is also the only available composition.** Ten-odd ancestry helpers are hand-rolled across the
codebase and no two agree on a return shape — `boolean` in `from-branch.ts`, `branch-bounded-notes-export.ts`,
and `in-flight-derivation.ts`; `"ancestor" | "not-ancestor" | "unavailable"` in `chain-containment.ts`;
`"ancestor" | "not-ancestor" | null` in `git-contribution-proof.ts`; an injected predicate port in
`scripts/base/merge.ts`. They also split across three executor shapes: `GitExec`, `RawGitExec` with
`objectAccess: "local-only"`, and the review gate's own injected ports. No existing helper is consumable by all
three relation readers, which is what makes a shared primitive composition rather than new mechanism.

**Four sites already read both directions and derive this relation by hand**, each under its own return type
and vocabulary: `scripts/base/merge.ts` to decide whether a base merge is needed, `in-flight-derivation.ts` to
order two candidates, `push-fetch.ts` to choose between fast-forward and refusal on a notes ref, and
`sync-status.ts` to classify a local ref against its fetched remote. None of them names the thing it computes.
Four independent derivations of one relation is the repetition this design ends, and it is a stronger warrant
than the single-site precedent alone.

### The variants

Anchored on `%(upstream:track)`'s shipped vocabulary and on `merge.ts`'s existing state names. **The naming is
proposed, not settled**; the six distinctions are.

| Variant     | Holds when                               | Git's name       | Consumer consequence                        |
| ----------- | ---------------------------------------- | ---------------- | ------------------------------------------- |
| `unchanged` | observed head equals the bound head      | up to date       | proceed — today's equality check, preserved |
| `advanced`  | the bound head reaches the observed head | ahead            | the movement Axis A must admit              |
| `rewound`   | the observed head reaches the bound head | behind           | the record is ahead of reality              |
| `diverged`  | neither reaches the other                | ahead and behind | fail-closed; carries base cardinality       |
| `absent`    | no record binds this subject at all      | gone             | today's answer for a stale binding          |
| `unknown`   | the ancestry read did not establish one  | —                | stop; never collapses into a verdict        |

Two of these are the whole Axis A defect. `advanced` and `absent` are today indistinguishable at review
readiness, which is what the pinned probe records; separating them is the fix.

**Cardinality is a field on `diverged`, not a variant.** § Established practice proves cardinality above one is
reachable only when neither revision reaches the other, so a variant would place it beside a case it lives
inside. Applicability is its only consumer; the other readers neither ask nor branch on it.

**`unknown` never collapses.** Git keeps a ref that is missing from a ref at an unexpected value; ARC's
addition is that an ancestry read which failed operationally is a third thing again. The hand-rolled helpers
disagree here specifically — several return `false` for a failed read, which reads as "not an ancestor" and is
how an operational failure becomes a verdict.

**Two of the six are not relations, and the typing should say so.** Two directional ancestry answers span
exactly four states, which are `unchanged`, `advanced`, `rewound`, and `diverged`. `absent` has no bound
revision to compare, so the classifier cannot even be called — § Readiness reads its key backwards makes that
explicit, since a moved head finds no member and the relation cannot be computed there at all. `unknown` is a
read-availability outcome produced by the reader. Whether the contract is a flat six-variant union or a
four-variant relation wrapped in a resolved / absent / unknown result is therefore a live typing choice rather
than settled, and it propagates into every typed remedy dispatch. The distinctions stand either way.

### Shape

Two layers. A **pure classifier** takes the two directional answers and the base cardinality and returns the
variant — no Git dependency, so the variant logic is exhaustively testable without a repository, which is what
every hand-rolled helper above gave up. A **thin reader per executor** supplies those answers over whatever
executor its consumer already holds.

**The executor plurality is not an obstacle here, and the design should not claim credit for absorbing one.**
`GitExec` and `RawGitExec` differ in one real way — `RawGitExec` returns `Uint8Array` for commands whose
NUL-framed output must survive as bytes, which is what lets applicability's strict decoder detect malformed
path evidence. That distinction is essential and this work unit should not collapse it. It is also irrelevant
to this primitive: `merge-base --is-ancestor` writes no stdout and answers through its exit code, so every
executor already supplies everything the reader needs and each adapter is a few lines. The split earns its
place on the two reasons below, not on absorbing an executor difference the predicate never touches.

The classifier is pure, so every variant is reachable in a test without constructing a repository state that
produces it. And the reader is the only layer that can produce `unknown` honestly: it knows whether Git
answered, so the classifier never has to invent a verdict for an answer it did not get. That is precisely the
failure recorded below — the collapse happens where the exit code is read, which is the layer this design
makes a single one.

### Readiness reads its key backwards

Source-verified 2026-09-16. This is a design consequence the reader inventory did not carry, and it changes
what the readiness fix is.

`readiness.ts` resolves its member with `resolveMemberByHead(request.pullRequest.headSha)`, and every
production member lookup is keyed the same way: `DeliveryMemberSelector` has a `head` arm and a `ref` arm, and
`stateMemberMatches` requires `member.coordinates.head` to equal the observed head on **both**. The `ref` arm
conjoins rather than compares, has zero production constructors, and an integration test deliberately pins
that a correct head under a wrong ref resolves to nothing — so the conjunction is intended, not accidental.

The consequence: **a moved head does not mismatch, it misses.** No member is found, so there is no bound
coordinate to compare and the relation cannot be computed at this reader at all. Adding an ancestry term to a
comparison that never runs would change nothing.

The fix is an inversion the reader already has the inputs for. Its vehicle carries `planId`, `deliverableId`,
and `workUnitSlug`, and the code resolves by head and then _validates_ those three against the result. Resolve
by the identity it already holds, then compare the recorded head against the observed one with the relation:
the same two facts, in the order that can tell a stale binding from an absent one.

**It is not free, and an earlier pass of this draft said it was.** `DeliveryMemberLookup` exposes exactly one
method and it is head-keyed, and neither `DeliveryMemberSelector` arm keys on the deliverable — so the inversion
needs a lookup route that does not exist today. Three are available and they are not equivalent: add a
deliverable-keyed arm and method; reuse the discharge-target lookup, which enumerates bound members by work unit
but requires a bound change request, so its coverage is narrower; or route through the terminal-record lookup.
The difference decides whether `absent` means _no member_ or _no hosted member_, which is exactly the
distinction this reader is being fixed to make — and therefore which remedy the variant dispatches, since
§ Forward-compatibility requires each variant to carry a typed remedy action. **That makes it a design decision,
not detail-design**, and an earlier version of this passage called it detail-design in the same breath as
conceding it selects a variant's meaning. Two engineers handed this draft build readers that report and remediate
differently on identical repository state. Carried in § Continuity; the claim that the inversion costs nothing
was wrong and fed the proportionality trace.

The three `delivery-member-mismatch` facts also do not survive unchanged: under identity resolution the member
is found _by_ those fields, so the comparisons become tautological and a head bound elsewhere surfaces through
the relation instead. The property is kept; the fact that reports it changes name.

Closeout needs no such inversion — `verifyDeliveryTerminalSettlement` already holds the terminal member and
compares its recorded head directly. Its defect is the bare equality inside the eight-term conjunction, which
the relation replaces in place.

### Where the unresolved condition lives

Settled 2026-09-16 against a stated criterion: **durability is warranted where its absence would make ARC wrong
rather than merely uninformed.** A resumed session that reports what is owed and re-derives the rest is
acceptable; one that acts on a stale cached fact is not. The cost to avoid is redundant ceremony, and the
realistic driver is not carelessness — the post-execution tail legitimately runs for days when it waits on an
asynchronous human review, and no session should have to stay open across that.

**Re-settled after reading the landing path.** The criterion was right and the answer derived from it was wrong,
because the question presumed a durable record was needed. It is not. The thing that must outlive the wait
already exists, and it is the held reservation.

**Nothing about the wait is cached, so nothing can go stale.** `reconcileLinkedNativeDeliverySuffix` runs only on
refs that have already moved: it requires the provider to have retargeted the request, the observed ref head to
equal the request head, and at least one member to have moved, refusing `suffix-request-mismatch` or
`suffix-result-unchanged` otherwise. Every refusal returns before its single state write, so the reservation
persists untouched. The operator's own work therefore happens entirely _before_ any disclosure exists, across as
many days as it takes, with each `land-status` run refusing afresh against live observation.

**The disclosure is regenerated, never stored.** When a movement finally cannot be proved, that run composes the
disclosure out of what it has just observed; a later run with nothing moved composes a byte-identical one. So the
window in which a disclosure can be invalidated is disclosure-to-acceptance, not conflict-to-resolution — and a
disclosure invalidated inside that window _should_ be refused, because the operator would otherwise be accepting
a description of a state that no longer exists. The days-long tail never touches the predicate.

That is why all three earlier framings were wrong. A durable phase was the wrong home because a days-long wait on
a person is not an operation in flight. A reservation-local transition was the wrong home because it cannot
outlive the session. A pending-obligation record sibling to `pendingReviewFixVerification` was the wrong home
because there is nothing to hold: the reservation outlives the session already, and the disclosure is cheaper to
recompute than to validate.

**What the criterion costs here, stated plainly.** The operator's acceptance is not durable either. An interrupted
settlement means resubmitting the same disclosure — one command, an identical conflict set, no judgment asked a
second time. ARC reports what is owed and re-derives the rest, which is the acceptable side of the criterion; it
never acts on a cached fact, because it caches none.

**The predicate is the resubmitted disclosure itself.** `adoptExternalDeliverySuffixRefresh` composes
`{ planId, scope, expectedStateRevision, observedSuffixDigest, conflicts }` and refuses
`conflict-resolution-mismatch` unless a resubmission canonicalizes identically against a freshly derived one.
That is the conditional-precondition idiom § Established practice names, with the digest as the entity tag. The
earlier open question — whether the predicate reads recorded coordinates or re-resolved roles — dissolves: it
reads neither, because it re-derives the entire comparand and compares canonical forms. The dilemma was
manufactured by assuming stored content.

**What the relation still supplies is the report.** When a digest does not match, the refusal should name which
coordinate moved and how, in the vocabulary the rest of this design uses, rather than emitting a bare mismatch.
That is the one place this half consumes the frozen half, and it is the same role the relation plays everywhere
else here: it reports the condition, it does not decide it.

### Naming the variants, and where the definition lives

Settled 2026-09-16 on the two parts that carry consequences; the word choice itself is recorded as proposed.

**Neither existing vocabulary can be adopted, for opposite reasons.**

`merge.ts`'s names — `skipped-clean`, `head-contained-by-base` — are _caller-outcome_ names: they say what that
one caller does about the relation, not what is true of the two revisions. A shared primitive has three callers
who do different things with the same fact, so outcome names cannot be the shared vocabulary. That is not an
objection to the precedent; it is the clearest statement of why extraction is needed at all.

Git's porcelain names — ahead, behind, ahead and behind — are _viewpoint-relative_. Git's viewpoint is fixed
(local against upstream) and ARC's is not: this design compares a bound coordinate against an observed one at
two readers and a baseline against a current base at a third. "Ahead" would mean opposite things at different
call sites, and reversing it is a silent defect rather than a type error. Adopt the distinctions, which
§ Established practice already does; do not adopt the words.

**The relation is over an ordered pair, and the order carries the direction.** Name it `(reference, subject)`
and define every variant as a statement about the subject relative to the reference, exactly as
`merge-base --is-ancestor <ancestor> <descendant>` is positional rather than semantic. Each caller then declares
which of its revisions is which, and no variant flips meaning between call sites. This is the part the two
rejected vocabularies get wrong, and it is settled independently of what the variants are called.

**Proposed words**, from the subject's side of that pair: `unchanged`, `advanced`, `rewound`, `diverged`,
`absent`, `unknown`. `diverged` is Git's own concept and `merge.ts`'s fall-through; `absent` is preferred over
Git's `gone`, which implies something was once there; `unknown` is ARC's addition and has no Git counterpart
because Git throws where this must classify. `rewound` is the least settled — it names the shape correctly but
faintly implies a cause, when the same relation also holds for a record binding something never published.

**The definition lives in the type.** `strategy-procedure-evolution` Principle 4 holds that contract surfaces
derive from the TypeScript types rather than being hand-authored a second time, and this is such a surface: a
closed variant set consumed by typed readers and carried in a versioned record schema. A prose glossary beside
it would be the second copy that principle exists to prevent.

**It does not join the briefs' vocabulary, and the reason is a constraint already adopted.** Principle 7's
briefs tier carries terms an agent must know in order to _operate_ — `Class`, errand, interlock, review
increment. These variants appear in emitted results rather than in instructions, and § Forward-compatibility
check already requires each variant to carry a typed remedy action rather than prose. An actor therefore
dispatches the action instead of interpreting the word, so the name has no always-loaded miss-cost to justify a
slot. Where a variant does reach a durable record, the record's own schema is its definition.

### The subject's path set — base-relative, with cardinality refused rather than picked

Settled 2026-09-16, **after an adversarial pass falsified the commit-derived answer this section previously
carried.** The earlier reading treated the choice as touched-versus-net and concluded that a commit-derived set
was both the only cardinality-safe option and the less movement-sensitive one. Both halves were wrong, and the
correction removes machinery rather than adding it.

**The set is the base-relative diff from the single resolved base.** Under the resolver rule in § Reader
inventory the base is read with `--all` and the reader refuses when the count is not one, so the diff's
fragility is discharged by refusal rather than by an arbitrary pick. No merge-diff mode selection, no union, no
special handling of merge commits: the subject is a tree-to-tree comparison, which is what a content question
deserves.

**What the commit-derived answer got wrong.** Empirically, a branch that merges the base in and keeps its own
side of a path the base changed contributes that retention, and no branch-side commit records it. The condensed
merge mode that suppresses the merged-in base's changes also suppresses this, and the mode that catches it
admits every base change as the branch's own. The base-relative diff reports it correctly, and the merge that
created the situation has made the base an ancestor — so cardinality is one and the diff is well defined
exactly where the design most needs it.

**And the movement-sensitivity claim was inverted at the metric that matters.** The subject digest is taken over
path, content digest, and mode — not over path names. A path changed and then reverted within the branch
therefore leaves a commit-derived set carrying a no-op entry whose content matches the base, so the digest
differs from the attested one permanently and currentness never clears. The base-relative set drops the path and
the digest returns to its attested value. The commit-derived answer would have _added_ a durable
redundant-ceremony source while this draft recorded it as removing one.

Two consequences worth keeping. The severe row's defect was never that the subject asked a base-relative
question; it was the silent pick, and refusing on cardinality is the whole fix. And the remedy in
§ Refusal-recoverability audit does double duty here: merging the base in both clears the refusal and makes the
content comparison well defined.

### What the record may carry

Re-settled 2026-09-16. The question was asked as though the record had to be designed. It does not: ARC already
runs this protocol on the provider path, and the native landing path is the one missing it.

**The existing protocol, read from source.** `adoptExternalDeliverySuffixRefresh` in `suffix-reconciliation.ts`:

1. `collectDeliveryProviderRefreshConflicts` gathers the **complete** conflict set rather than returning on the
   first — every member whose movement proves `contribution-conflicted`, each with its paths. Any other refusal
   stays hard.
2. With conflicts present and no resolution supplied, it returns `conflict-resolution-required` carrying the
   conflicts, a resubmittable `resolutionInput`, and `externalRefRestorations` — the exact ref, observed head,
   and restore head needed to undo the movement by lease if the operator declines.
3. With a resolution supplied, it refuses `conflict-resolution-mismatch` unless that blob canonicalizes
   identically to a freshly derived one, then reserves an operation carrying the approved member ids.
4. `settleReservedDeliverySuffixRefresh` re-derives the conflict set under that reservation and requires the
   approved id set to match, then rewrites local refs, absorbs and publishes the top, and writes
   `pendingReviewFixVerification` from the approved ids.

**The capture asked for this shape by name.** § Retained capture detail's carried obligation is to "bind the
decision to the exact plan, operation, state revision, observed suffix, member identities, before/after refs and
trees, and conflict paths", and to "require semantic approval only for the disclosed conflicted contributions;
continue mechanical proof for every other movement". That is `resolutionInput` and the approved-id waiver, term
for term. The capture also attributed suffix reconciliation to `native-landing.ts`; the protocol it describes
lives in `suffix-reconciliation.ts`, which is why it read as unbuilt.

**The three classes were right; two of their homes were wrong, and the fourth pass found the cause.** The
disclosure is the `resolutionInput`, and the decision is that same blob resubmitted — both confirmed against
source. The obligation was recorded as `pendingReviewFixVerification`, which the settlement emits, and that is
where adoption stops being a lift.

**The whole protocol is gated on a selection referent the native path does not have.** Verified across four loci:
`DeliveryPendingReviewFixVerificationV1Schema` requires `selectedDeliverableId`; the state refinement requires it
to resolve to a state member and to sit inside a plan-ordered `memberDeliverableIds`; the disclosure's own `scope`
is `{ kind: "dependent-suffix", selectedDeliverableId }`; and `adoptExternalDeliverySuffixRefresh` runs the
collect-disclose-resubmit arm only when `selectedDeliverableId !== undefined`, proving movement-by-movement
otherwise. On the provider path that referent is the republished member whose head has not reached its dependents.
A native landing has no such member: the analogous one has just been merged into the target.

**Three candidates, no lean, all open.** The **landed member** — defined, still present in state, but absorbed
into the target, so an obligation naming it reads oddly. The **first conflicted suffix member** — the thing
actually at issue, but selected by the conflict rather than by an operator, which is not what the field means
anywhere else. Or a **native arm on the pending record** carrying no selection at all — which an earlier version
of this section foreclosed by asserting the design "adds no field at all". That assertion predates the referent
problem and does not survive it. `installDeliveryReviewFixVerification` is a shared installer, so a write path
composes once the referent is settled; the gap is meaning, not mechanism.

**The obligation as built does not carry this design's success signal.**
`projectDeliveryReviewFixVerificationContinuation` emits `nextAction: "verify-review-fix"` with `tier1Required`
over the **terminal** head and tree, under `tier1Reuse: { kind: "exact-tree", requiredResult: "passed",
coveredInputs: "unchanged" }`. That is a check-reuse obligation. § Retained capture detail requires that new
member heads receive **fresh** applicability, review, and checks before landing. So the field is correct as the
closeout encumbrance — every encumbrance reader already checks it — and insufficient as the discharge. Both roles
were previously claimed for it.

**Abort is not merely unbuilt; its meaning does not transfer.** `externalRefRestorations` has four references in
source — the interface field, its composition, its return, and a result-schema declaration. Nothing consumes it
and no restoration is performed, so "already built" was wrong. The deeper problem is semantic: on the provider
path the movement being undone is an unadopted external refresh, so restoring returns the delivery to a coherent
pre-decision state. After a native landing the host merge has already happened. Restoring suffix refs to their
pre-landing heads would re-base them on a predecessor the target no longer carries, and the provider's retarget
does not revert. **There is no pre-decision state to return to**, so what abort means here is an open design
question rather than a missing executor.

**What still stands, and it is the larger half.** The disclosure is regenerated rather than stored; the
resubmission is compared by canonical form against a freshly derived one; arrival needs no new operation, no
second reservation, and no state-schema change, because the reservation is already held and the landing
projection is passed unpersisted at the same revision. Each was checked against source by the fourth pass and
held. The input side of the protocol is adoptable as it stands.

**How often the gate fires, because that is what decides whether it is friction.** It fires only when `merge-tree`
cannot compose a member's pre-landing content across its predecessor's landing — a genuine content collision
between a landed change and a dependent one. The ordinary restack is silent: identical trees take the
`tree-equality` fast path, a clean reapply takes `mechanical-reapply`, and neither asks anyone anything. Movement
alone never reaches the operator. So the approval is not a tax on routine landing; it is the event this work unit
is named after, and its rate is the rate of real post-landing conflicts.

**One narrowing worth considering.** ARC already classifies paths `reviewable` / `evidence-neutral` /
`regenerable` through `classifyPathTreatment`, and a collision confined to lifecycle projections — the roadmap, a
work unit's own artifacts — carries no judgment to exercise. Gating the disclosure on at least one `reviewable`
conflicting path would keep the question for the cases that have one. Recorded as open rather than adopted: the
classifier's regenerable set is currently narrow, and whether the all-neutral case is reachable often enough to
earn the term is unmeasured. Adopting it on the reasoning alone would be the symmetry § Proportionality rules out.

**What the gate may not become is agent judgment.** Waiving a failed contribution proof is an authorization over
a check whose subject is usually the agent's own restack, and `DEV-RULES.ARC` § Rule Authority puts that limb out
of the agent's reach — the claim needs a witness the agent does not write. The narrowing above changes how often
a person is asked; it does not move who decides.

### What composes with the existing obligation, and what only rhymes

Asked because this work unit looked like it was adding a second instance of a shape ARC already has. It is not
adding one at all, which changes both answers.

**The payloads do not compose, and the question is now moot.** `pendingReviewFixVerification` carries member
identities and nothing else, and that is exactly what the suffix protocol needs of it — the settlement writes the
approved ids into that field. There is no second record to unify with it. The earlier analysis stands as a
correct answer to a question this design no longer asks.

**The encumbrance predicate loses its trace.** Asking "may this delivery proceed, and if not what holds it" is
hand-enumerated rather than shared:

```text
if (state.activeOperation !== null)                return refused("operation-active");
if (state.pendingReviewFixVerification !== null)   return refused("pending-review-fix-verification");
```

That pair appears in `compose.ts`, in `retirement.ts`, and twice in `terminal-integration.ts` — the
integration-checkpoint and terminal-absorption reader, which is the closeout boundary a waiver must not slip
past — while `entry-inspection.ts` reads both to _route_ rather than refuse. The argument for extracting a shared
predicate was that a third obligation would make every such site grow a third term, and a site that grew only two
would report an unencumbered delivery while something was owed. **There is no third field.** The waiver's
obligation is `pendingReviewFixVerification`, which every one of those sites already reads.

So the extraction is duplication without a traced need, and § Proportionality's own rule disposes of it: compose
existing substrate, and never build on symmetry. **Route it to capture rather than into scope**, on the same line
§ Reader inventory draws for the decomposition call sites.

**What survives is sharper than what it replaces.** The risk that made the extraction look necessary is real, and
it now lands as a requirement on this design rather than on a refactor: the settlement must write the obligation
for **every** waived member, because that write is the only thing standing between an unprovable movement and a
closeout reader reporting the delivery clean. A waiver that settles without it would satisfy the recoverability
rule's fourth clause in the worst available sense — the success path reachable while something is owed.

**The spine extraction had a causal justification and source refuted it.** An earlier version here said the two
settle functions had diverged — one collecting the complete conflict set, the other returning on the first
refusal — and that the divergence _was_ Axis D. It is not a divergence. Both provider functions carry the same
fork: `adoptExternalDeliverySuffixRefresh` runs `collectDeliveryProviderRefreshConflicts` when a selection is
present and `proveDeliveryProviderRefreshMovements`, which returns on the first refusal, when it is not;
`settleReservedDeliverySuffixRefresh` carries the identical fork keyed on the approved id set. **The
complete-conflict-set behaviour is gated on selection, not drifted between copies** — the same referent that
§ What the record may carry now records as open.

**So the least elaborate credible route is the one to take.** Both helpers are already module-level exports. The
native loop can build `DeliveryProviderRefreshMovement` values directly — it already constructs exactly that
shape in its observed-member list — supply a predecessor-pair map so the arbiter closure can form contribution
endpoints, and take the resubmitted disclosure through the `native-land-status` request. That delivers Axis D's
fix without touching the provider path at all.

**What extraction would actually buy is smaller than claimed.** An earlier estimate here put the duplication at
roughly a hundred and fifty lines; reading both tails, the genuinely common core is the local-ref rewrite loop
plus a structurally similar absorb-then-publish sequence, and the surrounding steps diverge on both sides — the
native tail alone observes member-ref checkouts, while the provider tail alone composes a terminal conflict
preparation, threads a publication lease head, cleans up prepared candidates, and projects a verification
continuation. The estimate was soft and should not carry weight on its own; the refuted causal claim is what
decides this.

**And the seam would sit in the wrong place.** The one fork a shared spine must carry is the selection gate — the
single thing that genuinely differs between the two paths. Abstracting over the least-alike element is the
signature of a premature abstraction, which is the failure this section already names on the payload side.
§ Proportionality's rule closes it: compose existing substrate, and never build on symmetry.

**Recorded as a reversal rather than a silent change.** The Owner chose maximal composition on the strength of
the divergence claim; that claim is refuted, so the decision was re-put with the correction in hand and settled
on the narrower route, 2026-09-16. The duplication that remains is real and untraced to any defect, which makes
it a capture rather than scope — the same line drawn for the decomposition call sites.

### Proportionality

`assess-design-proportionality`, 2026-09-16 — **`proportionate` for the relation half; re-run and narrowed for
the recovery half after the fourth pass returned `missed-composition` against it.**

The relation's trace is unchanged: its existence is required by the two Axis A rows and the four Axis B ones;
each variant beyond a boolean buys one distinct remedy, and remedy accuracy is the defect the in-flight Errand is
already correcting, so variant granularity is traced rather than symmetric. Rigor stays where consequence is —
the write boundary keeps its exact preconditions (`update-ref`'s old-oid, revision-checked state writes,
lease-checked publication) and the relation is added above it, read-only. The minimal alternative — add an
ancestry term at the two Axis A readers and leave the rest — is rejected by the draft's own recorded constraint:
reader-by-reader adoption is how the implementations diverged, and it leaves Axis B's vocabularies standing.
Cardinality and divergence are intrinsic to Git history, not states this solution creates.

**The recovery half's verdict did not survive its own trace.** The settle-spine extraction was justified by a
causal claim source refutes, and a less elaborate route reaching the same outcome existed unevaluated — which is
`missed-composition` by definition. The narrowed answer stands on the remaining trace: Axis D needs the complete
conflict set and a waiver, and two already-exported helpers supply both. § What composes.

**The scope guard, now with one addition.** Twenty `--is-ancestor` call sites carry no observed failure between
them; retrofitting them is symmetry, not traced need, and this work unit converts none. The same line holds for
the two decomposition call sites and for the five silent picks outside this work unit's concerns.
`repository-target.ts` crossed it in the other direction — scoped in by the Owner on the strength of its trace
rather than on symmetry, because its silently picked base is review-target identity. § Reader inventory.

## Forward-compatibility check

Run 2026-09-16 against the four project check-docs and two planned-but-unbuilt designs, before settling how the
operator's decision is carried. **Nothing in the settled fundamentals conflicts.** Three constraints sharpen the
design and are adopted below; one convergence is recorded because it makes the relation load-bearing for a
reason this draft had not derived.

### Adopted — each variant carries a typed remedy action, not prose

`strategy-procedure-evolution` Principle 6 requires emitted text to be precomposed CLI-side rather than templated
in prose, and `draft-composable-workflows` carries the sharper form: structured remedies already publish an
executable half that the recommendation contract drops, leaving workflow prose to hardcode a different command.

That is § Axis D's defect stated generally. The settlement there wraps a correct refusal in guidance naming a
remedy the probe proves cannot clear it — a published result reduced to prose that says something else. Since
the six variants are separated **because** each carries a distinct remedy, the remedy is part of the type: a
typed action the caller dispatches, not a sentence a later reader re-authors. This is the constraint that makes
variant separation pay off rather than merely describe.

### Adopted — the encumbrance predicate feeds the resume slot rather than paralleling it

`draft-composable-workflows` owns typing the integration resume point, today a prose join over lifecycle,
change-request, worktree, and branch facts the CLI already composes. `draft-operational-state-docs` owns the
durable resume directive and requires it be code-owned, storage-agnostic, and **derive precise continuation from
live state**.

Both are the same shape as § What composes — one reader answering what encumbers a delivery, each obligation
contributing a term. Keep it that way deliberately: this work unit must not mint a second resume path beside the
one those designs will compile. Adopting the built protocol satisfies this by adding no field at all: the
encumbrance a waiver creates is `pendingReviewFixVerification`, which that slot already reads.

The deeper agreement is doctrinal, and the re-settlement strengthened it rather than straining it. "Derive
continuation from live state" is the criterion this draft reached independently, and the adopted protocol goes
further than the criterion demands: it stores nothing on the input side, deriving the whole disclosure from live
observation on every run. `draft-operational-state-docs`
also carries `_Awaiting: <trigger>_` for captures blocked on an external condition, which records the unblock
condition, suppresses time-based nudging, and is re-evaluated as a judgment pointer rather than an automated
one. Different surface, same doctrine. Name this one consistently with that rather than inventing a third
vocabulary for it.

### Adopted — the variant names are controlled vocabulary, not a naming preference

`strategy-procedure-evolution` Principle 7 holds that a term doing technical work is defined once and used
exactly, and that a new load-bearing term earns its definition before use. The six variants are exactly such
terms: they will appear in refusal reasons, remedies, and any surface that reports why a comparison failed. The
open naming item is therefore a placement obligation with a home to find, not a matter of taste — and
Principle 4's generated-not-hand-written rule means the definition derives from the type rather than being
restated beside it.

### Recorded — native restacking makes the disclosure short-lived, and that is accepted

`strategy-storage-evolution` § Holistic Design carries a delivery-specific target: once operational state
materializes off-branch and identity no longer couples to branch SHAs, delivery replaces its filtered-member
projection with ordinary interior-ref members and **permits native restacking end to end**, while preserving the
terminal-authorization arm and member-boundary verification as substrate-independent contracts.

Routine restacking rewrites member heads as a matter of course, so any predicate reading head identity would
invalidate a held decision on every restack — the redundant-ceremony failure arriving at a cadence rather than as
an incident. The adopted predicate **is** head-sensitive: `observedSuffixDigest` covers the whole observed
suffix snapshot. This check therefore fires, and the answer is a bound rather than an immunity.

**The bound is the reservation.** A disclosure exists only between the run that composes it and the resubmission
that consumes it, and that window sits entirely under a held native land reservation which refuses any second
delivery operation. ARC cannot restack underneath it, so the forward direction's routine restacking cannot reach
the predicate however common it becomes. The days-long wait sits _before_ the disclosure, where nothing is held.

**The residual is the operator's own concurrent push.** Someone who resolves the disclosed collision and also
pushes an unrelated member before resubmitting will be re-disclosed. That costs one `land-status` run returning
an identical conflict set and one resubmission — no new judgment, and the re-disclosure is correct, since the
snapshot they were shown is no longer the one they would be accepting.

**Accepted rather than designed around.** Narrowing the predicate to the disclosed paths would buy immunity to
that case, at the cost of departing from the built protocol and storing per-path content — which § Proportionality
rules out as symmetry and which the Owner's direction to adopt the precedent settles. Recorded here so the
acceptance is visible rather than silent: this is a known edge with a named cost, not an unexamined one.

The preserved contracts are safe — this design adds reachability above the write boundary and relaxes nothing at
it.

### Checked and not firing

`strategy-knowledge-evolution` reaches this design only through Principle 6, extract on fan-in rather than
aesthetics, which independently confirms § What composes: the predicate has three consumers and the payloads
have one built and one unauthored. `strategy-pm-composition-evolution` finds no new external-authority surface —
the change-request binding is untouched, and resolving a member by deliverable identity rather than by head
object id moves toward its Principle 5 and `strategy-storage-evolution`'s Principle 5, both of which hold work
unit identity independent of any single repository's branch state. Storage Principles 2 and 3 want re-checking rather than
carrying forward: the clearance was written over a stored record the re-settlement retracted. What replaces it
stores nothing on the input side, so Principle 2's tracked-tree question does not arise there — but the output
side is unsettled (§ Open), and its clearance is owed once the obligation's shape is known.

## Refusal-recoverability audit

Run 2026-09-16 against the four clauses of the recoverable-refusal rule being encoded into project rules — a
recoverable refusal preserves a safe retry or restart route, reports the observed condition, names an actionable
remedy, and keeps the normal success path reachable after repair.

The rule is close to this work unit's thesis stated generally, so the audit is a fit check rather than a
translation. Every row here fails at least two clauses today; that is § The failure family restated in the
rule's vocabulary. What the audit is for is the design's answers, and it found one gap and one remedy the design
had not named.

| Row                   | Fails today                 | The design's answer                                    |
| --------------------- | --------------------------- | ------------------------------------------------------ |
| Review readiness      | condition, remedy, retry    | inverted lookup, then the relation; rebind is the verb |
| Closeout              | condition, remedy, retry    | relation in place — **condition still unmet, below**   |
| Whole-WU verification | reports no condition at all | base resolved with `--all`; refuses, base-merge remedy |
| Prepublication        | remedy, success path        | typed relation; **remedy is re-baselining, below**     |
| Public review target  | condition, remedy, retry    | typed result rather than a throw; base-merge remedy    |
| Landing overlap       | remedy, success path        | refuses typed; base-merge except the checkpoint pair   |
| Post-land replay      | all four                    | protocol adopted for clauses 2 and 3; **1 and 4 open** |

### The gap — the relation fixes the comparison, not the cause-blindness

Closeout's equality sits inside an eight-term conjunction that collapses to a single `terminal-unsettled`
reason. § The failure family already recorded that the refusal is cause-blind as well as ancestry-blind, and
treated the second as this work unit's concern. Under this rule the first is not separable from it: replacing
the equality term with the relation makes the comparison correct while the refusal still cannot **report the
observed condition**, because seven other terms reach the same word. A caller told `terminal-unsettled` still
cannot tell a moved head from a wrong base ref, and the remedy still cannot name the failing term — which is
exactly why the recorded remedy directs a rerun over inputs that never reach it.

So the conjunction owes a reason per term. **Taken into scope by the Owner, 2026-09-16**, over the narrower arm
that would give only the relation's term a distinct reason and leave the other seven collapsed: that arm fixes
the ancestry row while leaving the rule's second clause unsatisfiable everywhere else. It is also the smaller
change than it looks — the relation supplies the vocabulary for the one term that was ancestry-blind, and the
other terms need only stop sharing a word.

**The sizing was taken on a short count.** That one reason is reachable three ways, not one: a five-condition
pre-guard before the conjunction is built, an unobserved host request, and the conjunction itself. Fourteen
conditions reach one word rather than eight. The direction is unchanged and the extra conditions sit in the
same function, but the claim that this is smaller than it looks was made against the wrong number.

### The remedy the design should name — merging the base in collapses cardinality

§ Established practice proves that an ancestor uniquely dominates, so `merge-base --all` returns exactly one
whenever one revision reaches the other. The corollary was not drawn: **merging one side into the other makes it
an ancestor, which collapses cardinality above one to exactly one.** A criss-cross is not a permanent property
of two revisions; it is a property of their current shape, and an append-only merge changes that shape.

That converts Axis B's refusals from correct-but-terminal into recoverable, and the remedy is already ARC's
mandated way to absorb base movement — merge the base in rather than rebase a published branch. It is idiomatic,
available, and non-destructive, which is what clauses three and four ask for.

**Applicability is per coordinate pair, not per reader.** The remedy reaches a call site only if the merge
relates the exact pair that site compares, and one reader can serve pairs of different topology — which an
adversarial pass demonstrated after this section had already been written in per-reader terms. The sole-base
resolver and the overlap analyzer's delivery and review call sites compare a `(head, base)` pair, so merging the
base in collapses their cardinality and their refusals are recoverable.

**The overlap analyzer's integration-checkpoint call site is not one of them.** There it compares the pinned
Candidate durable baseline against the base, so the merge moves neither element and the refusal stands — the
same refutation recorded below for Candidate applicability, reached through a different reader. Its residue is
smaller, though: at that site the resolved base lands only in drift evidence rather than being consumed as a
ref, so what fails there is recoverability alone and not the coordinate obligation.

**Candidate applicability is a refutation, not a pending confirmation.** It compares the _pinned_ baseline
target against the current base, and that baseline is reduced from the Candidate's durable managed record.
Merging the base into the branch advances the Candidate head and changes neither element of that pair, so the
topology between them is untouched and the ambiguous refusal stands. The remedy does not reach this reader at
all.

Its actual route is to re-pin the baseline, which happens through a fresh authority transition on the record —
that is, re-attestation. That is a real success path, so clause four is satisfiable, but it is expensive, and
this draft elsewhere classifies exactly that demand as the redundant ceremony this work exists to reduce. The
honest statement is a distinction rather than a remedy: a criss-cross **manufactured by the silent pick** is
redundant ceremony and this design removes its cause, while a **genuine criss-cross under a pinned baseline** is
the cost of the history's shape, and re-baselining is the price of clearing it. Name re-baselining there rather
than gesturing at a route that does not exist.

Where an append-only merge is not permitted at all, the refusal stands and clause one is satisfied by the
restart route instead.

### The design's own refusals, held to the same rule

Three are introduced here and each must answer it.

- **A rejected resubmission.** When a resubmitted disclosure no longer matches a freshly derived one, the refusal
  must name which coordinate moved and how — the relation is the vocabulary — and re-emit the current disclosure
  in the same breath, so the operator's next act is one resubmission rather than a rediscovery. A bare
  `conflict-resolution-mismatch` satisfies the second clause and fails the third and fourth.
- **A waived movement reaching closeout unmarked.** The settlement writes the approved ids into
  `pendingReviewFixVerification`, which every encumbrance reader already checks. A settlement that waived proof
  without writing it would leave the success path reachable in the worst available sense — reachable while
  something is owed. § What composes carries this as a requirement rather than a refactor.
- **`unknown`.** An ancestry read that did not establish an answer is retryable by construction, and the clause
  it most easily fails is the third: it must say the read failed rather than implying a verdict about history.
  This is the variant's whole purpose, and it is why the reader rather than the classifier produces it.

## Boundaries with neighbouring work

### `delivery-correction-convergence` — settled

The two adjacent rows look like one mechanism and are not:

- **Theirs** (landing / position over an append-only terminal advance): refuses `review-fix-routing-required`. The
  recognition mechanism is built; what is missing is a route from the fact to resumption.
- **Ours** (public review readiness): the comparison reads no ancestry, so the movement is never a fact it holds.

**Sees it and will not route** versus **cannot see it**. That cut is evidence-backed and does not depend on the
steering map's "the base did not move" criterion, which does not separate these two. The map's criterion still
holds for that stub's other captures — record-only rebind minting a fix task, and staged-top status flipping.

### `delivery-rebuild-continuity` — disjoint by lifecycle side

Private-chain and base-movement-driven; this work unit is public-side and post-landing. Its own draft records the
same split and states that this work unit ships first, because it is the recovery route that makes a stacked
landing safe to attempt at all. Its rows — the eligibility window, the materialization window, delivery authoring,
rematerialization — are not owned here.

**One doctrine reaches this work unit from there.** That work unit also carries the routed ceremony-repetition
rule — _a ceremony repeats only when a covered input changed, and head or base movement is never itself a covered
input_ — under an explicit constraint that it land in a shared rule or strategy that non-delivery ceremonies reach,
not in any delivery-scoped document. The two rows classified `redundant ceremony` above are that rule's absence
seen from this side, so cite it once it lands rather than restating it here. Its capture disowns
refusal-remedy-accuracy work, which is the execute-bound Errand's, and that Errand's sites do not include
`native-landing.ts` — so the guidance defect in § Axis D sits below both and stays here.

### Merge queues — compose with, do not adopt

Adopting a merge queue is a recorded non-goal, retired at the characterization's design as "not the remedy for
ARC-only re-ceremony". That stands. What does not follow from it is indifference to a project that runs one.

A merge queue is a head-mover. Its landed commit is generally not the head the change was reviewed at — a
speculative integration branch produces a new commit, and rebase-style submit strategies rewrite on the way in.
Whether that reaches ARC's readers depends on a detail source settles against the stronger claim: both compare a
change-request head rather than the landed commit, so a queue that leaves the request head alone is orthogonal
to this comparison. A rebase-style strategy that moves the request head is not, and that is the case the
constraint below covers.

Carry it as a constraint, not a feature: whatever replaces the equality comparison must not assume the landed head
is the head ARC bound. Current compatibility is **unverified** — every enumerated row moves the head from inside
ARC, and no probe covers an external mover.

### Errands in flight

- **Refusal-remedy accuracy** (`execute-bound`, started in the primary checkout). Determinate diagnostic and argv
  correction across the integration checkpoint, its advisory register, the drift continuation, and teardown. It
  lands first and gives this design a corrected baseline. It must not invent the missing post-landing transition.
  **Consequence for this draft:** every refusal string quoted above is pre-Errand. Design against the decision each
  verb reaches, not against its current prose.
- **Append-only terminal movement in session-init delivery position** (`execute-bound`). The third consumer of the
  substrate above. Reader-level, and downstream of whatever binding relation this design settles.
- **Checkout identity through an authorized integration operation** (`execute-bound`). Adjacent; durable
  authorization and resumable-frame design are reserved to `recovery-hardening`.
- **Two EA-landing Errands** — registered-native route selection, and sequential prepare-to-apply readiness. Same
  files, different failures; coordinate on landing paths.

---

## Retained capture detail

Preserved from the two routed captures, which are otherwise integrated above. Their provenance: both routed from
`USER-INBOX § Work Unit` at the `concurrent-integration-characterization` close-out, 2026-09-14; captured during
`evidence-applicability` M1 post-landing recovery (2026-09-13) and terminal landing dogfooding (2026-09-14).

**Success criterion.** After a real overlapping base change prevents the host's rebase of a successor, the CLI
returns an exact actionable resolution offer; approved successor and top resolutions can settle the retained
operation and continue the delivery. New member heads receive fresh applicability, review, and checks before
landing. Stale decisions, undisclosed divergence, ref collisions, incomplete suffix observations, and ambiguous
host results still refuse without claiming clearance. Cover conflicting and clean suffixes, terminal-top conflict,
and interruption/retry with Git-backed and handler-level tests, including no duplicate merge submission.

**Boundary.** Do not weaken repository-wide contribution proof, relax exact-head host merge protection, weaken
terminal absorption checks, treat a new commit id as a fresh review obligation, accept arbitrary state edits, or
fold in unrelated prepublication authoring and review-fix convergence. A conflict-free virtual merge alone does not
establish evidence carry. Never infer disjointness from it. Preserve fail-closed treatment for unresolved
substantive overlap and stale coordinates. The Owner-directed one-time recoveries that unblocked the live instance
are operational unblocks, not evidence that the durable mechanism is complete and not a general escape contract.

**Design obligations carried forward.** Record the verified predecessor effect once and admit an attended
resolution for the remaining registered suffix and excluded terminal top. Bind the decision to the exact plan,
operation, state revision, observed suffix, member identities, before/after refs and trees, and conflict paths.
Require semantic approval only for the disclosed conflicted contributions; continue mechanical proof for every
other movement. Reobserve host effects and refs, use lease-checked publication and revision-checked state writes,
and make interrupted retries converge without resubmitting a landed member. Carry a current terminal binding
through review readiness and lock release. Include the Candidate producer and its recovery path.

**Files.** Native landing and suffix reconciliation (`native-landing.ts`), delivery execution request/result
schemas, contribution and terminal absorption composition, base overlap/drift analysis,
`git-candidate-applicability.ts`, integration checkpoint composition, exact-base merge continuation, the
`deliver-stack` workflow, and focused unit/integration and delivery terminal integration tests.

**Dropped deliberately in this consolidation.** The origin captures' verbatim observation paragraphs, whose
content is now carried by § The failure family with the probe evidence that supersedes the field narration; and
their per-capture `_Approach:_` framing, whose corrected readings are recorded in § What the field record got
wrong. No success criterion, boundary, or file pointer was dropped.

---

## Pinned probes

Six probes hold this boundary's behaviour as it stands. They **pass today**; each fails the moment the behaviour
changes, printing the sentence that names what it was waiting for and the exact replacement:

> This now produces the result it was waiting for, so the hold is spent: replace this call with a plain
> assertion on `<result>`.

Retiring them is part of this work's scope rather than a regression — a fix here cannot merge while one is red,
and each is a single `expectPinnedObservation` call to replace. They retire independently, one per boundary.

- `review-readiness-delivery-binding.test.ts` — "reports nothing bound when a member's head advanced without
  changing its contribution"
- `delivery-binding-head-movement.test.ts` — "reports a terminal unsettled when the host merged it past the head
  it binds"
- `history-shape-ambiguity.test.ts` — "reports the base's own change as the contribution when two merge bases exist"
- `history-shape-ambiguity.test.ts` — "refuses with a typed reason rather than choosing one of the two bases"
- `history-shape-ambiguity.test.ts` — "reports the overlap unavailable rather than proving it from one of the two
  bases"
- `review-status-base-movement.test.ts` — "directs a checkpoint rerun on a base that moved only in shape"

**A seventh pin is owed, not yet written.** The staged arm of the subject collector reaches the same silent
base pick as the pinned committed arm, and no probe covers it — so the existing pin would retire green over an
untouched defect. Add a staged-arm probe rather than re-scoping the committed one, whose coverage is still
wanted.

An eighth row is owned here and **deliberately unpinned**: `delivery-rebuild-base-movement.test.ts` — "returns the
identical refusal after the operator resolves the conflicted path". It proves the named remedy does not clear the
refusal, which no other test asserts, and the refusal itself is correct.

A probe that instead reports "the held result no longer describes what happens, and the awaited one has not
arrived either" has found behaviour neither shape names. That is a finding, not a retirement.

---

## Evidence base

The recorded observations and the reasoning behind each awaited result are in
`notes-concurrent-integration-characterization.md` — § Second matrix for the axis derivation and the
eighteen-failure table each cell traces to, and § Second-matrix probe rows for the readings above. Read those
rather than the first matrix, whose `tolerates` verdicts cover base movement only and are not coverage of this
surface.

§ Established practice rests on a bounded survey rather than an exhaustive one, and its footing is uneven. Read
from primary sources: Git's revision grammar and diff definitions, and Gerrit's change-kind, copy-condition, and
shipped label config. Derived and then confirmed empirically here: cardinality above one implying divergence.
Weaker, and worth re-checking before anything load-bearing rests on it: Mercurial's bid-merge rationale comes from
a wiki page of roughly 3.0 vintage, and "no system refuses on cross-base disagreement" is an absence rather than a
citation.

§ The relation rests on source read 2026-09-16 rather than on survey: `scripts/base/merge.ts`'s two directional
reads and their states, the ancestry helpers' return shapes and executor split, `DeliveryMemberSelector` and
`stateMemberMatches`, the absence of any production constructor for the `ref` arm, and the integration test that
pins its conjunction. The count of roughly ten hand-rolled helpers is approximate and deliberately so — it bounds
a repetition rather than enumerating a work list, and § The relation's scope guard converts none of them.

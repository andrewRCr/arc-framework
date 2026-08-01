# Spec (`detailed` · `RFC`): decompose-planning-lane

- **Origin:** [internal]

- **Purpose:** Allow one fully validated v3 decomposition receipt to accompany otherwise planning-only changes
  through an explicitly installed host lane without weakening review, ownership, or exact-head protection.

---

## Introduction / Context

Canonical decomposition results are planning artifacts plus one machine-validated retirement receipt. Existing
planning-lane classification treats that receipt as a non-planning endpoint, so even mechanically exact
decomposition remains reviewed.

That conservative behavior is correct by default. Some projects may explicitly opt into automated planning
clearance, but doing so changes a host security boundary: receipt ownership, exact candidate identity, branch
currency, and clearance publication must agree. This policy is separable from transform correctness and ships
only after `decompose-transform-integrity` and `decompose-base-mobility`.

Canonical validation reads the artifacts the retiring unit contributed, at the commit the receipt records as its
source. That commit sits on the retiring branch, which is a sibling of the candidate rather than an ancestor of
it, so no amount of history behind the proposed head contains it. A reviewing host sees it only if the retiring
branch was published and the host fetches branches rather than a single commit's history. Establishing both is the
precondition this work unit adds, and everything downstream assumes it.

## Goals

1. Classify exact base/head changes as `planning`, `reviewed`, or fail-closed `invalid-retirement`.
2. Admit exactly one canonical v3 receipt endpoint beside otherwise valid planning changes.
3. Guarantee a decomposition's recorded source is reachable from the repository a reviewer clones.
4. Bind classification to one exact base/head pair the host confirms live before publishing.
5. Couple the receipt CODEOWNERS exception to exact-head `arc-cleared` and enforced base currency.
6. Keep ordinary ARC installation and planning auto-merge default-off.
7. Resolve the lane through one canonical decision surface every caller shares.

## Non-Goals

- Change decomposition authoring, allocation, finalization, landing correctness, semantic approval, or receipt
  meaning. Adding one admission precondition is in scope and is none of those: it narrows which cuts are
  admissible without altering what a cut produces or what its evidence means.
- Publish, mirror, or reap refs on the operator's behalf. The precondition below refuses; it never pushes.
- Verify candidate ownership host-side. Ownership is a local transient-claim fact with no committed
  representation; the commit-time gate remains its only verifier.
- Admit legacy, malformed, multiple, historical-only, unrelated, or rider-bearing receipts.
- Auto-enable `arc-cleared`, planning auto-merge, CODEOWNERS exceptions, branch rules, or merge queues.
- Treat clearance as proof that child content or distribution is semantically approved.
- Add a second receipt validator, approval token, signature, or prose classifier. Assembling canonical facts from
  exact refs is fact collection rather than validation: the ref-addressed assembler below feeds the one canonical
  validator and is in scope.
- Support hosts that cannot supply an exact candidate pair, fetch branch refs, or dispatch on the returned
  verdict.

## Proposed Design

### Source reachability precondition

A cut whose recorded source is a branch the transform retires leaves that commit reachable only where the cut ran.
Execution therefore refuses such a cut unless the source branch's live remote tip already equals the recorded
source head, naming the unpublished branch as its locus. The operator publishes the branch and re-runs.

The gate fires at the **entry of the execution path, before any destination artifact is materialized**. Placing it
there costs nothing on refusal, keeps the preparation boundary synchronous and pure, and leaves base advancement —
which re-derives a preparation for an already-committed candidate — untouched.

Tip equality is the test, not reachability. It is the stricter of the two: a remote tip that has moved past the
recorded head would refuse a source that is in fact still reachable. At cut time, against the operator's own
branch, moments after the head was read, that divergence is not a case worth carrying a fetch and an ancestry
walk to admit. A remote that cannot be read is refused rather than assumed published.

The refusal is scoped by the same structural test the transform already uses to distinguish the two origin
shapes — recorded source ref equal to recorded result-base ref. A cut whose source _is_ the base needs nothing:
its source commit is a base commit and every clone already has it. Only the other shape is gated.

This is a refusal, not a mirror. The transform performs no remote write, acquires no push authority, and takes on
no ref-reaping lifecycle; it reads whether the operator has already done what the reviewing host will require.

Reachability is guaranteed at cut time, not perpetually. A retiring branch deleted after the receipt lands but
before its change merges leaves the receipt unverifiable — resolved below to `reviewed` rather than to a failure,
so the lane degrades to ordinary review rather than to a red gate.

### Host fetch requirement

The precondition puts the source commit on the remote; the reviewing host must actually fetch it. Because the
source is not an ancestor of the proposed head, a host that fetches only that head's history will not have it. The
lane therefore requires a classification checkout that fetches **branch refs**, not a single commit.

This is a load-bearing property of the host configuration rather than an incidental one. Narrowing a classification
checkout to a shallow or single-commit fetch silently removes the object the assembler needs, and the failure
presents as universal `reviewed` rather than as an error. It is stated here so the requirement survives later
tuning of those workflows.

### Exact-ref evidence adapter

`classifyPlanningLane(ChangeSet)` remains the pure reducer for ordinary planning changes.

The canonical validator is already host-neutral — it consumes normalized facts and decides nothing about paths or
policy. What no existing caller provides is those facts assembled without an index and without local branches. One
assembler supplies them, reading each fact from the commit that actually holds it:

- the **receipt** from the proposed head tree, at the endpoint the change adds;
- the **source-artifact inventory** from the tree at the recorded source commit;
- managed-path **before** states from the tree at the recorded result base, where the receipt's recorded values
  were captured;
- managed-path **after** states and **destination outputs** from the proposed head tree, which is the candidate
  the receipt describes.

Two operand groups are not tree-derivable, and the spec is explicit about them rather than implying a verification
that does not occur:

- The **preparation** is reconstructed from the receipt, which carries the prepared facts; no separate document is
  read, and a surviving prepared record is itself a refusal. Everything it determines is therefore structural — it
  states what the receipt claims rather than confirming it.
- **Candidate ownership** is a local transient-claim fact with no committed representation. The host passes the
  recorded value through unchanged. Ownership is not a host-verifiable property, and the commit-time gate remains
  its only verifier.

Within the tree-derivable set the assembler **re-derives** rather than adopting the receipt's own record. A check
fed by its subject's account of itself proves self-consistency, not correctness, and host-side verification is the
whole point. The claim is scoped to that set deliberately: a universal claim would be false for the two groups
above and could not be discharged.

Whether the live base has advanced past the recorded one is a separate question, and the descendant-landing
validator already owns it. The assembler compares against the recorded base; base movement is that validator's
concern, not a second base-selection rule here.

The closed outcome is:

- `planning` — every non-receipt endpoint satisfies the existing planning grammar, exactly one added current v3
  decomposition receipt validates, and it lands over the live base;
- `reviewed` — an ordinary noneligible or unknown change, or evidence that cannot be read;
- `invalid-retirement` — a purported add, modify, or delete of retirement evidence that fails cardinality,
  identity, or shared validation, reported nonzero with its stable locus.

**Shape is settled before evidence.** The endpoint set is compared against the receipt's transition patch plus the
receipt path first; anything else present makes the change something other than a pure decomposition, and it
resolves `reviewed` without the receipt validators running at all. A decomposition branch that accrues an ordinary
planning commit after the cut is exactly this case, and it must take the review path rather than a failing one.
Only a change whose shape already matches reaches validation — so `invalid-retirement` keeps its meaning: the
receipt is present, claimed, and wrong. Fail-closed is preserved rather than weakened, because a receipt that
misstates its own transition still refuses.

Both validators refuse with their own vocabularies, and the mapping between them turns on whether the refusal
describes the evidence or the reading of it. A refusal about **content** — a claimed transition that does not
match, an identity mismatch — is `invalid-retirement`: the evidence is present and wrong. A refusal about
**reading** — an unresolvable ref, an unavailable binding, an unreadable snapshot, an unexpected object format, an
absent source commit — is `reviewed`: nothing is known, so the change takes the ordinary path. That distinction
keeps a transient read failure or a reaped branch from reddening a required check while still refusing to clear
anything unproven.

The refusal kind alone does not decide this. Some kinds span both senses — the same kind is returned both for a
dependency whose recorded content disagrees and for a snapshot that could not be read, and the base-related kind
likewise covers unresolvable refs and unavailable bindings alongside genuine regression. The mapping therefore
keys on the kind together with its locus, and a refusal whose locus names a read failure is read-shaped whatever
its kind.

An operand the command cannot parse is neither: it is a usage error, reported as such rather than resolved to a
lane outcome, and it never publishes clearance.

The current receipt path is the sole non-planning endpoint exception. Cardinality reads from the exact two-point
diff: exactly one **added** receipt endpoint qualifies, a second added receipt refuses, and a receipt already
present in the base is not an added-current-receipt claim at all. A two-point comparison cannot see which commit
introduced a path, so the lane claims no ancestry-relative exemption and none is specified.

Standard streams carry the outcome: stdout is exactly one word, drawn from the same two-value vocabulary shipped
consumers already parse; the stable locus goes to stderr; and the invalid case is carried by a nonzero exit rather
than by a third word. Existing callers therefore need no widened vocabulary. The handler gains the exit-code
boundary its sibling review handlers already have, and its blanket downgrade of unexpected failures to `reviewed`
narrows to the read-shaped cases the mapping above names.

### Immutable host binding

The lane decides against one exact base/head pair supplied by the caller, and the descendant-landing validator's
bound entry point owns the pair's resolution and its own recheck — it resolves both refs, validates, re-resolves,
and refuses on disagreement. The lane consumes that entry point rather than nesting a second recheck around it, so
one refusal vocabulary covers the race.

Confirming the pair is still **live** is the host's job, not the command's, because only the host holds
credentials. A classification checkout is a one-shot credential-less snapshot: its refs are frozen at fetch time,
so re-resolving one there returns the same object no matter what has happened upstream. The host re-reads before
publishing, compares against the pair it classified, and publishes only on agreement.

Each side needs a different live operand, and using the wrong one makes the check vacuous:

- The **head** is read from the live change object. Comparing it against the classified head detects a push that
  landed after classification began.
- The **base** is read from the **base branch's current tip**, not from the change object's recorded base. A
  change object's base pointer does not track the branch as it advances, so comparing it against itself always
  agrees. The branch tip is the operand that can actually differ — and it matters because a base advancing does
  not re-trigger the change's checks, so a stale clearance would otherwise persist unchallenged.

The comparison itself is deterministic, so it lives in an invokable script the publishing job calls rather than as
shell embedded in the job. Embedded shell can only be checked by asserting on the text of the file that contains
it, which cannot distinguish a documented step from a working one — the same standard this spec applies to host
policy elsewhere. A script keeps the credentials in the host job while making the comparison directly testable,
following the shape the project's existing classification script already uses.

Both operands need permission the publishing jobs do not currently hold, and the two jobs do not hold the same
set today, so the grant is stated per job rather than as one blanket sentence. Reading the live change object
requires a change-read permission; reading a branch's tip requires a contents-read permission. A job-level
permission block replaces the workflow default rather than adding to it, so a job declaring only status-write
holds no read access at all and must enumerate every permission it needs.

A host that cannot supply an exact pair, cannot re-read both operands live, or cannot dispatch on the returned
verdict publishes no success.

Changes originating outside the repository take the ordinary reviewed path and never reach the lane. Both
classification surfaces already gate on same-repository origin, and the precondition reinforces the reason: a
retiring branch published to a fork is not on the remote the reviewing host reads. This is the existing posture
stated rather than a new restriction.

### One canonical decision surface

The lane is one decision, so it has one implementation. Every caller reaches it through the same command rather
than through a parallel reimplementation, and no caller converts a refusal into a permissive default: swallowing a
nonzero exit and printing the safe value silently discards exactly the signal this work unit adds.

Classification jobs deliberately separate the classifier from the change under review: the classifier comes from
trusted state, and only the data comes from the proposed head. Preserving that separation is what constrains how
the command becomes available, and there are two correct shapes:

- Where the trusted state is a checkout of the project itself, the job builds the command from that checkout. The
  build runs against trusted sources, so the property holds and no release is involved.
- Where the trusted state is a published version, the job invokes that version pinned.

A project running the lane against its own repository uses the first. The shipped recipe uses the second, which
becomes correct at first release; before then it is a forward reference, not a working invocation, and is left as
such rather than contorted.

### Opt-in ownership exception

Ordinary ARC installs keep clearance and planning auto-merge disabled, and the retirement-receipt namespace stays
owned and reviewed.

The shipped CODEOWNERS skeleton never carries the receipt exception. Setup copies that skeleton verbatim, so an
exception living in it would unown the namespace on every install that takes the default — the exact posture
Goal 6 forbids, arriving through the artifact meant to be safe.

Eligibility and the edit that depends on it both belong to one command rather than to recipe prose, because a step
described in a document cannot be distinguished from a step that works. The command takes the repository, the base
branch, the required context name, and the ownership file to edit. It reports whether that context is **required**
on the base branch — the configured requirement, not the per-change status a clearance run posts — whether the live
base branch carries the canonical version-rendered workflow that produces `arc-cleared` through the exact-pair
comparison, and whether base currency is enforced, by an up-to-date-branch rule or by a merge queue, since either
satisfies it.

The producer check is exact rather than heuristic. The command reads `.github/workflows/arc-clearance.yml` and its
delegated `.arc/system/.internal/scripts/confirm-live-change-pair.sh` comparator from the named live base branch.
It compares both against the packaged canonical assets, rendering the workflow for the running ARC version. A
same-named context from another workflow or app, an altered comparator, or locally prepared producer assets that
have not landed on the base branch therefore grant no authority.

A host may express those requirements through more than one mechanism at once, and the mechanisms are read
independently: the requirement is satisfied when **any** active mechanism enforces it, and the command reports
which one did rather than a bare boolean whose provenance is lost. Disjunction is the correct reading for a gate —
if any active rule requires currency, currency is required.

The mechanism set is closed and enumerated rather than open-ended, because an unenumerated set cannot be
implemented or tested: the branch-protection surface, the rules surface that can govern the same branch
independently of it, and the merge-queue configuration. The clearance workflow and delegated comparator form a
fourth, independent producer surface rather than a policy mechanism. Existing setup guidance reads only branch
protection and the producer assets, so the other two policy reads are new rather than adaptations. Each surface
also needs its absent-versus-forbidden rule stated, since the two resolve differently and are easy to conflate: a
surface reporting the requirement as absent is
"checked, not configured", while a surface refusing the read is "not permitted to check". Both are ineligible, and
they are reported distinctly because the operator's next step differs.

The command does not ask whether an enforcing rule can be bypassed. A bypass allowance is the operator overriding
their own policy, and this lane's guarantee is mechanical: that the receipt is exact and the base is current.
Whether a person with elevated rights may override afterward is a human-authority question the distribution
interlock already reserves, and inspecting it would have the lane second-guess configuration choices this design
assigns to the operator. The practical cost runs the same direction — every additional surface read is another way
to be unable to check, and inability resolves to ineligible, so projects with entirely correct configuration would
be refused the feature over a field that could not have changed the answer.

Applying the exception is the same command's second mode: on an eligible verdict it appends

```text
/.arc/system/.internal/retirement-receipts/*.json
```

to the ownership file's trailing unowned block. Ownership is last-match-wins, so an entry inserted above a later
owning rule would report success while leaving the namespace owned. The command therefore appends only where no
owning entry follows, and refuses rather than editing when the file's trailing region is not unowned. The
ownership file is an operand because hosts honor more than one location and a project may have chosen any of them.

Verification that cannot be performed is ineligible. Reading branch configuration or the live workflow requires
access, so "not permitted to check" is a real state and is reported distinctly from "checked, not configured" —
the operator needs different things in each case, and neither is eligible.

Nothing here installs a branch rule or a merge queue. The command reads host state and reports; establishing that
state is the operator's act, and its absence keeps decomposition reviewed rather than triggering a fix.

Clearance may be installed independently; the dependency is one-way from the ownership exception to its guards.

### Verification amendment: ownership exception deferred

Verification found that matching the live workflow and comparator proves which implementation is present but not
which GitHub identity produced a same-named successful status. That leaves the proposed ownership exception with a
stronger producer-authority claim than its evidence establishes. The ownership command, host-policy reads,
CODEOWNERS editor, tests, and adopter guidance are therefore removed from this work unit; decomposition receipts
remain owned.

This supersedes Goal 5, the opt-in ownership-exception design above, and its corresponding success criterion for
this work unit. It does not choose a replacement. Whether ARC should retain `arc-cleared`, narrow its role, layer
it with a draft-first pull-request lifecycle, or replace it is deferred for separate consideration. Exact-ref
classification, host liveness, default-off installation, and package/project parity remain in scope.

The durable owner is the Work Unit capture **Reconsider `arc-cleared` against a draft-first pull-request
lifecycle** in Andrew's user inbox. That capture records the threat model, alternatives, constraints, complete PR
lifecycle scope, and the explicit no-decision posture; its target slug remains intentionally unsettled until inbox
housekeeping promotes it.

### Package and project projection

Package-source CODEOWNERS, clearance workflow, merge-gate recipes and readmes, setup guidance, and initial-setup
guidance are authoritative. Project copies derive from them and are never independently edited: the edit lands in
the package source and is mirrored into the project copy. This obligation attaches to every edit of those assets
wherever it occurs, not to a single later step.

The guard that holds it is the per-file parity assertion over every framework-classified file, which fails on
divergence. The pre-commit sync check warns on the same condition but does not fail, so it is a prompt rather than
a gate and is not relied on as one.

## Alternatives & Rationale

### Make all decomposition receipts planning changes

Rejected because malformed evidence or unrelated receipt endpoints would bypass review.

### Enable the lane by default

Rejected because host rules, exact-head status, and CODEOWNERS ownership are project-level security choices.

### Treat invalid retirement evidence as ordinary reviewed work

Rejected because a purported authority artifact that cannot validate must fail closed, not silently downgrade.
Evidence that cannot be _read_ is a different case and does take the reviewed path.

### Put exact-ref binding in the transform handler

Rejected because the review host owns the pair and the clearance action; lifecycle handlers do not.

### Mirror the source commit to a durable ref during the cut

Rejected as the way to make the source reachable. It would give the transform its first remote write, and with it
push authority, retry semantics, idempotency on re-run, and a reaping lifecycle for the mirrored refs — a
substantial addition to a shipped core, carried to serve a reviewing host. Refusing an unpublished source achieves
the same reachability by requiring the operator to have done what the host will need anyway.

### Gate reachability inside the preparation boundary

Rejected on placement. That boundary is synchronous and pure, and it runs only after materialization has written
every destination artifact — so a network read there would force the seam asynchronous, convert an offline moment
into a rollback of completed work, and re-fire during base advancement, where source publication has no bearing on
the operation being performed.

### Let the descendant-landing verdict stand as the lane's only evidence

Rejected because it answers a narrower question. That verdict establishes a candidate lands exactly over a given
base, not that the receipt is canonically valid — a receipt failing canonical validation yet landing cleanly would
gain planning authority on it. With the source reachable, both guarantees are available and both are used.

### Confirm liveness inside the command

Rejected because the command cannot observe it. Classification runs in a credential-less snapshot whose refs
cannot advance, so a check there would report agreement unconditionally — the appearance of a guarantee without
one. Liveness is confirmed where credentials exist, and the command owns everything that does not require them.

## Cross-cutting Considerations

- **Security:** ownership changes atomically with exact-head and base-current enforcement, and every unproven
  state resolves away from clearance.
- **Compatibility:** the source precondition refuses cuts that previously succeeded, so operators with unpublished
  retiring branches must publish before cutting. Only current canonical v3 receipts qualify for the lane; obsolete
  or legacy-shaped evidence cannot gain lane authority.
- **Testing:** pure policy, the ref-addressed assembler, the source precondition, the outcome mapping, eligibility
  and application, ownership ordering, fork-origin changes, and stale-pair cases are separated. Host-policy
  behavior is proved through the commands that perform it rather than through assertions over recipe text.
- **Rollout:** the feature is optional and safely absent until explicitly installed.
- **Human authority:** the distribution interlock remains the sole semantic approval boundary.

## Success Criteria

- A cut whose recorded source branch tip does not match the recorded source head refuses before materializing any
  artifact and names that branch; a cut whose source is the result base is unaffected; an unreadable remote
  refuses.
- Base advancement re-derives a preparation for a committed candidate without triggering the source gate.
- A change whose endpoint set is not exactly the receipt's transition patch plus the receipt path resolves
  `reviewed` without running the receipt validators, so an ordinary planning commit on a decomposition branch
  never produces a failing outcome.
- Exact-ref classification admits one canonical current v3 receipt plus otherwise planning-only endpoints, with
  every tree-derivable fact re-derived from the tree that holds it.
- Legacy, malformed, multiple, already-in-base, unrelated, modified, deleted, and rider-bearing evidence never
  gains planning authority.
- Content-shaped refusals report `invalid-retirement` nonzero with a stable locus; read-shaped refusals — including
  an absent source commit and a read failure carried under a content-sounding kind — report `reviewed`, and
  neither publishes clearance. An unparseable operand is a usage error rather than a lane outcome.
- Standard output stays within the two-value vocabulary existing consumers parse.
- A head that moved, or a base branch whose tip moved, publishes no clearance success.
- Every caller resolves the lane through the one canonical command, and none downgrades a refusal.
- New installs remain reviewed and default-off, with the shipped CODEOWNERS skeleton carrying no receipt
  exception.
- The exception is appended only against an eligible verdict and only where no owning entry follows it, with
  "not permitted to check" reported distinctly from "checked, not configured".
- Package and project host-policy assets remain byte-identical.
- No semantic classifier, approval credential, duplicate receipt validator, or transform output change is added,
  and no ref, branch rule, or merge queue is created.

## Open Questions

[none]

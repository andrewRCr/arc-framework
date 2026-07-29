# Spec (`detailed` · `RFC`): judgment-authority-model

- **Origin:** [internal] — `USER-INBOX § Work Unit`, "Recognize judgment already exercised instead of
  re-litigating it", captured during errand `gate-tier-right-sizing` (PR #355) and the review-architecture
  discussion following it.

- **Purpose:** Give ARC a stated model for when its own rules yield to judgment that has demonstrably already been
  exercised, and compress the always-loaded rules surface under the doctrine that model implies — so codification
  stops metastasizing into the half of the work `PROJECT-PRD` § Operational friction down, judgment friction up
  reserves for human and agent judgment.

---

## Introduction / Context

ARC treats its own procedure as authoritative over evidence that judgment has already been applied. `PROJECT-PRD`
states the governing principle bidirectionally — codify the deterministic, _preserve friction where judgment is
required_ — and the rules surface violates it in one direction.

This is a propagation gap, not an invention problem. ARC has already made this decision correctly in at least six
narrower places and never generalized it:

1. `adr-016` sorts interlocks invariant vs configurable, by fiat.
2. `adr-020` carries an "invariant floor" and a "scale grammar, never scale discipline" rule, enumerated.
3. `adr-029` grants the operating agent bounded runtime judgment with a disclosure obligation, scoped to review.
4. `process-task-loop` § Deferred review hand-writes a reconciliation between the agent-proposed batch and "the
   agent never self-invokes."
5. `unit-scoped-review` states outright that its hard triggers are "already a mandatory stop in ARC, so this
   collects rather than invents."
6. `execution-delegation-doctrine` owns a § Sub-agent scope rewrite characterized as **prohibition → conditions**.

A seventh and eighth landed on base during this work unit's own grooming: an errand rewrote § Method and extension
loading to load a declared method at its fire-point rather than as a preload, routing the rationale out so the
always-loaded rules "end up shorter than before"; and § Quality gate failure was rewritten into a two-branch rule
where a deterministic same-concern failure is fixed and re-run immediately. Both arrived at this work unit's
doctrine independently. The defect keeps producing fresh instances while being designed against.

The gap has two named halves. **The architecture layer already holds the norm and the rules surface does not** —
`adr-029` grants bounded runtime judgment with disclosure, while `DEV-RULES.ARC` mentions `override` only at
config- and load-time loci. And **the invariant/default distinction is enumerated, not derived** — nothing
classifies a rule that carries no marker, including the 39 lines carrying `never` / `must not` in
`DEV-RULES.ARC` alone against its 7 `[configurable]` rule sites. That count is measured at base and drifts upward as
the corpus grows, which is itself the argument: enumeration does not keep pace with the rules being written.

Three live failures are on record, each arriving unprompted in a session doing unrelated work:

- An independent review returned findings containing a one-character typo, and the primary concluded "per ARC this
  is invalidated, we must re-review." The agent knew it was absurd; the flaw was ARC's, for not letting safe agent
  judgment win.
- An agent ran a focused test command with a repository-relative path where the workspace expects a
  package-relative one. Vitest found no tests, nothing ran, no code changed — and the agent stopped and asked
  whether to retry. It had applied § Quality gate failure's ask-for-guidance step to a gate that never produced a
  result. The rule does not distinguish a gate that **failed** from one that **never ran**.
- `run-errand`'s reviewed-lane step reads "leave the PR open for owner review," which an agent took as removing its
  authority to _perform_ the merge. The intent was that **approval** is the owner's, not that the button-press is.

The failure mode is not uniform across harnesses — observed instances cluster where instruction-following is more
literal, which is an argument for stating a high-traffic rule's derivation in its own text rather than trusting
each reading to reconstruct it.

**The compression half is a deliberate widening of the same concern, not a separate one.** Both rules files load
every session, have been appended to across the project's life, and have never been reconsidered. The doctrine
that decides what may leave them — cut aggressively where loss announces itself, never cut where it does not — is
the same ignorance-versus-bias discriminator the constitutional core states, applied to placement instead of
authority. The two halves also share a ledger: the new section grows the always-loaded set, and the compression is
what pays for it.

## Goals

1. **Derive what is currently enumerated.** A reader classifies any unmarked rule in the corpus — here, in a
   method, in a workflow, in an extension, in a strategy — as `invariant` or `default` without a per-domain fiat.
2. **Grant runtime discharge with a disclosure obligation**, closing the gap between `adr-029`'s accepted authority
   model and the rules surface that is stricter than it.
3. **Name authority rather than declare it per rule** — who may discharge a default, and who holds an invariant,
   resolved from inputs the session already carries.
4. **Fail safe on silence.** A rule nobody thought to classify lands on `invariant`, not on `default`.
5. **Leave the always-loaded set net shorter and more rule-dense**, with no constraint demoted out of it.
6. **Make the corpus-wide presumption falsifiable**, not asserted — the model's blast radius is checked against the
   corpus it governs.

## Non-Goals

- **Lane classification.** Face (a) of the original defect — `classifyPlanningLane` reading path-class only, with
  no increment-count or gate-history signal — ships as `planning-lane-relief`. It is the only face reaching code
  and the only one gated on an unresolved forgeability unknown. It remains here as diagnosis only.
- **Any code surface.** Gate-emission work has left the deliverable: its justification was licensing the
  quality-gate demotion, and that demotion turns out to need a method retarget instead. Which gate failures should
  name a fix command routes to `quality-gate-hooks`.

  **One carve-out: `init-recipe.json`.** Three of D6's destinations are absent from the install recipe and
  therefore reach no project (D6, install reachability). Demoting shipped rules into them would destroy the
  content rather than relocate it, so correcting the recipe is a precondition for this work unit's own
  correctness, not an adjacent improvement. Scoped to the destinations this register demotes into — three
  strategies and one workflow — plus their manifest entries. Other files are absent on the same oversight and are
  not swept here; the recipe's hand-maintenance, which is what let every one of them happen, is the real fix and
  is a separate concern.
- **`DEV-RULES.ARC` § Sub-agent scope** (14 nb) — the one section of either rules file this work unit must not
  touch. `execution-delegation-doctrine` owns its prohibition → conditions rewrite.
- **The mechanism-4 move of the § Documentation Boundaries family** (~49 nb). No part of it becomes a
  `DEV-RULES.{DOMAIN}.md` file here; `rules-restructure` owns that filename convention and relocating twice is the
  cost of guessing. Compress-in-place is not a move and is _not_ deferred — five of that family's sections carry
  live `authoring` dispositions totalling 15 nb, inside the register below.
- **Building lifecycle-state keying.** Probed and recorded as a fifth destination mechanism, structurally the
  strongest; left unbuilt and routed to `rules-restructure` because the compression already selected for
  universality and almost nothing in the register is lifecycle-bounded.
- **A shipped compression method.** The five ordered tests are recorded as this work unit's decision procedure and
  as reusable knowledge; minting a `system/methods/` file for them is not in scope. Pointing them at a brief needs
  an extension this work unit names but does not author (D9.3).
- **A per-rule authority vocabulary.** Retired; see Alternatives.
- **The `WORKING-MEMORY` propose-don't-self-add guard.** This work unit **derives** it (Alternatives) and reserves
  it as Success Criterion 1's falsifier, but does not write it. The guard belongs in the `WORKING-MEMORY` header
  rather than in the rules, so writing it is a template edit outside this register, held as a reminder-flagged
  `USER-INBOX § Errand` capture. The derivation is what belongs here, and the criterion tests the derivation, not
  the edit.

## Proposed Design

Nine design units. D1–D4 are the constitutional core, D5–D8 the compression, D9 the corpus-wide verification arm.
The units are the substrate the task list is built from and validated against.

**The ledger, sized on both sides.** The compression pays for the core, so the debit belongs in the accounting
rather than in the framing. § Rule Authority's settled text (D1) is **37 nb as it stands** — a 9% growth on
`DEV-RULES.ARC`'s 398 nb of content and still the single largest always-loaded addition here — plus D4's three
vocabulary definitions and D6's measured `STRATEGY-INDEX` debit of +15, less D4.1's deletion. Against that, the
canonical credit authorable on day one is 56 nb (`ARC` firm 44 + decided 12), so **the `DEV-RULES.ARC` leg nets
roughly −19 nb before the `authoring` tier (19 nb) and the D6-gated trigger tier (47 nb) land.** The full 145 nb is
the endpoint, not the near-term state, and the ordering in Sequencing is what gets there. Stating this is the same
discipline D6 applies to its own index debit — measured at +15 against a +7 to +14 model, and charged rather than
absorbed; a debit this size left unsized is the larger version of the wash it refuses.

Sizing the debit is not the same as justifying it, so **D1.6 subjected that text to the register's own five tests**
before D7/D8 sizing is relied on. The 46 nb first authored was an upper bound that the pass reduced to 31; the
independent read that followed added 5 nb back — the act-scoped backstop clause and the other gap closures — and
the section's own `---` separator accounts for the remaining unit against the in-file measurement.

### D1 — `DEV-RULES.ARC` § Rule Authority

A new always-loaded section. Its authored text is settled and reproduced here as the normative artifact; task work
realizes it, and any change to it is a spec amendment rather than an authoring choice.

```markdown
## Rule Authority

Every rule ARC states — here, in a method, in a workflow, in an extension, in a strategy — is a **default**
unless marked **invariant**.

**`[configurable]` is a different axis.** It says the _project_ may set a rule's shape; this reading says
whether the _agent_ may set it aside in the moment. Configurability is never itself a discharge.

**Reading an unmarked rule.** Ask whether you can name a fact that, if true, means the rule's concern does
not arise here.

- You can name one, and it is yours to establish or already supplied — the doubt is **dischargeable** →
  **default**. Discharge it as below.
- The fact is not yours to establish — it lives with someone else and has not been said → **invariant**.
  Ask for it; do not infer it.
- You can name nothing, or no fact you could produce would settle it → **invariant**.

**Backstop.** Regardless of the above, a rule is invariant when it protects the integrity of a check, or when
it withholds an _authorization_ rather than a _judgment_ — a decision reserved to a person because it commits
them.

**Both limbs reach acts, not only rules.** A record attesting your own work, or a decision that commits someone
else, is caught whether or not a rule addresses it. Absence of a rule is not a grant.

A rule **protects the integrity of a check** when the agent's own work is what the check examines — quality
gates, verification, review, and the commit and merge gates that admit work (illustrative, not exhaustive). An
agent is never the judge of whether a check applies to its own work; reading what a check reported, including
that it produced no result, is not that judgment.

The same limb settles **self-attestation**. Writing that a gate was met, that a human approved, or that a pass
was rigorous attests the agent's own output and discharges nothing. The claim needs a witness the agent does
not write — a check that ran, an artifact on disk, a person who spoke. Absent one, do not record it as
satisfied; say what is actually known.

**An invariant is not the agent's to discharge.** What it withholds is the authority to decide, never the
capability to act. Its holder may still make the reserved decision, and their making it is the rule working
rather than a waiver — an operator authorizing a merge _is_ the merge gate. What no amount of reaffirmation
does is move that decision to the agent.

**Discharging a default.** Name the rule and the fact that discharges it, surface it where the developer is
already reading — the gate or the completion report, never a log — leave it reversible in one turn, and
proceed. Raise it once per instance: a reaffirmation is a decision, not an invitation to re-raise.

**Whose call.** Authority resolves from the actor's role and the surface the rule governs; no rule declares its
own authority. The owner of the governed surface may discharge a default over it; a rule governing a surface
with no single owner, or governing the project's own standards, resolves to the maintainer. Where the resolved
holder is not you, propose rather than discharge.
```

Six properties the realization must preserve:

- **D1.1 — the satisfaction test is primary.** Of the three candidate tests considered, only it forces the
  disclosure as a byproduct: a default cannot be discharged without naming the fact, and the named fact _is_ the
  disclosure. It also fails safe on silence, which matters most for the rules nobody thought about.
- **D1.2 — the ignorance arm carries a dischargeability qualifier.** A rule guarding an ignorance the agent can
  **never** discharge — the missing fact lives in another mind and has not been uttered — is ignorance-guarding by
  construction yet behaves as an invariant. The arm asks whether the ignorance is dischargeable by the agent (a
  default) or structurally undischargeable (an invariant). Where the ignorance is undischargeable there is nothing
  to disclose, and the remedy is to **obtain the missing input** rather than proceed with a note.
- **D1.3 — the backstop is load-bearing, in two limbs.** Limb one generalizes the `--no-verify` case that both the
  satisfaction and standing tests wrongly release. Limb two separates a withheld authorization from a withheld
  capability, carrying the `run-errand` fix directly, and must be able to **overturn the primary test** — the
  reserved falsifier in Success Criteria depends on it.
- **D1.4 — the section is adopter-facing.** It ships. It carries no reference to internal work units, no
  transitional framing, and no forward-pointer to roadmap scope.
- **D1.5 — the `[configurable]` clause is load-bearing, not housekeeping.** `DEV-RULES.ARC` carries seven
  `[configurable]` rule sites today, and backstop limb one reads directly onto one of them (Commit triggering is a
  gate that admits work). Without the orthogonality statement a reader gets contradictory answers for the same
  rule, and both D3's retrofit and D9's sweep inherit the ambiguity — so the clause is a precondition for either
  being authorable.
- **D1.6 — § Rule Authority takes the register's own procedure, at bullet granularity.** The pass ran over the
  authored text under D5.2's bullet-granularity rule and settled the section at **31 nb**, down from the 46 nb
  first authored. D6 is held to an explicit constraint determination for a +7 nb debit on `STRATEGY-INDEX`; a debit
  this size does not get admitted on the strength of the goals alone. The determination column lives beside the
  register's rows in `notes-judgment-authority-model.md`.

  **Every block carrying a rule returned `constraint → stays`.** The 15 nb the pass removed was not rule content:
  it was justification for rules that stayed — why the satisfaction test fails safe, why competence does not
  transfer authority, why the check test is structural rather than topical — plus one clause stating the same rule
  twice. Rationale of that kind has no demotion destination because it is not content anyone summons; what earns
  keeping routes to D2's ADR, and the rest is dropped. The register reads `DEV-RULES.ARC` every session and does
  not argue its own case there.

  **The reaffirmation clause was amended, not compressed.** As first authored it read that an invariant is not
  discharged "by a host harness's rule that operator reaffirmation is decisive" — a claim that the operator's
  instruction is overridden, which is not this model. The correction is that an invariant withholds the authority
  to **decide**, never the capability to act, and its holder making the reserved decision is the rule working
  rather than a waiver: an operator authorizing a merge _is_ the merge gate. What reaffirmation cannot do is move
  the decision to the agent. D2 carries the cross-harness rationale, which is where it belongs.

  **§ Whose call stays, narrowed to its resolution rule (3 nb).** The block was the pass's one genuinely open row,
  and the holder half of it relocated into the invariant clause above — so the "demoting reintroduces the authority
  gap" argument no longer protects it. It survives on the **constraint test** instead: an agent about to discharge a
  default over a surface it does not own would not know to go looking for the rule naming whose call it is. The
  cross-owner case is the live one — `Owner` is per-WU, so a maintainer-role agent can be working a work unit owned
  by someone else, and no role-gated surface fires there. The contributor case alone would not have held it:
  `AGENT-BRIEF.CONTRIBUTOR` loads deterministically on `arc.role`, and the register already demotes § Contributor
  commit release to exactly that destination. `strategy-team-coordination` remains unavailable either way — it does
  not fire on "about to discharge a default" (D5's fourth test). The solo-collapse concession and the
  distributed-roles gloss are cut as rationale; the resolution rule itself is retained.

  Any block that later demotes is a credit against Success Criterion 3's ledger and shrinks D1's debit accordingly.

### D2 — The anchoring ADR

One ADR under `reference/adr/` anchoring `adr-016`, `adr-020`, and `adr-029` under a single model —
**generalizing, not superseding**. Its content boundary is narrower than an earlier reading assumed: no
cross-harness precedence **rule** is stated anywhere, because none is needed. D1's amended clause scopes the model
to the agent's own authority — an invariant withholds the authority to decide, never the capability to act — and a
harness rule about how the agent treats the _operator's_ decisions addresses a different question. What the ADR
carries is the **rationale** for that scoping: ARC sits on top of harnesses with their own authority models while
claiming agent- and harness-agnosticism (`PROJECT-PRD`; `adr-002`), and at least one host harness states the
operator-reaffirmation-is-decisive norm as a first-class rule. Placement by frequency is the test — the reading is
applied constantly and belongs in the register; why it has this shape is consulted rarely, and ADRs are summoned by
nothing.

It also carries one **terminology reconciliation**, without which "generalizing, not superseding" is not true.
`adr-016` uses _invariant_ to mean **not project-configurable** ("the task-interlock remains invariant and is not
configurable"); D1 uses it to mean **not agent-dischargeable**. Those are different axes that happen to coincide
on the two interlocks — task- and integration-interlock are both — which is why the collision has never bitten.
The ADR states the two senses and their coincidence explicitly rather than leaving a reader to discover that one
word carries two meanings across the layer this ADR claims to unify.

The ADR is a **non-moving artifact**: it stays under `reference/adr/` through the lifecycle and rides the normal
ceremony commit.

### D3 — Marker retrofit, derivation-first

Rules are `default` unless marked `invariant`; the discriminator classifies the unmarked. Do not annotate the
whole method and workflow corpus. The initial marker footprint is roughly five sites: the two invariant interlocks
(task-, integration-), `adr-020`'s floor, and the genuinely bias-guarding nevers — `--no-verify`, integration
approval, amending pushed commits. Precedent supports concentrating the vocabulary: `[configurable]` lives in
exactly one file today.

**The known hazard is the undischargeable-ignorance shape.** Such rules carry no marker and read as
ignorance-guards, so a sweep applying only the wrong-versus-biased split classifies them `default` — wrong, and
wrong in the permissive direction. Where the answer is not obvious from the rule's own text, that is a marker's
job rather than a judgment left to each reading.

### D4 — Vocabulary, and the one brief edit this work unit owns

`procedure-evolution` P7 requires a controlled vocabulary: `invariant`, `default`, and `dischargeable` (of an
ignorance-guard) are load-bearing terms and each earns a definition in `AGENT-BRIEF.ARC`'s `## Vocabulary` block
before use. "Protects the integrity of a check" is bounded inline in D1's section text rather than minted as a
term.

**The marker D3 applies is `[invariant]`**, taking `[configurable]`'s notation and its position on a rule's
lead-in. The two markers are orthogonal axes that compose — D1's own clause says so — and visual parallelism is
what carries that; a second notation would undercut the orthogonality the section states. Fixing the notation
here rather than at each application site is what keeps D3's initial footprint and D9.4's post-sweep additions
consistent.

**D4.1 — delete the brief's duplicate leaf-binding.** `AGENT-BRIEF.ARC`'s `Review increment` entry carries
"Default boundary: one leaf task," duplicating § Task interlock's "One leaf is the _default_ increment boundary."
D7.2 rephrases that binding to a **floor** plus an explicit boundary parameter, which would leave two
always-loaded surfaces disagreeing. The discharge is deletion, not synchronization: both surfaces are always-loaded
full-read, so removing the brief's copy removes a _copy_ and not the rule — the redundancy sub-case of the demotion
precondition, and the only demotion class that carries no reachability risk at all. It also removes the
synchronization burden permanently rather than paying it every time the binding is reparametrized.

Scope discipline: this is the **only** vocabulary-block edit in scope, and it is here solely because D7.2 creates
the incoherence. The brief's other overlaps with `DEV-RULES.ARC` are real but are
`orientation-surface-compression`'s — that stub exists precisely to apply this method to the surfaces this
register excluded. See Cross-cutting → Coordination for what routes to it.

### D5 — The register's decision procedure

Five tests applied **in order per row**, stopping at the first that settles it. The ordering is the design: pass
one of this register applied the audience and summoning tests without a constraint determination and demoted five
constraints; the constraint column is what closed that.

This unit is **already applied to D7 and D8** — it produced their dispositions during planning, and is recorded
here so those rows are auditable and so a re-measure after base drift reaches the same verdicts. Those rows carry
no task of their own. It is **also applied to D1's own text**; that pass settled the section at 31 nb and is
recorded under D1.6.

1. **Constraint?** Must the reader have this present because they would not know to look for it — a prohibition, a
   mandatory stop, or a permission governing a path its destination does not fire on? `yes` ends the row: it stays
   always-loaded (`knowledge-evolution` P1).
2. **Destination** — which mechanism takes it: fire-site declaration, explicit-trigger index entry, emitted remedy,
   or domain rules.
3. **Trigger strength** — does it fire at the 85–95% explicit-trigger band, or is it a passive `Consult when:` line
   at 60–75%? `knowledge-evolution` P10: demotion from always-loaded goes only to an explicit trigger.
4. **P3** — is the trigger anchored to the **operation**, or only to a workflow the content must also survive
   outside? A trigger must also not fire on a signal the agent estimates badly.
5. **Pointless as routed** — does the trigger fire about as often as the load would have? Where a lean operational
   surface covers the common case, the deeper surface's trigger must name the _residual_ question, not the domain.

Two doctrines govern what the tests may conclude:

- **D5.1 — the cut test, loud versus quiet.** "Easy to revert" holds only where a removed rule fails **loudly**.
  Ignorance-guards usually fail loudly — cut aggressively. Bias-guards fail quietly — never cut, at any capability.
  **The criterion is the failure mode, not the guard type, and the two are separate axes:** § Commit format is a
  quiet-failing ignorance-guard (reconstructing a message from `git log` fails loudly on the Context footer, which
  the hook validates, and quietly on the `(arc)` scope convention, which nothing checks), and it takes bias-guard
  treatment. Never-cut does not mean never-rephrase; correcting a rule's scope is not weakening it.
- **D5.2 — the audience test, applied per bullet.** `DEV-RULES.ARC` is read by the agent every session, so content
  whose _reader_ is the human is misplaced there regardless of how load-bearing it is. The unit is the bullet, not
  the section: § Context quality's structural-boundaries category is human-facing decision support with one
  agent-facing behavioral instruction embedded in it. Demoted human-facing content goes to `strategies/`, never to
  `docs/`, which is frozen pending a rewrite.

### D6 — The trigger tier: seven `STRATEGY-INDEX` entries

The register's largest **gated** tier (65 nb — `firm` is larger at 97 but waits on nothing) turns on one defect:
every `strategy-*` destination reaches its content through a passive `Consult when:` line at the 60–75% band.
Seven entries need explicit-trigger work before any of that content may move — **this is the critical path, not an
incidental prerequisite**:

`strategy-work-organization`, `strategy-work-planning`, `strategy-session-operations`, `strategy-workflow-authoring`,
`strategy-package-project-sync`, `strategy-team-coordination` (the destination for § Task interlock's 3 nb team
elaboration; the row's remaining Δ is its leaf → floor rephrasing), and a **new** entry for
`strategy-interlock-release-wrappers` (the file exists and carries no index entry today).

The set is closed by construction: it is exactly the `strategy-*` destinations the register's `trigger`-tier rows
name, and every such row is settled — so the list and the tier validate each other rather than resting on an open
disposition. `strategy-adr-methodology` was in an earlier version of this set and is **not** in it: its only
motivating row re-derived to compress-in-place (D7.5), which removed the destination.

**Install reachability — the precondition under the trigger work.** An explicit trigger pointing at a file the
project does not have is worse than the passive line it replaces. `packages/arc-framework/init-recipe.json` is
the sole authority on what installs (`resolveFileList` builds the install set from it; there is no bulk copy of
the package tree), and three of the seven destinations are absent from it: `strategy-interlock-release-wrappers`
and `strategy-workflow-authoring` never install, while `strategy-team-coordination` installs only under
`team.mode == true`. The shipped index already lists two such files, so the inconsistency is pre-existing and
cosmetic — but demoting 17 nb of `DEV-RULES.ARC` behind a pointer to a file no project receives converts it into
content loss for every project, which is `knowledge-evolution` P10 violated more severely than the defect D6
exists to fix.

The omission is an oversight rather than a decision, so D6 corrects it: the two never-installing destinations are
added to the recipe, and `strategy-concurrent-work` — the same oversight in a row this register does not touch —
rides along rather than being left as a known hole. `strategy-team-coordination`'s condition is deliberate and
stays; the consequence to accept is that § Task interlock's team elaboration becomes unavailable to projects
running without `team.mode`, which is the right home for team content and the wrong outcome only if that
elaboration is judged universal.

**Both copies.** `STRATEGY-INDEX` is Configurable, and its `## ARC Framework Strategies` block is identical in
`packages/arc-framework/arc/reference/strategies/STRATEGY-INDEX.md`. **Five** of the seven live in that shared
block and are rewritten in **both** copies; `strategy-interlock-release-wrappers` is _added_ to the shared block in
both, since it has no entry in either today. Six of the seven therefore carry a package obligation — otherwise the
shipped outcome inverts the design: projects would receive a
rules file shortened by D7's trigger tier, with the content landing in Framework strategy files that ship, reachable
only through the passive 60–75% line this unit exists to eliminate. That is `knowledge-evolution` P10 violated for
every project by construction. `strategy-package-project-sync` is the exception — a project strategy, instance-only.

**The shipped maintenance rule changes with it.** The package copy closes with "Keep descriptions to one line; add
a 'Consult when:' sub-item with trigger conditions" — which instructs future authors to restore exactly the passive
form this unit removes. D6 updates that footer to describe the condition-only convention; leaving it would ship
guidance that contradicts the index above it.

**Rewrite convention: condition-only.** `STRATEGY-INDEX` sits in the same always-loaded tier as both rules files,
and an explicit-trigger directive is longer than the passive line it replaces — modeled at roughly +1 to +2 nb per
entry, +7 to +14 across the seven. **Measured at execution: +15** (instance 62 → 77), above the modeled ceiling.
Two structural causes, neither accidental: the new `strategy-interlock-release-wrappers` entry has no line to
replace, and a residual-scoped condition must name both the residual question and the surface holding the common
case, so it runs longer than a bare directive. The scoping is what earns the entry its slot, so the overrun is the
right trade — but it is charged to Criterion 3's net, not absorbed into it. A credit taken against one tier-1 file
while a debit accrues to another is exactly the accounting that hides a wash. Each entry carried a description
_and_ a `Consult when:` line that largely restated it. Where the description adds nothing the condition does not
already carry, the rewrite **replaces both lines with one directive** rather than lengthening the condition
beneath a retained description, taking the tier's net yield back to roughly its gross.

Two bounds. A description stays where it carries content-shape detail the condition does not
(`strategy-work-planning`'s spec forms and layered specs, `strategy-quality-gates`' tiered system) — the convention
is collapse-where-redundant, not strip-descriptions. And it reaches **only the seven entries this work unit
rewrites anyway**; the same collapse across the index's other entries routes out.

**Scoping the trigger — D5's tests 4 and 5 are authoring obligations here, not only row verdicts.** D5 presents
its five tests as applied per register row, which settles _whether and where_ a rule may move. Two of them also
constrain the trigger text itself, and this is the unit that writes it: **test 4** requires the condition anchor to
the operation rather than a workflow, and to avoid any signal the agent estimates badly; **test 5** requires that
where a lean operational surface already covers the common case, the entry name the **residual** question rather
than the domain. Directive form satisfies neither on its own — an entry can name its operation in the prescribed
shape and still fire on the 95% a method or workflow already serves, which relocates the read instead of removing
it. Per `analysis-load-set-scoping`, that failure is _pointless_, not _unsafe_: it does not endanger the demoted
content, it just buys nothing for the tier-1 debit it charges. Apply both tests to each entry after authoring it.

The index already carries two entries in the residual form, both landed for exactly this defect —
`strategy-quality-gates` ("routine per-task and per-unit gate runs are covered by the `quality-gate-commands`
method") and `project/strategy-testing-methodology` ("the `test-first` / `testing-standards` methods don't settle
it"). They are the worked pattern; an entry whose leaner surface exists and goes unnamed has not been scoped.

**A consequence for D7 and D8.** A residual-scoped trigger licenses demoting only _residual_ content. A rule that
fires in the common case cannot land behind a condition that deliberately excludes the common case — the register
rows routed to such an entry must be re-checked against what its trigger actually reaches, not merely against the
destination file.

### D7 — Canonical register: `DEV-RULES.ARC` (145 nb of 398)

Per-section dispositions are enumerated in `notes-judgment-authority-model.md`, which is the authoritative row-level
record. The register is the **named** set; keeping the line-level table out of the spec is what stops it widening
into an open audit mandate. The spec carries the tier accounting and the rows that decide something:

| Tier                            | `ARC` | `PROJECT` | What gates it                                                            |
| ------------------------------- | ----- | --------- | ------------------------------------------------------------------------ |
| **Firm**                        | 44    | 54        | Nothing — cuts and verified-redundancy demotions whose mechanism fires.  |
| **Decided**                     | 12    | 7         | Settled author's-interest cuts (the maintainer's read has run).          |
| **Authoring**                   | 19    | 17        | Ordinary review — compress-in-place; the constraint stays always-loaded. |
| **Behind trigger re-authoring** | 47    | 18        | D6.                                                                      |
| **Blocked**                     | 15    | —         | § When to Load Additional Guidance; no summoning mechanism exists.       |
| **Compress residue**            | 8     | 6         | Nothing.                                                                 |
| **Total**                       | 145   | 102       | **247 nb**; 117 authorable today (56 canonical, 61 instance).            |

Task 3.1's re-measurement moved one row and one denominator. § Contents is 12 nb — § Rule Authority added a
table-of-contents line — taking canonical `firm` to 44. And the recorded denominators counted each file's trailing
link block: the canonical file is **398 nb** of content, not 418, and the instance file **255**, not 267. That is
the fourth instance of the error D7.5 and D7.6 caught per-row; the lesson they drew was never applied to the file
totals. The register's share of each file is correspondingly larger than recorded. Row-level, the enumeration
holds: thirty-two of thirty-three canonical rows reproduce their `nb` exactly under a mechanical re-derivation.

`PROJECT` authoring is 17 rather than 14 because D7.5's re-derivation moved 3 nb out of the trigger tier into it —
the register total is unchanged by that move, but D6's gated surface shrinks. The `firm` + `decided` tier is
untouched by every correction so far, so the 116 nb authorable today has held across both adversarial passes.

Rows that carry design weight beyond the accounting:

- **D7.1 — the cuts, as narrowed by the maintainer's read.** § Task granularity loses the two numeric bullets (>3
  files, >50 lines) and keeps the two qualitative ones; demotion is unavailable because a `generate-tasks` trigger
  misses ad-hoc in-session decomposition (P3). § Verify before assuming loses the search-first and ask-clarifying
  steps; the "stop and ask" step and the "Never generate or assume" list stay — constraint stays, procedure moves.
  § Context quality loses the quality-signals bullet **entirely**, because it asks the agent to detect its own
  degradation and an agent reliable enough to do so would not be drifting; the handoff-boundary behavior that
  bullet appeared to produce actually comes from § Structural boundaries' last clause, which is **extracted as a
  one-line keep** before the two remaining boundary categories demote. `Natural session boundaries` lists three
  categories, not four; with one cut and a clause lifted out, the lead-in loses the list it introduces and needs
  the same structural resolution D8.2's heading does. Both tables of contents cut whole (22 nb combined) —
  each file loads whole, `§` reference resolution never consults them, so the navigation mechanism a table of
  contents serves is absent for its only reader.
- **D7.2 — the rephrasings.** § Quality gate failure separates three failures under one heading: a gate that
  **never ran** is not a gate failure (correct the invocation and re-run — nothing to report or decide); a red gate
  whose cause is this increment with the fix in scope is a **discharged default** (already landed upstream); a red
  gate whose resolution is a scope decision is the developer's call. What survives as invariant is narrower and
  stronger than the current step 4: **a red gate never becomes a green report, and is never bypassed** — backstop
  limb one. § Review-Increment Invariant ¶2's four exempted operations restructure as a list. § Discovered Work
  Routing's "always propose placement before acting" contradicts the inline-fix permission two lines above it; a
  same-concern cleanup in a file already under edit is a discharged default. § Commit control's merge authority
  reseats out of commit control, keeping the not-authorization enumeration **whole** — classifying the rule
  `invariant` establishes only that an authorization is required, not that a general "proceed" is not one. **The
  block stays whole and stays always-loaded** — the register's row is `keep whole`, Δ0, because `integrate-work-unit`
  fails P3: the rule exists for the agent _not_ running that workflow. An earlier reading had the procedure moving
  there; the constraint-column pass disqualified it, and the reseat is a within-file relocation to a heading that
  describes it, carrying the § citation sweep above.
- **D7.3 — three demotions withdrawn as constraints** beyond the P1 re-audit's five: § Method and extension
  loading's `.override` / `override-mode` semantics (applying `.default` where an override governs fails silently,
  with no cue to look), § Commit control's Prefix mapping (needed at _any_ structured approval gate, including the
  off-task-list ones, so a `process-task-loop` destination fails P3), and the class-authorization preconditions.
- **D7.4 — `DEV-RULES.PROJECT` § Selecting what to run is the exemplar.** Named purpose, derivation rule, explicit
  fail-safe. Cite it as the target shape; change nothing.
- **D7.5 — § Architecture Decision Records, re-derived.** The row recorded 24 nb with a 16 nb demotion; the
  section is lines 321–334 = **12 nb**, the extra 12 being the file's trailing `---` plus 11 link definitions — the
  same trailing-link-block error the register caught once for § When to Load Additional Guidance and failed to
  generalize. The disposition was ungrounded too: it proposed demoting "the decision criteria," which the instance
  does not contain — it already carries only a pointer ("See ADR Methodology Strategy — decision criteria,
  three-tier stability model, amendment vs. supersession"); the criteria live in the package template.
  **Re-derived disposition:** `authoring` — compress the 3 nb pointer in place, and relocate the 8 nb internal-only
  leak rule into § Audience Boundaries (a within-file move, not a demotion). Nothing here demotes, so
  `strategy-adr-methodology` **ceases to be a register destination** and leaves D6's set. Sizing consequence: 3 nb
  moves from the `trigger` tier to `authoring`, so the register total is unchanged while D6's gated surface drops
  from 68 to 65.
- **D7.6 — § When to Load Additional Guidance is 15 nb, not 17.** Lines 527–549; line 550 is the `---` before the
  trailing link block. Same error class as D7.5, third instance. It stays `blocked` — the count changes, the
  disposition does not. `ARC` 146 → 144, register 248 → 246. The lesson the register should carry: a mechanical
  per-heading count must exclude the trailing link block by construction, not by remembering to.

### D8 — Instance register: `DEV-RULES.PROJECT` (102 nb of 255) — trailing chunk

Delivered as a distinct trailing boundary. `DEV-RULES.ARC` is a Framework file whose package source and project
instance are byte-identical, so its 144 nb reach every project. `DEV-RULES.PROJECT` is different in kind: it ships
as a 175-line template against this repo's 348-line instance, and the register measures the **instance**.

**The template is not a blank scaffold, and several register rows reach it.** Verified in
`packages/arc-framework/arc/system/rules/DEV-RULES.PROJECT.md`: the DRY / SOLID / KISS / YAGNI list (the target of
D8.2's cut), "Always run markdown linting after updating documentation files" (the § Markdown quality firm row), a
§ Contents block (the same table of contents the register cuts on the loaded-whole argument), § Documentation
style, and the ADR write / don't-write criteria. Where the template carries content a register row dispositions,
**the same disposition applies to the template**, and the increment stages both. Leaving it otherwise would apply
this work unit's own thesis to one repository while every project kept inheriting the text the thesis calls inert.

Two consequences to hold explicitly:

- **The nb figures still measure the instance.** The template's mirrored subset is additional edit surface, not
  additional register lines; its size re-derives at execution rather than being asserted here.
- **D8's droppability weakens.** Dropping this chunk no longer strands nothing — it would leave the shipped
  template misaligned with the instance on rows the register has already decided. If the work unit narrows, D8
  drops as a unit (instance **and** template together), never half.

Sequencing still follows the canonical / instance split rather than ownership: the `DEV-RULES.ARC` half pays out
every session for every project and goes first.

**D8.1 — the quality-gate retarget ships, and its path must be named.** The template _does_ carry a § Quality
Gates counterpart: four authoring comments plus four numbered placeholder gate entries (name / command, two of
them also config),
of which this repo's six numbered entries are the filled-in form. One of those comments already reads "Commands
here should match `QUICK-REFERENCE` § Quality Gate Commands," so the shipped scaffold already points where this
demotion points. Two retarget paths exist with opposite adopter consequences, and pre-commit CHECK 14 forces
package-source methods to ship neutral, so the choice is real: a `.override` retarget is instance-only, while a
`.default` retarget ships.

**Resolution: retarget `.default`, and update the template scaffold in the same increment** so the shipped
instruction and the shipped method agree — commands recorded in `QUICK-REFERENCE`, standards in
`DEV-RULES.PROJECT`. That is the split the setup workflow already codifies, and the template comment already
half-states. A `.override` retarget is rejected: it would be a project-local divergence on a Framework method that
no design unit authorizes, and would leave every project's method pointing at a section this work unit empties.
Consequence for § User-facing impact: adopters' § Quality Gates scaffold changes shape, so this is not a
no-migration change for the template — existing filled-in instances keep working, since the method resolves to
whichever section carries the commands.

**D8.2 —** one row carries a structural consequence: cutting DRY / SOLID / KISS from § Code Quality Principles
removes the section's opening content, leaving a heading that no longer describes its contents. **YAGNI stays**,
reframed as
scope discipline — "don't build what wasn't asked for" is a scope-authority rule agents do violate and ARC states
nowhere else, not capability guidance. Resolution: **rename the heading** to describe what remains (the
pre-public-release compatibility posture plus the TypeScript standards) rather than relocating the posture into
§ Package-Project Sync, which would seat a code-standards rule inside a sync section.

### D9 — The corpus-wide classification sweep

D1 states a presumption over every unmarked rule in the corpus while the initial marker footprint is roughly five,
so the presumption's blast radius must be checked rather than asserted. The draft's sweep covered 4 workflows and
0 methods and found no counterexample — a spot check that licenses proceeding, not coverage.

- **D9.1 — scope: the full rule-carrying corpus, matching D1's own enumeration.** § Rule Authority claims every
  unmarked rule "here, in a method, in a workflow, in an extension, in a strategy," so the sweep covers all four —
  every workflow, method, extension, and strategy document, excluding the directory `README.md` indexes, which
  carry no rules. As currently measured: **36 workflows, 25 methods, 13 extensions, and 20 strategies** (13
  `strategies/arc/`, 7 `strategies/project/`). The criterion is the corpus D1 governs, not the number; counts
  re-derive at execution because the corpus grows.

  **The corpus is the shipped set, not the installed one.** § Rule Authority governs every rule ARC _states_, and
  a document that ships without an instance counterpart states its rules to every project that receives it — so
  scoping the sweep to what happens to be installed here would make the governed corpus an accident of this
  repository's configuration. One workflow is currently in that position
  (`03_configure-external-integration.md`), which is why the workflow count is 36 rather than the 35 the instance
  carries.

  **Reading rule — the corpus is two-copy, in three relationships.** Most documents are byte-identical Framework
  files: classify from either copy, and a marker syncs. Five workflows ship as `.template.md` rather than as
  mirrors, so a marker applied to the instance does **not** reach projects — the shipped artifact is a different
  document and takes its own edit. And a handful of methods and extensions genuinely diverge between copies at
  any given time, where classifying from one copy does not settle the other. Re-derive the divergent set at
  execution rather than carrying its membership forward; it moves.
  Each document is read for imperatives that the default-unless-marked reading would reclassify. Every one found
  either **takes a marker** or is **recorded as an accepted reclassification** with its reasoning. The record lands
  in `notes-judgment-authority-model.md` as a per-document sweep table — the same companion that holds the
  register's row-level dispositions — so Success Criterion 2 has a named artifact to be validated against rather
  than an assertion.
- **D9.2 — sweep order: methods, then strategies, then workflows, then extensions.** The method corpus is the
  priority — `[configurable]` has no presence there at all, so methods have never carried a classification marker
  of any kind and there is no local precedent for a reader to calibrate against. Strategies rank second on
  density: they carry
  138 `never` / `must not` lines (111 in `strategies/arc/`, 27 in `strategies/project/`) against the methods' 68,
  and the region already holds a **live counterexample candidate** — `strategy-package-project-sync`'s "never
  `cp`" — scoped to Configurable files — reads as `default` under the satisfaction test, since the agent can name
  and establish "this file carries no project overrides." Whether that is a genuine conflict is itself the sweep's
  question: the pre-commit error fires only when overrides existed at HEAD, so the discharging fact and the
  enforcement condition may not overlap. It is offered as a candidate to examine, not an established conflict —
  resolving it is sweep work, and whichever way it lands, it is the kind of result Goal 6 exists to surface.
  Extensions rank last on the same density measure — they carry no `never` / `must not` line at all — but a
  rule-free surface and an unread one are indistinguishable in the record, so the low expected yield is a reason
  to sweep them cheaply rather than a reason to omit them.
- **D9.3 — the sweep names a third content category.** These two rules files are constraints, so a `no` in the
  constraint column reliably means demotable. Orientation surfaces are not: `AGENT-BRIEF.ARC`'s vocabulary block is
  the largest single part of it and the **least** demotable content in the always-loaded set, because `work unit`,
  `Class`, `interlock`, and `review increment` are what make the rules that stay readable at all. A third category
  is required beside constraint and explanatory — **enabling** content, carrying no obligation itself but a
  precondition for interpreting content that does. Demoting an enabling definition silently degrades every rule
  that uses the term. Named here; **applying the compression method to a brief is not in this work unit's scope**
  — `orientation-surface-compression` owns that. D4's two brief edits are not that audit: they are the vocabulary
  additions P7 obliges and the single deletion D7.2's rephrasing forces.
- **D9.4 — the sweep can invalidate D3.** The retrofit's "roughly five markers" is a prediction, not a budget. If
  the sweep returns a materially larger marked set, that is a finding about the discriminator's reach and is
  recorded as such; D3's footprint follows the sweep rather than capping it.

Reading is derivation work — delegable to fresh subagents under `DEV-RULES.ARC` § Sub-agent scope, with output
advisory until the primary verifies it against source.

### Sequencing

The dependency structure, which the task plan must respect:

| Order | Unit(s)    | Gates                                                                                |
| ----- | ---------- | ------------------------------------------------------------------------------------ |
| 1     | D1, D2, D4 | Nothing, except D4.1 — see order 4. D1 must land before D3 and D7.2, which apply it. |
| 1b    | D1.6       | D1's text settled. Its result adjusts the ledger before D7/D8 sizing is relied on.   |
| 2     | D3         | D1 (the marker's meaning is D1's).                                                   |
| 3     | D6         | Nothing. Gates 65 nb across D7 and D8 — start it early; it is the critical path.     |
| 4     | D7         | D1 for the rephrasings; D6 for the trigger tier's 47 nb. D4.1 lands with D7.2.       |
| 5     | D9         | D1. Independent of D6–D8; may run in parallel. Its result may revise D3.             |
| 6     | D8         | D6 for its 18 nb trigger tier. Trailing chunk — drops as instance **and** template.  |

## Alternatives & Rationale

**A per-rule authority vocabulary — rejected.** The obvious alternative is each overridable rule declaring its
override authority: `owner` / `maintainer` / `policy`. The substrate exists (`arc.role`, per-WU `Owner`) and it
collapses cleanly for a solo developer. Probed against ~10 candidate defaults — task granularity, quality-gate
failure, test-first, placement proposal, line length, commit format, package-sync, sub-agent execution relaxation,
doc boundaries — role × governed-surface returned the right authority every time, with no counterexample. Two
findings retired the vocabulary outright: **`policy` is redundant** (a default nobody may override at runtime _is_
an invariant, so three values collapse to the existing binary), and **the case that would have justified
`maintainer` resolves without a declaration** (the quality-gate zero-tolerance rule is invariant under backstop
limb one, and the role × surface read still names its holder, landing on the maintainer
because the governed surface is the project's own standards). The declaration is therefore enumeration this work
unit's own thesis says to drop, and dropping it keeps the solo-collapses-cleanly property. An earlier version also
claimed `procedure-evolution` P2 forbade the markup; that overread P2, and the retirement rests on the two findings
alone. Limit worth stating: the probe covered ~10 of the file's imperatives, classified by judgment, not all of
them. A counterexample found later argues for one narrow marker, not for reinstating the vocabulary.

**Purpose test or standing test as primary — rejected.** No single test classifies the corpus. Probed against four
rules, the satisfaction and standing tests both wrongly release `--no-verify`: a hook failure on an untouched file
is a nameable, checkable fact, and skipping the hook reads as a judgment rather than an authorization. Only the
purpose test catches it, and for the right reason — an agent that wants to commit is structurally the wrong judge
of whether the commit check applies to it. Rather than promoting the purpose test, that case generalizes into
backstop limb one, keeping satisfaction primary for its disclosure-as-byproduct and fail-safe-on-silence
properties.

**Placing cross-harness precedence in the ADR — rejected.** An earlier reading put it there, reasoning that the
case arises rarely and the always-loaded set is what this work unit shrinks. That is placement by frequency, which
`knowledge-evolution` P1 replaces with miss-cost, and it fails three ways: the rule governs the _invariant_ class,
so its miss-cost is an entire class becoming bypassable; no always-loaded surface routes a reader to `adr/` **for a
rule's content** (`DEV-RULES.PROJECT` and `STRATEGY-INDEX` do reference `adr/`, but only to say where ADRs live,
that they are internal-only, and when to write one — never "the rule binding you is over there"); and P1's named
anti-pattern is burying an invariant in an on-demand document because that document "owns the domain."

**Restating the `WORKING-MEMORY` write constraint in `DEV-RULES.ARC` — rejected.** The derivation belongs here:
backstop limb two makes an autonomous memory write an authorization, because it commits someone else — the file is
identity-global and always-loaded, so every future session pays the cost and the agent adding the entry is not the
party who pays. The **distinguisher** matters, without which the derivation over-fires on SESSION-NOTES, which is
also agent-written into the developer's workspace: bounded cost inside a ceremony versus unbounded cost outside
one. But the resulting guard belongs in the `WORKING-MEMORY` header, already in the always-loaded set, landing at
the fire site of the operation it governs at zero marginal load. Restating it in the rules would grow the surface
this work unit shrinks and duplicate a constraint `strategy-session-operations` already carries.

**Lifecycle-state keying as a destination — probed, deferred.** Structurally the strongest conditional destination
and the only one that can hold a constraint without weakening it: the session probe already resolves lifecycle
state, so it is not an estimate the agent must make, and a constraint loaded whenever its state is active is never
absent when it applies. It nevertheless buys this register almost nothing, and that is the finding — probed against
the rows the constraint column marked as staying, nearly none are lifecycle-bounded. Merge authority bites
precisely _outside_ integration; `--no-verify`, rebase and amend scope, and the revert checks bite at any commit in
every state; the review-increment invariant and the documentation-boundary rules fire whenever anything is written.
The reason is structural rather than lucky: **the compression already selected for universality**, so what survives
survives because it is universal. Routed to `rules-restructure` with its fail-open hazard recorded — `sessionType`
is legitimately `null`, so a keyed surface that does not load under `null` drops constraints silently.

**Fanning out to more rules files — rejected.** More files is bloat; more passes over the same two is not. The
compression is a deliberate widening of effort against a fixed surface, and the register is bounded and enumerated
so it cannot quietly expand into an open audit mandate.

## Cross-cutting Considerations

**Package–project sync — three classifications, not one.** The surfaces this work unit edits do not share a sync
rule, and the difference decides where each edit is authored and whether any hook notices a missed counterpart:

- **Framework** — `DEV-RULES.ARC` and three of the six `strategies/arc/*` demotion destinations. Edits go through
  `packages/arc-framework/arc/` (authoritative source) and sync to `.arc/`, never the reverse; the copies are
  byte-identical. `scripts/check-package-sync.sh` **warns** when a `.arc/` edit stages without its package
  counterpart. That script runs from `.husky/pre-commit` after the ARC hook and is dev-only to this repo — it is
  not part of the shipped hook system, so a task author looking for it in `githooks/pre-commit` will not find it.
- **Configurable** — `DEV-RULES.PROJECT` and `STRATEGY-INDEX`. Project-specific sections are edited in `.arc/`,
  framework sections in the package source, never `cp`'d between copies. **That warning does not fire for this
  class** — the script's Configurable arm only errors on the blind-`cp` signature. So for D6 and D8, the package
  counterpart is a _stated step in the task_, not an omission a check will catch. This is the half where drift was
  newly recognized, and it is precisely the half with no mechanical backstop.
- **Unclassified in the manifest** — `strategy-workflow-authoring`, `strategy-team-coordination`, and
  `strategy-interlock-release-wrappers` have no manifest entry, because the manifest is built from the install
  recipe and these are exactly the files the recipe omits or gates. The script's classification lookup returns
  empty and its `case` falls through with **no check at all**. They are two-copy byte-identical files that behave
  as Framework, so until the recipe correction lands the same hand obligation as the Configurable class applies to
  them. Once it does, they classify as Framework and inherit the counterpart warning and the byte-identity test —
  which is the second reason to fix the recipe rather than route around it.
- **No package copy at all** — `strategy-package-project-sync` is a project strategy; that directory ships to
  projects as an empty surface, so its demotion target is instance-only. Some D8 rows are likewise instance-only
  (§ Selecting what to run, § Commit Conventions), but **§ Quality Gates is not** — see D8.1.

**Audience boundaries.** D1, D3, D4, D6, D7, **and D8** all touch adopter-facing surfaces — D8 because its
template half ships (see D8). The shipped text carries no
transitional framing, no project-internal migration concern, no forward-pointer to internal roadmap scope, and no
`adopter` / `adopters` framing. Internal context — the deferral to `rules-restructure`, the carve-out for
`execution-delegation-doctrine` — lives in this spec, the notes companion, and the meta file, never in the section
text. D2's ADR is internal-only and must not be referenced from `strategies/arc/` or any other shipped surface.

**Verification, and an accepted deviation.** `procedure-evolution` **P5** holds that judgment prose cannot be
statically verified, so behavioral regression tests are its only correctness instrument — and this is the largest
judgment-layer rewrite the corpus has attempted, with all three success criteria inspection-based. This is
**recorded as an accepted deviation, not an oversight**: P5 names `workflow-eval-harness` as its owner and that
harness does not exist, so no eval coverage is available to gate this. The consequence to state plainly is that
D1's real failure mode — being misread in practice rather than being wrong on paper — is undetected until that
harness lands, and § Rule Authority is the natural first eval subject when it does.

**Fire-point reachability.** **D8's** quality-gate demotion (§ Quality Gates lives in `DEV-RULES.PROJECT`) is a
one-line retarget of `quality-gate-commands`' passthrough, which today reads "Commands specified in
`DEV-RULES.PROJECT` § Quality Gates" — emptying that section without the retarget breaks a declared fire site. The
retarget's destination is `QUICK-REFERENCE` § Quality Gate Commands, which already carries the command listing and
is an on-demand section rather than part of the always-loaded partial read, making this a clean redundancy
demotion. Because declared methods load at their fire-point rather than eagerly, and no checker validates
fire-point marking for methods (one extension marker, `#pre-push-review`, is the lone exception), the retarget is
verified by hand against every site the method fires from.

**Quality gates, and the one hazard nothing mechanical catches.** The change set is Markdown-only, so the
relevant gates are markdown lint plus the three ARC contract checks — none of which covers this work unit's
largest mechanical risk. `lint:arc:section-refs` **refuses the `§` glyph inside `src/` and `__tests__/`
TypeScript**; it does not resolve a Markdown `§ Heading` citation against a real heading. `lint:arc:domain-rules`
does not inspect the reserved rules filenames. `lint:arc:triggers` audits method and extension declaration
coverage, push-site fire ordering, and the activatable-method registry — none of which resolves a citation. The
pre-commit link check skips anchor-only links.

So **no gate validates an inbound `§` citation**, and the register moves and renames cited headings: D7.2 reseats
merge authority out of § Commit control, D8.2 renames § Code Quality Principles, D7.5 relocates the ADR leak rule
into § Audience Boundaries, and every demotion empties a cited section. Roughly 60 live `§` citation sites exist
across workflows, methods, shipped strategies, `AGENT-BRIEF.ARC`, the `QUICK-REFERENCE` template, and three
shipped skill files — in **both** copies.

**The obligation this creates is procedural and belongs in the task plan:** every task that moves, renames, or
empties a cited heading closes by sweeping inbound `§` citations for that heading across both copies and updating
them in the same increment. Hand-verification is the instrument, exactly as it is for the `quality-gate-commands`
fire-point below, and for the same reason — the checker does not exist. That absence is a verb gap worth
capturing separately; it is not this work unit's to build.

**Base drift.** The register is measured against a recorded base and re-derives mechanically from the heading
structure; section identity and `nb` are the record, never line ranges, which decay on every base merge. Two rows
already moved this way during drafting. Re-measure at execution rather than trusting the figures cold.

**Coordination — planning-closeout, not implementation.** Two notes route via `USER-INBOX` at planning close, not
as task-list phases and not as success criteria: to `rules-restructure` (the deferred § Documentation Boundaries
tier, the supplied invariant/default predicate plus mechanism 4's limit, lifecycle-state keying and its fail-open
hazard, and the overlap with its inbound buffer's progressive-disclosure rebalance touching § Discovered Work
Routing and § Holding ≠ execution), and to `execution-delegation-doctrine` (the vocabulary coupling, and the
§ Sub-agent scope surface boundary), and to `orientation-surface-compression` — which this work unit minted to
keep the register bounded, and which owns the vocabulary-overlap audit D4.1 touches only the edge of. Two things
carry to it: the finding that `AGENT-BRIEF.ARC`'s `Review increment` entry restates rule content from
`DEV-RULES.ARC` § Review-Increment Invariant and § Task interlock, and a **live drift instance** — the entry's
deferred-review clause names `on-task-approval` where `process-task-loop` covers `on-task-approval` _and_
`on-workflow` and names the opt-in syntax, so an always-loaded copy has already gone lossy against its source.
That instance is evidence for the stub's own thesis and is the class of finding its enabling-content derivation
must classify. **No `Depends On` edge in any of the three cases.**
`unit-scoped-review` and the `review-protocol-alignment` cohort's members are downstream consumers with no hard
edge; the gate-versus-granularity rephrasing in D7.2 is forward-compatible with `unit-scoped-review`'s
parametrization by construction.

**Knowledge-evolution forward-compat check.** Four of the strategy's five Self-Check conditions apply — placement
of guidance content, always-loaded context, trigger / index / description surfaces, and marginally loading
mechanisms. The pass runs clean on **P1** (D5 test 1 is P1, and it is what closed pass one's five wrongly-demoted
constraints), **P3** (D5 test 4), **P4** (no per-artifact tier or loading flag is introduced — which is also what
rules out splitting `STRATEGY-INDEX` into always-load and reference-load groups, a declared loading tier wearing a
heading), **P6** (the register demotes into existing files and mints no unit), **P7** (emitted remedy is a
first-class destination in D5 test 2), and **P8** (no document is sharded). **P10** is the best-integrated
principle here — the sizing ledger holds the addition to the same accounting as the removals — with one live
correction: D6's `+7 to +14` index debit was modeled against entries carrying a description _and_ a `Consult when:`
line, and a maintenance errand has since banked the description-drop credit into the baseline, so the re-measure
owes the index leg as well as the register.

Two findings carry:

- **The scoping gate was unwired.** Test 5 reached neither the unit that authors trigger text (D6), nor the
  execution shape derived from it, nor Success Criterion 3 — while tests 1 through 4 each reach the design in
  several places. An over-firing trigger therefore satisfied every stated obligation, and four shipped before the
  gap was found. D6 now carries both tests as authoring obligations and Criterion 3 checks the fifth; the entries
  are re-scoped against it.
- **Routing both content kinds through the index is an accepted deviation.** The target model resolves
  operational reference to mechanically-evaluated fire-site triggers and reserves the firing-condition index for
  emergent-relevance doctrine; P5 says the same of new on-demand loading. This work unit routes both through
  `STRATEGY-INDEX`, because no fire-site mechanism for knowledge units ships. Recorded as an accepted deviation
  rather than an oversight: the target-model split is `knowledge-architecture`'s to author and
  `loadset-composition`'s to seat, and residual scoping is the closest interim approximation — it makes the index
  behave as two kinds without declaring two kinds. **No `Depends On` edge**; nothing here blocks on either.

One item routes rather than resolving here: **P9** asks that knowledge content be audience-tagged where the
team-versus-agent distinction exists, and D5.2 sends human-facing demoted content to `strategies/` untagged. It is
a projection concern the register does not otherwise touch — carried to `knowledge-architecture` at planning close.

**User-facing impact.** Adopters who sync will see a shorter, rule-denser `DEV-RULES.ARC` with one new section and
a small marker vocabulary. Nothing they configure changes, and no migration is required; the pre-public-release
compatibility posture applies, so no back-compat aliases are added for the renamed or reseated sections.

## Success Criteria

1. **Derivation.** Each of the six prior enactments, all three recorded live failures (the typo-invalidated review,
   the `run-errand` merge capability read as withheld, and § Quality gate failure applied to a gate that never
   ran), and the **forgeable self-report** shape the corpus had been re-deciding per site each resolve from
   § Rule Authority with no new per-case rule written.

   **What "no new per-case rule" excludes, and what it does not.** Restating a derivable conclusion in a
   high-traffic rule's own text is permitted and is not a failure — the Introduction argues for exactly that, since
   a rule whose application depends on the reader supplying the derivation is applied inconsistently. The test is
   whether the restatement is _reachable_: could a reader reach the same answer from § Rule Authority **without**
   it? Yes → the restatement is ergonomic, and D7.2's never-ran limb is that case. No → the discriminator failed to
   derive what it claims to. Coverage is judged on reachability, never on whether a clause was written.

   **The reserved case tests limb independence, not corpus agreement.** Autonomous `WORKING-MEMORY` additions must
   resolve to _propose, do not self-add_ via backstop limb two, **against** the satisfaction test, which returns
   `default` on its own — so a backstop that cannot overturn its primary test is agreeing rather than deriving.
   Stated precisely: the corpus scopes the write to a ceremony (`strategy-session-operations` § Working Memory) and
   filters entry content (`session-handoff`), but it does **not** decide propose-versus-self-add anywhere. So this
   case checks the two limbs against each other, which is worth checking and is not corpus-independent evidence.
   **Goal 6's falsifiability rests on Criterion 2's governed-surface arm**, where the referents are rules this
   design did not author.

2. **Safety.** Two arms.
    - _Edited surface._ No bias-guard is cut or weakened in the surfaces the retrofit actually edits —
      `DEV-RULES.ARC`'s own imperative corpus and `DEV-RULES.PROJECT`. The merge-authority enumeration is the
      worked case of a bias-guard the register nearly cut. `integrate-work-unit` and `verify-work-unit` surviving
      unchanged remains the regression floor, but scoping the check to them alone would make it unfalsifiable.
    - _Governed surface._ Every rule-carrying workflow, method, extension, **and strategy** document (D9.1's
      corpus — 36, 25, 13, and 20 as currently measured, re-derived at execution) is read for imperatives the
      default-unless-marked reading would reclassify, and each found either takes a marker or is recorded as an
      accepted reclassification with its reasoning. The corpus matches D1's own enumeration exactly; a sweep
      narrower than the presumption would leave this arm asserting what it claims to check.

3. **Compression.** The **always-loaded set** ends net shorter — measured across every tier-1 surface this work
   unit touches: both rules files, `STRATEGY-INDEX`, _and_ `AGENT-BRIEF.ARC`, which D4 grows with three vocabulary
   definitions and shrinks by the D4.1 deletion. Measuring two files in isolation cannot detect a wash, and
   omitting the brief would leave the ledger open exactly where the constitutional half spends. The tier-1
   full-read set is fixed by the load-set projection — both briefs, both rules files, `STRATEGY-INDEX` — so the
   measurement boundary is a resolved fact, not a judgment. Beyond the net figure: every demoted line lands at a
   destination whose summoner fires,
   is operation-anchored rather than workflow-anchored (P3), and does not depend on the agent estimating its own
   state; **no constraint leaves the always-loaded set** (P1); and each demoted line carries a recorded
   constraint-or-not determination, so a violation is visible rather than inferred. That determination covers
   **D1's own text** as well as the register's rows (D1.6) — the addition is held to the standard the removals
   are, or the ledger is only audited on the side that shrinks.

   **And the summoner is scoped, not merely present (D5 test 5).** For every entry this work unit authors or
   rewrites, either no lean operational surface covers the common case, or the entry names the residual question
   and identifies the surface holding the rest. An entry failing this is not a compression: it charges the tier-1
   debit and relocates the read instead of removing it, so counting it toward the net figure would certify a wash
   as a credit. Falsifiable per entry — name the leaner surface, or show none exists. The same bound reaches the
   register rows routed behind such an entry, which may carry only what the scoped trigger actually reaches.

## Open Questions

Neither gates implementation.

- **The `execution-delegation-doctrine` vocabulary coupling.** The surface boundary is drawn — that work unit owns
  § Sub-agent scope, this one owns the model and every other section. What remains open is whether its rewrite
  expresses this discriminator or restates it locally. That is the sibling's authoring call, discharged by the
  planning-close coordination note rather than by this spec.
- **Which gate failures should name a fix command.** Routed to `quality-gate-hooks`. The set is unenumerated: the
  markdown gate wants `lint:md:fix` and `format:tables`, the TypeScript gate has no single remedy, and a gate whose
  fix is "read the output" should emit nothing rather than noise. Recorded here only because mechanism 3's
  viability rests on it, and no register row now depends on that mechanism beyond the ROADMAP row, which already
  fires.

---

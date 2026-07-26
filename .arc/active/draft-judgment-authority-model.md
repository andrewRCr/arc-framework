# Draft: judgment-authority-model

- **Origin:** [internal] — `USER-INBOX § Work Unit`, "Recognize judgment already exercised instead of
  re-litigating it", captured during errand `gate-tier-right-sizing` (PR #355) and the review-architecture
  discussion following it. Minted alongside `review-protocol-alignment` in the 2026-07-25 grooming session.
- **Purpose:** Give ARC a model for when its own procedure yields to judgment that has demonstrably already been
  exercised — so codification stops metastasizing into the half of the work `PROJECT-PRD` § Operational friction
  down, judgment friction up explicitly reserves for human and agent judgment.

- **State:** maturing — the constitutional core is settled and has survived two adversarial passes with only
  bounded text fixes. The compression half has now been composed against the prior art it originally re-derived,
  with one tier deferred to the work unit that owns the mechanism it needs.
- **Class:** `Heavy` — derivation runs high (a real design must be authored), but the read is _compose_, not
  _invent_: six existing enactments to generalize (see § The pattern). Scale and constitutional blast radius hold
  it there.

---

## Problem

One defect with three faces: **ARC treats its own procedure as authoritative over evidence that judgment has
already been applied.** `PROJECT-PRD` states the principle bidirectionally — codify the deterministic, _preserve
friction where judgment is required_ — and this is that principle violated in one direction.

This is **not an invention problem.** ARC has already made this decision, correctly, in at least six narrower
places and never generalized it. The defect is a **propagation gap**: the architecture layer already grants
bounded runtime judgment authority; the rules surface an agent actually loads at session-init does not.

### Face (a) — lane classification is single-axis

`classifyPlanningLane` (`change-facts.ts`) reads path-class only — the sole additional gate is
`isPlainPlanningContentChange`, a mode check hardening against symlink and mode tricks, not a second semantic
axis. There is no increment-count or gate-history signal. PR #355 classified `reviewed` correctly by path, but the
human disposition moment had already occurred — one increment, the developer present at the gate, two live
redirections mid-change. Review's job is to create a disposition moment; creating a second one over content that
already had one is ceremony.

The principled statement of the lane's purpose is **catch what the per-increment invariant structurally cannot
see** — aggregate and cross-increment effects. Where nothing escapes the increment view, the lane has no work.

**This face's remedy ships separately, as `planning-lane-relief`.** It is the only face that reaches code and the
only one gated on an unresolved unknown, and that asymmetry is what decomposed it out. It stays here as
_diagnosis_, because it is a third independent instance of the propagation gap and therefore evidence for the
model; its remedy design, the forgeability unknown, and the `procedure-evolution` P1 tension live in that work
unit's draft.

### Face (b) — the invariant/default distinction is enumerated, not derived

Symptom: an independent review returned findings containing a one-character typo, and the primary concluded "per
ARC this is invalidated, we must re-review." Absurd, and the agent knew it — the flaw was ARC's, for not letting
safe agent judgment win.

**Second symptom, same shape, on a rule whose text is right there.** An agent ran a focused test command with a
repository-relative path where the workspace expects a package-relative one. Vitest found no tests, nothing ran,
no code changed — and the agent stopped, reported, and asked whether to retry with the corrected filter. Asked why,
it identified the cause itself: it had applied § Quality gate failure's "ask for guidance" step to a mistyped
filter. No gate had produced a result, so there was nothing to have judgment about. The rule enumerates a procedure
for a failing gate without distinguishing a gate that **failed** from one that **never ran**, and the enumeration
was followed past the point where it made sense. Its remedy is a register rephrasing, not a new rule.

Worth recording alongside it: this failure mode is **not uniform across harnesses** — the observed instances
cluster where instruction-following is more literal. A rule whose correct application depends on the reader
supplying the derivation will be applied inconsistently, which is an argument for stating the derivation in the
text of high-traffic rules rather than trusting each reading to reconstruct it.

ARC does draw the distinction, in at least three recorded places, so the defect is not that it is missing:

- `adr-016` declares task-interlock and integration-interlock **invariant, not configurable**, while commit- and
  push-interlock are configurable.
- `adr-020` carries an explicit "invariant floor" and "scale grammar, never scale discipline."
- `DEV-RULES.ARC` carries eight `[configurable]` markers.

What is missing is narrower and more tractable:

- **Enumerated, not derived.** Each distinction was drawn by fiat, per domain. Nothing classifies a rule that
  carries no marker — including the 33 `never` / `must not` sites in `DEV-RULES.ARC` alone.
- **Config-time, not runtime.** `[configurable]` means a rule yields to a _project setting_. Nothing says a rule
  yields to in-the-moment judgment, however well-evidenced.

The discriminator that derives what was previously enumerated: does the rule exist because the agent might be
**wrong** (ignorance-guarding → _default_; yields when the agent demonstrably does know, because the rule's
purpose is already served) or because the agent might be **biased** (bias-guarding → _invariant_; never yields,
because the agent's certainty is the thing being checked)? Judgment can fix wrongness; it cannot fix bias.

**The ignorance-guard arm carries a dischargeability qualifier**, without which the split misclassifies a third
shape: a rule guarding an ignorance the agent can **never** discharge, because the missing fact lives in another
mind and has not been uttered. It is ignorance-guarding by construction, yet it behaves as an invariant —
"demonstrably knows" is unreachable in principle, not merely unmet today. So the arm asks whether the ignorance is
**dischargeable by the agent** (a default) or **structurally undischargeable** (an invariant).

The worked instance is `review-protocol-alignment` concern 8: the `adversarial-review` fire points at the three
planning stages must obtain the developer's agreement before firing even under opt-in at threshold, while the
verification and integration fire points may autofire once opted in. The rule it derives — **a stop is required
wherever the completion signal is not fully observable in the artifact** — is exactly this shape. Verification's
trigger is on disk, so the agent holds what the developer holds; whether a draft is _done_ depends on intent not
yet spoken, which no artifact carries and no readiness read can reach. That grooming session produced its own
proof: a ninth concern existed only in the developer's head while every artifact-based readiness signal read
ready.

This case also bounds the disclosure obligation. "Disclosure, not obstruction" presumes something to disclose;
where the ignorance is undischargeable there is nothing to state, and the remedy is to **obtain the missing
input** — ask — rather than to proceed with a note.

### Face (c) — the rules carry no runtime override, and nothing resolves whose call it is

`DEV-RULES.ARC` mentions `override` at three loci — the `[configurable]` project settings, the method `.override` /
`override-mode` contract, and a pointer to method defaults. All are config- or load-time. Nothing says an
operator's explicit in-the-moment direction governs. Config-time override is the wrong instrument for "this
instance is obviously fine" — nobody should permanently reconfigure a project because one typo was immaterial.

**This is an internal inconsistency, not a divergence from industry idiom** — a framing worth recording, because
the opposite reading is the intuitive one and re-raising it wastes a pass. `adr-029` (Right-Size Review Authority,
accepted 2026-07-24) already grants the operating agent bounded runtime judgment with a disclosure obligation:
"proceeds without a permission stop when confident, and discloses the choice. Material uncertainty, new authority,
or exceptional cost surfaces to the human." ARC's architecture layer already _holds_ the norm; the rules surface is
stricter than the ADR layer it is supposed to express. (Engaging the recorded rationale before raising idiom
divergence is itself required by `DEV-RULES.PROJECT` § Capture Routing.)

**Live instance from the minting session:** the `run-errand` reviewed-lane step reads "leave the PR open for owner
review," which the agent took as removing its authority to _perform_ the merge. The intent was that **approval**
is the owner's, not that the button-press is. A procedural line written to locate authority was read as
withholding capability — exactly the failure this face describes, arriving unprompted while grooming it.

### The pattern

Six enactments of one ungeneralized model, each paid for separately:

1. `adr-016` — interlocks sorted invariant vs configurable, by fiat.
2. `adr-020` — an invariant floor and a "scale grammar, never scale discipline" rule, enumerated.
3. `adr-029` — a three-tier authority split (CLI mechanics / agent bounded judgment / human mutation and
   commitment) with a disclosure obligation, scoped to review.
4. `process-task-loop` § Deferred review — the agent-proposed-batch clause spends a sentence reconciling itself
   with "the agent never self-invokes" ("the agent proposes the scope, the user approves, and that approval is the
   invocation"). A hand-written derivation of what a general model would yield for free. The adjacent "never
   **silently** widened" is the anti-escape-hatch mechanism, already latent.
5. `unit-scoped-review` — its break-out matrix says outright that its hard triggers are "already a mandatory stop
   in ARC, so this collects rather than invents." An enumeration of invariants, because nothing derives them.
6. `execution-delegation-doctrine` — owns a § Sub-agent scope rewrite characterized as **prohibition →
   conditions**, which is this discriminator applied to exactly one rule.

`knowledge-evolution` Principle 6 ("extract on fan-in, not aesthetics") is what authorizes the extraction: the
fan-in is demonstrated, repeatedly, not anticipated.

The fan-in is also still accumulating. Three of the instances recorded here — the `run-errand` merge capability,
the typo-invalidated review, and § Quality gate failure's mistyped filter — arrived **unprompted, during this work
unit's own grooming**, in sessions doing unrelated work. A defect that keeps producing fresh instances while being
designed against is not a historical observation.

A seventh enactment landed on base mid-grooming, and it is the compression half's doctrine rather than the
authority model's: an errand rewrote § Method and extension loading to load a declared method **at its
fire-point** instead of as a preload, and routed the rationale and marking guidance to the authoring strategy so
the always-loaded rules "end up shorter than before." That is constraint-stays / procedure-moves, with the same
justification, arrived at independently. The doctrine is being rediscovered per-site because nothing states it
once.

## The model

The load-bearing part is the anti-escape-hatch mechanism: **silent divergence is an escape hatch; stated
divergence is judgment.** An override names the rule and why its purpose is served anyway, surfaces where the
developer is already reading, and stays reversible in one turn. That does not skip the human — it informs them and
keeps the decision theirs. The agent's obligation becomes **disclosure, not obstruction**. This is `adr-029`'s
already-accepted shape, generalized off the review domain.

### The constitutional core (faces b + c)

A new `DEV-RULES.ARC` § Rule Authority, synthesized over three candidate tests — a purpose test (what does the
rule fear), a satisfaction test (what would discharge it), and a standing test (whose call is it). The
satisfaction test is primary: it is the only one that forces the disclosure as a byproduct, since a default cannot
be discharged without naming the fact, and the named fact _is_ the disclosure. It also fails safe on silence,
which matters most for the rules nobody thought about.

```markdown
## Rule Authority

Every rule ARC states — here, in a method, in a workflow, in a strategy — is a **default** unless marked
**invariant**. Marked or not, the reading below classifies it.

**Reading an unmarked rule.** Ask whether you can name a fact that, if true, means the rule's concern
does not arise here.

- You can name one, and it is yours to establish → the rule is a **default**. Discharge it as below.
- No fact you could produce would settle it — what is in doubt is you, not the facts → **invariant**.
- The fact that would settle it is not yours to establish — it lives with someone else and has not been
  said → **invariant**. Ask for it; do not infer it.
- You can name nothing → **invariant**. Naming nothing settles nothing.

**Backstop.** Regardless of the above, a rule is invariant when it protects the integrity of a check, or
when it withholds an *authorization* rather than a *judgment* — a decision reserved to a person because
it commits them. Competence never transfers an authorization; it does not follow that the capability is
withheld too.

A rule **protects the integrity of a check** when the agent's own work is what the check examines —
quality gates, verification, review, and the commit and merge gates that admit work. The test is
structural, not topical: an agent is never the judge of whether the check on its own output applies.

An invariant is **not discharged by an operator's reaffirmation**, and not by a host harness's rule that
operator reaffirmation is decisive. Reaffirmation settles a default (above); against an invariant it is a
conflict, and a conflict surfaces rather than resolves silently.

**Discharging a default.** Silent divergence is an escape hatch; stated divergence is judgment. Name the
rule and the fact that discharges it, surface it where the developer is already reading — the gate or the
completion report, never a log — leave it reversible in one turn, and proceed. Raise it once: a
reaffirmation is a decision, not an invitation to re-raise. The obligation is disclosure, not obstruction.

**Whose call.** Authority to discharge a default resolves from two inputs the session already holds — the
actor's role and the surface the rule governs. No rule declares its own authority. The owner of the
governed surface may discharge a default over it; a default governing a surface with no single owner, or
governing the project's own standards, is the maintainer's. Where one person holds every role this is full
latitude with no special case; where roles are distributed, the same resolution is enforcement.
```

**Why the backstop is load-bearing.** No single test classifies the corpus. Probed against four rules, the
satisfaction and standing tests both wrongly release `--no-verify` — a hook failure on an untouched file is a
nameable, checkable fact, and skipping the hook reads as a judgment rather than an authorization. Only the purpose
test catches it, and for the right reason: an agent that wants to commit is structurally the wrong judge of
whether the commit check applies to it. The backstop's first limb generalizes that. Its second limb carries the
`run-errand` fix directly, separating a withheld **authorization** (the owner's approval) from a withheld
**capability** (performing the merge) — the distinction the standing test read straight off.

**Why no per-rule authority vocabulary.** The obvious alternative is each overridable rule declaring an override
authority — `owner` (the WU/path owner) / `maintainer` / `policy` (nobody at runtime). The substrate exists
(`arc.role`, per-WU `Owner`), and it collapses cleanly for a solo developer, who owns everything and therefore
gets maximal latitude with no special case. Probed against ~10 candidate defaults — task granularity, quality-gate
failure, test-first, placement proposal, line length, commit format, package-sync, sub-agent execution relaxation,
doc boundaries — role × governed-surface returned the right authority every time, with no counterexample. Two
findings then retired the vocabulary outright:

- **`policy` is redundant.** A default nobody may override at runtime _is_ an invariant. Three values collapse to
  the existing binary.
- **The backstop absorbs the case that would have justified `maintainer`.** The obvious counterexample is the
  quality-gate zero-tolerance rule, which a WU owner should not be able to wave — but it protects the integrity of
  a check, so backstop limb one makes it invariant and it never reaches the authority question.

So the declaration is enumeration this work unit's own thesis says to drop, and dropping it keeps the
solo-collapses-cleanly property. **The retirement rests on those two findings alone** — an earlier version also
claimed `procedure-evolution` P2 forbade the markup, which overread P2 (see § Forward-compat); the argument stands
without it. Limit worth stating: ~10 of ~33 imperatives, classified by judgment. The full probe belongs in the
retrofit pass, and a counterexample found later argues for one narrow marker, not for reinstating the vocabulary.

### The anchoring ADR

An ADR that anchors `adr-016`, `adr-020`, and `adr-029` under one model — generalizing, not superseding.

It carries the **rationale** for cross-harness precedence — ARC sits on top of harnesses with their own authority
models while claiming harness-agnosticism (`PROJECT-PRD`; `adr-005`, `adr-006`), and at least one host harness
states the operator-reaffirmation-is-decisive norm as a first-class rule. The **rule** itself does not live here.
An earlier reading placed it in the ADR alone, reasoning that the case arises rarely and the always-loaded set is
what this work unit is shrinking. That is placement by frequency, which `knowledge-evolution` P1 replaces with
miss-cost — and it fails the placement test three ways: the rule governs the _invariant_ class, so its miss-cost is
an entire class becoming bypassable; ADRs are summoned by nothing (no always-loaded surface references `adr/` at
all); and P1's named anti-pattern is burying an invariant in an on-demand document because that document "owns the
domain." The limb now sits in § Rule Authority's backstop, which is this document's own constraint-stays /
rationale-moves split applied to itself.

### Retrofit posture: derivation-first, marker-as-exception

Do not annotate 26 methods and 36 workflows. Rules are `default` unless marked `invariant`; the discriminator
classifies the unmarked. The initial marker footprint is small — the two invariant interlocks, `adr-020`'s floor,
and the genuinely bias-guarding nevers (`--no-verify`, integration approval, amending pushed commits). Precedent
supports concentrating the vocabulary: `[configurable]` lives in exactly one file today.

**The undischargeable-ignorance shape is the retrofit's known hazard.** Rules of that shape carry no marker today
and read as ignorance-guards, so a sweep that applies only the wrong-versus-biased split would classify them
`default` — wrong, and wrong in the permissive direction. The dischargeability question above is what the sweep
must actually ask; where the answer is not obvious from the rule's text, that is a marker's job rather than a
judgment left to each reading.

## Rule-surface compression

A deliberate widening: the same document set, worked harder, for a tighter result. Both rules files have been
appended to across the project's life and never reconsidered, and they load every session. Fanning out to more
files would be bloat; more passes over these two is not. Four tests below decide what may move, and the register
that follows is **bounded and enumerated** so it cannot quietly expand into an open audit mandate.

### What model progress erodes

Model progress erodes **capability rules** and does nothing to **preference or authority rules**.

- A _capability_ rule tells the agent how to be good at something — how to decompose, how to search before
  assuming, how many files is too many. Each is a bet against the model, and each release settles it further
  against the author.
- A _preference or authority_ rule says what the developer wants and who decides. "Merge requires explicit human
  authorization" is derivable from nothing in the codebase; it is a choice about where the human stands. No amount
  of capability touches it.

Published guidance points the same way. Anthropic's 2026 context-engineering note removes prescription, worked
examples ("giving examples actually constrains them"), and duplication, while explicitly preserving "particular
opinions, knowledge, or best practices that are particular to you, your team, or product" — this corpus's entire
content class.

One asymmetry that guidance does not address: a **system prompt** ships to every user and every task and cannot
know the context, so it must be small. These rules are per-project, authored by the person they bind, and
revisable in a commit. "A universal prompt should be minimal" does not generalize to "a project's rules should be
minimal" — the system prompt is small because it is ignorant; these exist because they are not.

### The cut test — loud versus quiet failure

"Easy to revert" holds only where a removed rule fails **loudly**. A gate that stops firing is noticed the same
session; a scope that widens ten percent per session is not noticed for months, and is then misattributed to model
drift.

The discriminator sorts this, which is a strong argument for its shape:

- **Ignorance-guards fail loudly** — the agent is wrong and it shows. Model progress is exactly the evidence that
  discharges them. **Cut aggressively.**
- **Bias-guards fail quietly** — the agent is confident and nothing looks off. A better model is more confident,
  not less structurally interested; capability is not the variable they track. **Never cut, at any capability.**

Never-cut does not mean never-rephrase: correcting a rule's scope is not weakening it.

### Who is the reader — the audience test

Distinct from constraint-versus-explanation. `DEV-RULES.ARC` is read by the agent every session, so **content
addressed to the human is misplaced there regardless of how load-bearing it is**. The distinction is subtler than
it looks: "the agent must not initiate handoff" is agent-facing even though its subject is the human's role. What
fails is content whose _reader_ is the human — decision support, taxonomies for a human judgment call, procedure
the human runs.

Demoted human-facing content goes to `strategies/`. **Not `docs/`** — that surface is stale and deliberately
frozen pending a full rewrite once the backlog settles; routing there would widen it.

### What can leave — composing the existing demotion precondition

An earlier version of this section invented a three-mechanism "summoning test" and declared it closed. That was
the compression half's central error: **this question was already investigated and settled.**
`analysis-load-set-scoping` — a retired planning investigation whose findings "survived two fresh-context
adversarial passes" — owns the precondition; `loadset-composition` owns the adherence bands and the demotion
decision rule its own draft calls "the WU's durable contribution." Compose with them rather than re-deriving
something narrower.

**The precondition, as already established.** A demotion is safe when **either** clause holds:

- **(a) Reachability** — a correctly-scoped trigger for the content lives in a document itself loaded where the
  content is needed. Existence is checkable; correct _scoping_ is an authoring judgment no check can make.
- **(b) Never-needed** — two sub-cases of unequal strength. **Redundancy:** the load-bearing content is duplicated
  by an undemotable entry already loaded there — verifiable by comparing two documents, and strong.
  **Irrelevance:** the work at that position does not touch the content at all.

Clause (b) is what makes trigger-less content demotable at all, and it legitimizes this register's two cleanest
dispositions, neither of which the invented test could express: the tables of contents are **irrelevance** cuts,
and the quality-gate command listing is a **redundancy** demotion that the setup workflow already codifies
("quality gate _standards_ are defined in `DEV-RULES.PROJECT`, quality gate _commands_ are defined in
`QUICK-REFERENCE`") — so that row corrects a drift rather than inventing a placement.

Clause (b) also carries a **recorded unresolved defect** anyone adopting it must settle: irrelevance was drafted as
requiring two independent signals, the second of which is unproducible for a trigger-less entry — exactly the class
clause (b) exists to serve. Settling it is part of adopting the precondition, not a separate concern.

**The bar on clause (a) is an explicit trigger, not awareness.** Measured recognition bands: always-present ~100%,
**explicit trigger 85–95%**, indexed / implicit awareness 60–75%, search discovery 20–40%.
`knowledge-evolution` P10 states the consequence — "demotion from always-loaded goes only to an _explicit
trigger_" — and `loadset-composition` records implicit awareness as **rejected**: "60–75% recognition." An explicit
trigger is P2-shaped ("ALWAYS load X when {trigger}; do not {default} directly"); a passive "Consult when:" line is
the 60–75% band in a trigger costume.

**Two failure modes, not one.** A demotion fails as **unsafe** — no trigger, or the content is a constraint — or as
**pointless**: safe, but the trigger fires about as often as the load would have, so the read relocates instead of
disappearing. The generalizable fix on record: **where a lean operational surface covers the common case, the
deeper surface's trigger must name the _residual_ question, not the domain.** Pointlessness is a property of the
position, not of the content.

**Four destination mechanisms exist, and the fourth is the one this register most needed.**

1. **Fire-site declaration** — a frontmatter declaration resolved by the CLI at the point of use.
2. **Explicit-trigger index entry** — a `STRATEGY-INDEX` line authored to P2 strength. A passive entry does not
   qualify; re-authoring one is part of the work rather than a prerequisite outside it.
3. **Emitted remedy** — the failing gate, hook, or CLI output names its own fix.
4. **Domain rules** — `DEV-RULES.{DOMAIN}.md`, resolved by the CLI into the session probe's `domainRules` slot and
   loaded on demand when work touches the domain. Built, wired, carrying its own contract check, and **entirely
   unused**: zero such files exist.

Mechanism 4 changes the register's shape, because it is the only destination that can take a **constraint**. P1
permits a constraint at the fire site gating the operation it protects, and a domain-conditional rules file loaded
when that domain is in scope is that fire site. The limit is strict: it holds only for a constraint whose bite is
bounded by the domain that triggers the load, and a universal constraint has no such boundary and stays. The prior
analysis reaches the same verdict from the other side — "a rule that proves position-conditional is evidence it
should move to a domain-rules file — a content-placement call."

**Two further bounds on trigger choice.** `knowledge-evolution` **P3** — anchor triggers to operations, not
workflows — disqualifies a destination whose trigger fires only inside the workflow hosting the operation, since
ad-hoc invocation is the case the rule usually exists for. And **a trigger must not fire on a signal the agent
estimates badly**: "consult when mid-session under context pressure" asks the agent to notice its own degradation,
which register cut 5 rejects as unreliable in the same breath.

Specifically **no new command-reference doc surface** — `knowledge-evolution` P7 prohibits it, and the awareness
instinct it answers is served by mechanism 3. Where nothing qualifies, the content stays: the precondition is a
permission to demote, never an obligation.

### Constraints only — the always-loaded target

`knowledge-evolution` P1 settles the half of progressive disclosure that matters here: constraints never go
on-demand, because a reader does not know to look for the rule they are about to violate. So the redistribution is
not "fewer rules, found later" — it is **the always-loaded set shrinks to constraints only, and everything
explanatory, procedural, or exemplary demotes.** The result is a substantially shorter `DEV-RULES.ARC` that is
_more_ rule-dense.

### The surface, measured and itemized

A section-level enumeration ran over both files — mechanical per-heading line counts, then a disposition per
section under the tests above. The full table lives in `notes-judgment-authority-model.md`.

**Unit of record: nonblank lines.** An earlier coarse pass measured raw lines (~196 of 570 in `DEV-RULES.ARC`,
~119 of 341 in `DEV-RULES.PROJECT`) and read as "about a third of each." The itemization counts nonblank lines,
which is what a disposition actually moves, and the two are not comparable: the register is **187 nb of
`DEV-RULES.ARC`'s 418 (~45%)** and **131 of `DEV-RULES.PROJECT`'s 261 (~50%)** — roughly half of each file's
substantive content rather than a third.

**Sized in two columns, because only one of them ships.** `DEV-RULES.ARC` is a Framework file: the package source
and the project instance are byte-identical, so its ~187 nb of edits reach every project. `DEV-RULES.PROJECT`
ships as a 175-line fill-in template — "filled during project definition" — against this repo's 341-line
instance, and its § Quality Gates carries none of this repo's numbered entries. So **all 131 nb of that half, 41%
of the register, is this instance's own file.** The destinations compound it: the project strategies receiving the
package-sync demotion do not ship at all, and `QUICK-REFERENCE` ships as a placeholder template.
`loadset-composition` names this trap precisely — relocating this repo's content between two surfaces adopters
fill themselves "is **instance hygiene** … It must not be mistaken for a structural win."

That reframes fold-versus-defer rather than settling it: the canonical half changes the framework for every
project, while the instance half changes one repo's file and is gated on a maintainer's read. The two are not
co-equal and should not be sized as one number.

| Tier                                | Canonical (`ARC`)              | Instance (`PROJECT`) | What it is                                                                        |
| ----------------------------------- | ------------------------------ | -------------------- | --------------------------------------------------------------------------------- |
| **Cuts and redundancy demotions**   | ~16                            | ~18                  | Clause (b): irrelevance and verified duplication. The firm tier.                  |
| **Behind a trigger re-authoring**   | ~103 (both files, mechanism 2) |                      | Passive index entries needing P2-strength rewrites before they qualify.           |
| **Pointless as routed**             | ~30+                           | —                    | Workflow destinations read by the same sessions; relocation, not removal.         |
| **Deferred to `rules-restructure`** | ~49                            | —                    | § Documentation Boundaries family — mechanism 4 is that WU's; moved nowhere here. |
| **Blocked**                         | ~17                            | —                    | § When to Load Additional Guidance.                                               |

Every figure is provisional and the tiers no longer sum cleanly to the register, which is the honest state: the
re-audit below has not run, and three of these tiers were created by discovering that the earlier
committable/gated split rested on a test that did not hold. What the derivation establishes is the **shape** —
firm cuts are a small fraction, most of the surface is behind trigger work, and a meaningful slice is either
pointless as routed or belongs to a mechanism another work unit owns.

Findings that carry design weight beyond the tiers:

- **The register misclassified its own largest rows, in the permissive direction.** Three dispositions in
  § Commit control (~21 nb) routed to a "routing method" that does not exist — no method in `system/methods/`
  covers release or class-tag routing, and `strategy-interlock-release-wrappers` exists but carries no
  `STRATEGY-INDEX` entry. The demotion is real but its destination must be created, and the class-authorization
  preconditions inside that block are not prose and do not demote at all.
- **The quality-gate command listing is a clause-(b) redundancy demotion, not emission work.**
  `quality-gate-commands` already fires from `process-task-loop`'s frontmatter, but its body is a **passthrough**
  reading "commands specified in `DEV-RULES.PROJECT` § Quality Gates," so emptying that section breaks the declared
  fire site: the demotion is a one-line retarget. Only the _commands_ may go — `QUICK-REFERENCE` does not carry the
  index-versus-worktree false-green trap, the re-stage-after-fix rule, `lint:md`'s fails-closed behavior, or "run
  both before declaring types green," all quiet-failing constraints.
- **Emitted remedy carries only the ROADMAP row.** CHECK 17 already emits its remedy verbatim while the markdown
  and TypeScript gates emit none, so that row demotes today — but ~4 nb does not justify taking gate-emission work
  into scope. It leaves; see § Scope.
- **§ When to Load Additional Guidance is 24 lines, not 43** — an earlier count swept in the file's trailing link
  block. Still blocked under mechanism 4's limit: it is a universal pointer index, not domain-bound.
- **§ Sub-agent scope is the one section this work unit must not touch** (see § Composition / Coordination).

### The P1 re-audit

The enumeration applied the audience and summoning tests but did not consistently apply `knowledge-evolution` P1,
and several dispositions demote **constraints** — which P1 forbids outright and which success signal 3 promises not
to do. The identified cases stay always-loaded:

- The four quality-gate constraints above.
- § Session Management's boundary procedure, whose second step is a **mandatory stop** ("stop and ask"). P1 names
  index-only placement as disqualifying for exactly this.
- § Discovered Work Routing's express-lane permission ("never must… lack of time is never a reason to lose a
  thought"). Its candidate destinations fire when the agent _uses_ the inbox — not on the path the permission
  governs. This is the merge-authority inversion below, in a second place.
- § Verify before assuming's "stop and ask" step, which register cut 4 would remove with the numbered steps.
- The class-authorization preconditions in § Commit control.

**The lesson is procedural, not per-row:** a disposition needs a constraint-or-not determination _before_ a
destination is chosen, because the summoning test cannot license what P1 forbids. The spec's own pass carries that
column explicitly.

### Constraint stays, procedure moves

Several universal rules are really domain concerns that landed in the universal file. The fix is a split, not a
relocation: **the universal states the obligation; the owning workflow states the site.** Written that way, it
also resolves the tension with workflows that declare their own interlocks as the only human stops — one says a
gate must exist, the other says where it fires.

Relocating wholesale would break P1. Merge authority is the worked case: its entire job is to stop a merge when
the agent is _not_ in an integration workflow — a mid-execution "ship it", an errand PR, the auto-merge lane — so
loading it only during integration removes it exactly where it works.

### Gate versus granularity

The review-increment invariant bundles two claims that must now separate:

- **A gate exists** — every review increment closes with a structured approval gate before commit.
  Scope-invariant, true at leaf, phase, or WU width. Stays universal and unqualified.
- **The increment is one leaf** — a granularity setting, no longer the observed default. Becomes a named
  **floor**: the fallback when nothing wider is authorized, and the right setting for a tricky change or one the
  developer wants to stay close to.

§ Review-Increment Invariant is already scope-agnostic and needs no change. The leaf-binding lives in § Task
Execution → Task interlock and in `AGENT-BRIEF.ARC`'s vocabulary entry ("default boundary: one leaf task"); both
want `default` → `floor` plus an explicit boundary parameter. That is exactly the parametrization
`unit-scoped-review` asks for, so the rephrasing is forward-compatible by construction and does not do that work
unit's work. Frequency of use at the finest setting is not evidence about the gate's necessity — under deferred
review the gate fires at a wider boundary, which is why `unit-scoped-review` must invent a break-out matrix and
deviation ledger to keep it honest there.

### The bounded register

Cuts, ranked:

1. `DEV-RULES.PROJECT` § Code Quality Principles — "DRY, SOLID, KISS, YAGNI". Four acronyms, no
   project-specificity, nothing actionable. The TypeScript standards beneath it are specific and stay.
2. `DEV-RULES.ARC` § Task granularity — the numeric thresholds (>3 files, >50 lines). Proxies standing in for "is
   this one coherent increment"; they cause more bad decompositions than they prevent. Keep the principle.
3. § Quality gate failure — **moved to Rephrasings below.** An earlier reading wrote steps 1–3 off as baseline
   competence; the second live instance in § Face (b) shows they are a conflation of two different failures plus a
   default in the wrong mood, which is a rewrite rather than a cut.
4. § Verify before assuming — same shape, with one carve-out: the "stop and ask" step is a constraint and stays,
   as does the "Never generate or assume" list beneath it. Only the search-first and ask-clarifying steps go.
5. § Context quality — worked in full as the audience test's first case:
    - **Keep** the opening line ("never degrade work quality or change approach due to context pressure") —
      agent-facing, bias-guarding, quiet-failing. One line, unqualified.
    - **Keep** the boundary procedure. Its second step is a mandatory stop, and the only trigger that would
      summon it from a strategy fires on the agent's estimate of its own context pressure — the signal the next
      bullet rejects as unreliable. Demoting it would lose a stop behind a trigger that cannot fire honestly.
    - **Demote** the boundary taxonomy — the four categories of what counts as a natural boundary — to
      `strategy-session-operations`, behind that entry's trigger amendment. Decision support for a human
      judgment call, and nothing about it stops anything.
    - **Cut** the "quality signals" bullet outright. It asks the agent to notice "output becoming less precise,
      early-session guidance being missed, re-deriving decisions already established" — self-assessment of one's
      own degradation, which is the forgeable-self-report shape named in § Open questions. An agent reliable
      enough to detect its own drift would not be drifting. Do not ship a rule that depends on a capability this
      draft argues elsewhere does not exist.
    - **Do not replace it with a behavioral rule.** The handoff nudge fires on a signal the agent estimates badly
      (its own utilization) while the harness knows it mechanically; if the nudge is wanted it belongs to
      mechanism 3, not agent introspection. Leaving it unmandated still permits reporting an obvious structural
      boundary — that is state, not a guess.
6. Both files' **tables of contents** — 22 lines combined, and the cheapest item here. Each file is loaded whole
   at session-init, and `§` reference resolution never consults them, so the content is navigation for a human
   scanner in a surface whose reader is the agent. Structural rather than a judgment about what the reader still
   needs, so it sits outside the caveat below.

Rephrasings:

- § Quality gate failure — the worked case for a rule the model rewrites rather than trims, and the one register
  item with a demonstrated misapplication behind it. Three failures hide under one heading, and the rule's four
  steps address only the middle one:
    - **A gate that never ran is not a gate failure.** A mistyped filter, wrong path, wrong working directory, or
      missing dependency produces no result and teaches nothing about the code. Correct the invocation and re-run;
      there is nothing here to report or decide. Stating this is the fix for the recorded instance.
    - **A red gate whose cause is this increment, with the fix inside its scope**, is finished by fixing it.
      Resolving it _is_ completing the work, and the increment's own approval gate is where the developer sees it.
      This is the default: name the fact — the failure is mine and the fix is in scope — and proceed.
    - **A red gate whose resolution is a scope decision** — pre-existing, another surface, or a fix that widens the
      change — is the developer's call, and § Anti-rider already says a distinct concern does not ride along. The
      stop belongs here and only here.
  What survives as invariant is narrower than the current step 4 and stronger: **a red gate never becomes a green
  report, and is never bypassed.** That is backstop limb one — the check examines the agent's own output, so the
  agent does not get to rule on whether it applies. "Do not advance to the next task" needs no separate statement;
  the review-increment invariant already owns the boundary.
- § Review-Increment Invariant ¶2 — five exempted operations packed into one sentence; slow to parse, and pure
  enumeration where the discriminator would derive. Restructure as a list at minimum.
- § Discovered Work Routing — "always propose placement to the user before acting" contradicts the inline-fix
  permission two lines above it. Under the model, a same-concern cleanup in a file already under edit is a
  discharged default, and proposing it is the ceremony this work unit exists to remove.
- § Commit control, merge authority — oddly seated under commit control; reseat it. **The enumeration of what does
  not count as authorization stays** (task approval, review completion, passing checks, general "proceed"
  language). The tempting reading is that the discriminator derives it, since a bias-guard yields to no inference —
  but classifying the rule `invariant` establishes only that an authorization is _required_. It does not tell the
  agent that a general "proceed" is not that authorization, which is the specific inference path the enumeration
  forecloses. Cutting it loses required behavior, and the cut test forbids cutting a bias-guard at any capability.
  The _procedure_ still moves to `integrate-work-unit`.
- `DEV-RULES.PROJECT` § Selecting what to run is the **exemplar** — named purpose, derivation rule, explicit
  fail-safe ("the deciding is not worth more than the checks cost"). Cite it as the target shape; change nothing.

**Author's-interest caveat.** Cuts 2–5, and roughly ten further compress-in-place verdicts recorded in the notes
companion, are judgments about what current agents no longer need, made by an interested party — the backstop
clause calls exactly that structurally suspect. They are candidates for the maintainer's read, not findings, and
§ Open questions places that read as a gate at spec discovery rather than leaving it as an unowned caveat.

The register above stays the **named** set; the enumeration's full per-section disposition stays in the notes
companion. That division is what keeps the surface bounded — a line-level table cannot widen into an audit mandate
the way a share-of-file percentage can.

## Forward-compat

Both project check-docs fire on this work unit. Tensions surfaced during authoring per their self-checks:

### `strategy-knowledge-evolution`

- **P1 (constraints never go on-demand)** — validates placing the model in always-loaded `DEV-RULES.ARC` rather
  than a strategy. Confirms placement.
- **P3 (anchor triggers to operations, not workflows)** — bites on roughly a fifth of the register. Five
  destinations are workflows (`process-task-loop`, `session-handoff`, `run-errand`, `drain-inbox`,
  `integrate-work-unit`), and P3's stated failure mode is that a workflow-anchored trigger silently misses ad-hoc
  invocation. That is this document's own merge-authority worked case, generalized: `run-errand` is a workflow, and
  "never hand-rolled on your current WU branch" exists precisely for the agent who is _not_ running it. Each such
  destination needs an operation-anchored trigger, or the content stays. Folded into the summoning test above.
- **P6 (extract on fan-in)** — authorizes the extraction; see § The pattern.
- **P10 (don't grow the always-loaded set casually)** — two clauses, and an earlier reading engaged only the first.
    - _Growth._ `DEV-RULES.ARC` is always-loaded and already large. The justification to make explicitly, not
      assume: this is a **meta-rule that makes the other 33 imperatives correctly interpretable**, so it plausibly
      reduces effective instruction load rather than adding to it. `loadset-composition` owns the T1 boundary this
      argues against.
    - _Demotion._ "Demotion from always-loaded goes only to an _explicit trigger_, and constraints are never
      demoted." This clause governs the entire compression half and went unengaged through two adversarial passes,
      which is how five constraint demotions and ~103 nb routed to implicit awareness survived to the second. It is
      now the bar in § What can leave.

### `strategy-procedure-evolution`

- **P2 (agent-interpreted markup never grows control flow)** — engaged precisely, because an earlier reading of it
  was too strong and the draft contradicted itself. P2 prohibits "conditionals, loops, or expression syntax in
  markup the agent evaluates" and holds that deterministic semantics belong in the engine. A one-bit `invariant`
  tag is none of those, and `[configurable]` is live precedent for a classification marker in this very file. So
  the marker retrofit is **permitted**; what P2 rules out is a vocabulary the agent must evaluate against session
  state to reach a consequence. That is the correct objection to the retired `owner` / `maintainer` / `policy`
  declaration — but it is a weaker argument than the two below, since the resolution turns out to be computable
  from role × surface, and it is not the reason the vocabulary was dropped.
- **P1 (if the CLI can compute it, the CLI computes it)** — no live tension here: it applies to lane relief, which
  ships as `planning-lane-relief`. This work unit's compression edits move _toward_ P1, building the
  emitted-remedy mechanism rather than asking the agent to remember a command.
- **P5 (evals gate the prose layer)** — the tension this work unit cannot discharge itself. P5 holds that judgment
  prose cannot be statically verified, so behavioral regression tests are its only correctness instrument, and this
  is the largest judgment-layer rewrite the corpus has attempted. All three success signals are inspection-based,
  which P5 says is not the instrument. **Recorded as an accepted deviation, not an oversight:** P5 names
  `workflow-eval-harness` as its owner and that harness does not exist, so no eval coverage is available to gate
  this. The consequence to state plainly is that the discriminator's real failure mode — being misread in practice
  rather than being wrong on paper — is undetected until that harness lands, and this section is the natural first
  eval subject when it does.
- **P6 (emitted text is precomposed CLI-side)** — bears on the one remedy this work unit still demotes behind
  emission. The `ROADMAP` precedent (CHECK 17) is a shell `echo` in a hook, which is the pattern P6 argues against;
  a new emission belongs in the CLI's precomposed-text layer rather than a second hook-side template. Bounded, and
  it reinforces the decision to leave gate-emission work out of this deliverable.
- **P7 (controlled vocabulary)** — `invariant`, `default`, and `dischargeable` (of an ignorance-guard) are
  load-bearing terms; each earns a briefs-vocabulary definition before use. "Protects the integrity of a check" is
  bounded inline in the section text rather than minted as a term.

## Corpus sweep

A prose sweep across `process-task-loop`, `integrate-work-unit`, `verify-work-unit`, and `init-work-unit` confirms
the corpus is **already largely consistent** with the model, which is evidence for the discriminator rather than
luck:

- `integrate-work-unit` has the highest density of imperatives (20+) and is the least affected — "never
  fabricated", "never treat advisory receipts as merge authority", "clearance and integration authority never
  carry", "never infer readiness from later products". All bias-guarding; all survive unchanged.
- `verify-work-unit` — "criterion text is immutable; never rewrite a criterion to match what was built" is a
  textbook bias-guard.
- `init-work-unit` — its nevers are format and shape constraints, not authority rules. Out of scope.

A discriminator that demanded rewriting `integrate-work-unit` would be the wrong discriminator.

Two narrower target classes remain:

- **Authority located, capability withheld** — the `run-errand` reviewed-lane shape. Cheap prose corrections.
- **Hand-written reconciliations** — `process-task-loop`'s agent-proposed-batch clause. These are the sites that
  already paid for the missing model in bespoke prose; each is a candidate for derivation once the model lands.
- **Enumerated procedure read as a mandatory stop** — § Quality gate failure is the recorded instance, and the
  class is the most likely to recur, since an enumeration invites completion. The tell is a step whose purpose is
  already served by the situation the agent is in. Search for it wherever a rule lists steps ending in a question
  to the developer; the fix is to state which failure the steps address, not to add a permission.

## Success signal

Three checks, each falsifiable by inspection when the work is done. They are the seed of the spec's success
criteria, and the second is load-bearing — the only one that can fail by the model being too permissive.

1. **Derivation.** Each of the six prior enactments, and both recorded live failures — the typo-invalidated
   review, the `run-errand` merge capability read as withheld — resolves from § Rule Authority with no new
   per-case rule written. If a case still needs its own clause, the discriminator does not derive what it claims
   to.
2. **Safety.** No bias-guard is cut or weakened **in the surfaces the retrofit actually edits** — `DEV-RULES.ARC`'s
   own imperative corpus and `DEV-RULES.PROJECT`, not only the untouched workflows. Scoping this check to
   `integrate-work-unit` and `verify-work-unit` would make it unfalsifiable, since § Corpus sweep already
   establishes those survive; the real test is the file the model is installed in, where the merge-authority
   enumeration is the worked case of a bias-guard the register nearly cut. Their survival still belongs in the
   check as the regression floor.
3. **Compression.** Both rules files end net shorter; every demoted line lands at a destination whose summoner
   fires, is operation-anchored rather than workflow-anchored (P3), and does not depend on the agent estimating
   its own state; and **no constraint leaves the always-loaded set** (P1). Each demoted line carries a recorded
   constraint-or-not determination, so a violation is visible rather than inferred.

## Open questions

One gates formalization, and it is the compression half's. The constitutional core carries none.

- **The register needs its constraint-or-not column before the deliverable is sized** (`needs-design`, owner: this
  work unit's spec discovery). The re-audit above identified five demotions that P1 forbids, found by attacking
  the register rather than by applying the tests in order, so the remainder is not yet trustworthy. Two things
  resolve together: every row gets an explicit constraint determination, and the **author's-interest items** —
  register cuts 2–5 plus roughly ten compress-in-place verdicts — get the maintainer's read that the caveat calls
  for. That read is a real gate at spec discovery, not a disposition recorded here; a cut to an always-loaded
  constitutional file is a design decision, not a variable name.

- **The forgeable self-report shape, named once.** An agent writing "human approved" into a record it also authors
  proves nothing, and in a chat harness there is no trace of the approval that is not agent-mediated. This work
  unit does not depend on solving it — the gate-history application left with `planning-lane-relief` — but it
  should **name the shape generally**, because the corpus keeps rediscovering it: `review-protocol-alignment`
  concern 6 rejected two candidate shapes for the `adversarial-review` `withstood` field on exactly this ground,
  and register cut 5 rejects the quality-signals bullet on it too. Both asked an untrusted party to attest its own
  rigor. Naming it once is this model's job; solving it for a machine-read classifier is not.
- **Which gate failures should name a fix command** — routed out to `quality-gate-hooks` (see § Scope). The set is
  unenumerated: the markdown gate wants `lint:md:fix` and `format:tables`, the TypeScript gate has no single
  remedy, and a gate whose fix is "read the output" should emit nothing rather than noise. Recorded here only
  because mechanism 3's viability rests on it.
- **The `execution-delegation-doctrine` vocabulary coupling** — see § Composition / Coordination. The surface
  boundary is drawn; the open half is whether that work unit's § Sub-agent scope rewrite expresses this
  discriminator or restates it locally.

## Composition / Coordination

- **`unit-scoped-review` — downstream consumer, not an upstream constraint.** The `approval-flow-refinement`
  cohort has already performed this exact extraction once: `execution-delegation-doctrine` was minted upstream out
  of `unit-scoped-review` on 2026-07-02, and the cohort record states that its orchestration architecture "becomes
  an instance of the doctrine's model rather than where the model is invented." Same shape here.
  `unit-scoped-review` is `planned`, hard-blocked on `commit-increments` (not landed), carries a further edge to
  `execution-delegation-doctrine`, and has not begun planning iteration — it has no settled model to constrain
  anything with. Its own content is visibly a consumer: an advisory eligibility predicate the human overrides
  freely, a deviation ledger that is the disclosure obligation at WU scope, and a break-out matrix that collects
  existing mandatory stops rather than deriving them. The one genuine coupling — what "gate history" means under a
  WU-scoped gate — left with `planning-lane-relief`, which should **specify** it rather than conform to it. Record
  **no `Depends On` edge in either direction**; mirror `execution-delegation-doctrine`'s position as a standalone
  upstream consumed by the cohort. Route the composition note via `USER-INBOX` at planning close rather than
  editing a sibling's draft.
- **`execution-delegation-doctrine` — genuine model overlap, with the surface boundary drawn.** It owns a
  § Sub-agent scope rewrite characterized as **prohibition → conditions**, which is this discriminator applied to
  one rule, plus a "two-half invariant (no judgment without a gate; no gate without a decision)". The compression
  enumeration settles the _surface_ half cleanly: § Sub-agent scope (18 lines) is the only section of either rules
  file this work unit must not touch — that one owns the section, this one owns the model and every other section,
  and the compression register is scoped accordingly. What remains is a **vocabulary** coupling, not a territorial
  one. Draw it before either authors the section; upstream-versus-siblings does not need settling to proceed,
  since neither is imminent.
- **`review-protocol-alignment` — downstream consumer, no hard edge.** Four of its judgment-layer concerns are
  informed by this model: the coarse post-fix review-applicability rule, the missing proposal-time
  `Post-fix review:` field, the two-stop author-response cycle, and the determinism-versus-judgment posture. It
  holds them in a later phase deliberately so it is not gated on this upstream. No `Depends On` edge in either
  direction.
- **Prior owners are all shipped** and cannot absorb this: `review-gate-right-sizing`, `review-architecture`, and
  `review-surface-binding`. Hence its own stub.

**The compression half's neighbours, and where the one real boundary falls.** An adversarial pass found the register
deciding questions with prior art, which is a composition failure rather than an ownership one. Composed, the
relationships are:

- **`analysis-load-set-scoping` is reference material, not an owner** — retired, no charter, findings that survived
  two adversarial passes. It supplies the two-clause demotion precondition, the unsafe-versus-pointless split, the
  residual-question rule, and the record that mechanism 4 is "built and entirely unused." The obligation was to
  compose with it, and that is discharged; there is no ongoing coordination.
- **`loadset-composition` (`planned`) works a different axis.** It decides which _documents_ are T1, and it
  explicitly **considered and rejected** demoting `DEV-RULES` — "constraints are the content you most want present."
  This work unit's compression is _intra-document_: what stays inside a file both agree is T1. It **applies** that
  WU's decision rule (demote only to an explicit trigger) rather than re-deciding it, and applying a rule is its
  intended use. No edge in either direction.
- **`rules-restructure` (`planned`) is the one genuine intersection, and it is bounded to one tier.** It owns the
  universal / bounded filename split and the wiring for on-demand domain rules. That is mechanism 4 — so the
  domain-rules tier (the § Documentation Boundaries family, ~49 nb) is **deferred to it and moved nowhere by this
  work unit**. Demoting that content to a strategy now would mean relocating it twice; minting
  `DEV-RULES.{DOMAIN}.md` files under today's naming would mean churn if that WU renames the pattern. Everything
  else in the register — cuts, redundancy demotions, trigger re-authoring, the rephrasings — is orthogonal to a
  filename convention.

  **The dependency runs the other way for the rest of it.** `rules-restructure` needs a predicate for _which_ rules
  may live in a bounded on-demand file, and this work unit supplies it: the invariant / default classification plus
  mechanism 4's limit — a constraint may sit behind a domain-conditional load only where its bite is bounded by the
  domain that triggers the load. Without that, the later work has to invent the same discriminator to know what is
  safe to move, which is the recurring pattern in § The pattern. Its disposition table and the shorter,
  rule-denser file it leaves behind are direct inputs. Record **no `Depends On` edge**; route a coordination note at
  planning close naming the deferred tier and the supplied predicate.

  One narrower coordination item: that WU's inbound buffer holds a progressive-disclosure rebalance touching
  § Discovered Work Routing and § Holding ≠ execution, which this register also disposes. Git merges the file; the
  risk is uncoordinated redesign of the same prose. Name it in the same note.

## Scope

Constitutional and **prose-dominant** — a new `DEV-RULES.ARC` section, one ADR carrying the cross-harness
precedence paragraph, a bounded marker retrofit, and a narrow prose sweep. Faces (b) and (c) are the one
constitutional deliverable; face (a) ships as `planning-lane-relief`.

Compression stays in scope, **minus the domain-rules tier**, which is deferred to `rules-restructure` and moved
nowhere here (see § Composition / Coordination). Its size is not settled — the systematic constraint-column pass
resolves it — but the derivation establishes the shape: a firm tier of ~34 nb in cuts and verified-redundancy
demotions, most of the remaining surface behind re-authoring passive index entries to explicit-trigger strength, and
~41% of the register sitting in an instance file no project inherits. Whatever stays also carries the destination
edits each demotion lands, one `STRATEGY-INDEX` entry for `strategy-interlock-release-wrappers`, and a one-line
retarget of `quality-gate-commands`' passthrough.

**Sequencing follows from the canonical / instance split**, not from ownership: the `DEV-RULES.ARC` half ships to
every project and pays out every session, so it folds; the `DEV-RULES.PROJECT` half is this repo's own file and is
gated on a maintainer's read, so it is the candidate to defer if the deliverable wants narrowing. That the file
loads every session is also why the interim matters — `rules-restructure` is not imminent, and a shorter,
correctly-classified always-loaded surface pays out for every session between now and then.

**No code surface is in scope.** Gate-emission work leaves the deliverable: its justification was that it licensed
the quality-gate demotion, and that demotion turns out to need a method retarget instead. What remains — which gate
failures should name a fix command — routes to `quality-gate-hooks`, which already owns index-safe auto-fix and
restage machinery, and it is where `procedure-evolution` P6's precomposed-text question belongs too.

## Continuity

- **Resolved:** the problem is a propagation gap, not an invention (six prior enactments identified); face (b)
  restated as enumerated-not-derived and config-time-not-runtime; face (c)'s idiom-divergence framing withdrawn in
  favor of an internal ADR-versus-rules inconsistency; `unit-scoped-review` established as downstream; deliverable
  shape settled to a `DEV-RULES.ARC` section plus an anchoring ADR; retrofit posture settled to derivation-first
  with markers as the exception; both forward-compat check-docs run with tensions recorded; `Class` ratcheted
  `Novel` → `Heavy` on the compose-not-invent read. **2026-07-26:** the discriminator settled as
  satisfaction-test-primary plus a two-limb backstop, probed against the corpus; the cutting doctrine settled as
  loud-versus-quiet with constraints-only as the always-loaded target; the placement doctrine settled as
  constraint-stays / procedure-moves, with gate-versus-granularity as its worked case; per-rule authority
  vocabulary dropped after a no-counterexample probe; the audience test and the three-mechanism summoning test
  added. The line-level enumeration then ran (`notes-judgment-authority-model.md`), confirming mechanism 3
  precedented in the hook layer, bounding trigger amendments at two, correcting one section measurement, and
  drawing the `execution-delegation-doctrine` surface boundary at § Sub-agent scope. Four readiness decisions
  closed it out: face (a) decomposed to `planning-lane-relief` (promoted to `planned`, `Class: Heavy`),
  emitted-remedy work and both trigger amendments taken into scope (~305 lines), cross-harness precedence placed
  in the ADR, and a three-part success signal adopted. The draft was then consolidated — superseded sketch
  removed, two measurement passes merged, dated-layer narration moved here. **Adversarial pass one** then ran the
  readiness, proportionality, and design-audit rubrics from fresh context and returned ten confirmed findings, all
  in the compression half and at the core's definitional edges. Dispositions applied: the "routing method"
  destination corrected to an index entry for an existing strategy; the quality-gate demotion re-read as a method
  passthrough retarget, with its four constraints kept always-loaded; gate-emission work removed from scope; a P1
  re-audit opened over the whole register after five constraint demotions were found; P3, P5, and P6 engaged
  (P5 recorded as an accepted deviation pending `workflow-eval-harness`); the surface restated in nonblank units
  at ~46% / ~50%; success signal 2 rescoped to the surfaces the retrofit edits and the merge-authority
  enumeration's cut retracted as a bias-guard; "whose call" given its resolution and "integrity of a check"
  bounded; the author's-interest items placed as a gate at spec discovery. Separately, the held `USER-INBOX`
  entry for this work unit was absorbed and cleared: the discriminator's ignorance-guard arm now carries a
  **dischargeability** qualifier, since a rule guarding an ignorance the agent can never discharge behaves as an
  invariant — the satisfaction test's fall-through already reached that verdict, which is further evidence for
  satisfaction-primary, and the retrofit's naive-sweep hazard is now named.
  A third live instance then arrived from an unrelated session — § Quality gate failure's four steps applied to a
  mistyped test filter, stopping over a gate that never ran — and it reclassified register cut 3 from a cut to a
  rephrasing that separates three failures and narrows the invariant to "a red gate never becomes a green report."
  The observation that this misreading is harness-dependent is recorded with it, as an argument for stating a
  high-traffic rule's derivation in its own text.
  **Adversarial pass two** then returned nine confirmed findings, three of them blockers, and reframed the work:
  cross-harness precedence moved out of the ADR into the § Rule Authority backstop (an ADR is summoned by nothing,
  and placing an invariant-class rule there was placement by frequency); the `procedure-evolution` P2 reading was
  corrected as overreaching, which permits the `invariant` marker and costs the vocabulary retirement one of its two
  arguments; and the § Rule Authority presumption was scoped corpus-wide rather than to one file. The compression
  half was then **composed against the prior art it had re-derived** — `analysis-load-set-scoping`'s two-clause
  demotion precondition and unsafe-versus-pointless split, `loadset-composition`'s adherence bands and
  demote-only-to-an-explicit-trigger rule, `knowledge-evolution` P10's demotion clause, and the built-but-unused
  domain-rules mechanism as a fourth destination. Consequences: ~103 nb routed to implicit awareness now needs
  trigger re-authoring, ~30 nb of workflow destinations are pointless as routed, ~41% of the register is an
  instance file no project inherits, and `rules-restructure` is recorded as a genuine overlap rather than a
  consumer.
- **Open:** the register's systematic constraint-column pass, which gates formalization; the
  `execution-delegation-doctrine` vocabulary coupling.
- **Next:** run the register's constraint-column pass, the one remaining formalization gate. A third adversarial
  pass is available above the `Heavy` cap and is best spent after that pass, since the register is what it would
  attack. Authoring the real `DEV-RULES.ARC` section is downstream of create-spec, not a drafting-stage move.

---

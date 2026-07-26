# Draft: judgment-authority-model

- **Origin:** [internal] — `USER-INBOX § Work Unit`, "Recognize judgment already exercised instead of
  re-litigating it", captured during errand `gate-tier-right-sizing` (PR #355) and the review-architecture
  discussion following it. Minted alongside `review-protocol-alignment` in the 2026-07-25 grooming session.
- **Purpose:** Give ARC a model for when its own procedure yields to judgment that has demonstrably already been
  exercised — so codification stops metastasizing into the half of the work `PROJECT-PRD` § Operational friction
  down, judgment friction up explicitly reserves for human and agent judgment.

- **State:** maturing — the design is settled and the scope is enumerated and decided; what remains is the
  coherence consolidation this draft's own doctrine asks for before formalization. Face (a) was decomposed out to
  `planning-lane-relief` (see § Scope Estimate).
- **Class:** `Heavy` — ratcheted down from `Novel` on 2026-07-25. Derivation still runs high (a real design must
  be authored), but the read is _compose_, not _invent_: six existing enactments to generalize (see § The
  pattern). Scale and constitutional blast radius hold it at `Heavy`. The `**Class:**` meta write lands at the
  draft-capture ceremony.

---

## Problem / Motivation

One defect with three faces: **ARC treats its own procedure as authoritative over evidence that judgment has
already been applied.** `PROJECT-PRD` states the principle bidirectionally — codify the deterministic, _preserve
friction where judgment is required_ — and this is that principle violated in one direction.

The 2026-07-25 orientation pass established that this is **not an invention problem**. ARC has already made this
decision, correctly, in at least six narrower places and never generalized it. The defect is a **propagation
gap**: the architecture layer already grants bounded runtime judgment authority; the rules surface an agent
actually loads at session-init does not.

### Face (a) — lane classification is single-axis

`classifyPlanningLane` (`change-facts.ts`) reads path-class only — the sole additional gate is
`isPlainPlanningContentChange`, a mode check hardening against symlink and mode tricks, not a second semantic
axis. There is no increment-count or gate-history signal. PR #355 classified `reviewed` correctly by path, but
the human disposition moment had already occurred — one increment, the developer present at the gate, two live
redirections mid-change. Review's job is to create a disposition moment; creating a second one over content that
already had one is ceremony.

The principled statement of the lane's purpose is **catch what the per-increment invariant structurally cannot
see** — aggregate and cross-increment effects. Where nothing escapes the increment view, the lane has no work.

**This face's remedy ships separately** — decomposed out to `planning-lane-relief` on 2026-07-26, once the core's
shape settled and the asymmetry became clear: it is the only face that reaches code, and the only one gated on an
unresolved unknown. It stays here as _diagnosis_, because it is the third independent instance of the propagation
gap and therefore evidence for the model; its remedy design, the forgeability unknown, and the
`procedure-evolution` P1 tension live in that work unit's draft.

### Face (b) — the invariant/default distinction is enumerated, not derived

Symptom: an independent review returned findings containing a one-character typo, and the primary concluded "per
ARC this is invalidated, we must re-review." Absurd, and the agent knew it — the flaw was ARC's, for not letting
safe agent judgment win.

The seed framed this as "rules do not distinguish invariant from default." That is **too strong**, and the
correction sharpens the problem. ARC draws the distinction in at least three recorded places:

- `adr-016` declares task-interlock and integration-interlock **invariant, not configurable**, while commit- and
  push-interlock are configurable.
- `adr-020` carries an explicit "invariant floor" and "scale grammar, never scale discipline."
- `DEV-RULES.ARC` carries eight `[configurable]` markers.

What is actually missing is narrower and more tractable:

- **Enumerated, not derived.** Each distinction was drawn by fiat, per domain. Nothing classifies a rule that
  carries no marker — including the 33 `never` / `must not` sites in `DEV-RULES.ARC` alone.
- **Config-time, not runtime.** `[configurable]` means a rule yields to a _project setting_. Nothing says a rule
  yields to in-the-moment judgment, however well-evidenced.

Proposed discriminator (unchanged, and now doing more work — it must _derive_ what was previously enumerated):
does the rule exist because the agent might be **wrong** (ignorance-guarding → _default_; yields when the agent
demonstrably does know, because the rule's purpose is already served) or because the agent might be **biased**
(bias-guarding → _invariant_; never yields, because the agent's certainty is the thing being checked)? Judgment
can fix wrongness; it cannot fix bias.

### Face (c) — no runtime override in the rules, and rules do not declare whose they are

`DEV-RULES.ARC` mentions `override` at three loci — the `[configurable]` project settings, the method
`.override` / `override-mode` contract, and a pointer to method defaults. All are config- or load-time. Nothing
says an operator's explicit in-the-moment direction governs. Config-time override is the wrong instrument for
"this instance is obviously fine" — nobody should permanently reconfigure a project because one typo was
immaterial.

**The seed's framing here was wrong in a way worth recording.** It read this as ARC being stricter than the
general agent-harness norm, and flagged the norm as worth engaging rather than assuming ARC correct by default.
`DEV-RULES.PROJECT` § Capture Routing requires engaging recorded rationale before raising idiom divergence, and
doing so dissolves the framing: `adr-029` (Right-Size Review Authority, accepted 2026-07-24) already grants the
operating agent bounded runtime judgment with a disclosure obligation — "proceeds without a permission stop when
confident, and discloses the choice. Material uncertainty, new authority, or exceptional cost surfaces to the
human." ARC's architecture layer already _holds_ the norm.

So this is an **internal inconsistency**, not a divergence from industry idiom. The rules surface is stricter
than the ADR layer it is supposed to express.

Proposed: every overridable rule declares an override authority — `owner` (the WU/path owner) / `maintainer` /
`policy` (nobody at runtime). A solo developer owns everything, so it collapses to maximal latitude **with no
special case**, while a team gets real enforcement from the same mechanism and a path owner gets exactly the
latitude a solo developer has. Substrate exists (`arc.role`, per-WU `Owner`); rules simply do not declare
ownership.

**Live instance from the minting session:** the `run-errand` reviewed-lane step reads "leave the PR open for
owner review," which the agent took as removing its authority to _perform_ the merge. The developer's intent was
that **approval** is theirs, not that the button-press is. A procedural line written to locate authority was read
as withholding capability — exactly the failure this face describes, arriving unprompted while grooming it.

### The pattern across all three faces

Six enactments of one ungeneralized model, each paid for separately:

1. `adr-016` — interlocks sorted invariant vs configurable, by fiat.
2. `adr-020` — an invariant floor and a "scale grammar, never scale discipline" rule, enumerated.
3. `adr-029` — a three-tier authority split (CLI mechanics / agent bounded judgment / human mutation and
   commitment) with a disclosure obligation, scoped to review.
4. `process-task-loop` § Deferred review — the agent-proposed-batch clause spends a sentence reconciling itself
   with "the agent never self-invokes" ("the agent proposes the scope, the user approves, and that approval is
   the invocation"). A hand-written derivation of what a general model would yield for free. The adjacent "never
   **silently** widened" is the anti-escape-hatch mechanism, already latent.
5. `unit-scoped-review` — its break-out matrix says outright that its hard triggers are "already a mandatory stop
   in ARC, so this collects rather than invents." An enumeration of invariants, because nothing derives them.
6. `execution-delegation-doctrine` — owns a § Sub-agent scope rewrite characterized as **prohibition →
   conditions**, which is this discriminator applied to exactly one rule.

`knowledge-evolution` Principle 6 ("extract on fan-in, not aesthetics") is what authorizes the extraction: the
fan-in is demonstrated, repeatedly, not anticipated.

## Direction

The anti-escape-hatch mechanism is the load-bearing part: **silent divergence is an escape hatch; stated
divergence is judgment.** An override must name the rule and why its purpose is served anyway, surface where the
developer is already reading (the gate or completion report, never a log), and be reversible in one turn. That
does not skip the human — it informs them and keeps the decision theirs. The agent's obligation becomes
**disclosure, not obstruction**: surface the conflict once, concretely, and on reaffirmation proceed and record
it.

This is `adr-029`'s already-accepted shape, generalized off the review domain.

## Proposed shape

### The constitutional core (faces b + c)

A new `DEV-RULES.ARC` § Rule Authority. Settled 2026-07-26 as a synthesis over three candidate tests — a
purpose test (what does the rule fear), a satisfaction test (what would discharge it), and a standing test
(whose call is it). The satisfaction test is primary: it is the only one that forces the disclosure as a
byproduct, since a default cannot be discharged without naming the fact, and the named fact _is_ the
disclosure. It also fails safe on silence, which matters most for the rules nobody thought about.

```markdown
## Rule Authority

Rules here are **defaults** unless marked **invariant**.

**Reading an unmarked rule.** Ask whether you can name a fact that, if true, means the rule's concern
does not arise here.

- You can name one → the rule is a **default**. Discharge it as below.
- No fact you could produce would settle it — what is in doubt is you, not the facts → **invariant**.
- You can name nothing → **invariant**. Naming nothing settles nothing.

**Backstop.** Regardless of the above, a rule is invariant when it protects the integrity of a check, or
when it withholds an *authorization* rather than a *judgment* — a decision reserved to a person because
it commits them. Competence never transfers an authorization; it does not follow that the capability is
withheld too.

**Discharging a default.** Silent divergence is an escape hatch; stated divergence is judgment. Name the
rule and the fact that discharges it, surface it where the developer is already reading — the gate or the
completion report, never a log — leave it reversible in one turn, and proceed. Raise it once: a
reaffirmation is a decision, not an invitation to re-raise. The obligation is disclosure, not obstruction.

**Whose call.** Authority to discharge a default resolves from the actor's role and the surface the rule
governs — both already known to the session. No rule declares its own authority. Where one person holds
every role this is full latitude with no special case; where roles are distributed, the same resolution is
enforcement.
```

**Why the backstop is load-bearing.** No single test classifies the corpus. Probed against four rules, the
satisfaction and standing tests both wrongly release `--no-verify` — a hook failure on an untouched file is a
nameable, checkable fact, and skipping the hook reads as a judgment rather than an authorization. Only the
purpose test catches it, and for the right reason: an agent that wants to commit is structurally the wrong
judge of whether the commit check applies to it. The backstop's first limb generalizes that. Its second limb
carries the `run-errand` fix directly, separating a withheld **authorization** (the owner's approval) from a
withheld **capability** (performing the merge) — the distinction the standing test read straight off.

**Why no per-rule authority vocabulary** (settled 2026-07-26, against `procedure-evolution` P2). The seed
proposed each rule declaring `owner` / `maintainer` / `policy`. Probed against ~10 candidate defaults — task
granularity, quality-gate failure, test-first, placement proposal, line length, commit format, package-sync,
sub-agent execution relaxation, doc boundaries — role × governed-surface returned the right authority every
time, with no counterexample. Two findings retired the vocabulary outright:

- **`policy` is redundant.** A default nobody may override at runtime _is_ an invariant. Three values collapse
  to the existing binary.
- **The backstop absorbs the case that would have justified `maintainer`.** The obvious counterexample is the
  quality-gate zero-tolerance rule, which a WU owner should not be able to wave — but it protects the integrity
  of a check, so backstop limb one makes it invariant and it never reaches the authority question.

So the declaration is enumeration this WU's own thesis says to drop, and dropping it satisfies P2 (no markup
for the agent to branch on) while keeping the solo-collapses-cleanly property. Limit: ~10 of ~33 imperatives,
classified by judgment — the full probe belongs in the retrofit pass, and a counterexample found later argues
for one narrow marker, not for reinstating the vocabulary.

Plus an **ADR** that anchors `adr-016`, `adr-020`, and `adr-029` under one model — generalizing, not superseding.
It also carries the **cross-harness precedence** paragraph (settled in scope 2026-07-26): ARC's rules sit on top
of harnesses with their own authority models, ARC claims harness-agnosticism (`PROJECT-PRD`; `adr-005`,
`adr-006`), and at least one host harness states the operator-reaffirmation-is-decisive norm as a first-class
rule. What governs when the two disagree is a property of the authority model, so it is stated once in the ADR
rather than left for a local answer later — and stated there rather than in `DEV-RULES.ARC`, since the case arises
rarely and the always-loaded set is what this work unit is shrinking.

### Retrofit posture: derivation-first, marker-as-exception

Do not annotate 26 methods and 36 workflows. Rules are `default` unless marked `invariant`; the discriminator
classifies the unmarked. The initial marker footprint is small — the two invariant interlocks, `adr-020`'s floor,
and the genuinely bias-guarding nevers (`--no-verify`, integration approval, amending pushed commits). Precedent
supports concentrating the vocabulary: `[configurable]` lives in exactly one file today.

## Rule-surface compression

A deliberate widening taken 2026-07-26: the same document set, worked harder, for a tighter result. Both rules
files have been appended to across the project's life and never reconsidered, and they load every session.
Fanning out to more files would be bloat; more passes over these two is not. The register below is **bounded and
enumerated** so it cannot quietly expand into an open audit mandate.

### What model progress erodes

Model progress erodes **capability rules** and does nothing to **preference or authority rules**.

- A _capability_ rule tells the agent how to be good at something — how to decompose, how to search before
  assuming, how many files is too many. Each is a bet against the model, and each release settles it further
  against the author.
- A _preference or authority_ rule says what the developer wants and who decides. "Merge requires explicit human
  authorization" is derivable from nothing in the codebase; it is a choice about where the human stands. No
  amount of capability touches it.

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
session; a scope that widens ten percent per session is not noticed for months, and is then misattributed to
model drift.

The WU's own discriminator sorts this, which is a strong argument for its shape:

- **Ignorance-guards fail loudly** — the agent is wrong and it shows. Model progress is exactly the evidence that
  discharges them. **Cut aggressively.**
- **Bias-guards fail quietly** — the agent is confident and nothing looks off. A better model is more confident,
  not less structurally interested; capability is not the variable they track. **Never cut, at any capability.**

Never-cut does not mean never-rephrase: correcting a rule's scope is not weakening it.

### Who is the reader — the audience test

A fourth criterion, distinct from constraint-versus-explanation. `DEV-RULES.ARC` is read by the agent every
session, so **content addressed to the human is misplaced there regardless of how load-bearing it is**. The
distinction is subtler than it looks: "the agent must not initiate handoff" is agent-facing even though its
subject is the human's role. What fails is content whose _reader_ is the human — decision support, taxonomies
for a human judgment call, procedure the human runs.

Demoted human-facing content goes to `strategies/`. **Not `docs/`** — that surface is stale and deliberately
frozen pending a full rewrite once the backlog settles; routing there would widen it.

### What can leave — the summoning test

Content may leave the always-loaded set only when something will **summon it at the moment of need**. Three
mechanisms exist, and there is no fourth:

1. **Fire-site declaration** — an `arc.methods`-style frontmatter declaration; the workflow declares it, the CLI
   resolves it.
2. **Firing-condition index entry** — the `STRATEGY-INDEX` "Consult when:" shape: always-loaded, small,
   directive.
3. **Emitted remedy** — the failing gate, hook, or CLI output names its own fix.

If none applies, the content cannot demote: it stays, or it is cut. Specifically **no new command-reference doc
surface** — `knowledge-evolution` P7 prohibits it directly, and the awareness instinct it answers is served by
mechanism 3.

The test has teeth, and it re-sorts the register into three states rather than the destination-availability
split it supersedes:

- **Land** — a summoning mechanism already fires. Class-tag routing → a method (mechanism 1);
  design-before-implementation rationale → `strategy-work-planning`, whose index trigger already reads
  "authoring specs, resolving planning depth" (mechanism 2).
- **Gated on mechanism** — the quality-gate command listing is already duplicated in `QUICK-REFERENCE`, which
  itself divides labor correctly ("**which** of them a given change has to run is `DEV-RULES.PROJECT`"). But no
  hook names a fix command on failure today, so mechanism 3 does not yet fire. Building that emission is what
  licenses the demotion.
- **Needs a trigger amendment first** — `strategy-session-operations`' index entry reads "adding new guidance
  content, deciding loading tier, configuring session state, working on session workflows": all _authoring_
  conditions, none firing for "mid-session, under context pressure." Demoting § Context quality there would lose
  it silently. Amending trigger surfaces to carry situation conditions is therefore **part of the compression
  work**, not a prerequisite outside it — and `knowledge-evolution` P2 already wants it, since a passive summary
  is the weakest-firing style.

### Constraints only — the always-loaded target

`knowledge-evolution` P1 settles the half of progressive disclosure that matters here: constraints never go
on-demand, because a reader does not know to look for the rule they are about to violate. So the redistribution
is not "fewer rules, found later" — it is **the always-loaded set shrinks to constraints only, and everything
explanatory, procedural, or exemplary demotes.** The likely result is a substantially shorter `DEV-RULES.ARC`
that is _more_ rule-dense.

**Measured, 2026-07-26** — a coarse section-level classification rather than a judgment call about how big the
pass "feels":

| File                | Lines | Demotable / cuttable | Share |
| ------------------- | ----- | -------------------- | ----- |
| `DEV-RULES.ARC`     | 569   | ~196                 | ~34%  |
| `DEV-RULES.PROJECT` | 341   | ~119                 | ~35%  |

About a third of both files, ~315 lines. That settles fold-versus-defer without further argument: this is not a
rider on the enumerated register but a **co-equal deliverable**.

### Itemized, 2026-07-26 — the surface has three commitment tiers

The line-level enumeration ran section by section over both files; the full disposition table lives in
`notes-judgment-authority-model.md`. The measured surface survived itemization (~322 nonblank lines against
~315 raw), but the useful result is that it is **not one number**:

| Tier                | Both files | What it is                                                              |
| ------------------- | ---------- | ----------------------------------------------------------------------- |
| **Committable now** | ~243       | Every disposition whose destination already summons it, plus every cut. |
| **Mechanism-gated** | ~62        | Real demotions behind emission work or a trigger amendment.             |
| **Blocked**         | ~17        | § When to Load Additional Guidance — out of this WU's reach.            |

The gated tier decomposes into ~35 lines waiting on mechanism-3 emission for the quality-gate commands and ~27 on
two trigger amendments. **Both are in scope** (settled 2026-07-26), so the deliverable is the committable and
gated tiers together — ~305 lines. The emission work is what carries it: building it licenses the largest single
demotion, and the shape is precedented rather than invented. The trigger amendments come in on the logic the
summoning test already established — amending a trigger surface is part of the compression work, not a
prerequisite outside it. Four findings from the pass carry design weight:

- **Mechanism 3 is precedented.** Pre-commit CHECK 17 already emits its own remedy verbatim, so building
  emission for the quality-gate commands extends an existing shape rather than inventing one — verified at
  source, where the markdown and TypeScript gates name no fix command on failure. The ROADMAP-regen bullet's
  mechanism therefore already fires, and it demotes now.
- **Trigger amendments are bounded at two** — `strategy-session-operations` (a mid-session situation condition)
  and `strategy-configurability-architecture` (consuming an override at load time, not authoring config). Every
  other destination's index entry already fires as written, which is evidence for the summoning test's
  practicality rather than for widening it.
- **§ When to Load Additional Guidance is 24 lines, not 43** — the earlier figure swept in the file's trailing
  link block. It stays blocked, so the largest committable item is § Commit control's mechanics (~43).
- **§ Sub-agent scope is the one section this WU must not touch** (see § Composition / Coordination).

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
  **floor**: the fallback when nothing wider is authorized, and the right setting for a tricky change or one
  the developer wants to stay close to.

§ Review-Increment Invariant is already scope-agnostic and needs no change. The leaf-binding lives in § Task
Execution → Task interlock and in `AGENT-BRIEF.ARC`'s vocabulary entry ("default boundary: one leaf task"); both
want `default` → `floor` plus an explicit boundary parameter. That is exactly the parametrization
`unit-scoped-review` asks for, so the rephrasing is forward-compatible by construction and does not do that WU's
work. Frequency of use at the finest setting is not evidence about the gate's necessity — under deferred review
the gate fires at a wider boundary, which is why `unit-scoped-review` must invent a break-out matrix and
deviation ledger to keep it honest there.

### The bounded register

Cuts, ranked:

1. `DEV-RULES.PROJECT` § Code Quality Principles — "DRY, SOLID, KISS, YAGNI". Four acronyms, no
   project-specificity, nothing actionable. The TypeScript standards beneath it are specific and stay.
2. `DEV-RULES.ARC` § Task granularity — the numeric thresholds (>3 files, >50 lines). Proxies standing in for
   "is this one coherent increment"; they cause more bad decompositions than they prevent. Keep the principle.
3. § Quality gate failure — steps 1–3 describe baseline competence. Only "never proceed until resolved or the
   user approves" is a constraint.
4. § Verify before assuming — same shape. The "Never generate or assume" list beneath it stays intact.
5. § Context quality — worked in full as the audience test's first case, ~28 lines to ~3:
    - **Keep** the opening line ("never degrade work quality or change approach due to context pressure") —
      agent-facing, bias-guarding, quiet-failing. One line, unqualified.
    - **Demote** the boundary taxonomy and the three-step handoff procedure to `strategy-session-operations`,
      gated on that entry's trigger amendment above.
    - **Cut** the "quality signals" bullet outright. It asks the agent to notice "output becoming less precise,
      early-session guidance being missed, re-deriving decisions already established" — self-assessment of
      one's own degradation, which is the forgeable-self-report shape this WU names as unreliable in
      § Unknowns. An agent reliable enough to detect its own drift would not be drifting. Do not ship a rule
      that depends on a capability this draft argues elsewhere does not exist.
    - **Do not replace it with a behavioral rule.** The handoff nudge fires on a signal the agent estimates
      badly (its own utilization) while the harness knows it mechanically; if the nudge is wanted it belongs to
      mechanism 3, not agent introspection. Leaving it unmandated still permits reporting an obvious structural
      boundary — that is state, not a guess.
6. Both files' **tables of contents** — 22 lines combined, and the cheapest item here. Each file is loaded whole
   at session-init, and `§` reference resolution never consults them, so the content is navigation for a human
   scanner in a surface whose reader is the agent. Structural rather than a judgment about what the reader still
   needs, so it sits outside the caveat below.

Rephrasings:

- § Review-Increment Invariant ¶2 — five exempted operations packed into one sentence; slow to parse, and pure
  enumeration where the discriminator would derive. Restructure as a list at minimum.
- § Discovered Work Routing — "always propose placement to the user before acting" contradicts the inline-fix
  permission two lines above it. Under the model, a same-concern cleanup in a file already under edit is a
  discharged default, and proposing it is the ceremony this WU exists to remove.
- § Commit control, merge authority — oddly seated under commit control, and enumerates what does not count as
  authorization (task approval, review completion, passing checks, general "proceed" language). Under the
  discriminator that enumeration is derivable, since a bias-guard yields to no inference. One line survives; the
  procedure moves to `integrate-work-unit`.
- `DEV-RULES.PROJECT` § Selecting what to run is the **exemplar** — named purpose, derivation rule, explicit
  fail-safe ("the deciding is not worth more than the checks cost"). Cite it as the target shape; change nothing.

**Author's-interest caveat.** Cuts 2–5 are judgments about what current agents no longer need, made by an
interested party — the backstop clause calls exactly that structurally suspect. Treat them as candidates for the
maintainer's read, not findings. The enumeration extends the caveat's reach: roughly ten further
compress-in-place verdicts in `notes-judgment-authority-model.md` are the same shape of judgment and inherit the
same disposition.

The register above stays the **named** set; the enumeration's full per-section disposition lives in the notes
companion. That division is what keeps the surface bounded — a line-level table cannot widen into an audit
mandate the way a share-of-file percentage can.

## Forward-compat

Both project check-docs fire on this WU. Tensions surfaced during authoring per their self-checks:

### `strategy-knowledge-evolution`

- **P1 (constraints never go on-demand)** — validates placing the model in always-loaded `DEV-RULES.ARC` rather
  than a strategy. Confirms placement.
- **P6 (extract on fan-in)** — authorizes the extraction; see § The pattern above.
- **P10 (don't grow the always-loaded set casually)** — the live tension. `DEV-RULES.ARC` is always-loaded and
  already large. The justification to make explicitly, not assume: this is a **meta-rule that makes the other 33
  imperatives correctly interpretable**, so it plausibly reduces effective instruction load rather than adding to
  it. `loadset-composition` owns the T1 boundary this argues against.

### `strategy-procedure-evolution`

- **P2 (agent-interpreted markup never grows control flow)** — rules out an inline `invariant` / `default` marker
  the agent parses and branches on. Reinforces derivation-first for the discriminator, and pushes the
  **override-authority declaration toward a typed contract surface** rather than markdown annotation: structure
  is typed or it isn't structure.
- **P1 (if the CLI can compute it, the CLI computes it)** — no longer a live tension here: it applies to lane
  relief, which now ships as `planning-lane-relief`. This work unit's own compression edits move _toward_ P1 by
  building the emitted-remedy mechanism rather than asking the agent to remember a command.
- **P7 (controlled vocabulary)** — `invariant`, `default`, and `override authority` are load-bearing terms; each
  earns a briefs-vocabulary definition before use.

## Corpus sweep

A prose sweep across `process-task-loop`, `integrate-work-unit`, `verify-work-unit`, and `init-work-unit`
confirms the corpus is **already largely consistent** with the model, which is evidence for the discriminator
rather than luck:

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

## Unknowns and Assumptions

- **The forgeable self-report shape, named once.** An agent writing "human approved" into a record it also authors
  proves nothing, and in a chat harness there is no trace of the approval that is not agent-mediated. This work
  unit does not depend on solving it — the gate-history application left with `planning-lane-relief` — but it
  should **name the shape generally**, because the corpus keeps rediscovering it: `review-protocol-alignment`
  concern 6 rejected two candidate shapes for the `adversarial-review` `withstood` field on exactly this ground,
  and register cut 5 rejects the quality-signals bullet on it too. Both asked an untrusted party to attest its own
  rigor. Naming it once is this model's job; solving it for a machine-read classifier is not.
- **Which gate failures should name a fix command.** Emission is in scope, and the pattern exists (pre-commit
  CHECK 17), but the set is unenumerated: the markdown gate wants `lint:md:fix` and `format:tables`, the
  TypeScript gate has no single remedy, and a gate whose fix is "read the output" should emit nothing rather than
  noise. An implementation detail, not open design — resolve it in the spec's own enumeration pass, the same way
  the compression surface was resolved here.
- **The `execution-delegation-doctrine` vocabulary coupling** — see § Composition / Coordination. Not a blocker:
  the surface boundary is drawn, and the open half is whether that work unit's § Sub-agent scope rewrite expresses
  this discriminator or restates it locally.

## Composition / Coordination

- **`unit-scoped-review` — downstream consumer, not an upstream constraint.** The seed had this backwards. The
  `approval-flow-refinement` cohort has already performed this exact extraction once:
  `execution-delegation-doctrine` was minted upstream out of `unit-scoped-review` on 2026-07-02, and the cohort
  record states that its
  orchestration architecture "becomes an instance of the doctrine's model rather than where the model is
  invented." Same shape here. `unit-scoped-review` is `planned`, hard-blocked on `commit-increments` (not
  landed), carries a further edge to `execution-delegation-doctrine`, and has not begun planning iteration — it
  has no settled model to constrain anything with. Its own content is visibly a consumer: an advisory eligibility
  predicate the human overrides freely, a deviation ledger that is the disclosure obligation at WU scope, and a
  break-out matrix that collects existing mandatory stops rather than deriving them. The one genuine coupling —
  what "gate history" means under a WU-scoped gate — left with `planning-lane-relief`, which should **specify** it
  rather than conform to it. Record **no `Depends On` edge in either direction**; mirror `execution-delegation-doctrine`'s
  position as a standalone upstream consumed by the cohort. Route the composition note via `USER-INBOX` at
  planning close rather than editing a sibling's draft.
- **`execution-delegation-doctrine` — genuine model overlap, and the enumeration draws the surface boundary.**
  It owns a § Sub-agent scope rewrite characterized as **prohibition → conditions**, which is this WU's
  discriminator applied to one rule, plus a "two-half invariant (no judgment without a gate; no gate without a
  decision)". The compression enumeration settles the _surface_ half of the boundary cleanly: § Sub-agent scope
  (18 lines) is the only section of either rules file this WU must not touch — that WU owns one section, this one
  owns the model and every other section, and the compression register is scoped accordingly. What remains is a
  **vocabulary** coupling, not a territorial one: whether its rewrite expresses this model's discriminator or
  restates it locally. Draw that before either authors the section; upstream-versus-siblings does not need
  settling to proceed, since neither is imminent.
- **`review-protocol-alignment` — downstream consumer, no hard edge.** Four of its judgment-layer concerns are
  informed by this model: the coarse post-fix review-applicability rule, the missing proposal-time
  `Post-fix review:` field, the two-stop author-response cycle, and the determinism-versus-judgment posture. That
  WU holds them in a later phase deliberately so it is not gated on this upstream. No `Depends On` edge is
  recorded in either direction.
- **Prior owners are all shipped** and cannot absorb this: `review-gate-right-sizing`, `review-architecture`, and
  `review-surface-binding` (resolved by slug, 2026-07-25). Hence its own stub.

## Success signal

Three checks, each falsifiable by inspection when the work is done. They are the seed of the spec's success
criteria, and the second is the load-bearing one — the only one that can fail by the model being too permissive.

1. **Derivation.** Each of the six prior enactments, and both recorded live failures — the typo-invalidated
   review, the `run-errand` merge capability read as withheld — resolves from § Rule Authority with no new
   per-case rule written. If a case still needs its own clause, the discriminator does not derive what it claims to.
2. **Safety.** The bias-guard corpus is untouched by the retrofit: `integrate-work-unit`'s 20+ imperatives and
   `verify-work-unit`'s immutable-criterion rule survive unchanged. A model that licenses rewriting them is too
   permissive, and this is the check that catches it.
3. **Compression.** Both rules files end net shorter, every demoted line lands at a destination whose summoning
   mechanism already fires, and **no constraint leaves the always-loaded set** (`knowledge-evolution` P1).

## Scope Estimate

Constitutional and **prose-dominant**, and smaller than the seed's "large (week+)" read once the invention premise
dropped: a new `DEV-RULES.ARC` section, one ADR carrying the cross-harness precedence paragraph, a bounded marker
retrofit, and a narrow prose sweep.

**Decomposed 2026-07-26.** Face (a) ships as `planning-lane-relief` — the only face reaching code and the only one
gated on an unresolved unknown, which is the asymmetry that made the cut. What remains is faces (b) and (c) as one
constitutional deliverable, plus compression.

The § Rule-surface compression register widens this deliberately, and the widening is **depth on the same two
files, not fan-out** — the net direction is fewer lines than it started with, in a surface loaded every session.
Itemized, it is ~305 lines across the two files (the committable and mechanism-gated tiers together), plus the
destination edits each demotion lands, two trigger amendments, and the emitted-remedy work that licenses the
largest demotion. That last item is the one code surface still in scope after the decomposition: hook and gate
scripts, not `change-facts.ts`.

## Continuity

- **Resolved:** the problem is a propagation gap, not an invention (six prior enactments identified); face (b)
  restated as enumerated-not-derived and config-time-not-runtime; face (c)'s idiom-divergence framing withdrawn
  in favor of an internal ADR-versus-rules inconsistency; `unit-scoped-review` established as downstream;
  deliverable shape settled to a `DEV-RULES.ARC` section plus an anchoring ADR; retrofit posture settled to
  derivation-first with markers as the exception; both forward-compat check-docs run with tensions recorded;
  `Class` ratcheted `Novel` → `Heavy` on the compose-not-invent read. **2026-07-26:** the discriminator's wording
  settled as satisfaction-test-primary plus a two-limb backstop, probed against the corpus; the cutting doctrine
  settled as loud-versus-quiet with constraints-only as the always-loaded target; the placement doctrine settled
  as constraint-stays / procedure-moves, with gate-versus-granularity as its worked case. Per-rule authority
  vocabulary dropped after a no-counterexample probe, closing the constitutional core's last open question; the
  audience test and the three-mechanism summoning test added, with the compression surface measured at ~315
  lines and re-sorted into land / gated / needs-trigger-amendment. **Line-level enumeration run 2026-07-26**
  (`notes-judgment-authority-model.md`): the compression deliverable is ~243 committable lines with ~62
  mechanism-gated and ~17 blocked, mechanism 3 confirmed precedented in the hook layer, trigger amendments
  bounded at two, and the `execution-delegation-doctrine` surface boundary drawn at § Sub-agent scope. The four
  readiness decisions then settled: face (a) decomposed out to `planning-lane-relief`, emitted-remedy work and the
  two trigger amendments taken into scope (~305 lines), cross-harness precedence placed in the ADR, and a
  three-part success signal adopted.
- **Open:** the `execution-delegation-doctrine` vocabulary coupling — whether its § Sub-agent scope rewrite
  expresses this discriminator or restates it locally. Not a blocker; the surface boundary is drawn.
- **Next:** consolidate. The design is settled and the scope is enumerated, but the draft has accreted several
  2026-07-26 layers over its 2026-07-25 body, so it wants the coherence rewrite before it crosses into create-spec
  — one coherent input, every settled decision and surviving detail preserved. Authoring the real
  `DEV-RULES.ARC` section is downstream of create-spec, not a drafting-stage move.

---

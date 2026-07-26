# Draft: judgment-authority-model

- **Origin:** [internal] — `USER-INBOX § Work Unit`, "Recognize judgment already exercised instead of
  re-litigating it", captured during errand `gate-tier-right-sizing` (PR #355) and the review-architecture
  discussion following it. Minted alongside `review-protocol-alignment` in the 2026-07-25 grooming session.
- **Purpose:** Give ARC a model for when its own procedure yields to judgment that has demonstrably already been
  exercised — so codification stops metastasizing into the half of the work `PROJECT-PRD` § Operational friction
  down, judgment friction up explicitly reserves for human and agent judgment.

- **State:** maturing — the model's scope is known and the remaining work on faces (b) and (c) is detail-design.
  Face (a) still carries a fundamental open, which is itself the decomposition signal (see § Scope).
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

The seed proposed composing path-class × increment-count × gate-history. That composition is now in doubt on
forward-compat grounds — see § Proposed shape, face (a).

**Live instance from the minting session, worth keeping:** a five-line provider-config change (`.coderabbit.yaml`
`auto_review` gating) classified `reviewed` on path alone. Correct by the current rule, disproportionate by any
reading of the lane's purpose.

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

**Whose call.** A default declares whose it is to override: `owner` (the work's owner), `maintainer`, or
`policy` (nobody at runtime). Undeclared defaults are `owner`. Where one person holds every role this
collapses to full latitude with no special case; where roles are distributed, the same declaration is
enforcement.
```

**Why the backstop is load-bearing.** No single test classifies the corpus. Probed against four rules, the
satisfaction and standing tests both wrongly release `--no-verify` — a hook failure on an untouched file is a
nameable, checkable fact, and skipping the hook reads as a judgment rather than an authorization. Only the
purpose test catches it, and for the right reason: an agent that wants to commit is structurally the wrong
judge of whether the commit check applies to it. The backstop's first limb generalizes that. Its second limb
carries the `run-errand` fix directly, separating a withheld **authorization** (the owner's approval) from a
withheld **capability** (performing the merge) — the distinction the standing test read straight off.

**Still open:** `Whose call` as written is prose the agent parses, which `procedure-evolution` P2 forbids.
Either the declaration becomes a typed field, or the section drops per-rule declaration and resolves authority
from `Owner` / `arc.role` alone.

Plus an **ADR** that anchors `adr-016`, `adr-020`, and `adr-029` under one model — generalizing, not superseding.

### Retrofit posture: derivation-first, marker-as-exception

Do not annotate 26 methods and 36 workflows. Rules are `default` unless marked `invariant`; the discriminator
classifies the unmarked. The initial marker footprint is small — the two invariant interlocks, `adr-020`'s floor,
and the genuinely bias-guarding nevers (`--no-verify`, integration approval, amending pushed commits). Precedent
supports concentrating the vocabulary: `[configurable]` lives in exactly one file today.

### Face (a) — likely not the composition the seed proposed

`procedure-evolution` Principle 1 ("if the CLI can compute it, the CLI computes it") disfavors pushing lane
relief back into agent judgment, and the forgeability unknown (below) disfavors feeding an agent-authored gate
record into a machine-read classifier. Candidate resolution satisfying both: **keep path-class deterministic in
the CLI, and model relief as a typed, human-authorized input** — a human-sourced authorization has nothing to
forge, and the classifier stays code. To be settled, not assumed.

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

### Constraints only — the always-loaded target

`knowledge-evolution` P1 settles the half of progressive disclosure that matters here: constraints never go
on-demand, because a reader does not know to look for the rule they are about to violate. So the redistribution
is not "fewer rules, found later" — it is **the always-loaded set shrinks to constraints only, and everything
explanatory, procedural, or exemplary demotes.** The likely result is a substantially shorter `DEV-RULES.ARC`
that is _more_ rule-dense.

That is also the larger win: the enumerated cuts below are smaller than the compression available in the
explanatory prose wrapped around rules that stay.

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
5. § Context quality ¶2–4 (compaction, handoff boundaries, quality signals) — guidance that already
   cross-references `strategy-session-operations`. Its first line is a constraint and stays.

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
maintainer's read, not findings.

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
- **P1 (if the CLI can compute it, the CLI computes it)** — the face (a) tension above.
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

- **The gating unknown — gate history is only evidence if the agent cannot forge it.** An agent writing "human
  approved" into a record it also authors proves nothing, and in a chat harness there is no trace of the approval
  that is not agent-mediated. **Face (a) does not ship without an answer here.**
    - **Recorded precedent to engage, not re-derive:** `adr-029` faced the analogous question in the review
      domain and **dissolved rather than solved** it — explicitly rejecting an evidence ledger, eligibility
      oracle, and fix-carry proof model in favor of disclosure plus exact-head invalidation plus the final human
      interlock. It does not transfer automatically: review applicability is agent-judged with a human
      downstream, whereas the lane classifier is machine-read with no human present when it fires. That
      asymmetry is the thing to settle.
- **Same root as a sibling concern.** `review-protocol-alignment` concern 6 rejected two candidate shapes for the
  `adversarial-review` `withstood` field on precisely this ground — both asked an untrusted evaluator to attest
  its own rigor. The forgeable-self-report problem is therefore not unique to gate history; it is a recurring
  shape this WU should name once, generally, rather than solve twice.
- **Cross-harness authority precedence.** ARC's rules sit on top of harnesses with their own authority models,
  and ARC claims harness-agnosticism (`PROJECT-PRD`; `adr-005`, `adr-006`). At least one host harness states the
  operator-reaffirmation-is-decisive norm as a first-class rule. Nothing says what governs when the two
  disagree. Bounded composition work, not a literature review — and it replaces the seed's "is ARC stricter than
  the norm" framing, which § Face (c) resolved.
- **The compression register is bounded; the larger win is not.** § Rule-surface compression names five cuts and
  four rephrasings so the pass cannot sprawl — but it also records that more compression sits in the explanatory
  prose wrapped around rules that stay, which the register does _not_ enumerate. Either that pass is scoped
  explicitly or it is consciously deferred; leaving it implied is how a bounded register becomes an open audit.
- Whether the three faces are one deliverable or want decomposing — see § Scope. The cohort-fit read is
  deliberately still not made; the shape has firmed but the cuts are not yet certain.

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
  what "gate history" means under a WU-scoped gate — is face (a)-only, and this WU should **specify** it rather
  than conform to it. Record **no `Depends On` edge in either direction**; mirror `execution-delegation-doctrine`'s
  position as a standalone upstream consumed by the cohort. Route the composition note via `USER-INBOX` at
  planning close rather than editing a sibling's draft.
- **`execution-delegation-doctrine` — genuine model overlap.** It owns a § Sub-agent scope rewrite characterized
  as **prohibition → conditions**, which is this WU's discriminator applied to one rule, plus a "two-half
  invariant (no judgment without a gate; no gate without a decision)". Either this WU is upstream of it too, or
  they are siblings wanting a cohort. Not a scheduling risk — it is not imminent and may be downgraded to
  provisional — but the boundary must be drawn before either authors § Sub-agent scope, or the narrower version
  gets invented locally.
- **`review-protocol-alignment` — downstream consumer, no hard edge.** Four of its judgment-layer concerns are
  informed by this model: the coarse post-fix review-applicability rule, the missing proposal-time
  `Post-fix review:` field, the two-stop author-response cycle, and the determinism-versus-judgment posture. That
  WU holds them in a later phase deliberately so it is not gated on this upstream. No `Depends On` edge is
  recorded in either direction.
- **Prior owners are all shipped** and cannot absorb this: `review-gate-right-sizing`, `review-architecture`, and
  `review-surface-binding` (resolved by slug, 2026-07-25). Hence its own stub.

## Scope Estimate

Constitutional but **prose-dominant**, and smaller than the seed's "large (week+)" read once the invention
premise dropped: a new `DEV-RULES.ARC` section, one ADR, a bounded marker retrofit, and a narrow prose sweep.
Code is touched only if face (a) survives in a form that changes the lane classifier.

The § Rule-surface compression register widens this deliberately, and the widening is **depth on the same two
files, not fan-out** — the net direction is fewer lines than it started with, in a surface loaded every session.
Judge it on coherence of the result rather than on passes spent.

**Likely cut.** Faces (b) and (c) are one constitutional deliverable with no code and no blocking unknown. Face
(a) is a downstream application of that model, gated on the forgeability question and the `procedure-evolution`
P1 tension, and it is the only face that reaches `change-facts.ts`. That asymmetry is the decomposition signal;
confirm or reject it once the core's shape is settled.

## Continuity

- **Resolved:** the problem is a propagation gap, not an invention (six prior enactments identified); face (b)
  restated as enumerated-not-derived and config-time-not-runtime; face (c)'s idiom-divergence framing withdrawn
  in favor of an internal ADR-versus-rules inconsistency; `unit-scoped-review` established as downstream;
  deliverable shape settled to a `DEV-RULES.ARC` section plus an anchoring ADR; retrofit posture settled to
  derivation-first with markers as the exception; both forward-compat check-docs run with tensions recorded;
  `Class` ratcheted `Novel` → `Heavy` on the compose-not-invent read. **2026-07-26:** the discriminator's wording
  settled as satisfaction-test-primary plus a two-limb backstop, probed against the corpus; the cutting doctrine
  settled as loud-versus-quiet with constraints-only as the always-loaded target; the placement doctrine settled
  as constraint-stays / procedure-moves, with gate-versus-granularity as its worked case.
- **Open:** the forgeability question and the `procedure-evolution` P1 tension, which jointly gate face (a) and
  its shape; whether `Whose call` survives as prose or becomes a typed field under P2; the scope of the
  unenumerated explanatory-prose compression; the `execution-delegation-doctrine` boundary; the cross-harness
  precedence posture; whether the cut in § Scope is real.
- **Next:** resolve `Whose call` against P2 — the last open question in the constitutional core — then draft the
  `DEV-RULES.ARC` § Rule Authority section in place and run the bounded register against it. Face (a) waits on
  the forgeability resolution and should not gate the core.

---

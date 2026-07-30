# Task List: judgment-authority-model

- **Design:** `spec-judgment-authority-model.md`

---

## **Phase 1:** Constitutional core

_Purpose:_ Land the model everything downstream applies — § Rule Authority, its anchoring ADR, the vocabulary it
requires, the five-test determination over its own text, and the initial marker footprint.

_Design decisions:_ § Rule Authority's text is settled in the spec as a normative artifact; realization reproduces
it rather than re-authoring it, and any change to it is a spec amendment. The five-test pass runs after the
section lands so its result adjusts the ledger before the register's sizing is relied on. The brief's duplicate
leaf-binding deletion is **not** here — it is forced by the § Task interlock rephrasing and lands with it in
Task 3.4.

### `[x]` **1.1 `DEV-RULES.ARC` § Rule Authority**

- _Goal:_ An agent meeting an unmarked rule anywhere in the corpus can classify it, and where it classifies as a
  default, discharge it by naming the fact that discharges it.

    - `[x]` **1.1.a Author the section in the package source**
        - Landed as the file's first section, between the preamble's `---` and `## Contents`, with the matching
          `## Contents` entry. Reproduces the amended D1 text byte-for-byte: default-unless-marked presumption,
          `[configurable]` orthogonality, the three-branch reading, the two-limb backstop with its self-attestation
          limb, the invariant clause, the discharge protocol, and § Whose call.
        - Adopter-facing constraints held; the whole-file token assertion in `pr-open-extensions.test.ts` is
          satisfied — no `GitHub`, `CodeRabbit`, or `review-gate` token added.

    - `[x]` **1.1.b Sync to the project instance and confirm byte-identity**
        - Both copies verified identical by `diff`; the authored section verified byte-exact against the spec's
          normative block.

- _Outcome:_ The section first landed at **31 nb**, not the 46 the spec specified, and an independent adversarial
  read then took it to **36** (see Task 1.6). Task 1.4's five-test pass was pulled forward and run before authoring
  rather than after, so the text was authored once at its settled size instead of
  authored-then-cut. Every block carrying a rule returned `constraint → stays`; the 15 nb removed was justification
  for rules that stayed, which has no demotion destination because nothing summons a rationale. Two spec amendments
  followed: the reaffirmation clause was **corrected**, not just compressed — as authored it claimed an invariant
  survives "a host harness's rule that operator reaffirmation is decisive," asserting an override of the operator's
  instruction that is not this model; and § Whose call was retained against the register's demote prediction, on the
  cross-owner case rather than the contributor one. Ledger: the `DEV-RULES.ARC` leg now nets roughly −24 nb on day
  one rather than −9. Determination table in `notes-judgment-authority-model.md`.

### `[x]` **1.2 Anchoring ADR**

- _Goal:_ `adr-016`, `adr-020`, and `adr-029` read as one authority model whose two senses of "invariant" are
  stated rather than left for a reader to discover.

- _Note:_ ADRs are internal-only. This one must not be referenced from `strategies/arc/`, docs-site content, or
  any other shipped surface. It is a non-moving artifact and rides the ceremony commit.

    - Landed as `adr-030-anchor-agent-rule-authority.md`, Accepted. Carries the harness-agnosticism rationale,
      the two-axis terminology reconciliation (configurability vs. dischargeability, coinciding on the two
      interlocks), and the generalizing-not-superseding relationship to all three anchored ADRs.
    - The precedence **rule** the design expected to point at no longer exists: D1's amended clause scopes the
      model to the agent's own authority, so a harness rule about the operator's decisions addresses a different
      question and no precedence claim is made. The ADR states that scoping decision rather than a precedence
      one. D2 amended to match.
    - Risks recorded: the undischargeable-ignorance shape (which Task 1.5 marks) and marker drift eroding the
      derived reading into an annotation habit.

### `[x]` **1.3 `AGENT-BRIEF.ARC` vocabulary additions**

- _Goal:_ `invariant`, `default`, and `dischargeable` are defined before § Rule Authority uses them, so the
  reading does not depend on terms the reader has to infer.

- _Note:_ Scope discipline — these three additions plus Task 3.4's single deletion are the **only** vocabulary
  block edits in scope. The brief's other overlaps with `DEV-RULES.ARC` are real and belong to a different work
  unit.

    - Three entries added to `## Vocabulary` in both copies, verified byte-identical. Placed immediately before
      `Interlock`, whose always-stop / configurable split is the two axes in miniature and reads correctly only
      once both are defined.
    - `dischargeable` was first defined of an _ignorance-guard_ per the design, and rewritten at Task 1.6: that
      framing depended on a term defined nowhere in the always-loaded set. It is now said of the doubt a rule
      guards, and § Rule Authority's first reading bullet uses the word — the design requires each term earn its
      definition before use, and it had no use.
    - "Protects the integrity of a check" was not minted as a term — it stays bounded inline in § Rule Authority.
    - Each entry points at the reading rather than restating it, so the classification procedure has one home.

### `[x]` **1.4 Subject § Rule Authority to the register's own five tests**

- _Goal:_ The largest single addition to the always-loaded set carries the same recorded constraint determination
  every removal does, so the ledger is audited on the side that grows as well as the side that shrinks.

    - `[x]` **1.4.a Run the five tests over each block of the section text**
        - Ran at bullet granularity ahead of authoring rather than after, so the section was authored once at its
          settled size. Determination table recorded in `notes-judgment-authority-model.md` beside the register's
          rows.
        - Every block carrying a rule returned `constraint → stays`, as predicted. The 15 nb removed was
          justification for rules that stayed plus one duplicated clause — content with no demotion destination,
          since nothing summons a rationale.

    - `[x]` **1.4.b Settle § Whose call**
        - **Stays**, narrowed to its resolution rule (3 nb) — against the register's demote prediction. The holder
          half relocated into the invariant clause, which removed the argument that had protected it; it survives
          on the constraint test instead, via the cross-owner case: `Owner` is per-WU, so a maintainer-role agent
          can work a WU owned by someone else and no role-gated surface fires there.
        - The contributor case alone would not have held it — `AGENT-BRIEF.CONTRIBUTOR` loads deterministically on
          `arc.role`, and the register already demotes § Contributor commit release to exactly that destination.
          Nothing demotes, so Task 3.6 gains no row from this block.

    - `[x]` **1.4.c Restate the debit as measured**
        - Measured at **31 nb**, down from the 46 first authored, then revised to **36** by Task 1.6's fixes;
          Phase 3's and Phase 5's sizing rests on the 36 figure. No pending credit to carry — no block demoted.

- _Outcome:_ The `DEV-RULES.ARC` leg nets roughly −24 nb on day one rather than −9, and growth on the file drops
  from 11% to 7%. Two spec amendments fell out of the pass beyond the sizing: the reaffirmation clause was
  corrected rather than compressed, and § Whose call's disposition reversed.

### `[x]` **1.5 Marker retrofit**

- _Goal:_ The rules whose classification their own text cannot settle carry the marker, so no reading has to
  reconstruct it — while the corpus at large stays unannotated and derived.

- _Note:_ The known hazard is the undischargeable-ignorance shape: it carries no marker and reads as an
  ignorance-guard, so a sweep applying only the wrong-versus-biased split classifies it `default` — wrong, and
  wrong in the permissive direction. Where a rule's own text does not settle it, that is a marker's job.

- _Note:_ The initial footprint is a prediction, not a budget. Task 4.5 revises it against the sweep rather than
  capping the sweep against it.

    - `[x]` **1.5.a Mark the invariant interlocks and the bias-guarding nevers**
        - Four sites marked in both copies: `### Task interlock`, the merge-to-integration bullet, `--no-verify`,
          and amending pushed commits. Preamble reading rule added beside the `[configurable]` one, pointing at
          § Rule Authority.
        - **Placement convention settled beyond the design's notation fix:** the marker attaches to the lead-in of
          the _rule_ it classifies, which is not always the bullet's own lead-in. § Amend scope carries a default
          (same-concern fixups to an unpushed commit) and an invariant (never amend pushed commits) in one bullet;
          marking the bullet would have classified the default half invariant — wrong, and wrong in the restrictive
          direction. The prohibition took its own bolded lead-in and the marker sits there.
        - Marking the § Task interlock heading follows the existing § Test-first assessment precedent, which
          already carries `[configurable]` in the same position; `§` reference resolution corpus-wide is
          unaffected.

    - `[x]` **1.5.b Mark `adr-020`'s invariant floor**
        - Marked in place; the list item was reflowed to carry the marker on its lead-in without a malformed
          bold-colon. Internal-only surface, no package counterpart.

- _Outcome:_ Five marker sites total, matching the design's predicted footprint. The one thing the design had not
  settled was what to do when a single bullet carries both classes — resolved by attaching the marker to the rule's
  lead-in rather than the bullet's, which keeps the footprint honest without splitting bullets Phase 3 will rework.

### `[x]` **1.6 Independent read of § Rule Authority**

- _Goal:_ The section that governs how every other rule is read is validated by someone who did not author it,
  before Phase 2 builds the trigger tier on top of it.

- _Note:_ Emergent task. The section's own self-attestation limb is the argument for it — a pass audited and
  compressed by its own author is the party under examination writing the record.

    - `[x]` **1.6.a Run the read and verify its findings against source**
        - Nineteen findings returned; verification confirmed eleven, downgraded one, rejected four. Two were
          real but **pre-existing in the design's normative text**, not introduced by the compression — the
          reading's uncovered branch (the settling fact is not yours _and has been said_) is present in the
          original four-branch text too.

    - `[x]` **1.6.b Apply the confirmed fixes**
        - Cut `Marked or not, the reading below classifies it` — it contradicted the section's own next heading,
          the file header, and `adr-030`, and under the broad reading made marked rules re-classifiable.
        - Restored an imperative to § Whose call: _where the resolved holder is not you, propose rather than
          discharge._ The block had been compressed below the point where it constrained the cross-owner case
          Task 1.4.b kept it for.
        - Scoped the check-integrity sentence to **applicability**; reading what a check reported, including that
          it produced no result, is explicitly not that judgment. Resolves the collision with § Quality gate
          failure's deterministic-same-concern branch, which already granted the discharge the backstop forbade.
        - Marked limb one's enumeration illustrative; disambiguated `Raise it once` to per-instance; wired
          `dischargeable` into the reading's first bullet and rewrote the brief entry off the undefined
          `ignorance-guard`.

    - `[x]` **1.6.c Settle the act-versus-rule domain gap**
        - Every operative clause was rule-indexed, so an act no rule covers fell outside the section. Success
          Criterion 1's reserved falsifier is exactly that shape, and no propose-versus-self-add rule ships
          anywhere in the package tree — verified.
        - `Both limbs reach acts, not only rules` closes it. The falsifier now runs, and the self-attestation
          block becomes a worked instance rather than a rule asserted under a claim of derivation its own limb
          could not support.

- _Outcome:_ 31 nb → **36**. The three defects worth remembering were all in the same direction: a compression
  pass optimizing for size removed two clauses that were load-bearing for _meaning_ (§ Whose call's imperative,
  and the qualification the reaffirmation clause needed), and left standing one sentence that reads as a rule but
  is justification, where it then over-fired on the failures the section exists to fix. Size and meaning are
  different axes, and the author of a cut is the worst-placed party to tell them apart.

## **Phase 2:** Trigger tier

_Purpose:_ Make every demotion destination reachable — installed for projects, then re-authored to
explicit-trigger strength across the seven `STRATEGY-INDEX` entries. The critical path that unblocks 65 nb of
register demotions across Phases 3 and 5, and the only reason those demotions land somewhere a reader gets to.

_Design decisions:_ Install reachability precedes trigger strength. A trigger pointing at a file the project does
not have is worse than the passive line it replaces, so Task 2.1 lands before any entry is rewritten and before
any content moves.

_Design decisions:_ Rewrite convention is **condition-only** — where an entry's description carries nothing its
condition does not, replace both lines with one directive rather than lengthening the condition beneath a
retained description, so a credit taken against one always-loaded file does not accrue a hidden debit to another.
Two bounds: a description stays where it carries content-shape detail the condition cannot, and the collapse
reaches only these seven entries. `STRATEGY-INDEX` is **Configurable**, and the package-counterpart warning fires
only for the Framework class — so the package counterpart is a stated step in each task below, not an omission a
check will catch.

### `[x]` **2.1 Install the demotion destinations**

- _Goal:_ Every strategy this register demotes into is a file projects actually receive, so a trigger points at
  content the reader has rather than at a filename they do not.

    - `[x]` **2.1.a Add the omitted destinations to the install recipe**
        - Added four unconditional `include_files` entries to `init-recipe.json`:
          `strategy-interlock-release-wrappers` and `strategy-workflow-authoring` (both register destinations),
          `drain-inbox` (Task 3.2.d's destination; its co-destination `run-errand` was already installed), and
          `strategy-concurrent-work` (the same omission in a row this register does not touch, riding along
          rather than staying a known hole behind a shipped index entry that already names it).
        - `strategy-team-coordination`'s team-mode condition left as it is. Scope held to the register's own
          destinations plus the one adjacent strategy; other recipe absences were not swept, and the recipe's
          hand-maintenance was left alone.

    - `[x]` **2.1.b Bring the added files under manifest classification**
        - Added the four matching `manifest.json` entries by hand at the recipe's relative positions, following
          the precedent set when a workflow and a template were added the same way — `classification: Framework`,
          `layer: core`, `pristine_hash` as the SHA-256 of the package-source content (`hashContent` over the
          rendered file; none of the four render).
        - Confirmed rather than assumed: `classifyFile` returns Framework for all four (none appear in
          `SCAFFOLDED_FILES` or `CONFIGURABLE_FILES`), and all four are byte-identical across the two copies, so
          the identity test passes on arrival.
        - `strategy-team-coordination` stays out, as a by-hand surface — this repository installs with team mode
          off, the same condition that keeps it out of most projects.

- _Outcome:_ Recipe and manifest now agree exactly: every one of the 138 unconditional recipe entries resolves to
  a manifest entry, and every manifest key resolves back to a recipe entry. The four demotion destinations reach
  installing projects, so the Phase 3 and 5 demotions relocate content rather than deleting it.

### `[x]` **2.2 Rewrite five shared-block entries and add a sixth**

- _Goal:_ Six `STRATEGY-INDEX` entries fire at the explicit-trigger band in **both** copies, so demoted content is
  reachable for every project rather than only in this repository.

    - `[x]` **2.2.a `strategy-work-organization`**
        - **Residual-scoped** (D5 test 5): the entry names the `Class` model's worked examples, the
          Errand-versus-work-unit boundary, protection modes, spec-flow invariants, and cohort nesting, and cedes
          routine classification, branch, and archival calls to the `classify-work-unit` / `assess-cohort-fit`
          methods and the lifecycle workflows. The first authoring fired on every one of those routine operations
          — 1465 lines summoned to name a branch. Receives the `Class`-versus-Work-Character taxonomy (Task 3.6).

    - `[x]` **2.2.b `strategy-work-planning`**
        - **Residual-scoped**: which spec form fits, how layered specs compose, where stage boundaries fall —
          with routine depth resolution and authoring ceded to the `resolve-planning-depth` method and the
          `draft-design` / `create-spec` workflows. Receives the design-before-implementation rationale
          (Task 3.6).
        - Description **stays** — spec forms and layered specs are content-shape detail the condition cannot
          carry.

    - `[x]` **2.2.c `strategy-session-operations`**
        - Directive retained — no leaner surface covers tier classification or loading mechanisms, and the entry
          says so while ceding the state-file write rules to `DEV-RULES.ARC` § Session Management. Anchored to
          author-side operations throughout, so the trigger never asks the agent to estimate its own context
          state. Receives the session-state file model, portability, and § Context quality's four boundary
          categories (Task 3.6).

    - `[x]` **2.2.d `strategy-workflow-authoring`**
        - Directive anchored to authoring or editing a workflow file, suppressing the copy-an-existing-workflow
          default. Description dropped: it restated the section names, which the condition now carries. Receives
          the prose-economy and verbs-over-mechanics rationale (Task 5.5).

    - `[x]` **2.2.e `strategy-team-coordination`**
        - Marked **(team mode)**, with the block preamble extended to define that marker alongside the
          **(arc-in-git)** convention it already carried — so the directive never tells a reader to load a file
          they lack. Receives § Task interlock's team elaboration (Task 3.4), and § Whose call if Task 1.4.b
          demotes it.

    - `[x]` **2.2.f Add `strategy-interlock-release-wrappers`**
        - New entry in both copies, placed after `strategy-session-operations` — the adjacent interlock domain.
          **Residual-scoped**: the adoption decision, the trust model, non-fit cases, and the universal route for
          a harness with no reference implementation, with routine invocation and class-tag routing ceded to
          `DEV-RULES.ARC` § Commit Discipline. Receives the interlock/fire-site concept, wrapper mechanics, and
          class-tag routing mechanics (Task 3.6) — the largest single destination in the register.

- _Outcome:_ Confirmed before editing that the `## ARC Framework Strategies` block was still byte-identical across
  the two copies, and again after — so this stayed a sync obligation rather than a reconcile. The six entries no
  longer restate their own titles: each names the operation that fires the load, operation-anchored rather than
  workflow-anchored, so ad-hoc invocation is covered without naming every workflow that reaches them.

- _Outcome:_ Authored twice. The first pass satisfied the directive form and shipped four entries that fired on
  operations a leaner surface already served — the `pointless-as-routed` failure, caught by the
  `knowledge-evolution` forward-compat pass rather than by any stated obligation, since D5 test 5 reached neither
  this task's shape nor Success Criterion 3. Each entry now either names its residual question and the surface
  holding the rest, or states that no leaner surface exists; D6 and Criterion 3 carry the test that would have
  caught it.

### `[x]` **2.3 Re-author the instance-only entry**

- _Goal:_ `strategy-package-project-sync` reaches its content through a trigger that fires, without inventing a
  package counterpart that does not exist.

    - Rewritten in `.arc/` only — a project strategy, and that directory ships to projects as an empty surface, so
      there is no package obligation.
    - **Residual-scoped**: the file inventory and dependency map, template-counterpart handling, and what each
      safeguard actually checks — with the routine edit-flow and never-copy rules ceded to `DEV-RULES.PROJECT`
      § Package-Project Sync, which is always loaded. The first authoring fired on editing any file with a
      counterpart, which in this repository is most edits. Receives the hook explanation and the skill-drift
      hazard (Task 5.5).

### `[x]` **2.4 Update the shipped maintenance footer**

- _Goal:_ The shipped index stops instructing future authors to restore the passive form this work unit removes.

    - Package copy only — the instance carries no maintenance footer.
    - Scope reduced by work that landed on the base first: a maintenance errand had already replaced the
      keep-one-line-descriptions text with the description-only-when-it-carries-content-shape rule, so what
      remained was the half it could not state — the directive form itself. The footer now specifies naming the
      triggering operation and the suppressed default, anchoring to the operation rather than the workflow, and
      naming the residual question wherever a leaner surface already covers the common case.

## **Phase 3:** Canonical register — `DEV-RULES.ARC`

_Purpose:_ Execute the canonical register in both copies — cuts, the rephrasings § Rule Authority now licenses,
compressions, and the trigger-tier demotions Phase 2 unblocked — leaving the file shorter and rule-denser with no
constraint demoted out of it.

_Design decisions:_ Tasks group by register tier, not by file region — a cut removes a rule and a compression
cannot, and the grouping matches the ledger the compression criterion measures. Two sections cross a tier
boundary and land whole rather than split: § Task interlock in Task 3.4, because its rephrasing forces the brief
deletion, and § Context quality in Task 3.6. Several rows carry no task by design: § Sub-agent scope is out of
scope, § When to Load Additional Guidance stays blocked for want of any summoning mechanism, and the three
demotions withdrawn as constraints — `.override` semantics, commit-prefix mapping, class-authorization
preconditions — all stay always-loaded. One consequence of grouping by tier: § Commit control is edited by four
separate subtasks across three of them — 3.2.b, 3.4.d, 3.5.b, and 3.6.e — so each re-reads that block as it
actually stands rather than against the register's snapshot of it.

_Standing close-out:_ three obligations bind every subtask below, not only the ones that restate them. A
**demotion is not a deletion** — write the content into its destination before removing it from the rules file; a
row whose destination never receives it is a cut wearing a demotion's label. The one exception is a demotion to
an **emitted remedy**, where the destination is text a hook or command already prints: nothing is written there,
so the obligation becomes confirming the emission covers the whole rule rather than part of it. Every subtask
that moves, renames, or **empties** a cited heading sweeps that heading's inbound `§` citations across both
copies in the same increment; nothing in the repository validates an inbound citation — the section-reference
check refuses the glyph inside TypeScript and never resolves a Markdown citation against a heading, and the link
check skips anchor-only links — so it is a hand obligation throughout. That obligation attaches to **headings**:
several rows below name bullets inside § Commit control — amend scope, meta-file timing, ROADMAP regen,
contributor release, commit and push triggering — which are in-place bullet edits with nothing to sweep. And any
rule already carrying an `[invariant]` marker keeps it: the task interlock, the merge-authority block, and the
amend-scope bullet are all marked before this phase rewrites them, and a rephrasing or compression pass is
exactly where a one-token tag disappears unnoticed. Finally, a subtask that removes a section's **last** consumer
of a link-reference definition prunes that definition in the same increment, in both copies — the counting
convention puts the trailing link block outside every row, so no Δ accounts for it, and MD053 reds the gate on
an orphan.

### `[x]` **3.1 Re-measure the canonical register against base**

- _Goal:_ Every disposition below executes against the file as it stands, not as it was measured during planning.

    - Re-derived per-heading mechanically against baseline `7fd6e34e1^`, with the trailing link block excluded by
      construction — scanning stops at the final `---` whose remainder is only link definitions.
    - **Thirty-two of thirty-three canonical rows reproduce their recorded `nb` exactly.** The hand enumeration
      survives an independent derivation; its dispositions execute as written, and no disposition changes.
    - **One row drifted:** § Contents is 12 nb, not 11 — § Rule Authority added a table-of-contents line. A
      `firm`-tier cut, so canonical firm 43 → 44 and the register total 144 → 145 (both files 246 → 247).
    - **The denominators counted each file's trailing link block** — the fourth instance of the error D7.5 and
      D7.6 caught per-row and drew the lesson from without applying it to the totals. Canonical is 145 nb of
      **398**, not of 418; instance is 102 nb of **255**, not of 267. The register's share of each file is larger
      than recorded, which strengthens the compression case.
    - **§ Rule Authority folded in at 37 nb against a recorded 31** — 5 nb of real growth from the independent
      read's gap closures, ~1 nb of measurement boundary (the section's own `---`). The D1 debit was understated;
      the ledger now carries it, and the canonical leg nets −19 rather than −24 before the later tiers land.
    - **Index leg re-measured** (the errand shifted its baseline): `STRATEGY-INDEX` 62 → 77, so +15 against D6's
      modeled +7 to +14. Charged to Criterion 3's net rather than absorbed.
    - `DEV-RULES.PROJECT` is unchanged at content level; Phase 5 inherits the corrected 255 denominator.

- _Outcome:_ The re-measurement's own finding is that the enumeration was sound and the **accounting around it**
  was not: every correction landed in a total, a denominator, or a debit — never in a row. Both files' totals had
  the same trailing-link-block error the register had already diagnosed twice at row level and generalized in
  prose, which is the failure mode this work unit exists to name — a rule stated and not applied to the case that
  did not look like its example.

### `[x]` **3.2 Firm tier — cuts and verified-redundancy demotions**

- _Goal:_ The rows whose mechanism already fires leave the always-loaded set, with the demoted content landing at
  its destination in the same increment.

    - `[x]` **3.2.a § Contents — cut whole**
        - Cut from both copies: 12 nb, matching the Task 3.1 re-measurement exactly (the recorded 11 predated the
          § Rule Authority line). The file loads whole and `§` resolution never consults it, so the navigation
          mechanism a table of contents serves is absent for its only reader.
        - No inbound `§ Contents` citation to sweep — the only corpus hits are an archived work unit's task list
          referring to a different file's contents list.

    - `[x]` **3.2.b § Commit Discipline firm items**
        - Commit and push triggering — the two bullets merged into one carrying both config keys, both `manual`
          defaults, and both workflow pointers. 7 nb → 3.
        - ROADMAP regen — **demoted whole, both clauses**, and the conditional the task left open resolved
          affirmatively. The render-field clause is covered verbatim: CHECK 17 matches a staged
          `Depends On` / `Owner` / `Cohort` diff on an `active/` or `backlog/planned/` meta and prints
          `arc status --project --staged > .arc/backlog/ROADMAP.md` plus the stage-it follow-up. The move clause
          has no hook summoner — a rename carries no field diff — but every ceremony that moves a work unit across
          lifecycle directories carries its own regen step: `init-work-unit` § 5, plus `promote-`, `resume-`,
          `park-`, `deactivate-`, `decompose-`, `archive-`, and `integrate-work-unit`. Both fire sites covered, so
          the rule demotes rather than splitting.
        - Contributor commit release — written into `AGENT-BRIEF.CONTRIBUTOR` § Commit Convention **before**
          removal, in both copies; the brief loads role-conditionally and previously said nothing about interlock
          release. Measured 4 nb, not the recorded 3.
        - Complex-commits pointer — cut; the duplicate in § When to Load Additional Guidance is verbatim on both
          the trigger and the criteria (multi-session work, interleaved concerns, atomicity analysis).
        - Removing the ROADMAP bullet orphaned the `[work-org-roadmap]` link definition — its only in-body user.
          Dropped from both copies.

    - `[x]` **3.2.c § Test-first assessment**
        - Compressed to one line carrying the obligation and the method pointer; the method declaration already
          fires, so the decision tree needs no restatement here.
        - **Δ1, not the modeled Δ2.** The section ends a `##` block, so its span includes the structural `---`
          that cannot be removed. The two prose lines were the only compressible content and they became one.

    - `[x]` **3.2.d § Route by urgency × isolation and § Holding ≠ execution**
        - **Both destinations already carried every demoted line — no writes were owed.** This is the
          verified-redundancy half of the tier behaving as designed, and it was checked rather than assumed:
          `drain-inbox` carries the retention escape-hatch with its full `_Hold:` / `_Created:` grammar and the
          "never the default, never agent-suggested" guard, the no-un-triaged-entries invariant in its own
          frontmatter, the non-arc-in-git routing fallback, and "routing is not execution" verbatim; `run-errand`
          carries the protection-mode shape at § Launch step 3 and again at § Ship and § Complete, and the
          inbox back-pointer with its drop-at-close semantics in both places.
        - § Route by urgency — 23 nb → 17. **Δ6, not the modeled Δ7:** one clause was kept rather than demoted.
          "The inline, holding, and anti-rider rules are mode-independent" is a scope statement about
          always-loaded constraints, and its reader is the agent at routing time, not at drain time — demoting it
          to `drain-inbox` would file it where it is never read.
        - § Holding ≠ execution — 11 nb → 6, Δ5 as modeled. A four-word pointer that shape follows protection
          mode survives the cut, so the variance is still signalled where the detail is not.
        - "An errand has no meta file or lifecycle of its own" was cut outright rather than demoted: it is
          verbatim in `AGENT-BRIEF.ARC`'s always-loaded Errand vocabulary entry.

- _Outcome:_ **44 nb out of `DEV-RULES.ARC`, 437 → 393**, against a modeled 44 — the tier's total held even though
  four of its six rows missed their individual figures in both directions. Only one row required a destination
  write (the contributor rule, into `AGENT-BRIEF.CONTRIBUTOR`); every other demotion resolved to redundancy
  already present at the fire site, which is what `firm` was supposed to mean and is now evidence rather than
  assertion. Two rows measured differently than recorded — § Contents 12 and contributor release 4 — and the
  second sits in the itemized § Commit control sub-table that Task 3.1's heading-level pass could not reach, so
  the remaining tiers' sub-table figures carry the same unverified status.

    - `[x]` **3.2.e § Consult strategy guidance**
        - Compressed 8 nb → 2: one obligation line pointing at the index, which is itself always-loaded and now
          carries its own firing conditions. Δ6 as modeled.
        - The four numbered steps were the index's own mechanics restated in the file that summons it. Two prose
          clauses also went, each with a surviving carrier: "when uncertain, ask" is § Verify before assuming's
          stop-and-ask step, and "search a large strategy rather than reading it whole" is largely discharged by
          Task 2.2 — a residual-scoped entry now states which question the load answers, which is what made the
          instruction necessary when entries named only a domain.

### `[x]` **3.3 Decided tier — the settled cuts**

- _Goal:_ The two canonical cuts land as narrowed, removing proxy guidance while every qualitative signal and
  every prohibition stays.

    - `[x]` **3.3.a § Task granularity**
        - Cut the two numeric bullets (>3 files, >50 lines); kept both qualitative ones. 6 nb → 4.
        - **Δ2, against a recorded Δ5 that was impossible rather than stale.** The section totals 6 nb — heading,
          lead-in, four bullets — so a disposition keeping the heading and two bullets can only reach Δ2; Δ5 would
          leave the heading alone. Corrected in the register: `decided` 12 → 9, canonical total 145 → 142.

    - `[x]` **3.3.b § Verify before assuming**
        - Cut the search-first and ask-clarifying steps; folded the surviving "stop and ask" into the lead-in,
          since a numbered list of one is not a list. 14 nb → 11, Δ3 as modeled.
        - The prohibition list stays whole — it is the guard, and the cut steps were its procedure. "Stop and
          ask" also drops "if still unclear after searching", which lost its antecedent when step 1 went.
        - § Clarifying questions improve outcomes stays: it is the standing encouragement, not the cut procedure,
          and it survives the removal of the step that shared its subject.

- _Outcome:_ 5 nb, not the modeled 8 — and the whole gap is one row's arithmetic, not under-execution. This is the
  third row-level discrepancy in Phase 3 and the first that is internally inconsistent rather than merely drifted,
  which sharpens Task 3.1's finding: the enumeration's **dispositions** have held without exception, while its
  **Δ figures** have now been wrong in three of the eleven rows executed. Tier totals remain the sounder unit —
  `firm` landed at exactly its recorded 44 with four of six rows individually off.

### `[x]` **3.4 Rephrasings under § Rule Authority**

- _Goal:_ Four sections that had been re-deciding the authority question locally read off § Rule Authority
  instead, and the brief stops duplicating a binding whose shape changes here.

    - `[x]` **3.4.a § Quality gate failure**
        - Confirmed at base first: the two-branch rewrite had already landed upstream, so the section arrived as
          an independent enactment of this model and needed the third limb rather than a rewrite.
        - Added the never-ran limb — a wrong invocation is not a gate failure; correct it and re-run, with
          nothing to report and nothing to decide. This is the third of the recorded live failures Success
          Criterion 1 names, and the one the corpus had no rule for.
        - Stated the narrowed invariant with the file's own marker: **a red gate never becomes a green report,
          and is never bypassed** · `[invariant]`, closing on § Rule Authority's check-integrity limb — reading
          what a gate reported, including that it produced no result, is not that judgment.
        - **+4 nb, a debit.** The row is `stays`/Δ0; a rephrasing that adds two limbs to an always-loaded section
          costs rather than pays, and the ledger carries it as such.

    - `[x]` **3.4.b § Review-Increment Invariant**
        - Restructured ¶2's four exempted operations as a list — candidate-tail cleanup, archive composition and
          closeout, lifecycle sweep and readiness regeneration, a typed safe base reconcile. They had been a
          run-on clause inside the sentence stating the exception, which is the legibility failure the rephrasing
          tier exists for: the reader had to parse where the enumeration ended before the qualifying rules began.
          ¶1 stays unqualified.
        - Read the assertions before editing rather than the task's paraphrase of them. Both regexes span lines
          (`[\s\S]*`), so a reflow is safe provided the three phrases stay verbatim and in order; all three do,
          and the copies remain byte-identical. Both prose-asserting tests re-run green (57 assertions).
        - **+4 nb, a debit.** The row is `stays`/Δ0, and a markdown list costs more lines than the clause it
          replaces. Bought legibility in a section every session reads.

    - `[x]` **3.4.c § Leave it cleaner**
        - "Always propose placement to the user before acting" → "Propose placement before acting", with the
          discharge stated in the same breath: a deterministic same-concern cleanup inside the change already
          under review is fixed and named in the completion report rather than costing a turn to ask.
        - Sited on the rule it discharges rather than on the permission two lines above, so the reader meets the
          default and its release together — the shape § Rule Authority prescribes (name the rule, name the fact,
          surface it where the developer is already reading, leave it reversible).
        - The vocabulary now matches § Quality gate failure's first branch — "deterministic", "same-concern",
          "report the correction" — so the two rules read as one judgment applied twice rather than two rules that
          disagreed. That disagreement was live: both Phase 1 field cases were simultaneously correct under one
          rule and in violation of the other.
        - "Always" dropped deliberately: a default that cannot be discharged is an invariant, and this one is not.
        - **+2 nb.**

    - `[x]` **3.4.d § Commit control — reseat merge authority**
        - Reseated as `### Merge authority` under § Commit Discipline, between § Commit control and § Commit
          format. A reader looking for merge rules now finds a heading that says so, instead of the fourteenth
          bullet of a section about commit triggering. Within-file relocation: the block is unchanged and stays
          always-loaded.
        - Seated by concern rather than adjacency — merge authority is a control rule, so it sits with the other
          control content, and nothing about the placement depends on the interlock-vocabulary bullet Task 3.6.e
          demotes.
        - The not-authorization enumeration is intact and verbatim: task approval, review completion, passing
          checks, general "proceed" language. Classifying the rule `[invariant]` establishes that an
          authorization is required — not that any of those four is one.
        - **Citation sweep: zero retargets owed, verified rather than skipped.** The corpus carries no `§ Commit
          control` citation at all. The one live reference to the heading — `arc-commit/SKILL.md`, both copies —
          means class-tag routing, which stays in § Commit control. Two further hits are out of scope by rule: an
          ADR (a historical record, not a live pointer) and another work unit's notes companion.
        - **+1 nb** — the heading, less the bullet's list indent.

    - `[x]` **3.4.e § Task interlock**
        - Reparametrized: "each checkbox is one review increment" → the boundary is a **parameter** whose
          **floor** is one leaf task, with the invariant applying "at whatever boundary is in force". The old
          text bound the increment to the leaf and then spent a paragraph explaining that it was not really
          bound — the widening clause read as an exception to the sentence above it. Stating the floor first
          makes the proposal mechanism ordinary rather than a carve-out.
        - "The floor never moves on the agent's own authority" replaces "the default stays per-leaf and is never
          silently widened" — same rule, stated as the authority question § Rule Authority already answers.
        - Team elaboration demoted. **No write owed:** `strategy-team-coordination` § Ownership already carries
          it in fuller form — WU-granularity ownership ("a WU's tasks all belong to its one owner") and
          cross-person parallelism as multiple single-owner WUs, plus the self/foreign asymmetry the rules file
          never had. Verified before removing.
        - 18 nb → 13, Δ5 against a modeled 4. The `[team-coordination]` link definition was left orphaned by the
          demotion and dropped from both copies.

    - `[x]` **3.4.f `AGENT-BRIEF.ARC` — delete the duplicate leaf-binding**
        - "Default boundary: one leaf task" removed from the `Review increment` entry in both copies. Left in
          place it would have contradicted 3.4.e outright — a `default` where the rules file now states a
          `floor`, which are different claims about whether the agent may move it.
        - Deletion rather than synchronization, as specified: both surfaces are always-loaded full-read, so the
          copy carried no reach the original lacked, and removing it retires the synchronization burden instead
          of renewing it. The brief's remaining deferred-review clause is untouched — its own drift is
          `orientation-surface-compression`'s, already routed.

- _Outcome:_ **The rephrasing tier spends: +11 nb across six subtasks**, where the register scored every row
  `stays`/Δ0 on the assumption that restating a rule is length-neutral. It is not — three of the four rewrites
  added a limb, a list, or a discharge clause that the prose had been leaving to the reader to infer, and each
  is the reason the row was in the register. Only the two demotions (3.4.e, 3.4.f) returned anything. Recorded
  as a cost rather than absorbed, because Criterion 3 measures the set directly and would surface it anyway.
- _Outcome:_ Every rewrite here replaced a **locally re-decided authority question** with a reading off
  § Rule Authority — the never-ran limb closing on the check-integrity backstop, the proposal rule carrying its
  own discharge, the merge block marked `[invariant]` under a heading that names it, the leaf binding restated
  as a floor the agent may not move. That is Criterion 1's derivation claim executed rather than asserted, and
  in each case the surviving text is shorter in what it _obliges the reader to derive_, whatever it cost in
  lines.

### `[x]` **3.5 Authoring tier — compress in place**

- _Goal:_ The prose around a constraint densifies while the constraint itself stays always-loaded and intact.

    - `[x]` **3.5.a § Documentation Boundaries family**
        - § No meta-project references 14 → 12; § Artifact relocatability 4 → 3; § `.arc/` artifact references
          10 → 9; § Write for the reader 14 → 11; § Commit and PR surface language 7 → 6.
        - Most of the yield was **re-wrapping**, not rewriting. These sections were set at ~100 characters against
          a 120 target, which `DEV-RULES.PROJECT` names as the more common failure than overflow. No rule text
          moved.
        - The one real deduplication: § Artifact relocatability repeated the movable-artifact list verbatim from
          the section it introduces. Dropped there, kept where the rules are.
        - § Write for the reader's parenthetical enumeration of workflow-continuity examples went — the
          communication-artifact expansion this subtask names, and the only sanctioned example loss. Both
          reader-hostile examples stay, as the retraction requires.

    - `[x]` **3.5.b § Commit Discipline authoring items**
        - Amend scope 3 → 3; meta-file timing and commit shape 9 → 7. In-place bullet edits, no citation sweep.
        - Commit shape re-centred on the staging-area test, which is the operative rule; the timing bullet's
          ceremony enumeration densified without losing a case.
        - **Both bullets' examples were cut and then restored.** "(typo, lint, missing file from the same logical
          change)" and "(file moves, spec save, archival)" disambiguate _same-concern_ and _concurrent ceremony
          content_ — the same class the planning retractions protected, and same-concern is precisely the
          distinction Task 3.4.c exists because agents get wrong. Compressing them here would have undercut that.

- _Outcome:_ **12 nb against a modeled 19 — the shortfall is the no-detail-loss guard, not under-execution.** The
  tier's Δ targets were estimated before that constraint was applied to each row; applying it removes about a
  third of the tier. Every section reached the densest form that keeps its rules and its disambiguating examples,
  and two example sets were restored after measurement showed the compression had bought lines by taking them.
  Fourth Δ correction of the phase, and the first traceable to a stated constraint rather than to arithmetic.

### `[x]` **3.6 Trigger tier — the gated demotions**

- _Goal:_ The largest tier leaves the always-loaded set for destinations whose triggers now fire, with the
  constraint half of every mixed row staying behind.

    - `[x]` **3.6.a § Scaled Process, Invariant Discipline**
        - Invariant-floor paragraph kept intact; the `Class`-versus-Work-Character taxonomy demoted, and the
          destination pointer collapsed into the `classify-work-unit` method line. 10 nb → 7, Δ3 against a
          modeled 6 — reaching 4 would mean cutting into the floor paragraph this row keeps.
        - **No write owed.** `strategy-work-organization` § Class Model already carries the distinction in fuller
          form than the rules file did: the two-question model (weight versus spec-worthiness), the explicit
          "Atomic is **not** a `Class` value — `Class` begins at the `light` floor; an Errand carries none", and
          the scales-versus-never-scales split itself. Verified before removing.
        - The in-file pointer to the strategy went with it — `STRATEGY-INDEX`'s rewritten entry names the `Class`
          model's worked examples as its residual question, so the summoner Task 2.2.a authored is what reaches
          it now. `[work-org]` survives as a link definition; § Route by urgency still uses it.
        - **The method pointer went too, beyond the row's disposition.** `Class` is only ever resolved inside a
          workflow that declares `classify-work-unit` in its own frontmatter — `draft-design`, `create-spec`,
          `generate-tasks`, `init-work-unit`, `promote-work-unit`, `activate-work-unit`, six of them, each firing
          the method at its own point. An always-loaded line instructing the agent to use a method that is
          already loaded wherever the operation occurs fires exactly as often as the load it replaces, which is
          D5 test 5 applied to an in-file pointer rather than an index entry. What remains is a pure statement of
          the invariant floor, which is the constraint the row exists to keep. 10 nb → 6, Δ4.

    - `[x]` **3.6.b § Design before implementation**
        - Constraint kept, compressed to one sentence: settle all settle-able design up front in the spec, never
          during implementation, never a conscious deferral, never less because `Class` is light, with
          genuinely-emergent design questions routed back to the spec rather than into code or notes. 10 nb → 4,
          Δ6 against a modeled 7 — the qualifier "genuinely-emergent" and the "or notes" arm both do real work
          and were not squeezed to reach 3.
        - **No write owed.** `strategy-work-planning` § The Planning Pipeline already carries the artifact-role
          model in the same words — the spec defines intent, the task list decomposes execution, the code
          realizes intent, design upfront rather than during implementation — and § Depth floats carries the
          derivation-signal-routes-back-to-the-spec re-entry. `strategy-work-organization` § Class Model's
          derivation-axis **Floor** carries the `Class` half in fuller form: only spec-worthy design counts, and
          a choice resolved during implementation is not derivation — which is both "a lighter `Class` means the
          design was more determinate coming in" and the implementation-detail latitude the demoted sentence
          reassured about. Verified before removing. Fifth of six rows to owe its destination nothing.
        - The meta `**Design:**` clause went with the model rather than staying as a keep. Its canonical home is
          `strategy-work-organization` § Artifact fields, and the field is self-describing on the always-loaded
          meta file — an always-loaded gloss on a pointer the reader is already looking at.
        - No in-file pointer added, and the heading stays: `STRATEGY-INDEX`'s Task 2.2.b entry is the summoner,
          and `generate-tasks`'s inbound `§ Design before implementation` citation in both copies leans on the
          settle-up-front constraint, which survives — so nothing to sweep.

    - `[x]` **3.6.c § Session state control**
        - **The section is gone; its one surviving rule moved into § Handoff.** The two-files lead-in, both
          file models, the portability pointer, and the progress-reporting contrast line demoted as planned.
          The meta write-trigger bullet was then cut on the maintainer's call: it restated § Meta-file timing,
          ~130 lines above it in the same always-loaded file, which states the rule more completely (authority
          comes from the ceremony workflow, not an enumerated list). What remained — SESSION-NOTES is written
          only at handoff — is a fact about handoff, and § Handoff sat directly below it, so a heading named
          for two files no longer had two files to govern. 11 nb → 0, with +1 to § Handoff (3 → 4) carrying
          the absorbed line; net Δ10 against a modeled 6.
        - **No write owed.** `strategy-session-operations` carries every demoted limb in fuller form:
          § SESSION-NOTES pairs the personal file against the project pointer and gives the real per-WU path
          the rules file abbreviated, § User Workspace Directory carries the WU-scoped-versus-identity-global
          layout, § Session State Portability carries the whole git-notes model the removed pointer named, and
          § Meta-File Timing carries both the write triggers and the churn rationale. Sixth of seven rows to
          owe its destination nothing.
        - No pointer replaced either removed one. Task 2.2.c's `STRATEGY-INDEX` entry is the summoner, and
          with the index now naming § Commit Discipline directly, an in-file cross-reference from § Handoff
          would have been redundant navigation rather than a rule.
        - **Inbound-citation sweep, both copies:** `STRATEGY-INDEX`'s `strategy-session-operations` entry ceded
          the state-file write rules to `DEV-RULES.ARC` § Session Management. After the cut that cession was
          half-wrong — the meta rule lives in § Commit Discipline — so the entry now names § Commit Discipline
          and § Handoff. This is the standing heading-sweep obligation firing on a Phase 2 output.
        - `[session-ops]` survives as a link definition; § Context quality still uses it, so Task 3.6.d owns
          the prune decision.
        - Two residual mentions left alone, neither a citation to sweep: this WU's own register table records
          the section as measured, and `notes-docs-content-sweep.md` carries it in a sibling WU's planning
          table — a cross-WU seam that routes at planning close, not from this branch.

    - `[x]` **3.6.d § Context quality**
        - Quality-signals bullet cut entirely; mode transitions and structural boundaries demoted; the
          note-the-handoff-opportunity clause lifted into the prefer-handoff block, where it now reads as a
          condition on that judgment rather than a trailing clause on a category. Opening line, all three
          named blocks, and the boundary procedure with its mandatory stop all stay. 24 nb → 17, Δ7.
        - **The one row so far that owed its destination a real write — and the destination was incoherent
          without it.** `strategy-session-operations` uses "natural boundary" seven times, including the
          instruction that the user decides whether context pressure has reached one, and nowhere said what one
          is: the definition existed only in the always-loaded file. § Context Monitoring now carries both
          categories under a `What counts as a natural boundary` block, anchored to work state rather than a
          context estimate, per the constraint Task 2.2.c's entry was authored against.
        - The stranded lead-in resolved by **removal**, not the rename Task 5.3.f uses. That row renames because
          content survives under its heading; here nothing did, so a bolded lead-in introducing no list is the
          whole of what was left.
        - **The recorded Δ11 is arithmetically impossible against this row's own keep-set**, and its asterisk
          has no footnote anywhere in the notes. Heading, opening, three kept blocks, procedure, and the
          extracted line floor the section at 17 nb before any disposition is applied — the fifth Δ variance of
          the phase, and the second traceable to a stated constraint rather than to drift.
        - **The surviving pointer was retargeted.** It promised `strategy-session-operations` carries duration
          guidance; that file's own preamble routes duration guidance to the docs site, so the promise was
          false wherever a reader followed it. It now names § Context Monitoring and the utilization
          thresholds, which is what the file actually holds. Not dropped the way this phase drops other
          pointers: the `STRATEGY-INDEX` entry fires on authoring a loading tier, interlock, recovery, or
          handoff step, and a session-length question is none of those — so no summoner covers it.

    - `[x]` **3.6.e § Commit control — the wrapper and routing mechanics**
        - **Two of the three demotions withdrawn; the third executed.** Only the wrapper mechanics left, and the
          bullet reduces to the keep — off-workflow commits use raw `git` even under opt-in. Measured 29 nb → 17
          across the three items: concept 5 → 4, release-wrapper 10 → 2, class-tag routing 14 → 11. Δ12 against
          a modeled 17.
        - **The withdrawal ground: Task 2.2.f's index entry contradicts this row.** It fires on _deciding whether
          to adopt_ the wrappers and explicitly cedes routine invocation and class-tag routing back to
          `DEV-RULES.ARC` § Commit Discipline. A workflow fire site is not an adoption decision, so demoting the
          routing mechanics or the gate/release concept there would file per-fire-site lookups behind a trigger
          that never fires when they are needed. Nothing else carries them: `strategy-session-operations`
          § Vocabulary defines _interlock_ and the release / engage / hold verbs but has no fire-site concept,
          and no file anywhere carries the tag convention, the `releaseRouting.value.<class>` lookup, or
          raw-as-default. Fourth and fifth demotions withdrawn as unreachable rather than as constraints.
        - **The one executed demotion owed nothing.** `strategy-interlock-release-wrappers` § Overview,
          § Value Layers, and § Scope: Triggered Commits Only already carry validation, per-invocation audit,
          the opt-in prompt bypass, and the codified-trigger binding in fuller form — and § Scope closes by
          ceding the rule itself back to `DEV-RULES.ARC`, which is why the off-workflow keep belongs here.
        - **What stays was streamlined instead.** The concept's three interlock pairings fold to two clauses;
          class authorization factors `arc.releaseOptedIn` out of three parallel conditions; the `arc sync`
          carve-out drops its audit-umbrella clause, which described mechanics this row demoted.
        - **The citation sweep found nothing to sweep, which is corroboration.** The one live inbound reference,
          `arc-commit`'s SKILL pointing at § Commit Discipline → Commit control for class-tag routing, stays
          correct precisely because the routing demotion was withdrawn — it would have broken under the row as
          written.
        - **All three recorded nb are one low** (4/9/13 against a measured 5/10/14), exactly as predicted: the
          itemized sub-table is bullet-level, so Task 3.1's heading-level re-derivation never reached it.
        - Captured to `USER-INBOX § Work Unit`, `WU_Target: composable-workflows`: the withdrawn content wants a
          fragment loaded on the enabling config, which is reachability a strategy trigger cannot express.

    - `[~]` **3.6.f § Rule Authority — § Whose call, if Task 1.4.b determined `demote`**
        - Struck. Task 1.4.b settled **stays**, narrowing § Whose call to its resolution rule on the cross-owner
          case — `Owner` is per-WU, so a maintainer-role agent can work someone else's WU and no role-gated
          surface fires there. The `strategy-team-coordination` demotion this row was conditional on never
          arose, and Task 1.4.c already recorded no pending credit to close.

- _Outcome:_ The tier's premise held asymmetrically. Five of six destinations already carried their content in
  fuller form and owed no write — but the two exceptions were the informative ones. § Context quality's demotion
  **repaired** a destination that had been instructing readers to judge whether a "natural boundary" had arrived
  while never defining one; § Commit control's routing demotion had to be **withdrawn**, because Phase 2's own
  index entry cedes that content back to the rules file and its trigger fires on adoption rather than at a fire
  site. Reachability failed in the one place the register assumed it strongest. Two rows were then settled by
  structure rather than disposition: § Session state control dissolved into § Handoff once its restated half
  went, and 3.6.f was struck on a Phase 1 determination that had already reversed it.

## **Phase 4:** Corpus-wide classification sweep

_Purpose:_ Check the default-unless-marked presumption against the corpus it governs rather than asserting it —
every method, strategy, workflow, and extension document read for imperatives the presumption would reclassify,
with the result recorded as a named artifact the safety criterion can be validated against.

_Design decisions:_ Sweep order runs methods → strategies → workflows → extensions. Methods are the priority:
`[configurable]` has no presence there at all, so they have never carried a classification marker of any kind and
there is no local precedent to calibrate against. Extensions rank last on density and carry no `never` /
`must not` line at all — swept cheaply, but swept, because a rule-free surface and an unread one leave identical
evidence. Reading is derivation work and is delegable to fresh subagents, with delegated output advisory until
verified against source; judgment — whether a found imperative takes a marker or is recorded as an accepted
reclassification — stays with the primary.

_Reading rule:_ the corpus is **two-copy, in three relationships**, and the marker's landing follows the
relationship rather than the file. Most documents are byte-identical Framework files — classify from either copy,
and the marker syncs. Five workflows ship as `.template.md` instead of mirrors, so a marker on the instance never
reaches projects; the shipped template takes its own edit. And a handful of methods and extensions diverge
between copies at any moment, where one copy does not settle the other. Re-derive both the template-paired set
and the divergent set by **comparing the copies**, never by filename — the `.template.md` suffix marks some
template-paired files and not others — and take the **shipped** set as the corpus, not the installed one: a
document that ships without an instance counterpart still states its rules to every project.

### `[x]` **4.1 Sweep the method corpus**

- _Goal:_ The region with no classification precedent at all is the first to have its imperatives classified,
  and each result is recorded with its reasoning rather than left implicit.

- _Outcome:_ 25 documents (`README.md` excluded), 115 imperatives, 52 marker candidates and 63 accepted
  reclassifications — recorded as a per-document table plus family and accepting-reason codes in
  `notes-judgment-authority-model.md`. 44 of the 52 restate one of six rules the always-loaded set already carries,
  so the proposed footprint for Task 4.5.a is **eleven** — three unmarked parents plus eight region-local sites —
  not 52. Three methods ship without installing (`init-recipe.json` drift), which puts 5 of the 8 region-local
  markers in files no project currently has.

### `[x]` **4.2 Sweep the strategy corpus**

- _Goal:_ The densest rule-carrying region outside the rules files is classified, and the live counterexample
  candidate is resolved rather than left standing.

- _Outcome:_ 21 documents (13 `strategies/arc/`, 7 `strategies/project/`, `STRATEGY-INDEX`; the three directory
  `README.md` indices excluded on Task 4.1's precedent), 176 imperatives, 51 marker candidates and 125 accepted
  reclassifications — recorded in `notes-judgment-authority-model.md`. The counterexample is **not** a conflict: the
  pre-commit check compares HEAD-to-HEAD precisely so it declines to fire when the discharging fact is true, making
  it a codified discharge-checker and the rule a `default` on reasons 1 and 2 together. The region reclassifies 71%
  against the methods' 55% — strategies are mostly definitional, which is direct support for Task 4.5.b. Three of
  Task 4.1's eight region-local markers turn out to have strategy-side parents, and family `N` (shared history is not
  unilaterally rewritten) surfaces a fourth unmarked constitutional parent; the Task 4.5.a footprint is revised from
  eleven to eighteen, one item pending Task 4.3.

### `[x]` **4.3 Sweep the workflow corpus**

- _Goal:_ The largest region of the governed corpus is classified on the same terms as the rest.

- _Outcome:_ 36 documents (`project/README.md` excluded on Task 4.1's precedent), 855 imperatives, 220 marker
  candidates and 635 accepted reclassifications — recorded in `notes-judgment-authority-model.md`. The region
  reclassifies 74% against the strategies' 71% and the methods' 55%, which settles the open question from Task 4.1's
  finding 1: the rate is stable and it is **gate density**, not imperative volume, that varies. Both inherited
  premises needed correction — the `.template.md` suffix predicts nothing (three of five template-paired files are
  byte-identical to their instance, and the two that diverge do so only in conditional markup, making the shipped
  copy a strict superset), and the one instance-less workflow is conditional-install rather than orphaned. Recipe
  drift is worst here: 8 of 36 ship but install nowhere, seven of them the WU lifecycle's own transition workflows.
  Family `K` splits into `K1` (the realized-demand ratchet, parented) and `K2` (pre-commitment text is not rewritten
  to match the outcome) — seven instances across all three regions with no parent anywhere, the largest unparented
  family the sweep has found. One new family `Q`, one wording defect in `O`, one new unmarked constitutional parent
  (§ Review-Increment Invariant), and the Task 4.5.a footprint is revised from eighteen to thirty-one.

### `[x]` **4.4 Sweep the extension corpus**

- _Goal:_ The region the presumption's own enumeration nearly omitted is swept, so a low expected yield is a
  measured result rather than an assumption.

- _Outcome:_ 13 documents (`README.md` excluded on Task 4.1's precedent), 39 imperatives, 16 marker candidates and
  23 accepted reclassifications — recorded in `notes-judgment-authority-model.md`. The low expected yield holds in
  raw counts but not in rate: 59% against the workflows' 74%, which breaks Task 4.3's stable-rate reading and
  identifies craft content, not gate density, as what actually tracks it. The 16 collapse to five rules, and the two
  new families are both unparented — `S` (halt at first failure, seven instances, restated at four workflow fire
  points Task 4.3 passed over) and `R` (supplement, never replace, five instances). Both resolve to
  `extensions/README.md`, which makes Task 4.1's index exclusion a defect: it carries the region's only
  constitutional statement, not a link list. First region with no recipe drift — all 13 install. Task 4.5.a's
  footprint is revised from thirty-one to thirty-three.

### `[x]` **4.5 Reconcile the marker footprint and record the enabling category**

- _Goal:_ The marker set follows what the sweep found, and the sweep's one structural finding about content kinds
  is recorded where the work units that need it will reach it.

    - `[x]` **4.5.a Reconcile the marker footprint against the sweep**
        - Split by tier, not by convenience: the constitutional parents change text every session loads and earn
          their own review boundary; the region-local sites do not.

        - `[x]` **4.5.a.i Mark the unmarked constitutional parents**
            - Settled here rather than at Task 4.6.a — this is the task that applies them, so ownership resolves
              before they land, not after.
            - _Outcome:_ Seven markers in both copies, byte-identical. The record's "six" folded § Sub-agent
              scope's judgment leg and § Review finding mutation guard into one family row; they are separate
              sections, both unmarked, so the footprint is thirty-two rather than thirty-one. Every marker sits on
              the rule's lead-in rather than the section heading — marking `## Review-Increment Invariant` would
              have broken the in-file anchor DEV-RULES.ARC links twice and put 162 inbound `§` citations at risk,
              and Task 1.5.a's convention already prefers the rule's lead-in. § Rebase scope needed the same
              prose surgery § Amend scope took: it carried an invariant and a permission in one bullet, so the
              permission now leads and the marker attaches to the bolded prohibition.

        - `[x]` **4.5.a.ii Mark the region-local sites**
            - _Outcome:_ Twenty-four recorded sites landed as **twenty-eight marker loci** across seventeen files —
              five method, eight strategy, fourteen workflow, one extension. The gap is the three sites the record
              already wrote as pairs (`create-spec` L151 + L168, `setup-release-wrapper` L363 + L198,
              `setup-arc-clearance` L52 + L73) plus § Auto-Merge Lane, whose one entry carries two distinct rules
              (lane-wholeness and escalation directionality). Each member of a pair is independently reachable at
              its own gate, so `strategy-knowledge-evolution` Principle 1's placement doctrine puts a marker at
              each rather than one at the family's statement.
            - The recorded twenty-fifth site is not one. Family `S` (halt at first failure) has no statement in
              `extensions/README.md` to mark — Task 4.4 said so and still counted it here, which is the arithmetic
              defect this task's own entry warned about in a different form. Authoring a parent for an unparented
              family is Task 4.6.a's shape, not a marking act, and it must clear Success Criterion 1 first; `S`
              moves there rather than riding this increment.
            - Copy relationships re-derived by comparison, not filename: sixteen of the seventeen are
              byte-identical mirrors, `testing-standards` diverges only inside its project `.override` block (all
              three of its markers sit in `.default`), and the two project strategies
              (`strategy-knowledge-evolution`, `strategy-user-notes-concurrency`) have no package counterpart. No
              template-paired file appeared in this set.
            - Three sites needed prose surgery before the marker could attach, all in the § Amend scope shape
              Task 4.5.a.i met: `branch-format`'s line said "The `plan/` prefix is invariant" in `adr-016`'s
              **not project-configurable** sense, which Task 4.1 finding 2 flagged as the one site where a
              `[invariant]` marker would land beside the word meaning something else — reworded to "not
              overridable", the remedy that finding named, since `adr-030` declined to rename either sense;
              § Auto-Merge Lane's escalation rule was a semicolon clause with no lead-in of its own; and
              `strategy-interlock-release-wrappers`' heredoc prohibition had none either.
            - One placement is judgment beyond the record: `strategy-user-notes-concurrency` has no § Disciplines
              preamble to carry the collapsed four-rule marker, so it attaches to the file's opening statement of
              the same obligation rather than authoring one.

        - _Outcome:_ Thirty-one marked sites — seven constitutional parents plus twenty-four region-local — down
          from the sweep's running thirty-three. Three items left the marker footprint rather than being marked:
          `strategy-quality-gates` § Tier 3 folds into § Quality gate failure's existing marker, and the `K2` gate
          sites and family `S` both need a constitutional statement authored at Task 4.6.a before anything can be
          marked. Against Task 1.5's predicted five that is a sixfold miss, and the shape of the miss is the
          finding: the seven parents are where the prediction was nearly right, and the twenty-four are
          restatement density the prediction had no way to see. Every count the record carried in between
          (11 → 18 → 31 → 33) was wrong at the time it was written, which is the argument for re-deriving from the
          region sections rather than carrying a total.

    - `[x]` **4.5.b Record the enabling content category**
        - _Outcome:_ Recorded in `notes-judgment-authority-model.md` § The enabling content category. The category
          was named at planning from one file's vocabulary block; the sweep supplies independent evidence under a
          different name — **accepting reason 4** (definitional rather than obligation) is the same content
          arriving from the reclassification side. Its distribution carries the finding: 74% of the extension
          region's accepted rows against 27% of the methods' and 33% of the strategies', moving inversely to
          reason 3 (craft). That inversion is the discriminator the category needed — craft content is genuinely
          demotable because a wrong call costs quality and surfaces in the work, while definitional content is not
          because a wrong call costs the meaning of every rule using the term and surfaces nowhere.
        - Two results the derivation did not have at planning. Reason 4 is an **upper bound** on enabling content,
          not a synonym — a schema statement nothing else depends on is definitional without being load-bearing,
          and the sweep never had to draw that line because a reclassification is safe either way. And
          `analysis-load-set-scoping`'s demotion precondition already covers this territory from the negative
          side, where its irrelevance sub-case carries a recorded defect that orientation content is exactly the
          class it cannot classify; enabling names the positive property that test was trying to detect.
        - Task 4.4's finding 3 cited "15 of 23" for the extension region's reason-4 share. Recounted against its
          own table it is **17 of 23** — the finding's direction is strengthened, its count was wrong. Fourth
          re-derivation this record has needed.
        - The stub already holds the problem statement from planning close, so nothing was written to it: settling
          what enabling content _is_ remains `orientation-surface-compression`'s derivation, and editing a sibling
          WU's tracked draft from an implementation branch is not this task's to do.

### `[x]` **4.6 Act on the sweep's non-marker findings**

- _Goal:_ The sweep's output beyond the marker footprint is resolved rather than recorded and left, with each item
  either acted on here or held by an existing capture.

- _Rationale:_ The sweep's routable findings were captured at Task 4.3's close under the standing capture protocol,
  and the inbox owns them. What no surface holds is the work that is this work unit's own: two families with no
  parent anywhere, an ownership question between two of its own tasks, one defect that is the ambiguity the work
  unit exists to remove, and a placement question the sweep raised and Task 4.5 closed without answering.

- _Scope decision:_ The defect fixed below is the same concern as this work unit — a limb and its heading
  disagreeing about their own force — not a distinct concern riding the change set. The distinct concerns the sweep
  surfaced stay captured rather than folded in.

- _Note:_ Held by `USER-INBOX` captures and deliberately not scheduled here — the Codex event-set contradiction in
  `01_verify-and-configure`; `park-work-unit` L78's dead `#the-park-exit-block` anchor and `decompose-work-unit`'s
  pending inventory re-run, both blocked on `decompose-transform-integrity`'s remaining slices; the cross-file
  anchor gap in `lint:arc:section-refs`; and `prepare-commits`' commit-step classification, which is a routing
  change rather than doc work.

- **Additional Context:** `notes-judgment-authority-model.md` § Findings — the method, strategy, and workflow
  region sections

    - `[x]` **4.6.a Write the constitutional statements for the two unparented families**
        - _Outcome:_ Both statements landed byte-identical in both copies, with the derivation recorded in
          `notes-judgment-authority-model.md` § The two unparented families' statements. `K2` sits in
          `DEV-RULES.ARC` § Rule Authority as a **third instance of the check-integrity limb** — pre-commitment
          text is the target the work is judged against, so rewriting it to match the outcome makes a check pass by
          moving its target, the same limb that already settles self-attestation approached from the other side.
          `S` sits in `extensions/README.md`'s loading-model paragraph.
        - Criterion 1 cleared for both, and the reachability is uneven in a way worth keeping. `K2`'s seven
          instances reach § Rule Authority by **three different routes** — the two gate sites directly, two more
          through self-attestation, the ADR rule through the limb reserving decisions that commit someone, and
          `draft-design` L162 most thinly of all, since what it protects is contributed substance rather than a
          check. `S` is strong at its five gate instances and thinner at `pre-pr-open` / `post-pr-open`, whose halt
          rule protects an ordering assumption rather than a check. Three routes to one answer is the argument
          _for_ a parent, not against one: a reader re-deriving per site gets it right every time and pays every
          time.
        - `S`'s audience question resolved to **one statement**, on placement rather than economy. Each of the four
          workflow fire points already states `halt-on-fail` inline and names its discharge ("fix-and-retry or
          explicit-invoke bypasses"), so Principle 1 is satisfied at every site an executing session reads. The
          statement supplies the parent those restatements lacked; it does not need to reach the session, because
          the session already meets the rule locally. The named bypass is stated as the developer's call — the
          holder making a reserved decision, not a discharge the agent may take.
        - Criterion 3 debit recorded, not absorbed: `DEV-RULES.ARC` grows **4 nb**. The `S` statement is free —
          `extensions/README.md` is not tier-1.

    - `[x]` **4.6.b Resolve `draft-design` L162's force disagreement**
        - _Outcome:_ **The heading governs, and the marker candidate was wrong.** The rule preserves each settled
          decision and _surviving_ detail, in a section whose premise is that a long draft accretes superseded
          sketch — so removing superseded material is what a consolidation is _for_, and the discharging fact
          (this layer was superseded by that one) is recorded by the loop rather than invented by the agent. That
          makes it dischargeable, hence a **default**, and "never hard gates" classifies it correctly. Both copies;
          derivation in `notes-judgment-authority-model.md` § `draft-design` L162's force disagreement.
        - The defect was neither the heading nor the force but the **unstated discharge**: bare "must not" reads
          absolute, which is what put the limb in apparent conflict with its own heading. The fix names the
          discharge — drop superseded sketch deliberately and say what went — and retitles the bullet from "No
          detail loss", which over-claimed, to "No silent detail loss". The load-bearing word was always
          _silently_. An accepted reclassification on reason 1, available only once the fact was stated; the sweep
          read it as a marker candidate correctly, given the text at the time.
        - Splitting the bullet out of the three-lean list and marking it `[invariant]` was the first approach and
          is rejected in the record — the kind-mismatch between the bullets (whether-to-consolidate versus
          what-it-may-cost) is real but does not imply a force mismatch, and marking it would have made a
          dischargeable rule undischargeable.
        - Corrects Task 4.6.a's Criterion 1 record, which listed this site as `K2`'s thinnest instance reaching
          backstop limb two. Disclosure is what keeps it out of limb two, and the family's parent does not cover it
          — the parent forbids rewriting a target to match what was built, this guards accidental loss during a
          rewrite. `K2` has six instances, not seven; the three-routes conclusion is unaffected.

    - `[x]` **4.6.c Reconcile the two configuration surfaces' opposite postures**
        - _Outcome:_ **They never conflicted, and neither posture governs the other** — the mechanisms answer
          different questions. A method override substitutes a _how_ inside a fixed _what_ (the contract), while an
          extension _adds_ at a declared fire point and implements no contract, so it has nothing to substitute.
          Substitution-within-a-contract and addition-at-a-point do not overlap. Derivation in
          `notes-judgment-authority-model.md` § The two configuration surfaces.
        - The appearance of conflict was a **lossy restatement, and the authoritative source was already right**.
          `strategy-configurability-architecture` § Mechanism makes two separate claims — the contract is the
          invariant both default and override **must** satisfy, and (a distinct sentence about enforcement)
          contracts are not mechanically enforced. `methods/README.md` collapsed them and lost the distinction
          twice: `must` became `should`, and `advisory` attached to the _contract_ rather than the _enforcement_.
          Since "advisory" means non-binding in ARC's vocabulary, the compressed sentence asserted the opposite of
          its own source — the unenforced-equals-optional confusion this work unit exists to remove.
        - Fixed at both lossy sites, which separate force from enforcement: `methods/README.md`, and
          `integrate-external-content` L70, which carried the same phrase with the same `should` and is the same
          concern rather than a rider. `extensions/README.md` needed no edit — accurate, bounded to its own
          mechanism, and now carrying the family `R` parent Task 4.6.a wrote. Both mirrors verified by hand, as
          Configurable files require.
        - **No marker on either fix**, deliberately: both statements sit on the _configurability_ axis, and marking
          a project-facing obligation `[invariant]` would blur the two axes § Rule Authority spent its budget
          separating.
        - Second recorded instance of a high-traffic surface's restatement going lossy in place against its source,
          after `AGENT-BRIEF.ARC`'s `Review increment` entry. Same silent-degradation shape as Task 4.5.b's
          enabling-content failure mode; noted, not yet mechanized.

    - `[x]` **4.6.d Settle whether a separately-loadable reference carries its parent's markers**
        - _Outcome:_ **Concentration ratified, with the reference pointing at its parent.**
          `session-init/probe-envelope.md` stays unmarked, and its opening now says that **classification** lives
          with the owning workflow, not only procedure — the seed was already there ("procedural handling remains
          in the owning workflow"), so one sentence extended rather than a rule added. This fixes the harm Task
          4.3's finding 6 identified (a reader holding one file meets an obligation with no way to tell how hard it
          is) without minting a "mark the copy someone might read alone" test, which nearly every restatement in
          the corpus would satisfy and which would readmit the 52-marker footprint Task 4.1 rejected. Derivation in
          `notes-judgment-authority-model.md` § The separately-loadable reference.
        - The forward-compat check against `composable-workflows` D3 changed the implementation and then supported
          the decision from an unrelated direction. It **inverted the durability assumption**: D1's
          schema-out-of-band rule makes `probe-envelope.md` the growing, durable home for slot semantics while
          `session-init.md` compiles to a ~120–150-line spine, so the pointer names **authority boundaries** — a
          section the spine estimate retains — never a step or section number the compile dissolves. And it found
          that **mechanization reclassifies at least four of the six**: an `offer` step structurally cannot
          auto-execute and a `render` carries precomposed text, so this work unit's own repeated finding (a rule
          backed by a mechanical check is safely a default) turns them into defaults. Marking them today would have
          been wrong later, not merely misplaced.
        - The reclassification trigger generalizes past these six — any rule moving from prose to mechanism carries
          the same latent drift. Captured to `composable-workflows` rather than resolved here: whether it is a
          one-time pass at D3 or a standing obligation is that work unit's call.

## **Phase 5:** Instance register — `DEV-RULES.PROJECT`

_Purpose:_ Execute the instance register and mirror every disposition that reaches the shipped template, then
close the always-loaded ledger across every tier-1 surface this work unit touched.

_Design decisions:_ Trailing chunk — if the work unit narrows, this phase drops as instance **and** template
together, never half. The template is not a blank scaffold: where it carries a row's target, the row's
disposition applies there too and the increment stages both. Leaving it otherwise would apply this work unit's
thesis to one repository while every project kept inheriting the text the thesis calls inert. Since
`DEV-RULES.PROJECT` is **Configurable**, the package-counterpart warning does not fire, so the template edit is a
stated step in each task rather than an omission a check will catch; project-specific sections are edited in the
instance and framework sections in the package source, never copied between them. The mirror rule is a default,
not a guarantee: confirm the template's section is the same content before applying a row's disposition to it —
one row's heading exists in both files over entirely different text.

_Standing close-out:_ Phase 3's standing obligations apply here unchanged — a demotion writes its content into
the destination before the rules file loses it, every subtask that moves, renames, or empties a cited heading
sweeps that heading's inbound `§` citations across both copies in the same increment, and a subtask that removes
the last consumer of a link-reference definition prunes that definition in the same increment. § Testing
Requirements alone orphans three.

### `[x]` **5.1 Re-measure the instance register against base**

- _Goal:_ The instance dispositions execute against the current file, and the template's mirrored subset is
  measured rather than asserted.

    - Re-derived per heading against `origin/main` under Task 3.1's convention, trailing link block excluded by
      construction. The two unmerged base commits touch no tier-1 surface and neither copy of the file, so the
      pending merge cannot move any figure recorded here.
    - **Eighteen of twenty-one instance rows reproduce their recorded `nb` exactly**, and the file re-derives at 255
      — Task 3.1's corrected denominator, independently confirmed. Two of the three that moved are Δ0 rows: § Preamble
      is 6 not 7 (a hand-count error, 6 at every ref), and § Quality Gates' 61 nb span splits 24 / 37 rather than
      26 / 35 — the boundary was drawn two lines late, content did not move.
    - **One Δ changes:** the six numbered gate entries are 37 nb, so Δ28 → 30 at the row's own 7 nb residual. Task
      5.3.b settles that residual against `QUICK-REFERENCE`. Register: instance `firm` 54 → 56, instance 102 → 104,
      both files 244 → 246.
    - **The register's coverage is complete** — the only unclassified nb are two container headings (§ Documentation
      Standards, § Architecture Documentation, 1 nb each), which closes the arithmetic exactly at 255.
    - **The mirrored subset is five rows, 41 nb of the template's 118** — § Contents, the gate entries, § Code
      Quality Principles, § Markdown quality, § Documentation style. Twelve rows have no template heading at all;
      § Testing Requirements shares a heading but carries no target to demote.

- _Outcome:_ The instance enumeration is sound and, unlike Task 3.1's canonical pass, so is the accounting around
  it — every correction here landed in a row rather than a denominator. Two findings outrun the count. § Documentation
  style is **byte-identical** across the copies, so its disposition mirrors without re-derivation, while § Markdown
  quality's line-length rule holds the template's **pre-compression** form — meaning a mirrored row can require
  propagating an earlier unsynced compression before this work unit's applies. And the mirror is not a one-way
  subset: § File Organization and the ADR criteria are template-only, so no row classifies them and the phase's
  close, not a row, decides whether to touch them. The re-measured ledger is the larger result — the tier-1 set is
  **−23 nb against base**, a 46 nb swing from the +23 recorded through Task 3.4, so Criterion 3's net is already
  negative before this phase lands anything.

### `[x]` **5.2 Quality-gate retarget**

- _Goal:_ The quality-gate method resolves to a section that carries commands — in both copies and in the
  template — before the section it currently points at is emptied.

- _Rationale:_ The method's passthrough currently names `DEV-RULES.PROJECT` § Quality Gates. Emptying that
  section without the retarget breaks a declared fire site.

- _Note:_ A `.override` retarget is rejected: the package-source neutrality check would make it instance-only,
  leaving every project's method pointing at a section this work unit empties.

- _Note:_ `QUICK-REFERENCE` is template-paired, and the shipped copy's § Quality Gate Commands is a placeholder
  scaffold rather than a filled listing. The "already carries the commands" reading holds for this instance only.
  The move is lateral rather than a regression — the section the method points at today is equally a placeholder
  in the shipped copy — but do not expect to find a populated destination there.

    - `[x]` **5.2.a Retarget the method's `.default`**
        - `.default` now names `QUICK-REFERENCE` § Quality Gate Commands — on-demand rather than part of the
          always-loaded partial read, which is what makes it a redundancy demotion in the instance. Edited in the
          package source and mirrored by hand; the copies verified byte-identical afterward, since neither the
          byte-identity test nor the counterpart warning covers a Configurable file.
        - `[dev-rules-project]` lost its only consumer and was pruned in both copies; `[quick-ref]` replaces it,
          naming the post-install path per the convention two other package-source files already use for this
          template-paired target.

    - `[x]` **5.2.b Update the shipped template's § Quality Gates scaffold**
        - The four numbered command placeholders and both fill-them-in authoring comments left the template's
          § Quality Gates: 20 nb → 7, matching Task 5.1's measured surface. The shipped instruction and the shipped
          method now agree — commands in `QUICK-REFERENCE`, standards in `DEV-RULES.PROJECT`.
        - **Deviation:** the surviving comment was reworded rather than retained verbatim. With the listing gone it
          named absent content and still read as an instruction to record commands there, so it now sends the author
          to `QUICK-REFERENCE` instead of matching against it — the task's intent, made true.
        - Consequence accepted as planned: the scaffold's shape changes for projects, and filled-in instances keep
          working because the method resolves to whichever section carries the commands.

    - `[x]` **5.2.c Hand-verify every site the method fires from**
        - Two declaring files, one per copy — `process-task-loop` and its `.template` counterpart — each marking the
          method at the same three points, each resolving `[arc-methods-qg]` into its own tree. Verified by hand; no
          stale pointer, and no checker validates this.
        - The `post-task-quality` / `post-unit-quality` extensions name the tiers but declare no method, so they
          resolve no pointer and were out of scope by construction.

    - `[x]` **5.2.d Declare the method at the gate-running lifecycle workflows**
        - 5.2.c found two workflows running gates with no path to the commands: `verify-work-unit` § Step 1, and
          `integrate-work-unit` at six points. Both now declare `quality-gate-commands`, in both copies.
        - Under `analysis-load-set-scoping` § The demotion precondition this is **unsafe** rather than merely
          pointless — clause (a) has no trigger at the position and clause (b) fails because the workflows run the
          gates — so the declaration is the precondition that legitimizes Task 5.3.b, not an addition beside it.
        - Fire points marked at the first invocation each entry path reaches: § Step 1 for `verify-work-unit`, and
          both the Phase 1 review-iteration run and the Phase 2 Step 10 run for `integrate-work-unit`, whose
          documented mid-file re-entry means a Phase 2 resume never reads the Phase 1 site. The remaining four
          references were left untouched.
        - **Authored tier-numeral-free** against the settled gate-model reshape, following the vocabulary-neutral
          precedent of `DEV-RULES.PROJECT` § Selecting what to run. Both files carry the tier-numeral count they
          carried at base — 2 and 5 — so the pending rename sweep sees the surface it already sized.

- _Outcome:_ The retarget lands cleanly in both copies and the destination heading resolves on either side — lateral
  in the shipped copy, as the task's note predicted. The increment grew one subtask because the verification found the
  retarget was necessary but not sufficient: pointing the method at a section that carries commands does nothing for
  two workflows that never reached the method at all, and the demotion one task away turns that from latent to
  load-bearing. Closing it needed no new mechanism — the existing declaration, authored so the settled retirement of
  the tier vocabulary sweeps past it untouched.

### `[x]` **5.3 Firm and decided tiers**

- _Goal:_ The instance file's largest reductions land, with each demotion's content written to its destination
  and each cut's structural consequence resolved rather than left as a bare deletion.

- **Additional Context:** `notes-judgment-authority-model.md` § Line-level compression enumeration —
  `DEV-RULES.PROJECT` table, the `firm` and `decided` rows

    - `[x]` **5.3.a § Contents — cut whole**
        - Cut from both copies — 11 nb instance, 9 template. No live inbound `§ Contents` citation and nothing in
          the corpus anchors into `DEV-RULES.PROJECT.md#`, so the cut broke no reference.

    - `[x]` **5.3.b The six numbered gate entries**
        - 37 nb → 8. Commands, config paths, `typecheck:all`, the `shellcheck` system-install requirement, and the
          tooling names were written into `QUICK-REFERENCE` § Quality Gate Commands as a new § The gates
          subsection **before** the instance lost them. The four kept constraints compress to three bullets — the
          index-versus-worktree trap merges with re-stage-after-fix, one being the consequence of the other.
        - **Decided once, as instructed:** the three Markdown commands already in § Command Patterns are
          **cross-referenced, not moved** — that section owns the invocation gotchas (`--no-globs`, the MD060
          caveat), and a same-file pointer costs nothing while a copy would be a second place to update.
        - The destination's lead-in needed only a narrowing, not a redirect: § Selecting what to run stays in
          `DEV-RULES.PROJECT`, so deferring "which gates to run" there is still true; what changed is that this
          section now carries the gate listing itself.
        - Δ30, matching the projection — the residual Task 5.1 deferred here measures 7 nb, but only once it is
          **placed** correctly. Left where the numbered entries had sat, it put gate behaviors inside § Selecting
          what to run and carried a duplicate destination pointer; reseated under § Quality Gates it absorbs into
          the existing pointer, and § Selecting what to run returns **byte-identical to base**, which its
          `keep unchanged — the exemplar` disposition requires.

    - `[x]` **5.3.c § Testing Requirements**
        - 10 nb → 4; the coverage posture stays. The framework-and-tiers line and the methodology pointer left.
        - Destination checked for install reachability first: `testing-standards` is in **neither**
          `manifest.json` nor `init-recipe.json`, so no project receives it. It does not bite — the demoted lines
          describe this repository's own test layout, so the destination only has to exist in this instance. The
          tier root was written into its `.override` lead-in; the strategy pointer was already reachable through
          `STRATEGY-INDEX`. Pruned the three link definitions this orphaned, as the phase preamble predicted.

    - `[x]` **5.3.d § Markdown quality**
        - 8 nb → 6, mirrored in the template. **Δ2, not the projected 3:** the duplication is two lines — the
          zero-tolerance restatement and the run-the-linter line — while the template-first and READMEs bullets
          are conventions stated nowhere else and stayed.
        - The template's line-length rule is still the pre-compression form Task 5.1 recorded. Left alone
          deliberately: propagating that is a sync reconcile, not this row's cut, and Task 5.6 owns it.

    - `[x]` **5.3.e § Relationship to DEV-RULES.ARC**
        - Cut to one line. **Δ5, not 6:** the section closes a `##` block, so its span includes the structural
          `---` and the floor is heading + `---` + one line.

    - `[x]` **5.3.f § Code Quality Principles**
        - Cut DRY / SOLID / KISS. **Keep YAGNI**, reframed as scope discipline — "don't build what wasn't asked
          for" is a scope-authority rule agents do violate and ARC states nowhere else, not capability guidance.
        - The TypeScript standards and the pre-public-release compatibility posture stay.
        - **Rename the heading** to describe what remains. The acronyms are the section's opening content, so a
          bare deletion leaves a heading that no longer describes its contents. Relocating the posture into
          § Package-Project Sync is rejected — it would seat a code-standards rule inside a sync section.
        - Mirror the cut in the template, which carries the same list.
        - **The rename is instance-only.** The template's section has no compat posture and no TypeScript
          standards — after the cut it holds YAGNI, a composition line, and language-agnostic placeholder
          comments, which the instance-derived heading would misdescribe. Leave the template's heading as it is,
          and record why, so the divergence reads as a decision rather than a missed mirror.
        - Renamed to **§ Engineering Standards**, authored rather than inherited — no prior artifact settled a
          name, and the retired § Contents entry had already glossed the section as "engineering standards".
          YAGNI is now a two-line scope-authority rule; the posture and TypeScript standards are untouched.
        - Cut mirrored in the template; its heading stays `Code Quality Principles` per the row, since what
          remains there is the reframed rule, a composition line, and language-agnostic placeholders.
        - **Δ3, not the projected 7 — the projection was unreachable from its own disposition**, the same defect
          Task 3.3 found in § Task granularity: the cut removes 4 nb and the reframe costs 2 back, so Δ4 is the
          ceiling even with a one-line reframe. Nothing was dropped to chase the figure.
        - Sweep run and empty: no live inbound `§ Code Quality Principles` citation exists outside this work
          unit's own planning artifacts, and the only other references were the § Contents entries 5.3.a cut.

- _Outcome:_ `DEV-RULES.PROJECT` is **255 → 198 nb** and the template 105 → 91, with every disposition executed as
  written and none abandoned. Three of six Δs came in under projection — 57 delivered against 63 — and every
  shortfall was arithmetic rather than judgment: a miscounted duplication, a structural separator inside a span, and
  one projection unreachable from the disposition that produced it. The register's row-level content verdicts have
  now survived execution six more times; its Δ column has not, which is the same split Task 3.1 recorded when it
  found the enumeration sound and the accounting around it wrong. The one substantive lesson is about **placement,
  not counting**: a retained residual left where the demoted content used to sit landed gate behavior inside a
  subsection about check selection, and silently edited the one section the register marks keep-unchanged. Where a
  cut's remainder belongs is part of the cut.

### `[x]` **5.4 Authoring tier — compress in place**

- _Goal:_ The instance file's prose densifies without any constraint leaving it, and the one within-file
  relocation lands at the heading that describes it.

- **Additional Context:** `notes-judgment-authority-model.md` § Line-level compression enumeration —
  `DEV-RULES.PROJECT` table, the `authoring` rows and their Δ targets

    - `[x]` **5.4.a § Documentation style**
        - 12 nb → 8, Δ4. The collaborative voice and the whole reference-link convention stay — preferred form,
          the single trailing `---` and its EOF role, lowercase-hyphenated names, the same-directory inline
          latitude, the movable-artifact exception. The ❌/✅ pair and the four sub-bullets fold into prose.
        - Mirrored in the template, where the section is byte-identical, so the same edit applies twice: 91 → 87.

    - `[x]` **5.4.b § Commit Conventions (self-hosting)**
        - 12 nb → 9. The `commit-format` § Subject scope citation and the adopter-repo contrast compress to a
          clause; the scope rule, its seven-example locus list, the cross-cutting reservation, the
          lifecycle-ceremony allowance, and the `docs` rule all stay.
        - **Δ3, not the projected 4:** what remains after the rationale goes is a locus rule whose worked examples
          are its content. Cutting them to reach the figure would trade operability for a line.

    - `[x]` **5.4.c § Surface agent-side friction**
        - 14 nb → 10. The dev-internal scoping and the whole protocol are untouched; the two trigger-class
          definitions go 7 nb → 3, keeping both floors (systemic or likely-recurring; observable cost, never
          aesthetic preference, never before engaging recorded rationale) and the judgment-not-fact marking.
        - **Δ4, not the projected 6:** Δ6 requires the two definitions to collapse to a single line, and stating
          both floors does not fit in one.

    - `[x]` **5.4.d § Architecture Decision Records**
        - 12 nb → 3 + 6 relocated, Δ3. The pointer compresses to two lines; the leak rule moves to a new
          § Referencing across the boundary under § Audience Boundaries.
        - **Instance-only, despite the heading existing in both.** The template's section is different content
          under the same name — the write / don't-write criteria and a stability note, with no pointer to
          compress and no leak rule to relocate. The phase's mirror rule does not apply to this row.
        - **The destination heading was chosen by scope, not proximity.** § Surface taxonomy is `keep verbatim`
          and § Leak patterns enumerates prose patterns to avoid — a referencing constraint is neither, so
          appending it to either would have widened that heading's scope the way 5.3.b widened § Selecting what
          to run. Both neighbours, and § Selecting what to run, re-verified byte-identical to base afterward.
        - The move compressed 8 nb → 6, which is what makes Δ3 reachable: "ADRs are internal-only" and their
          directory are already carried by § Surface taxonomy's path list and the retained pointer.
        - Sweep run and empty — no live inbound `§ Architecture Decision Records` citation outside this work
          unit's own planning artifacts, and no link definition lost its last consumer.

- _Outcome:_ `DEV-RULES.PROJECT` is **198 → 184 nb** and the template 91 → 87, with no constraint leaving the file:
  every row is a rewrite in place and the one relocation stayed inside it. Δ14 delivered against 17 projected, and
  as in Task 5.3 both shortfalls are arithmetic rather than judgment — one projection assumed worked examples were
  rationale, the other assumed two floored definitions fit on one line. The tier's own lesson is the inverse of
  5.3's and confirms it: § Architecture Decision Records reached its figure **only** because the relocated rule
  compressed against content its destination already carried. Where a moved rule lands decides what it still has to
  say, so the destination's existing scope is an input to the move, not a check after it.

### `[x]` **5.5 Trigger tier — the gated demotions**

- _Goal:_ The instance file's gated rows demote to index entries that now fire, with the constraint half of each
  mixed row staying behind.

- **Additional Context:** `notes-judgment-authority-model.md` § Line-level compression enumeration —
  `DEV-RULES.PROJECT` table, the `trigger` rows

    - `[x]` **5.5.a § Workflow prose economy and § Verbs over mechanics**
        - 12 nb → 4, Δ8. Prose economy keeps a one-line obligation; verbs over mechanics keeps the verb-gap
          capture instruction.
        - **Nothing was written into the destination, because it was already there.** Verified clause by clause,
          not assumed: `strategy-workflow-authoring` § Body Conventions (Prose economy) carries the
          executing-session framing, the one-line test verbatim, and both the keep and the cut lists, plus a
          sentence the instance never had. The redundancy sub-case of the demotion precondition — cut, not copy.
        - **The verbs-over-mechanics rationale could not go to its named destination.** "The `arc` CLI is ours to
          grow — one degree of freedom adopters lack" is project-internal, and `strategy-workflow-authoring` is
          `classification: Framework` and ships; sending it there would breach § Audience Boundaries to satisfy a
          register row. Cut instead, which the content permits — it is rationale for a kept instruction, not a
          constraint — and the framing survives at zero body cost in the heading that already carried it.
        - Confirmed rather than assumed, per the row: the destination resolves in `init-recipe.json` and in
          `manifest.json` as `Framework` / `core`, and both copies are byte-identical, so its package-counterpart
          check is live.

    - `[x]` **5.5.b § Package-Project Sync**
        - 24 nb → 14, Δ10. The two-copy direction constraint and the npm-spike hazard stay verbatim.
        - The hook explanation is the same redundancy case as 5.5.a: `strategy-package-project-sync` § Safeguards
          already documents both checks, what they catch, and what they cannot, where the instance had five lines.
          Cut to a three-line pointer — which the destination had already pre-described, calling the instance
          section "a short section ... Points here for the full architecture".
        - The skill-drift hazard was the one genuinely absent from its destination, so it was written there first,
          as a new § Harness skill directories under § Two-Copy Architecture. Placed by scope per Task 5.4.d:
          § Safeguards documents automated checks and nothing checks this, while what the content states is that a
          third derived surface exists and which copy is authoritative for it.
        - Destination confirmed instance-only — absent from the recipe, the manifest, and the package tree, since
          `strategies/project/` ships as an empty surface. No counterpart obligation applies.

- _Outcome:_ `DEV-RULES.PROJECT` is **184 → 166 nb**, and both rows landed **exactly on projection** — the first
  task in either register phase whose Δ column survived execution untouched, against three of six in Task 5.3 and
  two of four in Task 5.4. The tier's finding is that two of its three demotions had nothing to move: the
  destinations already carried the content in more detail, so the standing write-first obligation was discharged
  by verification rather than by writing. That is the register's own **redundancy** sub-case arriving in
  execution, and it is invisible from the disposition column, which reads identically whether a destination holds
  the content or not. The sharper one is that **the destination column records reachability, never audience fit**
  — one row directed project-internal rationale into a shipping strategy, and no earlier pass could have caught it
  from the register alone.

### `[x]` **5.6 Reconcile the shipped template against the instance**

- _Goal:_ No register row lands in this repository while the shipped template keeps the text the row calls inert.

    - Walked all five mirrored rows. **Four had already landed with their originating task** — § Contents absent,
      the gate entries at their 7 nb residual, § Code Quality Principles at 8 nb with DRY / SOLID / KISS gone, and
      § Documentation style byte-identical to the instance. No row surfaced here that an upstream task had missed,
      so the check found no defect to attribute.
    - The one open item was the divergence Task 5.3.d deferred here by name: the template still held the
      **pre-compression** line-length rule. Propagated the instance's three-line form, 6 nb → 4. The template is
      **85 nb, from 105 at base**.
    - **Template-only content is left alone — the phase's close deciding, not a row.** § File Organization is
      placeholder scaffolding a project fills in, not inert prose, and the ADR write-when / don't-write-for
      criteria are the criteria this register **withdrew** from demotion; applying a withdrawn disposition to the
      copy the row does not reach would be executing a row that no longer exists.

### `[x]` **5.7 Measure the always-loaded ledger**

- _Goal:_ The compression claim is a measurement across the whole tier-1 full-read set, not an assertion about
  the two files that shrank most.

    - Re-measured end to end against `origin/main` rather than carried forward. **The tier-1 set is 828 → 716 nb,
      −112, or 13.5% of the base surface** — against −23 when Task 5.1 measured Phase 5's open. The instance
      register delivered the 89 nb difference exactly, and the +26 the index and brief surfaces spend is carried
      more than four times over, so Criterion 3 no longer depends on any single leg.
    - Every destination summoner fires, checked rather than assumed: the seven trigger-tier entries are present in
      the always-loaded `STRATEGY-INDEX`, and the three non-index destinations resolve through their own declared
      paths — the `quality-gate-commands` passthrough Task 5.2 retargeted, the `testing-standards` `.override`
      declared in `process-task-loop`, and the sync strategy's own index entry.
    - **Anchoring splits five operation-named against two residual-question, and neither form depends on the agent
      estimating its own state.** The residual-question pair reads as self-assessment and is not: both name the
      residual surfaces explicitly and the routine cover that handles the rest, so what the agent answers is
      whether the document in hand settled a named question — checkable against text. "Load when unsure" would
      fail this test; none is phrased that way.
    - Operation-locality holds for every Phase 5 destination — the failure mode is content demoted into a workflow
      it must outlive, and this phase demoted into strategies and methods only, both method destinations being read
      at the moment their operation runs.
    - No constraint left the always-loaded set. The determination is recorded per line — the register's `C?` column
      across all twenty-one instance rows, plus § Rule Authority's own table for Task 1.4's addition, where every
      rule-carrying block returned `constraint → stays`. Two demotions were withdrawn mid-register once the column
      re-read them as constraints.
    - **One determination the columns cannot express** surfaced at Task 5.5: a destination can be reachable and
      still be the wrong audience, which no `C?` or destination value encodes.

## **Phase 5.R:** Stop shape — the second axis

_Purpose:_ § Rule Authority derives whether a rule binds and says nothing about what binding looks like. Two live
failures show the shape axis is the one still costing turns — an agent stopping on an analyzer/host disagreement
whose entire cause it could establish, and another asking permission to drop a CI-defer flag and run the full
suite, where there is no answer but yes. This phase states the shape rule as two clauses in the same section,
narrows the stops across the core operation substrate those clauses reclassify, and re-derives the ledger the
additions move.

_Design decisions:_ **Reversibility is the discharging fact**, not the reading that the answer is obvious — the
inverse weighting is the intuitive one and it is the one this work unit's own demotion columns reject, since
"there is only one answer here" is the agent estimating its own state. Clause B's closing sentence is the
**interlock firewall**: without it, "reversible in one turn" reaches the task-interlock, because a commit is
reversible. Two audit proposals were rejected exactly there and are kept as the firewall's regression cases. The
audit ran as five delegated read-only regional passes and its output was advisory throughout; verification
against source rejected four of its twenty proposals, two because they re-opened decisions Phase 4 had already
settled the other way. Full inputs, dispositions, and reasoning live in `notes-judgment-authority-model.md`
§ Remedial phase. Task 5.R.f is off that concern — it closes the two template-only items Phase 5 measured and
parked, which would otherwise ship a second time unrecorded.

### `[x]` **5.R.a Land the two clauses and reconcile the always-loaded surface**

- _Goal:_ The shape rule is readable from § Rule Authority itself, and the always-loaded surfaces that restate or
  collide with it stop contradicting it.

    - Clause A sits in § Rule Authority immediately before "Reading an unmarked rule", verbatim as approved.
    - Clause B sits immediately after "Discharging a default", in the amended form: the exclusion reads _acts that
      cannot be undone or unspent_ and carries a costly pass as a fourth example beside merge, publish, and
      deletion. The closing interlock-firewall sentence is unchanged.
    - `AGENT-BRIEF.ARC`'s `Invariant` entry now reads "where the classifying reading does not settle it", pointing
      at the reading the adjacent `Default` entry already cites rather than at the rule's own text; zero line delta.
    - § Verify before assuming stops only on requirements and says why they are undischargeable; implementation
      details, file locations, and existing content route to the source instead.
    - § Review finding mutation guard's approval half carries its own `[invariant]` — load-bearing for the
      `task-audit` counter-finding, whose "this reaches no invariant" escape reads by inference without it.
    - § Quality gate failure dropped "there is nothing to report and"; § Leave it cleaner dropped "rather than
      spending a turn to ask". Both are Clause B's job now.
    - `DEV-RULES.PROJECT` § Quality Gates marks the zero-tolerance sentence rather than the heading, so
      § Selecting what to run's re-execution narrowing survives it. The sentence is identical in the shipped
      template, so Phase 5's mirror rule applied and both copies carry the marker.

- _Outcome:_ The always-loaded set takes **+8 nb**, not the notes' estimated +4 — the two clauses cost 9 and the
  three consistency edits net −1 rather than −5, since extending the mutation-guard marker and splitting the
  requirements trigger each added a line back. The estimate was never load-bearing: Task 5.R.e re-derives the
  ledger by measurement. This is the phase's only task touching a tier-1 file, so that measurement stays single.

### `[x]` **5.R.b Narrow the session-lifecycle stops**

- _Goal:_ Session entry and post-compaction recovery stop only where the deciding fact is not the agent's to
  establish, and degrade consistently everywhere else.

    - `session-init` § Conditional sync pulls: the notes-load degrade now fires on the dirt intersecting the
      resolved user directory rather than on any dirty tree. The `dirty` slot could not carry the narrowing —
      it reports the current worktree and holds no path set, while under linked-worktree operation the resolved
      directory lives in the primary — so the clause names its own instrument: take the directory from the load
      set's `WORKING-MEMORY` entry and run one `git status --porcelain` in the worktree holding it.
    - `session-init` § Branch-gone recovery gained an auto-recover arm at `resolved` + `proposedAction: switch` +
      clean tree, reported in orientation rather than prompted. `removable`, `external`, `surface`,
      `main-fallback`, and any dirty tree keep the prompt.
    - `session-init` item 9's malformed-cursor stop is scoped to the task-list read, matching every neighbouring
      degradation; the diagnostic still surfaces.
    - `session-init` § Entry dispatch's no-own-fetch rule is scoped to resolved slots, so it no longer reads as
      forbidding the commands Step 1's probe-failure fallback prescribes.
    - `session-recover` Step 3 loads the mapped workflow and surfaces the omission for an `execution` or
      `integration` resume; `planning` is genuinely unmapped and keeps its stop.
    - `session-recover` Step 3's slice stop is scoped to the current task section, whose failure means the
      verified anchor is wrong. A missing header or phase preamble surfaces and the read continues.

- _Outcome:_ Five of the six narrowings were pure rescoping — the stop already had a limb that resolved it, and
  the edit stated the limb. The notes-load one was not: its condition had no instrument, since `dirty` answers
  for the wrong worktree and carries no paths, so the narrowing had to specify a probe rather than reference a
  slot. That is the shape to expect wherever a stop keys on a coarse signal the envelope happens to expose —
  the coarse signal is the reason the stop is degenerate, and it cannot also be the fix.

### `[x]` **5.R.c Narrow the lifecycle and planning-stage stops**

- _Goal:_ The lifecycle and planning stages stop on material disagreement and genuine novelty rather than on a
  proxy signal whose cause the agent can resolve.

    - `integrate-work-unit` Step 13 now stops on an analyzer/host disagreement unless the conflicting path set is
      wholly regenerable — the line Step 4's advisory read already drew — and states why the narrowing is safe:
      the append-only merge below is the authoritative test and keeps its own conflict stop, and merging the base
      **in** is reversible, unlike the merge the step later authorizes. The unavailable-overlap,
      incomplete-evidence, and substantive-interaction stops are untouched.
    - `activate-work-unit` § PROJECT-PRD now halts on **material** disagreement, matching the qualifier
      `integrate-work-unit` carries for the same family; the section no longer says "rarely blocks" and then
      blocks always.
    - `create-spec` § TECHNICAL-OVERVIEW halts on tech genuinely new to the project. Absence from the document is
      the trigger to look rather than the finding, presence is confirmed against manifests, lockfiles, config, and
      existing code, and the halt fails closed on anything not confirmable.
    - `generate-tasks` resolves each named blocker against live work-unit state before stopping, rather than
      reading `**Related Work:**` — the state-blind read § Verify before assuming already forbids.
    - `process-task-loop` diagnoses a non-obvious gate failure read-only and then poses fix-now-or-defer, in place
      of an `Investigate?` prompt whose alternative did not exist. The mandatory stop is untouched.

- _Outcome:_ Four of the five stops had their own narrowing already written down elsewhere in the same file or
  family — Step 4's regenerable-only line, `integrate-work-unit`'s materiality qualifier, § Verify before
  assuming's ban on state-blind reads — so the edits are propagation, not new policy. That is the same
  propagation gap the work unit's Introduction catalogues, on the shape axis: the corpus keeps making the call
  correctly in one place and not carrying it to the next.

### `[x]` **5.R.d Close the method region and record the sweep**

- _Goal:_ The method region's two live defects are fixed, and every audit proposal — taken or rejected — has its
  disposition and reasoning recorded where the new success criterion can be validated against it.

    - `testing-standards` `.override` carries `[invariant]` on the destructive-verb clause and on prove-fail-first
      -after-a-fix, the project instantiations of two `.default` rules that already carry it. Instance-only: the
      package copy is `[No override configured]`, so there is nothing to mirror.
    - `assess-parallel-fit`'s repeated sentence is split at both sites. Reordering a foreign-owned work unit stays
      categorical — it commits another person — while starting your own work against a shared surface is named as
      the separate act it is, advisory per the file's own proportionality guard. No marker added; the constitutional
      parent covers the half that binds.
    - The complete disposition set is recorded in `notes-judgment-authority-model.md` § The complete disposition
      set — sixteen taken, four rejected in two pairs, each with its reasoning.
    - The family-`I` record is corrected: the region-local list ran to eight and contradicted the table above it.
      No marker was owed and none had landed, so SC4 stands and the list was the error.

- _Outcome:_ The two rejection pairs are the phase's most reusable evidence and they say opposite things. Pair one
  is the design working — Clause B's firewall excluded both proposals by construction, which is only demonstrable
  because someone proposed them. Pair two is the delegation failure mode: an audit handed a work unit's output but
  not its record re-opens decisions the record closed, and the re-openings are shaped exactly like findings. Only
  verification against the record separates them, which is why that pass is not delegable.

### `[ ]` **5.R.e Re-derive the always-loaded ledger against base**

- _Goal:_ The compression claim reflects what this branch actually ships, measured rather than adjusted.

    - Re-measure the tier-1 full-read set end to end against `origin/main`, the way Task 5.7 did. Never adjust the
      recorded 828 → 716 by arithmetic — the estimate that the clauses and consistency edits land near +4 net is
      an estimate, and the number that ships is the one the measurement returns.
    - Re-check the meta file's `## Release Notes Entry` and `## Completion Notes`, both composed at the first
      integration pass and both citing the superseded figure. They will not look stale, which is the risk.

### `[ ]` **5.R.f Close Phase 5's parked template-only items**

- _Goal:_ The two items Task 5.1 measured as template-only and handed to the phase close are decided rather than
  left open a second time.

- _Note:_ Off the stop-shape concern — a carried Phase 5 item, folded here because Phase 5 closed without
  recording a verdict on either. Moves no tier-1 figure: the template is not in Task 5.7's measured set, so
  Task 5.R.e is unaffected whichever way this lands.

    - Cut the shipped template's "**Write an ADR when:**" / "**Don't write an ADR for:**" criteria (13 nb of its
      89) down to the instance's pointer shape. Reachability holds without authoring anything: `STRATEGY-INDEX` is
      always-loaded in every project and its entry already names the residual question — "deciding whether a
      decision warrants one" — rather than the domain, and `strategy-adr-methodology.md` resolves in
      `init-recipe.json`. The instance carries no counterpart, so this is a template-only edit.
    - Assess § File Organization, the second parked item, under the same test and record the verdict either way.
      Template scaffolding a project fills in is a different class from inert generic guidance, so a keep is a
      legitimate outcome — an unrecorded one is not.
    - Both are constraint-or-not determinations in the register's sense; record them alongside the Phase 5 rows
      rather than only in this task's outcome.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

- _Note:_ Re-opened for Phase 5.R. The base merge brought `session-locus-model`'s first carve into the tree, so
  § Selecting what to run resolves to "everything" — the Markdown-only narrowing the first pass used no longer
  applies.

---

## Success Criteria

- `[ ]` Each of the six prior enactments, the three recorded live failures, and the forgeable self-report shape
  resolve from § Rule Authority with no new per-case rule — judged on whether a reader could reach the same answer
  from the section, never on whether a clause was written
    - The section reproduces the spec's settled normative text byte-for-byte in both copies (Task 1.1), and an
      independent read that did not author it returned nineteen findings, eleven confirmed (Task 1.6).
    - Re-open: Phase 5.R adds two clauses to the section, so the enactments resolve against changed text.

- `[x]` Autonomous `WORKING-MEMORY` additions resolve to propose-don't-self-add via backstop limb two, **against**
  the satisfaction test's own `default` verdict — the reserved case that tests whether the backstop can overturn
  its primary test
    - Task 1.6.c verified corpus-independence directly: no propose-versus-self-add rule ships anywhere in the
      package tree. Every operative clause had been rule-indexed, so the falsifier did not run until
      `Both limbs reach acts, not only rules` closed the act-versus-rule gap.

- `[x]` No bias-guard is cut or weakened in `DEV-RULES.ARC` or `DEV-RULES.PROJECT`, and `integrate-work-unit` and
  `verify-work-unit` survive unchanged
    - **Deviation.** The first clause holds; the second is literally breached. Task 5.2's quality-gate retarget
      edited both workflows in both copies — 12 and 8 lines — to add a `quality-gate-commands` declaration, three
      fire-point references, and two link definitions. **Purely additive: nothing removed, nothing weakened, no
      guard touched.** The regression floor was written before the retarget's fire sites were known, and the spec
      itself records that scoping the safety check to these two files alone would make the criterion
      unfalsifiable — the governed-surface arm carries the weight.
    - **Second deviation, and this one is not additive.** Task 5.R.c narrows `integrate-work-unit` Step 13's
      analyzer/host stop to a conflicting path set that is not wholly regenerable. Phase 5.R was authored naming
      that edit, so it is an approved change to the floor rather than a breach discovered after the fact. What the
      floor was protecting still holds: the append-only merge below keeps its own conflict stop and remains the
      authoritative test, the unavailable-overlap / incomplete-evidence / substantive-interaction stops are
      untouched, and the merge gate itself is unmoved. `verify-work-unit` is unchanged by this task.

- `[x]` Every rule-carrying method, strategy, workflow, and extension document in the **shipped** corpus is read
  for imperatives the default-unless-marked reading would reclassify, and each one found either takes a marker or
  is recorded as an accepted reclassification with its reasoning, in `notes-judgment-authority-model.md`
    - All four regions swept and recorded, corpora re-derived at execution: 25 methods, 21 strategies, 36
      workflows, 13 extensions. The strategy region re-derived to 21 against the spec's 20, which the criterion's
      re-derive-at-execution wording anticipates.

- `[ ]` The stop-shape axis resolves from § Rule Authority the way the force axis does: every audited stop either
  fires on a condition the agent cannot establish for itself, or is recorded in
  `notes-judgment-authority-model.md` as a rejected narrowing with its reasoning — judged on whether a reader
  could reach the same disposition from the section, never on whether a clause was written

- `[ ]` The always-loaded set ends net shorter, measured across both rules files, `STRATEGY-INDEX`, and
  `AGENT-BRIEF.ARC`
    - Re-open: Phase 5.R adds shipped surface to the set, so the figure is re-derived at Task 5.R.e rather than
      adjusted from the 828 → 716 the first pass measured.

- `[ ]` No constraint left the always-loaded set; every demoted line lands at a destination whose summoner fires,
  is operation-anchored, does not key on the agent estimating its own state, and carries a recorded
  constraint-or-not determination
    - Task 5.7. One limit the columns cannot express surfaced at Task 5.5 — a destination can be reachable and
      still be the wrong audience.
    - Re-open: Task 5.R.f demotes shipped template content, which owes the same determination.

- `[ ]` Every destination this register demotes into is a file projects actually receive — verified against the
  install recipe, not against the package tree — or the row was re-derived rather than demoted
    - Task 2.1 added four destinations to `init-recipe.json` and `manifest.json`; Task 5.5 re-confirmed
      `strategy-workflow-authoring` resolves in both, and that `strategy-package-project-sync` is correctly
      instance-only rather than a recipe omission.
    - Re-open: Task 5.R.f adds `strategy-adr-methodology` as a destination.

- `[x]` Every heading this work unit moved, renamed, or emptied has had its inbound `§` citations swept and
  updated across both copies
    - Swept per task at the moment of each cut, and `lint:arc:section-refs` validates the whole corpus clean over
      1328 files.

- `[x]` `quality-gate-commands` resolves to a section carrying commands in both copies and in the shipped
  template, and every site it fires from was verified by hand
    - The passthrough is identical in both copies of the method, and § Quality Gate Commands carries commands in
      `QUICK-REFERENCE.md` and in the shipped `QUICK-REFERENCE.template.md`.

- `[ ]` Every Framework edit was authored in the package source and synced; every Configurable and
  manifest-unclassified edit reached both copies by hand
    - Every changed file with a counterpart is byte-identical across the copies, except the three
      manifest-unclassified ones — `STRATEGY-INDEX`, `testing-standards`, `DEV-RULES.PROJECT` — each of which
      carries this branch's edits in both copies, which is the expected shape rather than drift.
    - Re-open: Phase 5.R edits eleven further files, including one instance-only edit inside
      `testing-standards`' `.override`, whose package counterpart carries no override block to mirror.

- `[ ]` All quality gates pass (tests, linting, type checking)
    - Re-open: Tier 3 runs whole again at Task 6.1, over a tree that now carries TypeScript no gate run on this
      branch has seen.

- `[ ]` Ready for integration

---

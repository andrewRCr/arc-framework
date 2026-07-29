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

### `[ ]` **3.3 Decided tier — the settled cuts**

- _Goal:_ The two canonical cuts land as narrowed, removing proxy guidance while every qualitative signal and
  every prohibition stays.

- _Rationale:_ Both cuts survive the loud-versus-quiet test because what leaves is a capability proxy the model
  has outgrown, while the guard that fails quietly stays. Demotion is unavailable for either — no trigger reaches
  ad-hoc in-session decomposition.

- **Additional Context:** `notes-judgment-authority-model.md` § The judgment tier, discharged

    - `[ ]` **3.3.a § Task granularity**
        - Cut the two numeric bullets; keep the two qualitative ones. The proxies are what misfire; the
          qualitative signals carry the principle.

    - `[ ]` **3.3.b § Verify before assuming**
        - Cut the search-first and ask-clarifying steps. The "stop and ask" step and the "Never generate or
          assume" list stay — the prohibition is the guard, and step 1 is its procedural twin.

### `[ ]` **3.4 Rephrasings under § Rule Authority**

- _Goal:_ Four sections that had been re-deciding the authority question locally read off § Rule Authority
  instead, and the brief stops duplicating a binding whose shape changes here.

- _Rationale:_ Restating a derivable conclusion in a high-traffic rule's own text is permitted and expected — a
  rule whose application depends on the reader supplying the derivation is applied inconsistently. The test is
  reachability: could a reader reach the same answer from § Rule Authority without the restatement?

- _Note:_ Tier accounting — § Task interlock's team-elaboration demotion is trigger-tier work executed here
  rather than in Task 3.6, because its rephrasing is what forces subtask 3.4.f.

- _Note:_ Two integration tests assert this file's prose directly, and neither test name suggests it.
  `review-gate-workflows.test.ts` requires the two copies byte-identical and matches three phrases inside
  § Review-Increment Invariant ¶2; `pr-open-extensions.test.ts` matches three phrases from § Review finding
  mutation guard and forbids `GitHub` / `CodeRabbit` / `review-gate` file-wide. Preserve the asserted phrases
  verbatim. If one goes red, the fix is the edit, never the assertion — relaxing it retires the invariant it
  exists to protect.

    - `[ ]` **3.4.a § Quality gate failure**
        - Re-read the section at base first — the two-branch rewrite landed upstream during planning and is
          already an independent enactment of this model.
        - Add the missing limb: a gate that **never ran** is not a gate failure. Correct the invocation and re-run
          — there is nothing to report or decide.
        - State the narrowed invariant explicitly: a red gate never becomes a green report, and is never bypassed.

    - `[ ]` **3.4.b § Review-Increment Invariant**
        - Restructure the second paragraph's four exempted operations as a list. Paragraph one stays unqualified.
        - The restructured paragraph is the one under regex assertion: "sole bounded exception … provisional
          integration candidate", "implementation or finding-driven fix … structured approval gate", and
          "exact-head integration authorization" must all survive the reflow, and the two copies must stay
          byte-identical.

    - `[ ]` **3.4.c § Leave it cleaner**
        - Resolve the contradiction between "always propose placement before acting" and the inline-fix permission
          two lines above it: a same-concern cleanup in a file already under edit is a discharged default.
        - **Field evidence from Phase 1, worth writing the rephrasing against.** Two same-concern mechanical fixes
          during Task 1.4 — reverting a table-formatter regression on an untouched row, and correcting nested
          backticks that tripped MD038 — were fixed and reported without a proposal turn. Both were correct under
          § Quality gate failure's deterministic-same-concern branch and both violated "always propose placement,"
          which is the over-firing this row exists to fix. The rephrasing should make that class explicitly
          dischargeable rather than leaving the two rules to disagree.
        - § Quality gate failure's first branch is the shape to match — it already states the judgment split this
          row needs, so the rephrasing is an alignment rather than a new rule.

    - `[ ]` **3.4.d § Commit control — reseat merge authority**
        - Move the merge-authority block out of commit control into a new `### Merge authority` subsection under
          § Commit Discipline — a heading that names what the block is about, where a reader looking for merge
          rules will look. Within-file relocation, not a demotion: the block stays whole and stays always-loaded.
        - Do not seat it by adjacency to § Commit control's interlock-vocabulary bullet — Task 3.6.e demotes that
          bullet in this same phase. The interlock terms resolve through `AGENT-BRIEF.ARC`'s vocabulary block,
          which stays always-loaded.
        - Keep the not-authorization enumeration **whole**: classifying the rule invariant establishes that an
          authorization is required, not that a general "proceed" is not one.
        - Close by sweeping inbound `§ Commit control` citations across both copies, retargeting those that meant
          the merge rule.

    - `[ ]` **3.4.e § Task interlock**
        - Rephrase the leaf binding to a **floor** plus an explicit boundary parameter; the deferred-review
          signals stay.
        - Demote the team elaboration to `strategy-team-coordination` (entry re-authored in Task 2.2.e).

    - `[ ]` **3.4.f `AGENT-BRIEF.ARC` — delete the duplicate leaf-binding**
        - The `Review increment` entry's "Default boundary: one leaf task" would otherwise disagree with the
          reparametrized binding in 3.4.e.
        - The discharge is **deletion, not synchronization** — both surfaces are always-loaded full-read, so
          removing the copy removes a copy and not the rule, and it retires the synchronization burden
          permanently.
        - Both copies.

### `[ ]` **3.5 Authoring tier — compress in place**

- _Goal:_ The prose around a constraint densifies while the constraint itself stays always-loaded and intact.

- _Note:_ No detail loss. Two compressions were retracted during planning on exactly this ground and stay
  retracted: § Write for the reader keeps **both** reader-hostile examples, and § No meta-project references keeps
  its examples — in both cases the examples do real disambiguation work.

- **Additional Context:** `notes-judgment-authority-model.md` § Line-level compression enumeration —
  `DEV-RULES.ARC` table, the `authoring` rows and their Δ targets

    - `[ ]` **3.5.a § Documentation Boundaries family**
        - § No meta-project references in code — compress; nothing would summon the examples, so they stay.
        - § Artifact relocatability — compress; it is a rationale preamble to the section below it.
        - § `.arc/` artifact references — keep both rules; compress.
        - § Write for the reader — compress the communication-artifact expansion only.
        - § Commit and PR surface language — compress.

    - `[ ]` **3.5.b § Commit Discipline authoring items**
        - Amend scope — compress.
        - Meta-file timing and commit shape — compress.
        - Both are bullets inside § Commit control, not headings of their own, so these are in-place bullet edits
          and neither carries a citation sweep.

### `[ ]` **3.6 Trigger tier — the gated demotions**

- _Goal:_ The largest tier leaves the always-loaded set for destinations whose triggers now fire, with the
  constraint half of every mixed row staying behind.

- _Note:_ Blocked until Phase 2 completes — each destination below reaches its content through the index entry
  re-authored there.

- _Note:_ `strategy-interlock-release-wrappers` comes under the package-counterpart check once Task 2.1 lands;
  confirm that rather than assuming it. `strategy-team-coordination` does not and will not — it is outside this
  repository's manifest by the team-mode condition — so it stays a by-hand surface in both copies.

- **Additional Context:** `notes-judgment-authority-model.md` § Line-level compression enumeration —
  `DEV-RULES.ARC` table and the itemized § Commit control table, the `trigger` rows

    - `[ ]` **3.6.a § Scaled Process, Invariant Discipline**
        - Keep the invariant-floor line; demote the `Class`-versus-Work-Character taxonomy.

    - `[ ]` **3.6.b § Design before implementation**
        - Keep the settle-all-settle-able-design-up-front constraint; demote the rationale.

    - `[ ]` **3.6.c § Session state control**
        - Keep the write-trigger constraint; demote the file model and portability.

    - `[ ]` **3.6.d § Context quality**
        - Keep the opening line and the boundary procedure — its second step is a mandatory stop.
        - Keep the three blocks this row does not name: prefer-handoff-at-natural-boundaries,
          compact-and-recover-between-them, and end-of-session. The first is prohibition-shaped — context pressure
          alone does not force early handoff — so it is a constraint and does not demote. The row's Δ re-derives
          at Task 3.1 against this keep-set rather than the reverse.
        - `Natural session boundaries` lists **three** categories: mode transitions, structural boundaries, and
          quality signals.
        - Cut the quality-signals bullet **entirely**: it asks the agent to detect its own degradation, and an
          agent reliable enough to do so would not be drifting.
        - **Extract as a one-line keep** the "note the handoff opportunity if significant context has accumulated"
          clause from structural boundaries — that clause, not the quality-signals bullet, is what produces the
          handoff-boundary behavior worth keeping.
        - Demote the two remaining categories. With one cut, one demoted pair, and a clause lifted out, the
          `Natural session boundaries` lead-in no longer introduces a list — resolve it the way Task 5.3.f
          resolves its heading rather than leaving it stranded.

    - `[ ]` **3.6.e § Commit control — the wrapper and routing mechanics**
        - Demote the interlocks-gate / fire-sites-release concept, the wrapper mechanics, and the class-tag
          routing mechanics.
        - Keep off-workflow-uses-raw-`git`, destructive-flags-stay-literal, and the class-authorization
          preconditions.
        - Close by sweeping inbound `§ Commit control` citations across both copies.

    - `[ ]` **3.6.f § Rule Authority — § Whose call, if Task 1.4.b determined `demote`**
        - Conditional on that determination; a `stays` verdict makes this subtask a no-op to be struck.
        - Destination is `strategy-team-coordination`, reachable from Task 2.2.e.
        - Carries the credit Task 1.4.c recorded as pending, closing the ledger entry rather than opening a
          second one.

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

### `[ ]` **4.1 Sweep the method corpus**

- _Goal:_ The region with no classification precedent at all is the first to have its imperatives classified,
  and each result is recorded with its reasoning rather than left implicit.

- _Approach:_ Per document, read for imperatives the default-unless-marked reading would reclassify. Each one
  found either **takes a marker** or is **recorded as an accepted reclassification** with the reasoning that
  accepted it. There is no third outcome.

    - Exclude the directory `README.md` indexes — they carry no rules.
    - Re-derive the document count at execution; the criterion is the corpus, not the number.
    - Record as a per-document sweep table in `notes-judgment-authority-model.md`.

### `[ ]` **4.2 Sweep the strategy corpus**

- _Goal:_ The densest rule-carrying region outside the rules files is classified, and the live counterexample
  candidate is resolved rather than left standing.

- _Note:_ `strategy-package-project-sync`'s "never `cp`" — scoped to Configurable files — reads as a `default`
  under the satisfaction test, since the agent can name and establish "this file carries no project overrides."
  Whether that is a genuine conflict is the sweep's question: the pre-commit error fires only when overrides
  existed at HEAD, so the discharging fact and the enforcement condition may not overlap. Examine it; do not
  assume the conflict.

    - Covers both `strategies/arc/` and `strategies/project/`.
    - Whichever way the counterexample lands, it is the class of result the falsifiability goal exists to
      surface — record it either way.

### `[ ]` **4.3 Sweep the workflow corpus**

- _Goal:_ The largest region of the governed corpus is classified on the same terms as the rest.

    - The highest raw imperative density in the corpus; expect the largest finding volume here.
    - The only region where the shipped and installed sets differ — one workflow ships with no instance
      counterpart. Sweep the shipped set; re-derive which files are in that position rather than assuming it is
      still exactly one.
    - Five workflows are template-paired rather than mirrored. A finding in one of those lands in the shipped
      template, not only in the instance.

### `[ ]` **4.4 Sweep the extension corpus**

- _Goal:_ The region the presumption's own enumeration nearly omitted is swept, so a low expected yield is a
  measured result rather than an assumption.

    - Lowest expected yield of the four — no `never` / `must not` line appears in the region at all.
    - Absence of those keywords is not absence of imperatives; read for the obligation, not the vocabulary.

### `[ ]` **4.5 Reconcile the marker footprint and record the enabling category**

- _Goal:_ The marker set follows what the sweep found, and the sweep's one structural finding about content kinds
  is recorded where the work units that need it will reach it.

    - `[ ]` **4.5.a Reconcile the marker footprint against the sweep**
        - Task 1.5's roughly-five was a prediction. A materially larger marked set is a finding about the
          discriminator's reach, recorded as such — the footprint follows the sweep rather than capping it.
        - Apply any additional markers in both copies, in the `[invariant]` notation Task 1.5.a establishes.

    - `[ ]` **4.5.b Record the enabling content category**
        - A third category beside constraint and explanatory: **enabling** content carries no obligation itself
          but is a precondition for interpreting content that does. Demoting an enabling definition silently
          degrades every rule that uses the term.
        - Record the derivation only. Applying the compression method to an orientation surface is out of scope —
          a sibling work unit owns that audit.

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

### `[ ]` **5.1 Re-measure the instance register against base**

- _Goal:_ The instance dispositions execute against the current file, and the template's mirrored subset is
  measured rather than asserted.

    - Same counting convention as Task 3.1, including the trailing-link-block exclusion.
    - Identify every row whose target the shipped template also carries; that mirrored subset is additional edit
      surface, not additional register lines.

### `[ ]` **5.2 Quality-gate retarget**

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

    - `[ ]` **5.2.a Retarget the method's `.default`**
        - Destination is `QUICK-REFERENCE` § Quality Gate Commands — an on-demand section rather than part of the
          always-loaded partial read, which is what makes this a redundancy demotion in the instance.
        - The method is **Configurable**, not Framework: edit `.default` in the package source and mirror by hand.
          Neither the byte-identity test nor the counterpart warning covers it, so nothing checks the mirror.
          `QUICK-REFERENCE` is Configurable too — the same applies to every edit this task makes there.

    - `[ ]` **5.2.b Update the shipped template's § Quality Gates scaffold**
        - So the shipped instruction and the shipped method agree: commands recorded in `QUICK-REFERENCE`,
          standards in `DEV-RULES.PROJECT`.
        - The four numbered command placeholders leave the template's § Quality Gates, and so do the two
          authoring comments that instruct filling them in — one asks for each gate's command and config
          location, the other for adding and removing gate entries; both become false once the listing is gone.
          The comment pointing at `QUICK-REFERENCE` § Quality Gate Commands is the one the retarget leaves true,
          and it stays.
        - Consequence to accept: the scaffold's shape changes for projects. Existing filled-in instances keep
          working, since the method resolves to whichever section carries the commands.

    - `[ ]` **5.2.c Hand-verify every site the method fires from**
        - No checker validates method fire-point marking, so this is a hand obligation.
        - Verify each declaring workflow reaches the retargeted content, not a stale pointer.

### `[ ]` **5.3 Firm and decided tiers**

- _Goal:_ The instance file's largest reductions land, with each demotion's content written to its destination
  and each cut's structural consequence resolved rather than left as a bare deletion.

- **Additional Context:** `notes-judgment-authority-model.md` § Line-level compression enumeration —
  `DEV-RULES.PROJECT` table, the `firm` and `decided` rows

    - `[ ]` **5.3.a § Contents — cut whole**
        - Same argument as Task 3.2.a. Mirror the cut in the template, which carries the same block.

    - `[ ]` **5.3.b The six numbered gate entries**
        - Demote the commands behind Task 5.2's retarget; **keep** the four constraints `QUICK-REFERENCE` does not
          carry: the index-versus-worktree false-green trap, re-stage-after-fix, the worktree check's fails-closed
          behavior, and "run both before declaring types green."
        - The destination is not already populated. `QUICK-REFERENCE` § Quality Gate Commands carries the tier
          command blocks but not `typecheck:all`, the five config paths, the `shellcheck` system-install
          requirement, or the tooling names — those arrive with this demotion. Three commands the section needs
          already live in § Command Patterns; decide once whether they move or are cross-referenced, rather than
          per item.
        - Re-read the destination section's own lead-in afterwards: it currently defers "which gates to run" to
          the section this task empties.
        - Blocked on Task 5.2 — do not empty the section before the retarget lands.

    - `[ ]` **5.3.c § Testing Requirements**
        - Keep the coverage posture; demote the tier and method elaboration to the method declarations, which
          already fire.

    - `[ ]` **5.3.d § Markdown quality**
        - Keep the line-length rule and the underfill note; cut the always-run-lint duplication.
        - The template carries the duplicated line too — mirror the cut.

    - `[ ]` **5.3.e § Relationship to DEV-RULES.ARC**
        - Cut to a one-line "both apply" — the rest is pure cross-reference reconciliation.

    - `[ ]` **5.3.f § Code Quality Principles**
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
        - Close by sweeping inbound `§ Code Quality Principles` citations across both copies.

### `[ ]` **5.4 Authoring tier — compress in place**

- _Goal:_ The instance file's prose densifies without any constraint leaving it, and the one within-file
  relocation lands at the heading that describes it.

- **Additional Context:** `notes-judgment-authority-model.md` § Line-level compression enumeration —
  `DEV-RULES.PROJECT` table, the `authoring` rows and their Δ targets

    - `[ ]` **5.4.a § Documentation style**
        - Keep the collaborative voice and the reference-link convention; compress the examples.
        - The template carries this section — mirror the compression.

    - `[ ]` **5.4.b § Commit Conventions (self-hosting)**
        - Keep the scope rule; compress the rationale. Instance-only.

    - `[ ]` **5.4.c § Surface agent-side friction**
        - Keep the standing instruction; compress the two trigger-class definitions. Instance-only.

    - `[ ]` **5.4.d § Architecture Decision Records**
        - Compress the pointer in place — the instance carries only a pointer, not the decision criteria.
        - Relocate the internal-only leak rule into § Audience Boundaries. Within-file move, not a demotion —
          nothing here leaves the always-loaded set.
        - **Instance-only, despite the heading existing in both.** The template's section is different content
          under the same name — the write / don't-write criteria and a stability note, with no pointer to
          compress and no leak rule to relocate. The phase's mirror rule does not apply to this row.
        - Close by sweeping inbound `§ Architecture Decision Records` citations across both copies.

### `[ ]` **5.5 Trigger tier — the gated demotions**

- _Goal:_ The instance file's gated rows demote to index entries that now fire, with the constraint half of each
  mixed row staying behind.

- _Note:_ Blocked until Phase 2 completes.

- **Additional Context:** `notes-judgment-authority-model.md` § Line-level compression enumeration —
  `DEV-RULES.PROJECT` table, the `trigger` rows

    - `[ ]` **5.5.a § Workflow prose economy and § Verbs over mechanics**
        - Prose economy — demote, keeping a one-line obligation.
        - Verbs over mechanics — keep the verb-gap capture instruction; demote the rationale.
        - Both to `strategy-workflow-authoring`, which Task 2.1 brings under manifest classification and its
          package-counterpart check; confirm that landed rather than assuming it.

    - `[ ]` **5.5.b § Package-Project Sync**
        - Keep the two-copy direction constraint and the npm-spike hazard; demote the hook explanation and the
          skill-drift hazard.
        - Destination is instance-only — that strategy directory ships as an empty surface.

### `[ ]` **5.6 Reconcile the shipped template against the instance**

- _Goal:_ No register row lands in this repository while the shipped template keeps the text the row calls inert.

    - Walk the mirrored subset identified in Task 5.1 and confirm each row's disposition reached the template.
    - This is the check, not the primary edit — each task above stages both. A row surfacing here that was missed
      upstream is a defect in that task, not a step this one absorbs silently.

### `[ ]` **5.7 Measure the always-loaded ledger**

- _Goal:_ The compression claim is a measurement across the whole tier-1 full-read set, not an assertion about
  the two files that shrank most.

- _Rationale:_ Measuring two files in isolation cannot detect a wash, and omitting the brief would leave the
  ledger open exactly where the constitutional half spends.

    - Measure across every tier-1 surface this work unit touched: both rules files, `STRATEGY-INDEX`, and
      `AGENT-BRIEF.ARC`. The tier-1 full-read set is fixed by the load-set projection, so the measurement boundary
      is a resolved fact rather than a judgment.
    - Record, beyond the net figure: that every demoted line's destination summoner fires, is anchored to the
      operation rather than to a workflow the content must survive outside, and does not depend on the agent
      estimating its own state.
    - Record that no constraint left the always-loaded set, and that each demoted line carries a recorded
      constraint-or-not determination — so a violation is visible rather than inferred.
    - The determination covers § Rule Authority's own addition (Task 1.4) as well as the register's rows.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Each of the six prior enactments, the three recorded live failures, and the forgeable self-report shape
  resolve from § Rule Authority with no new per-case rule — judged on whether a reader could reach the same answer
  from the section, never on whether a clause was written

- `[ ]` Autonomous `WORKING-MEMORY` additions resolve to propose-don't-self-add via backstop limb two, **against**
  the satisfaction test's own `default` verdict — the reserved case that tests whether the backstop can overturn
  its primary test

- `[ ]` No bias-guard is cut or weakened in `DEV-RULES.ARC` or `DEV-RULES.PROJECT`, and `integrate-work-unit` and
  `verify-work-unit` survive unchanged

- `[ ]` Every rule-carrying method, strategy, workflow, and extension document in the **shipped** corpus is read
  for imperatives the default-unless-marked reading would reclassify, and each one found either takes a marker or
  is recorded as an accepted reclassification with its reasoning, in `notes-judgment-authority-model.md`

- `[ ]` The always-loaded set ends net shorter, measured across both rules files, `STRATEGY-INDEX`, and
  `AGENT-BRIEF.ARC`

- `[ ]` No constraint left the always-loaded set; every demoted line lands at a destination whose summoner fires,
  is operation-anchored, does not key on the agent estimating its own state, and carries a recorded
  constraint-or-not determination

- `[ ]` Every destination this register demotes into is a file projects actually receive — verified against the
  install recipe, not against the package tree — or the row was re-derived rather than demoted

- `[ ]` Every heading this work unit moved, renamed, or emptied has had its inbound `§` citations swept and
  updated across both copies

- `[ ]` `quality-gate-commands` resolves to a section carrying commands in both copies and in the shipped
  template, and every site it fires from was verified by hand

- `[ ]` Every Framework edit was authored in the package source and synced; every Configurable and
  manifest-unclassified edit reached both copies by hand

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

---

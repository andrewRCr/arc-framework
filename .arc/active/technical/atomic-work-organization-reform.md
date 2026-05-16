# Atomic Tasks — Work Organization Reform

**Purpose:** Tracking of indivisible one-off tasks you elect to do in parallel to the
planned work — discovered during execution, not required for the work unit's success
criteria. No phases or numbering hierarchy; items are flat parent-level entries under
a single `## Tasks` wrapper.

**Ordering:** Incomplete tasks (`[ ]`) stay at the top. Completed tasks (`[x]`) sink
below them in completion order (oldest completed first). See process-task-loop §
Atomic Task Completion for the full protocol.

> Multi-step work required for the WU belongs in the task list as a new phase.
> For multi-step work outside the WU's concern, see `manage-incidental-work.md`.

---

## Tasks

### `[ ]` **Extend wrapper routing to off-workflow incidental commits under release-mode interlocks**

- _Observation:_ Yesterday's `4d98a1ce` codified the _approval/prompt-shape_ half of incidental-vs-task
  unification — DEV-RULES.ARC § Implied-approval scope plus `process-task-loop` § Incidental Commit
  Discipline establish that the structured prompt at an incidental change confers the same approval
  provenance as a task-interlock approval ("user's affirmative covers both work AND commit, one turn").
  The _routing_ half didn't land: DEV-RULES.ARC § Release-wrapper invocation still reads
  `Off-workflow commits ... use raw git even when opt-in is on`, and
  `strategy-interlock-release-wrappers.md` § Scope frames wrapper invocation as "trigger-bounded" with
  harness bypass mode positioned as the friction-removal layer for incidentals. Result: incidental
  commits today require redundant approval-then-commit-prompt cycles even under
  `releaseOptedIn: true` + `commitInterlock: on-workflow`, contradicting the implied-approval-scope
  rule's intent (one approval, both halves).

- _Premise:_ Once an incidental commit has approval provenance (per implied-approval-scope), the
  wrapper's binding to "codified trigger points" is satisfied by the structured-prompt approval — the
  approval gate IS the trigger point. The wrapper's interlock-state validation still fires (refuses if
  no fresh approval provenance), preserving the audit/trust properties without the workflow-vs-incidental
  routing axis.

- _Proposed changes:_
    - **DEV-RULES.ARC § Release-wrapper invocation:** retire the "Off-workflow commits ... use raw `git`"
      clause. Replace with: under `releaseOptedIn: true` + non-`manual` `commitInterlock`, all commits
      with structured approval provenance route through wrapper (workflow-emitted and incidental alike);
      under `manual` or `!releaseOptedIn`, raw `git`. Class tags retain their documentary role; routing
      consolidates around opt-in + interlock-mode.
    - **strategy-interlock-release-wrappers.md § Scope:** rewrite the "Triggered Commits Only" subsection
      around approval-provenance rather than fire-site-binding. The trust shift becomes "wrapper carries
      approval provenance to git" — provenance can originate from task interlock, workflow interlock, or
      structured implicit-approval prompt. Harness bypass mode framing carries forward but for a
      different boundary (commits without ARC approval-provenance at all — e.g., direct shell-driven
      fixups outside an agent session).
    - **process-task-loop § Incidental Commit Discipline:** flip "routing follows existing rules" to a
      concrete statement aligned with the new DEV-RULES rule. Add a worked example: incidental fix
      surfaced mid-session → structured prompt → user `y` → agent invokes `arc release commit` (under
      release-mode opt-in). The audit entry records the approval source.
    - **`releaseRouting` envelope payload:** today carries `taskCommit` / `workflowCommit` /
      `workflowPush` as three separate routes. Consider folding into a single `commit` / `push`
      routing decision once the workflow-vs-incidental axis is retired. Or retain the three keys but
      add an `incidentalCommit` key (routing-equivalent to `taskCommit` under release-mode interlocks)
      so off-workflow fire sites have an explicit lookup target. Decide at impl.

- _Scope:_ Quick-tier minimum — touches DEV-RULES.ARC (constitutional), a flagship strategy doc, a
  load-bearing workflow, and likely the session-init envelope CLI code. ADR-light treatment warranted
  since this reverses the explicit "trigger-bounded" framing in
  `strategy-interlock-release-wrappers.md`. Sequencing-wise, lands cleanly after — or alongside —
  the visibility/lookup atomic above; the visibility atomic doesn't depend on this routing flip.

- _Captured during:_ Today's commit-routing audit (93b50a4a's raw-`git` use matched current docs but
  not user intent). User confirmed the routing migration as the originally-intended companion to
  yesterday's implied-approval-scope codification.

### `[x]` **Audience-vocabulary sweep — WU docs (PRD + task list)**

- _Outcome:_ Swept both WU docs for `\badopters?\b` (case-insensitive). 14 replacements total:
  8 in `prd-work-organization-reform.md` (R27 `docs` example, R28 method-composition framing, R1
  amendment prose, plus body prose addressing the reader as "adopter"); 6 in
  `tasks-work-organization-reform.md` (outcome notes describing method capabilities, body prose,
  one decision-gate bullet). 38 mentions kept across both files — all surface-category labels
  (`adopter-facing strategy/prose/sweep/...`), historical decision records, and meta-discussion of
  the audience-vocabulary rule itself (essential context that explicitly names the framework-author
  audience). Tier 1 lint clean. Closes the spec-carryover risk that surfaced at 2.13.a; downstream
  phases now port from clean source.

### `[x]` **Workflow-interlock convention codification + Phase 3 application**

- _Outcome:_ Codified workflow-interlock convention in `strategy-workflow-authoring.md` §
  Interlock markers — advance-signal forms (quoted-verb / named-target with direction / approval
  split), trigger-driven embedded placement, standalone-step prohibition, gate-vs-fire separation.
  Applied to Phase 3 boundary workflows: dissolved 2 standalone interlocks in
  `integrate-work-unit.md` (cascade renumber 7+→6+ and 12+→11+); promoted buried commit-fire to
  explicit substep at `1_create-prd.md` Step 7; trimmed stale "last gate" prose at Step 5. Sibling
  sweep across remaining workflows tracked in ATOMIC-INBOX.

### `[x]` **Class-tagged fire-site admonition convention + Implied-approval scope rule**

- _Outcome:_ Codified `[!CAUTION]` admonition pattern for class-tagged fire sites in
  `strategy-workflow-authoring.md` § Routing class tags — shape ``> `<interlock>` release — <verb>
  as `<class>`:`` mirrors interlock-marker shape (gate/fire structural symmetry; both backtick-wrap
  the interlock name). Added "Concept relationship" paragraph + "Implied-approval scope" rule to
  DEV-RULES.ARC § Commit Discipline (gate vs fire vs release ontology + structured-gate discipline
  for off-workflow commits). Added "Incidental Commit Discipline" subsection to process-task-loop
  § Incidental Work Management (task-interlock pattern extension). Applied admonition to all
  class-tagged fire sites across the 5 Phase 3 boundary workflows. ATOMIC-INBOX class-tag
  fire-site cue entry updated — option (4) adopted, options (1)/(2)/(3) superseded.

### `[x]` **Surface active commit/push interlock modes at prompt-composition decision points**

- _Outcome:_ Closed the prompt-prefix lookup gap diagnosed in 93b50a4a's incidental commit
  (defaulted to `manual` framing despite `commitInterlock: on-workflow` active). A1: session-init
  envelope's `config.value.settings` payload extended with `commit.interlock` + `push.interlock`,
  git-config-resolved from `arc.commitInterlock` / `arc.pushInterlock`; types + status handler +
  4 test files updated. A2: DEV-RULES.ARC § Implied-approval scope gained the inline
  prompt-prefix mapping (`Proceed` when `manual`; `Commit and proceed` when
  `on-task-approval` / `on-workflow`) — closes the 2-hop lookup that previously sent agents from
  the rule to `process-task-loop` § Completion protocol for the values. session-init.md Step 1
  envelope-fields table + below-table paragraph document the new keys' source + use. Both copies
  synced. Tier 2 clean: typecheck + lint + tests (1796 + e2e 56). A3 (orientation-surface for
  non-`manual` modes) deferred — decide post-A1+A2 settlement whether always-visible orientation
  noise is worth the salience. Landed b2d8162d.
